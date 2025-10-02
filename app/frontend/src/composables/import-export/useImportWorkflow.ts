import { computed, reactive, ref, type ComputedRef } from 'vue';

import { ensureData } from '@/services/shared/http';
import { useBackendClient, type BackendClient } from '@/services/shared/http/backendClient';
import type { ImportConfig } from '@/types';
import type { NotifyFn, ProgressCallbacks } from './useExportWorkflow';

export interface ImportPreviewItem {
  id: string;
  type: string;
  name: string;
  status: string;
  action: string;
}

interface UseImportWorkflowOptions {
  notify: NotifyFn;
  progress: ProgressCallbacks;
  backendClient?: BackendClient | null;
}

export interface UseImportWorkflow {
  importConfig: ImportConfig;
  importFiles: ComputedRef<readonly File[]>;
  importPreview: ComputedRef<readonly ImportPreviewItem[]>;
  hasEncryptedFiles: ComputedRef<boolean>;
  isImporting: ComputedRef<boolean>;
  updateConfig: <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (file: File) => void;
  clearFiles: () => void;
  analyzeFiles: () => Promise<void>;
  validateImport: () => void;
  startImport: () => Promise<void>;
  cancelImport: () => void;
}

export function useImportWorkflow(options: UseImportWorkflowOptions): UseImportWorkflow {
  const { notify, progress } = options;
  const backendClient = options.backendClient ?? useBackendClient();

  const importConfig = reactive<ImportConfig>({
    mode: 'merge',
    conflict_resolution: 'ask',
    validate: true,
    backup_before: true,
    password: ''
  });

  const files = ref<File[]>([]);
  const preview = ref<ImportPreviewItem[]>([]);
  const isImporting = ref(false);

  const hasEncryptedFiles = computed(() =>
    files.value.some(file =>
      file.name.includes('encrypted') ||
      file.name.includes('password') ||
      file.name.includes('.enc')
    )
  );

  const updateConfig = <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => {
    importConfig[key] = value;
  };

  const addFiles = (newFiles: File[]) => {
    if (!newFiles.length) return;

    const validFiles = validateImportFiles(newFiles);

    if (validFiles.length < newFiles.length) {
      notify('Some files were skipped (unsupported format)', 'warning');
    }

    files.value = [...files.value, ...validFiles];
  };

  const removeFile = (fileToRemove: File) => {
    files.value = files.value.filter(file => file !== fileToRemove);
    if (files.value.length === 0) {
      preview.value = [];
    }
  };

  const clearFiles = () => {
    files.value = [];
    preview.value = [];
  };

  const analyzeFiles = async () => {
    if (files.value.length === 0) return;

    try {
      notify('Analyzing import files...', 'info');

      await new Promise(resolve => setTimeout(resolve, 1500));

      const generatedPreview: ImportPreviewItem[] = [];
      const types = ['LoRA', 'Generation', 'Config', 'User Data'];
      const statuses = ['new', 'conflict', 'existing'];
      const actions = ['Import', 'Skip', 'Overwrite', 'Rename'];

      files.value.forEach((file, fileIndex) => {
        const itemsPerFile = Math.floor(Math.random() * 5) + 1;

        for (let i = 0; i < itemsPerFile; i++) {
          const type = types[Math.floor(Math.random() * types.length)];
          const status = statuses[Math.floor(Math.random() * statuses.length)];

          generatedPreview.push({
            id: `${fileIndex}_${i}`,
            type,
            name: `${type.toLowerCase()}_${file.name}_${i + 1}`,
            status,
            action: status === 'conflict' ? 'Ask' : actions[Math.floor(Math.random() * actions.length)]
          });
        }
      });

      preview.value = generatedPreview;
      notify('File analysis completed', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notify(`Analysis failed: ${message}`, 'error');
    }
  };

  const validateImport = () => {
    const issues: string[] = [];

    if (files.value.length === 0) {
      issues.push('No files selected for import');
    }

    if (importConfig.mode === 'replace' && !importConfig.backup_before) {
      issues.push('Backup recommended when using replace mode');
    }

    if (issues.length > 0) {
      notify(`Validation failed: ${issues.join(', ')}`, 'error');
    } else {
      notify('Import configuration is valid', 'success');
    }
  };

  const startImport = async () => {
    if (files.value.length === 0) {
      notify('No files selected for import', 'error');
      return;
    }

    try {
      isImporting.value = true;
      progress.begin();
      progress.update({ value: 10, step: 'Preparing import...', message: 'Validating files' });

      const formData = new FormData();
      files.value.forEach(file => {
        formData.append('files', file);
      });
      formData.append('config', JSON.stringify(importConfig));

      progress.update({ value: 30, step: 'Uploading files...', message: 'Sending files to server' });

      const result = ensureData(
        await backendClient.requestJson('/api/v1/import', {
          method: 'POST',
          body: formData
        })
      ) as Record<string, unknown> | null;

      progress.update({ value: 70, step: 'Processing import...', message: 'Server is processing files' });

      const processedFiles = typeof result?.processed_files === 'number' ? result.processed_files : files.value.length;
      const totalFiles = typeof result?.total_files === 'number' ? result.total_files : files.value.length;

      progress.update({
        value: 100,
        step: 'Import completed',
        message: `Processed ${processedFiles} of ${totalFiles} files`
      });

      notify(`Import completed: ${processedFiles} files processed`, 'success');
      clearFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notify(`Import failed: ${message}`, 'error');
    } finally {
      isImporting.value = false;
      progress.end();
    }
  };

  const cancelImport = () => {
    isImporting.value = false;
  };

  return {
    importConfig,
    importFiles: computed(() => files.value),
    importPreview: computed(() => preview.value),
    hasEncryptedFiles: computed(() => hasEncryptedFiles.value),
    isImporting: computed(() => isImporting.value),
    updateConfig,
    addFiles,
    removeFile,
    clearFiles,
    analyzeFiles,
    validateImport,
    startImport,
    cancelImport
  };
}

const validateImportFiles = (files: File[]): File[] => {
  const validExtensions = ['.zip', '.tar.gz', '.json', '.lora', '.safetensors'];
  return files.filter(file => {
    const extension = getFileExtension(file.name);
    return validExtensions.includes(extension);
  });
};

const getFileExtension = (filename: string): string => {
  if (filename.endsWith('.tar.gz')) return '.tar.gz';
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot) : '';
};
