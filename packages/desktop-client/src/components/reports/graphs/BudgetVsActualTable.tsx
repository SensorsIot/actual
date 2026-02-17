import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import {
  type BudgetVsActualData,
  type MonthlyBudgetActual,
} from '@desktop-client/components/reports/spreadsheets/budget-vs-actual-spreadsheet';
import { Cell, Row } from '@desktop-client/components/table';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useLocale } from '@desktop-client/hooks/useLocale';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type BudgetVsActualTableProps = {
  data: BudgetVsActualData;
  onTransactionChange?: () => void;
};

export function BudgetVsActualTable({
  data,
  onTransactionChange,
}: BudgetVsActualTableProps) {
  const format = useFormat();
  const locale = useLocale();
  const dispatch = useDispatch();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(data.groups.map(g => g.id)),
  );

  const handleActualClick = (
    categoryId: string,
    categoryName: string,
    month?: string,
  ) => {
    // Calculate date range for the month or full period
    let startDate: string;
    let endDate: string;

    if (month) {
      // Single month: first to last day of month
      startDate = `${month}-01`;
      endDate = monthUtils.getMonthEnd(month).slice(0, 10);
    } else {
      // Full period from data
      startDate = data.startDate;
      endDate = data.endDate;
    }

    dispatch(
      pushModal({
        modal: {
          name: 'transactions-drilldown',
          options: {
            categoryId,
            categoryName,
            month,
            startDate,
            endDate,
            onTransactionChange,
          },
        },
      }),
    );
  };

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

  const getVarianceColor = (variance: number, isIncome: boolean) => {
    // Income: positive = green (earned more), negative = red (earned less)
    // Expense: negative = green (under budget), positive = red (over budget)
    if (variance > 0) {
      return isIncome ? theme.noticeTextLight : theme.errorText;
    } else if (variance < 0) {
      return isIncome ? theme.errorText : theme.noticeTextLight;
    }
    return 'inherit';
  };

  const monthNames = useMemo(() => {
    return data.months.map(month => monthUtils.format(month, 'MMM', locale));
  }, [data.months, locale]);

  const categoryWidth = 180;
  const monthAmountWidth = 70;
  const totalAmountWidth = 85;
  const varianceWidth = 85;

  const renderMonthlyHeaders = () => {
    return data.months.map((month, idx) => (
      <View
        key={month}
        style={{
          flexDirection: 'column',
          borderRight: `1px solid ${theme.tableBorder}`,
        }}
      >
        <Cell
          width={monthAmountWidth * 2}
          plain
          style={{ textAlign: 'center' }}
        >
          {monthNames[idx]}
        </Cell>
        <View style={{ flexDirection: 'row' }}>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            <Trans>Bud</Trans>
          </Cell>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            <Trans>Act</Trans>
          </Cell>
        </View>
      </View>
    ));
  };

  const renderMonthlyCells = (
    monthlyData: Record<string, MonthlyBudgetActual>,
    categoryId?: string,
    categoryName?: string,
    isExpense?: boolean,
  ) => {
    return data.months.map(month => {
      const monthData = monthlyData[month] || { budgeted: 0, actual: 0 };
      // Expense budgets are already positive in reflect_budgets;
      // expense actuals are negative in transactions, so negate to show positive
      const displayBudgeted = monthData.budgeted;
      const displayActual = isExpense ? -monthData.actual : monthData.actual;
      const isClickable = categoryId && categoryName;
      return (
        <View
          key={month}
          style={{
            flexDirection: 'row',
            borderRight: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>
              {format(displayBudgeted, 'financial')}
            </PrivacyFilter>
          </Cell>
          <Cell
            width={monthAmountWidth}
            plain
            style={{
              textAlign: 'right',
              ...(isClickable && { cursor: 'pointer' }),
            }}
            onClick={
              isClickable
                ? (e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleActualClick(categoryId, categoryName, month);
                  }
                : undefined
            }
          >
            <PrivacyFilter>
              {format(displayActual, 'financial')}
            </PrivacyFilter>
          </Cell>
        </View>
      );
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          fontWeight: 600,
          backgroundColor: theme.tableHeaderBackground,
          color: theme.tableHeaderText,
        }}
      >
        <View style={{ flexDirection: 'column', justifyContent: 'flex-end' }}>
          <Cell width={categoryWidth} plain style={{ height: 'auto' }}>
            <Trans>Category</Trans>
          </Cell>
        </View>
        {renderMonthlyHeaders()}
        <View style={{ flexDirection: 'column' }}>
          <Cell
            width={totalAmountWidth * 2 + varianceWidth}
            plain
            style={{ textAlign: 'center' }}
          >
            <Trans>Total</Trans>
          </Cell>
          <View style={{ flexDirection: 'row' }}>
            <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
              <Trans>Bud</Trans>
            </Cell>
            <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
              <Trans>Act</Trans>
            </Cell>
            <Cell width={varianceWidth} plain style={{ textAlign: 'right' }}>
              <Trans>Var</Trans>
            </Cell>
          </View>
        </View>
      </View>

      {/* Groups and Categories */}
      <View style={{ flex: 1, overflowY: 'auto' }}>
        {data.groups.map(group => (
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
              {renderMonthlyCells(
                group.monthlyData,
                undefined,
                undefined,
                !group.isIncome,
              )}
              {(() => {
                const isExpense = !group.isIncome;
                const displayBudgeted = group.budgeted;
                const displayActual = isExpense
                  ? -group.actual
                  : group.actual;
                const displayVariance = displayActual - displayBudgeted;
                return (
                  <>
                    <Cell
                      width={totalAmountWidth}
                      plain
                      style={{ textAlign: 'right' }}
                    >
                      <PrivacyFilter>
                        {format(displayBudgeted, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                    <Cell
                      width={totalAmountWidth}
                      plain
                      style={{ textAlign: 'right' }}
                    >
                      <PrivacyFilter>
                        {format(displayActual, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                    <Cell
                      width={varianceWidth}
                      plain
                      style={{
                        textAlign: 'right',
                        color: getVarianceColor(
                          displayVariance,
                          group.isIncome,
                        ),
                      }}
                    >
                      <PrivacyFilter>
                        {format(displayVariance, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                  </>
                );
              })()}
            </Row>

            {/* Categories */}
            {expandedGroups.has(group.id) &&
              group.categories.map(category => {
                const isExpense = !group.isIncome;
                const displayBudgeted = category.budgeted;
                const displayActual = isExpense
                  ? -category.actual
                  : category.actual;
                const displayVariance = displayActual - displayBudgeted;
                return (
                  <Row key={category.id}>
                    <Cell width={categoryWidth} plain>
                      <View style={{ paddingLeft: 20 }}>{category.name}</View>
                    </Cell>
                    {renderMonthlyCells(
                      category.monthlyData,
                      category.id,
                      category.name,
                      !group.isIncome,
                    )}
                    <Cell
                      width={totalAmountWidth}
                      plain
                      style={{ textAlign: 'right' }}
                    >
                      <PrivacyFilter>
                        {format(displayBudgeted, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                    <Cell
                      width={totalAmountWidth}
                      plain
                      style={{
                        textAlign: 'right',
                        cursor: 'pointer',
                      }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleActualClick(category.id, category.name);
                      }}
                    >
                      <PrivacyFilter>
                        {format(displayActual, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                    <Cell
                      width={varianceWidth}
                      plain
                      style={{
                        textAlign: 'right',
                        color: getVarianceColor(
                          displayVariance,
                          group.isIncome,
                        ),
                      }}
                    >
                      <PrivacyFilter>
                        {format(displayVariance, 'financial')}
                      </PrivacyFilter>
                    </Cell>
                  </Row>
                );
              })}
          </View>
        ))}

        {/* Totals */}
        <Row
          style={{
            fontWeight: 700,
            backgroundColor: theme.tableHeaderBackground,
            color: theme.tableHeaderText,
            borderTop: `2px solid ${theme.tableBorder}`,
            marginTop: 10,
          }}
        >
          <Cell width={categoryWidth} plain>
            <Trans>Total</Trans>
          </Cell>
          {renderMonthlyCells(data.totalMonthlyData)}
          <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>
              {format(data.totalBudgeted, 'financial')}
            </PrivacyFilter>
          </Cell>
          <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>
              {format(data.totalActual, 'financial')}
            </PrivacyFilter>
          </Cell>
          <Cell
            width={varianceWidth}
            plain
            style={{
              textAlign: 'right',
              color: getVarianceColor(data.totalVariance, true),
            }}
          >
            <PrivacyFilter>
              {format(data.totalVariance, 'financial')}
            </PrivacyFilter>
          </Cell>
        </Row>
      </View>
    </View>
  );
}
