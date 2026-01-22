import { q } from 'loot-core/shared/query';
import {
  type CategoryEntity,
  type CategoryGroupEntity,
} from 'loot-core/types/models';

import { aqlQuery } from '@desktop-client/queries/aqlQuery';

export type YearlyBudgetCategoryData = {
  id: string;
  name: string;
  hidden: boolean;
  isIncome: boolean;
  lastYearAmount: number;
  monthBudgets: Record<string, number>; // month (YYYY-MM) -> amount
};

export type YearlyBudgetGroupData = {
  id: string;
  name: string;
  hidden: boolean;
  isIncome: boolean;
  categories: YearlyBudgetCategoryData[];
};

export type YearlyBudgetPlannerData = {
  incomeGroups: YearlyBudgetGroupData[];
  expenseGroups: YearlyBudgetGroupData[];
  year: number;
  months: string[]; // Array of months in YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  lastYearTotalIncome: number;
  lastYearTotalExpenses: number;
  lastYearNetAmount: number;
};

type LoadYearlyBudgetPlannerDataProps = {
  year: number;
  categories: {
    list: CategoryEntity[];
    grouped: CategoryGroupEntity[];
  };
  showHiddenCategories?: boolean;
};

export async function loadYearlyBudgetPlannerData({
  year,
  categories,
  showHiddenCategories = false,
}: LoadYearlyBudgetPlannerDataProps): Promise<YearlyBudgetPlannerData> {
  // Generate months for the year
  const months: string[] = [];
  for (let month = 1; month <= 12; month++) {
    months.push(`${year}-${month.toString().padStart(2, '0')}`);
  }

  // Convert to YYYYMM format for budget query
  const startMonth = parseInt(`${year}01`);
  const endMonth = parseInt(`${year}12`);

  // Last year date range
  const lastYear = year - 1;
  const lastYearStart = `${lastYear}-01-01`;
  const lastYearEnd = `${lastYear}-12-31`;

  // Query budget data for the selected year
  const budgetQuery = q('zero_budgets')
    .filter({
      $and: [{ month: { $gte: startMonth } }, { month: { $lte: endMonth } }],
    })
    .select(['category', 'month', 'amount']);

  const budgetResult = await aqlQuery(budgetQuery);
  const budgetData = budgetResult.data || [];

  // Query last year's actual amounts (all transactions)
  const lastYearQuery = q('transactions')
    .filter({
      $and: [
        { date: { $gte: lastYearStart } },
        { date: { $lte: lastYearEnd } },
        { 'category.id': { $ne: null } },
      ],
    })
    .groupBy(['category'])
    .select([{ category: 'category' }, { amount: { $sum: '$amount' } }]);

  const lastYearResult = await aqlQuery(lastYearQuery);
  const lastYearData = lastYearResult.data || [];

  // Build a set of income category IDs for quick lookup
  const incomeCategoryIds = new Set<string>();
  for (const group of categories.grouped) {
    if (group.is_income) {
      for (const cat of group.categories || []) {
        incomeCategoryIds.add(cat.id);
      }
    }
  }

  // Create a map of category -> month -> amount for budgets
  // Transform for display: Income negated, Expense kept
  const budgetMap = new Map<string, Map<string, number>>();
  for (const item of budgetData) {
    if (item.category) {
      if (!budgetMap.has(item.category)) {
        budgetMap.set(item.category, new Map());
      }
      // Convert YYYYMM to YYYY-MM
      const monthStr = String(item.month);
      const formattedMonth = `${monthStr.slice(0, 4)}-${monthStr.slice(4)}`;
      const isIncome = incomeCategoryIds.has(item.category);
      const amount = item.amount || 0;
      // Income: negate (stored negative → display positive)
      // Expense: keep (stored positive → display positive)
      const displayAmount = isIncome ? -amount : amount;
      budgetMap.get(item.category)!.set(formattedMonth, displayAmount);
    }
  }

  // Create a map of category -> last year amount
  // Transform for display: Income kept, Expense negated
  const lastYearMap = new Map<string, number>();
  for (const item of lastYearData) {
    if (item.category) {
      const isIncome = incomeCategoryIds.has(item.category);
      const amount = item.amount || 0;
      // Income: keep (stored positive → display positive)
      // Expense: negate (stored negative → display positive)
      const displayAmount = isIncome ? amount : -amount;
      lastYearMap.set(item.category, displayAmount);
    }
  }

  // Build grouped data structure
  const incomeGroups: YearlyBudgetGroupData[] = [];
  const expenseGroups: YearlyBudgetGroupData[] = [];

  let totalIncome = 0;
  let totalExpenses = 0;
  let lastYearTotalIncome = 0;
  let lastYearTotalExpenses = 0;

  for (const group of categories.grouped) {
    // Skip hidden groups unless showHiddenCategories is true
    if (group.hidden && !showHiddenCategories) {
      continue;
    }

    const isIncome = group.is_income || false;
    const groupCategories: YearlyBudgetCategoryData[] = [];

    const categoryList = group.categories || [];
    for (const category of categoryList) {
      // Skip hidden categories unless showHiddenCategories is true
      if (category.hidden && !showHiddenCategories) {
        continue;
      }

      const categoryMonthBudgets: Record<string, number> = {};
      const categoryBudgetMap = budgetMap.get(category.id);

      let categoryTotal = 0;
      for (const month of months) {
        const amount = categoryBudgetMap?.get(month) || 0;
        categoryMonthBudgets[month] = amount;
        categoryTotal += amount;
      }

      const lastYearAmount = lastYearMap.get(category.id) || 0;

      groupCategories.push({
        id: category.id,
        name: category.name,
        hidden: category.hidden || false,
        isIncome,
        lastYearAmount,
        monthBudgets: categoryMonthBudgets,
      });

      // Accumulate totals
      if (isIncome) {
        totalIncome += categoryTotal;
        lastYearTotalIncome += lastYearAmount;
      } else {
        totalExpenses += categoryTotal;
        lastYearTotalExpenses += lastYearAmount;
      }
    }

    if (groupCategories.length > 0) {
      const groupData: YearlyBudgetGroupData = {
        id: group.id,
        name: group.name,
        hidden: group.hidden || false,
        isIncome,
        categories: groupCategories,
      };

      if (isIncome) {
        incomeGroups.push(groupData);
      } else {
        expenseGroups.push(groupData);
      }
    }
  }

  return {
    incomeGroups,
    expenseGroups,
    year,
    months,
    totalIncome,
    totalExpenses,
    netAmount: totalIncome - totalExpenses,
    lastYearTotalIncome,
    lastYearTotalExpenses,
    lastYearNetAmount: lastYearTotalIncome - lastYearTotalExpenses,
  };
}
