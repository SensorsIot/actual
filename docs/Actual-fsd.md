# Budget vs Actual Report - Functional Specification Document

## Overview

This document describes the implementation of the **Budget vs Actual Report** feature for Actual Budget. This report compares budgeted amounts with actual spending for every category, grouped by category groups with subtotals.

## Feature Summary

- **Report Type**: Dashboard widget + Full report page
- **Purpose**: Compare budgeted amounts against actual spending
- **Grouping**: Categories grouped under category groups with subtotals
- **Variance Display**: Color-coded (green = under budget, red = over budget)

---

## Files Created

### 1. `packages/desktop-client/src/components/reports/spreadsheets/budget-vs-actual-spreadsheet.ts`

**Purpose**: Data fetching and calculation logic for the Budget vs Actual report.

**Key Types**:
```typescript
type BudgetVsActualCategoryData = {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
};

type BudgetVsActualGroupData = {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
  categories: BudgetVsActualCategoryData[];
};

type BudgetVsActualData = {
  groups: BudgetVsActualGroupData[];
  totalBudgeted: number;
  totalActual: number;
  totalVariance: number;
  startDate: string;
  endDate: string;
};
```

**Query Logic**:
1. Queries `zero_budgets` table for budget amounts in the selected date range
2. Queries `transactions` table for actual spending (expenses only, amount < 0)
3. Groups data by category and category groups
4. Calculates variance (budgeted - |actual|)

**Budget Query**:
```typescript
q('zero_budgets')
  .filter({
    $and: [
      { month: { $gte: startMonth } },  // YYYYMM format as integer
      { month: { $lte: endMonth } },
    ],
  })
  .groupBy(['category'])
  .select([
    { category: 'category' },
    { amount: { $sum: '$amount' } },
  ]);
```

**Transaction Query**:
```typescript
q('transactions')
  .filter({
    [conditionsOpKey]: [
      ...transactionFilters,
      { date: { $gte: startDate } },
      { date: { $lte: endDate } },
      { amount: { $lt: 0 } },  // Expenses only
    ],
  })
  .groupBy([{ $id: '$category' }])
  .select([
    { category: { $id: '$category' } },
    { amount: { $sum: '$amount' } },
  ]);
```

---

### 2. `packages/desktop-client/src/components/reports/graphs/BudgetVsActualTable.tsx`

**Purpose**: Table component displaying the Budget vs Actual data.

**Features**:
- Collapsible category groups (click to expand/collapse)
- Color-coded variance column:
  - Green (`theme.noticeTextLight`): Under budget (positive variance)
  - Red (`theme.errorText`): Over budget (negative variance)
- Columns: Category | Budgeted | Actual | Variance
- Group rows with bold styling and subtotals
- Grand total row at bottom

**Key Props**:
```typescript
type BudgetVsActualTableProps = {
  data: BudgetVsActualData;
  compact?: boolean;
};
```

---

### 3. `packages/desktop-client/src/components/reports/reports/BudgetVsActual.tsx`

**Purpose**: Main report page component.

**Structure**:
- `BudgetVsActual`: Outer component with widget loading via `useWidget()`
- `BudgetVsActualInternal`: Inner component with report logic

**Features**:
- Date range selection via `Header` component
- Filter support via `useRuleConditionFilters()`
- Widget save functionality
- Loading indicator while data fetches

**Key Hooks Used**:
- `useWidget()` - Load/save widget data
- `useReport()` - Execute spreadsheet function
- `useCategories()` - Get category data
- `useRuleConditionFilters()` - Handle filter conditions

---

### 4. `packages/desktop-client/src/components/reports/reports/BudgetVsActualCard.tsx`

**Purpose**: Dashboard card widget for compact display.

**Features**:
- Shows total variance summary
- Color-coded status (under/over budget)
- Preview of first 4 category groups
- Click to navigate to full report
- Context menu for rename/remove/copy actions

**Key Props**:
```typescript
type BudgetVsActualCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: BudgetVsActualWidget['meta'];
  onMetaChange: (meta: BudgetVsActualWidget['meta']) => void;
  onRemove: () => void;
  onCopy?: (targetDashboardId: string) => void;
};
```

---

## Files Modified

### 1. `packages/loot-core/src/types/models/dashboard.ts`

**Changes**: Added `BudgetVsActualWidget` type.

```typescript
export type BudgetVsActualWidget = AbstractWidget<
  'budget-vs-actual-card',
  {
    name?: string;
    conditions?: RuleConditionEntity[];
    conditionsOp?: 'and' | 'or';
    timeFrame?: TimeFrame;
    showHiddenCategories?: boolean;
  } | null
>;
```

Updated `SpecializedWidget` union to include `BudgetVsActualWidget`.

---

### 2. `packages/desktop-client/src/components/reports/ReportRouter.tsx`

**Changes**: Added routes for Budget vs Actual report.

```typescript
import { BudgetVsActual } from './reports/BudgetVsActual';

// Routes added:
<Route path="/budget-vs-actual" element={<BudgetVsActual />} />
<Route path="/budget-vs-actual/:id" element={<BudgetVsActual />} />
```

---

### 3. `packages/desktop-client/src/components/reports/Overview.tsx`

**Changes**:
1. Added import for `BudgetVsActualCard`
2. Added menu item for widget selection:
   ```typescript
   { name: 'budget-vs-actual-card', text: t('Budget vs Actual') }
   ```
3. Added render case for the card component

---

## Database Schema Reference

### `zero_budgets` Table (Envelope Budgeting)
| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| month | integer | Month in YYYYMM format (e.g., 202401) |
| category | string | Foreign key to categories |
| amount | integer | Budget amount in cents |

