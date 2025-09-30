import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import * as services from '@/services';
import * as stores from '@/stores';
import * as loraCatalogModule from '@/features/lora/public';
import { useRecommendations } from '@/features/recommendations/composables/useRecommendations';
import { useSettingsStore } from '@/stores';

const backendRefreshCallbacks: Array<() => void> = [];

const backendClientMock = {
  getJson: vi.fn(),
};

const useBackendClientSpy = vi.spyOn(services, 'useBackendClient');
const useBackendRefreshSpy = vi.spyOn(services, 'useBackendRefresh');
const useBackendEnvironmentSpy = vi.spyOn(stores, 'useBackendEnvironment');
const useAdapterCatalogStoreSpy = vi.spyOn(loraCatalogModule, 'useAdapterCatalogStore');

describe('useRecommendations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    backendRefreshCallbacks.splice(0, backendRefreshCallbacks.length);
    backendClientMock.getJson.mockReset();

    useBackendClientSpy.mockReset().mockReturnValue(backendClientMock as never);
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
    useBackendEnvironmentSpy.mockReset().mockReturnValue({
      readyPromise: Promise.resolve(),
      onBackendUrlChange: vi.fn(),
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
  });

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
      recommendations: [
        { id: 'r-1', name: 'Alpha Twin', similarity: 0.92 },
      ],
    });

    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await Promise.resolve();
    await Promise.resolve();
    const results = await state.fetchRecommendations();

    expect(backendClientMock.getJson).toHaveBeenCalledWith(
      expect.stringContaining('/recommendations/similar/alpha'),
    );
    expect(results).toHaveLength(1);
    expect(state.recommendations.value[0].id).toBe('r-1');

    destroy();
  });

  it('triggers a refresh when the backend notifies a change', async () => {
    backendClientMock.getJson.mockResolvedValue({ recommendations: [] });
    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await Promise.resolve();
    await Promise.resolve();
    await state.fetchRecommendations();
    expect(backendRefreshCallbacks).toHaveLength(1);

    backendClientMock.getJson.mockClear().mockResolvedValue({ recommendations: [] });
    backendRefreshCallbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(backendClientMock.getJson).toHaveBeenCalledTimes(1);

    destroy();
  });

  it('records errors returned by the API', async () => {
    backendClientMock.getJson.mockRejectedValueOnce(new Error('boom'));
    const { state, destroy } = mountComposable();

    state.selectedLoraId.value = 'alpha';
    await Promise.resolve();
    await Promise.resolve();
    await state.fetchRecommendations();

    expect(state.error.value).toBe('boom');

    destroy();
  });
});
