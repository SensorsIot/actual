import React, { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { amountToInteger } from 'loot-core/shared/util';

import { TransactionList } from './components/TransactionList';
import { useSwissBankImport } from './hooks/useSwissBankImport';
import { type ImportTransaction } from './utils';

import { importPreviewTransactions, importRevolutTransactions } from '@desktop-client/accounts/accountsSlice';
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
  revolut_bank_account: string;
  cash_account: string;
  revolut_differenz_category: string;
};

const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  revolut_bank_account: '',
  cash_account: '',
  revolut_differenz_category: '',
};

type ImportRevolutModalProps = {
  options: {
    filename: string;
    onImported?: (didChange: boolean) => void;
  };
};

export function ImportRevolutModal({ options }: ImportRevolutModalProps) {
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

  // Balance correction
  const [currentRevolutTotal, setCurrentRevolutTotal] = useState<string>('');
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);
  const [selectedDifferenzCategory, setSelectedDifferenzCategory] = useState<string>('');
  const [pendingBalanceCorrection, setPendingBalanceCorrection] = useState<{
    difference: number;
    expectedBalance: number;
    accountBalance: number;
  } | null>(null);

  // Shared Swiss bank import hook
  const {
    transactionCategories,
    onTransactionCategoryChange,
    transactionNotes,
    onTransactionNotesChange,
    fetchCategorySuggestions,
    savePayeeMappings,
  } = useSwissBankImport();

  // Parse file on mount
  useEffect(() => {
    async function parseFile() {
      setLoadingState('parsing');

      const { errors, transactions: parsed = [], metadata } = await send(
        'transactions-parse-file',
        {
          filepath: filename,
          options: { swissBankFormat: 'revolut' },
        },
      );

      if (errors.length > 0) {
        setError({ parsed: false, message: errors[0].message });
        setLoadingState(null);
        return;
      }

      // Verify this is actually a Revolut file
      if (metadata?.bankFormat !== 'revolut') {
        setError({ parsed: false, message: t('This file does not appear to be a Revolut export.') });
        setLoadingState(null);
        return;
      }

      // Load import settings
      const settings = await send('swiss-bank-get-import-settings');
      setImportSettings({
        revolut_bank_account: settings.revolut_bank_account || '',
        cash_account: settings.cash_account || '',
        revolut_differenz_category: settings.revolut_differenz_category || '',
      });
      if (settings.revolut_differenz_category) {
        setSelectedDifferenzCategory(settings.revolut_differenz_category);
      }

      // Show settings if not configured
      if (!settings.revolut_bank_account) {
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
      } else {
        // Apply category suggestions and run preview
        await runImportPreview(transactionsWithIds);
      }
    }

    parseFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  // Run import preview to detect duplicates
  const runImportPreview = useCallback(async (transactionsToPreview: ImportTransaction[]) => {
    // Group transactions by currency
    const byCurrency = new Map<string, ImportTransaction[]>();
    for (const trans of transactionsToPreview) {
      const currency = (trans as { currency?: string }).currency || 'CHF';
      if (!byCurrency.has(currency)) {
        byCurrency.set(currency, []);
      }
      byCurrency.get(currency)!.push(trans);
    }

    // For each currency, find the account and check for duplicates
    const matchedUpdateMap: Record<string, { transaction: unknown; existing?: unknown; ignored?: boolean; tombstone?: boolean }> = {};

    for (const [currency, currencyTransactions] of byCurrency) {
      const accountName = `Revolut ${currency.toUpperCase()}`;
      const currencyAccount = accounts.find(a => a.name === accountName && !a.closed);

      if (currencyAccount) {
        const previewTrx = await dispatch(
          importPreviewTransactions({
            accountId: currencyAccount.id,
            // @ts-expect-error - ImportTransaction extends TransactionEntity with preview fields
            transactions: currencyTransactions.map(trans => ({
              ...trans,
              date: trans.date,
              amount: amountToInteger(trans.amount),
            })),
          }),
        ).unwrap();

        // Merge into map
        for (const trx of previewTrx) {
          if (trx.transaction && typeof trx.transaction === 'object') {
            const txn = trx.transaction as { trx_id?: string };
            if (txn.trx_id) {
              matchedUpdateMap[txn.trx_id] = trx;
            }
          }
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
  }, [accounts, dispatch, fetchCategorySuggestions]);

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
    console.log('[Revolut Import] onImport started');

    // Validate: Require balance total
    if (!currentRevolutTotal.trim()) {
      console.log('[Revolut Import] No balance total entered');
      setError({
        parsed: true,
        message: t('Please enter the "Current Revolut Total (CHF)" before importing.'),
      });
      return;
    }

    setLoadingState('importing');
    console.log('[Revolut Import] Building final transactions...');

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

    console.log(`[Revolut Import] Importing ${finalTransactions.length} transactions...`);

    // Import using Revolut handler
    try {
      const didChange = await dispatch(
        importRevolutTransactions({
          transactions: finalTransactions,
        }),
      ).unwrap();
      console.log(`[Revolut Import] Import complete, didChange=${didChange}`);

      if (didChange) {
        console.log('[Revolut Import] Reloading payees...');
        await dispatch(reloadPayees());
      }

      // Save payee mappings
      console.log('[Revolut Import] Saving payee mappings...');
      await savePayeeMappings();

      // Balance correction
      console.log('[Revolut Import] Starting balance check...');
      if (currentRevolutTotal) {
        const cleanedTotal = currentRevolutTotal.replace(/'/g, '').replace(',', '.');
        const totalCHF = parseFloat(cleanedTotal);
        console.log(`[Revolut Import] Parsed total: ${totalCHF} CHF`);

        if (!isNaN(totalCHF)) {
          const totalCents = Math.round(totalCHF * 100);
          console.log(`[Revolut Import] Calling revolut-balance-check with ${totalCents} cents...`);

          const balanceResult = await send('revolut-balance-check', {
            expectedTotalCHF: totalCents,
          });
          console.log('[Revolut Import] Balance check result:', balanceResult);

          if (balanceResult.difference !== 0 && !balanceResult.correctionBooked) {
            console.log('[Revolut Import] Showing category prompt for balance correction');
            // Need to ask user for category
            setPendingBalanceCorrection({
              difference: balanceResult.difference,
              expectedBalance: totalCents,
              accountBalance: balanceResult.accountBalance,
            });
            setShowCategoryPrompt(true);
            setLoadingState(null);
            return;
          }
        }
      }

      console.log('[Revolut Import] Closing modal...');
      setLoadingState(null);
      close();
      if (onImported) {
        onImported(didChange);
      }
      console.log('[Revolut Import] Done!');
    } catch (err) {
      console.error('[Revolut Import] Error:', err);
      setError({
        parsed: true,
        message: err instanceof Error ? err.message : 'Import failed',
      });
      setLoadingState(null);
    }
  }

  // Handle balance correction category selection
  async function onBookBalanceCorrection(close: () => void) {
    if (!selectedDifferenzCategory || !pendingBalanceCorrection) {
      return;
    }

    // Save the category to settings
    const newSettings = { ...importSettings, revolut_differenz_category: selectedDifferenzCategory };
    await send('swiss-bank-save-import-settings', { settings: newSettings });
    setImportSettings(newSettings);

    // Book the correction
    await send('revolut-balance-check', {
      expectedTotalCHF: pendingBalanceCorrection.expectedBalance,
    });

    setShowCategoryPrompt(false);
    close();
    if (onImported) {
      onImported(true);
    }
  }

  // Save settings
  async function onSaveSettings() {
    await send('swiss-bank-save-import-settings', { settings: importSettings });
    setShowSettingsDialog(false);

    // Re-run preview with transactions
    if (parsedTransactions.length > 0) {
      await runImportPreview(parsedTransactions);
    }
  }

  // Build table headers
  const headers: ComponentProps<typeof TableHeader>['headers'] = [
    { name: t('Date'), width: 90 },
    { name: t('Payee'), width: 250 },
    { name: t('Curr'), width: 60 },
    { name: t('Notes'), width: 250 },
    { name: t('Category'), width: 200 },
    { name: t('Status'), width: 80 },
    { name: t('Amount'), width: 90 },
  ];

  return (
    <Modal name="import-revolut" containerProps={{ style: { width: 1000 } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={t('Import Revolut Transactions')}
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <View style={{ padding: 15 }}>
            {loadingState === 'parsing' && (
              <View style={{ textAlign: 'center', padding: 20 }}>
                <Text><Trans>Parsing file...</Trans></Text>
              </View>
            )}

            {loadingState !== 'parsing' && transactions.length > 0 && (
              <TransactionList
                transactions={transactions}
                showParsed={false}
                showStatus={true}
                showCurrency={true}
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
                  <Trans>Configure Revolut Import Settings</Trans>
                </Text>
                <Text style={{ marginBottom: 15, color: theme.pageTextSubdued }}>
                  <Trans>Select the accounts for Revolut transfers (bank account for top-ups/withdrawals, cash account for ATM).</Trans>
                </Text>

                <View style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 150 }}><Trans>Topup Bank Account:</Trans></Text>
                    <Select
                      value={importSettings.revolut_bank_account}
                      onChange={(e: string) => setImportSettings({ ...importSettings, revolut_bank_account: e })}
                      options={[
                        ['', t('Select an account...')] as [string, string],
                        ...accounts.filter(a => !a.closed).map(a => [a.name, a.name] as [string, string]),
                      ]}
                      style={{ flex: 1 }}
                    />
                  </label>
                </View>

                <View style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 150 }}><Trans>Cash Account:</Trans></Text>
                    <Select
                      value={importSettings.cash_account}
                      onChange={(e: string) => setImportSettings({ ...importSettings, cash_account: e })}
                      options={[
                        ['', t('Select an account...')] as [string, string],
                        ...accounts.filter(a => !a.closed).map(a => [a.name, a.name] as [string, string]),
                      ]}
                      style={{ flex: 1 }}
                    />
                  </label>
                </View>

                <View style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 150 }}><Trans>Differenz Category:</Trans></Text>
                    <Select
                      value={importSettings.revolut_differenz_category}
                      onChange={(e: string) => setImportSettings({ ...importSettings, revolut_differenz_category: e })}
                      options={[
                        ['', t('Select a category...')] as [string, string],
                        ...categories.grouped
                          .flatMap(group =>
                            (group.categories || []).map(cat => {
                              const fullName = `${group.name}:${cat.name}`;
                              return [fullName, fullName] as [string, string];
                            })
                          )
                          .sort((a, b) => a[0].localeCompare(b[0])),
                      ]}
                      style={{ flex: 1 }}
                    />
                  </label>
                </View>

                <View style={{ marginTop: 15 }}>
                  <Button variant="primary" onPress={onSaveSettings}>
                    <Trans>Save Settings</Trans>
                  </Button>
                </View>
              </View>
            )}

            {/* Balance Correction Category Prompt */}
            {showCategoryPrompt && pendingBalanceCorrection && (
              <View
                style={{
                  marginTop: 10,
                  padding: 15,
                  backgroundColor: theme.tableRowBackgroundHover,
                  borderRadius: 4,
                  border: '1px solid ' + theme.warningBorder,
                }}
              >
                <Text style={{ fontWeight: 'bold', marginBottom: 10, color: theme.warningText }}>
                  <Trans>Balance Correction Required</Trans>
                </Text>
                <Text style={{ marginBottom: 15 }}>
                  <Trans>
                    The calculated Revolut balance differs from the entered total.
                    Please select a category for the balance correction transaction.
                  </Trans>
                </Text>
                <View style={{ marginBottom: 10, padding: 10, backgroundColor: theme.tableBackground, borderRadius: 4 }}>
                  <Text style={{ fontSize: '0.9em' }}>
                    <Trans>
                      Difference: CHF {(pendingBalanceCorrection.difference / 100).toFixed(2)}
                    </Trans>
                  </Text>
                </View>
                <View style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 100 }}><Trans>Category:</Trans></Text>
                    <Select
                      value={selectedDifferenzCategory}
                      onChange={(e: string) => setSelectedDifferenzCategory(e)}
                      options={[
                        ['', t('Select a category...')] as [string, string],
                        ...categories.grouped
                          .flatMap(group =>
                            (group.categories || []).map(cat => {
                              const fullName = `${group.name}:${cat.name}`;
                              return [fullName, fullName] as [string, string];
                            })
                          )
                          .sort((a, b) => a[0].localeCompare(b[0])),
                      ]}
                      style={{ flex: 1 }}
                    />
                  </label>
                </View>
                <View style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                  <Button onPress={() => { setShowCategoryPrompt(false); close(); }}>
                    <Trans>Skip</Trans>
                  </Button>
                  <Button
                    variant="primary"
                    isDisabled={!selectedDifferenzCategory}
                    onPress={() => onBookBalanceCorrection(close)}
                  >
                    <Trans>Book Correction</Trans>
                  </Button>
                </View>
              </View>
            )}

            {/* Current Revolut Total Input */}
            {!showSettingsDialog && !showCategoryPrompt && (
              <View style={{ marginTop: 10, marginBottom: 10 }}>
                <SpaceBetween style={{ alignItems: 'center' }}>
                  <label
                    htmlFor="revolut-total-input"
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                      fontWeight: 500,
                    }}
                  >
                    <Trans>Current Revolut Total (CHF):</Trans>
                    <Input
                      id="revolut-total-input"
                      type="text"
                      value={currentRevolutTotal}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const value = e.target.value.replace(/[^0-9.,'-]/g, '');
                        setCurrentRevolutTotal(value);
                      }}
                      placeholder="z.B. 14'523.45"
                      style={{ width: 150 }}
                    />
                  </label>
                  <Text style={{ color: theme.pageTextSubdued, fontSize: '0.85em' }}>
                    <Trans>Enter the current total from your Revolut app to correct exchange rate differences</Trans>
                  </Text>
                </SpaceBetween>
              </View>
            )}

            {/* Import Button */}
            {!showSettingsDialog && !showCategoryPrompt && loadingState !== 'parsing' && (
              <View style={{ marginTop: 15, display: 'flex', justifyContent: 'flex-end' }}>
                <ButtonWithLoading
                  variant="primary"
                  isLoading={loadingState === 'importing'}
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
