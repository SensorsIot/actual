import { t } from 'i18next';
import { v4 as uuidv4 } from 'uuid';

import { captureException } from '../../platform/exceptions';
import * as asyncStorage from '../../platform/server/asyncStorage';
import * as fs from '../../platform/server/fs';
import * as connection from '../../platform/server/connection';
import { logger } from '../../platform/server/log';
import { isNonProductionEnvironment } from '../../shared/environment';
import { dayFromDate } from '../../shared/months';
import * as monthUtils from '../../shared/months';
import { amountToInteger } from '../../shared/util';
import {
  type AccountEntity,
  type CategoryEntity,
  type GoCardlessToken,
  type ImportTransactionEntity,
  type SyncServerGoCardlessAccount,
  type SyncServerPluggyAiAccount,
  type SyncServerSimpleFinAccount,
  type TransactionEntity,
} from '../../types/models';
import { createApp } from '../app';
import * as db from '../db';
import {
  APIError,
  BankSyncError,
  PostError,
  TransactionError,
} from '../errors';
import { app as mainApp } from '../main-app';
import { mutator } from '../mutators';
import { get, post } from '../post';
import * as prefs from '../prefs';
import { getServer } from '../server-config';
import { batchMessages } from '../sync';
import { undoable, withUndo } from '../undo';

import * as link from './link';
import { getStartingBalancePayee } from './payees';
import * as bankSync from './sync';

export type AccountHandlers = {
  'account-update': typeof updateAccount;
  'accounts-get': typeof getAccounts;
  'account-balance': typeof getAccountBalance;
  'account-properties': typeof getAccountProperties;
  'gocardless-accounts-link': typeof linkGoCardlessAccount;
  'simplefin-accounts-link': typeof linkSimpleFinAccount;
  'pluggyai-accounts-link': typeof linkPluggyAiAccount;
  'account-create': typeof createAccount;
  'account-close': typeof closeAccount;
  'account-reopen': typeof reopenAccount;
  'account-move': typeof moveAccount;
  'secret-set': typeof setSecret;
  'secret-check': typeof checkSecret;
  'gocardless-poll-web-token': typeof pollGoCardlessWebToken;
  'gocardless-poll-web-token-stop': typeof stopGoCardlessWebTokenPolling;
  'gocardless-status': typeof goCardlessStatus;
  'simplefin-status': typeof simpleFinStatus;
  'pluggyai-status': typeof pluggyAiStatus;
  'simplefin-accounts': typeof simpleFinAccounts;
  'pluggyai-accounts': typeof pluggyAiAccounts;
  'gocardless-get-banks': typeof getGoCardlessBanks;
  'gocardless-create-web-token': typeof createGoCardlessWebToken;
  'accounts-bank-sync': typeof accountsBankSync;
  'simplefin-batch-sync': typeof simpleFinBatchSync;
  'transactions-import': typeof importTransactions;
  'transactions-import-revolut': typeof importRevolutTransactions;
  'account-unlink': typeof unlinkAccount;
  // Swiss bank import features (matching Python implementation)
  'swiss-bank-get-payee-mapping': typeof getSwissBankPayeeMapping;
  'swiss-bank-save-payee-mapping': typeof saveSwissBankPayeeMapping;
  'swiss-bank-learn-categories': typeof learnCategoriesFromTransactions;
  'swiss-bank-balance-check': typeof checkAndCorrectBalance;
};

async function updateAccount({
  id,
  name,
  last_reconciled,
}: Pick<AccountEntity, 'id' | 'name'> &
  Partial<Pick<AccountEntity, 'last_reconciled'>>) {
  await db.update('accounts', {
    id,
    name,
    ...(last_reconciled && { last_reconciled }),
  });
  return {};
}

async function getAccounts() {
  return db.getAccounts();
}

async function getAccountBalance({
  id,
  cutoff,
}: {
  id: string;
  cutoff: string | Date;
}) {
  const result = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0 AND date <= ?',
    [id, db.toDateRepr(dayFromDate(cutoff))],
  );
  return result?.balance ? result.balance : 0;
}

async function getAccountProperties({ id }: { id: AccountEntity['id'] }) {
  const balanceResult = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0',
    [id],
  );
  const countResult = await db.first<{ count: number }>(
    'SELECT count(id) as count FROM transactions WHERE acct = ? AND tombstone = 0',
    [id],
  );

  return {
    balance: balanceResult?.balance || 0,
    numTransactions: countResult?.count || 0,
  };
}

async function linkGoCardlessAccount({
  requisitionId,
  account,
  upgradingId,
  offBudget = false,
}: {
  requisitionId: string;
  account: SyncServerGoCardlessAccount;
  upgradingId?: AccountEntity['id'] | undefined;
  offBudget?: boolean | undefined;
}) {
  let id;
  const bank = await link.findOrCreateBank(account.institution, requisitionId);

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: account.account_id,
      bank: bank.id,
      account_sync_source: 'goCardless',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: account.account_id,
      mask: account.mask,
      name: account.name,
      official_name: account.official_name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'goCardless',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    account.account_id,
    bank.bank_id,
  );

  connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

async function linkSimpleFinAccount({
  externalAccount,
  upgradingId,
  offBudget = false,
}: {
  externalAccount: SyncServerSimpleFinAccount;
  upgradingId?: AccountEntity['id'] | undefined;
  offBudget?: boolean | undefined;
}) {
  let id;

  const institution = {
    name: externalAccount.institution ?? t('Unknown'),
  };

  const bank = await link.findOrCreateBank(
    institution,
    externalAccount.orgDomain ?? externalAccount.orgId,
  );

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: externalAccount.account_id,
      bank: bank.id,
      account_sync_source: 'simpleFin',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: externalAccount.account_id,
      name: externalAccount.name,
      official_name: externalAccount.name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'simpleFin',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    externalAccount.account_id,
    bank.bank_id,
  );

  await connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

