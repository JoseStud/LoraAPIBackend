<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Select Data to Export</h3>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-3"
                :checked="config.loras"
                @change="onCheckboxChange('loras', $event)"
              >
              <div>
                <div class="font-medium">LoRA Models</div>
                <div class="text-sm text-gray-600">All LoRA files, metadata, and configurations</div>
              </div>
            </label>

            <div
              v-show="config.loras"
              class="ml-6 mt-3 space-y-2 transition-all duration-200"
            >
              <label class="flex items-center">
                <input
                  type="checkbox"
                  class="form-checkbox mr-2"
                  :checked="config.lora_files"
                  @change="onCheckboxChange('lora_files', $event)"
                >
                <span class="text-sm">Include model files</span>
              </label>
              <label class="flex items-center">
                <input
                  type="checkbox"
                  class="form-checkbox mr-2"
                  :checked="config.lora_metadata"
                  @change="onCheckboxChange('lora_metadata', $event)"
                >
                <span class="text-sm">Include metadata only</span>
              </label>
              <label class="flex items-center">
                <input
                  type="checkbox"
                  class="form-checkbox mr-2"
                  :checked="config.lora_embeddings"
                  @change="onCheckboxChange('lora_embeddings', $event)"
                >
                <span class="text-sm">Include embeddings</span>
              </label>
            </div>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-3"
                :checked="config.generations"
                @change="onCheckboxChange('generations', $event)"
              >
              <div>
                <div class="font-medium">Generation Results</div>
                <div class="text-sm text-gray-600">Generated images and their parameters</div>
              </div>
            </label>

            <div
              v-show="config.generations"
              class="ml-6 mt-3 space-y-2 transition-all duration-200"
            >
              <div class="flex items-center space-x-4">
                <label class="flex items-center">
                  <input
                    type="radio"
                    class="form-radio mr-2"
                    name="generation_range"
                    value="all"
                    :checked="config.generation_range === 'all'"
                    @change="onRadioChange('generation_range', $event)"
                  >
                  <span class="text-sm">All generations</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="radio"
                    class="form-radio mr-2"
                    name="generation_range"
                    value="date_range"
                    :checked="config.generation_range === 'date_range'"
                    @change="onRadioChange('generation_range', $event)"
                  >
                  <span class="text-sm">Date range</span>
                </label>
              </div>

              <div
                v-show="config.generation_range === 'date_range'"
                class="grid grid-cols-2 gap-3 transition-all duration-200"
              >
                <div>
                  <label class="form-label text-xs">From Date</label>
                  <input
                    type="date"
                    class="form-input text-sm"
                    :value="config.date_from"
                    @input="onInputChange('date_from', $event)"
                  >
                </div>
                <div>
                  <label class="form-label text-xs">To Date</label>
                  <input
                    type="date"
                    class="form-input text-sm"
                    :value="config.date_to"
                    @input="onInputChange('date_to', $event)"
                  >
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-3"
                :checked="config.user_data"
                @change="onCheckboxChange('user_data', $event)"
              >
              <div>
                <div class="font-medium">User Data</div>
                <div class="text-sm text-gray-600">User preferences and settings</div>
              </div>
            </label>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-3"
                :checked="config.system_config"
                @change="onCheckboxChange('system_config', $event)"
              >
              <div>
                <div class="font-medium">System Configuration</div>
                <div class="text-sm text-gray-600">System settings and configurations</div>
              </div>
            </label>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-3"
                :checked="config.analytics"
                @change="onCheckboxChange('analytics', $event)"
              >
              <div>
                <div class="font-medium">Analytics</div>
                <div class="text-sm text-gray-600">Usage metrics and performance data</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Export Settings</h3>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Export Format</label>
            <select
              class="form-input"
              :value="config.format"
              @change="onSelectChange('format', $event)"
            >
              <option value="zip">ZIP Archive</option>
              <option value="tar.gz">TAR.GZ Archive</option>
              <option value="json">JSON Files</option>
            </select>
          </div>

          <div>
            <label class="form-label">Compression Level</label>
            <select
              class="form-input"
              :value="config.compression"
              @change="onSelectChange('compression', $event)"
            >
              <option value="none">No Compression</option>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="maximum">Maximum</option>
            </select>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-2"
                :checked="config.split_archives"
                @change="onCheckboxChange('split_archives', $event)"
              >
              <span>Split large archives</span>
            </label>
            <div
              v-show="config.split_archives"
              class="mt-2 transition-all duration-200"
            >
              <label class="form-label text-sm">Max size per archive (MB)</label>
              <input
                type="number"
                min="100"
                max="4096"
                class="form-input text-sm"
                :value="config.max_size_mb"
                @input="onNumberInput('max_size_mb', $event)"
              >
            </div>
          </div>

          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                class="form-checkbox mr-2"
                :checked="config.encrypt"
                @change="onCheckboxChange('encrypt', $event)"
              >
              <span>Encrypt export</span>
            </label>
            <div
              v-show="config.encrypt"
              class="mt-2 transition-all duration-200"
            >
              <label class="form-label text-sm">Password</label>
              <input
                type="password"
                class="form-input text-sm"
                :value="config.password"
                @input="onInputChange('password', $event)"
              >
            </div>
          </div>

          <div class="p-3 bg-gray-50 rounded">
            <div class="text-sm font-medium">Estimated Export Size</div>
            <div class="text-lg font-bold text-blue-600">{{ estimatedSize }}</div>
            <div class="text-xs text-gray-600">
              Processing time: ~{{ estimatedTime }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center pt-6 border-t">
      <div class="flex items-center space-x-4">
        <button class="btn btn-secondary" @click="$emit('validate')">
          Validate Selection
        </button>
        <button class="btn btn-secondary" @click="$emit('preview')">
          Preview Contents
        </button>
      </div>
      <button
        class="btn btn-primary"
        :disabled="!canExport || isExporting"
        @click="$emit('start')"
      >
        <template v-if="!isExporting">
          <span>Start Export</span>
        </template>
        <template v-else>
          <div class="flex items-center">
            <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
            </svg>
            Exporting...
          </div>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ExportConfig } from '@/composables/useExportWorkflow';

type ExportConfigKey = keyof ExportConfig;

const props = defineProps<{
  config: ExportConfig;
  canExport: boolean;
  estimatedSize: string;
  estimatedTime: string;
  isExporting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-config', payload: { key: ExportConfigKey; value: ExportConfig[ExportConfigKey] }): void;
  (e: 'validate'): void;
  (e: 'preview'): void;
  (e: 'start'): void;
}>();

const updateConfig = (key: ExportConfigKey, value: ExportConfig[ExportConfigKey]) => {
  emit('update-config', { key, value });
};

const onCheckboxChange = (key: ExportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateConfig(key, target.checked as ExportConfig[ExportConfigKey]);
  }
};

const onRadioChange = (key: ExportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateConfig(key, target.value as ExportConfig[ExportConfigKey]);
  }
};

const onSelectChange = (key: ExportConfigKey, event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (target) {
    updateConfig(key, target.value as ExportConfig[ExportConfigKey]);
  }
};

const onInputChange = (key: ExportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateConfig(key, target.value as ExportConfig[ExportConfigKey]);
  }
};

const onNumberInput = (key: ExportConfigKey, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    const parsed = Number(target.value);
    updateConfig(key, (Number.isNaN(parsed) ? 0 : parsed) as ExportConfig[ExportConfigKey]);
  }
};
</script>
