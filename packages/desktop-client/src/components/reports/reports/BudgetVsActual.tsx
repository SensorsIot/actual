import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { AlignedText } from '@actual-app/components/aligned-text';
import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as d from 'date-fns';

import { send } from 'loot-core/platform/client/fetch';
import * as monthUtils from 'loot-core/shared/months';
import {
  type BudgetVsActualWidget,
  type RuleConditionEntity,
  type TimeFrame,
} from 'loot-core/types/models';
import { MobileBackButton } from '@desktop-client/components/mobile/MobileBackButton';
import {
  MobilePageHeader,
  Page,
  PageHeader,
} from '@desktop-client/components/Page';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { BudgetVsActualTable } from '@desktop-client/components/reports/graphs/BudgetVsActualTable';
import { Header } from '@desktop-client/components/reports/Header';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { SavedReportsSelector } from '@desktop-client/components/reports/SavedReportsSelector';
import { calculateTimeRange } from '@desktop-client/components/reports/reportRanges';
import {
  createBudgetVsActualSpreadsheet,
  type BudgetVsActualData,
} from '@desktop-client/components/reports/spreadsheets/budget-vs-actual-spreadsheet';
import { useReport } from '@desktop-client/components/reports/useReport';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useLocale } from '@desktop-client/hooks/useLocale';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useRuleConditionFilters } from '@desktop-client/hooks/useRuleConditionFilters';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { useWidget } from '@desktop-client/hooks/useWidget';
import { type SavedReportConfig } from '@desktop-client/hooks/useSavedReports';

export const defaultTimeFrame = {
  start: monthUtils.currentMonth(),
  end: monthUtils.currentMonth(),
  mode: 'yearToDate',
} satisfies TimeFrame;

export function BudgetVsActual() {
  const params = useParams();
  const { data: widget, isLoading } = useWidget<BudgetVsActualWidget>(
    params.id ?? '',
    'budget-vs-actual-card',
  );

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return <BudgetVsActualInternal widget={widget} />;
}

type BudgetVsActualInternalProps = {
  widget?: BudgetVsActualWidget;
};

