import { computed, ref, watch, type Ref } from 'vue';
import { useBackendBase } from '@/utils/backend';
import {
  buildRecommendationsUrl,
  deleteLora as deleteLoraRequest,
  toggleLoraActiveState,
  triggerPreviewGeneration,
  updateLoraWeight,
} from '@/services';
import type { LoraListItem, LoraUpdatePayload } from '@/types';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

type WindowWithExtras = Window & {
  htmx?: {
    trigger: (target: Element | Document, event: string, detail?: unknown) => void;
  };
  DevLogger?: {
    error?: (...args: unknown[]) => void;
  };
};

type UseLoraCardActionsOptions = {
  lora: Ref<LoraListItem>;
  emitUpdate: (payload: LoraUpdatePayload) => void;
  emitDelete: (id: string) => void;
};

const windowExtras = window as WindowWithExtras;

const showNotification = (message: string, type: NotificationType = 'info') => {
  if (windowExtras.htmx) {
    windowExtras.htmx.trigger(document.body, 'show-notification', {
      detail: { message, type },
    });
  }
};

export const useLoraCardActions = ({ lora, emitUpdate, emitDelete }: UseLoraCardActionsOptions) => {
  const apiBaseUrl = useBackendBase();

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
      await toggleLoraActiveState(apiBaseUrl.value, lora.value.id, nextState);
      isActive.value = nextState;
      emitUpdate({ id: lora.value.id, active: nextState, type: 'active' });
    } catch (error) {
      windowExtras.DevLogger?.error?.('Failed to toggle LoRA active state:', error);
      showNotification('Failed to toggle active state.', 'error');
    }
  };

  const handleWeightChange = async (nextWeight: number) => {
    weight.value = nextWeight;

    try {
      const updated = await updateLoraWeight(apiBaseUrl.value, lora.value.id, nextWeight);
      const resolvedWeight = updated?.weight ?? nextWeight;
      weight.value = resolvedWeight;
      emitUpdate({ id: lora.value.id, weight: resolvedWeight, type: 'weight' });
    } catch (error) {
      windowExtras.DevLogger?.error?.('Failed to update LoRA weight:', error);
      showNotification('Failed to update weight.', 'error');
      weight.value = lora.value.weight ?? weight.value;
    }
  };

  const handleRecommendations = () => {
    try {
      const targetUrl = buildRecommendationsUrl(lora.value.id);
      window.location.href = targetUrl;
    } catch (error) {
      windowExtras.DevLogger?.error?.('Error navigating to recommendations:', error);
      showNotification('Unable to open recommendations.', 'error');
    }
  };

  const handleGeneratePreview = async () => {
    try {
      await triggerPreviewGeneration(apiBaseUrl.value, lora.value.id);
      showNotification('Preview generation started.', 'info');
    } catch (error) {
      windowExtras.DevLogger?.error?.('Preview generation not available:', error);
      showNotification('Preview generation not available yet.', 'info');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${lora.value.name}"?`)) {
      return;
    }

    try {
      await deleteLoraRequest(apiBaseUrl.value, lora.value.id);
      emitDelete(lora.value.id);
      showNotification('LoRA deleted.', 'success');
    } catch (error) {
      windowExtras.DevLogger?.error?.('Error deleting LoRA:', error);
      showNotification('Error deleting LoRA.', 'error');
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
