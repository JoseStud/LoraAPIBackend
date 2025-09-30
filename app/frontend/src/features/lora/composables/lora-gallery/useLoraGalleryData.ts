import { storeToRefs } from 'pinia';

import { useAdapterCatalogStore } from '@/features/lora';
import type { AdapterListQuery, LoraBulkAction, LoraUpdatePayload } from '@/types';

export function useLoraGalleryData() {
  const store = useAdapterCatalogStore();
  const { isInitialized, isLoading, loras, availableTags } = storeToRefs(store);

  const loadLoras = async (overrides: AdapterListQuery = {}) => {
    await store.loadLoras(overrides);
  };

  const fetchTags = async () => {
    await store.fetchTags();
  };

  const initialize = async (overrides: AdapterListQuery = {}) => {
    await store.initialize(overrides);
  };

  const performBulkAction = async (action: LoraBulkAction, loraIds: string[]) => {
    await store.performBulkAction(action, loraIds);
  };

  const applyLoraUpdate = (payload: LoraUpdatePayload) => {
    store.applyLoraUpdate(payload);
  };

  const removeLora = (id: string) => {
    store.removeLora(id);
  };

  return {
    isInitialized,
    isLoading,
    loras,
    availableTags,
    loadLoras,
    fetchTags,
    initialize,
    performBulkAction,
    applyLoraUpdate,
    removeLora,
  };
}
