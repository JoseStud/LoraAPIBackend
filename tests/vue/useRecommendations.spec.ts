import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';


import * as loraCatalogModule from '@/features/lora/public';
import { useRecommendations } from '@/features/recommendations/composables/useRecommendations';
import * as recommendationsService from '@/features/recommendations/services';
import { useSettingsStore } from '@/stores';
import * as backendEnvironmentModule from '@/services/backendEnvironment';
import * as backendClientModule from '@/services/shared/http/backendClient';
import * as backendRefreshModule from '@/services/system/backendRefresh';
import * as apiClientModule from '@/services/shared/http';

const backendRefreshCallbacks: Array<() => void> = [];

const backendClientMock = {
  getJson: vi.fn(),
};

const useBackendClientSpy = vi.spyOn(backendClientModule, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(backendRefreshModule, 'useBackendRefresh');
const useBackendEnvironmentSpy = vi.spyOn(backendEnvironmentModule, 'useBackendEnvironment');
const createHttpClientSpy = vi.spyOn(apiClientModule, 'createHttpClient');

const useAdapterCatalogStoreSpy = vi.spyOn(loraCatalogModule, 'useAdapterCatalogStore');
const getRecommendationsSpy = vi.spyOn(recommendationsService, 'getRecommendations');

describe('useRecommendations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
    getRecommendationsSpy.mockReset().mockResolvedValue({
      target_lora_id: null,
      prompt: null,
      recommendations: [],
      total_candidates: 0,
      processing_time_ms: 0,
      recommendation_config: {},
    } as never);
    useBackendRefreshSpy.mockReset().mockImplementation((callback: () => void) => {
      backendRefreshCallbacks.push(callback);
      return {
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(() => {
          callback();
        }),
        isActive: vi.fn(() => true),
        trigger: vi.fn(() => {
          callback();
        }),
      };
    });
    ensureBackendEnvironmentReadyMock = vi.fn(() => Promise.resolve());
    useBackendEnvironmentSpy.mockReset().mockReturnValue({
      ensureReady: ensureBackendEnvironmentReadyMock,
      backendUrl: computed(() => '/api/v1'),
      backendApiKey: computed(() => null),
      hasExplicitBackendApiKey: computed(() => false),
    } as never);
    createHttpClientSpy.mockReset().mockReturnValue(backendClientMock as never);
    const adapterSummaries = [
      { id: 'alpha', name: 'Alpha', description: 'First', active: true },
      { id: 'beta', name: 'Beta', description: 'Second', active: true },
    ];

    useAdapterCatalogStoreSpy.mockReset().mockReturnValue({
      get adapters() {
        return adapterSummaries;
      },
      get error() {
        return null;
      },
      get isLoading() {
        return false;
      },
      ensureLoaded: vi.fn().mockResolvedValue(adapterSummaries),
    } as never);

    const settingsStore = useSettingsStore();
    settingsStore.reset();
    settingsStore.setSettings({ backendUrl: '/api/v1' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
    ensureBackendEnvironmentReadyMock.mockClear();
  });

  const flush = async () => {
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
  };

  const mountComposable = () => {
    let state: ReturnType<typeof useRecommendations> | undefined;
    const wrapper = mount({
      setup() {
        state = useRecommendations();
        return () => null;
      },
    });

    return { state: state!, destroy: () => wrapper.unmount() };
  };

  it('fetches recommendations for the selected LoRA', async () => {

    backendClientMock.getJson.mockResolvedValue({
      data: {
        target_lora_id: 'base',
        prompt: null,
        recommendations: [
          {
            id: 'r-1',
            lora_id: 'r-1',
            lora_name: 'Alpha Twin',
            lora_description: 'Twin adapter',
            similarity_score: 0.92,
            final_score: 0.93,
            explanation: 'Similar style',
          },
        ],
        total_candidates: 1,
        processing_time_ms: 10,
        recommendation_config: {},
      },
    });


    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await flush();
    const results = await state.fetchRecommendations();


    expect(backendClientMock.getJson).toHaveBeenCalledWith(
      expect.stringContaining('/recommendations/similar/alpha'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),

    );
    expect(results).toHaveLength(1);
    expect(state.recommendations.value[0].id).toBe('r-1');

    destroy();
  });

  it('triggers a refresh when the backend notifies a change', async () => {

    backendClientMock.getJson.mockResolvedValue({
      data: {
        target_lora_id: 'base',
        prompt: null,
        recommendations: [],
        total_candidates: 0,
        processing_time_ms: 5,
        recommendation_config: {},
      },
    });

    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await flush();
    await state.fetchRecommendations();
    expect(backendRefreshCallbacks).toHaveLength(1);

    backendClientMock.getJson.mockClear().mockResolvedValue({
      data: {
        target_lora_id: 'base',
        prompt: null,
        recommendations: [],
        total_candidates: 0,
        processing_time_ms: 5,
        recommendation_config: {},
      },
    });

    backendRefreshCallbacks[0]?.();
    await flush();

    expect(getRecommendationsSpy).toHaveBeenCalledTimes(1);

    destroy();
  });

  it('records errors returned by the API', async () => {
    getRecommendationsSpy.mockRejectedValueOnce(new Error('boom'));
    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await flush();
    await state.fetchRecommendations();

    expect(state.error.value).toBe('boom');

    destroy();
  });

  it('waits for backend environment readiness before hydrating recommendations', async () => {
    let resolveReady!: () => void;
    ensureBackendEnvironmentReadyMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
    );
    getRecommendationsSpy.mockResolvedValue({
      target_lora_id: null,
      prompt: null,
      recommendations: [],
      total_candidates: 0,
      processing_time_ms: 0,
      recommendation_config: {},
    } as never);

    const { state, destroy } = mountComposable();

    expect(ensureBackendEnvironmentReadyMock).toHaveBeenCalledTimes(1);

    state.selectedLoraId.value = 'alpha';
    await flush();

    await state.fetchRecommendations();

    expect(getRecommendationsSpy).not.toHaveBeenCalled();

    resolveReady();
    await flush();

    expect(getRecommendationsSpy).toHaveBeenCalled();

    destroy();
  });
});
