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
  isIncome: boolean;
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
  showIncomeCategories?: boolean;
};

export function createBudgetVsActualSpreadsheet({
  startDate,
  endDate,
  categories,
  conditions = [],
  conditionsOp = 'and',
  showHiddenCategories = false,
  showIncomeCategories = false,
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
    const budgetQuery = q('reflect_budgets')
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

    // Query actual spending/income per month
    // For expenses: negative amounts, for income: positive amounts
    const actualQuery = q('transactions')
      .filter({
        $and: [
          { date: { $transform: '$month', $gte: startDate } },
          { date: { $transform: '$month', $lte: endDate } },
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
    // Tracking budget (reflect_budgets): all budgets stored as positive
    // Transactions: income positive, expenses negative
    // No sign transformations needed
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
        actualMap.get(item.category)!.set(item.month, item.amount || 0);
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

      // Skip income groups unless showIncomeCategories is true
      if (group.is_income && !showIncomeCategories) {
        continue;
      }

      const isIncomeGroup = group.is_income;

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

        // Variance: positive = good, negative = bad
        // Income: actual - budget (earned more than expected = good)
        // Expense: budget + actual (actual is negative, so remaining budget)
        const variance = isIncomeGroup
          ? categoryActual - categoryBudgeted
          : categoryBudgeted + categoryActual;

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
        const groupVariance = isIncomeGroup
          ? groupActual - groupBudgeted
          : groupBudgeted + groupActual;

        groups.push({
          id: group.id,
          name: group.name,
          isIncome: isIncomeGroup,
          monthlyData: groupMonthlyData,
          budgeted: groupBudgeted,
          actual: groupActual,
          variance: groupVariance,
          categories: groupCategories,
        });

        // Net totals: income budget adds, expense budget subtracts
        // Actuals already have correct signs (income +, expense -)
        if (isIncomeGroup) {
          totalBudgeted += groupBudgeted;
        } else {
          totalBudgeted -= groupBudgeted;
        }
        totalActual += groupActual;

        for (const month of months) {
          if (isIncomeGroup) {
            totalMonthlyData[month].budgeted += groupMonthlyData[month].budgeted;
          } else {
            totalMonthlyData[month].budgeted -= groupMonthlyData[month].budgeted;
          }
          totalMonthlyData[month].actual += groupMonthlyData[month].actual;
        }
      }
    }

    // Total variance = Actual - Budget
    const totalVariance = totalActual - totalBudgeted;

    setData({
      groups,
      months,
      totalMonthlyData,
      totalBudgeted,
      totalActual,
      totalVariance,
      startDate,
      endDate,
    });
  };
}
