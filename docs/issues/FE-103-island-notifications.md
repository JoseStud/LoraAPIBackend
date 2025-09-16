# FE-103: Migrate Notifications/Toasts to a Vue island

## Summary
Move global notifications from Alpine to a Vue component with a simple store or provide/inject.

## Affected Files
`app/frontend/static/js/components/notifications/*`

## Tasks
- [ ] Create `Notifications.vue`.
- [ ] Port queueing, auto-dismiss, types, and a11y live-region.
- [ ] Replace Alpine mount with Vue island in templates.

## Acceptance Criteria
- Notifications render and behave identically, with proper a11y.

## References
`docs/VUE_MIGRATION.md`

