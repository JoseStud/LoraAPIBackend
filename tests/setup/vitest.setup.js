// Vitest setup for Vue SFCs and DOM
import '@testing-library/jest-dom';
import { createPinia, setActivePinia } from 'pinia';

import { resetBackendSettings } from '@/config/backendSettings';

import '../mocks/api-mocks.js';

let pinia = null;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  // Dispose the test's stores so their watchers and backend-refresh subscriptions do not react to
  // later tests (e.g. the backend settings reset below).
  pinia?._s.forEach((store) => store.$dispose());
  pinia = null;
  resetBackendSettings();
});

