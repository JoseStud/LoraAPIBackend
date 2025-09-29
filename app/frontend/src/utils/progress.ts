export const normalizeGenerationProgress = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  const normalized = value <= 1 ? value * 100 : value
  const rounded = Math.round(normalized)

  return Math.min(100, Math.max(0, rounded))
}
