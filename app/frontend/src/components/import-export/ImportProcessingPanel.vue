<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Select Import Source</h3>
        </div>
        <div class="card-body">
          <div
            class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
            @drop.prevent="onDrop"
            @dragover.prevent="onDragOver"
            @dragleave="onDragLeave"
          >
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
            <div class="mt-4">
              <label class="cursor-pointer">
                <span class="mt-2 block text-sm font-medium text-gray-900">
                  Drop files here or click to upload
                </span>
                <input
                  type="file"
                  class="hidden"
                  multiple
                  accept=".zip,.tar.gz,.json,.lora,.safetensors"
                  @change="onFileSelect"
                >
              </label>
              <p class="mt-2 text-xs text-gray-500">
                Supports ZIP, TAR.GZ, JSON, LoRA, SafeTensors files
              </p>
            </div>
          </div>

          <div v-show="files.length > 0" class="mt-4 transition-all duration-200">
            <h4 class="text-sm font-medium mb-2">Selected Files</h4>
            <div class="space-y-2">
              <div
                v-for="file in files"
                :key="file.name"
                class="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                <div class="flex items-center space-x-2">
                  <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    ></path>
                  </svg>
                  <span class="text-sm">{{ file.name }}</span>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-xs text-gray-500">{{ formatFileSize(file.size ?? 0) }}</span>
                  <button class="text-red-500 hover:text-red-700" @click="$emit('remove-file', file)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Import Settings</h3>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Import Mode</label>
            <select class="form-input" :value="config.mode" @change="onSelectChange('mode', $event)">
              <option value="merge">Merge with existing data</option>
              <option value="replace">Replace existing data</option>
              <option value="skip">Skip conflicting items</option>
            </select>
          </div>

          <div>
            <label class="form-label">Conflict Resolution</label>
            <select
              class="form-input"
              :value="config.conflict_resolution"
              @change="onSelectChange('conflict_resolution', $event)"
            >
              <option value="ask">Ask for each conflict</option>
              <option value="keep_existing">Keep existing</option>
              <option value="overwrite">Overwrite with imported</option>
              <option value="rename">Rename imported items</option>
            </select>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-2"
                :checked="config.validate"
                @change="onCheckboxChange('validate', $event)"
              >
              <span>Validate data before import</span>
            </label>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-2"
                :checked="config.backup_before"
                @change="onCheckboxChange('backup_before', $event)"
              >
              <span>Create backup before import</span>
            </label>
          </div>

          <div v-show="hasEncryptedFiles" class="transition-all duration-200">
            <label class="form-label">Archive Password</label>
            <input
              type="password"
              class="form-input"
              placeholder="Enter password for encrypted archives"
              :value="config.password"
              @input="onInputChange('password', $event)"
            >
          </div>
        </div>
      </div>
    </div>

    <div v-show="preview.length > 0" class="card transition-all duration-200">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Import Preview</h3>
        <p class="text-sm text-gray-600">Review what will be imported</p>
      </div>
      <div class="card-body">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="item in preview" :key="item.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ item.type }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ item.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                    :class="getStatusClasses(item.status)"
                  >
                    {{ item.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ item.action }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center pt-6 border-t">
      <div class="flex items-center space-x-4">
        <button class="btn btn-secondary" :disabled="files.length === 0" @click="$emit('analyze')">
          Analyze Files
        </button>
        <button class="btn btn-secondary" :disabled="files.length === 0" @click="$emit('validate')">
          Validate Import
        </button>
      </div>
      <button
        class="btn btn-primary"
        :disabled="files.length === 0 || isImporting"
        @click="$emit('start')"
      >
        <template v-if="!isImporting">
          <span>Start Import</span>
        </template>
        <template v-else>
          <div class="flex items-center">
            <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
            </svg>
            Importing...
          </div>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ImportConfig, ImportPreviewItem } from '@/composables/useImportWorkflow';

type ImportConfigKey = keyof ImportConfig;

const props = defineProps<{
  config: ImportConfig;
  files: readonly File[];
  preview: readonly ImportPreviewItem[];
  hasEncryptedFiles: boolean;
  isImporting: boolean;
  formatFileSize: (bytes: number) => string;
  getStatusClasses: (status: string) => string;
}>();

const emit = defineEmits<{
  (e: 'update-config', payload: { key: ImportConfigKey; value: ImportConfig[ImportConfigKey] }): void;
  (e: 'add-files', payload: readonly File[]): void;
  (e: 'remove-file', payload: File): void;
  (e: 'analyze'): void;
  (e: 'validate'): void;
  (e: 'start'): void;
}>();

const updateConfig = (key: ImportConfigKey, value: ImportConfig[ImportConfigKey]) => {
  emit('update-config', { key, value });
};

const onCheckboxChange = (key: ImportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateConfig(key, target.checked as ImportConfig[ImportConfigKey]);
  }
};

const onSelectChange = (key: ImportConfigKey, event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (target) {
    updateConfig(key, target.value as ImportConfig[ImportConfigKey]);
  }
};

const onInputChange = (key: ImportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateConfig(key, target.value as ImportConfig[ImportConfigKey]);
  }
};

const onFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target && target.files) {
    emit('add-files', Array.from(target.files));
    target.value = '';
  }
};

const onDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (files.length > 0) {
    emit('add-files', files);
  }
  onDragLeave(event);
};

const onDragOver = (event: DragEvent) => {
  const element = event.currentTarget as HTMLElement | null;
  element?.classList.add('border-blue-500', 'bg-blue-50');
};

const onDragLeave = (event: Event) => {
  const element = event.currentTarget as HTMLElement | null;
  element?.classList.remove('border-blue-500', 'bg-blue-50');
};
</script>
