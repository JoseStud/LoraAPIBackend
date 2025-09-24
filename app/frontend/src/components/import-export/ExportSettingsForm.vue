<template>
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
</template>

<script setup lang="ts">
import { useExportConfigFields } from '@/composables/import-export';
import type { ExportConfig } from '@/types';

type UpdateConfigEmitter<TConfig> = {
  <K extends keyof TConfig>(event: 'update-config', key: K, value: TConfig[K]): void;
};

const props = defineProps<{
  config: ExportConfig;
  estimatedSize: string;
  estimatedTime: string;
}>();

const config = props.config;

const emit = defineEmits<UpdateConfigEmitter<ExportConfig>>();

const { onCheckboxChange, onSelectChange, onNumberInput, onInputChange } = useExportConfigFields((key, value) => {
  emit('update-config', key, value);
});
</script>
