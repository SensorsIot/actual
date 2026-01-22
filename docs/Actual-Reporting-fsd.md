# Actual Reporting - Functional Specification

## Overview

This document specifies reporting behavior for Actual Budget. Each report has its own chapter so new reports can be added without restructuring the document.

Supported reports:
- Budget vs Actual (implemented)
- Current Asset Value (implemented)
- Yearly Budget Planner (planned)

Report types:
- Dashboard widgets
- Full report pages

## Shared Report Behavior

### Entry points and navigation

- Reports sidebar list
- Dashboard widgets (add via the + menu)
- Direct URLs to specific reports
  - `/reports/current-asset-value`

### Date range and time frame

- Date range selection via the report header
- Time frame handling shared across reports

### Filters and visibility

- Condition filters (account, payee, etc.)
- Hidden category handling
- Category filters apply to both budget and actual amounts

### Widget vs full report

- Widget preview behavior
- Full report behavior

### Loading and empty states

- Loading indicator while data fetches
- Empty state when no data is available

## Report: Budget vs Actual

### User flow

- Add widget to the dashboard from Reports, then the + menu
- Click the widget to open the full report
- Navigate directly via `/reports/budget-vs-actual` or `/reports/budget-vs-actual/:id`

### Data inputs

- Budgeted amounts by category for the selected month range
- Actual spending from transactions (expenses only)
- Filters apply to both budget and actual queries
- Respects show hidden categories setting

### Grouping and totals

- Categories grouped under category groups
- Subtotals per group and grand totals

### Variance rules

- Variance = budgeted - abs(actual)
- Color rules:
  - Under budget: `theme.noticeTextLight`
  - Over budget: `theme.errorText`

### Table layout

Two-row header structure:
- First row: Category | Month names (centered over Bud/Act pairs) | Total (centered over summary columns)
- Second row: (empty) | Bud | Act (per month) | Bud | Act | Var | %

Columns:
- **Category**: Category name (grouped under category groups)
- **Monthly columns** (up to 12 months based on date range):
  - Per month: Budgeted and Actual amounts
  - Month name appears above the Bud/Act pair
  - Vertical separator lines between months for readability
  - Actual amounts are clickable to drill down into transactions
- **Total section**:
  - Total Budgeted (sum across all months)
  - Total Actual (sum across all months, clickable to drill down)
  - Variance (budgeted - actual)
  - % (percentage variance, hidden in compact mode)

Table features:
- Collapsible category groups (click to expand/collapse)
- Group subtotal rows and grand total row
- Group rows use bold styling
- **Transactions drilldown**: Click any actual amount to open a modal showing the underlying transactions

### Widget behavior

- Compact summary of totals
- Preview of first four category groups
- Context menu actions (rename, remove, copy)
- Color-coded variance summary
- Click to navigate to the full report
- Supports saving widget settings

## Report: Current Asset Value

### User flow

- Add widget to dashboard
- Click widget to open full report
- Navigate directly via `/reports/current-asset-value` or `/reports/current-asset-value/:id`

### Data inputs

- Account balances as of the selected date
- Excludes closed accounts
- Includes negative balances to compute net worth

### Grouping and totals

- Accounts grouped by Budget Accounts vs Off-Budget Accounts
- Subtotals per group and a grand total (net worth)

### Table or chart layout

- Table layout only (no chart)
- Columns: Account/Group, Balance

### Widget behavior

- Compact table preview
- Click to navigate to full report
- Context menu actions (rename, remove, copy)

### Saved Reports

- Users can save the current report configuration with a custom name
- Saved reports are stored in browser localStorage
- A dropdown allows selecting and loading previously saved reports
- Delete button removes saved reports
- Saved reports persist across sessions (browser-local)

### Notes

- Date selection supports named snapshots (e.g., "Today", "2025") and stores the chosen date/name
- Optional filters can be supported but are not required for the core flow

## Report: Yearly Budget Planner

### Purpose

A planning tool that allows users to establish budget amounts for all categories (income and expense) across all 12 months of a selected year. The monthly budget values are the actual data stored and used by reports. Helper columns (Yearly Budget, Distribute) assist with planning but are not persisted. Shows a net gain/deficit summary.

### User flow

- Navigate directly via `/reports/yearly-budget-planner`
- No dashboard widget (this is a planning tool, not a report widget)
- Access via Reports sidebar

### Year selection

- Year selector with left/right navigation arrows
- "Current Year" button to jump to current year
- Default: current year on initial load
- Can plan budgets for any year (past, current, or future)
- **Immediate load**: When year changes, immediately load:
  - Budgets stored for the selected year (Jan–Dec columns)
  - "Last Year" column shows actuals from (selected year - 1)
