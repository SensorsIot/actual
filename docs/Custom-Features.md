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
