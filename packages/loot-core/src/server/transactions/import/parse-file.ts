// @ts-strict-ignore
import { parse as csv2json } from 'csv-parse/sync';

import * as fs from '../../../platform/server/fs';
import { logger } from '../../../platform/server/log';
import { looselyParseAmount } from '../../../shared/util';

import { ofx2json } from './ofx2json';
import { qif2json } from './qif2json';
import { xmlCAMT2json } from './xmlcamt2json';

/**
 * Parse OFX amount strings to numbers.
 * Handles various OFX amount formats including currency symbols, parentheses, and multiple decimal places.
 * Returns null for invalid amounts instead of NaN.
 */
function parseOfxAmount(amount: string): number | null {
  if (!amount || typeof amount !== 'string') {
    return null;
  }

  // Handle parentheses for negative amounts (e.g., "(30.00)" -> "-30.00")
  let cleaned = amount.trim();
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  // Remove currency symbols and other non-numeric characters except decimal point and minus sign
  cleaned = cleaned.replace(/[^\d.-]/g, '');

  // Handle multiple decimal points by keeping only the first one
  const decimalIndex = cleaned.indexOf('.');
  if (decimalIndex !== -1) {
    const beforeDecimal = cleaned.slice(0, decimalIndex);
    const afterDecimal = cleaned.slice(decimalIndex + 1).replace(/\./g, '');
    cleaned = beforeDecimal + '.' + afterDecimal;
  }

  // Ensure we have a valid number format
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return null;
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

type StructuredTransaction = {
  amount: number;
  date: string;
  payee_name: string;
  imported_payee: string;
  notes: string;
  // Multi-currency support for Revolut
  currency?: string;
  // Transfer target account for linking
  transfer_account?: string;
  // Transaction type (for Revolut: Topup, Transfer, Card Payment, etc.)
  transaction_type?: string;
};

// CSV files return raw data that are not guaranteed to be StructuredTransactions
type CsvTransaction = Record<string, string> | string[];

type Transaction = StructuredTransaction | CsvTransaction;

type ParseError = { message: string; internal: string };

// Metadata returned by Swiss bank parsers
export type SwissBankMetadata = {
  bankSaldo?: number; // Bank balance from CSV header (in cents)
  bankFormat?: 'migros' | 'revolut';
  currencies?: string[]; // For Revolut: list of currencies found
};

export type ParseFileResult = {
  errors: ParseError[];
  transactions?: Transaction[];
  // Swiss bank specific metadata
  metadata?: SwissBankMetadata;
};

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

/**
 * Detect Swiss bank CSV format based on header row.
 * Returns 'migros', 'revolut', or null if not a recognized format.
 */
export function detectSwissBankFormat(contents: string): SwissBankFormat {
  // Remove BOM if present
  const cleanContents = contents.replace(/^\uFEFF/, '');
  const lines = cleanContents.split(/\r?\n/);

  // Check first line for Revolut format
  const firstLine = lines[0] || '';
  const firstLineLower = firstLine.toLowerCase();

  // Revolut: starts with "Art,Produkt," (German) or "Type,Product," (English)
  // Handle both comma-separated and tab-separated formats
  if (
    firstLineLower.startsWith('art,produkt,') ||
    firstLineLower.startsWith('type,product,') ||
    firstLineLower.startsWith('art\tprodukt\t') ||
    firstLineLower.startsWith('type\tproduct\t')
  ) {
    return 'revolut';
  }

  // Migros Bank: Check first 15 lines for header row with "Datum" and semicolon delimiter
  // Migros CSVs have metadata lines before the actual header
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    // Look for the header row: "Datum";"Buchungstext"... or Datum;Buchungstext...
    if (
      lineLower.includes('"datum"') ||
      (lineLower.startsWith('datum') && line.includes(';'))
    ) {
      return 'migros';
    }
  }

  return null;
}

/**
 * Extract TWINT ID (16-digit number) from Buchungstext if present.
 */
function extractTwintId(buchungstext: string): string | null {
  const match = buchungstext.match(/(\d{16})/);
  return match ? match[1] : null;
}

/**
 * Extract payee name from Migros Bank Buchungstext.
 * Handles TWINT patterns and standard company/address format.
 */
