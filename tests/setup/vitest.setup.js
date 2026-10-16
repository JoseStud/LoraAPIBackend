// Vitest setup for Vue SFCs and DOM
import '@testing-library/jest-dom';
import { createPinia, setActivePinia } from 'pinia';

import { resetBackendSettings } from '@/config/backendSettings';

// No spec may reach the network. A spec that needs HTTP mocks the service module the code under
// test imports, or stubs `fetch` / `WebSocket` itself (vi.stubGlobal or assignment). Anything that
// falls through to these guards fails the test, even when app code swallows the rejection.
const unexpectedNetworkCalls = [];

const describeRequest = (input) => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input?.url ?? String(input);
};

const recordUnexpectedCall = (kind, target) => {
  const message =
    `Unexpected ${kind} in test: ${target}. ` +
    'Mock the module the code under test imports, or stub it locally in the spec.';
  unexpectedNetworkCalls.push(message);
  return new Error(message);
};

globalThis.fetch = (input, init) => {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  return Promise.reject(
    recordUnexpectedCall('network request', `${method} ${describeRequest(input)}`),
  );
};

globalThis.WebSocket = class UnexpectedWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    throw recordUnexpectedCall('WebSocket connection', String(url));
  }
};

let pinia = null;

beforeEach(() => {
  unexpectedNetworkCalls.length = 0;
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  // Dispose the test's stores so their watchers and backend-refresh subscriptions do not react to
  // later tests (e.g. the backend settings reset below).
  pinia?._s.forEach((store) => store.$dispose());
  pinia = null;
  resetBackendSettings();

  if (unexpectedNetworkCalls.length > 0) {
    const calls = unexpectedNetworkCalls.splice(0);
    throw new Error(calls.join('\n'));
  }
});
