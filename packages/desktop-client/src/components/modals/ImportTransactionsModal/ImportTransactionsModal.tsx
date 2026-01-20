// @ts-strict-ignore
import React, {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import {
  type ParseFileOptions,
  type SwissBankFormat,
} from 'loot-core/server/transactions/import/parse-file';
import { amountToInteger } from 'loot-core/shared/util';

import { DateFormatSelect } from './DateFormatSelect';
import { FieldMappings } from './FieldMappings';
import { InOutOption } from './InOutOption';
import { MultiplierOption } from './MultiplierOption';
import { Transaction } from './Transaction';
import {
  applyFieldMappings,
  dateFormats,
  isDateFormat,
  parseAmountFields,
  parseDate,
  stripCsvImportTransaction,
  type DateFormat,
  type FieldMapping,
  type ImportTransaction,
} from './utils';

import {
  importMigrosTransactions,
  importPreviewTransactions,
  importRevolutTransactions,
  importTransactions,
} from '@desktop-client/accounts/accountsSlice';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { SectionLabel } from '@desktop-client/components/forms';
import { LabeledCheckbox } from '@desktop-client/components/forms/LabeledCheckbox';
import {
  TableHeader,
  TableWithNavigator,
} from '@desktop-client/components/table';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useDateFormat } from '@desktop-client/hooks/useDateFormat';
import { useSyncedPrefs } from '@desktop-client/hooks/useSyncedPrefs';
import { reloadPayees } from '@desktop-client/payees/payeesSlice';
import { useDispatch } from '@desktop-client/redux';

type ImportSettings = {
  migros_account: string;
  revolut_bank_account: string;
  cash_account: string;
  revolut_differenz_category: string;
};

const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  migros_account: '',
  revolut_bank_account: '',
  cash_account: '',
  revolut_differenz_category: '',
};

// Transaction category selection for Swiss bank imports
// Maps transaction ID -> selected category
type TransactionCategoryMap = Map<string, {
  selectedCategory: string | null;
  proposedCategory: string | null;
  hasMatch: boolean;
  payee: string;
  isExpense: boolean;
}>;

function getFileType(filepath: string): string {
  const m = filepath.match(/\.([^.]*)$/);
  if (!m) return 'ofx';
  const rawType = m[1].toLowerCase();
  if (rawType === 'tsv') return 'csv';
  return rawType;
}

function getInitialDateFormat(transactions, mappings) {
  if (transactions.length === 0 || mappings.date == null) {
    return 'yyyy mm dd';
  }

  const transaction = transactions[0];
  const date = transaction[mappings.date];

  const found =
    date == null
      ? null
      : dateFormats.find(f => parseDate(date, f.format) != null);
  return found ? found.format : 'mm dd yyyy';
}

function getInitialMappings(transactions) {
  if (transactions.length === 0) {
    return {};
  }

  const transaction = stripCsvImportTransaction(transactions[0]);
  const fields = Object.entries(transaction);

  function key(entry) {
    return entry ? entry[0] : null;
  }

  const dateField = key(
    fields.find(([name]) => name.toLowerCase().includes('date')) ||
      fields.find(([, value]) => String(value)?.match(/^\d+[-/]\d+[-/]\d+$/)),
  );

  const amountField = key(
    fields.find(([name]) => name.toLowerCase().includes('amount')) ||
      fields.find(([, value]) => String(value)?.match(/^-?[.,\d]+$/)),
  );

  const categoryField = key(
    fields.find(([name]) => name.toLowerCase().includes('category')),
  );

  const payeeField = key(
    fields.find(([name]) => name.toLowerCase().includes('payee')) ||
      fields.find(
        ([name]) =>
          name !== dateField && name !== amountField && name !== categoryField,
      ),
  );

  const notesField = key(
    fields.find(([name]) => name.toLowerCase().includes('notes')) ||
      fields.find(
        ([name]) =>
          name !== dateField &&
          name !== amountField &&
          name !== categoryField &&
          name !== payeeField,
      ),
  );

  const inOutField = key(
    fields.find(
      ([name]) =>
        name !== dateField &&
        name !== amountField &&
        name !== payeeField &&
        name !== notesField,
    ),
  );

  return {
    date: dateField,
    amount: amountField,
    payee: payeeField,
    notes: notesField,
    inOut: inOutField,
    category: categoryField,
  };
}

function parseCategoryFields(trans, categories) {
  let match = null;
  categories.forEach(category => {
    if (category.id === trans.category) {
      return null;
    }
    if (category.name === trans.category) {
      match = category.id;
    }
  });
  return match;
}

