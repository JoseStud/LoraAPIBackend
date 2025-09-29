export const NAVIGATION_ICON_KEYS = [
  'dashboard',
  'grid',
  'spark',
  'compose',
  'wand',
  'admin',
  'bars',
] as const;

export type NavigationIconKey = (typeof NAVIGATION_ICON_KEYS)[number];

export interface NavigationSecondaryAction {
  label: string;
  to: string;
  icon?: NavigationIconKey;
}

export interface NavigationItem {
  path: string;
  label: string;
  icon: NavigationIconKey;
  secondaryAction?: NavigationSecondaryAction;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/loras', label: 'LoRAs', icon: 'grid' },
  { path: '/recommendations', label: 'Recommendations', icon: 'spark' },
  { path: '/compose', label: 'Compose', icon: 'compose' },
  { path: '/generate', label: 'Generate', icon: 'wand' },
  { path: '/admin', label: 'Admin', icon: 'admin' },
  { path: '/analytics', label: 'Analytics', icon: 'bars' },
  { path: '/import-export', label: 'Import/Export', icon: 'grid' },
] as const;
