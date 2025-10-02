import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import * as backendRefreshModule from '@/services/system/backendRefresh';
import * as settingsStoreModule from '@/stores/settings';
import * as loraCatalogModule from '@/features/lora/public';
import { useRecommendations } from '@/features/recommendations/composables/useRecommendations';
import * as recommendationsService from '@/features/recommendations/services';
import { useSettingsStore } from '@/stores';

const backendRefreshCallbacks: Array<() => void> = [];

const useBackendRefreshSpy = vi.spyOn(backendRefreshModule, 'useBackendRefresh');
const useBackendEnvironmentSpy = vi.spyOn(settingsStoreModule, 'useBackendEnvironment');
let ensureBackendEnvironmentReadyMock: ReturnType<typeof vi.fn>;
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
    } as never);
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
    getRecommendationsSpy.mockResolvedValueOnce({
      target_lora_id: 'alpha',
      prompt: null,
      recommendations: [
        { id: 'r-1', name: 'Alpha Twin', similarity: 0.92 },
      ],
      total_candidates: 1,
      processing_time_ms: 12,
      recommendation_config: {},
    } as never);

    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await flush();
    const results = await state.fetchRecommendations();

    expect(getRecommendationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ loraId: 'alpha' }),
    );
    expect(results).toHaveLength(1);
    expect(state.recommendations.value[0].id).toBe('r-1');

    destroy();
  });

  it('triggers a refresh when the backend notifies a change', async () => {
    getRecommendationsSpy.mockResolvedValue({
      target_lora_id: null,
      prompt: null,
      recommendations: [],
      total_candidates: 0,
      processing_time_ms: 0,
      recommendation_config: {},
    } as never);
    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await flush();
    await state.fetchRecommendations();
    expect(backendRefreshCallbacks).toHaveLength(1);

    getRecommendationsSpy.mockClear().mockResolvedValue({
      target_lora_id: null,
      prompt: null,
      recommendations: [],
      total_candidates: 0,
      processing_time_ms: 0,
      recommendation_config: {},
    } as never);
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
