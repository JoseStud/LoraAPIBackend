import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The global setup runs before every spec. Anything it imports from the app is cached before a
// spec's vi.mock() calls run, so those mocks would silently stop applying (AGENTS.md, "Writing
// frontend tests").
describe('global Vitest setup', () => {
  const setupSource = readFileSync(resolve(__dirname, '../setup/vitest.setup.js'), 'utf8');
  const importedModules = [
    ...setupSource.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm),
    ...setupSource.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);

  it('imports no app code', () => {
    expect(importedModules).toContain('pinia');
    expect(
      importedModules.filter((path) => path.startsWith('@/') || path.includes('app/frontend')),
    ).toEqual([]);
  });
});
