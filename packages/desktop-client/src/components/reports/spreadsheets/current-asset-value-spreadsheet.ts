import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';
import {
  type AccountEntity,
  type RuleConditionEntity,
} from 'loot-core/types/models';

import { type useSpreadsheet } from '@desktop-client/hooks/useSpreadsheet';
import { aqlQuery } from '@desktop-client/queries/aqlQuery';

export type CurrentAssetValueAccountData = {
  id: string;
  name: string;
  balance: number;
};

export type CurrentAssetValueGroupData = {
  id: string;
  name: string;
  balance: number;
  accounts: CurrentAssetValueAccountData[];
};

export type CurrentAssetValueData = {
  groups: CurrentAssetValueGroupData[];
  totalBalance: number;
  date: string;
};

type CreateCurrentAssetValueSpreadsheetProps = {
  date: string;
  accounts: AccountEntity[];
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
};

export function createCurrentAssetValueSpreadsheet({
  date,
  accounts,
  conditions = [],
  conditionsOp = 'and',
}: CreateCurrentAssetValueSpreadsheetProps) {
  return async (
    spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: CurrentAssetValueData) => void,
  ) => {
    const { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });

    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    // Filter out closed accounts
    const activeAccounts = accounts.filter(acc => !acc.closed);

    // Query balance for each account up to the specified date
    const accountBalances = await Promise.all(
      activeAccounts.map(async account => {
        const balance = await aqlQuery(
          q('transactions')
            .filter({
              [conditionsOpKey]: filters,
              account: account.id,
              date: { $lte: date },
            })
            .calculate({ $sum: '$amount' }),
        ).then(({ data }) => data || 0);

        return {
          id: account.id,
          name: account.name,
          balance: balance as number,
          offbudget: account.offbudget,
        };
      }),
    );

    // Group accounts by on-budget vs off-budget
    const budgetAccounts = accountBalances.filter(acc => !acc.offbudget);
    const offbudgetAccounts = accountBalances.filter(acc => acc.offbudget);

    const groups: CurrentAssetValueGroupData[] = [];

    if (budgetAccounts.length > 0) {
      const budgetBalance = budgetAccounts.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      );
      groups.push({
        id: 'budget',
        name: 'Budget Accounts',
        balance: budgetBalance,
        accounts: budgetAccounts.map(({ id, name, balance }) => ({
          id,
          name,
          balance,
        })),
      });
    }

    if (offbudgetAccounts.length > 0) {
      const offbudgetBalance = offbudgetAccounts.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      );
      groups.push({
        id: 'offbudget',
        name: 'Off-Budget Accounts',
        balance: offbudgetBalance,
        accounts: offbudgetAccounts.map(({ id, name, balance }) => ({
          id,
          name,
          balance,
        })),
      });
    }

    const totalBalance = accountBalances.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );

    setData({
      groups,
      totalBalance,
      date,
    });
  };
}
