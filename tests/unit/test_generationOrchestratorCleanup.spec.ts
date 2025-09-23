import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia, storeToRefs } from 'pinia';

import {
  useGenerationConnectionStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '../../app/frontend/src/stores/generation';
import { createGenerationOrchestrator } from '../../app/frontend/src/services/generation';

const transportClearMock = vi.fn();
const transportStopUpdatesMock = vi.fn();

const transportMock = {
  startGeneration: vi.fn(),
  cancelJob: vi.fn(),
  deleteResult: vi.fn(),
  refreshSystemStatus: vi.fn(),
  refreshActiveJobs: vi.fn(),
  refreshRecentResults: vi.fn(),
  refreshAllData: vi.fn(),
  initializeUpdates: vi.fn(),
  stopUpdates: transportStopUpdatesMock,
  reconnectUpdates: vi.fn(),
  setPollInterval: vi.fn(),
  clear: transportClearMock,
};

const useGenerationTransportMock = vi.fn(() => transportMock);

vi.mock('../../app/frontend/src/composables/generation', () => ({
  useGenerationTransport: useGenerationTransportMock,
}));

describe('createGenerationOrchestrator without Vue scope', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when instantiated outside a scope and manual cleanup clears transport', () => {
    const queueStore = useGenerationQueueStore();
    const resultsStore = useGenerationResultsStore();
    const connectionStore = useGenerationConnectionStore();

    const { historyLimit } = storeToRefs(resultsStore);
    const { pollIntervalMs } = storeToRefs(connectionStore);

    const orchestrator = createGenerationOrchestrator({
      showHistory: ref(false),
      configuredBackendUrl: ref(null),
      notificationAdapter: { notify: vi.fn(), debug: vi.fn() },
      queueStore,
      resultsStore,
      connectionStore,
      historyLimit,
      pollIntervalMs,
    });

    orchestrator.cleanup();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(transportClearMock).toHaveBeenCalledTimes(1);
    expect(transportStopUpdatesMock).not.toHaveBeenCalled();
  });
});
