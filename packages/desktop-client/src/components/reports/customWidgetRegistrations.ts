/**
 * Custom Widget Registrations
 *
 * This file registers custom/extended widgets that are not part of
 * the core Actual Budget. When upgrading Actual, this file should
 * remain unchanged and just needs to be re-imported.
 *
 * To minimize merge conflicts with upstream Actual:
 * 1. All custom widgets are registered here
 * 2. This file is imported once in Overview.tsx
 * 3. No other modifications to Overview.tsx are needed for custom widgets
 */

import { registerWidget } from './widgetRegistry';

import { BudgetVsActualCard } from './reports/BudgetVsActualCard';
import { CurrentAssetValueCard } from './reports/CurrentAssetValueCard';

// Register Budget vs Actual widget
registerWidget({
  type: 'budget-vs-actual-card',
  Component: BudgetVsActualCard,
  menuLabel: 'Budget vs Actual',
});

// Register Current Asset Value widget
registerWidget({
  type: 'current-asset-value-card',
  Component: CurrentAssetValueCard,
  menuLabel: 'Current Asset Value',
});

// Export a flag to confirm registrations are loaded
export const customWidgetsRegistered = true;