export function ImportTransactionsModal({
  filename: originalFileName,
  accountId,
  onImported,
}) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || ('MM/dd/yyyy' as const);
  const [prefs, savePrefs] = useSyncedPrefs();
  const dispatch = useDispatch();
  const categories = useCategories();
  const accounts = useAccounts();

  const [multiplierAmount, setMultiplierAmount] = useState('');
  const [loadingState, setLoadingState] = useState<
    null | 'parsing' | 'importing'
  >('parsing');
  const [error, setError] = useState<{
    parsed: boolean;
    message: string;
  } | null>(null);
  const [filename, setFilename] = useState(originalFileName);
  const [transactions, setTransactions] = useState<ImportTransaction[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<
    ImportTransaction[]
  >([]);
  const [filetype, setFileType] = useState('unknown');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [flipAmount, setFlipAmount] = useState(false);
  const [multiplierEnabled, setMultiplierEnabled] = useState(false);
  const [reconcile, setReconcile] = useState(true);
  const [importNotes, setImportNotes] = useState(true);
  // Track if this is a Revolut multi-currency import
  const [isRevolutImport, setIsRevolutImport] = useState(false);
  // Track if this is a Migros import
  const [isMigrosImport, setIsMigrosImport] = useState(false);
  // Track if this is a Swiss bank import (Migros or Revolut) - hide CSV options
  const [isSwissBankImport, setIsSwissBankImport] = useState(false);
  // Import settings for Swiss bank imports
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [importSettings, setImportSettings] = useState<ImportSettings>(DEFAULT_IMPORT_SETTINGS);
  // Category selection for Swiss bank imports (per transaction)
  const [transactionCategories, setTransactionCategories] = useState<TransactionCategoryMap>(new Map());
  // Notes editing for Swiss bank imports (per transaction)
  const [transactionNotes, setTransactionNotes] = useState<Map<string, string | null>>(new Map());
  // Current Revolut total for balance correction (in CHF, as string for input)
  const [currentRevolutTotal, setCurrentRevolutTotal] = useState<string>('');
  // Category prompt for Revolut balance correction
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);
  const [pendingBalanceCorrection, setPendingBalanceCorrection] = useState<{
    difference: number;
    expectedBalance: number;
    accountBalance: number;
  } | null>(null);
  const [selectedDifferenzCategory, setSelectedDifferenzCategory] = useState<string>('');

  // This cannot be set after parsing the file, because changing it
  // requires re-parsing the file. This is different from the other
  // options which are simple post-processing. That means if you
  // parsed different files without closing the modal, it wouldn't
  // re-read this.
  const [delimiter, setDelimiter] = useState(
    prefs[`csv-delimiter-${accountId}`] ||
      (filename.endsWith('.tsv') ? '\t' : ','),
  );
  const [skipStartLines, setSkipStartLines] = useState(
    parseInt(prefs[`csv-skip-start-lines-${accountId}`], 10) || 0,
  );
  const [skipEndLines, setSkipEndLines] = useState(
    parseInt(prefs[`csv-skip-end-lines-${accountId}`], 10) || 0,
  );
  const [inOutMode, setInOutMode] = useState(
    String(prefs[`csv-in-out-mode-${accountId}`]) === 'true',
  );
  const [outValue, setOutValue] = useState(
    prefs[`csv-out-value-${accountId}`] ?? '',
  );
  const [hasHeaderRow, setHasHeaderRow] = useState(
    String(prefs[`csv-has-header-${accountId}`]) !== 'false',
  );
  const [fallbackMissingPayeeToMemo, setFallbackMissingPayeeToMemo] = useState(
    String(prefs[`ofx-fallback-missing-payee-${accountId}`]) !== 'false',
  );

  const [parseDateFormat, setParseDateFormat] = useState<DateFormat | null>(
    null,
  );

  const [clearOnImport, setClearOnImport] = useState(true);

  const getImportPreview = useCallback(
    async (
      transactions: ImportTransaction[],
      filetype: string,
      flipAmount: boolean,
      fieldMappings: FieldMapping | null,
      splitMode: boolean,
      parseDateFormat: DateFormat,
      inOutMode: boolean,
      outValue: string,
      multiplierAmount: string,
    ) => {
      const previewTransactions = [];
      const inOutModeEnabled = isOfxFile(filetype) ? false : inOutMode;
      const getTransDate: (trans: ImportTransaction) => string | null =
        isOfxFile(filetype)
          ? trans => trans.date ?? null
          : trans => parseDate(trans.date, parseDateFormat);

      // Note that the sort will behave unpredictably if any date fails to parse.
      transactions.sort((a, b) => {
        const aDate = getTransDate(a);
        const bDate = getTransDate(b);

        return aDate < bDate ? 1 : aDate === bDate ? 0 : -1;
      });

      for (let trans of transactions) {
        if (trans.isMatchedTransaction) {
          // skip transactions that are matched transaction (existing transaction added to show update changes)
          continue;
        }

        trans = fieldMappings
          ? applyFieldMappings(trans, fieldMappings)
          : trans;

        const date = getTransDate(trans);
        if (date == null) {
          console.log(
            `Unable to parse date ${
              trans.date || '(empty)'
            } with given date format`,
          );
          break;
        }
        if (trans.payee_name == null || typeof trans.payee_name !== 'string') {
          console.log(`Unable·to·parse·payee·${trans.payee_name || '(empty)'}`);
          break;
        }

        const { amount } = parseAmountFields(
          trans,
          splitMode,
          inOutModeEnabled,
          outValue,
          flipAmount,
          multiplierAmount,
        );
        if (amount == null) {
          console.log(`Transaction on ${trans.date} has no amount`);
          break;
        }

        const category_id = parseCategoryFields(trans, categories.list);
        if (category_id != null) {
          trans.category = category_id;
        }

        const {
          inflow: _inflow,
          outflow: _outflow,
          inOut: _inOut,
          existing: _existing,
          ignored: _ignored,
          selected: _selected,
          selected_merge: _selected_merge,
          tombstone: _tombstone,
          ...finalTransaction
        } = trans;
        previewTransactions.push({
          ...finalTransaction,
          date,
          amount: amountToInteger(amount),
          cleared: clearOnImport,
        });
      }

      // Retreive the transactions that would be updated (along with the existing trx)
      const previewTrx = await dispatch(
        importPreviewTransactions({
          accountId,
          transactions: previewTransactions,
        }),
      ).unwrap();
      const matchedUpdateMap = previewTrx.reduce((map, entry) => {
        // @ts-expect-error - entry.transaction might not have trx_id property
        map[entry.transaction.trx_id] = entry;
        return map;
      }, {});

      return transactions
        .filter(trans => !trans.isMatchedTransaction)
        .reduce((previous, current_trx) => {
          let next = previous;
          const entry = matchedUpdateMap[current_trx.trx_id];
          const existing_trx = entry?.existing;

          // if the transaction is matched with an existing one for update
          current_trx.existing = !!existing_trx;
          // if the transaction is an update that will be ignored
          // (reconciled transactions or no change detected)
          current_trx.ignored = entry?.ignored || false;

          current_trx.tombstone = entry?.tombstone || false;

          current_trx.selected = !current_trx.ignored;
          current_trx.selected_merge = current_trx.existing;

          next = next.concat({ ...current_trx });

          if (existing_trx) {
            // add the updated existing transaction in the list, with the
            // isMatchedTransaction flag to identify it in display and not send it again
            existing_trx.isMatchedTransaction = true;
            existing_trx.category = categories.list.find(
              cat => cat.id === existing_trx.category,
            )?.name;
            // add parent transaction attribute to mimic behaviour
            existing_trx.trx_id = current_trx.trx_id;
            existing_trx.existing = current_trx.existing;
            existing_trx.selected = current_trx.selected;
            existing_trx.selected_merge = current_trx.selected_merge;

            next = next.concat({ ...existing_trx });
          }

          return next;
        }, []);
    },
    [accountId, categories.list, clearOnImport, dispatch],
  );

  const parse = useCallback(
    async (filename: string, options: ParseFileOptions) => {
      setLoadingState('parsing');

      const filetype = getFileType(filename);
      setFilename(filename);
      setFileType(filetype);

      const { errors, transactions: parsedTransactions = [], metadata } = await send(
        'transactions-parse-file',
        {
          filepath: filename,
          options,
        },
      );

      // Detect Swiss bank format (Migros or Revolut) from metadata
      const swissBankFormat = metadata?.bankFormat;
      setIsSwissBankImport(!!swissBankFormat);
      setIsMigrosImport(swissBankFormat === 'migros');
      setIsRevolutImport(swissBankFormat === 'revolut');

      // Fetch import settings for Swiss bank imports
      if (swissBankFormat) {
        const settings = await send('swiss-bank-get-import-settings');
        setImportSettings(settings);
        // Show settings dialog if required accounts not configured
        if (swissBankFormat === 'migros' && !settings.migros_account) {
          setShowSettingsDialog(true);
        } else if (swissBankFormat === 'revolut' && !settings.revolut_bank_account) {
          setShowSettingsDialog(true);
        }

      }

      let index = 0;
      const transactions = parsedTransactions.map(trans => {
        // Add a transient transaction id to match preview with imported transactions
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.trx_id = String(index++);
        // Select all parsed transactions before first preview run
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.selected = true;
        return trans;
      });

      // Fetch proposed categories for Swiss bank imports (after transactions have IDs)
      if (swissBankFormat && transactions.length > 0) {
        // Get unique payees with their amounts
        const payeeAmounts = new Map<string, number>();
        for (const trans of transactions) {
          // @ts-expect-error - trans has dynamic properties
          const payee = trans.payee_name || trans.imported_payee || trans.payee || '';
          // @ts-expect-error - trans has dynamic properties
          const amount = typeof trans.amount === 'number' ? trans.amount : 0;
          if (payee && !payeeAmounts.has(payee)) {
            payeeAmounts.set(payee, amount);
          }
        }

        // Call API to get proposed categories for unique payees
        const payeeInputs = Array.from(payeeAmounts.entries()).map(([payee, amount]) => ({
          payee,
          amount,
        }));
        const matchResults = await send('swiss-bank-match-payees', { payees: payeeInputs });

        // Create a map of payee -> match result for quick lookup
        const payeeMatchMap = new Map<string, {
          proposedCategory: string | null;
          hasMatch: boolean;
          isExpense: boolean;
        }>();
        for (const result of matchResults) {
          payeeMatchMap.set(result.payee, {
            proposedCategory: result.proposedCategory,
            hasMatch: result.hasMatch,
            isExpense: result.isExpense,
          });
        }

        // Create per-transaction category map
        const categoryMap: TransactionCategoryMap = new Map();
        for (const trans of transactions) {
          // @ts-expect-error - trans has dynamic properties
          const payee = trans.payee_name || trans.imported_payee || trans.payee || '';
          // @ts-expect-error - trans has dynamic properties
          const trxId = trans.trx_id;
          const match = payeeMatchMap.get(payee);

          categoryMap.set(trxId, {
            selectedCategory: match?.proposedCategory || null,
            proposedCategory: match?.proposedCategory || null,
            hasMatch: match?.hasMatch || false,
            payee,
            isExpense: match?.isExpense ?? true,
          });
        }
        setTransactionCategories(categoryMap);
      }

      setError(null);

      /// Do fine grained reporting between the old and new OFX importers.
      if (errors.length > 0) {
        setError({
          parsed: true,
          message: errors[0].message || 'Internal error',
        });
      } else {
        if (filetype === 'csv' || filetype === 'qif') {
          const flipAmount =
            String(prefs[`flip-amount-${accountId}-${filetype}`]) === 'true';
          setFlipAmount(flipAmount);
        }

        if (filetype === 'csv') {
          let mappings = prefs[`csv-mappings-${accountId}`];
          mappings = mappings
            ? JSON.parse(mappings)
            : getInitialMappings(transactions);

          // @ts-expect-error - mappings might not have outflow/inflow properties
          setFieldMappings(mappings);

          // Set initial split mode based on any saved mapping
          // @ts-expect-error - mappings might not have outflow/inflow properties
          const splitMode = !!(mappings.outflow || mappings.inflow);
          setSplitMode(splitMode);

          const parseDateFormat =
            prefs[`parse-date-${accountId}-${filetype}`] ||
            getInitialDateFormat(transactions, mappings);
          setParseDateFormat(
            isDateFormat(parseDateFormat) ? parseDateFormat : null,
          );
        } else if (filetype === 'qif') {
          const parseDateFormat =
            prefs[`parse-date-${accountId}-${filetype}`] ||
            getInitialDateFormat(transactions, { date: 'date' });
          setParseDateFormat(
            isDateFormat(parseDateFormat) ? parseDateFormat : null,
          );
        } else {
          setFieldMappings(null);
          setParseDateFormat(null);
        }

        setParsedTransactions(transactions as ImportTransaction[]);
      }

      setLoadingState(null);
    },
    // We use some state variables from the component, but do not want to re-parse when they change
    [accountId, prefs],
  );

  function onMultiplierChange(e) {
    const amt = e;
    if (!amt || amt.match(/^\d{1,}(\.\d{0,4})?$/)) {
      setMultiplierAmount(amt);
    }
  }

  useEffect(() => {
    const fileType = getFileType(originalFileName);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      hasHeaderRow,
      skipStartLines,
      skipEndLines,
      fallbackMissingPayeeToMemo,
      importNotes,
    });

    parse(originalFileName, parseOptions);
  }, [
    originalFileName,
    delimiter,
    hasHeaderRow,
    skipStartLines,
    skipEndLines,
    fallbackMissingPayeeToMemo,
    importNotes,
    parse,
  ]);

  function onSplitMode() {
    if (fieldMappings == null) {
      return;
    }

    const isSplit = !splitMode;
    setSplitMode(isSplit);

    // Run auto-detection on the fields to try to detect the fields
    // automatically
    const mappings = getInitialMappings(transactions);

    const newFieldMappings = isSplit
      ? {
          amount: null,
          outflow: mappings.amount,
          inflow: null,
        }
      : {
          amount: mappings.amount,
          outflow: null,
          inflow: null,
        };
    setFieldMappings({ ...fieldMappings, ...newFieldMappings });
  }

  async function onNewFile() {
    const res = await window.Actual.openFileDialog({
      filters: [
        {
          name: 'CSV Files',
          extensions: ['csv', 'tsv'],
        },
      ],
    });

    const fileType = getFileType(res[0]);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      hasHeaderRow,
      skipStartLines,
      skipEndLines,
      fallbackMissingPayeeToMemo,
      importNotes,
    });

    parse(res[0], parseOptions);
  }

  function onUpdateFields(field, name) {
    const newFieldMappings = {
      ...fieldMappings,
      [field]: name === '' ? null : name,
    };
    setFieldMappings(newFieldMappings);
  }

  function onCheckTransaction(trx_id: string) {
    const newTransactions = transactions.map(trans => {
      if (trans.trx_id === trx_id) {
        if (trans.existing) {
          // 3-states management for transactions with existing (merged transactions)
          // flow of states:
          // (selected true && selected_merge true)
          //   => (selected true && selected_merge false)
          //     => (selected false)
          //       => back to (selected true && selected_merge true)
          if (!trans.selected) {
            return {
              ...trans,
              selected: true,
              selected_merge: true,
            };
          } else if (trans.selected_merge) {
            return {
              ...trans,
              selected: true,
              selected_merge: false,
            };
          } else {
            return {
              ...trans,
              selected: false,
              selected_merge: false,
            };
          }
        } else {
          return {
            ...trans,
            selected: !trans.selected,
          };
        }
      }
      return trans;
    });

    setTransactions(newTransactions);
  }

  // Handle category change for Swiss bank imports
  function onTransactionCategoryChange(transactionId: string, category: string | null) {
    setTransactionCategories(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(transactionId);
      if (existing) {
        newMap.set(transactionId, { ...existing, selectedCategory: category });
      }
      return newMap;
    });
  }

  // Handle notes change for Swiss bank imports
  function onTransactionNotesChange(transactionId: string, notes: string | null) {
    setTransactionNotes(prev => {
      const newMap = new Map(prev);
      newMap.set(transactionId, notes);
      return newMap;
    });
  }

  async function onImport(close) {
    setLoadingState('importing');

    const finalTransactions = [];
    let errorMessage;

    for (let trans of transactions) {
      if (
        trans.isMatchedTransaction ||
        (reconcile && !trans.selected && !trans.ignored)
      ) {
        // skip transactions that are
        // - matched transaction (existing transaction added to show update changes)
        // - unselected transactions that are not ignored by the reconcilation algorithm (only when reconcilation is enabled)
        continue;
      }

      trans = fieldMappings ? applyFieldMappings(trans, fieldMappings) : trans;

      const date =
        isOfxFile(filetype) || isCamtFile(filetype)
          ? trans.date
          : parseDate(trans.date, parseDateFormat);
      if (date == null) {
        errorMessage = t(
          'Unable to parse date {{date}} with given date format',
          { date: trans.date || t('(empty)') },
        );
        break;
      }

      const { amount } = parseAmountFields(
        trans,
        splitMode,
        isOfxFile(filetype) ? false : inOutMode,
        outValue,
        flipAmount,
        multiplierAmount,
      );
      if (amount == null) {
        errorMessage = t('Transaction on {{date}} has no amount', {
          date: trans.date,
        });
        break;
      }

      let category_id = parseCategoryFields(trans, categories.list);

      // For Swiss bank imports, apply user-selected category from inline dropdown
      if (isSwissBankImport && transactionCategories.size > 0) {
        const catInfo = transactionCategories.get(trans.trx_id);
        if (catInfo?.selectedCategory) {
          // Parse "Group:Category" and find the category ID
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
      }

      trans.category = category_id;

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

      if (
        reconcile &&
        ((trans.ignored && trans.selected) ||
          (trans.existing && trans.selected && !trans.selected_merge))
      ) {
        // in reconcile mode, force transaction add for
        // - ignored transactions (aleardy existing) that are checked
        // - transactions with existing (merged transactions) that are not selected_merge
        finalTransaction.forceAddTransaction = true;
      }

      finalTransactions.push({
        ...finalTransaction,
        date,
        amount: amountToInteger(amount),
        cleared: clearOnImport,
        notes: importNotes ? finalTransaction.notes : null,
      });
    }

    if (errorMessage) {
      setLoadingState(null);
      setError({ parsed: false, message: errorMessage });
      return;
    }

    if (!isOfxFile(filetype) && !isCamtFile(filetype)) {
      const key = `parse-date-${accountId}-${filetype}`;
      savePrefs({ [key]: parseDateFormat });
    }

    if (isOfxFile(filetype)) {
      savePrefs({
        [`ofx-fallback-missing-payee-${accountId}`]: String(
          fallbackMissingPayeeToMemo,
        ),
      });
    }

    if (filetype === 'csv') {
      savePrefs({
        [`csv-mappings-${accountId}`]: JSON.stringify(fieldMappings),
      });
      savePrefs({ [`csv-delimiter-${accountId}`]: delimiter });
      savePrefs({ [`csv-has-header-${accountId}`]: String(hasHeaderRow) });
      savePrefs({
        [`csv-skip-start-lines-${accountId}`]: String(skipStartLines),
      });
      savePrefs({ [`csv-skip-end-lines-${accountId}`]: String(skipEndLines) });
      savePrefs({ [`csv-in-out-mode-${accountId}`]: String(inOutMode) });
      savePrefs({ [`csv-out-value-${accountId}`]: String(outValue) });
    }

    if (filetype === 'csv' || filetype === 'qif') {
      savePrefs({
        [`flip-amount-${accountId}-${filetype}`]: String(flipAmount),
        [`import-notes-${accountId}-${filetype}`]: String(importNotes),
      });
    }

    let didChange: boolean;

    if (isRevolutImport) {
      // Use Revolut multi-currency handler
      // Routes to currency-specific accounts (Revolut, Revolut EUR, etc.)
      didChange = await dispatch(
        importRevolutTransactions({
          transactions: finalTransactions,
        }),
      ).unwrap();
    } else if (isMigrosImport) {
      // Use Migros handler - routes to configured account from import_settings.json
      didChange = await dispatch(
        importMigrosTransactions({
          transactions: finalTransactions,
        }),
      ).unwrap();
    } else {
      // Use standard single-account import (for non-Swiss bank formats)
      didChange = await dispatch(
        importTransactions({
          accountId,
          transactions: finalTransactions,
          reconcile,
        }),
      ).unwrap();
    }

    if (didChange) {
      await dispatch(reloadPayees());
    }

    // Save new payee-category mappings for previously unmatched payees
    if (isSwissBankImport && transactionCategories.size > 0) {
      // Collect unique payee mappings (deduplicate by payee name)
      const payeeMappings = new Map<string, { category: string; isExpense: boolean }>();

      for (const catInfo of transactionCategories.values()) {
        // Only save if: not previously matched AND user selected a category
        if (!catInfo.hasMatch && catInfo.selectedCategory && catInfo.payee) {
          // Only add if not already in map (first occurrence wins)
          if (!payeeMappings.has(catInfo.payee)) {
            payeeMappings.set(catInfo.payee, {
              category: catInfo.selectedCategory,
              isExpense: catInfo.isExpense,
            });
          }
        }
      }

      if (payeeMappings.size > 0) {
        const newMappings = Array.from(payeeMappings.entries()).map(([payee, info]) => ({
          payee,
          category: info.category,
          isExpense: info.isExpense,
        }));
        await send('swiss-bank-add-payee-mappings', { newMappings });
      }
    }

    // Revolut balance correction
    if (isRevolutImport && currentRevolutTotal) {
      // Parse the user-entered total (handle Swiss format with apostrophes)
      const cleanedTotal = currentRevolutTotal.replace(/'/g, '').replace(',', '.');
      const totalCHF = parseFloat(cleanedTotal);

      if (!isNaN(totalCHF)) {
        const totalCents = Math.round(totalCHF * 100);
        const balanceResult = await send('revolut-balance-check', {
          expectedTotalCHF: totalCents,
        });

        if (balanceResult.difference !== 0 && !balanceResult.correctionBooked) {
          // Category not configured - need to ask user
          // Store the pending correction and show the category prompt
          setPendingBalanceCorrection({
            difference: balanceResult.difference,
            expectedBalance: balanceResult.expectedBalance,
            accountBalance: balanceResult.accountBalance,
          });
          setShowCategoryPrompt(true);
          // Don't close the modal yet - wait for user to select category
          return;
        }
      }
    }

    // Close the import modal first, then notify
    // This ensures the summary modal pushed by the import thunk stays visible
    close();
    if (onImported) {
      onImported(didChange);
    }
  }

  // Handle category selection for balance correction
  async function handleDifferenzCategoryConfirm() {
    if (!selectedDifferenzCategory || !pendingBalanceCorrection) {
      return;
    }

    // Save the category to settings
    const newSettings = { ...importSettings, revolut_differenz_category: selectedDifferenzCategory };
    await send('swiss-bank-save-import-settings', { settings: newSettings });
    setImportSettings(newSettings);

    // Now call the balance check again - it will book the correction with the new category
    const balanceResult = await send('revolut-balance-check', {
      expectedTotalCHF: pendingBalanceCorrection.expectedBalance,
    });

    // Close the prompt and modal
    setShowCategoryPrompt(false);
    setPendingBalanceCorrection(null);
    close();
    if (onImported) {
      onImported(true);
    }
  }

  const runImportPreview = useCallback(async () => {
    // always start from the original parsed transactions, not the previewed ones to ensure rules run
    const transactionPreview = await getImportPreview(
      parsedTransactions,
      filetype,
      flipAmount,
      fieldMappings,
      splitMode,
      parseDateFormat,
      inOutMode,
      outValue,
      multiplierAmount,
    );
    setTransactions(transactionPreview);
  }, [
    getImportPreview,
    parsedTransactions,
    filetype,
    flipAmount,
    fieldMappings,
    splitMode,
    parseDateFormat,
    inOutMode,
    outValue,
    multiplierAmount,
  ]);

  useEffect(() => {
    if (parsedTransactions.length === 0 || loadingState === 'parsing') {
      return;
    }

    runImportPreview();
    // intentionally exclude runImportPreview from dependencies to avoid infinite rerenders
    // oxlint-disable-next-line react/exhaustive-deps
  }, [
    filetype,
    flipAmount,
    fieldMappings,
    splitMode,
    parseDateFormat,
    inOutMode,
    outValue,
    multiplierAmount,
    loadingState,
    parsedTransactions.length,
  ]);

  const headers: ComponentProps<typeof TableHeader>['headers'] = [
    { name: t('Date'), width: 200 },
    { name: t('Payee'), width: 'flex' },
    { name: t('Notes'), width: 'flex' },
    { name: t('Category'), width: 'flex' },
  ];

  if (reconcile) {
    headers.unshift({ name: ' ', width: 31 });
  }

  // Add status column for Swiss bank imports to show duplicate indicator
  if (isSwissBankImport) {
    headers.push({ name: t('Status'), width: 80 });
  }
  if (inOutMode) {
    headers.push({
      name: t('In/Out'),
      width: 90,
      style: { textAlign: 'left' },
    });
  }
  if (splitMode) {
    headers.push({
      name: t('Outflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
    headers.push({
      name: t('Inflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
  } else {
    headers.push({
      name: t('Amount'),
      width: 90,
      style: { textAlign: 'right' },
    });
  }

  return (
    <Modal
      name="import-transactions"
      isLoading={loadingState === 'parsing'}
      containerProps={{ style: { width: 1050, maxHeight: '90vh' } }}
    >
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={
              t('Import transactions') +
              (filetype ? ` (${filetype.toUpperCase()})` : '')
            }
            rightContent={<ModalCloseButton onPress={close} />}
          />
          {error && !error.parsed && (
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ marginRight: 10, color: theme.errorText }}>
                <strong>
                  <Trans>Error:</Trans>
                </strong>{' '}
                {error.message}
              </Text>
            </View>
          )}
          {(!error || !error.parsed) && (
            <View
              style={{
                flex: 'unset',
                height: 450,
                border: '1px solid ' + theme.tableBorder,
              }}
            >
              <TableHeader headers={headers} />

              {/* @ts-expect-error - ImportTransaction is not a TableItem */}
              <TableWithNavigator<ImportTransaction>
                items={transactions.filter(
                  trans =>
                    !trans.isMatchedTransaction ||
                    (trans.isMatchedTransaction && reconcile),
                )}
                fields={['payee', 'category', 'amount']}
                style={{ backgroundColor: theme.tableHeaderBackground }}
                getItemKey={index => String(index)}
                renderEmpty={() => {
                  return (
                    <View
                      style={{
                        textAlign: 'center',
                        marginTop: 25,
                        color: theme.tableHeaderText,
                        fontStyle: 'italic',
                      }}
                    >
                      <Trans>No transactions found</Trans>
                    </View>
                  );
                }}
                renderItem={({ item }) => (
                  <View>
                    <Transaction
                      transaction={item}
                      showParsed={filetype === 'csv' || filetype === 'qif'}
                      parseDateFormat={parseDateFormat}
                      dateFormat={dateFormat}
                      fieldMappings={fieldMappings}
                      splitMode={splitMode}
                      inOutMode={inOutMode}
                      outValue={outValue}
                      flipAmount={flipAmount}
                      multiplierAmount={multiplierAmount}
                      categories={categories.list}
                      categoryGroups={categories.grouped}
                      onCheckTransaction={onCheckTransaction}
                      reconcile={reconcile}
                      showStatus={isSwissBankImport}
                      isSwissBankImport={isSwissBankImport}
                      selectedCategory={transactionCategories.get(item.trx_id)?.selectedCategory}
                      onCategoryChange={onTransactionCategoryChange}
                      editedNotes={transactionNotes.get(item.trx_id)}
                      onNotesChange={onTransactionNotesChange}
                    />
                  </View>
                )}
              />
            </View>
          )}
          {error && error.parsed && (
            <View
              style={{
                color: theme.errorText,
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <Text style={{ maxWidth: 450, marginBottom: 15 }}>
                <strong>Error:</strong> {error.message}
              </Text>
              {error.parsed && (
                <Button onPress={() => onNewFile()}>
                  <Trans>Select new file...</Trans>
                </Button>
              )}
            </View>
          )}

          {/* Swiss Bank Import Settings Dialog */}
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
                <Trans>Configure Import Settings</Trans>
              </Text>
              <Text style={{ marginBottom: 15, color: theme.pageTextSubdued }}>
                {isMigrosImport ? (
                  <Trans>Select the account where Migros transactions should be imported.</Trans>
                ) : (
                  <Trans>Select the accounts for Revolut transfers (bank account for top-ups/withdrawals, cash account for ATM).</Trans>
                )}
              </Text>

              {isMigrosImport && (
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
              )}

              {isRevolutImport && (
                <>
                  <View style={{ marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Text style={{ width: 150 }}><Trans>Bank Account:</Trans></Text>
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
                </>
              )}

              <View style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Button
                  onPress={async () => {
                    await send('swiss-bank-save-import-settings', { settings: importSettings });
                    setShowSettingsDialog(false);
                  }}
                  variant="primary"
                >
                  <Trans>Save Settings</Trans>
                </Button>
              </View>
            </View>
          )}

          {/* Category Prompt for Revolut Balance Correction */}
          {showCategoryPrompt && pendingBalanceCorrection && (
            <View
              style={{
                marginTop: 10,
                padding: 15,
                backgroundColor: theme.warningBackground,
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
                  <Trans>Current Balance:</Trans> {(pendingBalanceCorrection.accountBalance / 100).toFixed(2)} CHF
                </Text>
                <Text style={{ fontSize: '0.9em' }}>
                  <Trans>Expected Total:</Trans> {(pendingBalanceCorrection.expectedBalance / 100).toFixed(2)} CHF
                </Text>
                <Text style={{ fontSize: '0.9em', fontWeight: 'bold', color: pendingBalanceCorrection.difference > 0 ? theme.noticeText : theme.errorText }}>
                  <Trans>Difference:</Trans> {pendingBalanceCorrection.difference > 0 ? '+' : ''}{(pendingBalanceCorrection.difference / 100).toFixed(2)} CHF
                </Text>
              </View>
              <View style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 150 }}><Trans>Category:</Trans></Text>
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
              <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Button
                  onPress={() => {
                    setShowCategoryPrompt(false);
                    setPendingBalanceCorrection(null);
                    close();
                    if (onImported) {
                      onImported(true);
                    }
                  }}
                >
                  <Trans>Skip Correction</Trans>
                </Button>
                <Button
                  variant="primary"
                  isDisabled={!selectedDifferenzCategory}
                  onPress={handleDifferenzCategoryConfirm}
                >
                  <Trans>Book Correction</Trans>
                </Button>
              </View>
            </View>
          )}

          {/* Current Revolut Total input for balance correction */}
          {isRevolutImport && (
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
                      // Allow numbers, dots, commas, and apostrophes for Swiss format
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

          {filetype === 'csv' && !isSwissBankImport && (
            <View style={{ marginTop: 10 }}>
              <FieldMappings
                transactions={transactions}
                onChange={onUpdateFields}
                mappings={fieldMappings || undefined}
                splitMode={splitMode}
                inOutMode={inOutMode}
                hasHeaderRow={hasHeaderRow}
              />
            </View>
          )}

          {isOfxFile(filetype) && (
            <LabeledCheckbox
              id="form_fallback_missing_payee"
              checked={fallbackMissingPayeeToMemo}
              onChange={() => {
                setFallbackMissingPayeeToMemo(state => !state);
              }}
            >
              <Trans>Use Memo as a fallback for empty Payees</Trans>
            </LabeledCheckbox>
          )}

          {filetype !== 'csv' && (
            <LabeledCheckbox
              id="import_notes"
              checked={importNotes}
              onChange={() => {
                setImportNotes(!importNotes);
              }}
            >
              <Trans>Import notes from file</Trans>
            </LabeledCheckbox>
          )}

          {(isOfxFile(filetype) || isCamtFile(filetype)) && (
            <LabeledCheckbox
              id="form_dont_reconcile"
              checked={reconcile}
              onChange={() => {
                setReconcile(!reconcile);
              }}
            >
              <Trans>Merge with existing transactions</Trans>
            </LabeledCheckbox>
          )}

          {/*Import Options - hidden for Swiss bank imports */}
          {(filetype === 'qif' || filetype === 'csv') && !isSwissBankImport && (
            <View style={{ marginTop: 10 }}>
              <SpaceBetween
                gap={5}
                style={{ marginTop: 5, alignItems: 'flex-start' }}
              >
                {/* Date Format */}
                <View>
                  {(filetype === 'qif' || filetype === 'csv') && (
                    <DateFormatSelect
                      transactions={transactions}
                      fieldMappings={fieldMappings || undefined}
                      parseDateFormat={parseDateFormat || undefined}
                      onChange={value => {
                        setParseDateFormat(isDateFormat(value) ? value : null);
                      }}
                    />
                  )}
                </View>

                {/* CSV Options */}
                {filetype === 'csv' && (
                  <View style={{ marginLeft: 10, gap: 5 }}>
                    <SectionLabel title={t('CSV OPTIONS')} />
                    <label
                      htmlFor="csv-delimiter-select"
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Trans>Delimiter:</Trans>
                      <Select
                        id="csv-delimiter-select"
                        options={[
                          [',', ','],
                          [';', ';'],
                          ['|', '|'],
                          ['\t', 'tab'],
                          ['~', '~'],
                        ]}
                        value={delimiter}
                        onChange={value => {
                          setDelimiter(value);
                        }}
                        style={{ width: 50 }}
                      />
                    </label>
                    <label
                      htmlFor="csv-skip-start-lines"
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Trans>Skip start lines:</Trans>
                      <Input
                        id="csv-skip-start-lines"
                        type="number"
                        value={skipStartLines}
                        min="0"
                        step="1"
                        onChangeValue={value => {
                          setSkipStartLines(Math.abs(parseInt(value, 10) || 0));
                        }}
                        style={{ width: 50 }}
                      />
                    </label>
                    <label
                      htmlFor="csv-skip-end-lines"
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Trans>Skip end lines:</Trans>
                      <Input
                        id="csv-skip-end-lines"
                        type="number"
                        value={skipEndLines}
                        min="0"
                        step="1"
                        onChangeValue={value => {
                          setSkipEndLines(Math.abs(parseInt(value, 10) || 0));
                        }}
                        style={{ width: 50 }}
                      />
                    </label>
                    <LabeledCheckbox
                      id="form_has_header"
                      checked={hasHeaderRow}
                      onChange={() => {
                        setHasHeaderRow(!hasHeaderRow);
                      }}
                    >
                      <Trans>File has header row</Trans>
                    </LabeledCheckbox>
                    <LabeledCheckbox
                      id="clear_on_import"
                      checked={clearOnImport}
                      onChange={() => {
                        setClearOnImport(!clearOnImport);
                      }}
                    >
                      <Trans>Clear transactions on import</Trans>
                    </LabeledCheckbox>
                    <LabeledCheckbox
                      id="form_dont_reconcile"
                      checked={reconcile}
                      onChange={() => {
                        setReconcile(!reconcile);
                      }}
                    >
                      <Trans>Merge with existing transactions</Trans>
                    </LabeledCheckbox>
                  </View>
                )}

                <View style={{ flex: 1 }} />

                <View style={{ marginRight: 10, gap: 5 }}>
                  <SectionLabel title={t('AMOUNT OPTIONS')} />
                  <LabeledCheckbox
                    id="form_flip"
                    checked={flipAmount}
                    onChange={() => {
                      setFlipAmount(!flipAmount);
                    }}
                  >
                    <Trans>Flip amount</Trans>
                  </LabeledCheckbox>
                  <MultiplierOption
                    multiplierEnabled={multiplierEnabled}
                    multiplierAmount={multiplierAmount}
                    onToggle={() => {
                      setMultiplierEnabled(!multiplierEnabled);
                      setMultiplierAmount('');
                    }}
                    onChangeAmount={onMultiplierChange}
                  />
                  {filetype === 'csv' && (
                    <>
                      <LabeledCheckbox
                        id="form_split"
                        checked={splitMode}
                        onChange={() => {
                          onSplitMode();
                        }}
                      >
                        <Trans>
                          Split amount into separate inflow/outflow columns
                        </Trans>
                      </LabeledCheckbox>
                      <InOutOption
                        inOutMode={inOutMode}
                        outValue={outValue}
                        onToggle={() => {
                          setInOutMode(!inOutMode);
                        }}
                        onChangeText={setOutValue}
                      />
                    </>
                  )}
                </View>
              </SpaceBetween>
            </View>
          )}

          <View style={{ flexDirection: 'row', marginTop: 5 }}>
            {/*Submit Button */}
            <View
              style={{
                alignSelf: 'flex-end',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '1em',
              }}
            >
              {(() => {
                const count = transactions?.filter(
                  trans =>
                    !trans.isMatchedTransaction &&
                    trans.selected &&
                    !trans.tombstone,
                ).length;

                return (
                  <ButtonWithLoading
                    variant="primary"
                    autoFocus
                    isDisabled={count === 0 || showSettingsDialog}
                    isLoading={loadingState === 'importing'}
                    onPress={() => {
                      onImport(close);
                    }}
                  >
                    <Trans count={count}>Import {{ count }} transactions</Trans>
                  </ButtonWithLoading>
                );
              })()}
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}

function getParseOptions(fileType: string, options: ParseFileOptions = {}) {
  if (fileType === 'csv') {
    const { delimiter, hasHeaderRow, skipStartLines, skipEndLines, importNotes } = options;
    // Enable auto-detection of Swiss bank formats (Migros Bank, Revolut)
    return {
      delimiter,
      hasHeaderRow,
      skipStartLines,
      skipEndLines,
      importNotes,
      swissBankFormat: 'auto' as const,
    };
  }
  if (isOfxFile(fileType)) {
    const { fallbackMissingPayeeToMemo, importNotes } = options;
    return { fallbackMissingPayeeToMemo, importNotes };
  }
  if (isCamtFile(fileType)) {
    const { importNotes } = options;
    return { importNotes };
  }
  const { importNotes } = options;
  return { importNotes };
}

function isOfxFile(fileType: string) {
  return fileType === 'ofx' || fileType === 'qfx';
}

function isCamtFile(fileType: string) {
  return fileType === 'xml';
}
