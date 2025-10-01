import { computed, ref, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';

import { useNotifications } from '@/composables/shared';
import { useBackendClient } from '@/services/backendClient';
import {
  buildRecommendationsUrl,
  deleteLora as deleteLoraRequest,
  toggleLoraActiveState,
  triggerPreviewGeneration,
  updateLoraWeight,
} from '../../services/lora/loraService';
import type { LoraListItem, LoraUpdatePayload } from '@/types';

type UseLoraCardActionsOptions = {
  lora: Ref<LoraListItem>;
  emitUpdate: (payload: LoraUpdatePayload) => void;
  emitDelete: (id: string) => void;
};

export const useLoraCardActions = ({ lora, emitUpdate, emitDelete }: UseLoraCardActionsOptions) => {
  const backendClient = useBackendClient();
  const { showSuccess, showError, showInfo } = useNotifications();
  const router = useRouter();

  const weight = ref<number>(lora.value.weight ?? 1.0);
  const isActive = ref<boolean>(Boolean(lora.value.active));

  watch(
    () => lora.value.weight,
    (nextWeight) => {
      if (typeof nextWeight === 'number') {
        weight.value = nextWeight;
      }
    },
  );

  watch(
    () => lora.value.active,
    (nextActive) => {
      isActive.value = Boolean(nextActive);
    },
  );

  const detailsUrl = computed(() => `/loras/${lora.value.id}`);
  const qualityScore = computed(() => (typeof lora.value.quality_score === 'number' ? lora.value.quality_score : null));

  const handleToggleActive = async () => {
    try {
      const nextState = !isActive.value;
      await toggleLoraActiveState(lora.value.id, nextState, backendClient);
      isActive.value = nextState;
      emitUpdate({ id: lora.value.id, active: nextState, type: 'active' });
    } catch (error) {
      console.error('Failed to toggle LoRA active state:', error);
      showError('Failed to toggle active state.', 8000);
    }
  };

  const handleWeightChange = async (nextWeight: number) => {
    weight.value = nextWeight;

    try {
      const updated = await updateLoraWeight(lora.value.id, nextWeight, backendClient);
      const resolvedWeight = updated?.weight ?? nextWeight;
      weight.value = resolvedWeight;
      emitUpdate({ id: lora.value.id, weight: resolvedWeight, type: 'weight' });
    } catch (error) {
      console.error('Failed to update LoRA weight:', error);
      showError('Failed to update weight.', 8000);
      weight.value = lora.value.weight ?? weight.value;
    }
  };

  const handleRecommendations = () => {
    try {
      const targetUrl = buildRecommendationsUrl(lora.value.id);
      const { query, hash } = router.resolve(targetUrl);
      const nextLocation = {
        path: '/recommendations',
        query: { ...query },
        ...(hash ? { hash } : {}),
      };
      router.push(nextLocation);
    } catch (error) {
      console.error('Error navigating to recommendations:', error);
      showError('Unable to open recommendations.', 8000);
    }
  };

  const handleGeneratePreview = async () => {
    try {
      await triggerPreviewGeneration(lora.value.id, backendClient);
      showInfo('Preview generation started.', 5000);
    } catch (error) {
      console.error('Preview generation not available:', error);
      showInfo('Preview generation not available yet.', 6000);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${lora.value.name}"?`)) {
      return;
    }

    try {
      await deleteLoraRequest(lora.value.id, backendClient);
      emitDelete(lora.value.id);
      showSuccess('LoRA deleted.', 5000);
    } catch (error) {
      console.error('Error deleting LoRA:', error);
      showError('Error deleting LoRA.', 8000);
    }
  };

  return {
    isActive,
    weight,
    detailsUrl,
    qualityScore,
    handleToggleActive,
    handleWeightChange,
    handleRecommendations,
    handleGeneratePreview,
    handleDelete,
  };
};