- Unsaved changes warning if navigating away with pending edits

### Data inputs

- All categories (both income and expense, grouped by category group)
- Budget amounts from `zero_budgets` table for the selected year
- Previous year's actual amounts per category (from transactions)
- Respects show hidden categories setting

### Table layout

| Category | Last Year | Yearly Budget | Distribute | Jan | Feb | ... | Dec | Total |
|----------|-----------|---------------|------------|-----|-----|-----|-----|-------|
| **Income** |
| Salary | 60,000 | [input] | [button] | [input] | [input] | ... | [input] | 60,000 |
| **Expenses** |
| Groceries | -12,000 | [input] | [button] | [input] | [input] | ... | [input] | -12,000 |
| Rent | -18,000 | [input] | [button] | [input] | [input] | ... | [input] | -18,000 |
| **Totals** |
| Total Income | 60,000 | | | | | ... | | 60,000 |
| Total Expenses | -30,000 | | | | | ... | | -30,000 |
| **Net (Gain/Deficit)** | **30,000** | | | | | ... | | **30,000** |

Column details:
- **Category**: Category name (grouped under category groups)
- **Last Year**: Read-only. Actual amounts from previous year (income positive, expenses negative)
- **Yearly Budget**: Input field. Helper for distribution (not persisted)
- **Distribute**: Button. Divides "Yearly Budget" evenly across 12 months
- **Jan–Dec**: Input fields. The actual budget values that get saved
- **Total**: Read-only. Sum of Jan–Dec. Updates immediately when any month changes

Column widths:
- Category: 180px
- Last Year: 90px
- Yearly Budget: 100px
- Distribute: 80px
- Month columns: 75px each
- Total: 90px

### Editing behavior

- Click on any month cell or yearly budget cell to edit
- Amount format: currency input (e.g., "150.00" or "150")
- Total column updates immediately when any month value changes
- Changes are held in memory until user clicks "Save"

### Distribute button

- Takes the value from "Yearly Budget" input
- Divides by 12 (handles rounding: first months get the remainder)
- Fills all 12 month columns with the distributed values
- Example: 1000 → 84, 84, 84, 84, 83, 83, 83, 83, 83, 83, 83, 83

### Save behavior

- "Save" button in the header/toolbar
- Saves all modified month values to the database
- Uses `budget/budget-amount` API for each changed category/month
- Shows success confirmation after save
- Unsaved changes indicator (e.g., asterisk in title or warning on navigation)

### Grouping and totals

- Categories grouped under category groups
- Income groups shown first, then expense groups
- Group rows show:
  - Last Year sum for the group
  - Monthly sums for the group (read-only)
  - Total sum for the group
- Summary section at bottom:
  - **Total Income**: Sum of all income categories
  - **Total Expenses**: Sum of all expense categories
  - **Net (Gain/Deficit)**: Total Income + Total Expenses (positive = gain, negative = deficit)
- Net row uses color coding:
  - Green for gain (positive)
  - Red for deficit (negative)

### Visual design

- Collapsible category groups (click group row to expand/collapse)
- All groups expanded by default
- Group rows use bold styling with header background
- Total row uses bold styling with header background and top border
- Modified cells show visual indicator (e.g., background color) until saved

### Hidden categories

- Toggle button: "Show hidden categories" / "Hide hidden categories"
- When hidden, categories marked as hidden are excluded
- Hidden category groups are also excluded when all their categories are hidden

### No widget

- This is a planning/editing tool, not a dashboard widget
- Full page only

### Notes

- All categories included (both income and expense)
- "Yearly Budget" and "Distribute" are helper tools, not persisted data
- Only the 12 month columns contain the actual budget data
- Reports (Budget vs Actual) should compare actuals against budgets from the same year

## Appendix A - Data Models and Types

### Budget vs Actual
- `MonthlyBudgetActual`: budgeted, actual
- `BudgetVsActualCategoryData`: id, name, monthlyData (Record<month, MonthlyBudgetActual>), budgeted, actual, variance
- `BudgetVsActualGroupData`: id, name, monthlyData (Record<month, MonthlyBudgetActual>), budgeted, actual, variance, categories
- `BudgetVsActualData`: groups, months (string[]), totalMonthlyData (Record<month, MonthlyBudgetActual>), totalBudgeted, totalActual, totalVariance, startDate, endDate
- `BudgetVsActualWidget`: name, conditions, conditionsOp, timeFrame, showHiddenCategories

