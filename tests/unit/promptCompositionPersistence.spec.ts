import { describe, expect, it, vi, afterEach } from 'vitest';

import { createPromptCompositionPersistence, parseSavedComposition } from '@/utils/promptCompositionPersistence';

const createStorage = () => {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    store,
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('promptCompositionPersistence', () => {
  it('saves and loads compositions using provided storage', () => {
    const storage = createStorage();
    const persistence = createPromptCompositionPersistence({ storage, storageKey: 'test-key' });
    const payload = {
      items: [
        { id: 'one', name: 'One', weight: 1.25 },
        { id: 'two', name: 'Two', weight: 0.5 },
      ],
      base: 'base prompt',
      neg: 'negative',
    };

    persistence.save(payload);
    expect(storage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify(payload));

    const loaded = persistence.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.items).toHaveLength(2);
    expect(loaded?.items[0].weight).toBeCloseTo(1.25);
  });

  it('debounces scheduled saves and can be cancelled', () => {
    vi.useFakeTimers();
    const storage = createStorage();
    const persistence = createPromptCompositionPersistence({ storage, debounceMs: 100, storageKey: 'debounce' });
    const payload = { items: [], base: 'base', neg: '' };

    persistence.scheduleSave(payload);
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(storage.setItem).not.toHaveBeenCalled();

    persistence.cancel();
    vi.advanceTimersByTime(10);
    expect(storage.setItem).not.toHaveBeenCalled();

    persistence.scheduleSave(payload);
    vi.advanceTimersByTime(100);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('parses and normalises stored compositions', () => {
    const parsed = parseSavedComposition({
      items: [
        { id: 'one', name: 'One', weight: 10 },
        { id: 'two', name: 'Two', weight: -5 },
        { id: 'skip' },
      ],
      base: 123,
      neg: null,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.items).toHaveLength(2);
    expect(parsed?.items[0].weight).toBe(2);
    expect(parsed?.items[1].weight).toBe(0);
    expect(parsed?.base).toBe('');
    expect(parsed?.neg).toBe('');
  });

  it('handles storage errors gracefully', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('boom');
      }),
      setItem: vi.fn(() => {
        throw new Error('boom');
      }),
    };

    const persistence = createPromptCompositionPersistence({ storage, storageKey: 'error' });
    expect(() => persistence.save({ items: [], base: '', neg: '' })).not.toThrow();
    expect(() => persistence.load()).not.toThrow();
  });
});
