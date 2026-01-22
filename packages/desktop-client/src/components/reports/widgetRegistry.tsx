import React, { type ComponentType, type ReactElement } from 'react';

import { type Widget } from 'loot-core/types/models';

/**
 * Widget Registry Pattern
 *
 * This registry allows widgets to be registered in a centralized location,
 * reducing the number of changes needed in Overview.tsx when adding new widgets.
 *
 * To add a new widget:
 * 1. Create your widget components (Card, Full page, etc.)
 * 2. Call registerWidget() in this file or in a separate registration file
 * 3. Import your registration file in widgetRegistrations.ts
 *
 * Overview.tsx will automatically pick up registered widgets.
 */

export type WidgetCardProps = {
  widgetId: string;
  isEditing: boolean;
  meta: unknown;
  onMetaChange: (newMeta: unknown) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
  // Optional props that some widgets need
  accounts?: unknown[];
  firstDayOfWeekIdx?: string;
};

export type WidgetRegistration = {
  type: Widget['type'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<any>;
  menuLabel: string;
  // Optional: feature flag that must be enabled
  featureFlag?: string;
  // Optional: minimum dimensions
  minWidth?: number;
  minHeight?: number;
};

// The registry storage
const widgetRegistry = new Map<string, WidgetRegistration>();

// Menu items that should appear after all registered widgets
const menuSuffix: Array<{ name: string; text: string }> = [];

/**
 * Register a widget type with the registry
 */
export function registerWidget(registration: WidgetRegistration): void {
  widgetRegistry.set(registration.type, registration);
}

/**
 * Get all registered widgets
 */
export function getRegisteredWidgets(): WidgetRegistration[] {
  return Array.from(widgetRegistry.values());
}

/**
 * Get a specific widget registration by type
 */
export function getWidgetRegistration(
  type: string,
): WidgetRegistration | undefined {
  return widgetRegistry.get(type);
}

/**
 * Get menu items for the "Add widget" menu
 * Returns items in registration order
 */
export function getWidgetMenuItems(
  t: (key: string) => string,
  featureFlags: Record<string, boolean> = {},
): Array<{ name: string; text: string }> {
  const items: Array<{ name: string; text: string }> = [];

  for (const registration of widgetRegistry.values()) {
    // Skip if feature flag required but not enabled
    if (registration.featureFlag && !featureFlags[registration.featureFlag]) {
      continue;
    }

    items.push({
      name: registration.type,
      text: t(registration.menuLabel),
    });
  }

  return items;
}

/**
 * Check if a widget type is registered
 */
export function isRegisteredWidget(type: string): boolean {
  return widgetRegistry.has(type);
}

/**
 * Render a widget by type
 * Returns null if the widget type is not registered
 */
export function renderRegisteredWidget(
  type: string,
  props: WidgetCardProps,
  featureFlags: Record<string, boolean> = {},
): ReactElement | null {
  const registration = widgetRegistry.get(type);

  if (!registration) {
    return null;
  }

  // Check feature flag
  if (registration.featureFlag && !featureFlags[registration.featureFlag]) {
    return null;
  }

  const { Component } = registration;
  return <Component {...props} />;
}
