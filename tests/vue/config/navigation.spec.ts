import { describe, expect, it } from 'vitest';

import { NAVIGATION_ICON_KEYS, NAVIGATION_ITEMS } from '@/config/navigation';

describe('navigation config', () => {
  it('matches the expected navigation structure', () => {
    expect(NAVIGATION_ITEMS).toMatchInlineSnapshot(`
      [
        {
          "icon": "dashboard",
          "label": "Dashboard",
          "path": "/",
        },
        {
          "icon": "grid",
          "label": "LoRAs",
          "path": "/loras",
        },
        {
          "icon": "spark",
          "label": "Recommendations",
          "path": "/recommendations",
        },
        {
          "icon": "compose",
          "label": "Compose",
          "path": "/compose",
        },
        {
          "icon": "wand",
          "label": "Generate",
          "path": "/generate",
        },
        {
          "icon": "admin",
          "label": "Admin",
          "path": "/admin",
        },
        {
          "icon": "bars",
          "label": "Analytics",
          "path": "/analytics",
        },
        {
          "icon": "grid",
          "label": "Import/Export",
          "path": "/import-export",
        },
      ]
    `);
  });

  it('keeps icon keys in sync with navigation items', () => {
    const iconSet = new Set(NAVIGATION_ICON_KEYS);
    const invalidIcons = NAVIGATION_ITEMS.filter((item) => !iconSet.has(item.icon));

    expect(invalidIcons).toHaveLength(0);
  });
});
