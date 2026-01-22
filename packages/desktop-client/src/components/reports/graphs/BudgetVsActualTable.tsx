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

type BudgetVsActualTableProps = {
  data: BudgetVsActualData;
  compact?: boolean;
};

export function BudgetVsActualTable({
  data,
  compact = false,
}: BudgetVsActualTableProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const locale = useLocale();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(data.groups.map(g => g.id)),
  );

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

  const getVarianceColor = (variance: number) => {
    if (variance > 0) {
      return theme.noticeTextLight; // Green - under budget
    } else if (variance < 0) {
      return theme.errorText; // Red - over budget
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
      <View key={month} style={{ flexDirection: 'column' }}>
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
  ) => {
    return data.months.map(month => {
      const monthData = monthlyData[month] || { budgeted: 0, actual: 0 };
      return (
        <View key={month} style={{ flexDirection: 'row' }}>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>{format(monthData.budgeted, 'financial')}</PrivacyFilter>
          </Cell>
          <Cell width={monthAmountWidth} plain style={{ textAlign: 'right' }}>
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
                  color: getVarianceColor(group.variance),
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
                    color: getVarianceColor(group.variance),
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
                  {renderMonthlyCells(category.monthlyData)}
                  <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
                    <PrivacyFilter>
                      {format(category.budgeted, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  <Cell width={totalAmountWidth} plain style={{ textAlign: 'right' }}>
                    <PrivacyFilter>
                      {format(category.actual, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  <Cell
                    width={varianceWidth}
                    plain
                    style={{
                      textAlign: 'right',
                      color: getVarianceColor(category.variance),
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
                        color: getVarianceColor(category.variance),
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
              color: getVarianceColor(data.totalVariance),
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
                color: getVarianceColor(data.totalVariance),
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