async function linkPluggyAiAccount({
  externalAccount,
  upgradingId,
  offBudget = false,
}: {
  externalAccount: SyncServerPluggyAiAccount;
  upgradingId?: AccountEntity['id'] | undefined;
  offBudget?: boolean | undefined;
}) {
  let id;

  const institution = {
    name: externalAccount.institution ?? t('Unknown'),
  };

  const bank = await link.findOrCreateBank(
    institution,
    externalAccount.orgDomain ?? externalAccount.orgId,
  );

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: externalAccount.account_id,
      bank: bank.id,
      account_sync_source: 'pluggyai',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: externalAccount.account_id,
      name: externalAccount.name,
      official_name: externalAccount.name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'pluggyai',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    externalAccount.account_id,
    bank.bank_id,
  );

  await connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

async function createAccount({
  name,
  balance = 0,
  offBudget = false,
  closed = false,
}: {
  name: string;
  balance?: number | undefined;
  offBudget?: boolean | undefined;
  closed?: boolean | undefined;
}) {
  const id: AccountEntity['id'] = await db.insertAccount({
    name,
    offbudget: offBudget ? 1 : 0,
    closed: closed ? 1 : 0,
  });

  await db.insertPayee({
    name: '',
    transfer_acct: id,
  });

  if (balance != null && balance !== 0) {
    const payee = await getStartingBalancePayee();

    await db.insertTransaction({
      account: id,
      amount: amountToInteger(balance),
      category: offBudget ? null : payee.category,
      payee: payee.id,
      date: monthUtils.currentDay(),
      cleared: true,
      starting_balance_flag: true,
    });
  }

  return id;
}

async function closeAccount({
  id,
  transferAccountId,
  categoryId,
  forced = false,
}: {
  id: AccountEntity['id'];
  transferAccountId?: AccountEntity['id'] | undefined;
  categoryId?: CategoryEntity['id'] | undefined;
  forced?: boolean | undefined;
}) {
  // Unlink the account if it's linked. This makes sure to remove it from
  // bank-sync providers. (This should not be undo-able, as it mutates the
  // remote server and the user will have to link the account again)
  await unlinkAccount({ id });

  return withUndo(async () => {
    const account = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ? AND tombstone = 0',
      [id],
    );

    // Do nothing if the account doesn't exist or it's already been
    // closed
    if (!account || account.closed === 1) {
      return;
    }

    const { balance, numTransactions } = await getAccountProperties({ id });

    // If there are no transactions, we can simply delete the account
    if (numTransactions === 0) {
      await db.deleteAccount({ id });
    } else if (forced) {
      const rows = await db.runQuery<
        Pick<db.DbViewTransaction, 'id' | 'transfer_id'>
      >(
        'SELECT id, transfer_id FROM v_transactions WHERE account = ?',
        [id],
        true,
      );

      const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
        'SELECT id FROM payees WHERE transfer_acct = ?',
        [id],
      );

      if (!transferPayee) {
        throw new Error(`Transfer payee with account ID ${id} not found.`);
      }

      await batchMessages(async () => {
        // TODO: what this should really do is send a special message that
        // automatically marks the tombstone value for all transactions
        // within an account... or something? This is problematic
        // because another client could easily add new data that
        // should be marked as deleted.

        rows.forEach(row => {
          if (row.transfer_id) {
            db.updateTransaction({
              id: row.transfer_id,
              payee: null,
              transfer_id: null,
            });
          }

          db.deleteTransaction({ id: row.id });
        });

        db.deleteAccount({ id });
        db.deleteTransferPayee({ id: transferPayee.id });
      });
    } else {
      if (balance !== 0 && transferAccountId == null) {
        throw APIError('balance is non-zero: transferAccountId is required');
      }

      if (id === transferAccountId) {
        throw APIError('transfer account can not be the account being closed');
      }

      await db.update('accounts', { id, closed: 1 });

      // If there is a balance we need to transfer it to the specified
      // account (and possibly categorize it)
      if (balance !== 0 && transferAccountId) {
        const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
          'SELECT id FROM payees WHERE transfer_acct = ?',
          [transferAccountId],
        );

        if (!transferPayee) {
          throw new Error(
            `Transfer payee with account ID ${transferAccountId} not found.`,
          );
        }

        await mainApp.handlers['transaction-add']({
          id: uuidv4(),
          payee: transferPayee.id,
          amount: -balance,
          account: id,
          date: monthUtils.currentDay(),
          notes: 'Closing account',
          category: categoryId,
        });
      }
    }
  });
}

async function reopenAccount({ id }: { id: AccountEntity['id'] }) {
  await db.update('accounts', { id, closed: 0 });
}

async function moveAccount({
  id,
  targetId,
}: {
  id: AccountEntity['id'];
  targetId: AccountEntity['id'] | null;
}) {
  await db.moveAccount(id, targetId);
}

async function setSecret({
  name,
  value,
}: {
  name: string;
  value: string | null;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.BASE_SERVER + '/secret',
      {
        name,
        value,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );
  } catch (error) {
    return {
      error: 'failed',
      reason: error instanceof PostError ? error.reason : undefined,
    };
  }
}
async function checkSecret(name: string) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await get(serverConfig.BASE_SERVER + '/secret/' + name, {
      'X-ACTUAL-TOKEN': userToken,
    });
  } catch (error) {
    logger.error(error);
    return { error: 'failed' };
  }
}

let stopPolling = false;

async function pollGoCardlessWebToken({
  requisitionId,
}: {
  requisitionId: string;
}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unknown' };

  const startTime = Date.now();
  stopPolling = false;

  async function getData(
    cb: (
      data:
        | { status: 'timeout' }
        | { status: 'unknown'; message?: string }
        | { status: 'success'; data: GoCardlessToken },
    ) => void,
  ) {
    if (stopPolling) {
      return;
    }

    if (Date.now() - startTime >= 1000 * 60 * 10) {
      cb({ status: 'timeout' });
      return;
    }

    const serverConfig = getServer();
    if (!serverConfig) {
      throw new Error('Failed to get server config.');
    }

    const data = await post(
      serverConfig.GOCARDLESS_SERVER + '/get-accounts',
      {
        requisitionId,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );

    if (data) {
      if (data.error_code) {
        logger.error('Failed linking gocardless account:', data);
        cb({ status: 'unknown', message: data.error_type });
      } else {
        cb({ status: 'success', data });
      }
    } else {
      setTimeout(() => getData(cb), 3000);
    }
  }

  return new Promise(resolve => {
    getData(data => {
      if (data.status === 'success') {
        resolve({ data: data.data });
        return;
      }

      if (data.status === 'timeout') {
        resolve({ error: data.status });
        return;
      }

      resolve({
        error: data.status,
        message: data.message,
      });
    });
  });
}

async function stopGoCardlessWebTokenPolling() {
  stopPolling = true;
  return 'ok';
}

async function goCardlessStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.GOCARDLESS_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

async function simpleFinStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.SIMPLEFIN_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

async function pluggyAiStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.PLUGGYAI_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

async function simpleFinAccounts() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.SIMPLEFIN_SERVER + '/accounts',
      {},
      {
        'X-ACTUAL-TOKEN': userToken,
      },
      60000,
    );
  } catch {
    return { error_code: 'TIMED_OUT' };
  }
}

