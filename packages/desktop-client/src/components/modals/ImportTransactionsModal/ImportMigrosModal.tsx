import React, { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { amountToInteger } from 'loot-core/shared/util';

import { TransactionList } from './components/TransactionList';
import { useSwissBankImport } from './hooks/useSwissBankImport';
import { type ImportTransaction } from './utils';

import { importMigrosTransactions, importPreviewTransactions } from '@desktop-client/accounts/accountsSlice';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { TableHeader } from '@desktop-client/components/table';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useDateFormat } from '@desktop-client/hooks/useDateFormat';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { reloadPayees } from '@desktop-client/payees/payeesSlice';
import { useDispatch } from '@desktop-client/redux';

type ImportSettings = {
  migros_account: string;
};

const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  migros_account: '',
};

type ImportMigrosModalProps = {
  options: {
    filename: string;
    onImported?: (didChange: boolean) => void;
  };
};

export function ImportMigrosModal({ options }: ImportMigrosModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const categories = useCategories();
  const accounts = useAccounts();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';

  const { filename, onImported } = options;

  // State
  const [loadingState, setLoadingState] = useState<null | 'parsing' | 'importing'>('parsing');
  const [error, setError] = useState<{ parsed: boolean; message: string } | null>(null);
  const [transactions, setTransactions] = useState<ImportTransaction[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<ImportTransaction[]>([]);

  // Import settings
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [importSettings, setImportSettings] = useState<ImportSettings>(DEFAULT_IMPORT_SETTINGS);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);

  // Bank saldo from CSV header
  const [bankSaldo, setBankSaldo] = useState<number | null>(null);

  // Shared Swiss bank import hook
  const {
    transactionCategories,
    onTransactionCategoryChange,
    transactionNotes,
    onTransactionNotesChange,
    fetchCategorySuggestions,
    collectPayeeMappingsToSave,
  } = useSwissBankImport();

  // Parse file on mount
  useEffect(() => {
    async function parseFile() {
      setLoadingState('parsing');

      const { errors, transactions: parsed = [], metadata } = await send(
        'transactions-parse-file',
        {
          filepath: filename,
          options: { swissBankFormat: 'migros', importNotes: true },
        },
      );

      if (errors.length > 0) {
        setError({ parsed: false, message: errors[0].message });
        setLoadingState(null);
        return;
      }

      // Verify this is actually a Migros file
      if (metadata?.bankFormat !== 'migros') {
        setError({ parsed: false, message: t('This file does not appear to be a Migros Bank export.') });
        setLoadingState(null);
        return;
      }

      // Store bank saldo if present
      if (metadata?.bankSaldo !== undefined) {
        setBankSaldo(metadata.bankSaldo);
      }

      // Load import settings
      const settings = await send('swiss-bank-get-import-settings');
      setImportSettings({
        migros_account: settings.migros_account || '',
      });

      // Find target account
      if (settings.migros_account) {
        const account = accounts.find(a => a.name === settings.migros_account && !a.closed);
        if (account) {
          setTargetAccountId(account.id);
        } else {
          setShowSettingsDialog(true);
        }
      } else {
        setShowSettingsDialog(true);
      }

      // Add transaction IDs and selection state
      let index = 0;
      const transactionsWithIds = parsed.map((trans: unknown) => {
        const t = trans as ImportTransaction;
        t.trx_id = String(index++);
        t.selected = true;
        return t;
      });

      setParsedTransactions(transactionsWithIds);

      // Check for existing payee mapping
      const existingMapping = await send('swiss-bank-get-payee-mapping', {});
      const mappingIsEmpty = !existingMapping || Object.keys(existingMapping).length === 0;

      if (mappingIsEmpty && transactionsWithIds.length > 0) {
        // Offer to learn from existing transactions
        setTransactions(transactionsWithIds);
        setLoadingState(null);

        dispatch(pushModal({
          modal: {
            name: 'learn-categories',
            options: {
              onLearn: () => {
                fetchCategorySuggestions(transactionsWithIds);
              },
              onSkip: () => {
                // Continue without category suggestions
              },
            },
          },
        }));
      } else if (targetAccountId || settings.migros_account) {
        // Apply category suggestions and run preview
        const account = accounts.find(a => a.name === settings.migros_account && !a.closed);
        if (account) {
          await runImportPreview(transactionsWithIds, account.id);
        } else {
          setTransactions(transactionsWithIds);
          setLoadingState(null);
        }
      } else {
        setTransactions(transactionsWithIds);
        setLoadingState(null);
      }
    }

    parseFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  // Run import preview to detect duplicates
  const runImportPreview = useCallback(async (transactionsToPreview: ImportTransaction[], accountId: string) => {
    const previewTrx = await dispatch(
      importPreviewTransactions({
        accountId,
        // @ts-expect-error - ImportTransaction extends TransactionEntity with preview fields
        transactions: transactionsToPreview.map(trans => ({
          ...trans,
          date: trans.date,
          amount: amountToInteger(trans.amount),
        })),
      }),
    ).unwrap();

    // Build map of trx_id -> preview info
    const matchedUpdateMap: Record<string, { transaction: unknown; existing?: unknown; ignored?: boolean; tombstone?: boolean }> = {};
    for (const trx of previewTrx) {
      if (trx.transaction && typeof trx.transaction === 'object') {
        const txn = trx.transaction as { trx_id?: string };
        if (txn.trx_id) {
          matchedUpdateMap[txn.trx_id] = trx;
        }
      }
    }

    // Update transactions with duplicate info
    const transactionPreview = transactionsToPreview.map(trans => {
      const matchInfo = matchedUpdateMap[trans.trx_id];
      if (matchInfo) {
        return {
          ...trans,
          existing: !!matchInfo.existing,
          ignored: matchInfo.ignored || false,
          selected: !matchInfo.ignored,
          tombstone: matchInfo.tombstone || false,
        };
      }
      return trans;
    });

    // Sort: new transactions first
    transactionPreview.sort((a, b) => {
      const aIsExisting = a.ignored || a.existing;
      const bIsExisting = b.ignored || b.existing;
      if (aIsExisting && !bIsExisting) return 1;
      if (!aIsExisting && bIsExisting) return -1;
      return 0;
    });

    setTransactions(transactionPreview);
    await fetchCategorySuggestions(transactionPreview);
    setLoadingState(null);
  }, [dispatch, fetchCategorySuggestions]);

  // Toggle transaction selection
  function onCheckTransaction(trxId: string) {
    setTransactions(prev =>
      prev.map(trans => {
        if (trans.trx_id === trxId) {
          if (trans.existing && trans.selected && !trans.selected_merge) {
            return { ...trans, selected_merge: true };
          } else if (trans.existing && trans.selected_merge) {
            return { ...trans, selected: false, selected_merge: false };
          } else {
            return { ...trans, selected: !trans.selected };
          }
        }
        return trans;
      })
    );
  }

  // Import transactions
  async function onImport(close: () => void) {
    if (!targetAccountId) {
      setError({
        parsed: true,
        message: t('Please select a target account first.'),
      });
      return;
    }

    setLoadingState('importing');

    // Build final transactions
    const finalTransactions = [];

    for (const trans of transactions) {
      if (trans.isMatchedTransaction || !trans.selected) {
        continue;
      }

      // Apply user-selected category
      let category_id: string | null = null;
      const catInfo = transactionCategories.get(trans.trx_id);
      if (catInfo?.selectedCategory) {
        const [groupName, catName] = catInfo.selectedCategory.split(':');
        if (groupName && catName) {
          const group = categories.grouped.find(g => g.name === groupName);
          if (group) {
            const cat = group.categories?.find(c => c.name === catName);
            if (cat) {
              category_id = cat.id;
            }
          }
        }
      }

      // Get edited notes
      const editedNotes = transactionNotes.get(trans.trx_id);
      const finalNotes = editedNotes !== undefined ? editedNotes : trans.notes;

      const {
        inflow: _inflow,
        outflow: _outflow,
        inOut: _inOut,
        existing: _existing,
        ignored: _ignored,
        selected: _selected,
        selected_merge: _selected_merge,
        trx_id: _trx_id,
        ...finalTransaction
      } = trans;

      if (trans.ignored && trans.selected) {
        (finalTransaction as { forceAddTransaction?: boolean }).forceAddTransaction = true;
      }

      finalTransactions.push({
        ...finalTransaction,
        date: trans.date,
        amount: amountToInteger(trans.amount),
        cleared: true,
        notes: finalNotes,
        category: category_id,
      });
    }

    // Collect payee mappings BEFORE closing
    const payeeMappingsToSave = collectPayeeMappingsToSave();

    // Close modal BEFORE async operations (so summary modal becomes topmost)
    close();

    // Import using Migros handler
    const didChange = await dispatch(
      importMigrosTransactions({
        transactions: finalTransactions,
      }),
    ).unwrap();

    if (didChange) {
      await dispatch(reloadPayees());
    }

    // Save payee mappings
    if (payeeMappingsToSave.length > 0) {
      await send('swiss-bank-add-payee-mappings', { newMappings: payeeMappingsToSave });
    }

    if (onImported) {
      onImported(didChange);
    }
  }

  // Save settings
  async function onSaveSettings() {
    await send('swiss-bank-save-import-settings', { settings: importSettings });

    // Update target account
    const account = accounts.find(a => a.name === importSettings.migros_account && !a.closed);
    if (account) {
      setTargetAccountId(account.id);
      setShowSettingsDialog(false);

      // Run preview with transactions
      if (parsedTransactions.length > 0) {
        await runImportPreview(parsedTransactions, account.id);
      }
    }
  }

  // Build table headers
  const headers: ComponentProps<typeof TableHeader>['headers'] = [
    { name: t('Date'), width: 90 },
    { name: t('Payee'), width: 250 },
    { name: t('Notes'), width: 250 },
    { name: t('Category'), width: 200 },
    { name: t('Status'), width: 80 },
    { name: t('Amount'), width: 90 },
  ];

  return (
    <Modal name="import-migros" containerProps={{ style: { width: 900 } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={t('Import Migros Bank Transactions')}
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <View style={{ padding: 15 }}>
            {loadingState === 'parsing' && (
              <View style={{ textAlign: 'center', padding: 20 }}>
                <Text><Trans>Parsing file...</Trans></Text>
              </View>
            )}

            {/* Bank Saldo Info */}
            {bankSaldo !== null && (
              <View style={{ marginBottom: 10, padding: 10, backgroundColor: theme.tableRowBackgroundHover, borderRadius: 4 }}>
                <Text style={{ fontSize: '0.9em' }}>
                  <Trans>Bank balance from CSV: CHF {(bankSaldo / 100).toFixed(2)}</Trans>
                </Text>
              </View>
            )}

            {loadingState !== 'parsing' && transactions.length > 0 && (
              <TransactionList
                transactions={transactions}
                showParsed={false}
                showStatus={true}
                showCurrency={false}
                isSwissBankImport={true}
                parseDateFormat={null}
                dateFormat={dateFormat}
                fieldMappings={null}
                splitMode={false}
                inOutMode={false}
                outValue=""
                flipAmount={false}
                multiplierAmount=""
                categories={categories.list}
                categoryGroups={categories.grouped}
                reconcile={true}
                onCheckTransaction={onCheckTransaction}
                transactionCategories={transactionCategories}
                onTransactionCategoryChange={onTransactionCategoryChange}
                transactionNotes={transactionNotes}
                onTransactionNotesChange={onTransactionNotesChange}
                headers={headers}
              />
            )}

            {error && (
              <View style={{ color: theme.errorText, textAlign: 'center', marginTop: 10 }}>
                <Text><strong>Error:</strong> {error.message}</Text>
              </View>
            )}

            {/* Settings Dialog */}
            {showSettingsDialog && (
              <View
                style={{
                  marginTop: 10,
                  padding: 15,
                  backgroundColor: theme.tableRowBackgroundHover,
                  borderRadius: 4,
                  border: '1px solid ' + theme.tableBorder,
                }}
              >
                <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>
                  <Trans>Configure Migros Import Settings</Trans>
                </Text>
                <Text style={{ marginBottom: 15, color: theme.pageTextSubdued }}>
                  <Trans>Select the account where Migros transactions should be imported.</Trans>
                </Text>

                <View style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 150 }}><Trans>Migros Account:</Trans></Text>
                    <Select
                      value={importSettings.migros_account}
                      onChange={(e: string) => setImportSettings({ ...importSettings, migros_account: e })}
                      options={[
                        ['', t('Select an account...')] as [string, string],
                        ...accounts.filter(a => !a.closed).map(a => [a.name, a.name] as [string, string]),
                      ]}
                      style={{ flex: 1 }}
                    />
                  </label>
                </View>

                <View style={{ marginTop: 15 }}>
                  <Button
                    variant="primary"
                    isDisabled={!importSettings.migros_account}
                    onPress={onSaveSettings}
                  >
                    <Trans>Save Settings</Trans>
                  </Button>
                </View>
              </View>
            )}

            {/* Import Button */}
            {!showSettingsDialog && loadingState !== 'parsing' && (
              <View style={{ marginTop: 15, display: 'flex', justifyContent: 'flex-end' }}>
                <ButtonWithLoading
                  variant="primary"
                  isLoading={loadingState === 'importing'}
                  isDisabled={!targetAccountId}
                  onPress={() => onImport(close)}
                >
                  <Trans>Import Transactions</Trans>
                </ButtonWithLoading>
              </View>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
