import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';

import { MobileBackButton } from '@desktop-client/components/mobile/MobileBackButton';
import {
  MobilePageHeader,
  Page,
  PageHeader,
} from '@desktop-client/components/Page';
import { YearlyBudgetPlannerTable } from '@desktop-client/components/reports/graphs/YearlyBudgetPlannerTable';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import {
  loadYearlyBudgetPlannerData,
  type YearlyBudgetPlannerData,
} from '@desktop-client/components/reports/spreadsheets/yearly-budget-planner-spreadsheet';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

type EditedBudgets = Record<string, Record<string, number>>;
type YearlyBudgetInputs = Record<string, number>;

export function YearlyBudgetPlanner() {
  const { t } = useTranslation();
  const categories = useCategories();
  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [data, setData] = useState<YearlyBudgetPlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track edited budgets (not yet saved)
  const [editedBudgets, setEditedBudgets] = useState<EditedBudgets>({});
  // Track yearly budget input values (helper, not persisted)
  const [yearlyBudgetInputs, setYearlyBudgetInputs] =
    useState<YearlyBudgetInputs>({});

  const hasUnsavedChanges = Object.keys(editedBudgets).length > 0;

  // Load data when year or categories change
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!categories.list.length) return;

      setLoading(true);
      try {
        const result = await loadYearlyBudgetPlannerData({
          year,
          categories,
          showHiddenCategories,
        });
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to load budget planner data:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [year, categories, showHiddenCategories]);

  // Warn about unsaved changes when navigating away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleYearChange = useCallback(
    (newYear: number) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t(
            'You have unsaved changes. Are you sure you want to switch years? Your changes will be lost.',
          ),
        );
        if (!confirmed) return;
      }
      setYear(newYear);
      setEditedBudgets({});
      setYearlyBudgetInputs({});
    },
    [hasUnsavedChanges, t],
  );

  const handleBudgetChange = useCallback(
    (categoryId: string, month: string, amount: number) => {
      setEditedBudgets(prev => ({
        ...prev,
        [categoryId]: {
          ...prev[categoryId],
          [month]: amount,
        },
      }));
    },
    [],
  );

  const handleYearlyBudgetInputChange = useCallback(
    (categoryId: string, amount: number) => {
      setYearlyBudgetInputs(prev => ({
        ...prev,
        [categoryId]: amount,
      }));
    },
    [],
  );

  const handleDistribute = useCallback(
    (categoryId: string) => {
      const yearlyAmount = yearlyBudgetInputs[categoryId] || 0;
      if (yearlyAmount === 0 || !data) return;

      // Distribute evenly across 12 months
      const baseAmount = Math.floor(yearlyAmount / 12);
      const remainder = yearlyAmount - baseAmount * 12;

      const newMonthBudgets: Record<string, number> = {};
      data.months.forEach((month, idx) => {
        // Add 1 to the first 'remainder' months to handle rounding
        newMonthBudgets[month] = baseAmount + (idx < remainder ? 1 : 0);
      });

      setEditedBudgets(prev => ({
        ...prev,
        [categoryId]: {
          ...prev[categoryId],
          ...newMonthBudgets,
        },
      }));
    },
    [yearlyBudgetInputs, data],
  );

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    setSaving(true);
    try {
      // Save all edited budgets directly
      // Tracking budget stores all amounts as positive
      for (const [categoryId, months] of Object.entries(editedBudgets)) {
        for (const [month, amount] of Object.entries(months)) {
          await send('budget/budget-amount', {
            month,
            category: categoryId,
            amount,
          });
        }
      }

      // Reload data to reflect saved changes
      const result = await loadYearlyBudgetPlannerData({
        year,
        categories,
        showHiddenCategories,
      });
      setData(result);
      setEditedBudgets({});

      // Could show a success toast here
    } catch (error) {
      console.error('Failed to save budgets:', error);
      // Could show an error toast here
    } finally {
      setSaving(false);
    }
  }, [hasUnsavedChanges, editedBudgets, year, categories, showHiddenCategories]);

  const title = hasUnsavedChanges
    ? `${t('Yearly Budget Planner')} *`
    : t('Yearly Budget Planner');

  if (loading || !data) {
    return (
      <Page
        header={
          isNarrowWidth ? (
            <MobilePageHeader
              title={t('Yearly Budget Planner')}
              leftContent={
                <MobileBackButton onPress={() => navigate('/reports')} />
              }
            />
          ) : (
            <PageHeader title={t('Yearly Budget Planner')} />
          )
        }
      >
        <LoadingIndicator />
      </Page>
    );
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
          flexWrap: 'wrap',
        }}
      >
        {/* Year selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button
            variant="bare"
            onPress={() => handleYearChange(year - 1)}
            aria-label={t('Previous year')}
          >
            <SvgCheveronLeft width={16} height={16} />
          </Button>
          <Text
            style={{
              fontSize: 18,
              fontWeight: 600,
              minWidth: 60,
              textAlign: 'center',
            }}
          >
            {year}
          </Text>
          <Button
            variant="bare"
            onPress={() => handleYearChange(year + 1)}
            aria-label={t('Next year')}
          >
            <SvgCheveronRight width={16} height={16} />
          </Button>
        </View>

        <Button
          onPress={() => handleYearChange(currentYear)}
          isDisabled={year === currentYear}
        >
          <Trans>Current Year</Trans>
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

        <Button
          onPress={() => setShowHiddenCategories(state => !state)}
          variant={showHiddenCategories ? 'primary' : 'normal'}
        >
          {showHiddenCategories
            ? t('Hide hidden categories')
            : t('Show hidden categories')}
        </Button>

        <View style={{ flex: 1 }} />

        {/* Save button */}
        <Button
          variant="primary"
          onPress={handleSave}
          isDisabled={!hasUnsavedChanges || saving}
        >
          {saving ? t('Saving...') : t('Save')}
        </Button>
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
        <YearlyBudgetPlannerTable
          data={data}
          editedBudgets={editedBudgets}
          yearlyBudgetInputs={yearlyBudgetInputs}
          onBudgetChange={handleBudgetChange}
          onYearlyBudgetInputChange={handleYearlyBudgetInputChange}
          onDistribute={handleDistribute}
        />
      </View>
    </Page>
  );
}
