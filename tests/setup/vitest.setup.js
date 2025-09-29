// Vitest setup for Vue SFCs and DOM
import '@testing-library/jest-dom';
import { createPinia, setActivePinia } from 'pinia';

import { resetBackendSettings } from '@/config/backendSettings';

import '../mocks/api-mocks.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  resetBackendSettings();
});

