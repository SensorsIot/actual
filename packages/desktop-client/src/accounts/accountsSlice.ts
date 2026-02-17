import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import memoizeOne from 'memoize-one';

import { send } from 'loot-core/platform/client/connection';
import { groupById } from 'loot-core/shared/util';
import type {
  AccountEntity,
  ImportTransactionEntity,
  TransactionEntity,
} from 'loot-core/types/models';

import { resetApp } from '@desktop-client/app/appSlice';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { markPayeesDirty } from '@desktop-client/payees/payeesSlice';
import { createAppAsyncThunk } from '@desktop-client/redux';
import { type AppDispatch } from '@desktop-client/redux/store';
import { setNewTransactions } from '@desktop-client/transactions/transactionsSlice';

const sliceName = 'account';

type AccountState = {
  failedAccounts: {
    [key: AccountEntity['id']]: { type: string; code: string };
  };
  accountsSyncing: Array<AccountEntity['id']>;
  updatedAccounts: Array<AccountEntity['id']>;
};

const initialState: AccountState = {
  failedAccounts: {},
  accountsSyncing: [],
  updatedAccounts: [],
};

type SetAccountsSyncingPayload = {
  ids: Array<AccountEntity['id']>;
};

type MarkAccountFailedPayload = {
  id: AccountEntity['id'];
  errorType: string;
  errorCode: string;
};

type MarkAccountSuccessPayload = {
  id: AccountEntity['id'];
};

type MarkUpdatedAccountsPayload = {
  ids: AccountState['updatedAccounts'];
};

type MarkAccountReadPayload = {
  id: AccountEntity['id'];
};

const accountsSlice = createSlice({
  name: sliceName,
  initialState,
  reducers: {
    setAccountsSyncing(
      state,
      action: PayloadAction<SetAccountsSyncingPayload>,
    ) {
      state.accountsSyncing = action.payload.ids;
    },
    markAccountFailed(state, action: PayloadAction<MarkAccountFailedPayload>) {
      state.failedAccounts[action.payload.id] = {
        type: action.payload.errorType,
        code: action.payload.errorCode,
      };
    },
    markAccountSuccess(
      state,
      action: PayloadAction<MarkAccountSuccessPayload>,
    ) {
      delete state.failedAccounts[action.payload.id];
    },
    markUpdatedAccounts(
      state,
      action: PayloadAction<MarkUpdatedAccountsPayload>,
    ) {
      state.updatedAccounts = action.payload.ids
        ? [...state.updatedAccounts, ...action.payload.ids]
        : state.updatedAccounts;
    },
    markAccountRead(state, action: PayloadAction<MarkAccountReadPayload>) {
      state.updatedAccounts = state.updatedAccounts.filter(
        id => id !== action.payload.id,
      );
    },
  },
  extraReducers: builder => {
    builder.addCase(resetApp, () => initialState);
  },
});

/**
 * Import Revolut transactions with multi-currency support.
 * Automatically creates accounts for each currency (Revolut, Revolut EUR, etc.)
 */
type ImportRevolutTransactionsPayload = {
  transactions: Array<
    ImportTransactionEntity & {
      currency?: string;
      transaction_type?: string;
      transfer_account?: string;
    }
  >;
};

export const importRevolutTransactions = createAppAsyncThunk(
  `${sliceName}/importRevolutTransactions`,
  async ({ transactions }: ImportRevolutTransactionsPayload, { dispatch }) => {
    const {
      errors = [],
      accountsCreated = [],
      imported = {},
      categoriesApplied = 0,
    } = await send('transactions-import-revolut', {
      transactions,
      isPreview: false,
    });

    // Collect all added/updated transaction IDs
    const allAdded: string[] = [];
    const allUpdated: string[] = [];
    const accountsUsed: string[] = [];

    for (const currency of Object.keys(imported)) {
      const { added, updated } = imported[currency];
      allAdded.push(...added);
      allUpdated.push(...updated);
      accountsUsed.push(`Revolut ${currency}`);
    }

    dispatch(
      setNewTransactions({
        newTransactions: allAdded,
        matchedTransactions: allUpdated,
      }),
    );

    // Show import summary modal
    dispatch(
      pushModal({
        modal: {
          name: 'import-summary',
          options: {
            importType: 'revolut',
            accountsUsed,
            accountsCreated,
            transactionsAdded: allAdded.length,
            transactionsUpdated: allUpdated.length,
            categoriesApplied,
            errors: errors.map(e => e.message),
          },
        },
      }),
    );

    return allAdded.length > 0 || allUpdated.length > 0;
  },
);

/**
 * Import Migros transactions to the configured account.
 * Uses migros_account from import_settings.json.
 */
type ImportMigrosTransactionsPayload = {
  transactions: ImportTransactionEntity[];
};

export const importMigrosTransactions = createAppAsyncThunk(
  `${sliceName}/importMigrosTransactions`,
  async ({ transactions }: ImportMigrosTransactionsPayload, { dispatch }) => {
    const {
      errors = [],
      accountUsed = '',
      imported = { added: [], updated: [] },
      categoriesApplied = 0,
    } = await send('transactions-import-migros', {
      transactions,
      isPreview: false,
    });

    dispatch(
      setNewTransactions({
        newTransactions: imported.added || [],
        matchedTransactions: imported.updated || [],
      }),
    );

    // Show import summary modal
    dispatch(
      pushModal({
        modal: {
          name: 'import-summary',
          options: {
            importType: 'migros',
            accountsUsed: accountUsed ? [accountUsed] : [],
            accountsCreated: [],
            transactionsAdded: imported.added?.length || 0,
            transactionsUpdated: imported.updated?.length || 0,
            categoriesApplied,
            errors: errors.map(e => e.message),
          },
        },
      }),
    );

    return (
      (imported.added?.length || 0) > 0 || (imported.updated?.length || 0) > 0
    );
  },
);

/**
 * Import Kantonalbank transactions to the configured account.
 * Uses kantonalbank_account from import_settings.json.
 */
type ImportKantonalbankTransactionsPayload = {
  transactions: ImportTransactionEntity[];
};

export const importKantonalbankTransactions = createAppAsyncThunk(
  `${sliceName}/importKantonalbankTransactions`,
  async (
    { transactions }: ImportKantonalbankTransactionsPayload,
    { dispatch },
  ) => {
    const {
      errors = [],
      accountUsed = '',
      imported = { added: [], updated: [] },
      categoriesApplied = 0,
    } = await send('transactions-import-kantonalbank', {
      transactions,
      isPreview: false,
    });

    dispatch(
      setNewTransactions({
        newTransactions: imported.added || [],
        matchedTransactions: imported.updated || [],
      }),
    );

    // Show import summary modal
    dispatch(
      pushModal({
        modal: {
          name: 'import-summary',
          options: {
            importType: 'kantonalbank',
            accountsUsed: accountUsed ? [accountUsed] : [],
            accountsCreated: [],
            transactionsAdded: imported.added?.length || 0,
            transactionsUpdated: imported.updated?.length || 0,
            categoriesApplied,
            errors: errors.map(e => e.message),
          },
        },
      }),
    );

    return (
      (imported.added?.length || 0) > 0 || (imported.updated?.length || 0) > 0
    );
  },
);

export const getAccountsById = memoizeOne(
  (accounts: AccountEntity[] | null | undefined) => groupById(accounts),
);

export const { name, reducer, getInitialState } = accountsSlice;
export const actions = {
  ...accountsSlice.actions,
};

export const {
  markAccountRead,
  markAccountFailed,
  markAccountSuccess,
  markUpdatedAccounts,
  setAccountsSyncing,
} = accountsSlice.actions;