function extractPayeeFromBuchungstext(buchungstext: string): string {
  const text = buchungstext.trim();

  // TWINT Gutschrift: Extract name before phone number
  if (text.startsWith('TWINT Gutschrift')) {
    // Pattern: "TWINT Gutschrift Name, Vorname, +41..."
    const match1 = text.match(/TWINT Gutschrift\s+(.+?),\s*\+\d+/);
    if (match1) {
      return match1[1].trim();
    }
    // Fallback: take everything after "TWINT Gutschrift" until the ID
    const match2 = text.match(/TWINT Gutschrift\s+(.+?)\s+\d{10,}/);
    if (match2) {
      return match2[1].trim().replace(/,$/, '');
    }
  }

  // TWINT Belastung: Extract store name
  if (text.startsWith('TWINT Belastung')) {
    // Pattern: "TWINT Belastung {Code} - {Store} {ID}"
    const match1 = text.match(/TWINT Belastung\s+\d+\s*-\s*(.+?)\s+\d{10,}/);
    if (match1) {
      return match1[1].trim();
    }
    // Pattern: "TWINT Belastung {Store} {ID}" (no code)
    const match2 = text.match(/TWINT Belastung\s+(.+?)\s+\d{10,}/);
    if (match2) {
      let name = match2[1].trim();
      // Remove store codes like "Coop-1167"
      name = name.replace(/^(Coop)-?\d+\s*/, '$1 ');
      return name.trim();
    }
  }

  // Standard: Company/Person, Address format - take first part before comma
  if (text.includes(',')) {
    return text.split(',')[0].trim();
  }

  // Fallback: return full text (truncated)
  return text.slice(0, 50).trim();
}

/**
 * Parse Swiss date format (DD.MM.YYYY) to YYYY-MM-DD
 */
function parseSwissDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  // DD.MM.YYYY format
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

/**
 * Parse Revolut date format (YYYY-MM-DD HH:MM:SS) to YYYY-MM-DD
 */
function parseRevolutDate(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) {
    return new Date().toISOString().slice(0, 10);
  }
  // Take just the date part
  return dateStr.trim().slice(0, 10);
}

/**
 * Get a field value from a Revolut CSV row, trying multiple possible column names.
 * Supports both German and English CSV exports.
 */
function getRevolutField(
  row: Record<string, string>,
  ...fieldNames: string[]
): string {
  for (const name of fieldNames) {
    const val = row[name];
    if (val) {
      return typeof val === 'string' ? val.trim() : String(val);
    }
  }
  return '';
}

/**
 * Parse Swiss amount format to cents.
 * Handles formats like: 1'234.56, -1'234.56, CHF 1'234.56
 */
