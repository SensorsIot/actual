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

export type MonthlyBudgetActual = {
  budgeted: number;
  actual: number;
};

export type BudgetVsActualCategoryData = {
  id: string;
  name: string;
  monthlyData: Record<string, MonthlyBudgetActual>; // month (YYYY-MM) -> data
  budgeted: number;
  actual: number;
  variance: number;
};

export type BudgetVsActualGroupData = {
  id: string;
  name: string;
  monthlyData: Record<string, MonthlyBudgetActual>; // month (YYYY-MM) -> data
  budgeted: number;
  actual: number;
  variance: number;
  categories: BudgetVsActualCategoryData[];
};

export type BudgetVsActualData = {
  groups: BudgetVsActualGroupData[];
  months: string[]; // Array of months in YYYY-MM format
  totalMonthlyData: Record<string, MonthlyBudgetActual>; // month (YYYY-MM) -> data
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

    // Generate list of months between startDate and endDate
    const months: string[] = [];
    let currentMonth = monthUtils.getMonth(startDate);
    const lastMonth = monthUtils.getMonth(endDate);
    while (currentMonth <= lastMonth) {
      months.push(currentMonth);
      currentMonth = monthUtils.addMonths(currentMonth, 1);
    }

    // Convert dates to month numbers (YYYYMM format) for budget query
    const startMonthInt = parseInt(
      monthUtils.getMonth(startDate).replace('-', ''),
    );
    const endMonthInt = parseInt(monthUtils.getMonth(endDate).replace('-', ''));

    // Query budget data - get per-month data (not aggregated)
    const budgetQuery = q('zero_budgets')
      .filter({
        $and: [
          { month: { $gte: startMonthInt } },
          { month: { $lte: endMonthInt } },
        ],
      })
      .filter(
        categoryFilters.length > 0
          ? { [conditionsOpKey]: categoryFilters }
          : {},
      )
      .select(['category', 'month', 'amount']);

    // Query actual spending per month (expenses only - negative amounts)
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
      .groupBy([{ $id: '$category' }, { $month: '$date' }])
      .select([
        { category: { $id: '$category.id' } },
        { month: { $month: '$date' } },
        { amount: { $sum: '$amount' } },
      ]);

    const [budgetResult, actualResult] = await Promise.all([
      aqlQuery(budgetQuery).then(({ data }) => data),
      aqlQuery(actualQuery).then(({ data }) => data),
    ]);

    // Create nested maps: category -> month -> amount
    const budgetMap = new Map<string, Map<string, number>>();
    for (const item of budgetResult) {
      if (item.category) {
        if (!budgetMap.has(item.category)) {
          budgetMap.set(item.category, new Map());
        }
        // Convert YYYYMM to YYYY-MM
        const monthStr = String(item.month);
        const formattedMonth = `${monthStr.slice(0, 4)}-${monthStr.slice(4)}`;
        budgetMap.get(item.category)!.set(formattedMonth, item.amount || 0);
      }
    }

    const actualMap = new Map<string, Map<string, number>>();
    for (const item of actualResult) {
      if (item.category) {
        if (!actualMap.has(item.category)) {
          actualMap.set(item.category, new Map());
        }
        // Actual spending is negative, so we'll use absolute value
        actualMap
          .get(item.category)!
          .set(item.month, Math.abs(item.amount || 0));
      }
    }

    // Build grouped data structure
    const groups: BudgetVsActualGroupData[] = [];
    let totalBudgeted = 0;
    let totalActual = 0;
    const totalMonthlyData: Record<string, MonthlyBudgetActual> = {};

    // Initialize total monthly data
    for (const month of months) {
      totalMonthlyData[month] = { budgeted: 0, actual: 0 };
    }

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
      const groupMonthlyData: Record<string, MonthlyBudgetActual> = {};

      // Initialize group monthly data
      for (const month of months) {
        groupMonthlyData[month] = { budgeted: 0, actual: 0 };
      }

      const categoryList = group.categories || [];
      for (const category of categoryList) {
        // Skip hidden categories unless showHiddenCategories is true
        if (category.hidden && !showHiddenCategories) {
          continue;
        }

        const categoryBudgetMap = budgetMap.get(category.id);
        const categoryActualMap = actualMap.get(category.id);

        const categoryMonthlyData: Record<string, MonthlyBudgetActual> = {};
        let categoryBudgeted = 0;
        let categoryActual = 0;

        for (const month of months) {
          const budgeted = categoryBudgetMap?.get(month) || 0;
          const actual = categoryActualMap?.get(month) || 0;

          categoryMonthlyData[month] = { budgeted, actual };
          categoryBudgeted += budgeted;
          categoryActual += actual;

          // Accumulate to group
          groupMonthlyData[month].budgeted += budgeted;
          groupMonthlyData[month].actual += actual;
        }

        const variance = categoryBudgeted - categoryActual;

        groupCategories.push({
          id: category.id,
          name: category.name,
          monthlyData: categoryMonthlyData,
          budgeted: categoryBudgeted,
          actual: categoryActual,
          variance,
        });

        groupBudgeted += categoryBudgeted;
        groupActual += categoryActual;
      }

      // Only include groups that have categories
      if (groupCategories.length > 0) {
        groups.push({
          id: group.id,
          name: group.name,
          monthlyData: groupMonthlyData,
          budgeted: groupBudgeted,
          actual: groupActual,
          variance: groupBudgeted - groupActual,
          categories: groupCategories,
        });

        totalBudgeted += groupBudgeted;
        totalActual += groupActual;

        // Accumulate to total monthly data
        for (const month of months) {
          totalMonthlyData[month].budgeted += groupMonthlyData[month].budgeted;
          totalMonthlyData[month].actual += groupMonthlyData[month].actual;
        }
      }
    }

    setData({
      groups,
      months,
      totalMonthlyData,
      totalBudgeted,
      totalActual,
      totalVariance: totalBudgeted - totalActual,
      startDate,
      endDate,
    });
  };
}
