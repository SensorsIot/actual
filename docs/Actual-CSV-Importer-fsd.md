# Swiss Bank CSV Importer - Functional Specification

## Overview

This document specifies the Swiss bank CSV importer behavior for Actual Budget.

The importer currently supports Migros Bank and Revolut CSV exports. Each bank has its own chapter so additional banks can be added as new chapters in the future.

## Detection and First-Import Prompts (Shared)

### Format detection

- The importer auto-detects Migros Bank and Revolut CSV formats based on header or first-line patterns.
- Revolut delimiter is auto-detected by checking for tabs in the first line.

### First-import prompts

- On first import, the user is prompted to select accounts required by the import flow.
- The selected accounts are stored in `import_settings.json` and reused for subsequent imports.

### Import modal behavior (shared)

- One CSV line maps to one preview row (no extra matched rows).
- Fixed column layout: checkbox 31px, date 90px, payee 250px, notes 250px, category 200px, status 80px, amount 90px.
- Notes are editable via a 2-line textarea for all transactions (new and existing).
- Category is a dropdown for all transactions (new and existing).
- Rows are sorted with new items first, then existing items.
- Dates display only the formatted Swiss date for these imports.

### Category auto-matching and learning (shared)

- Payees are matched using Jaccard similarity with a threshold of 0.80.
- Payee normalization removes accents, lowercases, and trims whitespace before matching.
- For new payees or when the user changes the suggested category, mappings are stored in `payee_category_mapping.json`.
- Matching considers transaction direction (expense vs income).

### Import summary modal (shared)

- Shows accounts used, accounts created, transactions added/updated, categories applied, and any errors.
- The import modal closes before dispatching the import action so the summary modal remains visible.

## Import Migros Bank

### Format detection (Migros)

- Detected when the CSV uses semicolon (`;`) as delimiter and the header contains `Datum`.
- Example header:
  - `Datum;Buchungstext;Mitteilung;Referenz;Betrag;Valuta`

### Parsing and normalization

- Dates are parsed from Swiss format `DD.MM.YYYY` and stored as `YYYY-MM-DD`.
- Amounts are parsed from Swiss numeric format (e.g., `1'234.56`).
- The value date (`Valuta`) is used as the transaction date.

### Payee extraction

- TWINT transactions extract payee names from `Buchungstext` using known patterns.
- Standard entries extract the payee up to the first comma.
- TWINT patterns:
  - Credit: `TWINT Gutschrift Name, Vorname, +41...` -> `Name, Vorname`
  - Debit: `TWINT Belastung {Code} - {Store} {ID}` -> `{Store}`
- A 16-digit TWINT ID is extracted from the text for duplicate detection.

### Duplicate handling and reconciliation

- TWINT IDs are extracted from the transaction text and used for duplicate detection.
- When reconciling with existing transactions, invalid existing payees are ignored in favor of imported payees.

### UI behavior (Migros)

- Imports show one row per CSV line.
- All transactions are editable (notes and category), both new and existing.
- Rows are sorted with new items first.
- Status labels are shown in German: `neu` (new), `vorhanden` (existing).

### First-time run specifics (Migros)

- The user selects the target Migros account during first import.
- The selection is saved in `import_settings.json` for future use.

## Import Revolut

### Format detection (Revolut)

- Detected when the first line starts with one of:
  - `Art,Produkt,` or `Type,Product,`
  - `Art\tProdukt\t` or `Type\tProduct\t`
- The delimiter is auto-detected (comma or tab).

### Parsing and normalization

- Status filtering: only `COMPLETED` (English) or `ABGESCHLOSSEN` (German) rows are imported.
- Date/time is normalized to `YYYY-MM-DD`.
- Payee is taken from the description column.
- Transaction types are classified as `topup`, `swift_transfer`, `atm`, `exchange`, `card_payment`, or `expense`.

### Multi-currency handling

- All transactions are stored in CHF, regardless of original currency.
- Transactions are grouped by currency to route into per-currency accounts.
- Missing accounts are created automatically (e.g., `Revolut CHF`, `Revolut EUR`).

### Exchange rate conversion

- The Frankfurter API is used to convert non-CHF amounts into CHF at historical rates.
- Original amounts are preserved in notes, e.g., `[Original: 100.00 EUR]`.
- Fallbacks:
  - Use `/latest` if the date lookup fails.
  - Use rate `1.0` if the API is unavailable.

### Duplicate handling and reconciliation

- Unique IDs are generated using currency and timestamp to avoid duplicate imports.
- Amounts are excluded from the unique ID because they are converted to CHF.
- Example ID format: `REV_EUR_2026-01-15_10-30-45` (truncated to 50 chars).
- Field merge priority:
  - payee: existing if valid, otherwise imported
  - category/notes/cleared: existing preferred, imported as fallback
  - imported_payee: always imported
 - Transfer transactions are linked bidirectionally where applicable.

### Balance correction (Revolut Differenz)

- The importer can reconcile the summed balance of all Revolut accounts against the user-entered total.
- If a difference exists, it books a correction transaction to `Revolut CHF` using the configured category.
- If the category is missing, a prompt allows the user to select one and save it.
 - The prompt includes Skip and Book actions and persists the selected category.

### UI behavior (Revolut)

- Uses the same one-row-per-CSV-line layout as Migros.
- All transactions are editable (notes and category), both new and existing.
- Import summary modal is shown after import completes.

### First-time run specifics (Revolut)

- The user selects the topup bank account and cash account during first import.
- The selections are saved in `import_settings.json` for future use.

## Appendix A - Data Models and Types

- `SwissBankFormat`: `migros | revolut | auto | null`
- `ParseFileOptions`: includes `swissBankFormat`
- `StructuredTransaction`: includes optional `currency`, `transfer_account`, `transaction_type`, `imported_id`

### Implementation note: Field mappings

- Generic CSV imports (non-Swiss bank) show a field mapping UI that lets users specify which CSV column contains Date, Payee, Notes, Amount, etc.
- Swiss bank imports (Migros and Revolut) hide this UI because their parsers auto-detect and structure the data.
- When importing, field mappings **must not** be applied to Swiss bank imports, as this would strip critical fields like `imported_id`, `currency`, and `transaction_type`.
- The UI hiding and import-time skipping are both necessary because saved field mappings from previous generic imports could otherwise be incorrectly applied.

## Appendix B - Config and Storage

- `import_settings.json` stores first-import selections (Migros account, Revolut bank/cash accounts, differenz category).
- `payee_category_mapping.json` stores payee-to-category mappings for auto-matching.

## Appendix C - External Dependencies

- Frankfurter API for exchange rates: `https://api.frankfurter.app/`
