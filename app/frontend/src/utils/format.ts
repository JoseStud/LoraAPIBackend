export interface FormatFileSizeOptions {
  decimals?: number;
  base?: 1000 | 1024;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Format a file size in bytes into a human-readable string.
 */
export function formatFileSize(bytes: number, { decimals = 2, base = 1024 }: FormatFileSizeOptions = {}): string {
  if (!isFiniteNumber(bytes) || bytes < 0) {
    return '0 Bytes';
  }

  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = base;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = base === 1024
    ? ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const formatted = Number.isInteger(dm) ? value.toFixed(dm) : value.toString();

  return `${parseFloat(formatted)} ${sizes[i] ?? 'B'}`;
}

export interface FormatDurationOptions {
  style?: 'short' | 'long';
}

function plural(value: number): string {
  return Math.abs(value) === 1 ? '' : 's';
}

/**
 * Format a duration expressed in seconds.
 */
export function formatDuration(seconds: number, { style = 'short' }: FormatDurationOptions = {}): string {
  if (!isFiniteNumber(seconds) || seconds < 0) {
    return style === 'long' ? '0 seconds' : '0s';
  }

  if (seconds < 60) {
    return style === 'long'
      ? `${seconds.toFixed(1)} second${plural(seconds)}`
      : `${seconds.toFixed(1)}s`;
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes < 60) {
    if (style === 'long') {
      const minuteLabel = `minute${plural(minutes)}`;
      const secondLabel = `second${plural(remainingSeconds)}`;
      return `${minutes} ${minuteLabel} ${remainingSeconds} ${secondLabel}`.trim();
    }
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (style === 'long') {
    const hourLabel = `hour${plural(hours)}`;
    const minuteLabel = `minute${plural(remainingMinutes)}`;
    return `${hours} ${hourLabel} ${remainingMinutes} ${minuteLabel}`.trim();
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a duration expressed in milliseconds.
 */
export function formatDurationFromMilliseconds(milliseconds: number, options?: FormatDurationOptions): string {
  if (!isFiniteNumber(milliseconds)) {
    return formatDuration(0, options);
  }
  return formatDuration(milliseconds / 1000, options);
}

export type DateInput = Date | string | number;

function toDate(input: DateInput): Date | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === 'string' || typeof input === 'number') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Format the elapsed time between two date-like values.
 */
export function formatElapsedTime(start: DateInput, end: DateInput = new Date(), options?: FormatDurationOptions): string {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return options?.style === 'long' ? '0 seconds' : '0s';
  }

  const diffSeconds = Math.max(0, (endDate.getTime() - startDate.getTime()) / 1000);
  return formatDuration(diffSeconds, options);
}

/**
 * Format a date/time using Intl.DateTimeFormat.
 */
export function formatDateTime(input: DateInput, options: Intl.DateTimeFormatOptions = {}, locale = 'en-US'): string {
  const date = toDate(input);
  if (!date) {
    return '';
  }
  const formatter = new Intl.DateTimeFormat(locale, options);
  return formatter.format(date);
}

/**
 * Format a date/time into a relative string such as "2 hours ago".
 */
export function formatRelativeTime(input: DateInput, base: DateInput = new Date(), locale = 'en-US'): string {
  const targetDate = toDate(input);
  const baseDate = toDate(base) ?? new Date();

  if (!targetDate) {
    return '';
  }

  const diff = targetDate.getTime() - baseDate.getTime();
  const thresholds: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
    { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
    { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
    { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
    { unit: 'day', ms: 1000 * 60 * 60 * 24 },
    { unit: 'hour', ms: 1000 * 60 * 60 },
    { unit: 'minute', ms: 1000 * 60 },
    { unit: 'second', ms: 1000 },
  ];

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const { unit, ms } of thresholds) {
    const value = diff / ms;
    if (Math.abs(value) >= 1 || unit === 'second') {
      return formatter.format(Math.round(value), unit);
    }
  }

  return formatter.format(0, 'second');
}

/**
 * Format a number using Intl.NumberFormat.
 */
export function formatNumber(value: number, locale = 'en-US', options?: Intl.NumberFormatOptions): string {
  if (!isFiniteNumber(value)) {
    return '0';
  }
  return new Intl.NumberFormat(locale, options).format(value);
}

export interface FormatPercentageOptions {
  isDecimal?: boolean;
  decimals?: number;
  locale?: string;
}

/**
 * Format a numeric percentage value.
 */
export function formatPercentage(value: number, { isDecimal = true, decimals = 1, locale = 'en-US' }: FormatPercentageOptions = {}): string {
  if (!isFiniteNumber(value)) {
    return isDecimal ? '0.0%' : '0%';
  }

  const percentage = isDecimal ? value * 100 : value;
  const formatted = formatNumber(percentage, locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${formatted}%`;
}

/**
 * Truncate a string to a maximum length with an optional suffix.
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (typeof text !== 'string' || maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, Math.max(0, maxLength - suffix.length));
  return `${truncated}${suffix}`;
}

/**
 * Escape HTML special characters in a string.
 */
export function escapeHtml(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