### Transactions Drilldown Modal
- Modal name: `transactions-drilldown`
- Options: categoryId, categoryName, month (optional), startDate, endDate
- Displays: Date, Payee, Category, Notes, Amount columns with total row
- Query: Transactions filtered by category and date range
- **Category editing**: Click category column to change transaction's category
  - Opens `category-autocomplete` modal for selection
  - Transaction removed from list after change (no longer in this category)
  - Total updates automatically
  - Uses `transaction-update` API to persist change

### Current Asset Value
- `CurrentAssetValueAccountData`: id, name, balance
- `CurrentAssetValueGroupData`: id, name, balance, accounts
- `CurrentAssetValueData`: groups, totalBalance, date
- `CurrentAssetValueWidget`: name, conditions, conditionsOp, date

### Yearly Budget Planner
- `YearlyBudgetCategoryData`: id, name, hidden, isIncome, lastYearAmount, yearlyBudgetInput (helper, not persisted), monthBudgets (Record<month, amount>)
- `YearlyBudgetGroupData`: id, name, hidden, isIncome, categories
- `YearlyBudgetPlannerData`: groups, year, hasUnsavedChanges, totalIncome, totalExpenses, netAmount

## Appendix B - Query and Calculation Logic

- Budget vs Actual queries
  - Budgets (zero_budgets), per month per category across the month range
  - Transactions (expenses only), per month per category across the date range
  - Monthly data aggregated to group and total levels
  - Variance = budgeted - abs(actual)
  - Month format uses YYYYMM integers derived from the selected dates
- Current Asset Value queries
  - For each active (non-closed) account, sum all transactions up to selected date
  - Group accounts by offbudget field (Budget Accounts vs Off-Budget Accounts)
  - Calculate net worth as sum of all account balances

Schema reference:
- `zero_budgets`: envelope budgeting
- `reflect_budgets`: tracking budgeting (same schema as zero_budgets)

Budget query (per month):
```typescript
q('zero_budgets')
  .filter({
    $and: [
      { month: { $gte: startMonth } },
      { month: { $lte: endMonth } },
    ],
  })
  .select(['category', 'month', 'amount']);
```

Transaction query (per month):
```typescript
q('transactions')
  .filter({
    $and: [
      { date: { $transform: '$month', $gte: startDate } },
      { date: { $transform: '$month', $lte: endDate } },
      { amount: { $lt: 0 } },
    ],
  })
  .filter({ 'account.offbudget': false })
  .groupBy([{ $id: '$category' }, { $month: '$date' }])
  .select([
    { category: { $id: '$category.id' } },
    { month: { $month: '$date' } },
    { amount: { $sum: '$amount' } },
  ]);
```

Current Asset Value query (per account):
```typescript
q('transactions')
  .filter({
    [conditionsOpKey]: filters,
    account: accountId,
    date: { $lte: selectedDate },
  })
  .calculate({ $sum: '$amount' });
```

Yearly Budget Planner queries:

Current year budgets:
```typescript
q('zero_budgets')
  .filter({
    $and: [
      { month: { $gte: currentYearStart } },  // e.g., 202601
      { month: { $lte: currentYearEnd } },    // e.g., 202612
    ],
  })
  .select(['category', 'month', 'amount']);
```

Last year amounts (per category, all transactions):
```typescript
q('transactions')
  .filter({
    $and: [
      { date: { $gte: lastYearStart } },  // e.g., '2025-01-01'
      { date: { $lte: lastYearEnd } },    // e.g., '2025-12-31'
    ],
  })
  .groupBy([{ $id: '$category' }])
  .select([
    { category: { $id: '$category' } },
    { amount: { $sum: '$amount' } },      // positive = income, negative = expense
  ]);
```

Budget save API:
```typescript
send('budget/budget-amount', {
  month: 'YYYY-MM',      // e.g., '2025-03'
  category: categoryId,
  amount: amountInCents, // integer
});
```

## Appendix C - Routing and Integration

- Report routes
  - `/reports/budget-vs-actual`
  - `/reports/budget-vs-actual/:id`
  - `/reports/current-asset-value`
  - `/reports/current-asset-value/:id`
  - `/reports/yearly-budget-planner`
- Dashboard overview integration (widget menu item and card rendering)

## Appendix D - Implementation Files

