# Custom Features Documentation

This document describes custom features added to this Actual Budget fork.

## Budget vs Actual Report

A report that compares budgeted amounts against actual spending for every category.

### Features
- Monthly breakdown with Budget and Actual columns per month
- Total columns: Budget, Actual, Variance, and percentage
- Collapsible category groups
- Color-coded variance (green = positive/favorable, red = negative/unfavorable)
- Vertical separator lines between months for readability
- Date range selection with saved report configurations
- **Show/Hide Income**: Toggle to include income categories in the report

### Sign Convention

**Storage (Database):**
- Expense budgets: POSITIVE (+500)
- Income budgets: NEGATIVE (-1000)
- Expense transactions: NEGATIVE (-300)
- Income transactions: POSITIVE (+1000)

**Display (Report):**
All values displayed as positive for easy reading:
- Income budgets: negated for display (−1000 → +1000)
- Income actuals: kept as-is (+1000 → +1000)
- Expense budgets: kept as-is (+500 → +500)
- Expense actuals: negated for display (−300 → +300)

**Variance:** Actual - Budget
- Negative = unfavorable (earned less than expected OR overspent)
- Positive = favorable (earned more OR underspent)

**Totals:** Income - Expenses = Net (surplus/deficit)

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

### Sign Convention

**User Input:** Enter all values as positive numbers (both income and expenses)

**Storage:** The system automatically converts:
- Income budgets: negated before storing (enter 1000 → store -1000)
- Expense budgets: stored as entered (enter 500 → store 500)

**Display:**
- Last Year column: All values shown as positive
- All budget cells: All values shown as positive
- Net calculation: Income - Expenses

### Location
- Sidebar: Budget → Budget Planner

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