function parseSwissAmountToCents(amountStr: string): number | null {
  if (!amountStr) return null;
  // Remove currency prefix and clean
  const clean = amountStr
    .replace(/^CHF\s*/i, '')
    .replace(/'/g, '')
    .replace(',', '.')
    .trim();
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * Parse Migros Bank CSV and return structured transactions.
 * Matches the Python implementation's approach: parse raw CSV first, then find header.
 * Also extracts bank saldo from CSV header for balance verification.
 */
async function parseMigrosCSV(
  filepath: string,
  options: ParseFileOptions,
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  // Parse entire CSV with semicolon delimiter (like Python's csv.reader)
  let allRows: string[][];
  try {
    allRows = csv2json(contents, {
      columns: false, // Return arrays, not objects
      bom: true,
      delimiter: ';',
      quote: '"',
      trim: true,
      relax_column_count: true,
      skip_empty_lines: false, // Keep empty lines for accurate indexing
    });
  } catch (err) {
    errors.push({
      message: 'Failed parsing Migros Bank CSV: ' + err.message,
      internal: err.message,
    });
    return { errors, transactions: [] };
  }

  // Extract bank saldo from header (format: "Saldo:";"CHF 467459.69")
  // Matches Python: for row in rows: if row[0] == "Saldo:": ...
  let bankSaldo: number | undefined;
  for (const row of allRows) {
    if (row && row[0] === 'Saldo:') {
      const saldoStr = row[1] || '';
      bankSaldo = parseSwissAmountToCents(saldoStr) ?? undefined;
      if (bankSaldo !== undefined) {
        console.log(`Migros Bank saldo from CSV: ${bankSaldo / 100} CHF`);
      }
      break;
    }
  }

  // Find header row (first column is "Datum")
  let headerIdx = -1;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (row && row[0] && row[0].toLowerCase() === 'datum') {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    errors.push({
      message: 'Could not find header row in Migros Bank CSV',
      internal: 'Header row with "Datum" column not found',
    });
    return { errors, transactions: [] };
  }

  // Get header and detect column format (4, 6, or 7 columns like Python)
  const header = allRows[headerIdx];
  const numCols = header.filter(h => h).length;
  const hasSaldoColumn = numCols >= 7 && header[5]?.toLowerCase() === 'saldo';

  const transactions: StructuredTransaction[] = [];

  // Parse data rows
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || !row[0]) continue;

    // Extract fields based on column format (matching Python logic)
    let datum: string,
      buchungstext: string,
      mitteilung: string,
      betrag: string,
      valuta: string;

    if (numCols === 4) {
      // Simple format: Datum;Buchungstext;Betrag;Valuta
      [datum, buchungstext, betrag, valuta] = row;
      mitteilung = '';
    } else if (hasSaldoColumn && row.length >= 7) {
      // 7-column format: Datum;Buchungstext;Mitteilung;Referenz;Betrag;Saldo;Valuta
      [datum, buchungstext, mitteilung, , betrag, , valuta] = row;
    } else {
      // 6-column format: Datum;Buchungstext;Mitteilung;Referenz;Betrag;Valuta
      [datum, buchungstext, mitteilung, , betrag, valuta] = row;
    }

    if (!valuta || !betrag) continue;

    // Parse amount (Swiss format: 1'234.56)
    const cleanAmount = betrag.replace(/'/g, '').replace(',', '.');
    const amount = looselyParseAmount(cleanAmount);

    // Extract payee from Buchungstext
    const payee = extractPayeeFromBuchungstext(buchungstext || '');

    // Extract TWINT ID for duplicate detection
    const twintId = extractTwintId(buchungstext || '');

    // Build notes
    const notesParts: string[] = [];
    if (mitteilung) notesParts.push(mitteilung);
    if (buchungstext) notesParts.push(`[${buchungstext}]`);
    const notes = notesParts.join('\n');

    transactions.push({
      amount: amount ?? 0,
      date: parseSwissDate(valuta),
      payee_name: payee,
      imported_payee: payee,
      notes: options.importNotes ? notes : '',
      // Store TWINT ID as imported_id for duplicate detection
      ...(twintId && { imported_id: twintId }),
    } as StructuredTransaction);
  }

  return {
    errors,
    transactions,
    metadata: {
      bankSaldo,
      bankFormat: 'migros',
    },
  };
}

/**
 * Classify Revolut transaction type and detect transfer targets.
 * Based on Python FSD Section 16.
 */
function classifyRevolutTransaction(
  art: string,
  beschreibung: string,
  currency: string,
): { type: string; transferAccount: string | null } {
  const artLower = art.toLowerCase();
  const descLower = beschreibung.toLowerCase();

  // Topup: Bank -> Revolut (from "Konto Migros" or similar bank account)
  if (artLower === 'topup' || artLower === 'top-up') {
    // "Top-up by *XXXX" or "Payment from NAME"
    return { type: 'topup', transferAccount: null };
  }

  // SWIFT Transfer: Revolut -> Bank
  if (
    artLower === 'transfer' &&
    (descLower.includes('swift') || descLower.includes('sepa'))
  ) {
    return { type: 'swift_transfer', transferAccount: null };
  }

  // ATM Withdrawal: Revolut -> Cash (Kasse)
  if (artLower === 'atm' || descLower.includes('cash withdrawal')) {
    return { type: 'atm', transferAccount: null };
  }

  // Currency Exchange: Between Revolut currency accounts
  if (artLower === 'exchange' || descLower.includes('exchanged')) {
    // Extract target currency from description if possible
    const exchangeMatch = beschreibung.match(
      /(?:to|nach|->)\s*([A-Z]{3})/i,
    );
    const targetCurrency = exchangeMatch ? exchangeMatch[1].toUpperCase() : null;
    if (targetCurrency && targetCurrency !== currency) {
      return {
        type: 'exchange',
        transferAccount: `Revolut ${targetCurrency}`,
      };
    }
    return { type: 'exchange', transferAccount: null };
  }

  // Regular card payment or other transaction
  if (artLower === 'card payment' || artLower === 'kartenzahlung') {
    return { type: 'card_payment', transferAccount: null };
  }

  return { type: 'expense', transferAccount: null };
}

/**
 * Get Revolut account name based on currency.
 * All currencies -> "Revolut {CURRENCY}" (e.g., "Revolut CHF", "Revolut EUR")
 */
export function getRevolutAccountName(currency: string): string {
  const curr = currency?.toUpperCase() || 'CHF';
  return `Revolut ${curr}`;
}

/**
 * Parse Revolut CSV and return structured transactions with currency info.
 * Supports multi-currency import per Python FSD Section 16.
 */
async function parseRevolutCSV(
  filepath: string,
  options: ParseFileOptions,
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  // Auto-detect delimiter (tab or comma) from first line
  const firstLine = contents.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  let data: Record<string, string>[];
  try {
    data = csv2json(contents, {
      columns: true,
      bom: true,
      delimiter,
      quote: '"',
      trim: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
  } catch (err) {
    errors.push({
      message: 'Failed parsing Revolut CSV: ' + err.message,
      internal: err.message,
    });
    return { errors, transactions: [] };
  }

  const transactions: StructuredTransaction[] = [];

  for (const row of data) {
    // Skip pending/reverted transactions (like Python: only COMPLETED)
    const status = getRevolutField(row, 'State', 'Status');
    if (
      status &&
      status !== 'COMPLETED' &&
      status !== 'ABGESCHLOSSEN'
    ) {
      continue;
    }

    // Use completion date for transaction date
    const dateStr = getRevolutField(
      row,
      'Completed Date',
      'Datum des Abschlusses',
    );
    if (!dateStr) continue;

    const beschreibung = getRevolutField(row, 'Description', 'Beschreibung');
    const betrag = getRevolutField(row, 'Amount', 'Betrag');
    const art = getRevolutField(row, 'Type', 'Art');
    const currency = getRevolutField(row, 'Currency', 'Währung', 'WAhrung');
    const fee = getRevolutField(row, 'Fee', 'Gebühr');

    if (!betrag) continue;

    // Parse amount
    const cleanAmount = betrag.replace(/'/g, '').replace(',', '.');
    const amount = looselyParseAmount(cleanAmount);

    // Classify transaction type and detect transfers
    const { type: txnType, transferAccount } = classifyRevolutTransaction(
      art,
      beschreibung,
      currency,
    );

    // Use start date + currency + amount for unique ID (keeps compatibility with existing data)
    const startDateStr = getRevolutField(
      row,
      'Started Date',
      'Datum des Beginns',
    );
    const uniqueId = `REV_${currency}_${startDateStr}_${betrag}`
      .replace(/\s+/g, '_')
      .replace(/:/g, '')
      .slice(0, 50);

    // Build notes with transaction type info
    const notesParts: string[] = [];
    if (art) notesParts.push(`[${art}]`);
    if (currency && currency !== 'CHF') {
      notesParts.push(`[Original: ${betrag} ${currency}]`);
    }
    if (fee && parseFloat(fee.replace(',', '.')) !== 0) {
      notesParts.push(`Gebühr: ${fee} ${currency}`);
    }

    transactions.push({
      amount: amount ?? 0,
      date: parseRevolutDate(dateStr),
      payee_name: beschreibung,
      imported_payee: beschreibung,
      notes: options.importNotes ? notesParts.join('\n') : '',
      // Multi-currency support
      currency: currency || 'CHF',
      transaction_type: txnType,
      transfer_account: transferAccount,
      ...(uniqueId && { imported_id: uniqueId }),
    } as StructuredTransaction);
  }

  // Collect unique currencies found
  const currencies = [
    ...new Set(
      transactions
        .map(t => (t as StructuredTransaction).currency)
        .filter(Boolean),
    ),
  ];

  return {
    errors,
    transactions,
    metadata: {
      bankFormat: 'revolut',
      currencies: currencies as string[],
    },
  };
}

export async function parseFile(
  filepath: string,
  options: ParseFileOptions = {},
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const m = filepath.match(/\.[^.]*$/);

  if (m) {
    const ext = m[0];

    switch (ext.toLowerCase()) {
      case '.qif':
        return parseQIF(filepath, options);
      case '.csv':
      case '.tsv':
        return parseCSV(filepath, options);
      case '.ofx':
      case '.qfx':
        return parseOFX(filepath, options);
      case '.xml':
        return parseCAMT(filepath, options);
      default:
    }
  }

  errors.push({
    message: 'Invalid file type',
    internal: '',
  });
  return { errors, transactions: [] };
}

async function parseCSV(
  filepath: string,
  options: ParseFileOptions,
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  // Check for Swiss bank format (auto-detect or explicit)
  let swissFormat = options.swissBankFormat;
  if (swissFormat === 'auto' || swissFormat === undefined) {
    swissFormat = detectSwissBankFormat(contents);
  }

  if (swissFormat === 'migros') {
    return parseMigrosCSV(filepath, options);
  }
  if (swissFormat === 'revolut') {
    return parseRevolutCSV(filepath, options);
  }

  // Standard CSV parsing
  let processedContents = contents;

  const skipStart = Math.max(0, options.skipStartLines || 0);
  const skipEnd = Math.max(0, options.skipEndLines || 0);

  if (skipStart > 0 || skipEnd > 0) {
    const lines = processedContents.split(/\r?\n/);

    if (skipStart + skipEnd >= lines.length) {
      errors.push({
        message: 'Cannot skip more lines than exist in the file',
        internal: `Attempted to skip ${skipStart} start + ${skipEnd} end lines from ${lines.length} total lines`,
      });
      return { errors, transactions: [] };
    }

    const startLine = skipStart;
    const endLine = skipEnd > 0 ? lines.length - skipEnd : lines.length;
    processedContents = lines.slice(startLine, endLine).join('\r\n');
  }

  let data: ReturnType<typeof csv2json>;
  try {
    data = csv2json(processedContents, {
      columns: options?.hasHeaderRow,
      bom: true,
      delimiter: options?.delimiter || ',',

      quote: '"',
      trim: true,
      relax_column_count: true,
      skip_empty_lines: true,
    });
  } catch (err) {
    errors.push({
      message: 'Failed parsing: ' + err.message,
      internal: err.message,
    });
    return { errors, transactions: [] };
  }

  return { errors, transactions: data };
}

async function parseQIF(
  filepath: string,
  options: ParseFileOptions = {},
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  let data: ReturnType<typeof qif2json>;
  try {
    data = qif2json(contents);
  } catch (err) {
    errors.push({
      message: "Failed parsing: doesn't look like a valid QIF file.",
      internal: err.stack,
    });
    return { errors, transactions: [] };
  }

  return {
    errors: [],
    transactions: data.transactions
      .map(trans => ({
        amount: trans.amount != null ? looselyParseAmount(trans.amount) : null,
        date: trans.date,
        payee_name: trans.payee,
        imported_payee: trans.payee,
        notes: options.importNotes ? trans.memo || null : null,
      }))
      .filter(trans => trans.date != null && trans.amount != null),
  };
}

async function parseOFX(
  filepath: string,
  options: ParseFileOptions,
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  let data: Awaited<ReturnType<typeof ofx2json>>;
  try {
    data = await ofx2json(contents);
  } catch (err) {
    errors.push({
      message: 'Failed importing file',
      internal: err.stack,
    });
    return { errors };
  }

  // Banks don't always implement the OFX standard properly
  // If no payee is available try and fallback to memo
  const useMemoFallback = options.fallbackMissingPayeeToMemo;

  return {
    errors,
    transactions: data.transactions.map(trans => {
      const parsedAmount = parseOfxAmount(trans.amount);
      if (parsedAmount === null) {
        errors.push({
          message: `Invalid amount format: ${trans.amount}`,
          internal: `Failed to parse amount: ${trans.amount}`,
        });
      }

      return {
        amount: parsedAmount || 0,
        imported_id: trans.fitId,
        date: trans.date,
        payee_name: trans.name || (useMemoFallback ? trans.memo : null),
        imported_payee: trans.name || (useMemoFallback ? trans.memo : null),
        notes: options.importNotes ? trans.memo || null : null, //memo used for payee
      };
    }),
  };
}

async function parseCAMT(
  filepath: string,
  options: ParseFileOptions = {},
): Promise<ParseFileResult> {
  const errors = Array<ParseError>();
  const contents = await fs.readFile(filepath);

  let data: Awaited<ReturnType<typeof xmlCAMT2json>>;
  try {
    data = await xmlCAMT2json(contents);
  } catch (err) {
    logger.error(err);
    errors.push({
      message: 'Failed importing file',
      internal: err.stack,
    });
    return { errors };
  }

  return {
    errors,
    transactions: data.map(trans => ({
      ...trans,
      notes: options.importNotes ? trans.notes : null,
    })),
  };
}
