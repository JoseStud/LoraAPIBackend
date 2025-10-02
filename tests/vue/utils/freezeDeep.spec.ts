import { describe, expect, it } from 'vitest';

import { freezeDeep } from '@/utils/freezeDeep';

describe('freezeDeep', () => {
  it('returns an immutable clone that rejects mutations', () => {
    const original = [
      {
        id: 'job-1',
        nested: { value: 1 },
      },
    ];

    const snapshot = freezeDeep(original);

    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);
    expect(snapshot[0]).not.toBe(original[0]);

    expect(() => {
      (snapshot as unknown as unknown[])[0] = { id: 'job-2' };
    }).toThrowError(/immutable snapshot/);

    expect(() => {
      (snapshot[0] as { nested: { value: number } }).nested.value = 2;
    }).toThrowError(/immutable snapshot/);

    expect(original[0].nested.value).toBe(1);
  });
});

