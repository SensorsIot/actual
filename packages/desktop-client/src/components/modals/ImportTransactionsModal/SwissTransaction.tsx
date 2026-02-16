import React, { useCallback, useMemo, type ComponentProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { SvgDownAndRightArrow } from '@actual-app/components/icons/v2';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';

import { amountToCurrency } from 'loot-core/shared/util';
import {
  type CategoryEntity,
  type CategoryGroupEntity,
} from 'loot-core/types/models';

import {
  formatDate,
  parseAmountFields,
  parseDate,
  type DateFormat,
  type ImportTransaction,
} from './utils';

import { Checkbox } from '@desktop-client/components/forms';
import { Field, Row } from '@desktop-client/components/table';

type SwissTransactionProps = {
  transaction: ImportTransaction;
  parseDateFormat?: DateFormat;
  dateFormat: DateFormat;
  splitMode: boolean;
  flipAmount: boolean;
  multiplierAmount: string;
  categories: CategoryEntity[];
  categoryGroups: CategoryGroupEntity[];
  onCheckTransaction: (transactionId: string) => void;
  reconcile: boolean;
  showStatus?: boolean;
  showCurrency?: boolean;
  selectedCategory?: string | null;
  onCategoryChange?: (transactionId: string, category: string | null) => void;
  editedNotes?: string | null;
  onNotesChange?: (transactionId: string, notes: string | null) => void;
};

export function SwissTransaction({
  transaction,
  parseDateFormat,
  dateFormat,
  splitMode,
  flipAmount,
  multiplierAmount,
  categories,
  categoryGroups,
  onCheckTransaction,
  reconcile,
  showStatus = false,
  showCurrency = false,
  selectedCategory,
  onCategoryChange,
  editedNotes,
  onNotesChange,
}: SwissTransactionProps) {
  const { t } = useTranslation();

  const getCategoryDisplayName = useCallback(
    (categoryId: string | undefined) => {
      if (!categoryId) return null;

      if (categoryId.includes(':')) {
        return categoryId;
      }

      const category = categories.find(c => c.id === categoryId);
      if (category) {
        const group = categoryGroups.find(g =>
          g.categories?.some(cat => cat.id === categoryId),
        );
        if (group) {
          return `${group.name}:${category.name}`;
        }
        return category.name;
      }

      return null;
    },
    [categories, categoryGroups],
  );

  const { amount, outflow, inflow } = useMemo(
    () =>
      parseAmountFields(
        transaction,
        splitMode,
        false, // inOutMode
        '', // outValue
        flipAmount,
        multiplierAmount,
      ),
    [transaction, splitMode, flipAmount, multiplierAmount],
  );

  return (
    <Row
      style={{
        backgroundColor: theme.tableBackground,
        textDecoration: transaction.tombstone ? 'line-through' : 'none',
        color:
          (transaction.isMatchedTransaction && !transaction.selected_merge) ||
          !transaction.selected ||
          transaction.tombstone
            ? theme.tableTextInactive
            : theme.tableText,
      }}
    >
      {reconcile && (
        <Field width={31}>
          {!transaction.isMatchedTransaction && (
            <Tooltip
              content={
                transaction.tombstone
                  ? t('This transaction will be deleted by Rules')
                  : !transaction.existing && !transaction.ignored
                    ? t('New transaction. You can import it, or skip it.')
                    : transaction.ignored
                      ? t(
                          'Already imported transaction. You can skip it, or import it again.',
                        )
                      : transaction.existing
                        ? t(
                            'Updated transaction. You can update it, import it again, or skip it.',
                          )
                        : ''
              }
              placement="right top"
            >
              <Checkbox
                checked={transaction.selected && !transaction.tombstone}
                onChange={() => onCheckTransaction(transaction.trx_id)}
                style={
                  transaction.selected_merge
                    ? {
                        ':checked': {
                          '::after': {
                            background:
                              theme.checkboxBackgroundSelected +
                              // update sign from packages/desktop-client/src/icons/v1/layer.svg

                              ' url(\'data:image/svg+xml; utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="white" d="M10 1l10 6-10 6L0 7l10-6zm6.67 10L20 13l-10 6-10-6 3.33-2L10 15l6.67-4z" /></svg>\') 9px 9px',
                          },
                        },
                      }
                    : transaction.tombstone
                      ? {
                          '&': {
                            opacity: 0.3,
                            backgroundColor: theme.buttonNormalDisabledBorder,
                          },
                        }
                      : {
                          '&': {
                            border:
                              '1px solid ' + theme.buttonNormalDisabledBorder,
                            backgroundColor: theme.buttonNormalDisabledBorder,
                            '::after': {
                              display: 'block',
                              background:
                                theme.buttonNormalDisabledBorder +
                                // minus sign adapted from packages/desktop-client/src/icons/v1/add.svg

                                ' url(\'data:image/svg+xml; utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" className="path" d="M23,11.5 L23,11.5 L23,11.5 C23,12.3284271 22.3284271,13 21.5,13 L1.5,13 L1.5,13 C0.671572875,13 1.01453063e-16,12.3284271 0,11.5 L0,11.5 L0,11.5 C-1.01453063e-16,10.6715729 0.671572875,10 1.5,10 L21.5,10 L21.5,10 C22.3284271,10 23,10.6715729 23,11.5 Z" /></svg>\') 9px 9px',
                              width: 9,
                              height: 9,

                              content: '" "',
                            },
                          },
                          ':checked': {
                            border: '1px solid ' + theme.checkboxBorderSelected,
                            backgroundColor: theme.checkboxBackgroundSelected,
                            '::after': {
                              background:
                                theme.checkboxBackgroundSelected +
                                // plus sign from packages/desktop-client/src/icons/v1/add.svg

                                ' url(\'data:image/svg+xml; utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" className="path" d="M23,11.5 L23,11.5 L23,11.5 C23,12.3284271 22.3284271,13 21.5,13 L1.5,13 L1.5,13 C0.671572875,13 1.01453063e-16,12.3284271 0,11.5 L0,11.5 L0,11.5 C-1.01453063e-16,10.6715729 0.671572875,10 1.5,10 L21.5,10 L21.5,10 C22.3284271,10 23,10.6715729 23,11.5 Z" /><path fill="white" className="path" d="M11.5,23 C10.6715729,23 10,22.3284271 10,21.5 L10,1.5 C10,0.671572875 10.6715729,1.52179594e-16 11.5,0 C12.3284271,-1.52179594e-16 13,0.671572875 13,1.5 L13,21.5 C13,22.3284271 12.3284271,23 11.5,23 Z" /></svg>\') 9px 9px',
                            },
                          },
                        }
                }
              />
            </Tooltip>
          )}
        </Field>
      )}
      <Field width={90}>
        {transaction.isMatchedTransaction ? (
          <View>
            <SpaceBetween style={{ alignItems: 'flex-start' }}>
              <View>
                <SvgDownAndRightArrow width={16} height={16} />
              </View>
              <View>{formatDate(transaction.date ?? null, dateFormat)}</View>
            </SpaceBetween>
          </View>
        ) : (
          <View style={{ color: theme.noticeTextLight }}>
            {formatDate(
              parseDateFormat
                ? parseDate(transaction.date ?? '', parseDateFormat)
                : (transaction.date ?? null),
              dateFormat,
            )}
          </View>
        )}
      </Field>
      <Field
        width={250}
        title={transaction.imported_payee || transaction.payee_name}
      >
        {transaction.payee_name}
      </Field>
      {showCurrency && (
        <Field
          width={60}
          contentStyle={{
            textAlign: 'center',
            fontWeight: 500,
            fontSize: '0.85em',
          }}
        >
          {(transaction as { currency?: string }).currency || 'CHF'}
        </Field>
      )}
      <Field width={250} title={editedNotes ?? transaction.notes}>
        {!transaction.isMatchedTransaction ? (
          <textarea
            value={editedNotes ?? transaction.notes ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              onNotesChange?.(transaction.trx_id, e.target.value || null);
            }}
            rows={2}
            style={{
              fontSize: '0.85em',
              padding: '2px 4px',
              width: '100%',
              resize: 'none',
              border: '1px solid ' + theme.tableBorder,
              borderRadius: 4,
              fontFamily: 'inherit',
            }}
          />
        ) : (
          (editedNotes ?? transaction.notes)
        )}
      </Field>
      <Field
        width={200}
        title={
          selectedCategory ||
          getCategoryDisplayName(transaction.category) ||
          undefined
        }
      >
        {['swift_transfer', 'atm', 'exchange'].includes(
          (transaction as { transaction_type?: string }).transaction_type || '',
        ) ? (
          <View
            style={{
              color: theme.pageTextSubdued,
              fontStyle: 'italic',
              fontSize: '0.85em',
            }}
          >
            <Trans>Transfer</Trans>
          </View>
        ) : !transaction.isMatchedTransaction ? (
          <Select
            value={
              selectedCategory ||
              getCategoryDisplayName(transaction.category) ||
              ''
            }
            onChange={(value: string) => {
              onCategoryChange?.(transaction.trx_id, value || null);
            }}
            options={[
              ['', t('Select category...')],
              ...categoryGroups
                .flatMap(group =>
                  (group.categories || []).map(cat => {
                    const fullName = `${group.name}:${cat.name}`;
                    return [fullName, fullName] as [string, string];
                  }),
                )
                .sort((a, b) => a[0].localeCompare(b[0])),
            ]}
            style={{
              fontSize: '0.85em',
              padding: '4px 6px',
              minHeight: 32,
              width: '100%',
              backgroundColor:
                !selectedCategory &&
                !getCategoryDisplayName(transaction.category)
                  ? theme.errorBackground
                  : theme.tableBackground,
              border:
                '1px solid ' +
                (!selectedCategory &&
                !getCategoryDisplayName(transaction.category)
                  ? theme.errorBorder
                  : theme.tableBorder),
              borderRadius: 4,
              color:
                !selectedCategory &&
                !getCategoryDisplayName(transaction.category)
                  ? theme.errorText
                  : undefined,
            }}
          />
        ) : (
          selectedCategory || getCategoryDisplayName(transaction.category)
        )}
      </Field>
      {showStatus && !transaction.isMatchedTransaction && (
        <Field
          width={80}
          contentStyle={{
            textAlign: 'center',
            fontWeight: 500,
            fontSize: '0.85em',
            color:
              transaction.ignored || transaction.existing
                ? theme.warningText
                : theme.noticeText,
          }}
          title={
            transaction.ignored || transaction.existing
              ? t('Already in database')
              : t('New transaction')
          }
        >
          {transaction.ignored || transaction.existing ? 'vorhanden' : 'neu'}
        </Field>
      )}
      {splitMode ? (
        <>
          <Field
            width={90}
            contentStyle={{
              textAlign: 'right',
              ...styles.tnum,
              ...(inflow === null && outflow === null
                ? { color: theme.errorText }
                : {}),
            }}
            title={
              outflow === null
                ? t('Invalid: unable to parse the value')
                : amountToCurrency(outflow)
            }
          >
            {amountToCurrency(outflow || 0)}
          </Field>
          <Field
            width={90}
            contentStyle={{
              textAlign: 'right',
              ...styles.tnum,
              ...(inflow === null && outflow === null
                ? { color: theme.errorText }
                : {}),
            }}
            title={
              inflow === null
                ? t('Invalid: unable to parse the value')
                : amountToCurrency(inflow)
            }
          >
            {amountToCurrency(inflow || 0)}
          </Field>
        </>
      ) : (
        <Field
          width={90}
          contentStyle={{
            textAlign: 'right',
            ...styles.tnum,
            ...(amount === null ? { color: theme.errorText } : {}),
          }}
          title={
            amount === null
              ? t('Invalid: unable to parse the value ({{amount}})', {
                  amount: transaction.amount,
                })
              : amountToCurrency(amount)
          }
        >
          {amountToCurrency(amount || 0)}
        </Field>
      )}
    </Row>
  );
}