async function pluggyAiAccounts() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.PLUGGYAI_SERVER + '/accounts',
      {},
      {
        'X-ACTUAL-TOKEN': userToken,
      },
      60000,
    );
  } catch {
    return { error_code: 'TIMED_OUT' };
  }
}

async function getGoCardlessBanks(country: string) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.GOCARDLESS_SERVER + '/get-banks',
    { country, showDemo: isNonProductionEnvironment() },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

async function createGoCardlessWebToken({
  institutionId,
  accessValidForDays,
}: {
  institutionId: string;
  accessValidForDays: number;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.GOCARDLESS_SERVER + '/create-web-token',
      {
        institutionId,
        accessValidForDays,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );
  } catch (error) {
    logger.error(error);
    return { error: 'failed' };
  }
}

type SyncResponse = {
  newTransactions: Array<TransactionEntity['id']>;
  matchedTransactions: Array<TransactionEntity['id']>;
  updatedAccounts: Array<AccountEntity['id']>;
};

async function handleSyncResponse(
  res: {
    added: Array<TransactionEntity['id']>;
    updated: Array<TransactionEntity['id']>;
  },
  acct: db.DbAccount,
): Promise<SyncResponse> {
  const { added, updated } = res;
  const newTransactions: Array<TransactionEntity['id']> = [];
  const matchedTransactions: Array<TransactionEntity['id']> = [];
  const updatedAccounts: Array<AccountEntity['id']> = [];

  newTransactions.push(...added);
  matchedTransactions.push(...updated);

  if (added.length > 0) {
    updatedAccounts.push(acct.id);
  }

  const ts = new Date().getTime().toString();
  await db.update('accounts', { id: acct.id, last_sync: ts });

  return {
    newTransactions,
    matchedTransactions,
    updatedAccounts,
  };
}

type SyncError =
  | {
      type: 'SyncError';
      accountId: AccountEntity['id'];
      message: string;
      category: string;
      code: string;
    }
  | {
      accountId: AccountEntity['id'];
      message: string;
      internal?: string;
    };

function handleSyncError(
  err: Error | PostError | BankSyncError,
  acct: db.DbAccount,
): SyncError {
  // TODO: refactor bank sync logic to use BankSyncError properly
  // oxlint-disable-next-line typescript/no-explicit-any
  if (err instanceof BankSyncError || (err as any)?.type === 'BankSyncError') {
    const error = err as BankSyncError;

    const syncError = {
      type: 'SyncError',
      accountId: acct.id,
      message: 'Failed syncing account "' + acct.name + '."',
      category: error.category,
      code: error.code,
    };

    if (error.category === 'RATE_LIMIT_EXCEEDED') {
      return {
        ...syncError,
        message: `Failed syncing account ${acct.name}. Rate limit exceeded. Please try again later.`,
      };
    }

    return syncError;
  }

  if (err instanceof PostError && err.reason !== 'internal') {
    return {
      accountId: acct.id,
      message: err.reason
        ? err.reason
        : `Account "${acct.name}" is not linked properly. Please link it again.`,
    };
  }

  return {
    accountId: acct.id,
    message:
      'There was an internal error. Please get in touch https://actualbudget.org/contact for support.',
    internal: err.stack,
  };
}

export type SyncResponseWithErrors = SyncResponse & {
  errors: SyncError[];
};

async function accountsBankSync({
  ids = [],
}: {
  ids: Array<AccountEntity['id']>;
}): Promise<SyncResponseWithErrors> {
  const { 'user-id': userId, 'user-key': userKey } =
    await asyncStorage.multiGet(['user-id', 'user-key']);

  const accounts = await db.runQuery<
    db.DbAccount & { bankId: db.DbBank['bank_id'] }
  >(
    `
    SELECT a.*, b.bank_id as bankId
    FROM accounts a
    LEFT JOIN banks b ON a.bank = b.id
    WHERE a.tombstone = 0 AND a.closed = 0
      ${ids.length ? `AND a.id IN (${ids.map(() => '?').join(', ')})` : ''}
    ORDER BY a.offbudget, a.sort_order
  `,
    ids,
    true,
  );

  const errors: ReturnType<typeof handleSyncError>[] = [];
  const newTransactions: Array<TransactionEntity['id']> = [];
  const matchedTransactions: Array<TransactionEntity['id']> = [];
  const updatedAccounts: Array<AccountEntity['id']> = [];

  for (const acct of accounts) {
    if (acct.bankId && acct.account_id) {
      try {
        logger.group('Bank Sync operation for account:', acct.name);
        const syncResponse = await bankSync.syncAccount(
          userId as string,
          userKey as string,
          acct.id,
          acct.account_id,
          acct.bankId,
        );

        const syncResponseData = await handleSyncResponse(syncResponse, acct);

        newTransactions.push(...syncResponseData.newTransactions);
        matchedTransactions.push(...syncResponseData.matchedTransactions);
        updatedAccounts.push(...syncResponseData.updatedAccounts);
      } catch (err) {
        const error = err as Error;
        errors.push(handleSyncError(error, acct));
        captureException({
          ...error,
          message: 'Failed syncing account "' + acct.name + '."',
        } as Error);
      } finally {
        logger.groupEnd();
      }
    }
  }

  if (updatedAccounts.length > 0) {
    connection.send('sync-event', {
      type: 'success',
      tables: ['transactions'],
    });
  }

  return { errors, newTransactions, matchedTransactions, updatedAccounts };
}

