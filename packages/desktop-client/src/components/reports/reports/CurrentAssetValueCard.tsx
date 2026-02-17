import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import { type CurrentAssetValueWidget } from 'loot-core/types/models';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import {
  createCurrentAssetValueSpreadsheet,
  type CurrentAssetValueData,
} from '@desktop-client/components/reports/spreadsheets/current-asset-value-spreadsheet';
import { useReport } from '@desktop-client/components/reports/useReport';
import { useDashboardWidgetCopyMenu } from '@desktop-client/components/reports/useDashboardWidgetCopyMenu';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useFormat } from '@desktop-client/hooks/useFormat';

type CurrentAssetValueCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: CurrentAssetValueWidget['meta'];
  onMetaChange: (newMeta: CurrentAssetValueWidget['meta']) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

export function CurrentAssetValueCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: CurrentAssetValueCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const accounts = useAccounts();

  const [isCardHovered, setIsCardHovered] = useState(false);
  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const { menuItems: copyMenuItems, handleMenuSelect: handleCopyMenuSelect } =
    useDashboardWidgetCopyMenu(onCopy);

  const date = meta?.date || monthUtils.currentDay();

  const getGraphData = useMemo(
    () =>
      createCurrentAssetValueSpreadsheet({
        date,
        accounts,
        conditions: meta?.conditions,
        conditionsOp: meta?.conditionsOp,
      }),
    [date, accounts, meta?.conditions, meta?.conditionsOp],
  );

  const data = useReport<CurrentAssetValueData>(
    'current-asset-value',
    getGraphData,
  );

  const getBalanceColor = (balance: number) => {
    if (balance > 0) {
      return theme.noticeTextLight;
    } else if (balance < 0) {
      return theme.errorText;
    }
    return 'inherit';
  };

  return (
    <ReportCard
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to={`/reports/current-asset-value/${widgetId}`}
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
              name={meta?.name || t('Current Asset Value')}
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
            <Block style={{ ...styles.smallText, color: theme.pageTextLight }}>
              {t('As of {{date}}', {
                date: monthUtils.format(date, 'MMMM d, yyyy'),
              })}
            </Block>
          </View>
          {data && (
            <View style={{ textAlign: 'right' }}>
              <Block
                style={{
                  ...styles.mediumText,
                  fontWeight: 500,
                  marginBottom: 5,
                  color: getBalanceColor(data.totalBalance),
                }}
              >
                <PrivacyFilter activationFilters={[!isCardHovered]}>
                  {format(data.totalBalance, 'financial')}
                </PrivacyFilter>
              </Block>
              <Block
                style={{ ...styles.smallText, color: theme.pageTextLight }}
              >
                {t('Net Worth')}
              </Block>
            </View>
          )}
        </View>
        {data ? (
          <View style={{ flex: 1, padding: 20, paddingTop: 0 }}>
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                fontSize: 12,
              }}
            >
              <View style={{ fontWeight: 600 }}>
                <Block>
                  <Trans>Group</Trans>
                </Block>
              </View>
              <View style={{ fontWeight: 600, textAlign: 'right' }}>
                <Block><Trans>Balance</Trans></Block>
              </View>

              {data.groups.map(group => (
                <View
                  key={group.id}
                  style={{
                    display: 'contents',
                  }}
                >
                  <View
                    style={{
                      fontWeight: 500,
                      marginTop: 5,
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      paddingBottom: 2,
                    }}
                  >
                    <Block>{group.name}</Block>
                  </View>
                  <View
                    style={{
                      textAlign: 'right',
                      marginTop: 5,
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      paddingBottom: 2,
                      color: getBalanceColor(group.balance),
                    }}
                  >
                    <PrivacyFilter activationFilters={[!isCardHovered]}>
                      {format(group.balance, 'financial')}
                    </PrivacyFilter>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <LoadingIndicator />
        )}
      </View>
    </ReportCard>
  );
}
