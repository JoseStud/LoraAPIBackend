<template>
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
</template>

<script setup lang="ts">
import { useExportConfigFields } from '@/composables/import-export';
import type { ExportConfig } from '@/composables/import-export';

type UpdateConfigEmitter<TConfig> = {
  <K extends keyof TConfig>(event: 'update-config', key: K, value: TConfig[K]): void;
};

const props = defineProps<{
  config: ExportConfig;
}>();

const config = props.config;

const emit = defineEmits<UpdateConfigEmitter<ExportConfig>>();

const { onCheckboxChange, onRadioChange, onInputChange } = useExportConfigFields((key, value) => {
  emit('update-config', key, value);
});
</script>