### `reflect_budgets` Table (Tracking Budgeting)
Same schema as `zero_budgets`, used when budget type is "tracking".

### `transactions` Table
| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| date | date | Transaction date |
| amount | integer | Amount in cents (negative = expense) |
| category | string | Foreign key to categories |

---

## Usage

### Adding to Dashboard
1. Navigate to **Reports** in the sidebar
2. Click the **+** button to add a widget
3. Select **"Budget vs Actual"** from the menu
4. The card will appear on your dashboard

### Viewing Full Report
1. Click on the Budget vs Actual card on the dashboard
2. Or navigate directly to `/reports/budget-vs-actual`

### Filtering
- Use the filter button in the report header
- Supports standard transaction filters (account, payee, etc.)
- Category filters affect both budget and actual amounts

### Date Range
- Select start and end dates using the header controls
- Budget amounts are summed for all months in the range
- Actual spending is summed for all transactions in the range

---

## Technical Notes

### Month Format Conversion
Budget tables store months as integers (YYYYMM format). Conversion:
```typescript
const startMonth = parseInt(monthUtils.getMonth(startDate).replace('-', ''));
// "2024-01-15" -> "2024-01" -> "202401" -> 202401
```

### Variance Calculation
```typescript
variance = budgeted - Math.abs(actual)
// Positive variance = under budget (good)
// Negative variance = over budget (bad)
```

### Hidden Categories
- Respects `showHiddenCategories` setting
- Hidden category groups are excluded by default
- Can be toggled in widget settings

---

## Future Enhancements (Not Implemented)

1. **Saved Date Presets**: Allow users to save custom date range presets
2. **Export to CSV/PDF**: Export report data
3. **Percentage View**: Show variance as percentage of budget
4. **Trend Analysis**: Compare across multiple periods

---

# Swiss Bank CSV Import Enhancement

## Overview

This enhancement adds automatic detection and parsing support for Swiss bank CSV formats (Migros Bank and Revolut) in the existing transaction import functionality.

## Feature Summary

- **Auto-detection**: Automatically detects Migros Bank and Revolut CSV formats
- **TWINT Support**: Extracts payee names from TWINT transaction descriptions
- **Multi-currency**: Handles Revolut's multi-currency exports with automatic account creation
- **Automatic Account Creation**: Creates "Revolut CHF", "Revolut EUR", etc. accounts as needed
- **Transaction Type Classification**: Identifies Topups, SWIFT transfers, ATM, Exchanges
- **Duplicate Detection**: Uses TWINT IDs and unique transaction identifiers for duplicate prevention
- **First-Time Setup Dialog**: Prompts user to select accounts on first import (stored in import_settings.json)

---

## Files Modified

### 1. `packages/loot-core/src/server/transactions/import/parse-file.ts`

**Changes**:
1. Added `SwissBankFormat` type: `'migros' | 'revolut' | 'auto' | null`
2. Added `swissBankFormat` option to `ParseFileOptions`
3. Added `detectSwissBankFormat()` function for auto-detection
4. Added `parseMigrosCSV()` function for Migros Bank format
5. Added `parseRevolutCSV()` function for Revolut format with multi-currency support
6. Added `classifyRevolutTransaction()` for transaction type detection
7. Added `getRevolutAccountName()` for currency-to-account mapping
8. Added helper functions:
   - `extractTwintId()` - Extract 16-digit TWINT ID
   - `extractPayeeFromBuchungstext()` - Extract payee from Migros transaction text
   - `parseSwissDate()` - Convert DD.MM.YYYY to YYYY-MM-DD
   - `parseRevolutDate()` - Convert Revolut datetime format
   - `getRevolutField()` - Handle German/English column names

**Key Types**:
```typescript
export type SwissBankFormat = 'migros' | 'revolut' | 'auto' | null;

export type ParseFileOptions = {
  hasHeaderRow?: boolean;
  delimiter?: string;
  fallbackMissingPayeeToMemo?: boolean;
  skipStartLines?: number;
  skipEndLines?: number;
  importNotes?: boolean;
  swissBankFormat?: SwissBankFormat;
};

// Transaction type with multi-currency support
type StructuredTransaction = {
  amount: number;
  date: string;
  payee_name: string;
  imported_payee: string;
  notes: string;
  currency?: string;           // For Revolut multi-currency
  transfer_account?: string;   // For transfer linking
  transaction_type?: string;   // topup, swift_transfer, atm, exchange, etc.
};
```

---

### 2. `packages/loot-core/src/server/accounts/app.ts`

**Changes**:
1. Added `importRevolutTransactions` handler for multi-currency import
2. Added `findOrCreateAccount()` helper function
3. Added `getRevolutAccountNameFromCurrency()` helper function
4. Registered new handler: `app.method('transactions-import-revolut', ...)`

**Key Types**:
```typescript
type RevolutImportTransaction = ImportTransactionEntity & {
  currency?: string;
  transaction_type?: string;
  transfer_account?: string;
};

type RevolutImportResult = {
  errors: Array<{ message: string }>;
  accountsCreated: string[];
  imported: Record<string, { added: string[]; updated: string[] }>;
};
```

---

### 3. `packages/desktop-client/src/accounts/accountsSlice.ts`

**Changes**:
1. Added `importRevolutTransactions` Redux thunk
2. Handles account creation notifications
3. Reloads accounts after creating new ones

---

### 4. `packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx`

**Changes**:
1. Added `isRevolutImport` state to detect multi-currency imports
2. Modified parse callback to detect Revolut format (transactions with `currency` field)
3. Modified `onImport()` to use `importRevolutTransactions` for Revolut files
4. Updated import to include `importRevolutTransactions` from accountsSlice

---

## CSV Format Detection

