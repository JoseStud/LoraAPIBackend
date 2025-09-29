import { afterEach, describe, expect, it } from 'vitest';

import { getBackendApiKey, resetBackendSettings, updateBackendSettings } from '@/config/backendSettings';
import {
  API_AUTH_HEADER,
  buildAuthenticatedHeaders,
  getActiveApiKey,
} from '@/utils/httpAuth';

const originalWindowApiKey = typeof window !== 'undefined'
  ? (window as typeof window & { BACKEND_API_KEY?: string | null }).BACKEND_API_KEY
  : undefined;

describe('httpAuth utilities', () => {
  afterEach(() => {
    resetBackendSettings();

    if (typeof window !== 'undefined') {
      const win = window as typeof window & { BACKEND_API_KEY?: string | null };
      if (originalWindowApiKey === undefined) {
        delete win.BACKEND_API_KEY;
      } else {
        win.BACKEND_API_KEY = originalWindowApiKey;
      }
    }
  });

  it('returns null when no API key is configured', () => {
    resetBackendSettings();

    expect(getBackendApiKey()).toBeNull();
    expect(getActiveApiKey()).toBeNull();

    const headers = buildAuthenticatedHeaders({ Accept: 'application/json' });
    expect(headers).toEqual({ Accept: 'application/json' });
  });

  it('prefers provider state over window globals', () => {
    if (typeof window !== 'undefined') {
      (window as typeof window & { BACKEND_API_KEY?: string | null }).BACKEND_API_KEY = 'window-value';
    }

    updateBackendSettings({ backendApiKey: '  secret-key  ' });

    expect(getBackendApiKey()).toBe('secret-key');
    expect(getActiveApiKey()).toBe('secret-key');

    const headers = buildAuthenticatedHeaders();
    expect(headers).toMatchObject({ [API_AUTH_HEADER]: 'secret-key' });
  });

  it('responds to runtime updates without mutating existing headers', () => {
    updateBackendSettings({ backendApiKey: 'initial' });
    const first = buildAuthenticatedHeaders();
    expect(first).toMatchObject({ [API_AUTH_HEADER]: 'initial' });

    updateBackendSettings({ backendApiKey: 'updated-value' });

    const headers = buildAuthenticatedHeaders({ [API_AUTH_HEADER]: 'preset' });
    expect(headers).toMatchObject({ [API_AUTH_HEADER]: 'preset' });
    expect(getActiveApiKey()).toBe('updated-value');
  });
});
