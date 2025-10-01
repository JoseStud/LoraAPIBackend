import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { normalizeGenerationProgress } from '../../app/frontend/src/utils/progress.ts'
import { useGenerationOrchestratorStore } from '../../app/frontend/src/features/generation/stores/useGenerationOrchestratorStore'

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

  it('clamps normalized progress between 0 and 100', () => {
    expect(normalizeGenerationProgress(-0.2)).toBe(0)
    expect(normalizeGenerationProgress(-15)).toBe(0)
    expect(normalizeGenerationProgress(1.2)).toBe(1)
    expect(normalizeGenerationProgress(150)).toBe(100)
  })
})

describe('useGenerationQueueStore progress normalization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('clamps progress values above 100 received from progress messages', () => {
    const store = useGenerationOrchestratorStore()

    store.handleProgressMessage({
      job_id: 'job-1',
      progress: 150,
      status: 'processing',
    } as any)

    expect(store.jobs).toHaveLength(1)
    expect(store.jobs[0]?.progress).toBe(100)
  })

  it('clamps progress values below 0 received from progress messages', () => {
    const store = useGenerationOrchestratorStore()

    store.enqueueJob({ id: 'job-2', status: 'processing', progress: 25 })

    store.handleProgressMessage({
      job_id: 'job-2',
      progress: -0.25,
      status: 'processing',
    } as any)

    const job = store.jobs.find((item) => item.id === 'job-2')
    expect(job?.progress).toBe(0)
  })
})
