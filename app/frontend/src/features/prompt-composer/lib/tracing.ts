export type PromptComposerTraceEventType = 'validate' | 'submit' | 'abort';

export interface PromptComposerTraceEvent<T extends PromptComposerTraceEventType = PromptComposerTraceEventType> {
  type: T;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type PromptComposerTraceEmitter = (event: PromptComposerTraceEvent) => void;

const defaultEmitter: PromptComposerTraceEmitter = (event) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- the default trace emitter writes to the console in dev builds
    console.debug('[prompt-composer]', event);
  }
};

export interface PromptComposerTracer {
  emit: <T extends PromptComposerTraceEventType>(
    type: T,
    details?: PromptComposerTraceEvent<T>['details'],
  ) => void;
}

export const createPromptComposerTracer = (
  emitter: PromptComposerTraceEmitter = defaultEmitter,
): PromptComposerTracer => ({
  emit: (type, details) => {
    emitter({
      type,
      timestamp: Date.now(),
      details,
    });
  },
});
