import React, { type ComponentProps } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  type CategoryEntity,
  type CategoryGroupEntity,
} from 'loot-core/types/models';

import { type TransactionCategoryMap } from '@desktop-client/components/modals/ImportTransactionsModal/hooks/useSwissBankImport';
import { SwissTransaction } from '@desktop-client/components/modals/ImportTransactionsModal/SwissTransaction';
import { Transaction } from '@desktop-client/components/modals/ImportTransactionsModal/Transaction';
import {
  type DateFormat,
  type FieldMapping,
  type ImportTransaction,
} from '@desktop-client/components/modals/ImportTransactionsModal/utils';
import {
  TableHeader,
  TableWithNavigator,
} from '@desktop-client/components/table';

export type TransactionListProps = {
  transactions: ImportTransaction[];
  // Display options
  showParsed?: boolean;
  showStatus?: boolean;
  showCurrency?: boolean;
  isSwissBankImport?: boolean;
  // Parsing options
  parseDateFormat: ComponentProps<typeof Transaction>['parseDateFormat'];
  dateFormat: string; // Accept string since useDateFormat() returns string
  fieldMappings: FieldMapping | null;
  splitMode: boolean;
  inOutMode: boolean;
  outValue: string;
  flipAmount: boolean;
  multiplierAmount: string;
  // Categories
  categories: CategoryEntity[];
  categoryGroups: CategoryGroupEntity[];
  // Selection
  reconcile: boolean;
  onCheckTransaction: (transactionId: string) => void;
  // Swiss bank category/notes editing
  transactionCategories?: TransactionCategoryMap;
  onTransactionCategoryChange?: (
    transactionId: string,
    category: string | null,
  ) => void;
  transactionNotes?: Map<string, string | null>;
  onTransactionNotesChange?: (
    transactionId: string,
    notes: string | null,
  ) => void;
  // Headers configuration
  headers: ComponentProps<typeof TableHeader>['headers'];
};

export function TransactionList({
  transactions,
  showParsed = false,
  showStatus = false,
  showCurrency = false,
  isSwissBankImport = false,
  parseDateFormat,
  dateFormat,
  fieldMappings,
  splitMode,
  inOutMode,
  outValue,
  flipAmount,
  multiplierAmount,
  categories,
  categoryGroups,
  reconcile,
  onCheckTransaction,
  transactionCategories,
  onTransactionCategoryChange,
  transactionNotes,
  onTransactionNotesChange,
  headers,
}: TransactionListProps) {
  const filteredTransactions = transactions.filter(
    trans =>
      !trans.isMatchedTransaction || (trans.isMatchedTransaction && reconcile),
  );

  return (
    <View
      style={{
        flex: 'unset',
        height: 300,
        border: '1px solid ' + theme.tableBorder,
      }}
    >
      <TableHeader headers={headers} />
      <TableWithNavigator
        // @ts-expect-error - ImportTransaction is compatible with TableItem for our purposes
        items={filteredTransactions}
        fields={['payee', 'category', 'amount']}
        style={{ backgroundColor: theme.tableHeaderBackground }}
        getItemKey={index => String(index)}
        renderEmpty={() => (
          <View
            style={{
              textAlign: 'center',
              marginTop: 25,
              color: theme.tableHeaderText,
              fontStyle: 'italic',
            }}
          >
            <Trans>No transactions found</Trans>
          </View>
        )}
        renderItem={({ item }) => {
          const trans = item as unknown as ImportTransaction;
          return (
            <View>
              {isSwissBankImport ? (
                <SwissTransaction
                  transaction={trans}
                  parseDateFormat={parseDateFormat}
                  dateFormat={dateFormat as DateFormat}
                  splitMode={splitMode}
                  flipAmount={flipAmount}
                  multiplierAmount={multiplierAmount}
                  categories={categories}
                  categoryGroups={categoryGroups}
                  onCheckTransaction={onCheckTransaction}
                  reconcile={reconcile}
                  showStatus={showStatus}
                  showCurrency={showCurrency}
                  selectedCategory={
                    transactionCategories?.get(trans.trx_id)?.selectedCategory
                  }
                  onCategoryChange={onTransactionCategoryChange}
                  editedNotes={transactionNotes?.get(trans.trx_id)}
                  onNotesChange={onTransactionNotesChange}
                />
              ) : (
                <Transaction
                  transaction={trans}
                  showParsed={showParsed}
                  parseDateFormat={parseDateFormat}
                  dateFormat={dateFormat as DateFormat}
                  fieldMappings={fieldMappings!}
                  splitMode={splitMode}
                  inOutMode={inOutMode}
                  outValue={outValue}
                  flipAmount={flipAmount}
                  multiplierAmount={multiplierAmount}
                  categories={categories}
                  onCheckTransaction={onCheckTransaction}
                  reconcile={reconcile}
                  showStatus={showStatus}
                />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
