import { useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import { currencyToInteger, integerToCurrency } from 'loot-core/shared/util';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import {
  type YearlyBudgetCategoryData,
  type YearlyBudgetGroupData,
  type YearlyBudgetPlannerData,
} from '@desktop-client/components/reports/spreadsheets/yearly-budget-planner-spreadsheet';
import { Cell, Row } from '@desktop-client/components/table';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useLocale } from '@desktop-client/hooks/useLocale';

type EditedBudgets = Record<string, Record<string, number>>; // categoryId -> month -> amount
type YearlyBudgetInputs = Record<string, number>; // categoryId -> yearly budget input

type YearlyBudgetPlannerTableProps = {
  data: YearlyBudgetPlannerData;
  editedBudgets: EditedBudgets;
  yearlyBudgetInputs: YearlyBudgetInputs;
  onBudgetChange: (categoryId: string, month: string, amount: number) => void;
  onYearlyBudgetInputChange: (categoryId: string, amount: number) => void;
  onDistribute: (categoryId: string) => void;
};

export function YearlyBudgetPlannerTable({
  data,
  editedBudgets,
  yearlyBudgetInputs,
  onBudgetChange,
  onYearlyBudgetInputChange,
  onDistribute,
}: YearlyBudgetPlannerTableProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const locale = useLocale();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set([
      ...data.incomeGroups.map(g => g.id),
      ...data.expenseGroups.map(g => g.id),
    ]),
  );
  const [editingCell, setEditingCell] = useState<{
    categoryId: string;
    field: 'yearly' | string; // 'yearly' or month string
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const monthNames = useMemo(() => {
    return data.months.map(month => {
      return monthUtils.format(month, 'MMM', locale);
    });
  }, [data.months, locale]);

  // Column widths
  const categoryWidth = 180;
  const lastYearWidth = 90;
  const yearlyBudgetWidth = 100;
  const distributeWidth = 70;
  const monthWidth = 75;
  const totalWidth = 90;

  const startEditing = useCallback(
    (categoryId: string, field: 'yearly' | string, currentValue: number) => {
      setEditingCell({ categoryId, field });
      setEditValue(integerToCurrency(currentValue));
    },
    [],
  );

  const commitEdit = useCallback(() => {
    if (editingCell) {
      const amount = currencyToInteger(editValue);
      if (editingCell.field === 'yearly') {
        onYearlyBudgetInputChange(editingCell.categoryId, amount);
      } else {
        onBudgetChange(editingCell.categoryId, editingCell.field, amount);
      }
      setEditingCell(null);
      setEditValue('');
    }
  }, [editingCell, editValue, onBudgetChange, onYearlyBudgetInputChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  // Get the current value for a category/month (edited or original)
  const getBudgetValue = useCallback(
    (category: YearlyBudgetCategoryData, month: string): number => {
      return (
        editedBudgets[category.id]?.[month] ?? category.monthBudgets[month] ?? 0
      );
    },
    [editedBudgets],
  );

  // Calculate row total for a category
  const getRowTotal = useCallback(
    (category: YearlyBudgetCategoryData) => {
      return data.months.reduce(
        (sum, month) => sum + getBudgetValue(category, month),
        0,
      );
    },
    [data.months, getBudgetValue],
  );

  // Calculate group totals
  const getGroupMonthTotal = useCallback(
    (group: YearlyBudgetGroupData, month: string) => {
      return group.categories.reduce(
        (sum, cat) => sum + getBudgetValue(cat, month),
        0,
      );
    },
    [getBudgetValue],
  );

  const getGroupLastYearTotal = useCallback((group: YearlyBudgetGroupData) => {
    return group.categories.reduce((sum, cat) => sum + cat.lastYearAmount, 0);
  }, []);

  const getGroupTotal = useCallback(
    (group: YearlyBudgetGroupData) => {
      return group.categories.reduce((sum, cat) => sum + getRowTotal(cat), 0);
    },
    [getRowTotal],
  );

  // Calculate overall totals from edited data
  const calculatedTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const group of data.incomeGroups) {
      totalIncome += getGroupTotal(group);
    }
    for (const group of data.expenseGroups) {
      totalExpenses += getGroupTotal(group);
    }

    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
    };
  }, [data.incomeGroups, data.expenseGroups, getGroupTotal]);

  const renderEditableCell = (
    categoryId: string,
    field: 'yearly' | string,
    value: number,
    width: number,
    isModified: boolean = false,
  ) => {
    const isEditing =
      editingCell?.categoryId === categoryId && editingCell?.field === field;

    return (
      <Cell
        width={width}
        plain
        style={{
          textAlign: 'right',
          padding: isEditing ? '0 2px' : undefined,
          backgroundColor: isModified
            ? theme.tableRowBackgroundHover
            : undefined,
        }}
      >
        {isEditing ? (
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              width: '100%',
              textAlign: 'right',
              padding: '2px 4px',
              fontSize: 'inherit',
            }}
          />
        ) : (
          <View
            style={{
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: 4,
            }}
            onClick={() => startEditing(categoryId, field, value)}
          >
            <PrivacyFilter>{format(value, 'financial')}</PrivacyFilter>
          </View>
        )}
      </Cell>
    );
  };

  const renderGroupSection = (
    groups: YearlyBudgetGroupData[],
    sectionTitle: string,
  ) => (
    <>
      {/* Section Header */}
      <Row
        style={{
          fontWeight: 700,
          backgroundColor: theme.tableHeaderBackground,
          color: theme.tableHeaderText,
        }}
      >
        <Cell width={categoryWidth} plain>
          {sectionTitle}
        </Cell>
        <Cell width={lastYearWidth} plain />
        <Cell width={yearlyBudgetWidth} plain />
        <Cell width={distributeWidth} plain />
        {data.months.map(month => (
          <Cell key={month} width={monthWidth} plain />
        ))}
        <Cell width={totalWidth} plain />
      </Row>

      {groups.map(group => (
        <View key={group.id}>
          {/* Group Header */}
          <Row
            style={{
              fontWeight: 600,
              backgroundColor: theme.tableRowHeaderBackground,
              color: theme.tableRowHeaderText,
              cursor: 'pointer',
            }}
            onClick={() => toggleGroup(group.id)}
          >
            <Cell width={categoryWidth} plain>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    transform: expandedGroups.has(group.id)
                      ? 'rotate(90deg)'
                      : 'rotate(0deg)',
                    marginRight: 5,
                    transition: 'transform 0.1s',
                  }}
                >
                  ▶
                </View>
                {group.name}
              </View>
            </Cell>
            <Cell width={lastYearWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(getGroupLastYearTotal(group), 'financial')}
              </PrivacyFilter>
            </Cell>
            <Cell width={yearlyBudgetWidth} plain />
            <Cell width={distributeWidth} plain />
            {data.months.map(month => (
              <Cell
                key={month}
                width={monthWidth}
                plain
                style={{ textAlign: 'right' }}
              >
                <PrivacyFilter>
                  {format(getGroupMonthTotal(group, month), 'financial')}
                </PrivacyFilter>
              </Cell>
            ))}
            <Cell width={totalWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(getGroupTotal(group), 'financial')}
              </PrivacyFilter>
            </Cell>
          </Row>

          {/* Categories */}
          {expandedGroups.has(group.id) &&
            group.categories.map(category => {
              const yearlyInput = yearlyBudgetInputs[category.id] || 0;
              const rowTotal = getRowTotal(category);

              return (
                <Row key={category.id}>
                  <Cell width={categoryWidth} plain>
                    <View style={{ paddingLeft: 20 }}>{category.name}</View>
                  </Cell>
                  <Cell
                    width={lastYearWidth}
                    plain
                    style={{ textAlign: 'right' }}
                  >
                    <PrivacyFilter>
                      {format(category.lastYearAmount, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  {renderEditableCell(
                    category.id,
                    'yearly',
                    yearlyInput,
                    yearlyBudgetWidth,
                  )}
                  <Cell width={distributeWidth} plain>
                    <Button
                      variant="bare"
                      onPress={() => onDistribute(category.id)}
                      style={{ fontSize: 11, padding: '2px 6px' }}
                    >
                      <Trans>Distribute</Trans>
                    </Button>
                  </Cell>
                  {data.months.map(month => {
                    const value = getBudgetValue(category, month);
                    const isModified =
                      editedBudgets[category.id]?.[month] !== undefined;

                    return renderEditableCell(
                      category.id,
                      month,
                      value,
                      monthWidth,
                      isModified,
                    );
                  })}
                  <Cell width={totalWidth} plain style={{ textAlign: 'right' }}>
                    <PrivacyFilter>
                      {format(rowTotal, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                </Row>
              );
            })}
        </View>
      ))}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <Row
        style={{
          fontWeight: 600,
          backgroundColor: theme.tableHeaderBackground,
          color: theme.tableHeaderText,
        }}
      >
        <Cell width={categoryWidth} plain>
          <Trans>Category</Trans>
        </Cell>
        <Cell width={lastYearWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Last Year</Trans>
        </Cell>
        <Cell width={yearlyBudgetWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Yearly Budget</Trans>
        </Cell>
        <Cell width={distributeWidth} plain />
        {monthNames.map((name, idx) => (
          <Cell
            key={data.months[idx]}
            width={monthWidth}
            plain
            style={{ textAlign: 'right' }}
          >
            {name}
          </Cell>
        ))}
        <Cell width={totalWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Total</Trans>
        </Cell>
      </Row>

      {/* Scrollable content */}
      <View style={{ flex: 1, overflowY: 'auto' }}>
        {/* Income Section */}
        {data.incomeGroups.length > 0 &&
          renderGroupSection(data.incomeGroups, t('Income'))}

        {/* Expense Section */}
        {data.expenseGroups.length > 0 &&
          renderGroupSection(data.expenseGroups, t('Expenses'))}

        {/* Summary Section */}
        <View style={{ marginTop: 10 }}>
          {/* Total Income */}
          <Row
            style={{
              fontWeight: 600,
              backgroundColor: theme.tableRowHeaderBackground,
            }}
          >
            <Cell width={categoryWidth} plain>
              <Trans>Total Income</Trans>
            </Cell>
            <Cell width={lastYearWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(data.lastYearTotalIncome, 'financial')}
              </PrivacyFilter>
            </Cell>
            <Cell width={yearlyBudgetWidth} plain />
            <Cell width={distributeWidth} plain />
            {data.months.map(month => {
              const monthTotal = data.incomeGroups.reduce(
                (sum, g) => sum + getGroupMonthTotal(g, month),
                0,
              );
              return (
                <Cell
                  key={month}
                  width={monthWidth}
                  plain
                  style={{ textAlign: 'right' }}
                >
                  <PrivacyFilter>
                    {format(monthTotal, 'financial')}
                  </PrivacyFilter>
                </Cell>
              );
            })}
            <Cell width={totalWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(calculatedTotals.totalIncome, 'financial')}
              </PrivacyFilter>
            </Cell>
          </Row>

          {/* Total Expenses */}
          <Row
            style={{
              fontWeight: 600,
              backgroundColor: theme.tableRowHeaderBackground,
            }}
          >
            <Cell width={categoryWidth} plain>
              <Trans>Total Expenses</Trans>
            </Cell>
            <Cell width={lastYearWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(data.lastYearTotalExpenses, 'financial')}
              </PrivacyFilter>
            </Cell>
            <Cell width={yearlyBudgetWidth} plain />
            <Cell width={distributeWidth} plain />
            {data.months.map(month => {
              const monthTotal = data.expenseGroups.reduce(
                (sum, g) => sum + getGroupMonthTotal(g, month),
                0,
              );
              return (
                <Cell
                  key={month}
                  width={monthWidth}
                  plain
                  style={{ textAlign: 'right' }}
                >
                  <PrivacyFilter>
                    {format(monthTotal, 'financial')}
                  </PrivacyFilter>
                </Cell>
              );
            })}
            <Cell width={totalWidth} plain style={{ textAlign: 'right' }}>
              <PrivacyFilter>
                {format(calculatedTotals.totalExpenses, 'financial')}
              </PrivacyFilter>
            </Cell>
          </Row>

          {/* Net (Gain/Deficit) */}
          <Row
            style={{
              fontWeight: 700,
              backgroundColor: theme.tableHeaderBackground,
              borderTop: `2px solid ${theme.tableBorder}`,
            }}
          >
            <Cell width={categoryWidth} plain>
              <Trans>Net (Gain/Deficit)</Trans>
            </Cell>
            <Cell
              width={lastYearWidth}
              plain
              style={{
                textAlign: 'right',
                color:
                  data.lastYearNetAmount >= 0
                    ? theme.noticeTextLight
                    : theme.errorText,
              }}
            >
              <PrivacyFilter>
                {format(data.lastYearNetAmount, 'financial')}
              </PrivacyFilter>
            </Cell>
            <Cell width={yearlyBudgetWidth} plain />
            <Cell width={distributeWidth} plain />
            {data.months.map(month => {
              const incomeTotal = data.incomeGroups.reduce(
                (sum, g) => sum + getGroupMonthTotal(g, month),
                0,
              );
              const expenseTotal = data.expenseGroups.reduce(
                (sum, g) => sum + getGroupMonthTotal(g, month),
                0,
              );
              const netTotal = incomeTotal - expenseTotal;
              return (
                <Cell
                  key={month}
                  width={monthWidth}
                  plain
                  style={{
                    textAlign: 'right',
                    color:
                      netTotal >= 0 ? theme.noticeTextLight : theme.errorText,
                  }}
                >
                  <PrivacyFilter>{format(netTotal, 'financial')}</PrivacyFilter>
                </Cell>
              );
            })}
            <Cell
              width={totalWidth}
              plain
              style={{
                textAlign: 'right',
                color:
                  calculatedTotals.netAmount >= 0
                    ? theme.noticeTextLight
                    : theme.errorText,
              }}
            >
              <PrivacyFilter>
                {format(calculatedTotals.netAmount, 'financial')}
              </PrivacyFilter>
            </Cell>
          </Row>
        </View>
      </View>
    </View>
  );
}
