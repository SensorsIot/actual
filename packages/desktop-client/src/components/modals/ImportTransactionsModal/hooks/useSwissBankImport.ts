import { useState, useCallback } from 'react';

import { send } from 'loot-core/platform/client/fetch';

import { type ImportTransaction } from '../utils';

// Transaction category selection for Swiss bank imports
// Maps transaction ID -> selected category info
export type TransactionCategoryInfo = {
  selectedCategory: string | null;
  proposedCategory: string | null;
  hasMatch: boolean;
  payee: string;
  isExpense: boolean;
};

export type TransactionCategoryMap = Map<string, TransactionCategoryInfo>;

export type UseSwissBankImportResult = {
  // Category state
  transactionCategories: TransactionCategoryMap;
  setTransactionCategories: React.Dispatch<React.SetStateAction<TransactionCategoryMap>>;
  onTransactionCategoryChange: (transactionId: string, category: string | null) => void;

  // Notes state
  transactionNotes: Map<string, string | null>;
  setTransactionNotes: React.Dispatch<React.SetStateAction<Map<string, string | null>>>;
  onTransactionNotesChange: (transactionId: string, notes: string | null) => void;

  // Category suggestions
  fetchCategorySuggestions: (transactions: ImportTransaction[]) => Promise<void>;

  // Payee mapping save
  collectPayeeMappingsToSave: () => Array<{ payee: string; category: string; isExpense: boolean }>;
  savePayeeMappings: () => Promise<void>;
};

export function useSwissBankImport(): UseSwissBankImportResult {
  const [transactionCategories, setTransactionCategories] = useState<TransactionCategoryMap>(new Map());
  const [transactionNotes, setTransactionNotes] = useState<Map<string, string | null>>(new Map());

  const onTransactionCategoryChange = useCallback((transactionId: string, category: string | null) => {
    setTransactionCategories(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(transactionId);
      if (existing) {
        newMap.set(transactionId, { ...existing, selectedCategory: category });
      }
      return newMap;
    });
  }, []);

  const onTransactionNotesChange = useCallback((transactionId: string, notes: string | null) => {
    setTransactionNotes(prev => {
      const newMap = new Map(prev);
      newMap.set(transactionId, notes);
      return newMap;
    });
  }, []);

  const fetchCategorySuggestions = useCallback(async (transactionsToProcess: ImportTransaction[]) => {
    if (transactionsToProcess.length === 0) {
      return;
    }

    // Get unique payees with their amounts from current transactions
    const payeeAmounts = new Map<string, number>();
    for (const trans of transactionsToProcess) {
      const payee = (trans as ImportTransaction & { payee_name?: string; imported_payee?: string }).payee_name ||
        (trans as ImportTransaction & { imported_payee?: string }).imported_payee ||
        (trans as ImportTransaction & { payee?: string }).payee || '';
      const amount = typeof trans.amount === 'number' ? trans.amount : 0;
      if (payee && !payeeAmounts.has(payee)) {
        payeeAmounts.set(payee, amount);
      }
    }

    // Call API to get proposed categories using the mapping
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
    for (const trans of transactionsToProcess) {
      const payee = (trans as ImportTransaction & { payee_name?: string; imported_payee?: string }).payee_name ||
        (trans as ImportTransaction & { imported_payee?: string }).imported_payee ||
        (trans as ImportTransaction & { payee?: string }).payee || '';
      const trxId = (trans as ImportTransaction & { trx_id: string }).trx_id;
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
  }, []);

  const collectPayeeMappingsToSave = useCallback(() => {
    const payeeMappingsToSave: Array<{ payee: string; category: string; isExpense: boolean }> = [];

    if (transactionCategories.size > 0) {
      const payeeMappings = new Map<string, { category: string; isExpense: boolean }>();

      for (const catInfo of transactionCategories.values()) {
        // Save mapping if:
        // - New payee (no existing match), OR
        // - User changed the category from the proposed one
        const isNewPayee = !catInfo.hasMatch;
        const categoryChanged = catInfo.selectedCategory !== catInfo.proposedCategory;
        if (catInfo.selectedCategory && catInfo.payee && (isNewPayee || categoryChanged)) {
          if (!payeeMappings.has(catInfo.payee)) {
            payeeMappings.set(catInfo.payee, {
              category: catInfo.selectedCategory,
              isExpense: catInfo.isExpense,
            });
          }
        }
      }

      if (payeeMappings.size > 0) {
        payeeMappingsToSave.push(...Array.from(payeeMappings.entries()).map(([payee, info]) => ({
          payee,
          category: info.category,
          isExpense: info.isExpense,
        })));
      }
    }

    return payeeMappingsToSave;
  }, [transactionCategories]);

  const savePayeeMappings = useCallback(async () => {
    const newMappings = collectPayeeMappingsToSave();
    if (newMappings.length > 0) {
      await send('swiss-bank-add-payee-mappings', { newMappings });
    }
  }, [collectPayeeMappingsToSave]);

  return {
    transactionCategories,
    setTransactionCategories,
    onTransactionCategoryChange,
    transactionNotes,
    setTransactionNotes,
    onTransactionNotesChange,
    fetchCategorySuggestions,
    collectPayeeMappingsToSave,
    savePayeeMappings,
  };
}
