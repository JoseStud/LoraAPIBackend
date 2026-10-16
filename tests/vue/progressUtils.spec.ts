import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { GenerationJobStatusSchema, ProgressUpdateSchema } from '../../app/frontend/src/schemas/generation'
import { toProgressFraction, toProgressPercent } from '../../app/frontend/src/utils/progress'
import { useGenerationOrchestratorStore } from '../../app/frontend/src/features/generation/stores/useGenerationOrchestratorStore'

describe('toProgressPercent', () => {
  it('converts API fractions to whole percentages', () => {
    expect(toProgressPercent(0)).toBe(0)
    expect(toProgressPercent(0.01)).toBe(1)
    expect(toProgressPercent(0.25)).toBe(25)
    expect(toProgressPercent(0.5)).toBe(50)
    expect(toProgressPercent(1)).toBe(100)
  })

  it('never reads a fraction of 1 as 1 %', () => {
    expect(toProgressPercent(1)).not.toBe(1)
    expect(toProgressPercent(1.0)).toBe(100)
  })

  it('returns 0 for missing or non-numeric values', () => {
    expect(toProgressPercent()).toBe(0)
    expect(toProgressPercent(null)).toBe(0)
    expect(toProgressPercent(Number.NaN)).toBe(0)
    expect(toProgressPercent(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('clamps out-of-range values instead of guessing their scale', () => {
    expect(toProgressPercent(-0.2)).toBe(0)
    expect(toProgressPercent(1.2)).toBe(100)
    expect(toProgressPercent(50)).toBe(100)
  })
})

describe('toProgressFraction', () => {
  it('keeps fractions as they are and clamps to [0, 1]', () => {
    expect(toProgressFraction(0)).toBe(0)
    expect(toProgressFraction(0.01)).toBe(0.01)
    expect(toProgressFraction(1)).toBe(1)
    expect(toProgressFraction(-1)).toBe(0)
    expect(toProgressFraction(3)).toBe(1)
    expect(toProgressFraction(undefined)).toBe(0)
  })
})

describe('progress schemas', () => {
  const job = { id: 'job-1', status: 'running', created_at: '2026-01-01T00:00:00Z' }

  it('accept fractions from 0 to 1', () => {
    for (const progress of [0, 0.01, 1]) {
      expect(GenerationJobStatusSchema.parse({ ...job, progress }).progress).toBe(progress)
      expect(
        ProgressUpdateSchema.parse({ job_id: 'job-1', status: 'running', progress }).progress,
      ).toBe(progress)
    }
  })

  it('reject values outside the fraction scale', () => {
    expect(GenerationJobStatusSchema.safeParse({ ...job, progress: 50 }).success).toBe(false)
    expect(
      ProgressUpdateSchema.safeParse({ job_id: 'job-1', status: 'running', progress: 50 }).success,
    ).toBe(false)
  })
})

describe('orchestrator store progress', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores progress messages as fractions', () => {
    const store = useGenerationOrchestratorStore()

    store.handleProgressMessage({ job_id: 'job-1', progress: 1, status: 'processing' } as any)

    expect(store.jobs).toHaveLength(1)
    expect(store.jobs[0]?.progress).toBe(1)
  })

  it('clamps out-of-range progress messages to [0, 1]', () => {
    const store = useGenerationOrchestratorStore()

    store.enqueueJob({ id: 'job-2', status: 'processing', progress: 0.25 })
    store.handleProgressMessage({ job_id: 'job-2', progress: -0.25, status: 'processing' } as any)
    expect(store.jobs.find((item) => item.id === 'job-2')?.progress).toBe(0)

    store.handleProgressMessage({ job_id: 'job-2', progress: 150, status: 'processing' } as any)
    expect(store.jobs.find((item) => item.id === 'job-2')?.progress).toBe(1)
  })
})
