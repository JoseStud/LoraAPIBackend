# Frontend Refactor & Migration Issues

Tracking issues for fetch consolidation and Vue Islands migration.

## 📊 Current Progress Summary

**Fetch Consolidation: 3/8 Complete (37.5%)**
- ✅ **Completed**: component-loader, prompt-composer, generation-studio  
- ❌ **Pending**: alpine-config (12 calls), dashboard (1 call), common.js (1 call)
- ⚠️ **Partial**: recommendations (uses different API pattern)  
- 🔍 **Review**: pwa-manager (service worker constraints)

**Vue Islands Migration: Components Created, API Integration Incomplete**
- 📦 **Vue Components**: SystemStatusCard, RecommendationsPanel, etc. exist
- ⚠️ **API Issue**: Vue components use `useApi` composable with direct fetch
- 🔧 **Need**: Align Vue components with centralized `utils/api.js`

**Key Coordination Issue**: Multiple API patterns in use (utils/api.js, api-data-fetcher.js, useApi composable)

## Fetch Consolidation

- [x] FE-001: Refactor component-loader fetches to `utils/api.js` (docs/issues/FE-001-fetch-component-loader.md) **COMPLETED**
- [ ] FE-002: Refactor alpine-config fetches to `utils/api.js` (docs/issues/FE-002-fetch-alpine-config.md)
- [~] FE-003: Refactor recommendations module fetches to `utils/api.js` (docs/issues/FE-003-fetch-recommendations-module.md) **PARTIALLY DONE**
- [ ] FE-004: Refactor dashboard module fetches to `utils/api.js` (docs/issues/FE-004-fetch-dashboard-module.md)
- [x] FE-005: Refactor prompt-composer fetches to `utils/api.js` (docs/issues/FE-005-fetch-prompt-composer.md) **COMPLETED**
- [x] FE-006: Refactor generation-studio fetches to `utils/api.js` (docs/issues/FE-006-fetch-generation-studio.md) **COMPLETED**
- [?] FE-007: Review pwa-manager fetch usage (service worker constraints) (docs/issues/FE-007-fetch-pwa-manager.md) **NEEDS REVIEW**
- [ ] FE-008: Refactor common.js adapter actions to `utils/api.js` (docs/issues/FE-008-fetch-common-js.md)

## Vue Islands Migration

- [~] FE-101: Migrate Generation Studio panel to Vue island (docs/issues/FE-101-island-generation-studio.md) **IN PROGRESS**
- [~] FE-102: Migrate Job Queue UI to Vue island (docs/issues/FE-102-island-job-queue.md) **IN PROGRESS**
- [~] FE-103: Migrate Notifications/Toasts to Vue island (docs/issues/FE-103-island-notifications.md) **IN PROGRESS**
- [~] FE-104: Migrate LoRA Gallery to Vue island (docs/issues/FE-104-island-lora-gallery.md) **IN PROGRESS**
- [~] FE-105: Wrap Generation History in a Vue island (docs/issues/FE-105-island-generation-history-wrapper.md) **IN PROGRESS**
- [~] FE-106: Migrate Prompt Composer to Vue island (docs/issues/FE-106-island-prompt-composer.md) **IN PROGRESS**
- [~] FE-107: Migrate Performance Analytics to Vue island (docs/issues/FE-107-island-performance-analytics.md) **IN PROGRESS**
- [~] FE-108: Migrate Import/Export to Vue island (docs/issues/FE-108-island-import-export.md) **IN PROGRESS**
- [~] FE-109: Gradually islandize System Admin screens (docs/issues/FE-109-island-system-admin.md) **IN PROGRESS**

**Note:** Vue components exist but currently use `useApi` composable with direct fetch instead of centralized `utils/api.js`

## Create GitHub Issues (gh CLI)

Prerequisites:
- GitHub CLI installed and authenticated (`gh auth login`)
- jq installed
- Target repository `<owner>/<repo>`

Commands:
- Dry run:
  - `bash scripts/create_github_issues_gh.sh --repo <owner>/<repo> --dry-run`
- Create with optional extra labels:
  - `bash scripts/create_github_issues_gh.sh --repo <owner>/<repo> --labels frontend,migration`
- NPM alias:
  - `npm run issues:create:gh -- --repo <owner>/<repo> --dry-run`

Notes:
- Script reads all `*.md` in `docs/issues` except `README.md`.
- Title is the first Markdown heading; body is full file content.
- Skips creating issues if a title match is already found in the repo (open/closed).

## Alternatives

- Bash (GitHub REST API via curl): `scripts/create_github_issues.sh`
- Node/Octokit: `scripts/create_github_issues.js` (requires `npm install`)

## Issues index (snapshot)

Below is an indexed snapshot of the markdown files in this folder and a short status/description. Update this list when issue docs are added or resolved.

### Fetch Consolidation Progress: 3/8 Complete

1. `FE-001-fetch-component-loader.md` — **completed** — Refactor component-loader fetches to `utils/api.js`.
2. `FE-002-fetch-alpine-config.md` — **open** — Refactor alpine-config fetches to `utils/api.js`. (12 direct fetch calls remain)
3. `FE-003-fetch-recommendations-module.md` — **partial** — Refactor recommendations module fetches to `utils/api.js`. (Uses api-data-fetcher.js, not utils/api.js)
4. `FE-004-fetch-dashboard-module.md` — **open** — Refactor dashboard module fetches to `utils/api.js`. (1 direct fetch call remains)
5. `FE-005-fetch-prompt-composer.md` — **completed** — Refactor prompt-composer fetches to `utils/api.js`.
6. `FE-006-fetch-generation-studio.md` — **completed** — Refactor generation-studio fetches to `utils/api.js`.
7. `FE-007-fetch-pwa-manager.md` — **review needed** — Review pwa-manager fetch usage (service worker constraints). (6 fetch references for SW intercepts)
8. `FE-008-fetch-common-js.md` — **open** — Refactor common.js adapter actions to `utils/api.js`. (1 direct fetch call remains)

### Vue Islands Migration Progress: Components Exist, API Integration Incomplete

9. `FE-101-island-generation-studio.md` — **in progress** — Migrate Generation Studio panel to a Vue island. (Vue components created but use useApi composable with direct fetch)
10. `FE-102-island-job-queue.md` — **in progress** — Migrate Job Queue UI to a Vue island.
11. `FE-103-island-notifications.md` — **in progress** — Migrate Notifications/Toasts to a Vue island.
12. `FE-104-island-lora-gallery.md` — **in progress** — Migrate LoRA Gallery to a Vue island.
13. `FE-105-island-generation-history-wrapper.md` — **in progress** — Wrap Generation History in a Vue island.
14. `FE-106-island-prompt-composer.md` — **in progress** — Migrate Prompt Composer to a Vue island.
15. `FE-107-island-performance-analytics.md` — **in progress** — Migrate Performance Analytics to a Vue island.
16. `FE-108-island-import-export.md` — **in progress** — Migrate Import/Export to a Vue island.
17. `FE-109-island-system-admin.md` — **in progress** — Gradually islandize System Admin screens.

### Key Findings:
- **API Centralization Issue**: Vue components use `useApi` composable with direct fetch instead of `utils/api.js`
- **Mixed Implementation**: Some components use `api-data-fetcher.js`, others use `utils/api.js`
- **Coordination Needed**: The two migration efforts need alignment on API patterns

README maintained: scripts create issues from these files; update statuses here when issues are created/resolved.

