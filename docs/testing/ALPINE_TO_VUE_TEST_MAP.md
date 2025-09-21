# Alpine-to-Vue Test Mapping

This catalogue documents how the legacy Alpine-focused Jest suites map to the current Vue 3 test surface. Each legacy scenario now executes against the Vue SPA using Vitest and `@vue/test-utils`, ensuring feature parity while eliminating Jest-specific infrastructure.

## Mobile Navigation (`tests/unit/mobile-nav.test.js`)

| Legacy behaviour validated in Jest | Vue component / view | Vitest coverage |
| --- | --- | --- |
| Component initialises in a closed state and binds DOM listeners | `MobileNav.vue` | `MobileNav.spec.js` – "toggles menu open/closed and overlay visibility" asserts closed default and listener-driven open/close state |
| Toggling updates CSS classes and body scroll lock | `MobileNav.vue` | `MobileNav.spec.js` – same test inspects `.mobile-nav-menu` classes and overlay visibility |
| Escape key closes the menu when open | `MobileNav.vue` | `MobileNav.spec.js` – "closes the menu on Escape key" dispatches a window event to mirror lifecycle |
| Current route link receives active styling | `MobileNav.vue` | `MobileNav.spec.js` – "marks the current route link as active based on pathname" uses a mocked router |
| Graceful handling when menu element is missing | `MobileNav.vue` | Covered implicitly via Vue conditional rendering – the component uses template guards so Vitest mount succeeds without manual DOM mocks |

## Import / Export Console (`tests/unit/import-export.test.js`)

| Legacy behaviour validated in Jest | Vue component / view | Vitest coverage |
| --- | --- | --- |
| Default tab state and configuration bootstrapping | `ImportExport.vue` (embedded in `ImportExportView.vue`) | `ImportExport.spec.js` – "initializes with export tab active" and "renders the component correctly" |
| Export validation rules & quick export helpers | `ImportExport.vue` | `ImportExport.spec.js` – "validates export configuration" and "quick export all sets correct configuration" |
| Export execution & download flow (Blob handling) | `ImportExport.vue` | `ImportExport.spec.js` – "starts export process" stubs `document.createElement`/`URL` and asserts toast completion |
| Import validation, file selection, drag-and-drop, encrypted detection | `ImportExport.vue` | `ImportExport.spec.js` – tests "handles file selection", "handles file drop", "removes files", "detects encrypted files", and "validates import configuration" |
| Import execution with progress updates | `ImportExport.vue` | `ImportExport.spec.js` – "starts import process" verifies toast messaging and state resets |
| Backup workflow (create, quick, schedule, download, restore, delete) | `ImportExport.vue` + `ImportExportView.vue` | Newly added Vitest cases: "creates a full backup and refreshes history", "creates a quick backup…", and "surfaces informational toasts for backup utilities" |
| Migration affordances | `ImportExport.vue` | `ImportExport.spec.js` – "announces upcoming migration flows" ensures the info toasts stay wired |
| Progress messaging & cancellation controls | `ImportExport.vue` | `ImportExport.spec.js` – "cancels operations correctly" and earlier progress assertions |
| Error handling & toast messaging | `ImportExport.vue` | Multiple Vitest cases assert success/error toast states during validation, export, import, and analysis |

## Shared Jest Utilities (`tests/utils/test-helpers.js`)

- **Legacy role:** Provided global DOM mocks, fetch stubs, and Alpine helpers for Jest.
- **Vue/Vitest replacement:**
  - `tests/setup/vitest.setup.js` now registers Pinia, Testing Library matchers, and imports the shared API mock module.
  - `tests/mocks/api-mocks.js` was converted to a Vitest-aware implementation that seeds `fetch`/`WebSocket` with realistic fixtures for both component and integration suites.

These changes let every former Alpine/Jest scenario execute directly against the Vue SPA, while the new Vitest suites remain colocated under `tests/vue/` and reuse the same Pinia/router mocks that ship with the application.
