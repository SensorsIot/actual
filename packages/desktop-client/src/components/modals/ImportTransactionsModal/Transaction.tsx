import React, { useMemo, useCallback, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { SvgDownAndRightArrow } from '@actual-app/components/icons/v2';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';

import { amountToCurrency } from 'loot-core/shared/util';
import { type CategoryEntity, type CategoryGroupEntity } from 'loot-core/types/models';

import { ParsedDate } from './ParsedDate';
import {
  applyFieldMappings,
  formatDate,
  parseAmountFields,
  parseDate,
  type FieldMapping,
  type ImportTransaction,
} from './utils';

import { Checkbox } from '@desktop-client/components/forms';
import { Field, Row } from '@desktop-client/components/table';

type TransactionProps = {
  transaction: ImportTransaction;
  fieldMappings: FieldMapping;
  showParsed: boolean;
  parseDateFormat: ComponentProps<typeof ParsedDate>['parseDateFormat'];
  dateFormat: ComponentProps<typeof ParsedDate>['dateFormat'];
  splitMode: boolean;
  inOutMode: boolean;
  outValue: string;
  flipAmount: boolean;
  multiplierAmount: string;
  categories: CategoryEntity[];
  categoryGroups?: CategoryGroupEntity[];
  onCheckTransaction: (transactionId: string) => void;
  reconcile: boolean;
  showStatus?: boolean; // Show duplicate/new status column
  showCurrency?: boolean; // Show currency column (for Revolut imports)
  // Swiss bank import category selection
  isSwissBankImport?: boolean;
  selectedCategory?: string | null; // "Group:Category" format
  onCategoryChange?: (transactionId: string, category: string | null) => void;
  // Notes editing for Swiss bank imports
  editedNotes?: string | null;
  onNotesChange?: (transactionId: string, notes: string | null) => void;
};

export function Transaction({
  transaction: rawTransaction,
  fieldMappings,
  showParsed,
  parseDateFormat,
  dateFormat,
  splitMode,
  inOutMode,
  outValue,
  flipAmount,
  multiplierAmount,
  categories,
  categoryGroups = [],
  onCheckTransaction,
  reconcile,
  showStatus = false,
  showCurrency = false,
  isSwissBankImport = false,
  selectedCategory,
  onCategoryChange,
  editedNotes,
  onNotesChange,
}: TransactionProps) {
  const { t } = useTranslation();

  const categoryList = categories.map(category => category.name);

  // Look up category name from ID for existing transactions
  const getCategoryDisplayName = useCallback((categoryId: string | undefined) => {
    if (!categoryId) return null;

    // First check if it's already a name (format "Group:Category")
    if (categoryId.includes(':')) {
      return categoryId;
    }

    // Look up by ID
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      const group = categoryGroups.find(g =>
        g.categories?.some(cat => cat.id === categoryId)
      );
      if (group) {
        return `${group.name}:${category.name}`;
      }
      return category.name;
    }

    return null;
  }, [categories, categoryGroups]);

  const transaction = useMemo(
    () =>
      fieldMappings && !rawTransaction.isMatchedTransaction
        ? applyFieldMappings(rawTransaction, fieldMappings)
        : rawTransaction,
    [rawTransaction, fieldMappings],
  );

  const { amount, outflow, inflow } = useMemo(() => {
    if (rawTransaction.isMatchedTransaction) {
      const amount = rawTransaction.amount;

      return {
        amount,
        outflow: splitMode ? (amount < 0 ? -amount : 0) : null,
        inflow: splitMode ? (amount > 0 ? amount : 0) : null,
      };
    }

    return parseAmountFields(
      transaction,
      splitMode,
      inOutMode,
      outValue,
      flipAmount,
      multiplierAmount,
    );
  }, [
    rawTransaction,
    transaction,
    splitMode,
    inOutMode,
    outValue,
    flipAmount,
    multiplierAmount,
  ]);

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
        ) : isSwissBankImport ? (
          // For Swiss bank imports, only show the formatted date (green), not the original → parsed format
          <View style={{ color: theme.noticeTextLight }}>
            {formatDate(
              parseDateFormat ? parseDate(transaction.date ?? '', parseDateFormat) : transaction.date ?? null,
              dateFormat,
            )}
          </View>
        ) : showParsed ? (
          <ParsedDate
            parseDateFormat={parseDateFormat}
            dateFormat={dateFormat}
            date={transaction.date}
          />
        ) : (
          formatDate(transaction.date ?? null, dateFormat)
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
        {/* Show textarea for ALL Swiss bank import transactions (new and existing) */}
        {isSwissBankImport && !transaction.isMatchedTransaction ? (
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
          editedNotes ?? transaction.notes
        )}
      </Field>
      <Field
        width={200}
        title={
          selectedCategory || getCategoryDisplayName(transaction.category) || undefined
        }
      >
        {/* Transfer transactions don't need categories */}
        {isSwissBankImport && ['swift_transfer', 'atm', 'exchange'].includes((transaction as { transaction_type?: string }).transaction_type || '') ? (
          <View style={{ color: theme.pageTextSubdued, fontStyle: 'italic', fontSize: '0.85em' }}>
            {t('Transfer')}
          </View>
        ) : isSwissBankImport && !transaction.isMatchedTransaction ? (
          <Select
            value={selectedCategory || getCategoryDisplayName(transaction.category) || ''}
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
                  })
                )
                .sort((a, b) => a[0].localeCompare(b[0])),
            ]}
            style={{
              fontSize: '0.85em',
              padding: '4px 6px',
              minHeight: 32,
              width: '100%',
              backgroundColor: (!selectedCategory && !getCategoryDisplayName(transaction.category)) ? theme.errorBackground : theme.tableBackground,
              border: '1px solid ' + ((!selectedCategory && !getCategoryDisplayName(transaction.category)) ? theme.errorBorder : theme.tableBorder),
              borderRadius: 4,
              color: (!selectedCategory && !getCategoryDisplayName(transaction.category)) ? theme.errorText : undefined,
            }}
          />
        ) : (
          // Show text for non-Swiss imports only
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
            // For Swiss imports: neu (teal) or vorhanden (orange)
            // For non-Swiss: New (teal), Update (orange), Skip (red)
            color: isSwissBankImport
              ? (transaction.ignored || transaction.existing ? theme.warningText : theme.noticeText)
              : (transaction.ignored
                  ? theme.errorText
                  : transaction.existing
                    ? theme.warningText
                    : theme.noticeText),
          }}
          title={
            isSwissBankImport
              ? (transaction.ignored || transaction.existing
                  ? t('Already in database')
                  : t('New transaction'))
              : (transaction.ignored
                  ? t('Already imported - will be skipped')
                  : transaction.existing
                    ? t('Will update existing transaction')
                    : t('New transaction'))
          }
        >
          {isSwissBankImport
            ? (transaction.ignored || transaction.existing ? 'vorhanden' : 'neu')
            : (transaction.ignored ? t('Skip') : transaction.existing ? t('Update') : t('New'))}
        </Field>
      )}
      {inOutMode && (
        <Field
          width={90}
          contentStyle={{ textAlign: 'left', ...styles.tnum }}
          title={
            transaction.inOut === undefined
              ? undefined
              : String(transaction.inOut)
          }
        >
          {transaction.inOut}
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