async function simpleFinBatchSync({
  ids = [],
}: {
  ids: Array<AccountEntity['id']>;
}): Promise<
  Array<{ accountId: AccountEntity['id']; res: SyncResponseWithErrors }>
> {
  const accounts = await db.runQuery<
    db.DbAccount & { bankId: db.DbBank['bank_id'] }
  >(
    `SELECT a.*, b.bank_id as bankId FROM accounts a
         LEFT JOIN banks b ON a.bank = b.id
         WHERE
          a.tombstone = 0
          AND a.closed = 0
          AND a.account_sync_source = 'simpleFin'
          ${ids.length ? `AND a.id IN (${ids.map(() => '?').join(', ')})` : ''}
         ORDER BY a.offbudget, a.sort_order`,
    ids.length ? ids : [],
    true,
  );

  const retVal: Array<{
    accountId: AccountEntity['id'];
    res: {
      errors: ReturnType<typeof handleSyncError>[];
      newTransactions: Array<TransactionEntity['id']>;
      matchedTransactions: Array<TransactionEntity['id']>;
      updatedAccounts: Array<AccountEntity['id']>;
    };
  }> = [];

  logger.group('Bank Sync operation for all SimpleFin accounts');
  try {
    const syncResponses: Array<{
      accountId: AccountEntity['id'];
      res: {
        error_code: string;
        error_type: string;
        added: Array<TransactionEntity['id']>;
        updated: Array<TransactionEntity['id']>;
      };
    }> = await bankSync.simpleFinBatchSync(
      accounts.map(a => ({
        id: a.id,
        account_id: a.account_id || null,
      })),
    );
    for (const syncResponse of syncResponses) {
      const account = accounts.find(a => a.id === syncResponse.accountId);
      if (!account) {
        logger.error(
          `Invalid account ID found in response: ${syncResponse.accountId}. Proceeding to the next account...`,
        );
        continue;
      }

      const errors: ReturnType<typeof handleSyncError>[] = [];
      const newTransactions: Array<TransactionEntity['id']> = [];
      const matchedTransactions: Array<TransactionEntity['id']> = [];
      const updatedAccounts: Array<AccountEntity['id']> = [];

      if (syncResponse.res.error_code) {
        errors.push(
          handleSyncError(
            {
              type: 'BankSyncError',
              reason: 'Failed syncing account "' + account.name + '."',
              category: syncResponse.res.error_type,
              code: syncResponse.res.error_code,
            } as BankSyncError,
            account,
          ),
        );
      } else {
        const syncResponseData = await handleSyncResponse(
          syncResponse.res,
          account,
        );

        newTransactions.push(...syncResponseData.newTransactions);
        matchedTransactions.push(...syncResponseData.matchedTransactions);
        updatedAccounts.push(...syncResponseData.updatedAccounts);
      }

      retVal.push({
        accountId: syncResponse.accountId,
        res: { errors, newTransactions, matchedTransactions, updatedAccounts },
      });
    }
  } catch (err) {
    const errors = [];
    for (const account of accounts) {
      retVal.push({
        accountId: account.id,
        res: {
          errors,
          newTransactions: [],
          matchedTransactions: [],
          updatedAccounts: [],
        },
      });
      const error = err as Error;
      errors.push(handleSyncError(error, account));
    }
  }

  if (retVal.some(a => a.res.updatedAccounts.length > 0)) {
    connection.send('sync-event', {
      type: 'success',
      tables: ['transactions'],
    });
  }

  logger.groupEnd();

  return retVal;
}

export type ImportTransactionsResult = bankSync.ReconcileTransactionsResult & {
  errors: Array<{
    message: string;
  }>;
};

async function importTransactions({
  accountId,
  transactions,
  isPreview,
  opts,
}: {
  accountId: AccountEntity['id'];
  transactions: ImportTransactionEntity[];
  isPreview: boolean;
  opts?: {
    defaultCleared?: boolean;
  };
}): Promise<ImportTransactionsResult> {
  if (typeof accountId !== 'string') {
    throw APIError('transactions-import: accountId must be an id');
  }

  try {
    const reconciled = await bankSync.reconcileTransactions(
      accountId,
      transactions,
      false,
      true,
      isPreview,
      opts?.defaultCleared,
    );
    return {
      errors: [],
      added: reconciled.added,
      updated: reconciled.updated,
      updatedPreview: reconciled.updatedPreview,
    };
  } catch (err) {
    if (err instanceof TransactionError) {
      return {
        errors: [{ message: err.message }],
        added: [],
        updated: [],
        updatedPreview: [],
      };
    }

    throw err;
  }
}

/**
 * Import Revolut transactions with multi-currency support.
 * Groups transactions by currency and creates/uses separate accounts.
 * Based on Python FSD Section 16.
 */
type RevolutImportTransaction = ImportTransactionEntity & {
  currency?: string;
  transaction_type?: string;
  transfer_account?: string;
};

type RevolutImportResult = {
  errors: Array<{ message: string }>;
  accountsCreated: string[];
  imported: Record<string, { added: string[]; updated: string[] }>;
  transfersLinked: number;
  categoriesApplied: number;
};

async function findOrCreateAccount(
  name: string,
  offBudget: boolean = false,
): Promise<AccountEntity['id']> {
  // Check if account already exists
  const existing = await db.first<db.DbAccount>(
    'SELECT id FROM accounts WHERE name = ? AND tombstone = 0',
    [name],
  );

  if (existing) {
    return existing.id;
  }

  // Create new account
  const id: AccountEntity['id'] = await db.insertAccount({
    name,
    offbudget: offBudget ? 1 : 0,
    closed: 0,
  });

  // Create transfer payee for this account
  await db.insertPayee({
    name: '',
    transfer_acct: id,
  });

  return id;
}

function getRevolutAccountNameFromCurrency(currency: string): string {
  const curr = currency?.toUpperCase() || 'CHF';
  return `Revolut ${curr}`;
}

/**
 * Parse exchange description to extract converted amount.
 * Examples: "Exchanged to EUR", "500.00 CHF -> 540.22 EUR"
 */
