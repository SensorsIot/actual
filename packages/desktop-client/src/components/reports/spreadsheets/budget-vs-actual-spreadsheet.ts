import { send } from 'loot-core/platform/client/fetch';
import * as monthUtils from 'loot-core/shared/months';
import { q } from 'loot-core/shared/query';
import {
  type CategoryEntity,
  type CategoryGroupEntity,
  type RuleConditionEntity,
} from 'loot-core/types/models';

import { type useSpreadsheet } from '@desktop-client/hooks/useSpreadsheet';
import { aqlQuery } from '@desktop-client/queries/aqlQuery';

export type BudgetVsActualCategoryData = {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
};

export type BudgetVsActualGroupData = {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
  categories: BudgetVsActualCategoryData[];
};

export type BudgetVsActualData = {
  groups: BudgetVsActualGroupData[];
  totalBudgeted: number;
  totalActual: number;
  totalVariance: number;
  startDate: string;
  endDate: string;
};

type CreateBudgetVsActualSpreadsheetProps = {
  startDate: string;
  endDate: string;
  categories: {
    list: CategoryEntity[];
    grouped: CategoryGroupEntity[];
  };
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
  showHiddenCategories?: boolean;
};

export function createBudgetVsActualSpreadsheet({
  startDate,
  endDate,
  categories,
  conditions = [],
  conditionsOp = 'and',
  showHiddenCategories = false,
}: CreateBudgetVsActualSpreadsheetProps) {
  return async (
    spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: BudgetVsActualData) => void,
  ) => {
    const { filters: categoryFilters } = await send(
      'make-filters-from-conditions',
      {
        conditions: conditions.filter(
          cond => !cond.customName && cond.field === 'category',
        ),
        applySpecialCases: false,
      },
    );

    const { filters: transactionFilters } = await send(
      'make-filters-from-conditions',
      {
        conditions: conditions.filter(cond => !cond.customName),
      },
    );

    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    // Convert dates to month numbers (YYYYMM format) for budget query
    const startMonth = parseInt(
      monthUtils.getMonth(startDate).replace('-', ''),
    );
    const endMonth = parseInt(monthUtils.getMonth(endDate).replace('-', ''));

    // Query budget data - sum budget amounts across the date range
    const budgetQuery = q('zero_budgets')
      .filter({
        $and: [{ month: { $gte: startMonth } }, { month: { $lte: endMonth } }],
      })
      .filter(
        categoryFilters.length > 0
          ? { [conditionsOpKey]: categoryFilters }
          : {},
      )
      .groupBy([{ $id: '$category' }])
      .select([
        { category: { $id: '$category' } },
        { amount: { $sum: '$amount' } },
      ]);

    // Query actual spending (expenses only - negative amounts)
    const actualQuery = q('transactions')
      .filter({
        $and: [
          { date: { $transform: '$month', $gte: startDate } },
          { date: { $transform: '$month', $lte: endDate } },
          { amount: { $lt: 0 } },
        ],
      })
      .filter(
        transactionFilters.length > 0
          ? { [conditionsOpKey]: transactionFilters }
          : {},
      )
      .filter({ 'account.offbudget': false })
      .groupBy([{ $id: '$category' }])
      .select([
        { category: { $id: '$category.id' } },
        { amount: { $sum: '$amount' } },
      ]);

    const [budgetResult, actualResult] = await Promise.all([
      aqlQuery(budgetQuery).then(({ data }) => data),
      aqlQuery(actualQuery).then(({ data }) => data),
    ]);

    // Create maps for easy lookup
    const budgetMap = new Map<string, number>();
    for (const item of budgetResult) {
      if (item.category) {
        budgetMap.set(item.category, item.amount || 0);
      }
    }

    const actualMap = new Map<string, number>();
    for (const item of actualResult) {
      if (item.category) {
        // Actual spending is negative, so we'll use absolute value
        actualMap.set(item.category, Math.abs(item.amount || 0));
      }
    }

    // Build grouped data structure
    const groups: BudgetVsActualGroupData[] = [];
    let totalBudgeted = 0;
    let totalActual = 0;

    for (const group of categories.grouped) {
      // Skip hidden groups unless showHiddenCategories is true
      if (group.hidden && !showHiddenCategories) {
        continue;
      }

      // Skip income groups
      if (group.is_income) {
        continue;
      }

      const groupCategories: BudgetVsActualCategoryData[] = [];
      let groupBudgeted = 0;
      let groupActual = 0;

      const categoryList = group.categories || [];
      for (const category of categoryList) {
        // Skip hidden categories unless showHiddenCategories is true
        if (category.hidden && !showHiddenCategories) {
          continue;
        }

        const budgeted = budgetMap.get(category.id) || 0;
        const actual = actualMap.get(category.id) || 0;
        const variance = budgeted - actual;

        groupCategories.push({
          id: category.id,
          name: category.name,
          budgeted,
          actual,
          variance,
        });

        groupBudgeted += budgeted;
        groupActual += actual;
      }

      // Only include groups that have categories with data or budget
      if (groupCategories.length > 0) {
        groups.push({
          id: group.id,
          name: group.name,
          budgeted: groupBudgeted,
          actual: groupActual,
          variance: groupBudgeted - groupActual,
          categories: groupCategories,
        });

        totalBudgeted += groupBudgeted;
        totalActual += groupActual;
      }
    }

    setData({
      groups,
      totalBudgeted,
      totalActual,
      totalVariance: totalBudgeted - totalActual,
      startDate,
      endDate,
    });
  };
}
