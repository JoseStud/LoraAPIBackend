import { ref } from 'vue';
import type { Ref } from 'vue';

import { fetchAdapterTags, fetchAdapters } from '@/services/lora/loraService';
import type { GalleryLora } from '@/types';

export function useLoraGalleryData(apiBaseUrl: Ref<string>) {
  const isInitialized = ref(false);
  const isLoading = ref(false);
  const loras = ref<GalleryLora[]>([]);
  const availableTags = ref<string[]>([]);

  const loadLoras = async () => {
    isLoading.value = true;
    try {
      loras.value = await fetchAdapters(apiBaseUrl.value, { perPage: 100 });
    } catch (error) {
      console.error('Error loading LoRA data:', error);
      loras.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const fetchTags = async () => {
    try {
      availableTags.value = await fetchAdapterTags(apiBaseUrl.value);
    } catch (error) {
      console.error('Error fetching tags:', error);
      availableTags.value = [];
    }
  };

  const initialize = async () => {
    await Promise.all([loadLoras(), fetchTags()]);
    isInitialized.value = true;
  };

  return {
    isInitialized,
    isLoading,
    loras,
    availableTags,
    loadLoras,
    fetchTags,
    initialize,
  };
}
