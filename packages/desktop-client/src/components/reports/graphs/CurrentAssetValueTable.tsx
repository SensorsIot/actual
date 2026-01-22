import { useState } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { type CurrentAssetValueData } from '@desktop-client/components/reports/spreadsheets/current-asset-value-spreadsheet';
import { Row, Cell } from '@desktop-client/components/table';
import { useFormat } from '@desktop-client/hooks/useFormat';

type CurrentAssetValueTableProps = {
  data: CurrentAssetValueData;
  compact?: boolean;
};

export function CurrentAssetValueTable({
  data,
  compact = false,
}: CurrentAssetValueTableProps) {
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

  const getBalanceColor = (balance: number) => {
    if (balance > 0) {
      return theme.noticeTextLight; // Green - positive
    } else if (balance < 0) {
      return theme.errorText; // Red - negative (debt)
    }
    return 'inherit';
  };

  const accountWidth = compact ? 200 : 300;
  const balanceWidth = compact ? 100 : 150;

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
        <Cell width={accountWidth} plain>
          <Trans>Account</Trans>
        </Cell>
        <Cell width={balanceWidth} plain style={{ textAlign: 'right' }}>
          <Trans>Balance</Trans>
        </Cell>
      </Row>

      {/* Groups and Accounts */}
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
              <Cell width={accountWidth} plain>
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
              <Cell
                width={balanceWidth}
                plain
                style={{
                  textAlign: 'right',
                  color: getBalanceColor(group.balance),
                }}
              >
                <PrivacyFilter>
                  {format(group.balance, 'financial')}
                </PrivacyFilter>
              </Cell>
            </Row>

            {/* Accounts */}
            {expandedGroups.has(group.id) &&
              group.accounts.map(account => (
                <Row key={account.id}>
                  <Cell width={accountWidth} plain>
                    <View style={{ paddingLeft: 20 }}>{account.name}</View>
                  </Cell>
                  <Cell
                    width={balanceWidth}
                    plain
                    style={{
                      textAlign: 'right',
                      color: getBalanceColor(account.balance),
                    }}
                  >
                    <PrivacyFilter>
                      {format(account.balance, 'financial')}
                    </PrivacyFilter>
                  </Cell>
                </Row>
              ))}
          </View>
        ))}

        {/* Total (Net Worth) */}
        <Row
          style={{
            fontWeight: 700,
            backgroundColor: theme.tableHeaderBackground,
            color: theme.tableHeaderText,
            borderTop: `2px solid ${theme.tableBorder}`,
            marginTop: 10,
          }}
        >
          <Cell width={accountWidth} plain>
            <Trans>Net Worth</Trans>
          </Cell>
          <Cell
            width={balanceWidth}
            plain
            style={{
              textAlign: 'right',
              color: getBalanceColor(data.totalBalance),
            }}
          >
            <PrivacyFilter>
              {format(data.totalBalance, 'financial')}
            </PrivacyFilter>
          </Cell>
        </Row>
      </View>
    </View>
  );
}
