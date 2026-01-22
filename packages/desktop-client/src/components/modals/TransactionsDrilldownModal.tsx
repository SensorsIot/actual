import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { q } from 'loot-core/shared/query';
import * as monthUtils from 'loot-core/shared/months';
import { type TransactionEntity } from 'loot-core/types/models';

import { Modal, ModalCloseButton, ModalHeader } from '@desktop-client/components/common/Modal';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { Row, Cell, Field, Table } from '@desktop-client/components/table';
import { DisplayId } from '@desktop-client/components/util/DisplayId';
import { useCategory } from '@desktop-client/hooks/useCategory';
import { useDateFormat } from '@desktop-client/hooks/useDateFormat';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useModalState } from '@desktop-client/hooks/useModalState';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { aqlQuery } from '@desktop-client/queries/aqlQuery';
import { useDispatch } from '@desktop-client/redux';

type TransactionsDrilldownModalProps = {
  categoryId: string;
  categoryName: string;
  month?: string;
  startDate: string;
  endDate: string;
  onTransactionChange?: () => void;
};

// Helper component to display category name
function CategoryDisplay({ id }: { id: string | null }) {
  const { t } = useTranslation();
  const category = useCategory(id || '');

  if (!id || !category) {
    return <span style={{ color: theme.pageTextSubdued }}>{t('Uncategorized')}</span>;
  }

  return <span>{category.name}</span>;
}

export function TransactionsDrilldownModal({
  categoryId,
  categoryName,
  month,
  startDate,
  endDate,
  onTransactionChange,
}: TransactionsDrilldownModalProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const dispatch = useDispatch();
  const { onClose } = useModalState();
  const [transactions, setTransactions] = useState<TransactionEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate title based on month or date range
  const title = month
    ? `${categoryName} - ${monthUtils.format(month, 'MMMM yyyy')}`
    : `${categoryName} (${monthUtils.format(startDate, 'MMM yyyy')} - ${monthUtils.format(endDate, 'MMM yyyy')})`;

  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true);
      try {
        const query = q('transactions')
          .filter({
            $and: [
              { category: categoryId },
              { date: { $gte: startDate } },
              { date: { $lte: endDate } },
            ],
          })
          .select(['id', 'date', 'payee', 'notes', 'amount', 'account', 'category'])
          .options({ splits: 'inline' });

        const { data } = await aqlQuery(query);
        // Sort by date descending
        const sorted = (data as TransactionEntity[]).sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        setTransactions(sorted);
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTransactions();
  }, [categoryId, startDate, endDate]);

  const handleCategoryChange = (transaction: TransactionEntity) => {
    dispatch(
      pushModal({
        modal: {
          name: 'category-autocomplete',
          options: {
            title: t('Change Category'),
            closeOnSelect: true,
            onSelect: async (newCategoryId: string) => {
              // Update the transaction's category
              await send('transaction-update', {
                ...transaction,
                category: newCategoryId,
              });

              // Remove the transaction from the list since it's no longer in this category
              setTransactions(prev =>
                prev.filter(t => t.id !== transaction.id),
              );

              // Notify parent that a transaction was changed
              onTransactionChange?.();
            },
            onClose: () => {},
          },
        },
      }),
    );
  };

  // Calculate total
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Modal
      name="transactions-drilldown"
      onClose={onClose}
      containerProps={{
        style: {
          width: 900,
          maxWidth: '95vw',
        },
      }}
    >
      <ModalHeader
        title={title}
        rightContent={<ModalCloseButton onPress={onClose} />}
      />
      <View style={{ flex: 1, maxHeight: '60vh', overflow: 'hidden' }}>
        {isLoading ? (
          <View
            style={{
              padding: 20,
              alignItems: 'center',
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>Loading transactions...</Trans>
          </View>
        ) : transactions.length === 0 ? (
          <View
            style={{
              padding: 20,
              alignItems: 'center',
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>No transactions found</Trans>
          </View>
        ) : (
          <View style={{ flex: 1, overflow: 'auto' }}>
            <Table
              style={{ flex: 1 }}
              items={transactions}
              headers={
                <>
                  <Field width={100}>
                    <Trans>Date</Trans>
                  </Field>
                  <Field width={200}>
                    <Trans>Payee</Trans>
                  </Field>
                  <Field width={180}>
                    <Trans>Category</Trans>
                  </Field>
                  <Field width="flex">
                    <Trans>Notes</Trans>
                  </Field>
                  <Field width={100} style={{ textAlign: 'right' }}>
                    <Trans>Amount</Trans>
                  </Field>
                </>
              }
              renderItem={({ item: transaction }) => (
                <Row key={transaction.id} style={{ color: theme.tableText }}>
                  <Field width={100}>
                    {monthUtils.format(transaction.date, dateFormat)}
                  </Field>
                  <Cell width={200} exposed style={{ alignItems: 'flex-start' }}>
                    {() =>
                      transaction.payee ? (
                        <DisplayId type="payees" id={transaction.payee} />
                      ) : (
                        ''
                      )
                    }
                  </Cell>
                  <Cell
                    width={180}
                    exposed
                    style={{
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleCategoryChange(transaction)}
                  >
                    {() => (
                      <View
                        style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: theme.tableBorderHover,
                        }}
                      >
                        <CategoryDisplay id={transaction.category} />
                      </View>
                    )}
                  </Cell>
                  <Field width="flex" title={transaction.notes || ''}>
                    {transaction.notes || ''}
                  </Field>
                  <Field
                    width={100}
                    style={{ textAlign: 'right', ...styles.tnum }}
                  >
                    <PrivacyFilter>
                      {format(transaction.amount, 'financial')}
                    </PrivacyFilter>
                  </Field>
                </Row>
              )}
            />
          </View>
        )}

        {/* Total row */}
        {!isLoading && transactions.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              padding: '10px 13px',
              borderTop: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.tableHeaderBackground,
              fontWeight: 600,
            }}
          >
            <View style={{ flex: 1 }}>
              <Trans>Total ({transactions.length} transactions)</Trans>
            </View>
            <View style={{ width: 100, textAlign: 'right', ...styles.tnum }}>
              <PrivacyFilter>{format(total, 'financial')}</PrivacyFilter>
            </View>
          </View>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          marginTop: 20,
        }}
      >
        <Button variant="primary" onPress={onClose}>
          <Trans>Close</Trans>
        </Button>
      </View>
    </Modal>
  );
}
