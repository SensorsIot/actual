import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import { type BudgetVsActualWidget } from 'loot-core/types/models';

import { defaultTimeFrame } from './BudgetVsActual';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { DateRange } from '@desktop-client/components/reports/DateRange';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { calculateTimeRange } from '@desktop-client/components/reports/reportRanges';
import {
  createBudgetVsActualSpreadsheet,
  type BudgetVsActualData,
} from '@desktop-client/components/reports/spreadsheets/budget-vs-actual-spreadsheet';
import { useReport } from '@desktop-client/components/reports/useReport';
import { useDashboardWidgetCopyMenu } from '@desktop-client/components/reports/useDashboardWidgetCopyMenu';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useFormat } from '@desktop-client/hooks/useFormat';

type BudgetVsActualCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: BudgetVsActualWidget['meta'];
  onMetaChange: (newMeta: BudgetVsActualWidget['meta']) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

export function BudgetVsActualCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: BudgetVsActualCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: categories = { grouped: [], list: [] } } = useCategories();

  const [isCardHovered, setIsCardHovered] = useState(false);
  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const { menuItems: copyMenuItems, handleMenuSelect: handleCopyMenuSelect } =
    useDashboardWidgetCopyMenu(onCopy);

  const [start, end] = useMemo(() => {
    const [calculatedStart, calculatedEnd] = calculateTimeRange(
      meta?.timeFrame,
      defaultTimeFrame,
      monthUtils.currentDay(),
    );
    return [calculatedStart, calculatedEnd];
  }, [meta?.timeFrame]);

  const getGraphData = useMemo(
    () =>
      createBudgetVsActualSpreadsheet({
        startDate: monthUtils.firstDayOfMonth(start),
        endDate: monthUtils.lastDayOfMonth(end),
        categories,
        conditions: meta?.conditions,
        conditionsOp: meta?.conditionsOp,
        showHiddenCategories: meta?.showHiddenCategories,
      }),
    [
      start,
      end,
      categories,
      meta?.conditions,
      meta?.conditionsOp,
      meta?.showHiddenCategories,
    ],
  );

  const data = useReport<BudgetVsActualData>('budget-vs-actual', getGraphData);

  const getVarianceColor = (variance: number) => {
    if (variance > 0) {
      return theme.noticeTextLight;
    } else if (variance < 0) {
      return theme.errorText;
    }
    return 'inherit';
  };

  return (
    <ReportCard
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to={`/reports/budget-vs-actual/${widgetId}`}
      menuItems={[
        {
          name: 'rename',
          text: t('Rename'),
        },
        {
          name: 'remove',
          text: t('Remove'),
        },
        ...copyMenuItems,
      ]}
      onMenuSelect={item => {
        if (handleCopyMenuSelect(item)) return;
        switch (item) {
          case 'rename':
            setNameMenuOpen(true);
            break;
          case 'remove':
            onRemove();
            break;
          default:
            throw new Error(`Unrecognized selection: ${item}`);
        }
      }}
    >
      <View
        style={{ flex: 1 }}
        onPointerEnter={() => setIsCardHovered(true)}
        onPointerLeave={() => setIsCardHovered(false)}
      >
        <View style={{ flexDirection: 'row', padding: 20 }}>
          <View style={{ flex: 1 }}>
            <ReportCardName
              name={meta?.name || t('Budget vs Actual')}
              isEditing={nameMenuOpen}
              onChange={newName => {
                onMetaChange({
                  ...meta,
                  name: newName,
                });
                setNameMenuOpen(false);
              }}
              onClose={() => setNameMenuOpen(false)}
            />
            <DateRange start={start} end={end} />
          </View>
          {data && (
            <View style={{ textAlign: 'right' }}>
              <Block
                style={{
                  ...styles.mediumText,
                  fontWeight: 500,
                  marginBottom: 5,
                  color: getVarianceColor(data.totalVariance),
                }}
              >
                <PrivacyFilter activationFilters={[!isCardHovered]}>
                  {(data.totalVariance > 0 ? '+' : '') +
                    format(data.totalVariance, 'financial')}
                </PrivacyFilter>
              </Block>
              <Block
                style={{ ...styles.smallText, color: theme.pageTextLight }}
              >
                {data.totalVariance >= 0 ? t('under budget') : t('over budget')}
              </Block>
            </View>
          )}
        </View>
        {data ? (
          <View style={{ flex: 1, padding: 20, paddingTop: 0 }}>
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 10,
                fontSize: 12,
              }}
            >
              <View style={{ fontWeight: 600 }}>
                <Block>
                  <Trans>Category</Trans>
                </Block>
              </View>
              <View style={{ fontWeight: 600, textAlign: 'right' }}>
                <Block><Trans>Budget</Trans></Block>
              </View>
              <View style={{ fontWeight: 600, textAlign: 'right' }}>
                <Block><Trans>Actual</Trans></Block>
              </View>
              <View style={{ fontWeight: 600, textAlign: 'right' }}>
                <Block><Trans>Var</Trans></Block>
              </View>

              {data.groups.slice(0, 4).map(group => (
                <View
                  key={group.id}
                  style={{
                    display: 'contents',
                  }}
                >
                  <View
                    style={{
                      gridColumn: '1 / -1',
                      fontWeight: 500,
                      marginTop: 5,
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      paddingBottom: 2,
                    }}
                  >
                    <Block>{group.name}</Block>
                  </View>
                  <View style={{ textAlign: 'right' }}>
                    <PrivacyFilter activationFilters={[!isCardHovered]}>
                      {format(group.budgeted, 'financial')}
                    </PrivacyFilter>
                  </View>
                  <View style={{ textAlign: 'right' }}>
                    <PrivacyFilter activationFilters={[!isCardHovered]}>
                      {format(group.actual, 'financial')}
                    </PrivacyFilter>
                  </View>
                  <View
                    style={{
                      textAlign: 'right',
                      color: getVarianceColor(group.variance),
                    }}
                  >
                    <PrivacyFilter activationFilters={[!isCardHovered]}>
                      {format(group.variance, 'financial')}
                    </PrivacyFilter>
                  </View>
                </View>
              ))}
              {data.groups.length > 4 && (
                <View
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    color: theme.pageTextLight,
                    marginTop: 5,
                  }}
                >
                  {t('+ {{count}} more groups', {
                    count: data.groups.length - 4,
                  })}
                </View>
              )}
            </View>
          </View>
        ) : (
          <LoadingIndicator />
        )}
      </View>
    </ReportCard>
  );
}
