import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import {
  type BudgetVsActualData,
  type MonthlyBudgetActual,
} from '@desktop-client/components/reports/spreadsheets/budget-vs-actual-spreadsheet';
import { Row, Cell } from '@desktop-client/components/table';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useLocale } from '@desktop-client/hooks/useLocale';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type BudgetVsActualTableProps = {
  data: BudgetVsActualData;
  compact?: boolean;
  onTransactionChange?: () => void;
};

export function BudgetVsActualTable({
  data,
  compact = false,
  onTransactionChange,
}: BudgetVsActualTableProps) {
  const { t } = useTranslation();
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
    // For expenses: positive variance = overspent (bad), negative = underspent (good)
    // For income: positive variance = earned more (good), negative = earned less (bad)
    if (isIncome) {
      // Income: positive = good (green), negative = bad (red)
      if (variance > 0) {
        return theme.noticeTextLight; // Green
      } else if (variance < 0) {
        return theme.errorText; // Red
      }
    } else {
      // Expense: positive = bad (red), negative = good (green)
      if (variance > 0) {
        return theme.errorText; // Red
      } else if (variance < 0) {
        return theme.noticeTextLight; // Green
      }
    }
    return 'inherit';
  };

  const formatPercent = (budgeted: number, variance: number) => {
    if (budgeted === 0) {
      return variance === 0 ? '0%' : variance > 0 ? '+100%' : '-100%';
    }
    const percent = (variance / budgeted) * 100;
    const formatted = Math.abs(percent).toFixed(1);
    return percent >= 0 ? `+${formatted}%` : `-${formatted}%`;
  };

  const monthNames = useMemo(() => {
    return data.months.map(month => monthUtils.format(month, 'MMM', locale));
  }, [data.months, locale]);

  const categoryWidth = compact ? 150 : 180;
  const monthAmountWidth = compact ? 60 : 70;
  const totalAmountWidth = compact ? 70 : 85;
  const varianceWidth = compact ? 70 : 85;
  const percentWidth = 55;

  const renderMonthlyHeaders = () => {
    return data.months.map((month, idx) => (
      <View
        key={month}
        style={{
          flexDirection: 'column',
          borderRight: `1px solid ${theme.tableBorder}`,
        }}
      >
        <Cell width={monthAmountWidth * 2} plain style={{ textAlign: 'center' }}>
          {monthNames[idx]}
        </Cell>
        <View style={{ flexDirection: 'row' }}>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            {t('Bud')}
          </Cell>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            {t('Act')}
          </Cell>
        </View>
      </View>
    ));
  };

  const renderMonthlyCells = (
    monthlyData: Record<string, MonthlyBudgetActual>,
    categoryId?: string,
    categoryName?: string,
  ) => {
    return data.months.map(month => {
      const monthData = monthlyData[month] || { budgeted: 0, actual: 0 };
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
            <PrivacyFilter>{format(monthData.budgeted, 'financial')}</PrivacyFilter>
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
            <PrivacyFilter>{format(monthData.actual, 'financial')}</PrivacyFilter>
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
          <Cell width={totalAmountWidth * 2 + varianceWidth + (compact ? 0 : percentWidth)} plain style={{ textAlign: 'center' }}>
            <Trans>Total</Trans>
          </Cell>
          <View style={{ flexDirection: 'row' }}>
            <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
              {t('Bud')}
            </Cell>
            <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
              {t('Act')}
            </Cell>
            <Cell width={varianceWidth} plain style={{ textAlign: 'right' }}>
              {t('Var')}
            </Cell>
            {!compact && (
              <Cell width={percentWidth} plain style={{ textAlign: 'right' }}>
                %
              </Cell>
            )}
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
              {renderMonthlyCells(group.monthlyData)}
              <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
                <PrivacyFilter>{format(group.budgeted, 'financial')}</PrivacyFilter>
              </Cell>
              <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
                <PrivacyFilter>{format(group.actual, 'financial')}</PrivacyFilter>
              </Cell>
              <Cell
                width={varianceWidth}
                plain
                style={{
                  textAlign: 'right',
                  color: getVarianceColor(group.variance, group.isIncome),
                }}
              >
                <PrivacyFilter>{format(group.variance, 'financial')}</PrivacyFilter>
              </Cell>
              {!compact && (
                <Cell
                  width={percentWidth}
                  plain
                  style={{
                    textAlign: 'right',
                    color: getVarianceColor(group.variance, group.isIncome),
                  }}
                >
                  <PrivacyFilter>
                    {formatPercent(group.budgeted, group.variance)}
                  </PrivacyFilter>
                </Cell>
              )}
            </Row>

            {/* Categories */}
            {expandedGroups.has(group.id) &&
              group.categories.map(category => (
                <Row key={category.id}>
                  <Cell width={categoryWidth} plain>
                    <View style={{ paddingLeft: 20 }}>{category.name}</View>
                  </Cell>
                  {renderMonthlyCells(category.monthlyData, category.id, category.name)}
                  <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
                    <PrivacyFilter>
                      {format(category.budgeted, 'financial')}
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
                      {format(category.actual, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  <Cell
                    width={varianceWidth}
                    plain
                    style={{
                      textAlign: 'right',
                      color: getVarianceColor(category.variance, group.isIncome),
                    }}
                  >
                    <PrivacyFilter>
                      {format(category.variance, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  {!compact && (
                    <Cell
                      width={percentWidth}
                      plain
                      style={{
                        textAlign: 'right',
                        color: getVarianceColor(category.variance, group.isIncome),
                      }}
                    >
                      <PrivacyFilter>
                        {formatPercent(category.budgeted, category.variance)}
                      </PrivacyFilter>
                    </Cell>
                  )}
                </Row>
              ))}
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
            <PrivacyFilter>{format(data.totalBudgeted, 'financial')}</PrivacyFilter>
          </Cell>
          <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>{format(data.totalActual, 'financial')}</PrivacyFilter>
          </Cell>
          <Cell
            width={varianceWidth}
            plain
            style={{
              textAlign: 'right',
              color: getVarianceColor(data.totalVariance, true),
            }}
          >
            <PrivacyFilter>{format(data.totalVariance, 'financial')}</PrivacyFilter>
          </Cell>
          {!compact && (
            <Cell
              width={percentWidth}
              plain
              style={{
                textAlign: 'right',
                color: getVarianceColor(data.totalVariance, true),
              }}
            >
              <PrivacyFilter>
                {formatPercent(data.totalBudgeted, data.totalVariance)}
              </PrivacyFilter>
            </Cell>
          )}
        </Row>
      </View>
    </View>
  );
}
