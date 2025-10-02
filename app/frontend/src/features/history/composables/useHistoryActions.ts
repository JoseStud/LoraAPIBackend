import type { Ref } from 'vue';
import type { Router } from 'vue-router';

import { PERSISTENCE_KEYS, usePersistence } from '@/composables/shared';
import { downloadFile } from '@/utils/browser';
import { useBackendClient } from '@/services/shared/http';
import {
  deleteResult as deleteHistoryResult,
  deleteResults as deleteHistoryResults,
  downloadResult as downloadHistoryResult,
  exportResults as exportHistoryResults,
  favoriteResult as favoriteHistoryResult,
  favoriteResults as favoriteHistoryResults,
  rateResult as rateHistoryResult,
} from '../services/historyService';
import type { GenerationHistoryResult, NotificationType } from '@/types';

export interface UseHistoryActionsOptions {
  apiBaseUrl: Ref<string>;
  data: Ref<GenerationHistoryResult[]>;
  applyFilters: () => void;
  router: Router;
  showToast: (message: string, type?: NotificationType) => void;
  selectedIds: Ref<GenerationHistoryResult['id'][]>;
  selectedCount: Ref<number>;
  clearSelection: () => void;
  withUpdatedSelection: (
    updater: (next: Set<GenerationHistoryResult['id']>) => void,
  ) => void;
  confirm?: (message: string) => boolean;
}

const defaultConfirm = (message: string): boolean => window.confirm(message);

export const useHistoryActions = ({
  apiBaseUrl,
  data,
  applyFilters,
  router,
  showToast,
  selectedIds,
  selectedCount,
  clearSelection,
  withUpdatedSelection,
  confirm: confirmOverride,
}: UseHistoryActionsOptions) => {
  const persistence = usePersistence();
  const confirmAction = confirmOverride ?? defaultConfirm;
  const backendClient = useBackendClient(apiBaseUrl);

  const setRating = async (
    result: GenerationHistoryResult,
    rating: number,
  ): Promise<boolean> => {
    try {
      await rateHistoryResult(result.id, rating, backendClient);
      result.rating = rating;
      applyFilters();
      showToast('Rating updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating rating:', err);
      showToast('Failed to update rating', 'error');
      return false;
    }
  };

  const toggleFavorite = async (
    result: GenerationHistoryResult,
  ): Promise<boolean> => {
    try {
      const updatedResult = await favoriteHistoryResult(result.id, !result.is_favorite, backendClient);

      if (updatedResult) {
        result.is_favorite = updatedResult.is_favorite;
      } else {
        result.is_favorite = !result.is_favorite;
      }

      applyFilters();
      showToast(result.is_favorite ? 'Added to favorites' : 'Removed from favorites');
      return true;
    } catch (err) {
      console.error('Error updating favorite status:', err);
      showToast('Failed to update favorites', 'error');
      return false;
    }
  };

  const reuseParameters = async (
    result: GenerationHistoryResult,
  ): Promise<boolean> => {
    try {
      const parameters = {
        prompt: result.prompt,
        negative_prompt: result.negative_prompt ?? '',
        steps: result.steps,
        cfg_scale: result.cfg_scale,
        width: result.width,
        height: result.height,
        seed: result.seed ?? null,
        sampler: result.sampler ?? result.sampler_name ?? null,
        model: result.model ?? result.model_name ?? null,
        clip_skip: result.clip_skip ?? null,
        loras: result.loras ?? [],
      } as const;

      persistence.setJSON(PERSISTENCE_KEYS.reuseParameters, parameters);

      showToast('Parameters copied to generation form');
      await router.push({ name: 'compose' });
      return true;
    } catch (err) {
      console.error('Error saving parameters:', err);
      showToast('Failed to save parameters', 'error');
      return false;
    }
  };

  const downloadImage = async (
    result: GenerationHistoryResult,
  ): Promise<boolean> => {
    try {
      const download = await downloadHistoryResult(result.id, undefined, backendClient);
      downloadFile(download.blob, download.filename);
      showToast('Download started');
      return true;
    } catch (err) {
      console.error('Error downloading image:', err);
      showToast('Failed to download image', 'error');
      return false;
    }
  };

  const deleteResult = async (
    resultId: GenerationHistoryResult['id'],
  ): Promise<boolean> => {
    if (!confirmAction('Are you sure you want to delete this image?')) {
      return false;
    }

    try {
      await deleteHistoryResult(resultId, backendClient);

      data.value = data.value.filter((item) => item.id !== resultId);
      withUpdatedSelection((next) => {
        next.delete(resultId);
      });
      applyFilters();

      showToast('Image deleted successfully');
      return true;
    } catch (err) {
      console.error('Error deleting result:', err);
      showToast('Failed to delete image', 'error');
      return false;
    }
  };

  const deleteSelected = async (): Promise<boolean> => {
    if (selectedCount.value === 0) {
      return false;
    }

    const ids = selectedIds.value;
    const count = ids.length;

    if (!confirmAction(`Are you sure you want to delete ${count} selected images?`)) {
      return false;
    }

    try {
      await deleteHistoryResults({ ids }, backendClient);

      const idsToRemove = new Set(ids);
      data.value = data.value.filter((item) => !idsToRemove.has(item.id));
      clearSelection();
      applyFilters();

      showToast(`${count} images deleted successfully`);
      return true;
    } catch (err) {
      console.error('Error deleting results:', err);
      showToast('Failed to delete images', 'error');
      return false;
    }
  };

  const favoriteSelected = async (): Promise<boolean> => {
    if (selectedCount.value === 0) {
      return false;
    }

    const ids = selectedIds.value;

    try {
      await favoriteHistoryResults({
        ids,
        is_favorite: true,
      }, backendClient);

      const selectedSnapshot = new Set(ids);
      data.value.forEach((result) => {
        if (selectedSnapshot.has(result.id)) {
          result.is_favorite = true;
        }
      });

      applyFilters();
      showToast(`${ids.length} images added to favorites`);
      return true;
    } catch (err) {
      console.error('Error updating favorites:', err);
      showToast('Failed to update favorites', 'error');
      return false;
    }
  };

  const exportSelected = async (): Promise<boolean> => {
    if (selectedCount.value === 0) {
      return false;
    }

    try {
      const download = await exportHistoryResults({
        ids: selectedIds.value,
      }, backendClient);

      downloadFile(download.blob, download.filename);
      showToast('Export started');
      return true;
    } catch (err) {
      console.error('Error exporting results:', err);
      showToast('Failed to export images', 'error');
      return false;
    }
  };

  return {
    setRating,
    toggleFavorite,
    reuseParameters,
    downloadImage,
    deleteResult,
    deleteSelected,
    favoriteSelected,
    exportSelected,
  } as const;
};