function parseExchangeAmount(
  description: string,
  originalAmount: number,
): number | null {
  // Try to extract "-> XXX.XX CUR" pattern
  const match = description.match(
    /[-→>]\s*([\d',.]+)\s*([A-Z]{3})/i,
  );
  if (match) {
    const amountStr = match[1].replace(/'/g, '').replace(',', '.');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount)) {
      // Convert to cents and apply correct sign (opposite of original)
      const cents = Math.round(amount * 100);
      return originalAmount < 0 ? cents : -cents;
    }
  }
  // Fallback: use inverse of original amount
  return -originalAmount;
}

async function importRevolutTransactions({
  transactions,
  isPreview = false,
  opts,
}: {
  transactions: RevolutImportTransaction[];
  isPreview?: boolean;
  opts?: {
    defaultCleared?: boolean;
    bankAccountName?: string; // Default: "Konto Migros 348-02"
    cashAccountName?: string; // Default: "Kasse"
    createTransfers?: boolean; // Default: true
  };
}): Promise<RevolutImportResult> {
  const result: RevolutImportResult = {
    errors: [],
    accountsCreated: [],
    imported: {},
    transfersLinked: 0,
    categoriesApplied: 0,
  };

  // Load settings from import_settings.json
  const importSettings = await getImportSettings();
  const bankAccountName =
    opts?.bankAccountName || importSettings.revolut_bank_account;
  const cashAccountName = opts?.cashAccountName || importSettings.cash_account;
  const createTransfers = opts?.createTransfers !== false;

  try {
    // Group transactions by currency
    const byCurrency: Record<string, RevolutImportTransaction[]> = {};
    for (const txn of transactions) {
      const currency = txn.currency || 'CHF';
      if (!byCurrency[currency]) {
        byCurrency[currency] = [];
      }
      byCurrency[currency].push(txn);
    }

    const currencies = Object.keys(byCurrency);
    logger.info(
      `Revolut import: ${transactions.length} transactions across ${currencies.length} currencies: ${currencies.join(', ')}`,
    );

    // Track imported transactions with their metadata for transfer linking
    const importedWithMeta: Array<{
      id: string;
      txn: RevolutImportTransaction;
      accountId: string;
      currency: string;
    }> = [];

    // Process each currency
    for (const currency of currencies) {
      const currencyTransactions = byCurrency[currency];
      const accountName = getRevolutAccountNameFromCurrency(currency);

      // Find or create account for this currency
      const existingAccount = await db.first<db.DbAccount>(
        'SELECT id FROM accounts WHERE name = ? AND tombstone = 0',
        [accountName],
      );

      let accountId: AccountEntity['id'];
      if (existingAccount) {
        accountId = existingAccount.id;
      } else {
        if (isPreview) {
          result.accountsCreated.push(accountName);
          result.imported[currency] = { added: [], updated: [] };
          continue;
        }

        accountId = await findOrCreateAccount(accountName, false);
        result.accountsCreated.push(accountName);
        logger.info(`Created Revolut account: ${accountName}`);
      }

      // Load payee-category mapping and apply to transactions
      const payeeMapping = await getSwissBankPayeeMapping({});
      if (Object.keys(payeeMapping).length > 0) {
        for (const txn of currencyTransactions) {
          if (!txn.category) {
            const categoryId = await getCategoryForPayee(
              txn.payee_name || txn.imported_payee,
              payeeMapping,
            );
            if (categoryId) {
              txn.category = categoryId;
              result.categoriesApplied++;
            }
          }
        }
      }

      // Remove currency-specific fields before import
      const cleanTransactions: ImportTransactionEntity[] =
        currencyTransactions.map(txn => {
          const {
            currency: _currency,
            transaction_type: _txnType,
            transfer_account: _transferAcct,
            ...clean
          } = txn;
          return clean;
        });

      // Import transactions to this account
      const reconciled = await bankSync.reconcileTransactions(
        accountId,
        cleanTransactions,
        false,
        true,
        isPreview,
        opts?.defaultCleared,
      );

      result.imported[currency] = {
        added: reconciled.added,
        updated: reconciled.updated,
      };

      // Track for transfer linking (only newly added transactions)
      for (let i = 0; i < reconciled.added.length; i++) {
        const txnId = reconciled.added[i];
        // Match imported transaction by index (reconcile returns in same order)
        const originalTxn = currencyTransactions[i];
        if (originalTxn && txnId) {
          importedWithMeta.push({
            id: txnId,
            txn: originalTxn,
            accountId,
            currency,
          });
        }
      }

      logger.info(
        `Revolut ${currency}: ${reconciled.added.length} added, ${reconciled.updated.length} updated`,
      );
    }

    // Create linked transfers for transfer-type transactions
    if (!isPreview && createTransfers && importedWithMeta.length > 0) {
      for (const imported of importedWithMeta) {
        const { id: txnId, txn, accountId, currency } = imported;
        const txnType = txn.transaction_type || '';

        // Determine target account based on transaction type
        let targetAccountName: string | null = null;
        if (txnType === 'topup' || txnType === 'swift_transfer') {
          targetAccountName = bankAccountName;
        } else if (txnType === 'atm') {
          targetAccountName = cashAccountName;
        } else if (txnType === 'exchange' && txn.transfer_account) {
          targetAccountName = txn.transfer_account;
        }

        if (!targetAccountName) continue;

        // Find or create target account
        const targetAccount = await db.first<db.DbAccount>(
          'SELECT id FROM accounts WHERE name = ? AND tombstone = 0',
          [targetAccountName],
        );

        let targetAccountId: string;
        if (targetAccount) {
          targetAccountId = targetAccount.id;
        } else {
          // Create the account (off-budget for Kasse)
          const isOffBudget = targetAccountName === cashAccountName;
          targetAccountId = await findOrCreateAccount(
            targetAccountName,
            isOffBudget,
          );
          result.accountsCreated.push(targetAccountName);
          logger.info(`Created transfer target account: ${targetAccountName}`);
        }

        // Calculate counter-transaction amount
        let counterAmount: number;
        if (txnType === 'exchange') {
          // For exchanges, try to parse the converted amount
          counterAmount =
            parseExchangeAmount(
              txn.imported_payee || txn.payee_name || '',
              txn.amount,
            ) || -txn.amount;
        } else {
          // For other transfers, counter amount is inverse
          counterAmount = -txn.amount;
        }

        // Get the transfer payee for target account
        const transferPayee = await db.first<{ id: string }>(
          'SELECT id FROM payees WHERE transfer_acct = ? AND tombstone = 0',
          [targetAccountId],
        );

        // Create counter-transaction in target account
        const counterId = uuidv4();
        const today = txn.date || monthUtils.currentDay();

        await db.insertTransaction({
          id: counterId,
          account: targetAccountId,
          amount: counterAmount,
          payee: transferPayee?.id || null,
          date: today,
          notes: `[Transfer] ${txn.imported_payee || txn.payee_name || ''}`,
          cleared: false,
          transferred_id: txnId,
        });

        // Update original transaction with link to counter
        await db.updateTransaction({
          id: txnId,
          transferred_id: counterId,
        });

        result.transfersLinked++;

        logger.info(
          `Linked transfer: ${getRevolutAccountNameFromCurrency(currency)} -> ${targetAccountName} (${counterAmount / 100} ${currency})`,
        );
      }
    }

    return result;
  } catch (err) {
    if (err instanceof TransactionError) {
      result.errors.push({ message: err.message });
      return result;
    }
    throw err;
  }
}

/**
 * Import Migros CSV transactions to the configured account.
 * Uses migros_account from import_settings.json instead of selected account.
 */
type MigrosImportResult = {
  errors: Array<{ message: string }>;
  accountUsed: string;
  imported: { added: string[]; updated: string[] };
  categoriesApplied: number;
};

async function importMigrosTransactions({
  transactions,
  isPreview = false,
  opts,
}: {
  transactions: ImportTransactionEntity[];
  isPreview?: boolean;
  opts?: {
    defaultCleared?: boolean;
  };
}): Promise<MigrosImportResult> {
  const result: MigrosImportResult = {
    errors: [],
    accountUsed: '',
    imported: { added: [], updated: [] },
    categoriesApplied: 0,
  };

  try {
    // Load settings from import_settings.json
    const importSettings = await getImportSettings();
    const accountName = importSettings.migros_account;

    if (!accountName) {
      result.errors.push({ message: 'Migros account not configured. Please configure import settings.' });
      return result;
    }

    result.accountUsed = accountName;

    // Find or create account
    const existingAccount = await db.first<db.DbAccount>(
      'SELECT id FROM accounts WHERE name = ? AND tombstone = 0',
      [accountName],
    );

    let accountId: AccountEntity['id'];
    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      if (isPreview) {
        return result;
      }
      accountId = await findOrCreateAccount(accountName, false);
      logger.info(`Created Migros account: ${accountName}`);
    }

    // Load payee-category mapping and apply to transactions
    const payeeMapping = await getSwissBankPayeeMapping({});
    if (Object.keys(payeeMapping).length > 0) {
      for (const txn of transactions) {
        if (!txn.category) {
          const categoryId = await getCategoryForPayee(
            txn.payee_name || txn.imported_payee,
            payeeMapping,
          );
          if (categoryId) {
            txn.category = categoryId;
            result.categoriesApplied++;
          }
        }
      }
      logger.info(`Applied payee-category mapping: ${result.categoriesApplied} categorized`);
    }

    // Import transactions to this account
    const reconciled = await bankSync.reconcileTransactions(
      accountId,
      transactions,
      false,
      true,
      isPreview,
      opts?.defaultCleared,
    );

    result.imported = {
      added: reconciled.added,
      updated: reconciled.updated,
    };

    logger.info(
      `Migros import to ${accountName}: ${reconciled.added.length} added, ${reconciled.updated.length} updated`,
    );

    return result;
  } catch (err) {
    if (err instanceof TransactionError) {
      result.errors.push({ message: err.message });
      return result;
    }
    throw err;
  }
}

// =============================================================================
// Swiss Bank Import Features (matching Python bank_csv_import.py)
// =============================================================================

/**
 * Payee to category mapping type.
 * Key: payee name, Value: "CategoryGroup:Category" format
 */
type PayeeCategoryMapping = Record<string, string>;

/**
 * Import settings stored in budget directory as import_settings.json
 */
type ImportSettings = {
  migros_account: string; // Account for Migros CSV imports
  revolut_bank_account: string; // Bank account for Revolut transfers
  cash_account: string; // Cash account for ATM withdrawals
};

const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  migros_account: '',
  revolut_bank_account: '',
  cash_account: '',
};

