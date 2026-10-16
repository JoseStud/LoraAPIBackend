/**
 * Generation progress is a fraction in [0, 1] wherever it crosses the API
 * (REST queue responses and the progress WebSocket), and 1 means complete.
 * The frontend keeps it as a fraction and turns it into a percentage only
 * for display, through `toProgressPercent`. Never guess the scale from the
 * value: a fraction of 1 is 100 %, not 1 %.
 */

/** Clamp an API progress value to a fraction in [0, 1]; non-numbers are 0. */
export const toProgressFraction = (value?: number | null): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
};

/** Whole-number percentage (0–100) to display for a progress fraction. */
export const toProgressPercent = (value?: number | null): number =>
  Math.round(toProgressFraction(value) * 100);
