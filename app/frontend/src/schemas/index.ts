/**
 * Runtime schemas shared across the frontend.
 *
 * Backend contract updates must be reflected here to keep runtime parsing in
 * sync with API responses. Treat these exports as the single source of truth
 * for payload validation when wiring new endpoints or adjusting existing
 * ones.
 */
export * from './json';
export * from './generation';
export * from './lora';
export * from './system';