/**
 * Get import settings file path in budget directory.
 */
function getImportSettingsFilePath(): string {
  const budgetDir = prefs.getPrefs()?.id
    ? fs.getBudgetDir(prefs.getPrefs().id)
    : '.';
  return fs.join(budgetDir, 'import_settings.json');
}

/**
 * Get import settings from JSON file in budget directory.
 */
async function getImportSettings(): Promise<ImportSettings> {
  try {
    const filePath = getImportSettingsFilePath();
    const content = await fs.readFile(filePath);
    if (content) {
      return { ...DEFAULT_IMPORT_SETTINGS, ...JSON.parse(content) };
    }
  } catch {
    logger.info('No import_settings.json found, using defaults');
  }
  return DEFAULT_IMPORT_SETTINGS;
}

/**
 * Save import settings to JSON file in budget directory.
 */
async function saveImportSettings({
  settings,
}: {
  settings: Partial<ImportSettings>;
}): Promise<{ success: boolean }> {
  try {
    const current = await getImportSettings();
    const merged = { ...current, ...settings };
    const filePath = getImportSettingsFilePath();
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
    logger.info(`Saved import settings to ${filePath}`);
    return { success: true };
  } catch (err) {
    logger.error('Failed to save import settings:', err);
    return { success: false };
  }
}

/**
 * Get the file path for payee-category mapping storage.
 * Stored in budget directory as JSON file (like Python's payee_category_mapping.json)
 */
function getPayeeMappingFilePath(): string {
  const budgetDir = prefs.getPrefs()?.id
    ? fs.getBudgetDir(prefs.getPrefs().id)
    : '.';
  return fs.join(budgetDir, 'payee_category_mapping.json');
}

