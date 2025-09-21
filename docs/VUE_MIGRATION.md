# Vue 3 Islands Migration

This document tracks the progressive migration from HTMX + Alpine.js to Vue 3 using an "islands" architecture. Vue and Alpine coexist; Vue controls isolated mount points while the rest of the page continues to function unchanged.

## Current State

- Core tooling in place: Vite Vue plugin, Vue 3 dependency, Tailwind `.vue` scanning, dev proxy configuration.
- Island scaffolding live via `app/frontend/static/js/main.js`.
- Migrated islands: `HelloWorld.vue`, `RecommendationsPanel.vue`, `MobileNav.vue`, `SystemStatusCard.vue`.
- Prompt composition workflow moved from legacy HTMX/Alpine to Vue (`PromptComposer.vue`, `LoraCard.vue`, `LoraGallery.vue`).
- Generation studio island scaffolded (`GenerationStudio.vue`) with shared composables.
- Vue unit tests cover every migrated island (HelloWorld, RecommendationsPanel, MobileNav, SystemStatusCard, PromptComposer, GenerationStudio).
- Vitest + `@vue/test-utils` configured for SFCs with setup in `tests/setup/vitest.setup.js`.

## Files

- Vite config with Vue plugin: `vite.config.js`
- Entry: `app/frontend/static/js/main.js`
- Vue components: `app/frontend/static/vue/**/*.vue`
- Example component: `app/frontend/static/vue/HelloWorld.vue`
- Feature component: `app/frontend/static/vue/RecommendationsPanel.vue`
- Navigation: `app/frontend/static/vue/MobileNav.vue`
- Prompt tools: `app/frontend/static/vue/PromptComposer.vue`, `app/frontend/static/vue/LoraCard.vue`, `app/frontend/static/vue/LoraGallery.vue`
- Generation tools: `app/frontend/static/vue/GenerationStudio.vue`
- Status widget: `app/frontend/static/vue/SystemStatusCard.vue`
- Composables: `app/frontend/static/vue/composables/*.js`
- Tailwind config: `tailwind.config.js`
- Example template mount: `app/frontend/templates/pages/recommendations.html`
- Base template mount: `app/frontend/templates/base.html` (`data-vue-root="mobile-nav"`).
- System status mounts: `app/frontend/templates/pages/generate.html` & `generate-composition-example.html` (`data-vue-root="system-status-card"`).
- Vue unit tests: `tests/vue/*.spec.js`
- Vitest config: `vitest.config.js`
- Vitest setup: `tests/setup/vitest.setup.js`

## Install & Run

1. Install deps (adds Vue + plugin):
   - `npm install`
2. Start dev servers:
   - Frontend: `npm run dev`
   - Backend (optional): `npm run dev:backend`
3. Open the Recommendations page; you should see the HelloWorld Vue island.
4. Run Vue unit tests (optional):
   - Once: `npm run test:unit:vue`
   - Watch: `npm run test:watch:vue`

## Adding a New Vue Island

1. Create a component under `app/frontend/static/vue/` (e.g., `FeaturePanel.vue`).
2. Add a mount point to the Jinja template: `<div data-vue-root="feature-panel"></div>`
3. Update `main.js` to mount it:
   ```js
   import FeaturePanel from '../vue/FeaturePanel.vue';
   mountVueApp('[data-vue-root="feature-panel"]', FeaturePanel);
   ```

Mount behavior:
- The helper in `main.js` tries immediate mount, then falls back on `DOMContentLoaded` to support late-inserted DOM.
- Scope every island with a unique `data-vue-root` value to avoid clashes and to keep Alpine behavior intact.

### Example: Recommendations Panel

- Mount point: add `<div data-vue-root="recommendations-panel"></div>` in a template (already added to `app/frontend/templates/pages/recommendations.html:8`).
- Component file: `app/frontend/static/vue/RecommendationsPanel.vue`.
- Data fetches:
  - LoRAs: `GET /v1/adapters?per_page=100`.
  - Similar: `GET /v1/recommendations/similar/{lora_id}?limit=..&similarity_threshold=..`.
  - Weights are UI-only initially; backend defaults apply unless nested query dict parsing is enabled.
  - Note: The current implementation uses native `fetch` directly; the `useApi` composable is available if you prefer.

