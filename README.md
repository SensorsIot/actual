# Actual Budget - Custom Fork

A personal fork of [Actual Budget](https://github.com/actualbudget/actual) with automatic desktop updates, Swiss bank importers, budget reporting improvements, and performance optimizations.

**Platform**: Windows (Electron desktop app with NSIS installer)

## Download

Download the latest installer from [GitHub Releases](https://github.com/SensorsIot/actual/releases/latest). The app auto-updates when new versions are published.

## Custom Features

### Auto-Update System

The desktop app automatically detects, downloads, and installs updates from GitHub Releases:

- Checks for updates on startup and every 4 hours
- "Download & Install" button in the notification bar
- Silent NSIS installer with automatic app restart
- Per-user install (no UAC/admin required)
- All update events logged to `%APPDATA%/Actual/auto-update.log`

### Swiss Bank Importers

Import transaction data from Swiss banks via their XLSX export files:

- **Kantonalbank**: XLSX import with automatic payee-to-category mapping
- **Migros Bank**: XLSX import with category suggestions and duplicate detection
- **Revolut**: XLSX import with currency exchange handling and cross-file deduplication

Features shared across all importers:
- Bank balance display from file metadata
- Editable notes and category selection per transaction
- Payee mapping that learns from existing transactions
- Three-state duplicate detection: new, ignored, existing (with merge)

### Budget vs Actual Report

Fixed variance calculations, sign conventions, and color coding:

- Income variance: `actual - budget` (positive = earned more = good)
- Expense variance: `budget + actual` (positive = under budget = good)
- Color-coded: green = favorable, red = unfavorable
- Click any Actual amount to drill down into transactions
- Inline category editing from the drilldown modal

### Yearly Budget Planner

A spreadsheet-style interface for planning budgets across the entire year:

- All income and expense categories in rows
- Columns: Last Year (actual), Yearly Budget, Distribute, Jan-Dec, Total
- Distribute button evenly spreads yearly budget across 12 months
- Year navigation, save with unsaved changes warning

### Payee Autocomplete Optimization

Cached normalized payee names reduce CPU usage during search from O(n*k) to O(n).

### Duplicate Detection Fix

Fixed broken duplicate detection during Swiss bank imports by passing `trx_id` to the server in import preview calls.

## Documentation

- [Fork FSD](Documents/Fork-FSD.md) - Full functional specification of all fork changes
- [Custom Features Guide](docs/Custom-Features.md)
- [Budget vs Actual FSD](docs/Actual-fsd.md)

## Building

```bash
yarn install
yarn workspace desktop-electron run build
```

The build produces `Actual-Setup-x64.exe` (NSIS installer) for Windows.

## Upstream

- [Actual Budget](https://github.com/actualbudget/actual)
- [Documentation](https://actualbudget.org/docs)
- [Discord](https://discord.gg/pRYNYr4W5A)
