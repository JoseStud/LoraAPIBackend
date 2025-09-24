import { describe, expect, it } from 'vitest';

import { usePersistence } from '../../app/frontend/src/composables/shared/usePersistence';
import { PERSISTENCE_KEYS } from '../../app/frontend/src/constants/persistence';

describe('usePersistence', () => {
  it('gracefully handles missing storage adapters', () => {
    const persistence = usePersistence(null);

    expect(persistence.hasStorage).toBe(false);
    expect(persistence.getItem(PERSISTENCE_KEYS.historyViewMode)).toBeNull();
    expect(persistence.getJSON(PERSISTENCE_KEYS.historyViewMode, 'grid')).toBe('grid');
  });

  it('reads and writes JSON payloads', () => {
    const data = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };

    const persistence = usePersistence(adapter);
    const payload = { prompt: 'hello world' };

    persistence.setJSON(PERSISTENCE_KEYS.reuseParameters, payload);

    expect(data.get(PERSISTENCE_KEYS.reuseParameters)).toEqual(JSON.stringify(payload));
    expect(persistence.getJSON(PERSISTENCE_KEYS.reuseParameters, {})).toEqual(payload);

    persistence.removeItem(PERSISTENCE_KEYS.reuseParameters);
    expect(persistence.getItem(PERSISTENCE_KEYS.reuseParameters)).toBeNull();
  });

  it('returns fallback when stored JSON is invalid', () => {
    const data = new Map<string, string>([[PERSISTENCE_KEYS.reuseParameters, '{invalid']]);
    const adapter = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };

    const persistence = usePersistence(adapter);
    const fallback = { prompt: 'fallback' };

    expect(persistence.getJSON(PERSISTENCE_KEYS.reuseParameters, fallback)).toEqual(fallback);
  });
});
