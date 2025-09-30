import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, unref, watch } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import type { RecommendationItem, RecommendationResponse } from '@/types';

type UseRecommendations = typeof import('@/features/recommendations/composables/useRecommendations').useRecommendations;
type UseSettingsStore = typeof import('@/stores/settings').useSettingsStore;

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const serviceMocks = {
  fetchAdapterList: vi.fn(),
  fetchAdapterTags: vi.fn(),
  performBulkLoraAction: vi.fn(),
  useBackendClient: vi.fn(() => ({ baseUrl: '/api' })),
};

const createBackendEnvironmentState = () => {
  let resolveReady: (() => void) | null = null;
  const handlers: ((next: string, previous: string | null) => void)[] = [];
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const onBackendUrlChange = (handler: (next: string, previous: string | null) => void) => {
    handlers.push(handler);
    return () => {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  };

  return {
    readyPromise,
    onBackendUrlChange,
    resolveReady: () => {
      resolveReady?.();
    },
    triggerBackendChange: (next = '/api/new', previous: string | null = '/api/old') => {
      handlers.forEach((handler) => handler(next, previous));
    },
    resetHandlers: () => {
      handlers.splice(0, handlers.length);
    },
  };
};

const recommendationApiMock = (() => {
  const data = ref<RecommendationResponse | RecommendationItem[] | null>(null);
  const error = ref<unknown>(null);
  const isLoading = ref(false);
  const lastPath = ref('');
  const fetchCalls: string[] = [];
  let fetchImplementation: (() => Promise<RecommendationResponse | RecommendationItem[] | null>) | null = null;

  const fetchDataMock = vi.fn(async () => {
    fetchCalls.push(lastPath.value);
    const payload = await (fetchImplementation?.() ?? Promise.resolve({ recommendations: [] }));
    data.value = payload;
    return payload;
  });

  const useMock = vi.fn((path) => {
    const resolved = computed(() => (typeof path === 'function' ? path() : unref(path)));
    watch(
      resolved,
      (value) => {
        lastPath.value = value;
      },
      { immediate: true },
    );

    return {
      data,
      error,
      isLoading,
      fetchData: fetchDataMock,
    };
  });

  const setFetchImplementation = (
    impl: () => Promise<RecommendationResponse | RecommendationItem[] | null>,
  ) => {
    fetchImplementation = impl;
  };

  const reset = () => {
    data.value = null;
    error.value = null;
    isLoading.value = false;
    lastPath.value = '';
    fetchCalls.splice(0, fetchCalls.length);
    fetchDataMock.mockClear();
    fetchImplementation = null;
  };

  return {
    useMock,
    fetchDataMock,
    fetchCalls,
    lastPath,
    setFetchImplementation,
    reset,
    error,
    data,
    isLoading,
  };
})();

describe('useRecommendations', () => {
  let useRecommendations: UseRecommendations;
  let useSettingsStore: UseSettingsStore;
  let backendEnvironmentState = createBackendEnvironmentState();

  const withRecommendations = async (
    run: (state: ReturnType<UseRecommendations>) => Promise<void>,
  ) => {
    let state: ReturnType<UseRecommendations> | undefined;

    const wrapper = mount({
      setup() {
        state = useRecommendations();
        return () => null;
      },
    });

    try {
      await run(state!);
    } finally {
      wrapper.unmount();
    }
  };

  beforeEach(async () => {
    vi.resetModules();

    backendEnvironmentState = createBackendEnvironmentState();
    backendEnvironmentState.resetHandlers();

    recommendationApiMock.reset();

    serviceMocks.fetchAdapterList.mockReset();
    serviceMocks.fetchAdapterList.mockImplementation(async () => ({
      items: [
        { id: 'alpha', name: 'Alpha', description: 'First', active: true },
        { id: 'beta', name: 'Beta', description: 'Second', active: true },
      ],
      total: 2,
      filtered: 2,
      page: 1,
      pages: 1,
      per_page: 200,
    }));
    serviceMocks.fetchAdapterTags.mockReset();
    serviceMocks.performBulkLoraAction.mockReset();
    serviceMocks.useBackendClient.mockReturnValue({ baseUrl: '/api' });

    vi.doMock('@/services', async () => {
      const actual = await vi.importActual<typeof import('@/services')>('@/services');
      return {
        ...actual,
        useBackendClient: serviceMocks.useBackendClient,
      };
    });

    vi.doMock('@/features/lora/services/lora/loraService', async () => {
      const actual = await vi.importActual<typeof import('@/features/lora/services/lora/loraService')>(
        '@/features/lora/services/lora/loraService',
      );
      return {
        ...actual,
        fetchAdapterList: serviceMocks.fetchAdapterList,
      };
    });

    vi.doMock('@/stores/settings', async () => {
      const actual = await vi.importActual<typeof import('@/stores/settings')>('@/stores/settings');
      return {
        ...actual,
        useBackendEnvironment: () => backendEnvironmentState,
      };
    });

    vi.doMock('@/composables/shared', async () => {
      const actual = await vi.importActual<typeof import('@/composables/shared')>('@/composables/shared');
      return {
        ...actual,
        useRecommendationApi: recommendationApiMock.useMock,
      };
    });

    const module = await import('@/features/recommendations/composables/useRecommendations');
    useRecommendations = module.useRecommendations;

    const settingsModule = await import('@/stores/settings');
    useSettingsStore = settingsModule.useSettingsStore;

    const pinia = createPinia();
    setActivePinia(pinia);

    const settingsStore = useSettingsStore();
    settingsStore.reset();
    settingsStore.setSettings({ backendUrl: '/api' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('builds the recommendation API path with selected parameters', async () => {
    await withRecommendations(async (state) => {
      backendEnvironmentState.resolveReady();
      await flush();

      state.selectedLoraId.value = 'alpha';
      await flush();

      expect(recommendationApiMock.fetchDataMock).toHaveBeenCalledTimes(1);
      expect(recommendationApiMock.lastPath.value).toContain('recommendations/similar/alpha');
      expect(recommendationApiMock.lastPath.value).toContain('limit=10');
      expect(recommendationApiMock.lastPath.value).toContain('similarity_threshold=0.1');
      expect(recommendationApiMock.lastPath.value).toContain('weight_semantic=0.6');
      expect(recommendationApiMock.lastPath.value).toContain('weight_artistic=0.3');
      expect(recommendationApiMock.lastPath.value).toContain('weight_technical=0.1');
    });
  });

  it('does not fetch recommendations until the backend environment is hydrated', async () => {
    await withRecommendations(async (state) => {
      state.selectedLoraId.value = 'alpha';
      await flush();

      expect(recommendationApiMock.fetchDataMock).not.toHaveBeenCalled();

      backendEnvironmentState.resolveReady();
      await flush();

      expect(recommendationApiMock.fetchDataMock).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes recommendations when query parameters change', async () => {
    const responses: RecommendationResponse[] = [
      {
        recommendations: [
          {
            lora_id: 'beta',
            lora_name: 'Beta',
            lora_description: 'Second',
            final_score: 0.9,
            similarity_score: 0.8,
          } as RecommendationItem,
        ],
        recommendation_config: {},
      },
      {
        recommendations: [
          {
            lora_id: 'gamma',
            lora_name: 'Gamma',
            lora_description: 'Third',
            final_score: 0.7,
            similarity_score: 0.6,
          } as RecommendationItem,
        ],
        recommendation_config: {},
      },
      {
        recommendations: [
          {
            lora_id: 'delta',
            lora_name: 'Delta',
            lora_description: 'Fourth',
            final_score: 0.5,
            similarity_score: 0.4,
          } as RecommendationItem,
        ],
        recommendation_config: {},
      },
    ];

    let callIndex = 0;
    recommendationApiMock.setFetchImplementation(async () => {
      const payload = responses[Math.min(callIndex, responses.length - 1)];
      callIndex += 1;
      return payload;
    });

    await withRecommendations(async (state) => {
      backendEnvironmentState.resolveReady();
      await flush();

      state.selectedLoraId.value = 'alpha';
      await flush();

      expect(state.recommendations.value[0]?.lora_id).toBe('beta');

      state.limit.value = 20;
      await flush();
      expect(state.recommendations.value[0]?.lora_id).toBe('gamma');
      expect(state.recommendationPath.value).toContain('limit=20');

      state.weights.value.semantic = 0.4;
      await flush();
      expect(state.recommendations.value[0]?.lora_id).toBe('delta');
      expect(state.recommendationPath.value).toContain('weight_semantic=0.4');

      expect(recommendationApiMock.fetchDataMock).toHaveBeenCalledTimes(3);
    });
  });
});
