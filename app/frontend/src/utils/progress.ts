export const normalizeGenerationProgress = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return value <= 1 ? Math.round(value * 100) : Math.round(value)
}