### Budget vs Actual
| Component | File Path |
|-----------|-----------|
| Full report page | `packages/desktop-client/src/components/reports/reports/BudgetVsActual.tsx` |
| Widget card | `packages/desktop-client/src/components/reports/reports/BudgetVsActualCard.tsx` |
| Table component | `packages/desktop-client/src/components/reports/graphs/BudgetVsActualTable.tsx` |
| Spreadsheet/queries | `packages/desktop-client/src/components/reports/spreadsheets/budget-vs-actual-spreadsheet.ts` |

### Current Asset Value
| Component | File Path |
|-----------|-----------|
| Full report page | `packages/desktop-client/src/components/reports/reports/CurrentAssetValue.tsx` |
| Widget card | `packages/desktop-client/src/components/reports/reports/CurrentAssetValueCard.tsx` |
| Table component | `packages/desktop-client/src/components/reports/graphs/CurrentAssetValueTable.tsx` |
| Spreadsheet/queries | `packages/desktop-client/src/components/reports/spreadsheets/current-asset-value-spreadsheet.ts` |

### Yearly Budget Planner
| Component | File Path |
|-----------|-----------|
| Full report page | `packages/desktop-client/src/components/reports/reports/YearlyBudgetPlanner.tsx` |
| Table component | `packages/desktop-client/src/components/reports/graphs/YearlyBudgetPlannerTable.tsx` |
| Spreadsheet/queries | `packages/desktop-client/src/components/reports/spreadsheets/yearly-budget-planner-spreadsheet.ts` |

### Shared Infrastructure
| Component | File Path |
|-----------|-----------|
| Widget type definitions | `packages/loot-core/src/types/models/dashboard.ts` |
| Widget type validation | `packages/loot-core/src/server/dashboard/app.ts` |
| Report routing | `packages/desktop-client/src/components/reports/ReportRouter.tsx` |
| Dashboard integration | `packages/desktop-client/src/components/reports/Overview.tsx` |
| Saved reports hook | `packages/desktop-client/src/hooks/useSavedReports.ts` |
| Saved reports selector | `packages/desktop-client/src/components/reports/SavedReportsSelector.tsx` |
| Widget registry | `packages/desktop-client/src/components/reports/widgetRegistry.tsx` |
| Custom widget registrations | `packages/desktop-client/src/components/reports/customWidgetRegistrations.ts` |
| Sidebar route overrides | `packages/desktop-client/src/components/sidebar/customSidebarConfig.ts` |

## Appendix E - Widget Registry Pattern

Custom widgets use a registry pattern to minimize changes to core Actual files during upgrades.

### How it works

1. `widgetRegistry.tsx` provides registration and lookup functions
2. `customWidgetRegistrations.ts` registers custom widgets (BudgetVsActual, CurrentAssetValue)
3. `Overview.tsx` imports the registrations and uses registry functions for menu items and rendering

### Adding a new custom widget

1. Create your widget components (Card, Full page, Table, Spreadsheet)
2. Add type definition to `dashboard.ts`
3. Register the widget type in `app.ts` `isWidgetType()` array
4. Add routes to `ReportRouter.tsx`
5. Register the widget in `customWidgetRegistrations.ts`:
   ```typescript
   registerWidget({
     type: 'my-widget-card',
     Component: MyWidgetCard,
     menuLabel: 'My Widget',
   });
   ```

### Upgrade safety

When upgrading Actual Budget:
- **Safe**: All files in "Custom Widget Registrations" section
- **Check**: `dashboard.ts`, `app.ts`, `ReportRouter.tsx` for merge conflicts
- **Minimal risk**: `Overview.tsx` only has 3 lines of custom code (import + registry calls)

## Appendix F - Sidebar Configuration Pattern

Custom sidebar navigation uses a configuration pattern to minimize changes to core files.

### How it works

1. `customSidebarConfig.ts` defines route overrides for sidebar items
2. `PrimaryButtons.tsx` imports and uses `getSidebarRoute()` function
3. To change a sidebar link, modify only `customSidebarConfig.ts`

### Configuration file

```typescript
// customSidebarConfig.ts
export const customRouteOverrides: Record<string, string> = {
  budget: '/reports/yearly-budget-planner',
};

export function getSidebarRoute(itemId: string, defaultRoute: string): string {
  return customRouteOverrides[itemId] ?? defaultRoute;
}
```

### Usage in PrimaryButtons.tsx

```typescript
import { getSidebarRoute } from './customSidebarConfig';
// ...
<Item title={t('Budget')} Icon={SvgWallet} to={getSidebarRoute('budget', '/budget')} />
```

### Upgrade safety

When upgrading Actual Budget:
- **Safe**: `customSidebarConfig.ts` (your custom file)
- **Check**: `PrimaryButtons.tsx` for changes to the import line or Item usage
