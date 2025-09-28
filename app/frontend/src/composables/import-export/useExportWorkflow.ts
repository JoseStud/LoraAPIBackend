import { computed, reactive, ref, watch, type ComputedRef } from 'vue';

import { ensureData, getFilenameFromContentDisposition, postJson, requestBlob } from '@/services/apiClient';
import { downloadFile } from '@/utils/browser';
import { formatFileSize as formatBytes } from '@/utils/format';
import type { ExportConfig, ExportEstimate } from '@/types';

export type NotifyType = 'success' | 'error' | 'warning' | 'info';
export type NotifyFn = (message: string, type?: NotifyType) => void;

export interface ProgressUpdate {
  value?: number;
  step?: string;
  message?: string;
}

export interface ProgressCallbacks {
  begin: () => void;
  update: (update: ProgressUpdate) => void;
  end: () => void;
}

interface UseExportWorkflowOptions {
  notify: NotifyFn;
  progress: ProgressCallbacks;
}

export interface UseExportWorkflow {
  exportConfig: ExportConfig;
  canExport: ComputedRef<boolean>;
  estimatedSize: ComputedRef<string>;
  estimatedTime: ComputedRef<string>;
  isExporting: ComputedRef<boolean>;
  initialize: () => Promise<void>;
  updateConfig: <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => void;
  validateExport: () => void;
  previewExport: () => void;
  startExport: () => Promise<void>;
  quickExportAll: () => Promise<void>;
  cancelExport: () => void;
}

export function useExportWorkflow(options: UseExportWorkflowOptions): UseExportWorkflow {
  const { notify, progress } = options;

  const exportConfig = reactive<ExportConfig>({
    loras: true,
    lora_files: true,
    lora_metadata: true,
    lora_embeddings: false,
    generations: false,
    generation_range: 'all',
    date_from: '',
    date_to: '',
    user_data: false,
    system_config: false,
    analytics: false,
    format: 'zip',
    compression: 'balanced',
    split_archives: false,
    max_size_mb: 1024,
    encrypt: false,
    password: ''
  });

  const estimatedSize = ref('0 MB');
  const estimatedTime = ref('0 minutes');
  const isExporting = ref(false);

  const canExport = computed(() =>
    exportConfig.loras ||
    exportConfig.generations ||
    exportConfig.user_data ||
    exportConfig.system_config ||
    exportConfig.analytics
  );

  const updateConfig = <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
    exportConfig[key] = value;
  };

  const updateEstimatesLocal = () => {
    let sizeBytes = 0;
    let timeMinutes = 0;

    if (exportConfig.loras) {
      sizeBytes += 10 * 1024 * 1024;
      timeMinutes += 2;

      if (exportConfig.lora_files) {
        sizeBytes += 500 * 1024 * 1024;
        timeMinutes += 10;
      }

      if (exportConfig.lora_embeddings) {
        sizeBytes += 100 * 1024 * 1024;
        timeMinutes += 3;
      }
    }

    if (exportConfig.generations) {
      if (exportConfig.generation_range === 'all') {
        sizeBytes += 200 * 1024 * 1024;
        timeMinutes += 5;
      } else {
        sizeBytes += 50 * 1024 * 1024;
        timeMinutes += 2;
      }
    }

    if (exportConfig.user_data) {
      sizeBytes += 5 * 1024 * 1024;
      timeMinutes += 1;
    }

    if (exportConfig.system_config) {
      sizeBytes += 1 * 1024 * 1024;
      timeMinutes += 1;
    }

    if (exportConfig.analytics) {
      sizeBytes += 20 * 1024 * 1024;
      timeMinutes += 2;
    }

    const compressionRatio: Record<ExportConfig['compression'], number> = {
      none: 1,
      fast: 0.7,
      balanced: 0.5,
      maximum: 0.3
    };

    sizeBytes *= compressionRatio[exportConfig.compression];

    estimatedSize.value = formatBytes(typeof sizeBytes === 'number' ? sizeBytes : 0);
    estimatedTime.value = `${Math.max(1, Math.ceil(timeMinutes))} minutes`;
  };

  const updateEstimates = async () => {
    try {
      const estimates = ensureData(
        await postJson<ExportEstimate, ExportConfig>('/api/v1/export/estimate', { ...exportConfig })
      );

      if (estimates && typeof estimates === 'object') {
        const { size, time } = estimates;
        if (typeof size === 'string') {
          estimatedSize.value = size;
        }
        if (typeof time === 'string') {
          estimatedTime.value = time;
        }
        return;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to fetch export estimates:', error);
      }
    }

    updateEstimatesLocal();
  };

  const validateExport = () => {
    const issues: string[] = [];

    if (!canExport.value) {
      issues.push('No data types selected for export');
    }

    if (exportConfig.generations && exportConfig.generation_range === 'date_range' && (!exportConfig.date_from || !exportConfig.date_to)) {
      issues.push('Date range required for generation export');
    }

    if (exportConfig.split_archives && exportConfig.max_size_mb < 10) {
      issues.push('Maximum archive size too small for split archives');
    }

    if (exportConfig.encrypt && !exportConfig.password) {
      issues.push('Password required for encrypted export');
    }

    if (issues.length > 0) {
      notify(`Validation failed: ${issues.join(', ')}`, 'error');
    } else {
      notify('Export configuration is valid', 'success');
    }
  };

  const previewExport = () => {
    notify('Preview functionality coming soon', 'info');
  };

  const startExport = async () => {
    if (isExporting.value) return;

    try {
      isExporting.value = true;
      progress.begin();
      progress.update({ value: 10, step: 'Preparing export...', message: 'Validating configuration' });
      progress.update({ value: 50, step: 'Generating export...', message: 'Creating archive' });

      const { blob, response } = await requestBlob('/api/v1/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...exportConfig })
      });

      progress.update({ value: 90, step: 'Finalizing export...', message: 'Preparing download' });

      const contentDisposition = response.headers.get('Content-Disposition');
      const fallbackName = `lora_export_${new Date().toISOString().slice(0, 10)}.${exportConfig.format}`;
      const filename = getFilenameFromContentDisposition(contentDisposition) ?? fallbackName;

      downloadFile(blob, filename);

      progress.update({ value: 100, step: 'Export completed', message: 'Download started' });
      notify('Export completed successfully', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notify(`Export failed: ${message}`, 'error');
    } finally {
      isExporting.value = false;
      progress.end();
    }
  };

  const quickExportAll = async () => {
    updateConfig('loras', true);
    updateConfig('lora_files', true);
    updateConfig('generations', true);
    updateConfig('user_data', true);
    updateConfig('system_config', true);
    await startExport();
  };

  const initialize = async () => {
    await updateEstimates();
  };

  const cancelExport = () => {
    isExporting.value = false;
  };

  watch(exportConfig, () => {
    void updateEstimates();
  }, { deep: true });

  return {
    exportConfig,
    canExport: computed(() => canExport.value),
    estimatedSize: computed(() => estimatedSize.value),
    estimatedTime: computed(() => estimatedTime.value),
    isExporting: computed(() => isExporting.value),
    initialize,
    updateConfig,
    validateExport,
    previewExport,
    startExport,
    quickExportAll,
    cancelExport
  };
}
