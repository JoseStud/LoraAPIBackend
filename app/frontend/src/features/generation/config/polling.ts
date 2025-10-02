import { runtimeConfig } from '@/config/runtime';
import { tryGetSettingsStore } from '@/stores';
import type { FrontendRuntimeSettings } from '@/types';

export interface GenerationPollingIntervals {
  /**
   * Queue polling interval in milliseconds.
   * Controls how frequently the SPA polls the REST queue endpoint when no
   * WebSocket updates are available.
   */
  queueMs: number;
  /**
   * WebSocket reconnect delay in milliseconds.
   * Determines how long the client waits before attempting to re-open a
   * dropped progress WebSocket connection.
   */
  websocketRetryMs: number;
  /**
   * System status polling interval in milliseconds.
   * Governs how often the SPA requests system health snapshots when the
   * realtime feed is unavailable.
   */
  systemStatusMs: number;
}

export type GenerationPollingOverrides = Partial<GenerationPollingIntervals>;

const DEFAULT_INTERVALS: GenerationPollingIntervals = Object.freeze({
  queueMs: 2_000,
  websocketRetryMs: 3_000,
  systemStatusMs: 10_000,
});

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }

  if (typeof value === 'string') {
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric)) {
      return numeric > 0 ? numeric : null;
    }
  }

  return null;
};

const normaliseOverrides = (overrides: GenerationPollingOverrides | null | undefined) => {
  if (!overrides || typeof overrides !== 'object') {
    return {} as GenerationPollingOverrides;
  }

  const normalised: GenerationPollingOverrides = {};

  if ('queueMs' in overrides) {
    const parsed = parsePositiveInteger(overrides.queueMs);
    if (parsed != null) {
      normalised.queueMs = parsed;
    }
  }

  if ('websocketRetryMs' in overrides) {
    const parsed = parsePositiveInteger(overrides.websocketRetryMs);
    if (parsed != null) {
      normalised.websocketRetryMs = parsed;
    }
  }

  if ('systemStatusMs' in overrides) {
    const parsed = parsePositiveInteger(overrides.systemStatusMs);
    if (parsed != null) {
      normalised.systemStatusMs = parsed;
    }
  }

  return normalised;
};

const readRuntimeConfigOverrides = (): GenerationPollingOverrides => {
  const overrides =
    (runtimeConfig.generationPolling as GenerationPollingOverrides | undefined | null) ?? null;
  return normaliseOverrides(overrides);
};

const readSettingsOverrides = (): GenerationPollingOverrides => {
  const store = tryGetSettingsStore();
  const settings: FrontendRuntimeSettings | null | undefined = store?.rawSettings ?? null;

  if (!settings || typeof settings !== 'object') {
    return {};
  }

  const overrides = normaliseOverrides(
    (settings as { generationPolling?: GenerationPollingOverrides | null | undefined })
      .generationPolling,
  );

  return overrides;
};

const resolveInterval = (
  key: keyof GenerationPollingIntervals,
  fallback: number,
): number => {
  const settingsOverrides = readSettingsOverrides();
  if (settingsOverrides[key] != null) {
    return settingsOverrides[key] as number;
  }

  const runtimeOverrides = readRuntimeConfigOverrides();
  if (runtimeOverrides[key] != null) {
    return runtimeOverrides[key] as number;
  }

  return fallback;
};

export const generationPollingConfig = {
  /**
   * Default interval values used when no runtime overrides are present.
   */
  defaults: DEFAULT_INTERVALS,
  /**
   * Effective queue polling interval in milliseconds.
   */
  get queueMs(): number {
    return resolveInterval('queueMs', DEFAULT_INTERVALS.queueMs);
  },
  /**
   * Effective WebSocket reconnect delay in milliseconds.
   */
  get websocketRetryMs(): number {
    return resolveInterval('websocketRetryMs', DEFAULT_INTERVALS.websocketRetryMs);
  },
  /**
   * Effective system status polling interval in milliseconds.
   */
  get systemStatusMs(): number {
    return resolveInterval('systemStatusMs', DEFAULT_INTERVALS.systemStatusMs);
  },
  /**
   * Resolve a snapshot of the polling configuration.
   */
  resolve(): GenerationPollingIntervals {
    return {
      queueMs: this.queueMs,
      websocketRetryMs: this.websocketRetryMs,
      systemStatusMs: this.systemStatusMs,
    };
  },
} as const;

export default generationPollingConfig;
