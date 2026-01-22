// Custom sidebar configuration
// This file contains overrides for sidebar navigation items.
// Keeping customizations here minimizes merge conflicts during Actual upgrades.

/**
 * Custom route overrides for primary sidebar items.
 * Key: original item identifier
 * Value: new route path
 */
export const customRouteOverrides: Record<string, string> = {
  budget: '/reports/yearly-budget-planner',
};

/**
 * Get the route for a sidebar item, applying any custom overrides.
 * @param itemId - The identifier of the sidebar item (e.g., 'budget', 'reports')
 * @param defaultRoute - The default route if no override exists
 * @returns The route to use (custom override or default)
 */
export function getSidebarRoute(itemId: string, defaultRoute: string): string {
  return customRouteOverrides[itemId] ?? defaultRoute;
}