/**
 * Get payee-category mapping from JSON file in budget directory.
 * Matches Python implementation: payee_category_mapping.json
 */
async function getSwissBankPayeeMapping({
  accountId: _accountId,
}: {
  accountId?: AccountEntity['id'];
}): Promise<PayeeCategoryMapping> {
  try {
    const filePath = getPayeeMappingFilePath();
    const content = await fs.readFile(filePath);
    if (content) {
      return JSON.parse(content) as PayeeCategoryMapping;
    }
  } catch {
    // File doesn't exist or can't be read
    logger.info('No payee_category_mapping.json found, using empty mapping');
  }

  return {};
}

/**
 * Save payee-category mapping to JSON file in budget directory.
 * Matches Python implementation: payee_category_mapping.json
 */
async function saveSwissBankPayeeMapping({
  accountId: _accountId,
  mapping,
}: {
  accountId?: AccountEntity['id'];
  mapping: PayeeCategoryMapping;
}): Promise<{ success: boolean }> {
  try {
    const filePath = getPayeeMappingFilePath();
    await fs.writeFile(filePath, JSON.stringify(mapping, null, 2));

    logger.info(
      `Saved ${Object.keys(mapping).length} payee-category mappings to ${filePath}`,
    );
    return { success: true };
  } catch (err) {
    logger.error('Failed to save payee mapping:', err);
    return { success: false };
  }
}

/**
 * Learn payee-category mappings from existing transactions.
 * Matches Python: learn_categories_from_existing()
 */
async function learnCategoriesFromTransactions({
  accountId,
}: {
  accountId?: AccountEntity['id'];
}): Promise<{ mapping: PayeeCategoryMapping; count: number }> {
  // Query existing transactions with categories to learn mappings
  // SQL matches Python's query
  const query = accountId
    ? `
      SELECT p.name as payee_name, cg.name || ':' || c.name as cat_name
      FROM transactions t
      JOIN payees p ON t.description = p.id
      JOIN categories c ON t.category = c.id
      JOIN category_groups cg ON c.cat_group = cg.id
      WHERE t.tombstone = 0
        AND t.category IS NOT NULL
        AND t.category != ''
        AND t.acct = ?
      GROUP BY p.name, cat_name
    `
    : `
      SELECT p.name as payee_name, cg.name || ':' || c.name as cat_name
      FROM transactions t
      JOIN payees p ON t.description = p.id
      JOIN categories c ON t.category = c.id
      JOIN category_groups cg ON c.cat_group = cg.id
      WHERE t.tombstone = 0
        AND t.category IS NOT NULL
        AND t.category != ''
      GROUP BY p.name, cat_name
    `;

  const rows = accountId
    ? await db.all<{ payee_name: string; cat_name: string }>(query, [accountId])
    : await db.all<{ payee_name: string; cat_name: string }>(query);

  const mapping: PayeeCategoryMapping = {};
  for (const row of rows) {
    if (row.payee_name && row.cat_name) {
      mapping[row.payee_name] = row.cat_name;
    }
  }

  logger.info(
    `Learned ${Object.keys(mapping).length} payee-category mappings from existing transactions`,
  );
  return { mapping, count: Object.keys(mapping).length };
}

/**
 * Check account balance against bank saldo and create correction if needed.
 * Matches Python: create_balance_correction()
 */
