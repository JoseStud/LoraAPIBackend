import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useGenerationPersistence } from '@/composables/useGenerationPersistence';
import { useGenerationUpdates } from '@/composables/useGenerationUpdates';
import {
  cancelGenerationJob,
  deleteGenerationResult,
  startGeneration as startGenerationRequest,
  toGenerationRequestPayload,
} from '@/services/generationService';
import { useAppStore } from '@/stores/app';
import { useGenerationStore } from '@/stores/generation';
import { useSettingsStore } from '@/stores/settings';
import type { GenerationFormState, GenerationJob, GenerationResult, NotificationType } from '@/types';

export const useGenerationStudio = () => {
  const appStore = useAppStore();
  const generationStore = useGenerationStore();
  const settingsStore = useSettingsStore();
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
  const { systemStatus, activeJobs, recentResults, sortedActiveJobs, isConnected } = storeToRefs(generationStore);

  const params = ref<GenerationFormState>({
    prompt: '',
    negative_prompt: '',
    steps: 20,
    sampler_name: 'DPM++ 2M',
    cfg_scale: 7.0,
    width: 512,
    height: 512,
    seed: -1,
    batch_size: 1,
    batch_count: 1,
    denoising_strength: null,
  });

  const isGenerating = ref(false);
  const showHistory = ref(false);
  const showModal = ref(false);
  const selectedResult = ref<GenerationResult | null>(null);

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info('[GenerationStudio]', ...args);
    }
  };

  const showToast = (message: string, type: NotificationType = 'success'): void => {
    logDebug(`[${type.toUpperCase()}] ${message}`);
    appStore.addNotification(message, type);
  };

  const { loadSavedParams, saveParams, savePreset, loadFromComposer, useRandomPrompt } = useGenerationPersistence({
    params,
    showToast,
  });

  const { initialize: initializeUpdates, loadRecentResultsData } = useGenerationUpdates({
    showHistory,
    configuredBackendUrl,
    logDebug,
    showToast,
  });

  const startGeneration = async (): Promise<void> => {
    const trimmedPrompt = params.value.prompt.trim();
    if (!trimmedPrompt) {
      showToast('Please enter a prompt', 'error');
      return;
    }

    isGenerating.value = true;

    try {
      params.value.prompt = trimmedPrompt;
      const payload = toGenerationRequestPayload({ ...params.value, prompt: trimmedPrompt });
      const response = await startGenerationRequest(payload, configuredBackendUrl.value ?? undefined);

      if (response.job_id) {
        const createdAt = new Date().toISOString();
        generationStore.enqueueJob({
          id: response.job_id,
          prompt: payload.prompt,
          status: response.status,
          progress: response.progress ?? 0,
          startTime: createdAt,
          created_at: createdAt,
          width: payload.width,
          height: payload.height,
          steps: payload.steps,
          total_steps: payload.steps,
          cfg_scale: payload.cfg_scale,
          seed: payload.seed,
        });
        showToast('Generation started successfully', 'success');
        saveParams(params.value);
      }
    } catch (error) {
      console.error('Error starting generation:', error);
      showToast('Error starting generation', 'error');
    } finally {
      isGenerating.value = false;
    }
  };

  const cancelJob = async (jobId: string): Promise<void> => {
    try {
      await cancelGenerationJob(jobId, configuredBackendUrl.value ?? undefined);
      generationStore.removeJob(jobId);
      showToast('Generation cancelled', 'success');
    } catch (error) {
      console.error('Error cancelling job:', error);
      showToast('Error cancelling generation', 'error');
    }
  };

  const clearQueue = async (): Promise<void> => {
    if (activeJobs.value.length === 0) {
      return;
    }

    if (!window.confirm('Are you sure you want to clear the entire generation queue?')) {
      return;
    }

    const cancellableJobs = activeJobs.value.filter((job) => canCancelJob(job));
    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)));
  };

  const showImageModal = (result: GenerationResult | null): void => {
    if (!result) {
      return;
    }
    selectedResult.value = result;
    showModal.value = true;
  };

  const hideImageModal = (): void => {
    showModal.value = false;
    selectedResult.value = null;
  };

  const reuseParameters = (result: GenerationResult): void => {
    if (typeof result.prompt === 'string') {
      params.value.prompt = result.prompt;
    }
    params.value.negative_prompt = typeof result.negative_prompt === 'string' ? result.negative_prompt : '';
    if (typeof result.width === 'number') {
      params.value.width = result.width;
    }
    if (typeof result.height === 'number') {
      params.value.height = result.height;
    }
    if (typeof result.steps === 'number') {
      params.value.steps = result.steps;
    }
    if (typeof result.cfg_scale === 'number') {
      params.value.cfg_scale = result.cfg_scale;
    }
    if (typeof result.seed === 'number') {
      params.value.seed = result.seed;
    }

    showToast('Parameters loaded from result', 'success');
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this result?')) {
      return;
    }

    try {
      await deleteGenerationResult(resultId, configuredBackendUrl.value ?? undefined);
      generationStore.removeResult(resultId);
      showToast('Result deleted', 'success');
    } catch (error) {
      console.error('Error deleting result:', error);
      showToast('Error deleting result', 'error');
    }
  };

  const refreshResults = async (): Promise<void> => {
    await loadRecentResultsData();
    showToast('Results refreshed', 'success');
  };

  const formatTime = (dateString?: string): string => {
    if (!dateString) {
      return 'Unknown';
    }

    try {
      const date = new Date(dateString);
      const now = new Date();
      const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  const STATUS_CLASS_MAP: Record<GenerationJob['status'], string> = {
    processing: 'bg-blue-100 text-blue-800',
    queued: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  const STATUS_TEXT_MAP: Record<GenerationJob['status'], string> = {
    processing: 'Processing',
    queued: 'Queued',
    completed: 'Completed',
    failed: 'Failed',
  };

  const getJobStatusClasses = (status: GenerationJob['status']): string => STATUS_CLASS_MAP[status];

  const getJobStatusText = (status: GenerationJob['status']): string => STATUS_TEXT_MAP[status];

  const canCancelJob = (job: GenerationJob): boolean => job.status === 'queued' || job.status === 'processing';

  const getSystemStatusClasses = (status?: string): string => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...');
    await initializeUpdates();
    loadSavedParams();
  });

  return {
    params,
    systemStatus,
    isGenerating,
    showHistory,
    showModal,
    selectedResult,
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    startGeneration,
    cancelJob,
    clearQueue,
    refreshResults,
    loadFromComposer,
    useRandomPrompt,
    savePreset,
    showImageModal,
    hideImageModal,
    reuseParameters,
    deleteResult,
    formatTime,
    getJobStatusClasses,
    getJobStatusText,
    canCancelJob,
    getSystemStatusClasses,
  };
};

export type UseGenerationStudioReturn = ReturnType<typeof useGenerationStudio>;
