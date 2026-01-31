# Actual Budget - Custom Fork

A personal fork of [Actual Budget](https://github.com/actualbudget/actual) with custom Swiss bank importers, additional reports, and tracking budget fixes.

Based on Actual Budget v26.1.0. Uses **Tracking Budget** mode with `reflect_budgets`.

## Custom Features

### Swiss Bank CSV Importers

- **Migros Bank**: Import CSV exports from Migros Bank with automatic category mapping
- **Revolut**: Import Revolut CSV exports with currency exchange handling, duplicate detection, and cross-CSV deduplication

### Budget vs Actual Report

A dashboard widget and full report comparing budgeted amounts against actual spending:

- Monthly breakdown with Budget and Actual columns
- Total columns with Variance and percentage
- Collapsible category groups
- Color-coded variance (green = under budget, red = over budget)
- Click any Actual amount to drill down into transactions
- Inline category editing from the drilldown modal

### Yearly Budget Planner

A spreadsheet-style interface for planning budgets across the entire year:

- All income and expense categories in rows
- Columns: Last Year (actual), Yearly Budget, Distribute, Jan-Dec, Total
- Distribute button evenly spreads yearly budget across 12 months
- Year navigation, save with unsaved changes warning
- Net (Gain/Deficit) row

### Current Asset Value Report

Shows current balance of all on-budget accounts, grouped by account groups.

### Sidebar Changes

The Budget section is expandable with sub-items:
- **Budget**: Standard Actual Budget page
- **Budget Planner**: Yearly Budget Planner

## Sign Conventions (Tracking Budget Mode)

| | Storage (reflect_budgets) | Transactions |
|--|--------------------------|-------------|
| Income budget | Positive (+2900) | - |
| Expense budget | Positive (+550) | - |
| Income actual | - | Positive (+2900) |
| Expense actual | - | Negative (-267) |

**Display**: Budgets shown as positive. Actuals shown with natural signs.

**Variance**:
- Income: `actual - budget` (positive = earned more = good)
- Expense: `budget + actual` (positive = under budget = good)

## Installation

See [upstream docs](https://actualbudget.org/docs/install/) for deployment options. This fork can be built the same way.

## Upstream

- [Actual Budget](https://github.com/actualbudget/actual)
- [Documentation](https://actualbudget.org/docs)
- [Discord](https://discord.gg/pRYNYr4W5A)
