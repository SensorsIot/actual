# Custom Features Documentation

This document describes custom features added to this Actual Budget fork.

## Budget vs Actual Report

A report that compares budgeted amounts against actual spending for every category.

### Features
- Monthly breakdown with Budget and Actual columns per month
- Total columns: Budget, Actual, Variance, and percentage
- Collapsible category groups
- Color-coded variance (green = under budget, red = over budget)
- Vertical separator lines between months for readability
- Date range selection with saved report configurations
- **Show/Hide Income**: Toggle to include income categories in the report

### Sign Convention (Tracking Budget Mode)

**Storage (reflect_budgets):**
- All budgets stored as positive (income +2900, expense +550)

**Transactions:**
- Income: positive (+2900)
- Expenses: negative (-267)

**Display:**
- Budgets: shown as positive (directly from reflect_budgets)
- Actuals: shown with natural signs (income positive, expenses negative)

**Variance:**
- Income groups: `actual - budget` (positive = earned more than expected = good)
- Expense groups: `budget + actual` (positive = under budget = good)
- Color: green = positive (favorable), red = negative (unfavorable)

**Totals:**
- Net Budget: income budget - expense budget
- Net Actual: sum of all actuals (expenses already negative)
- Net Variance: net actual - net budget

### Example with Calculation

```
              STORAGE                  DISPLAY
           Budget    Actual       Budget    Actual    Variance
Income     +2900     +2900        2900      2900         0     (actual - budget)
Expense     +550      -267         550      -267       283     (budget + actual)
                                 -------    ------    -------
Net                               2350      2633       283     (net actual - net budget)
```

### Transactions Drilldown
Click on any **Actual** amount to see the underlying transactions:
- Shows Date, Payee, Category (with group name), Notes, and Amount
- **Category editing**: Click the category to change it
  - Transaction moves to the new category and disappears from the list
  - Report data automatically refreshes
- Auto-closes when the last transaction is moved

## Yearly Budget Planner

A spreadsheet-style interface for planning budgets across the entire year.

### Features
- Shows all income and expense categories
- Columns: Last Year (actual), Yearly Budget, Distribute button, Jan-Dec months, Total
- **Distribute**: Evenly spreads the yearly budget across all 12 months
- Year navigation with left/right buttons
- Save button to persist changes
- Unsaved changes warning
- Net (Gain/Deficit) row showing income minus expenses

### Sign Convention (Tracking Budget Mode)

**User Input:** Enter all values as positive numbers (both income and expenses).

**Storage (reflect_budgets):** All values stored as positive.

**Display:**
- Budget cells: all positive
- Last Year column: all positive (expense transactions negated for display)
- Net calculation: Income - Expenses

### Location
- Sidebar: Budget > Budget Planner

## Current Asset Value Report

Shows the current balance of all on-budget accounts.

### Features
- Groups accounts by account groups
- Shows individual account balances and group totals
- Grand total at the bottom

## Saved Reports

Save and load report configurations including:
- Date range and mode (Live vs Static)
- Filters and conditions
- Show/hide hidden categories

---

## Sidebar Changes

The Budget section in the sidebar is now expandable with two sub-items:
- **Budget**: The standard Actual Budget page for managing category budgets
- **Budget Planner**: The Yearly Budget Planner for annual budget planning
