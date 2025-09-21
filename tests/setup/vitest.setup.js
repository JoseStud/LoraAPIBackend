// Vitest setup for Vue SFCs and DOM
import '@testing-library/jest-dom';
import { createPinia, setActivePinia } from 'pinia';

import '../mocks/api-mocks.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