### Example: Mobile Navigation (Migrated)

- Mount point: add `<div data-vue-root="mobile-nav"></div>` in the base layout (already added to `app/frontend/templates/base.html`).
- Component file: `app/frontend/static/vue/MobileNav.vue`.
- Behavior: mirrors the previous Alpine mobile menu (toggle, overlay, active link highlight based on `window.location.pathname`).

### Example: System Status Card (Migrated)

- Mount points:
  - Simple card in `app/frontend/templates/pages/generate.html`: `<div data-vue-root="system-status-card"></div>`
  - Detailed, collapsible card in `app/frontend/templates/pages/generate-composition-example.html`: `<div data-vue-root="system-status-card" data-variant="detailed"></div>`
- Component file: `app/frontend/static/vue/SystemStatusCard.vue`.
- Behavior: fetches `/system/status`, updates the shared Alpine store for compatibility, and handles 404 fallbacks. The detailed variant preserves the expandable panel UI from Alpine.

### Example: Prompt Composer (Migrated)

- Mount point: `<div data-vue-root="prompt-composer"></div>` in `app/frontend/templates/pages/compose.html`.
- Component files: `app/frontend/static/vue/PromptComposer.vue`, `app/frontend/static/vue/LoraCard.vue`, `app/frontend/static/vue/LoraGallery.vue`.
- Tests: `tests/vue/PromptComposer.spec.js`, `tests/vue/LoraCard.spec.js`.
- Legacy fallback still bundled (`app/frontend/static/js/components/prompt-composer.js`) until cleanup completes.

### Example: LoRA Gallery (Migrated UI)

- Mount point: `<div data-vue-root="lora-gallery"></div>` in `app/frontend/templates/pages/loras.html` (Vue island coexists with HTMX fallback).
- Component: `app/frontend/static/vue/LoraGallery.vue`.
- Companion card: `app/frontend/static/vue/LoraCard.vue`.
- Legacy scripts pending removal: `app/frontend/static/js/components/lora-gallery/index.js` plus HTMX snippets in the template.

### Example: Generation Studio (In Progress)

- Mount point: `<div data-vue-root="generation-studio"></div>` in `app/frontend/templates/pages/generate.html`.
- Component: `app/frontend/static/vue/GenerationStudio.vue`.
- Legacy scripts to retire: `app/frontend/static/js/components/generation-studio.js`, `app/frontend/static/js/components/generation-studio/api.js`, `.../ui.js` once feature parity is validated.

## Data Fetching

- Use the included composable for simple fetches: `app/frontend/static/vue/composables/useApi.js`.
- You can switch to Axios later if preferred.

## Refactor Targets

- Fetch Consolidation: standardize on `app/frontend/static/vue/composables/useApi.js` (for Vue SFCs) or `app/frontend/static/js/utils/api.js` (for Alpine/vanilla JS modules).
  - Done: `app/frontend/static/vue/RecommendationsPanel.vue` → `useApi`
  - Done: `app/frontend/static/vue/composables/useSystemStatus.js` → `useApi`
  - Done: `app/frontend/static/js/components/generation-history/data.js` → `utils/api.js`
  - Done (partial: blobs/form keep direct fetch): `app/frontend/static/js/components/system-admin.js` → `utils/api.js`
  - Pending: `app/frontend/static/js/component-loader.js` (tags, dashboard stats, jobs)
  - Pending: `app/frontend/static/js/alpine-config.js` (results list, ratings, favorites, exports)
  - Pending: `app/frontend/static/js/components/recommendations/index.js`
  - Pending: `app/frontend/static/js/components/dashboard/index.js`
  - Done: `app/frontend/static/vue/PromptComposer.vue` (migrated from `components/prompt-composer.js`)
  - Pending: `app/frontend/static/js/components/generation-studio.js`
  - Pending (consider service-worker constraints): `app/frontend/static/js/pwa-manager.js`
  - Pending: `app/frontend/static/js/common.js` (adapter actions)

