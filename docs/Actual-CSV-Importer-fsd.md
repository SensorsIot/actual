# Swiss Bank CSV Importer - Functional Specification

## Overview

This document specifies the Swiss bank CSV importer behavior for Actual Budget.

The importer currently supports Migros Bank and Revolut CSV exports. Each bank has its own chapter so additional banks can be added as new chapters in the future.

## Architecture

### Modal structure

Each Swiss bank format has its own dedicated modal component:

- `ImportRevolutModal.tsx` - Revolut-specific import flow
- `ImportMigrosModal.tsx` - Migros Bank-specific import flow
- `ImportTransactionsModal.tsx` - Generic CSV/OFX/QIF imports (unchanged)

### Shared libraries

Shared functionality is extracted into reusable modules:

- **`hooks/useSwissBankImport.ts`** - State management for:
  - Per-transaction category selection (`transactionCategories` map)
  - Per-transaction notes editing (`transactionNotes` map)
  - Category suggestion fetching from payee mappings
  - Payee mapping collection and persistence

- **`components/TransactionList.tsx`** - Shared transaction table component:
  - Renders the transaction preview table with headers
  - Handles transaction row rendering via the `Transaction` component
  - Supports status column, currency column, and Swiss bank styling

### Format detection and routing

When importing a file via `Account.tsx`:

1. The file is parsed with `swissBankFormat: 'auto'` to detect the format
2. Based on `metadata.bankFormat`:
   - `'revolut'` → Opens `import-revolut` modal
   - `'migros'` → Opens `import-migros` modal
   - Other → Opens `import-transactions` modal (generic)

## Common Behavior (Shared)

### Format detection

- The importer auto-detects Migros Bank and Revolut CSV formats based on header or first-line patterns.
- Revolut delimiter is auto-detected by checking for tabs in the first line.

### First-import prompts

- On first import, the user is prompted to select accounts required by the import flow.
- The selected accounts are stored in `import_settings.json` and reused for subsequent imports.

### Import modal behavior

- One CSV line maps to one preview row (no extra matched rows).
- Fixed column layout: checkbox 31px, date 90px, payee 250px, notes 250px, category 200px, status 80px, amount 90px.
- Notes are editable via a 2-line textarea for all transactions (new and existing).
- Category is a dropdown for all transactions (new and existing).
- Rows are sorted with new items first, then existing items.
- Dates display only the formatted Swiss date for these imports.

### Category auto-matching and learning

- Payees are matched using Jaccard similarity with a threshold of 0.80.
- Payee normalization removes accents, lowercases, and trims whitespace before matching.
- For new payees or when the user changes the suggested category, mappings are stored in `payee_category_mapping.json`.
- Matching considers transaction direction (expense vs income).

### Import summary modal

- Shows accounts used, accounts created, transactions added/updated, categories applied, and any errors.
- The Migros import modal closes before dispatching the import action so the summary modal remains visible.

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

## Transfer Linking Mechanism

### Overview

When importing transactions that represent transfers between accounts (ATM withdrawals, top-ups, currency exchanges), the importer must create properly linked transfer transactions in the database.

### Database structure for transfers

A transfer in Actual Budget consists of **two transactions** (one in each account) with the following requirements:

1. **Bidirectional linking via `transferred_id`**:
   - Transaction A has `transferred_id` pointing to Transaction B
   - Transaction B has `transferred_id` pointing to Transaction A

2. **Transfer payees** (not regular payees):
   - The `description` field must contain the UUID of a **transfer payee**
   - A transfer payee has `transfer_acct` set to the target account ID
   - Actual Budget automatically creates one transfer payee per account

3. **Matching amounts**:
   - Transaction A has negative amount (outflow)
   - Transaction B has positive amount (inflow)
   - Amounts should match (opposite signs)

### Example: ATM withdrawal (Revolut → Kasse)

```
Revolut CHF Transaction:
  id: "abc123..."
  amount: -100000  (= -1000.00 CHF in cents)
  description: "f0997c1e..."  ← UUID of Kasse transfer payee
  transferred_id: "def456..."  ← points to Kasse transaction

Kasse Transaction:
  id: "def456..."
  amount: 100000  (= +1000.00 CHF in cents)
  description: "586a4b7b..."  ← UUID of Revolut transfer payee
  transferred_id: "abc123..."  ← points to Revolut transaction
```

### Finding transfer payees

Transfer payees are stored in the `payees` table with `transfer_acct` set:

```sql
-- Find transfer payee for Kasse account
SELECT id, name FROM payees WHERE transfer_acct = '<kasse_account_id>';
-- Returns: ('f0997c1e...', 'Kasse')

-- Find transfer payee for Revolut CHF account
SELECT id, name FROM payees WHERE transfer_acct = '<revolut_chf_account_id>';
-- Returns: ('586a4b7b...', 'Revolut')
```

### Common mistake: Using string format instead of UUID

**Wrong** (causes "uncategorized" display):
```
description: "transfer:54f94903-fcd0-4afc-8df8-25e4e3e7c5d8"  ← Invalid!
```

**Correct**:
```
description: "586a4b7b-5ebd-459b-9326-4eb40296d2b9"  ← UUID of transfer payee
```

### Parser classification for transfer detection

