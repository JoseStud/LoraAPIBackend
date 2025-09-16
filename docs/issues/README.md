# Frontend Refactor & Migration Issues

Tracking issues for fetch consolidation and Vue Islands migration.

## Fetch Consolidation

- [ ] FE-001: Refactor component-loader fetches to `utils/api.js` (docs/issues/FE-001-fetch-component-loader.md)
- [ ] FE-002: Refactor alpine-config fetches to `utils/api.js` (docs/issues/FE-002-fetch-alpine-config.md)
- [ ] FE-003: Refactor recommendations module fetches to `utils/api.js` (docs/issues/FE-003-fetch-recommendations-module.md)
- [ ] FE-004: Refactor dashboard module fetches to `utils/api.js` (docs/issues/FE-004-fetch-dashboard-module.md)
- [ ] FE-005: Refactor prompt-composer fetches to `utils/api.js` (docs/issues/FE-005-fetch-prompt-composer.md)
- [ ] FE-006: Refactor generation-studio fetches to `utils/api.js` (docs/issues/FE-006-fetch-generation-studio.md)
- [ ] FE-007: Review pwa-manager fetch usage (service worker constraints) (docs/issues/FE-007-fetch-pwa-manager.md)
- [ ] FE-008: Refactor common.js adapter actions to `utils/api.js` (docs/issues/FE-008-fetch-common-js.md)

## Vue Islands Migration

- [ ] FE-101: Migrate Generation Studio panel to Vue island (docs/issues/FE-101-island-generation-studio.md)
- [ ] FE-102: Migrate Job Queue UI to Vue island (docs/issues/FE-102-island-job-queue.md)
- [ ] FE-103: Migrate Notifications/Toasts to Vue island (docs/issues/FE-103-island-notifications.md)
- [ ] FE-104: Migrate LoRA Gallery to Vue island (docs/issues/FE-104-island-lora-gallery.md)
- [ ] FE-105: Wrap Generation History in a Vue island (docs/issues/FE-105-island-generation-history-wrapper.md)
- [ ] FE-106: Migrate Prompt Composer to Vue island (docs/issues/FE-106-island-prompt-composer.md)
- [ ] FE-107: Migrate Performance Analytics to Vue island (docs/issues/FE-107-island-performance-analytics.md)
- [ ] FE-108: Migrate Import/Export to Vue island (docs/issues/FE-108-island-import-export.md)
- [ ] FE-109: Gradually islandize System Admin screens (docs/issues/FE-109-island-system-admin.md)

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

1. `FE-001-fetch-component-loader.md` — open — Refactor component-loader fetches to `utils/api.js`.
2. `FE-002-fetch-alpine-config.md` — open — Refactor alpine-config fetches to `utils/api.js`.
3. `FE-003-fetch-recommendations-module.md` — open — Refactor recommendations module fetches to `utils/api.js`.
4. `FE-004-fetch-dashboard-module.md` — open — Refactor dashboard module fetches to `utils/api.js`.
5. `FE-005-fetch-prompt-composer.md` — open — Refactor prompt-composer fetches to `utils/api.js`.
6. `FE-006-fetch-generation-studio.md` — open — Refactor generation-studio fetches to `utils/api.js`.
7. `FE-007-fetch-pwa-manager.md` — open — Review pwa-manager fetch usage (service worker constraints).
8. `FE-008-fetch-common-js.md` — open — Refactor common.js adapter actions to `utils/api.js`.

9. `FE-101-island-generation-studio.md` — open — Migrate Generation Studio panel to a Vue island.
10. `FE-102-island-job-queue.md` — open — Migrate Job Queue UI to a Vue island.
11. `FE-103-island-notifications.md` — open — Migrate Notifications/Toasts to a Vue island.
12. `FE-104-island-lora-gallery.md` — open — Migrate LoRA Gallery to a Vue island.
13. `FE-105-island-generation-history-wrapper.md` — open — Wrap Generation History in a Vue island.
14. `FE-106-island-prompt-composer.md` — open — Migrate Prompt Composer to a Vue island.
15. `FE-107-island-performance-analytics.md` — open — Migrate Performance Analytics to a Vue island.
16. `FE-108-island-import-export.md` — open — Migrate Import/Export to a Vue island.
17. `FE-109-island-system-admin.md` — open — Gradually islandize System Admin screens.

README maintained: scripts create issues from these files; update statuses here when issues are created/resolved.

