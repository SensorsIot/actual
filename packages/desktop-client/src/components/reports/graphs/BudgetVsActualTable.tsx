import { useState } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { type BudgetVsActualData } from '@desktop-client/components/reports/spreadsheets/budget-vs-actual-spreadsheet';
import { Row, Cell } from '@desktop-client/components/table';
import { useFormat } from '@desktop-client/hooks/useFormat';

type BudgetVsActualTableProps = {
  data: BudgetVsActualData;
  compact?: boolean;
};

export function BudgetVsActualTable({
  data,
  compact = false,
}: BudgetVsActualTableProps) {
  const format = useFormat();
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

  const categoryWidth = compact ? 150 : 200;
  const amountWidth = compact ? 80 : 100;

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
        <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Budgeted</Trans>
        </Cell>
        <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Actual</Trans>
        </Cell>
        <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Variance</Trans>
        </Cell>
        {!compact && (
          <Cell width={70} plain style={{ textAlign: 'right' }}>
            %
          </Cell>
        )}
      </Row>

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
              <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
                <PrivacyFilter>
                  {format(group.budgeted, 'financial')}
                </PrivacyFilter>
              </Cell>
              <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
                <PrivacyFilter>
                  {format(group.actual, 'financial')}
                </PrivacyFilter>
              </Cell>
              <Cell
                width={amountWidth}
                plain
                style={{
                  textAlign: 'right',
                  color: getVarianceColor(group.variance),
                }}
              >
                <PrivacyFilter>
                  {format(group.variance, 'financial')}
                </PrivacyFilter>
              </Cell>
              {!compact && (
                <Cell
                  width={70}
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
                  <Cell
                    width={amountWidth}
                    plain
                    style={{ textAlign: 'right' }}
                  >
                    <PrivacyFilter>
                      {format(category.budgeted, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  <Cell
                    width={amountWidth}
                    plain
                    style={{ textAlign: 'right' }}
                  >
                    <PrivacyFilter>
                      {format(category.actual, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                  <Cell
                    width={amountWidth}
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
                      width={70}
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
          <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>
              {format(data.totalBudgeted, 'financial')}
            </PrivacyFilter>
          </Cell>
          <Cell width={amountWidth} plain style={{ textAlign: 'right' }}>
            <PrivacyFilter>
              {format(data.totalActual, 'financial')}
            </PrivacyFilter>
          </Cell>
          <Cell
            width={amountWidth}
            plain
            style={{
              textAlign: 'right',
              color: getVarianceColor(data.totalVariance),
            }}
          >
            <PrivacyFilter>
              {format(data.totalVariance, 'financial')}
            </PrivacyFilter>
          </Cell>
          {!compact && (
            <Cell
              width={70}
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
