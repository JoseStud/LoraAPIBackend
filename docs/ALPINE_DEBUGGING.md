# Alpine.js Debugging: ExpressionErrors & ReferenceError

This short guide explains why `Uncaught ReferenceError` / Alpine ExpressionErrors happen in this project and how to resolve them quickly.

Why it happens

- Templates are rendered server-side (Jinja2) and include Alpine expressions (e.g., `x-text="loading ? '...' : 'Ready'"`).
- If Alpine evaluates that expression before the component's factory has registered or before the factory returns an object with `loading`, the expression throws a ReferenceError.

Common root causes

- Script load order/race: Alpine starts before `Alpine.data(...)` registrations.
- Missing explicit defaults in component factories.
- Templates use bare identifiers without optional chaining or `x-cloak`.

Mitigations in repository

- Defer Alpine startup and use `component-loader.js` to register safe stubs and real factories before calling `Alpine.start()`.
- Add explicit defaults in component factories (e.g., `computingEmbeddings: false`, `embeddingProgress: 0`).
- Use `x-cloak` on elements that should be hidden until the component initializes.

Debug steps

1. Reproduce the error and copy the console message (identifier and source file/line).
2. Search the repo for the identifier to find the component that should declare it.
3. Edit the component factory (under `app/frontend/static/js/components/`) and add a safe default to the returned object.
4. Hard-refresh the page to ensure new JS is loaded.

Quick checklist

- [ ] Component factory declares all template properties.
- [ ] ComponentLoader contains a safe stub for lazy components.
- [ ] Use `x-cloak` or guarded expressions where needed.

If you'd like, I can run a repo scan to map every `x-data` component to the identifiers used in its templates and produce a missing-keys report.