async function checkAndCorrectBalance({
  accountId,
  bankSaldo,
  dryRun = false,
}: {
  accountId: AccountEntity['id'];
  bankSaldo: number; // in cents
  dryRun?: boolean;
}): Promise<{
  actualBalance: number;
  bankSaldo: number;
  difference: number;
  correctionCreated: boolean;
  correctionId?: string;
}> {
  // Get current account balance
  const result = await db.first<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0) as balance
     FROM transactions
     WHERE acct = ? AND tombstone = 0`,
    [accountId],
  );

  const actualBalance = result?.balance ?? 0;
  const difference = bankSaldo - actualBalance;

  logger.info('Swiss Bank Balance Check:');
  logger.info(`  Bank saldo:      ${(bankSaldo / 100).toFixed(2)} CHF`);
  logger.info(`  Actual balance:  ${(actualBalance / 100).toFixed(2)} CHF`);
  logger.info(`  Difference:      ${(difference / 100).toFixed(2)} CHF`);

  if (difference === 0) {
    logger.info('  Status: OK - Balances match!');
    return {
      actualBalance,
      bankSaldo,
      difference,
      correctionCreated: false,
    };
  }

  if (dryRun) {
    logger.info('  Status: MISMATCH - Would create correction (dry run)');
    return {
      actualBalance,
      bankSaldo,
      difference,
      correctionCreated: false,
    };
  }

  // Create correction transaction
  logger.info('  Status: MISMATCH - Creating correction booking');

  // Get or create "Automatische Saldokorrektur" payee
  let payeeId: string | null = null;
  const payeeName = 'Automatische Saldokorrektur';
  const existingPayee = await db.first<{ id: string }>(
    'SELECT id FROM payees WHERE name = ? AND tombstone = 0',
    [payeeName],
  );

  if (existingPayee) {
    payeeId = existingPayee.id;
  } else {
    payeeId = uuidv4();
    await db.insertPayee({
      id: payeeId,
      name: payeeName,
    });
  }

  // Find "Lebensunterhalt:Weiss nicht" category (or similar)
  // This matches the Python implementation's correction category
  let categoryId: string | null = null;
  const categoryResult = await db.first<{ id: string }>(
    `SELECT c.id
     FROM categories c
     JOIN category_groups cg ON c.cat_group = cg.id
     WHERE cg.name = 'Lebensunterhalt' AND c.name = 'Weiss nicht' AND c.tombstone = 0`,
  );
  categoryId = categoryResult?.id ?? null;

  // Create the correction transaction
  const today = monthUtils.currentDay();
  const correctionId = uuidv4();

  await db.insertTransaction({
    id: correctionId,
    account: accountId,
    amount: difference,
    payee: payeeId,
    category: categoryId,
    date: today,
    notes: `Bank: ${(bankSaldo / 100).toFixed(2)} CHF\nActual: ${(actualBalance / 100).toFixed(2)} CHF`,
    cleared: false,
  });

  logger.info(`  Correction: ${(difference / 100).toFixed(2)} CHF booked`);

  return {
    actualBalance,
    bankSaldo,
    difference,
    correctionCreated: true,
    correctionId,
  };
}

/**
 * Calculate word-based Jaccard similarity between two strings.
 * Returns a value between 0 and 1.
 */
function calculateJaccardSimilarity(str1: string, str2: string): number {
  // Split into lowercase words, filtering out empty strings
  const words1 = new Set(
    str1
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0),
  );
  const words2 = new Set(
    str2
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0),
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  // Calculate intersection
  const intersection = new Set([...words1].filter(w => words2.has(w)));

  // Calculate union
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

const SIMILARITY_THRESHOLD = 0.5; // 50% minimum match

export async function getCategoryForPayee(
  payeeName: string,
  mapping: PayeeCategoryMapping,
): Promise<string | null> {
  if (!payeeName || !mapping) return null;

  // 1. Check exact match first (case-sensitive)
  let catKey = mapping[payeeName];

  // 2. Check exact match (case-insensitive)
  if (!catKey) {
    const payeeLower = payeeName.toLowerCase();
    for (const [mappedPayee, category] of Object.entries(mapping)) {
      if (mappedPayee.toLowerCase() === payeeLower) {
        catKey = category;
        break;
      }
    }
  }

  // 3. Find best Jaccard similarity match above threshold
  if (!catKey) {
    let bestScore = 0;
    let bestCategory: string | null = null;

    for (const [mappedPayee, category] of Object.entries(mapping)) {
      const score = calculateJaccardSimilarity(payeeName, mappedPayee);
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score;
        bestCategory = category;
      }
    }

    catKey = bestCategory;
  }

  if (!catKey) return null;

  // Parse "Group:Category" format and find category ID
  const [groupName, categoryName] = catKey.split(':');
  if (!groupName || !categoryName) return null;

  const result = await db.first<{ id: string }>(
    `SELECT c.id
     FROM categories c
     JOIN category_groups cg ON c.cat_group = cg.id
     WHERE cg.name = ? AND c.name = ? AND c.tombstone = 0`,
    [groupName, categoryName],
  );

  return result?.id ?? null;
}

async function unlinkAccount({ id }: { id: AccountEntity['id'] }) {
  const accRow = await db.first<db.DbAccount>(
    'SELECT * FROM accounts WHERE id = ?',
    [id],
  );

  if (!accRow) {
    throw new Error(`Account with ID ${id} not found.`);
  }

  const bankId = accRow.bank;

  if (!bankId) {
    return 'ok';
  }

  const isGoCardless = accRow.account_sync_source === 'goCardless';

  await db.updateAccount({
    id,
    account_id: null,
    bank: null,
    balance_current: null,
    balance_available: null,
    balance_limit: null,
    account_sync_source: null,
  });

  if (isGoCardless === false) {
    return;
  }

  const accountWithBankResult = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts WHERE bank = ?',
    [bankId],
  );

  // No more accounts are associated with this bank. We can remove
  // it from GoCardless.
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return 'ok';
  }

  if (!accountWithBankResult || accountWithBankResult.count === 0) {
    const bank = await db.first<Pick<db.DbBank, 'bank_id'>>(
      'SELECT bank_id FROM banks WHERE id = ?',
      [bankId],
    );

    if (!bank) {
      throw new Error(`Bank with ID ${bankId} not found.`);
    }

    const serverConfig = getServer();
    if (!serverConfig) {
      throw new Error('Failed to get server config.');
    }

    const requisitionId = bank.bank_id;

    try {
      await post(
        serverConfig.GOCARDLESS_SERVER + '/remove-account',
        {
          requisitionId,
        },
        {
          'X-ACTUAL-TOKEN': userToken,
        },
      );
    } catch (error) {
      logger.log({ error });
    }
  }

  return 'ok';
}

export const app = createApp<AccountHandlers>();

app.method('account-update', mutator(undoable(updateAccount)));
app.method('accounts-get', getAccounts);
app.method('account-balance', getAccountBalance);
app.method('account-properties', getAccountProperties);
app.method('gocardless-accounts-link', linkGoCardlessAccount);
app.method('simplefin-accounts-link', linkSimpleFinAccount);
app.method('pluggyai-accounts-link', linkPluggyAiAccount);
app.method('account-create', mutator(undoable(createAccount)));
app.method('account-close', mutator(closeAccount));
app.method('account-reopen', mutator(undoable(reopenAccount)));
app.method('account-move', mutator(undoable(moveAccount)));
app.method('secret-set', setSecret);
app.method('secret-check', checkSecret);
app.method('gocardless-poll-web-token', pollGoCardlessWebToken);
app.method('gocardless-poll-web-token-stop', stopGoCardlessWebTokenPolling);
app.method('gocardless-status', goCardlessStatus);
app.method('simplefin-status', simpleFinStatus);
app.method('pluggyai-status', pluggyAiStatus);
app.method('simplefin-accounts', simpleFinAccounts);
app.method('pluggyai-accounts', pluggyAiAccounts);
app.method('gocardless-get-banks', getGoCardlessBanks);
app.method('gocardless-create-web-token', createGoCardlessWebToken);
app.method('accounts-bank-sync', accountsBankSync);
app.method('simplefin-batch-sync', simpleFinBatchSync);
app.method('transactions-import', mutator(undoable(importTransactions)));
app.method(
  'transactions-import-revolut',
  mutator(undoable(importRevolutTransactions)),
);
app.method(
  'transactions-import-migros',
  mutator(undoable(importMigrosTransactions)),
);
app.method('account-unlink', mutator(unlinkAccount));
// Swiss bank import features
app.method('swiss-bank-get-import-settings', getImportSettings);
app.method('swiss-bank-save-import-settings', saveImportSettings);
app.method('swiss-bank-get-payee-mapping', getSwissBankPayeeMapping);
app.method('swiss-bank-save-payee-mapping', saveSwissBankPayeeMapping);
app.method('swiss-bank-learn-categories', learnCategoriesFromTransactions);
app.method(
  'swiss-bank-balance-check',
  mutator(undoable(checkAndCorrectBalance)),
);
