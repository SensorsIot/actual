import React, { type ComponentProps } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { type CategoryEntity, type CategoryGroupEntity } from 'loot-core/types/models';

import { Transaction } from '../Transaction';
import { type DateFormat, type FieldMapping, type ImportTransaction } from '../utils';

import {
  TableHeader,
  TableWithNavigator,
} from '@desktop-client/components/table';

import { type TransactionCategoryMap } from '../hooks/useSwissBankImport';

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
  onTransactionCategoryChange?: (transactionId: string, category: string | null) => void;
  transactionNotes?: Map<string, string | null>;
  onTransactionNotesChange?: (transactionId: string, notes: string | null) => void;
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
      !trans.isMatchedTransaction ||
      (trans.isMatchedTransaction && reconcile),
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
              <Transaction
                transaction={trans}
                showParsed={showParsed}
                parseDateFormat={parseDateFormat}
                dateFormat={dateFormat as DateFormat}
                fieldMappings={fieldMappings}
                splitMode={splitMode}
                inOutMode={inOutMode}
                outValue={outValue}
                flipAmount={flipAmount}
                multiplierAmount={multiplierAmount}
                categories={categories}
                categoryGroups={categoryGroups}
                onCheckTransaction={onCheckTransaction}
                reconcile={reconcile}
                showStatus={showStatus}
                showCurrency={showCurrency}
                isSwissBankImport={isSwissBankImport}
                selectedCategory={(() => {
                  const catInfo = transactionCategories?.get(trans.trx_id);
                  const selectedCat = catInfo?.selectedCategory;
                  if (isSwissBankImport) {
                    console.log('[TransactionList] Rendering transaction:', {
                      trx_id: trans.trx_id,
                      payee: trans.payee_name,
                      existing: trans.existing,
                      hasCatInfo: !!catInfo,
                      selectedCat,
                      transCategory: trans.category,
                    });
                  }
                  return selectedCat;
                })()}
                onCategoryChange={onTransactionCategoryChange}
                editedNotes={transactionNotes?.get(trans.trx_id)}
                onNotesChange={onTransactionNotesChange}
              />
            </View>
          );
        }}
      />
    </View>
  );
}