function BudgetVsActualInternal({ widget }: BudgetVsActualInternalProps) {
  const locale = useLocale();
  const { t } = useTranslation();
  const format = useFormat();
  const categories = useCategories();

  const {
    conditions,
    conditionsOp,
    onApply: onApplyFilter,
    onDelete: onDeleteFilter,
    onUpdate: onUpdateFilter,
    onConditionsOpChange,
  } = useRuleConditionFilters<RuleConditionEntity>(
    widget?.meta?.conditions,
    widget?.meta?.conditionsOp,
  );

  const [allMonths, setAllMonths] = useState<Array<{
    name: string;
    pretty: string;
  }> | null>(null);

  const [start, setStart] = useState(monthUtils.currentMonth());
  const [end, setEnd] = useState(monthUtils.currentMonth());
  const [mode, setMode] = useState<TimeFrame['mode']>('yearToDate');
  const [showHiddenCategories, setShowHiddenCategories] = useState(
    widget?.meta?.showHiddenCategories ?? false,
  );
  const [latestTransaction, setLatestTransaction] = useState('');
  const [earliestTransaction, setEarliestTransaction] = useState('');

  const [_firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const firstDayOfWeekIdx = _firstDayOfWeekIdx || '0';

  useEffect(() => {
    async function run() {
      const earliestTrans = await send('get-earliest-transaction');
      setEarliestTransaction(
        earliestTrans ? earliestTrans.date : monthUtils.currentDay(),
      );

      const latestTrans = await send('get-latest-transaction');
      setLatestTransaction(
        latestTrans ? latestTrans.date : monthUtils.currentDay(),
      );

      const currentMonth = monthUtils.currentMonth();
      const earliestMonth = earliestTrans
        ? monthUtils.monthFromDate(d.parseISO(earliestTrans.date))
        : currentMonth;
      const latestTransactionMonth = latestTrans
        ? monthUtils.monthFromDate(d.parseISO(latestTrans.date))
        : currentMonth;

      const latestMonth =
        latestTransactionMonth > currentMonth
          ? latestTransactionMonth
          : currentMonth;

      const months = monthUtils
        .rangeInclusive(earliestMonth, latestMonth)
        .map(month => ({
          name: month,
          pretty: monthUtils.format(month, 'MMMM, yyyy', locale),
        }))
        .reverse();

      setAllMonths(months);
    }
    run();
  }, [locale]);

  useEffect(() => {
    if (latestTransaction) {
      const [initialStart, initialEnd, initialMode] = calculateTimeRange(
        widget?.meta?.timeFrame,
        defaultTimeFrame,
        latestTransaction,
      );
      setStart(initialStart);
      setEnd(initialEnd);
      setMode(initialMode);
    }
  }, [latestTransaction, widget?.meta?.timeFrame]);

  function onChangeDates(
    newStart: string,
    newEnd: string,
    newMode: TimeFrame['mode'],
  ) {
    setStart(newStart);
    setEnd(newEnd);
    setMode(newMode);
  }

  const getGraphData = useMemo(
    () =>
      createBudgetVsActualSpreadsheet({
        startDate: monthUtils.firstDayOfMonth(start),
        endDate: monthUtils.lastDayOfMonth(end),
        categories,
        conditions,
        conditionsOp,
        showHiddenCategories,
      }),
    [start, end, categories, conditions, conditionsOp, showHiddenCategories],
  );

  const data = useReport<BudgetVsActualData>('budget-vs-actual', getGraphData);

  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();

  const title = t('Budget vs Actual');

  // Handler for loading a saved report
  const handleLoadSavedReport = (config: SavedReportConfig) => {
    if (config.start) {
      setStart(config.start);
    }
    if (config.end) {
      setEnd(config.end);
    }
    if (config.mode) {
      setMode(config.mode);
    }
    if (config.showHiddenCategories !== undefined) {
      setShowHiddenCategories(config.showHiddenCategories);
    }
  };

  if (!allMonths || !data) {
    return <LoadingIndicator />;
  }

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader
            title={title}
            leftContent={
              <MobileBackButton onPress={() => navigate('/reports')} />
            }
          />
        ) : (
          <PageHeader title={title} />
        )
      }
      padding={0}
    >
      <Header
        allMonths={allMonths}
        start={start}
        end={end}
        earliestTransaction={earliestTransaction}
        latestTransaction={latestTransaction}
        firstDayOfWeekIdx={firstDayOfWeekIdx}
        mode={mode}
        onChangeDates={onChangeDates}
        onApply={onApplyFilter}
        filters={conditions}
        onUpdateFilter={onUpdateFilter}
        onDeleteFilter={onDeleteFilter}
        conditionsOp={conditionsOp}
        onConditionsOpChange={onConditionsOpChange}
      >
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Button
            onPress={() => setShowHiddenCategories(state => !state)}
            variant={showHiddenCategories ? 'primary' : 'normal'}
          >
            {showHiddenCategories
              ? t('Hide hidden categories')
              : t('Show hidden categories')}
          </Button>

          <View
            style={{
              height: 'auto',
              borderLeft: `1.5px solid ${theme.pillBorderDark}`,
              borderRadius: 0.75,
              marginLeft: 5,
              marginRight: 5,
            }}
          />

          <SavedReportsSelector
            reportType="budget-vs-actual"
            currentConfig={{
              start,
              end,
              mode,
              showHiddenCategories,
              conditions,
              conditionsOp,
            }}
            onLoadReport={handleLoadSavedReport}
          />
        </View>
      </Header>

      <View
        style={{
          backgroundColor: theme.tableBackground,
          padding: 20,
          paddingTop: 0,
          flex: '1 0 auto',
          overflowY: 'auto',
        }}
      >
        <View
          style={{
            paddingTop: 20,
            paddingBottom: 20,
            alignItems: 'flex-end',
            color: theme.pageText,
          }}
        >
          <AlignedText
            style={{ marginBottom: 5, minWidth: 200 }}
            left={
              <Block>
                <Trans>Total Budgeted:</Trans>
              </Block>
            }
            right={
              <Text style={{ fontWeight: 600 }}>
                <PrivacyFilter>
                  {format(data.totalBudgeted, 'financial')}
                </PrivacyFilter>
              </Text>
            }
          />
          <AlignedText
            style={{ marginBottom: 5, minWidth: 200 }}
            left={
              <Block>
                <Trans>Total Actual:</Trans>
              </Block>
            }
            right={
              <Text style={{ fontWeight: 600 }}>
                <PrivacyFilter>
                  {format(data.totalActual, 'financial')}
                </PrivacyFilter>
              </Text>
            }
          />
          <AlignedText
            style={{ marginBottom: 5, minWidth: 200 }}
            left={
              <Block>
                <Trans>Variance:</Trans>
              </Block>
            }
            right={
              <Text
                style={{
                  fontWeight: 600,
                  color:
                    data.totalVariance >= 0
                      ? theme.noticeTextLight
                      : theme.errorText,
                }}
              >
                <PrivacyFilter>
                  {format(data.totalVariance, 'financial')}
                </PrivacyFilter>
              </Text>
            }
          />
        </View>

        <BudgetVsActualTable data={data} />
      </View>
    </Page>
  );
}
