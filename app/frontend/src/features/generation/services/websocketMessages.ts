import {
  GenerationCompletePayloadSchema,
  GenerationSocketEnvelopeSchema,
  GenerationStartedPayloadSchema,
  ProgressUpdateSchema,
} from '@/schemas';
import type {
  GenerationComplete,
  GenerationErrorMessage,
  GenerationSocketSubscription,
  ProgressUpdate,
} from '@/types';
import { normalizeJobStatus } from '@/utils/status';

/**
 * Sent on every (re)connect. The backend routes job messages only to
 * connections that subscribed; `job_ids: null` asks for every job.
 */
export const GENERATION_SOCKET_SUBSCRIPTION: Readonly<GenerationSocketSubscription> =
  Object.freeze({
    type: 'subscribe',
    job_ids: null,
    include_previews: false,
  });

/** What a progress-socket message means for the generation transport. */
export type GenerationSocketEvent =
  | { kind: 'progress'; message: ProgressUpdate }
  | { kind: 'complete'; message: GenerationComplete }
  | { kind: 'error'; message: GenerationErrorMessage }
  /** Recognised messages that need no handling (connection handshake, job start). */
  | { kind: 'ignored'; type: string }
  | { kind: 'unknown'; type: string }
  | { kind: 'invalid'; type: string | null; reason: string };

const IGNORED_TYPES = new Set(['connected', 'subscription_confirmed']);

const invalid = (type: string | null, reason: string): GenerationSocketEvent => ({
  kind: 'invalid',
  type,
  reason,
});

/**
 * Validate a decoded progress-socket message and map it onto the transport's
 * progress / completion / error handlers.
 *
 * The backend sends `{type, timestamp, data}` envelopes with these types
 * (backend/services/websocket/connection_manager.py):
 * - `progress_update` → `ProgressUpdate`
 * - `generation_complete` → `GenerationComplete`; a "failed" status becomes an error
 * - `generation_started`, `connected`, `subscription_confirmed` → nothing to do
 */
export const parseGenerationSocketMessage = (payload: unknown): GenerationSocketEvent => {
  const envelope = GenerationSocketEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    const type =
      payload && typeof payload === 'object' && typeof (payload as { type?: unknown }).type === 'string'
        ? (payload as { type: string }).type
        : null;
    return invalid(type, envelope.error.message);
  }

  const { type, data } = envelope.data;

  switch (type) {
    case 'progress_update': {
      const parsed = ProgressUpdateSchema.safeParse(data);
      return parsed.success
        ? { kind: 'progress', message: parsed.data }
        : invalid(type, parsed.error.message);
    }
    case 'generation_complete': {
      const parsed = GenerationCompletePayloadSchema.safeParse(data);
      if (!parsed.success) {
        return invalid(type, parsed.error.message);
      }
      const { error_message: errorMessage, ...rest } = parsed.data;
      const status = normalizeJobStatus(parsed.data.status);
      if (status === 'completed') {
        return { kind: 'complete', message: { ...rest, status, error_message: errorMessage } };
      }
      return {
        kind: 'error',
        message: { job_id: rest.job_id, error: errorMessage ?? '', status: 'failed' },
      };
    }
    case 'generation_started': {
      const parsed = GenerationStartedPayloadSchema.safeParse(data);
      return parsed.success ? { kind: 'ignored', type } : invalid(type, parsed.error.message);
    }
    default:
      return IGNORED_TYPES.has(type) ? { kind: 'ignored', type } : { kind: 'unknown', type };
  }
};
