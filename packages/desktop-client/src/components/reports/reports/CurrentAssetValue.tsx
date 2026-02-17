import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { AlignedText } from '@actual-app/components/aligned-text';
import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import {
  type CurrentAssetValueWidget,
  type RuleConditionEntity,
} from 'loot-core/types/models';

import { MobileBackButton } from '@desktop-client/components/mobile/MobileBackButton';
import {
  MobilePageHeader,
  Page,
  PageHeader,
} from '@desktop-client/components/Page';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { CurrentAssetValueTable } from '@desktop-client/components/reports/graphs/CurrentAssetValueTable';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { SavedReportsSelector } from '@desktop-client/components/reports/SavedReportsSelector';
import {
  createCurrentAssetValueSpreadsheet,
  type CurrentAssetValueData,
} from '@desktop-client/components/reports/spreadsheets/current-asset-value-spreadsheet';
import { useReport } from '@desktop-client/components/reports/useReport';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useRuleConditionFilters } from '@desktop-client/hooks/useRuleConditionFilters';
import { useWidget } from '@desktop-client/hooks/useWidget';

export function CurrentAssetValue() {
  const params = useParams();
  const { data: widget, isLoading } = useWidget<CurrentAssetValueWidget>(
    params.id ?? '',
    'current-asset-value-card',
  );

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return <CurrentAssetValueInternal widget={widget} />;
}

type CurrentAssetValueInternalProps = {
  widget?: CurrentAssetValueWidget;
};

function CurrentAssetValueInternal({ widget }: CurrentAssetValueInternalProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const accounts = useAccounts();

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

  const [date, setDate] = useState(
    widget?.meta?.date || monthUtils.currentDay(),
  );

  // Handler for loading a saved report
  const handleLoadSavedReport = (config: {
    date?: string;
    conditions?: RuleConditionEntity[];
    conditionsOp?: 'and' | 'or';
  }) => {
    if (config.date) {
      setDate(config.date);
    }
    // Note: conditions loading would require refactoring useRuleConditionFilters
    // to accept external updates. For now, we just load the date.
  };

  const getGraphData = useMemo(
    () =>
      createCurrentAssetValueSpreadsheet({
        date,
        accounts,
        conditions,
        conditionsOp,
      }),
    [date, accounts, conditions, conditionsOp],
  );

  const data = useReport<CurrentAssetValueData>(
    'current-asset-value',
    getGraphData,
  );

  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();

  const title = t('Current Asset Value');

  const getBalanceColor = (balance: number) => {
    if (balance > 0) {
      return theme.noticeTextLight;
    } else if (balance < 0) {
      return theme.errorText;
    }
    return 'inherit';
  };

  if (!data) {
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 20,
          paddingTop: 0,
          gap: 15,
          flexShrink: 0,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ whiteSpace: 'nowrap' }}>
            <Trans>As of:</Trans>
          </Text>
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: 150 }}
          />
        </View>

        <Button onPress={() => setDate(monthUtils.currentDay())}>
          <Trans>Today</Trans>
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
          reportType="current-asset-value"
          currentConfig={{ date, conditions, conditionsOp }}
          onLoadReport={handleLoadSavedReport}
        />
      </View>

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
                <Trans>Net Worth:</Trans>
              </Block>
            }
            right={
              <Text
                style={{
                  fontWeight: 600,
                  color: getBalanceColor(data.totalBalance),
                }}
              >
                <PrivacyFilter>
                  {format(data.totalBalance, 'financial')}
                </PrivacyFilter>
              </Text>
            }
          />
          <AlignedText
            style={{ marginBottom: 5, minWidth: 200 }}
            left={
              <Block>
                <Trans>Date:</Trans>
              </Block>
            }
            right={
              <Text style={{ fontWeight: 600 }}>
                {monthUtils.format(date, 'MMMM d, yyyy')}
              </Text>
            }
          />
        </View>

        <CurrentAssetValueTable data={data} />
      </View>
    </Page>
  );
}
