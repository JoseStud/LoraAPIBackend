// Vitest setup for Vue SFCs and DOM
import '@testing-library/jest-dom';

// Basic fetch mock helper for tests that don't override it
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
}