### Migros Bank Detection
Detected when CSV has:
- Semicolon delimiter (`;`)
- Header contains "Datum"

**Example header**: `Datum;Buchungstext;Mitteilung;Referenz;Betrag;Valuta`

### Revolut Detection
Detected when CSV first line starts with:
- `Art,Produkt,` (German, comma-separated)
- `Type,Product,` (English, comma-separated)
- `Art\tProdukt\t` (German, tab-separated)
- `Type\tProduct\t` (English, tab-separated)

**Note:** Revolut exports can be either comma-separated or tab-separated. The parser auto-detects the delimiter by checking if the first line contains tabs.

**Example headers**:
- Comma: `Art,Produkt,Abschlussdatum,Beschreibung,Betrag,Währung,...`
- Tab: `Art	Produkt	Abschlussdatum	Beschreibung	Betrag	Währung	...`

---

## Migros Bank CSV Parsing

### Input Format
| Column | Description |
|--------|-------------|
| Datum | Transaction date (DD.MM.YYYY) |
| Buchungstext | Transaction description (contains payee info) |
| Mitteilung | Additional message |
| Referenz | Reference number |
| Betrag | Amount (Swiss format: 1'234.56) |
| Valuta | Value date (used as transaction date) |

### Payee Extraction
Extracts payee from Buchungstext using patterns:

1. **TWINT Gutschrift** (incoming):
   - Pattern: `TWINT Gutschrift Name, Vorname, +41...`
   - Extracts: `Name, Vorname`

2. **TWINT Belastung** (outgoing):
   - Pattern: `TWINT Belastung {Code} - {Store} {ID}`
   - Extracts: `{Store}`

3. **Standard**: `Company, Address` → `Company`

### TWINT ID Extraction
Extracts 16-digit TWINT ID from transaction text for duplicate detection:
```typescript
const match = buchungstext.match(/(\d{16})/);
```

---

## Revolut CSV Parsing

### Input Format (German)
| Column | Description |
|--------|-------------|
| Art | Transaction type |
| Produkt | Product |
| Datum des Abschlusses | Completion date |
| Beschreibung | Description (payee) |
| Betrag | Amount |
| Währung | Currency |
| Gebühr | Fee |
| Status | Transaction status |

### Input Format (English)
| Column | Description |
|--------|-------------|
| Type | Transaction type |
| Product | Product |
| Completed Date | Completion date |
| Description | Description (payee) |
| Amount | Amount |
| Currency | Currency |
| Fee | Fee |
| State | Transaction status |

### Status Filtering
Skips transactions with status:
- `PENDING`
- `REVERTED`

Only imports transactions with status `COMPLETED` or `ABGESCHLOSSEN`.

### Unique ID Generation
For duplicate detection, uses currency + timestamp (timestamp is unique per transaction):
```typescript
const uniqueId = `REV_${currencyCode}_${startDateStr}`
  .replace(/\s+/g, '_')
  .replace(/:/g, '-')
  .slice(0, 50);
```

**Example:** `REV_EUR_2026-01-15_10-30-45`

**Note:** Amount is NOT included in the ID because all amounts are converted to CHF (see Exchange Rate API below), which would change the ID for existing transactions.

---

## Exchange Rate API (Frankfurter)

### Overview

All Revolut transactions are stored in CHF, regardless of the original currency. The system uses the Frankfurter API to convert foreign currency amounts to CHF at the historical exchange rate.

### API Details

| Property | Value |
|----------|-------|
| **Provider** | [Frankfurter API](https://www.frankfurter.app/) |
| **Cost** | Free, no API key required |
| **Base URL** | `https://api.frankfurter.app/` |
| **Rate Limit** | None specified |

### Implementation

```typescript
/**
 * Cache for exchange rates to avoid repeated API calls.
 * Key: "YYYY-MM-DD_EUR" -> rate to CHF
 */
const exchangeRateCache = new Map<string, number>();

async function getExchangeRate(date: string, fromCurrency: string): Promise<number> {
  const currency = fromCurrency.toUpperCase();
  if (currency === 'CHF') return 1.0;

  const cacheKey = `${date}_${currency}`;
  if (exchangeRateCache.has(cacheKey)) {
    return exchangeRateCache.get(cacheKey)!;
  }

  // Frankfurter API: https://www.frankfurter.app/docs/
  const url = `https://api.frankfurter.app/${date}?from=${currency}&to=CHF`;
  const response = await fetch(url);
  const data = await response.json();
  const rate = data.rates?.CHF || 1.0;

  exchangeRateCache.set(cacheKey, rate);
  return rate;
}
```

### Conversion Logic

```typescript
// Parse amount in original currency
const originalAmount = looselyParseAmount(betrag);

// Convert to CHF
const currencyCode = currency?.toUpperCase() || 'CHF';
let amountCHF = originalAmount ?? 0;
if (currencyCode !== 'CHF' && originalAmount !== null) {
  const rate = await getExchangeRate(transactionDate, currencyCode);
  amountCHF = Math.round((originalAmount * rate) * 100) / 100;
}
```

### Notes Preservation

Original amounts are preserved in transaction notes:
```
[Original: 100.00 EUR]
```

### Fallback Behavior

| Scenario | Fallback |
|----------|----------|
| API returns error for date | Try `/latest` endpoint |
| API completely unavailable | Use rate 1.0 (no conversion) |
| Currency is CHF | Skip API call, return 1.0 |

---

## Revolut Multi-Currency Import

### Overview

Revolut exports a single CSV containing transactions in multiple currencies. The importer:
1. Detects all currencies present in the CSV
2. **Converts all amounts to CHF** using the Exchange Rate API
3. Creates accounts for each currency (if they don't exist)
4. Routes transactions to the correct currency account

### Multi-Currency Account Handling

Each currency maps to a separate Actual Budget account:

| CSV Currency | Actual Account |
|--------------|----------------|
| CHF | Revolut CHF |
| EUR | Revolut EUR |
| USD | Revolut USD |
| GBP | Revolut GBP |
| RON | Revolut RON |

### Automatic Account Creation

When importing a Revolut CSV with multiple currencies, the system:
1. Parses all transactions and groups them by currency
2. For each currency, checks if the corresponding account exists
3. Creates missing accounts automatically (e.g., "Revolut CHF", "Revolut EUR")
4. Imports transactions to the correct account
5. Shows a notification listing any accounts created

### Transaction Type Classification

The parser classifies Revolut transactions by type:

| Type | German | Description |
|------|--------|-------------|
| `topup` | Topup / Top-up | Money added from bank account |
| `swift_transfer` | Transfer (with SWIFT/SEPA) | Bank transfer out |
| `atm` | ATM | Cash withdrawal |
| `exchange` | Exchange | Currency conversion |
| `card_payment` | Card Payment / Kartenzahlung | Regular card purchase |
| `expense` | (other) | Default for unclassified |

### Transaction Type Details

#### Topup (Bank → Revolut)
- Pattern: `Top-up by *XXXX` or `Payment from NAME`
- Represents money moving from bank account to Revolut

#### SWIFT Transfer (Revolut → Bank)
- Pattern: Description contains `SWIFT` or `SEPA`
- Represents money moving from Revolut back to bank account

#### ATM Withdrawal (Revolut → Cash)
- Pattern: Type is `ATM` or description contains `Cash withdrawal`
- Represents cash withdrawn from ATM

#### Currency Exchange
- Pattern: Type is `Exchange` or description contains `Exchanged`
- Represents conversion between Revolut currency accounts
- Example: `500.00 CHF -> 540.22 EUR`

### Transfer Linking (Implemented)

Transfer transactions are automatically linked bidirectionally during Revolut import:

```
Revolut CHF                        Konto Migros 348-02
┌─────────────────────┐           ┌─────────────────────┐
│ id: "txn-abc"       │           │ id: "txn-xyz"       │
│ amount: -30000      │◀─────────▶│ amount: +30000      │
│ transferred_id:     │           │ transferred_id:     │
│   "txn-xyz"         │           │   "txn-abc"         │
│ notes: "SWIFT..."   │           │ notes: "[Transfer]" │
└─────────────────────┘           └─────────────────────┘
```

**Implementation Details:**
- **Topup**: Creates counter-transaction in bank account (e.g., "Konto Migros 348-02")
- **SWIFT Transfer**: Creates counter-transaction in bank account
- **ATM Withdrawal**: Creates counter-transaction in cash account ("Kasse")
- **Currency Exchange**: Creates counter-transaction in target Revolut currency account

The importer accepts optional parameters:
```typescript
opts: {
  bankAccountName?: string;    // Default: "Konto Migros 348-02"
  cashAccountName?: string;    // Default: "Kasse"
  createTransfers?: boolean;   // Default: true
}
```

### Important Notes

1. **Store payments ≠ Account transfers**: A card payment at "Migros" supermarket is NOT related to "Konto Migros" bank account. These are regular expenses.

2. **Topups are bank transfers**: "Payment from NAME" topups represent money leaving your bank account and entering Revolut.

3. **ATM withdrawals go to cash**: Cash withdrawals are transfers to your cash account, not back to the bank.

4. **Balance migrations**: "Balance migration to another region or legal entity" transactions are internal Revolut movements and should cancel out.

---

## Usage

### Importing Swiss Bank CSV
1. Navigate to an account
2. Click **Import** in the account menu
3. Select your Migros Bank or Revolut CSV file
4. The format is **automatically detected**
5. **First-time import**: A settings dialog appears asking you to select:
   - **Migros imports**: The target account for transactions
   - **Revolut imports**: Bank account (for top-ups/transfers) and cash account (for ATM)
6. Review the imported transactions
7. Click **Import** to confirm

### First-Time Import Settings

On the first Swiss bank import, if settings are not configured, a dialog prompts you to:

**For Migros Bank:**
- Select the account where Migros transactions should be imported

**For Revolut:**
- Select the bank account for top-ups and SWIFT transfers (e.g., "Konto Migros")
- Select the cash account for ATM withdrawals (e.g., "Kasse")

Settings are saved to `import_settings.json` in your budget directory and reused for future imports. See [File Storage Locations](#file-storage-locations) for details on where files are stored.

### Notes on Auto-detection
- If a CSV matches Migros/Revolut format, it will use the specialized parser
- For standard CSVs, the existing field mapping UI is shown
- No manual format selection needed

---

## Technical Notes

### Date Format Conversion
```typescript
// Swiss date: DD.MM.YYYY → YYYY-MM-DD
function parseSwissDate(dateStr: string): string {
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  // Returns: "2024-01-15"
}

// Revolut date: YYYY-MM-DD HH:MM:SS → YYYY-MM-DD
function parseRevolutDate(dateStr: string): string {
  return dateStr.trim().slice(0, 10);
}
```

### Amount Parsing
Swiss format amounts use apostrophe as thousand separator:
```typescript
const cleanAmount = betrag.replace(/'/g, '').replace(',', '.');
// "1'234.56" → "1234.56"
```

### Multi-language Support
Revolut exports can be in German or English. The parser handles both:
```typescript
function getRevolutField(row, ...fieldNames): string {
  // Tries: "Description", "Beschreibung", etc.
}
```

---

## File Storage Locations

### Data Directory Structure

Actual Budget stores data in platform-specific locations:

| Platform | Data Directory |
|----------|---------------|
| **Windows** | `%APPDATA%\Actual\` → `C:\Users\<Username>\AppData\Roaming\Actual\` |
| **macOS** | `~/Library/Application Support/Actual/` |
| **Linux** | `~/.config/Actual/` |

**Quick access on Windows:** Press `Win + R`, type `%APPDATA%\Actual`, press Enter.

**Note:** If you configured a custom document directory in Settings, your budgets will be stored there instead (e.g., `D:\Dropbox\Actual\`).

### Budget Directory Structure

Each budget is stored in a folder named `<BudgetName>-<ID>`:

```
<Data Directory>/
├── global-store.json          # App-wide settings (theme, language, server URL)
├── My-Budget-abc123/          # Budget folder
│   ├── db.sqlite              # Main database (transactions, accounts, categories)
│   ├── metadata.json          # Budget metadata (name, sync info, encryption)
│   ├── import_settings.json   # Swiss bank import settings (account mappings)
│   └── payee_category_mapping.json  # Payee-to-category mappings
└── Another-Budget-def456/
    └── ...
```

### Configuration Files

#### `import_settings.json`
Stores account mappings for Swiss bank imports:

```json
{
  "migros_account": "Konto Migros 348-02",
  "revolut_bank_account": "Konto Migros 348-02",
  "cash_account": "Kasse"
}
```

| Setting | Purpose |
|---------|---------|
| `migros_account` | Target account for Migros CSV imports |
| `revolut_bank_account` | Bank account for Revolut top-ups and SWIFT transfers |
| `cash_account` | Cash account for ATM withdrawals |

**Created automatically** when you first import a Swiss bank CSV and select accounts in the settings dialog.

#### `payee_category_mapping.json`
Stores learned payee-to-category mappings:

```json
{
  "Migros": "Lebensunterhalt:Lebensmittel",
  "Coop": "Lebensunterhalt:Lebensmittel",
  "SBB": "Transport:Öffentlicher Verkehr"
}
```

#### `global-store.json`
App-wide settings (NOT budget-specific):

```json
{
  "theme": "dark",
  "language": "de",
  "floating-sidebar": "true",
  "document-dir": "D:\\Dropbox\\Actual"
}
```

### Finding Your Budget ID

1. Open **Actual Budget** app
2. Go to **Settings** → **Advanced**
3. Look for **Budget ID** (e.g., `My-Finances-657eed0`)

This ID is the folder name where your budget files are stored.

---

## Additional Swiss Bank Features

### Payee-Category Mapping

The system supports automatic category assignment based on payee names, matching the Python implementation.

**Handlers:**
```typescript
// Get saved mappings (per-account or global)
'swiss-bank-get-payee-mapping': ({ accountId?: string }) => PayeeCategoryMapping

// Save mappings
'swiss-bank-save-payee-mapping': ({ accountId?: string, mapping: PayeeCategoryMapping }) => { success: boolean }
```

**Mapping Format:**
```json
{
  "Migros": "Lebensunterhalt:Lebensmittel",
  "Coop": "Lebensunterhalt:Lebensmittel",
  "SBB": "Transport:Öffentlicher Verkehr"
}
```

**Partial Matching:** The category lookup supports partial, case-insensitive matching:
```typescript
// If payee is "Coop City Basel", it matches mapping "Coop"
const category = await getCategoryForPayee(payeeName, mapping);
```

### Learn Categories from Existing Transactions

Automatically extract payee-category mappings from existing categorized transactions:

```typescript
'swiss-bank-learn-categories': ({ accountId?: string }) => {
  mapping: PayeeCategoryMapping;
  count: number;
}
```

**SQL Query:**
```sql
SELECT p.name as payee_name, cg.name || ':' || c.name as cat_name
FROM transactions t
JOIN payees p ON t.description = p.id
JOIN categories c ON t.category = c.id
JOIN category_groups cg ON c.cat_group = cg.id
WHERE t.tombstone = 0 AND t.category IS NOT NULL
GROUP BY p.name, cat_name
```

### First-Time Import Prompt for Learn Categories

When a user imports a Swiss bank CSV file for the first time and the `payee_category_mapping.json` is empty or missing, the import modal shows a prompt offering to learn categories from existing transactions.

**User Flow:**

1. User selects a Swiss bank CSV file (Migros or Revolut)
2. System detects that `payee_category_mapping.json` is empty
3. **Prompt dialog appears** with two options:
   - **Learn Categories**: Scan existing transactions and build mappings
   - **Skip**: Continue without learning (use empty mappings)
4. If "Learn" clicked:
   - System calls `swiss-bank-learn-categories` handler
   - Mappings are extracted from existing categorized transactions
   - Saved to `payee_category_mapping.json`
   - Import continues with auto-categorization enabled
5. If "Skip" clicked:
   - Import continues without pre-populated categories

**Implementation:**

```typescript
// Check if mapping is empty before showing transactions
if (swissBankFormat && transactions.length > 0) {
  const existingMapping = await send('swiss-bank-get-payee-mapping', {});
  const mappingIsEmpty = !existingMapping ||
    (Object.keys(existingMapping).length === 0) ||
    (!existingMapping.expense || Object.keys(existingMapping.expense).length === 0) &&
    (!existingMapping.income || Object.keys(existingMapping.income).length === 0);

  if (mappingIsEmpty) {
    setShowLearnCategoriesPrompt(true);
    return; // Wait for user response before continuing
  }
}
```

**Rationale:** This feature provides a one-time bootstrap for the payee-category mapping system, leveraging the user's existing categorized transactions to enable automatic category suggestions for future imports.

### Balance Check and Correction

Compare account balance with bank statement balance and create correction transaction if needed:

```typescript
'swiss-bank-balance-check': ({
  accountId: string;
  bankSaldo: number;  // in cents
  dryRun?: boolean;
}) => {
  actualBalance: number;
  bankSaldo: number;
  difference: number;
  correctionCreated: boolean;
  correctionId?: string;
}
```

**Correction Transaction:**
- Payee: "Automatische Saldokorrektur"
- Category: "Lebensunterhalt:Weiss nicht" (if exists)
- Notes: Bank saldo vs actual balance details
- Amount: difference (bankSaldo - actualBalance)

**Example:**
```
Bank saldo:      467,459.69 CHF
Actual balance:  467,400.00 CHF
Difference:          59.69 CHF → Creates correction transaction
```

---

## Handler Registration

All Swiss bank handlers are registered in `app.ts`:

```typescript
app.method('swiss-bank-get-payee-mapping', getSwissBankPayeeMapping);
app.method('swiss-bank-save-payee-mapping', saveSwissBankPayeeMapping);
app.method('swiss-bank-learn-categories', learnCategoriesFromTransactions);
app.method('swiss-bank-balance-check', mutator(undoable(checkAndCorrectBalance)));
```

---

## Import Result Summary

The Revolut import handler returns comprehensive results:

```typescript
type RevolutImportResult = {
  errors: Array<{ message: string }>;
  accountsCreated: string[];           // e.g., ["Revolut EUR", "Revolut USD"]
  imported: Record<string, {           // Keyed by currency
    added: string[];
    updated: string[];
  }>;
  transfersLinked: number;             // Count of linked transfer transactions
};
```

---

## Swiss Bank Import UI

### Modal Layout

The import modal for Swiss bank CSV files (Migros and Revolut) shows **exactly one row per CSV line** with fixed column widths:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Import Transactions                                                            [X]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [✓] │ Date       │ Payee          │ Notes [editable]  │ Category [dropdown] │ Status │ Amt    │
├─────┼────────────┼────────────────┼───────────────────┼─────────────────────┼────────┼────────┤
│ [✓] │ 15.01.2026 │ Migros         │ [___Shopping___]  │ [Lebensmittel    ▼] │ neu    │ -25.50 │
│ [✓] │ 14.01.2026 │ Coop           │ [______________]  │ [Lebensmittel    ▼] │ neu    │ -15.00 │
│ [-] │ 13.01.2026 │ SBB            │ Ticket            │ Transport:ÖV        │vorhanden│ -40.00 │
│ [✓] │ 12.01.2026 │ New Payee      │ [__Unknown____]   │ [Select...       ▼] │ neu    │ -10.00 │
└─────┴────────────┴────────────────┴───────────────────┴─────────────────────┴────────┴────────┘
                                    ↑                    ↑                      ↑
                                    Editable textarea    Dropdown for new       German status
```

**Key Principle:** One CSV line = One row in modal. No duplicate rows for matched transactions.

| Column | Width | Description |
|--------|-------|-------------|
| Checkbox | 31px | Select/deselect transaction |
| Date | 90px | Transaction date (Swiss format: DD.MM.YYYY) |
| Payee | 250px | Payee name |
| Notes | 250px | **Editable textarea** (2 lines) for new transactions |
| Category | 200px | **Dropdown** with proposed/stored category for new transactions |
| Status | 70px | "neu" or "vorhanden" (German) |
| Amount | 90px | Transaction amount in CHF |

**Modal dimensions**: 1050px width × 450px height

### Transaction Sorting

Transactions are sorted by status to prioritize review of new items:

1. **New transactions first** (`neu`) - Sorted to top
2. **Existing transactions after** (`vorhanden`) - Sorted to bottom

### Transaction Status Column

The status column shows transaction state in German:

| Status | German | Color | Meaning |
|--------|--------|-------|---------|
| **New** | `neu` | Teal | New transaction, will be imported |
| **Existing** | `vorhanden` | Orange/Red | Already in database, will be skipped |

**Note:** Unlike the previous design, there is NO separate "matched transaction" row shown. The status column indicates whether the transaction exists in the database.

### Editable Fields

For **new transactions** (`neu` status), users can edit:

| Field | Control | Behavior |
|-------|---------|----------|
| **Notes** | 2-line textarea | Editable; changes saved to transaction on import |
| **Category** | Dropdown | Shows proposed category (from mapping) or lets user select |

For **existing transactions** (`vorhanden` status):
- Notes: Read-only text display
- Category: Read-only text display (shows existing category)

### Category Dropdown Behavior

The category dropdown behavior differs based on transaction status:

| Status | Dropdown | Behavior |
|--------|----------|----------|
| **neu** | Interactive dropdown | User can select/change category |
| **vorhanden** | Read-only text | Shows existing category from database |

**Rationale:** Existing (`vorhanden`) transactions are already in the database, so editing would have no effect during import.

### Per-Transaction Category Selection

For **new transactions** (`neu` status), users can:
1. Select a category from a dropdown showing all categories sorted alphabetically by `Group:Category`
2. Edit the notes field using a 2-line textarea
3. Categories are pre-filled using Jaccard similarity matching against known payee-category mappings

**Existing transactions** (`vorhanden`) show read-only text (no dropdown or textarea).

### Data Persistence on Import

When the user clicks **Import**, the following data is persisted:

| Data | Target | Condition |
|------|--------|-----------|
| **Selected Category** | Transaction in database | Always saved with transaction |
| **Edited Notes** | Transaction in database | Always saved with transaction |
| **Category Mapping** | `payee_category_mapping.json` | Saved when: (1) new payee, or (2) category changed from proposed |

**Implementation:**
```typescript
// Notes: Apply edited notes from UI state to final transaction
const editedNotes = transactionNotes.get(trans.trx_id);
finalTransactions.push({
  ...finalTransaction,
  notes: editedNotes !== undefined ? editedNotes : finalTransaction.notes,
});

// Category mapping: Save if new payee or category changed
if (isNewPayee || categoryChanged) {
  await send('swiss-bank-add-payee-mappings', { newMappings });
}
```

### Date Display

Swiss bank imports show only the formatted date in green (Swiss locale), not the "original → parsed" format used for standard CSV imports.

---

## Payee-Category Matching with Jaccard Similarity

### Overview

When importing Swiss bank CSV files, the system attempts to automatically assign categories based on known payee-category mappings using fuzzy matching.

### Algorithm

**Jaccard Similarity** measures the overlap between two sets of words:

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

**Threshold**: 80% similarity required for a match.

### Text Normalization

Before comparison, payee names are normalized:

```typescript
function normalizeForMatching(text: string): string {
  return text
    .normalize('NFD')                      // Unicode decomposition
    .replace(/[\u0300-\u036f]/g, '')       // Remove accents (é → e, ü → u)
    .toLowerCase()                          // Lowercase
    .trim();                                // Remove whitespace
}
```

**Examples**:
```
"Müller AG"    → "muller ag"
"Café Zürich"  → "cafe zurich"
"  MIGROS  "   → "migros"
```

### Matching Examples

| Payee in CSV | Mapping Key | Similarity | Match? |
|--------------|-------------|------------|--------|
| `Coop City Basel` | `Coop` | 33% | No |
| `Coop Pronto` | `Coop Pronto Lausen` | 67% | No |
| `Lidl Lausen` | `Lidl Lausen` | 100% | Yes |
| `TWINT Müller` | `Twint Muller` | 100% | Yes (after normalization) |
| `Migros Basel` | `Migros` | 50% | No |
| `Migros` | `Migros` | 100% | Yes |

### Matching Process

```typescript
'swiss-bank-match-payees': ({ payees: PayeeInput[] }) => MatchResult[]

type PayeeInput = {
  payee: string;
  isExpense: boolean;
};

type MatchResult = {
  payee: string;
  matchedPayee: string | null;
  category: string | null;      // "Group:Category" format
  similarity: number;           // 0.0 to 1.0
};
```

### Category Assignment Logic

Categories are assigned based on transaction direction (expense vs income):

```typescript
function getCategoryForTransaction(payee: string, amount: number, mapping: object): string | null {
  const match = findBestMatch(payee, Object.keys(mapping));  // Jaccard ≥ 80%

  if (!match) return null;

  const categoryData = mapping[match];

  if (amount < 0) {  // Expense (negative = money out)
    return categoryData.expense || null;
  } else {           // Income (positive = money in)
    return categoryData.income || null;
  }
}
```

### Auto-Matching Flow

When the import modal loads:

1. Load `payee_category_mapping.json`
2. For each transaction:
   - Find best match using Jaccard similarity (≥80%)
   - Pre-populate the category dropdown with the matched category
3. Display proposed categories for user review

### Auto-Learning Flow

Category mappings are automatically saved during import when:

1. **New payee**: User assigns a category to a previously unmatched payee
2. **Changed category**: User modifies the pre-filled category suggestion

**Save Logic:**
```typescript
// Save mapping if: new payee OR category changed from proposed
const isNewPayee = !catInfo.hasMatch;
const categoryChanged = catInfo.selectedCategory !== catInfo.proposedCategory;

if (catInfo.selectedCategory && catInfo.payee && (isNewPayee || categoryChanged)) {
  // Save to payee_category_mapping.json
}
```

**Example 1 - New Payee:**
- User imports transaction: Payee="New Restaurant", Category not matched
- User selects "Lebensunterhalt:Ausgehen" from dropdown
- After import, mapping file is updated with the new entry

**Example 2 - Changed Category:**
- User imports transaction: Payee="Migros", Category pre-filled as "Lebensunterhalt:Lebensmittel"
- User changes category to "Lebensunterhalt:Haushalt"
- After import, mapping for "Migros" is updated to new category

**Rationale:** This ensures the mapping file stays current with user preferences, not just initial assignments.

### Learning New Mappings

After import, if the user assigns a category to a transaction, the mapping is saved:

```typescript
'swiss-bank-add-payee-mappings': ({ newMappings: NewMapping[] }) => { success: boolean }

type NewMapping = {
  payee: string;
  category: string;      // "Group:Category" format
  isExpense: boolean;
};
```

### Mapping File Format

Mappings are stored in `payee_category_mapping.json` with separate entries for expenses and income:

```json
{
  "expense": {
    "migros": "Lebensunterhalt:Lebensmittel",
    "coop": "Lebensunterhalt:Lebensmittel",
    "sbb": "Transport:Öffentlicher Verkehr"
  },
  "income": {
    "salary": "Einkommen:Lohn"
  }
}
```

---

## Revolut Balance Correction ("Revolut Differenz")

### Problem

Foreign currency transactions in Revolut are exchanged to CHF at varying rates. Small rounding differences accumulate over time, causing the calculated balance to differ from the actual Revolut balance.

### Solution

The import modal includes a balance correction feature that:
1. Sums the balances of **ALL Revolut accounts** (CHF + EUR + USD + ...)
2. Compares with the user-entered total from the Revolut app
3. Books the difference as a correction transaction to **Revolut CHF**

### Balance Calculation

```
Calculated Total = Balance(Revolut CHF) + Balance(Revolut EUR) + Balance(Revolut USD) + ...
Difference = User Entered Total - Calculated Total
If Difference ≠ 0 → Book correction to Revolut CHF
```

**Important:** All Revolut accounts store amounts in CHF (converted via Exchange Rate API), so summing them gives the total CHF value.

### User Flow

1. User selects Revolut CSV file → Import modal opens
2. Modal shows:
   - **Transaction list** with category dropdowns and editable notes
   - **"Current Revolut Total (CHF)"** input field
3. User:
   - Reviews/edits categories for each transaction
   - Enters notes where needed
   - Enters the current total value from their Revolut app (e.g., `14'523.45`)
4. User clicks **Import**
5. System:
   - Sums balances of all accounts named "Revolut *"
   - Compares with user-entered total
6. If difference exists:
   - If `revolut_differenz_category` not configured → **Category prompt dialog** appears
   - User selects a category (saved to settings for future use)
   - Correction transaction is booked to **Revolut CHF** account

### Category Prompt Dialog

When a balance correction is needed but `revolut_differenz_category` is not configured:

1. **Dialog appears** with warning styling (yellow background)
2. Shows:
   - Current calculated balance
   - Expected total (user-entered)
   - Difference amount (positive = add, negative = subtract)
3. User selects category from dropdown (sorted alphabetically by `Group:Category`)
4. Buttons:
   - **Skip Correction**: Close without booking (import still completed)
   - **Book Correction**: Save category to settings and book the correction

### Configuration

**Settings Dialog:**

In the Revolut import settings dialog, users can configure:
- **Topup Bank Account**: Account for top-ups and SWIFT/SEPA transfers (e.g., "Konto Migros 348-02")
- **Cash Account**: Account for ATM withdrawals (e.g., "Kasse")
- **Differenz Category**: Category for balance corrections (e.g., "Freizeit:Hobby")

**Stored in `import_settings.json`:**
```json
{
  "migros_account": "Konto Migros 348-02",
  "revolut_bank_account": "Konto Migros 348-02",
  "cash_account": "Kasse",
  "revolut_differenz_category": "Freizeit:Hobby"
}
```

### Backend Handler

```typescript
'revolut-balance-check': ({
  expectedTotalCHF: number;  // In cents
}) => RevolutBalanceCheckResult

type RevolutBalanceCheckResult = {
  success: boolean;
  accountBalance: number;      // Current balance in cents
  expectedBalance: number;     // Expected balance in cents
  difference: number;          // Difference in cents
  correctionBooked: boolean;   // True if correction was booked
  error?: string;
};
```

### Correction Transaction Details

| Field | Value |
|-------|-------|
| Account | Revolut CHF |
| Payee | Revolut Differenz |
| Category | From `revolut_differenz_category` config |
| Amount | Expected - Calculated |
| Notes | "Saldokorrektur: Ist X CHF, Berechnet Y CHF" |

### Example

```
Revolut app shows:    CHF 14,523.45
Calculated balance:   CHF 14,520.12
Difference:           CHF     3.33

→ Book +3.33 CHF to Revolut CHF as "Revolut Differenz"
```

---

## Import Summary Modal

### Overview

After importing Swiss bank transactions (Migros or Revolut), a summary modal is displayed showing import results.

### Modal Contents

| Section | Description |
|---------|-------------|
| **Status Banner** | Green = success, Red = errors occurred |
| **Accounts Used** | List of accounts that received transactions |
| **Accounts Created** | New accounts created (Revolut multi-currency) |
| **Transactions Added** | Count of new transactions |
| **Transactions Updated** | Count of merged/updated transactions |
| **Categories Applied** | Count of auto-categorized transactions |
| **Errors** | List of any errors encountered |

### Technical Implementation

The import modal is closed **before** dispatching the import action to ensure the summary modal stays visible:

```typescript
// In ImportTransactionsModal.tsx
} else if (isMigrosImport) {
  // Close the import modal BEFORE dispatching
  close();

  // Dispatch import - thunk will push summary modal
  didChange = await dispatch(importMigrosTransactions({...})).unwrap();

  // Don't call close() again - summary modal is now visible
  return;
}
```

**Why this matters:** The import thunks (`importMigrosTransactions`, `importRevolutTransactions`) push the summary modal onto the modal stack. If `close()` is called after the dispatch, it would pop the summary modal (since `popModal()` removes the topmost modal), causing the summary to disappear immediately.

---

## Transaction Reconciliation

### Payee Update Logic

When reconciling imported transactions with existing ones, the system now validates the existing payee before using it:

```typescript
// Check if existing payee is valid (has a name)
let existingPayeeValid = false;
if (existing.payee) {
  const existingPayeeRecord = await db.getPayee(existing.payee);
  existingPayeeValid = !!(existingPayeeRecord?.name);
}

// Only keep existing payee if it's valid
payee: existingPayeeValid ? existing.payee : (trans.payee || null),
```

**Problem solved:** Previously, if a transaction existed in the database with a payee UUID pointing to a deleted or empty payee record, the import would not update the payee with the new value from the CSV. The `existing.payee || trans.payee` logic would always prefer the (invalid) existing UUID because it was truthy.

**Example:**
- Existing transaction: date=14.01.2026, payee=null, amount=-40.00
- Import transaction: date=14.01.2026, payee="BAZG Via-Webshop", amount=-40.00
- Old behavior: Payee stays null (UUID might exist but point to empty name)
- New behavior: Payee updated to "BAZG Via-Webshop"

### Field Update Priority

When merging transactions, fields are updated with this priority:

| Field | Logic |
|-------|-------|
| `payee` | Use existing if valid (has name), otherwise use imported |
| `category` | Prefer existing, fallback to imported |
| `notes` | Prefer existing, fallback to imported |
| `imported_payee` | Always use imported value |
| `cleared` | Prefer existing, fallback to imported |
