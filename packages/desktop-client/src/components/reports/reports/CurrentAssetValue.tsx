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

import { send } from 'loot-core/platform/client/fetch';
import * as monthUtils from 'loot-core/shared/months';
import {
  type CurrentAssetValueWidget,
  type RuleConditionEntity,
} from 'loot-core/types/models';

import { EditablePageHeaderTitle } from '@desktop-client/components/EditablePageHeaderTitle';
import { MobileBackButton } from '@desktop-client/components/mobile/MobileBackButton';
import {
  MobilePageHeader,
  Page,
  PageHeader,
} from '@desktop-client/components/Page';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { CurrentAssetValueTable } from '@desktop-client/components/reports/graphs/CurrentAssetValueTable';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
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
import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { useDispatch } from '@desktop-client/redux';

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
  const dispatch = useDispatch();
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

  async function onSaveWidget() {
    if (!widget) {
      throw new Error('No widget that could be saved.');
    }

    await send('dashboard-update-widget', {
      id: widget.id,
      meta: {
        ...(widget.meta ?? {}),
        conditions,
        conditionsOp,
        date,
      },
    });
    dispatch(
      addNotification({
        notification: {
          type: 'message',
          message: t('Dashboard widget successfully saved.'),
        },
      }),
    );
  }

  const title = widget?.meta?.name || t('Current Asset Value');
  const onSaveWidgetName = async (newName: string) => {
    if (!widget) {
      throw new Error('No widget that could be saved.');
    }

    const name = newName || t('Current Asset Value');
    await send('dashboard-update-widget', {
      id: widget.id,
      meta: {
        ...(widget.meta ?? {}),
        name,
      },
    });
  };

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
          <PageHeader
            title={
              widget ? (
                <EditablePageHeaderTitle
                  title={title}
                  onSave={onSaveWidgetName}
                />
              ) : (
                title
              )
            }
          />
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

        {widget && (
          <Button variant="primary" onPress={onSaveWidget}>
            <Trans>Save widget</Trans>
          </Button>
        )}
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