- Alpine/HTMX → Vue Islands: migrate UI modules incrementally.
  - Pending: Generation Studio panel (`app/frontend/templates/pages/generate.html` + `app/frontend/static/js/components/generation-studio.js`)
  - Pending: Job Queue (`app/frontend/static/js/components/job-queue/*` if present in entry)
  - Pending: Notifications/toasts (`app/frontend/static/js/components/notifications/*`)
  - Migration in validation: LoRA Gallery (`app/frontend/static/vue/LoraGallery.vue`) — remove legacy HTMX blocks after QA
  - Pending: Generation History view (island wrapper around existing modules)
  - Completed: Prompt Composer (`app/frontend/static/vue/PromptComposer.vue`)
  - Pending: Performance Analytics (`app/frontend/static/js/components/performance-analytics/*`)
  - Pending: Import/Export (`app/frontend/static/js/components/import-export/*`)
  - Later: System Admin screens (gradual islandization of sections)

## Legacy Cleanup Plan

| Area | Legacy artifacts | Cleanup steps |
| --- | --- | --- |
| Prompt Composer | `app/frontend/static/js/components/prompt-composer.js`, HTMX snippets in `compose.html`, historic Cypress helpers | 1) Confirm Vue flow covers save/load, clipboard, generate. 2) Remove legacy script imports and HTMX markup. 3) Drop dead tests/fixtures tied to the HTMX workflow. |
| LoRA Gallery | `app/frontend/static/js/components/lora-gallery/index.js`, `loras.html` HTMX `hx-get` blocks | 1) QA Vue gallery for bulk toggles, filtering, pagination. 2) Strip HTMX attributes and remove the JS bundle from build manifests. 3) Simplify template structure and styles post-removal. |
| Generation Studio | `app/frontend/static/js/components/generation-studio/{api,ui}.js`, Alpine data bindings in `generate.html` | 1) Reach feature parity (queue monitoring, history, params). 2) Remove Alpine stores and scripts, update template to rely on Vue only. 3) Delete unused worker polling helpers and adjust docs/tests. |
| Shared loaders | `app/frontend/static/js/component-loader.js`, `app/frontend/static/js/alpine-config.js` | 1) After individual islands land, prune unused loader branches. 2) Convert remaining shared utilities to Vue composables or modules. 3) Remove `alpinejs`/`htmx` npm deps once final consumer is gone. |

> Tip: pair each removal PR with template diffs and `vite.config.js` manifest updates to avoid shipping unused assets.

## Next Steps (Phased Plan)

1. First Feature Migration: Continue migrating low-complexity UI to Vue islands (Recommendations panel scaffold complete; iterate on UX/data).
2. Composables: Factor shared API/websocket logic into composables and adopt them across islands.
3. Optional Global State: Add Pinia if/when multiple islands require shared state.
4. Tests: Expand unit tests for new islands and edge cases (Vitest + @vue/test-utils already configured).
5. Routing (later): Consider `vue-router` for SPA-like sections if multiple islands start to coordinate navigation.
6. Cleanup: Execute the legacy cleanup plan above (remove HTMX/Alpine code, retire bundles, drop dependencies).

## Notes

- Scope Vue islands with `data-vue-root` to avoid interfering with Alpine.
- Keep using the single `main.js` entry to preserve the Vite manifest integration.
- Tailwind includes `.vue` files; add new paths here if structure changes.
- Dev proxy: Vite proxies `/api` to your FastAPI backend; override with `BACKEND_URL` in `.env` if needed.

## Testing (Vitest)

- Scripts:
  - Run Vue unit tests once: `npm run test:unit:vue`
  - Watch mode: `npm run test:watch:vue`
- Config: `vitest.config.js`
- Setup: `tests/setup/vitest.setup.js`
- Example specs:
  - `tests/vue/HelloWorld.spec.js`
  - `tests/vue/RecommendationsPanel.spec.js`
  - `tests/vue/MobileNav.spec.js`
  - `tests/vue/SystemStatusCard.spec.js`
  - `tests/vue/PromptComposer.spec.js`

Troubleshooting:
- If `vitest` is not found, run `npm install` to ensure devDependencies are present.
- If API calls fail in dev, verify `BACKEND_URL` is reachable and Vite proxy is configured.
