# Actual Reporting - Functional Specification

## Overview

This document specifies reporting behavior for Actual Budget. Each report has its own chapter so new reports can be added without restructuring the document.

Supported reports:
- Budget vs Actual (implemented)
- Current Asset Value (implemented)

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

- Columns: Category, Budgeted, Actual, Variance
- Collapsible category groups (click to expand/collapse)
- Group subtotal rows and grand total row
- Group rows use bold styling

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

## Appendix A - Data Models and Types

### Budget vs Actual
- `BudgetVsActualCategoryData`: id, name, budgeted, actual, variance
- `BudgetVsActualGroupData`: id, name, budgeted, actual, variance, categories
- `BudgetVsActualData`: groups, totalBudgeted, totalActual, totalVariance, startDate, endDate
- `BudgetVsActualWidget`: name, conditions, conditionsOp, timeFrame, showHiddenCategories

### Current Asset Value
- `CurrentAssetValueAccountData`: id, name, balance
- `CurrentAssetValueGroupData`: id, name, balance, accounts
- `CurrentAssetValueData`: groups, totalBalance, date
- `CurrentAssetValueWidget`: name, conditions, conditionsOp, date

## Appendix B - Query and Calculation Logic

- Budget vs Actual queries
  - Budgets (zero_budgets), grouped by category across the month range
  - Transactions (expenses only), grouped by category across the date range
  - Variance = budgeted - abs(actual)
  - Month format uses YYYYMM integers derived from the selected dates
- Current Asset Value queries
  - For each active (non-closed) account, sum all transactions up to selected date
  - Group accounts by offbudget field (Budget Accounts vs Off-Budget Accounts)
  - Calculate net worth as sum of all account balances

Schema reference:
- `zero_budgets`: envelope budgeting
- `reflect_budgets`: tracking budgeting (same schema as zero_budgets)

Budget query:
```typescript
q('zero_budgets')
  .filter({
    $and: [
      { month: { $gte: startMonth } },
      { month: { $lte: endMonth } },
    ],
  })
  .groupBy(['category'])
  .select([
    { category: 'category' },
    { amount: { $sum: '$amount' } },
  ]);
```

Transaction query:
```typescript
q('transactions')
  .filter({
    [conditionsOpKey]: [
      ...transactionFilters,
      { date: { $gte: startDate } },
      { date: { $lte: endDate } },
      { amount: { $lt: 0 } },
    ],
  })
  .groupBy([{ $id: '$category' }])
  .select([
    { category: { $id: '$category' } },
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

## Appendix C - Routing and Integration

- Report routes
  - `/reports/budget-vs-actual`
  - `/reports/budget-vs-actual/:id`
  - `/reports/current-asset-value`
  - `/reports/current-asset-value/:id`
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