The parser (`parse-file.ts`) classifies transactions and sets `transfer_account`:

**Revolut** (`classifyRevolutTransaction`):
| Transaction Type | Detection Pattern | `transferAccount` |
|-----------------|-------------------|-------------------|
| ATM withdrawal | `art === 'atm'` or description contains "cash withdrawal" | `'Kasse'` |
| Currency exchange | `art === 'exchange'` | `'Revolut {TARGET_CURRENCY}'` |
| Top-up | `art === 'topup'` | Bank account (from settings) |
| SWIFT transfer | `art === 'transfer'` + "swift"/"sepa" in description | Bank account (from settings) |

**Migros Bank** (`classifyMigrosTransaction`):
| Transaction Type | Detection Pattern | `transferAccount` |
|-----------------|-------------------|-------------------|
| ATM withdrawal | Buchungstext contains "bankomat", "bargeldbezug", "geldautomat", or "bargeld" | `'Kasse'` |

### Import flow for creating transfers

The import handlers (`importRevolutTransactions`, `importMigrosTransactions` in `app.ts`) implement transfer linking:

1. **Parser phase** (`parse-file.ts`):
   - Classifies transaction type (atm, exchange, topup, etc.)
   - Sets `transfer_account` field (e.g., `'Kasse'` for ATM)

2. **Import phase** (`app.ts`):
   - Skips category assignment for transfer-type transactions
   - Tracks imported transactions with their metadata
   - After main import, processes transactions with `transfer_account` set

3. **Transfer creation** (for each transfer transaction):
   ```
   a. Find or create target account by name
   b. Get targetTransferPayee (payee for target account)
   c. Get sourceTransferPayee (payee for source account)
   d. Create counter-transaction in target account:
      - amount: opposite sign of source
      - payee: sourceTransferPayee (points back to source)
      - transfer_id: source transaction ID
   e. Update source transaction:
      - payee: targetTransferPayee (points to target)
      - transfer_id: counter transaction ID
   ```

4. **Result tracking**:
   - `transfersLinked` counter incremented for each linked pair
   - Logged: `"Linked transfer: {source} -> {target} ({amount})"`

### Category handling for transfers

Transfer-type transactions are excluded from category auto-matching:
- Transfer types: `['topup', 'swift_transfer', 'atm', 'exchange']`
- These transactions get their payee set to a transfer payee instead
- Transfers don't need categories in Actual Budget

### Import result types

**RevolutImportResult**:
```typescript
{
  errors: Array<{ message: string }>;
  accountsCreated: string[];
  imported: Record<string, { added: string[]; updated: string[] }>;
  transfersLinked: number;
  categoriesApplied: number;
}
```

**MigrosImportResult**:
```typescript
{
  errors: Array<{ message: string }>;
  accountUsed: string;
  imported: { added: string[]; updated: string[] };
  categoriesApplied: number;
  transfersLinked: number;
}
```

## Appendix A - Data Models and Types

- `SwissBankFormat`: `migros | revolut | auto | null`
- `ParseFileOptions`: includes `swissBankFormat`
- `StructuredTransaction`: includes optional `currency`, `transfer_account`, `transaction_type`, `imported_id`

### Implementation note: Field mappings

- Generic CSV imports use `ImportTransactionsModal` which shows a field mapping UI for column selection.
- Swiss bank imports use dedicated modals (`ImportRevolutModal`, `ImportMigrosModal`) that bypass field mappings entirely.
- This separation ensures `imported_id`, `currency`, and `transaction_type` fields are never stripped.
- The routing decision happens in `Account.tsx` based on format auto-detection before any modal opens.

## Appendix B - Config and Storage

- `import_settings.json` stores first-import selections (Migros account, Revolut bank/cash accounts, differenz category).
- `payee_category_mapping.json` stores payee-to-category mappings for auto-matching.

## Appendix C - External Dependencies

- Frankfurter API for exchange rates: `https://api.frankfurter.app/`

## Appendix D - Implementation Files

| Component | File Path |
|-----------|-----------|
| Parser & format detection | `packages/loot-core/src/server/transactions/import/parse-file.ts` |
| Import handlers | `packages/loot-core/src/server/accounts/app.ts` |
| Revolut modal | `packages/desktop-client/src/components/modals/ImportRevolutModal.tsx` |
| Migros modal | `packages/desktop-client/src/components/modals/ImportMigrosModal.tsx` |
| Shared hooks | `packages/desktop-client/src/components/modals/hooks/useSwissBankImport.ts` |
| Transaction list | `packages/desktop-client/src/components/modals/components/TransactionList.tsx` |

### Key functions

**parse-file.ts**:
- `classifyRevolutTransaction()` - Classifies Revolut transaction types and sets `transferAccount`
- `classifyMigrosTransaction()` - Classifies Migros transaction types and sets `transferAccount`
- `parseRevolutCSV()` - Parses Revolut CSV with multi-currency support
- `parseMigrosCSV()` - Parses Migros Bank CSV

**app.ts**:
- `importRevolutTransactions()` - Imports Revolut transactions with transfer linking
- `importMigrosTransactions()` - Imports Migros transactions with transfer linking
- `findOrCreateAccount()` - Creates accounts if they don't exist (used for Kasse, etc.)
