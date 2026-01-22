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
- Expense categories:
  - Positive = overspent (red)
  - Negative = underspent (green)
- Income categories:
  - Positive = earned more (green)
  - Negative = earned less (red)
- Total: Positive = surplus (green), Negative = deficit (red)

**Totals:** Income - Expenses = Net (surplus/deficit)

### Example with Calculation

This example shows how raw database values are transformed for display:

```
              RAW (Database)         REPORT (Display)
           Budget    Actual       Budget    Actual    Variance
Income    -100000   +90000       100000     90000     -10000
Expense    +20000   -21000        20000     21000      +1000
                                 -------    ------    -------
Total                             80000     69000     -11000
```

**Explanation:**

1. **Storage (RAW column):**
   - Income budget: -100000 (negative)
   - Income actual: +90000 (positive transaction)
   - Expense budget: +20000 (positive)
   - Expense actual: -21000 (negative transaction)

2. **Display transformation (REPORT columns):**
   - Income budget: -100000 → 100000 (negated)
   - Income actual: +90000 → 90000 (kept as-is)
   - Expense budget: +20000 → 20000 (kept as-is)
   - Expense actual: -21000 → 21000 (negated)

3. **Variance calculation:**
   - Income: 90000 - 100000 = -10000 (earned $10k less than expected)
   - Expense: 21000 - 20000 = +1000 (spent $1k more than budget)

4. **Totals:**
   - Budget: 100000 - 20000 = 80000 (expected net)
   - Actual: 90000 - 21000 = 69000 (actual net)
   - Variance: 69000 - 80000 = -11000 (net shortfall)

The negative total variance indicates an unfavorable position: earned less income and spent more than planned.

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
