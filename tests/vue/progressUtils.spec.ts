import { describe, expect, it } from 'vitest'

import { normalizeGenerationProgress } from '../../app/frontend/src/utils/progress.ts'

describe('normalizeGenerationProgress', () => {
  it('returns 0 for undefined and null values', () => {
    expect(normalizeGenerationProgress()).toBe(0)
    expect(normalizeGenerationProgress(null)).toBe(0)
  })

  it('returns 0 for non-numeric values', () => {
    expect(normalizeGenerationProgress(Number.NaN)).toBe(0)
  })

  it('normalizes fractional progress to percentages', () => {
    expect(normalizeGenerationProgress(0.25)).toBe(25)
    expect(normalizeGenerationProgress(0.5)).toBe(50)
    expect(normalizeGenerationProgress(0.999)).toBe(100)
  })

  it('rounds numeric percentages above 1', () => {
    expect(normalizeGenerationProgress(45.2)).toBe(45)
    expect(normalizeGenerationProgress(99.6)).toBe(100)
  })
})
