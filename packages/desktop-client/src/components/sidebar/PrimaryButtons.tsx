import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import {
  SvgCalculator,
  SvgCheveronDown,
  SvgCheveronRight,
  SvgCog,
  SvgCreditCard,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { Item } from './Item';
import { SecondaryItem } from './SecondaryItem';

import { useIsTestEnv } from '@desktop-client/hooks/useIsTestEnv';
import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const [isBudgetOpen, setBudgetOpen] = useState(false);
  const [isMoreOpen, setMoreOpen] = useState(false);
  const onToggleBudget = useCallback(() => setBudgetOpen(open => !open), []);
  const onToggleMore = useCallback(() => setMoreOpen(open => !open), []);
  const location = useLocation();

  const syncServerStatus = useSyncServerStatus();
  const isTestEnv = useIsTestEnv();
  const isUsingServer = syncServerStatus !== 'no-server' || isTestEnv;

  const isBudgetActive = ['/budget', '/reports/yearly-budget-planner'].some(
    route => location.pathname.startsWith(route),
  );

  const isMoreActive = [
    '/payees',
    '/rules',
    '/bank-sync',
    '/settings',
    '/tools',
  ].some(route => location.pathname.startsWith(route));

  return (
    <View style={{ flexShrink: 0 }}>
      <Item
        title={t('Budget')}
        Icon={isBudgetOpen ? SvgCheveronDown : SvgCheveronRight}
        onClick={onToggleBudget}
        style={{ marginBottom: isBudgetOpen ? 8 : 0 }}
        forceActive={!isBudgetOpen && isBudgetActive}
      />
      {isBudgetOpen && (
        <>
          <SecondaryItem
            title={t('Budget')}
            Icon={SvgWallet}
            to="/budget"
            indent={15}
          />
          <SecondaryItem
            title={t('Budget Planner')}
            Icon={SvgCalculator}
            to="/reports/yearly-budget-planner"
            indent={15}
          />
        </>
      )}
      <Item title={t('Reports')} Icon={SvgReports} to="/reports" />
      <Item title={t('Schedules')} Icon={SvgCalendar3} to="/schedules" />
      <Item
        title={t('More')}
        Icon={isMoreOpen ? SvgCheveronDown : SvgCheveronRight}
        onClick={onToggleMore}
        style={{ marginBottom: isMoreOpen ? 8 : 0 }}
        forceActive={!isMoreOpen && isMoreActive}
      />
      {isMoreOpen && (
        <>
          <SecondaryItem
            title={t('Payees')}
            Icon={SvgStoreFront}
            to="/payees"
            indent={15}
          />
          <SecondaryItem
            title={t('Rules')}
            Icon={SvgTuning}
            to="/rules"
            indent={15}
          />
          {isUsingServer && (
            <SecondaryItem
              title={t('Bank Sync')}
              Icon={SvgCreditCard}
              to="/bank-sync"
              indent={15}
            />
          )}
          <SecondaryItem
            title={t('Tags')}
            Icon={SvgTag}
            to="/tags"
            indent={15}
          />
          <SecondaryItem
            title={t('Settings')}
            Icon={SvgCog}
            to="/settings"
            indent={15}
          />
        </>
      )}
    </View>
  );
}
