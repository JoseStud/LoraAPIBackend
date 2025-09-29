<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Version Migration</h3>
          <p class="text-sm text-gray-600">Migrate data between software versions</p>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">From Version</label>
            <select class="form-input" :value="config.from_version" @change="onSelectChange('from_version', $event)">
              <option value="1.0">Version 1.0</option>
              <option value="1.1">Version 1.1</option>
              <option value="2.0">Version 2.0</option>
            </select>
          </div>
          <div>
            <label class="form-label">To Version</label>
            <select class="form-input" :value="config.to_version" @change="onSelectChange('to_version', $event)">
              <option value="2.1">Version 2.1 (Current)</option>
              <option value="3.0">Version 3.0 (Beta)</option>
            </select>
          </div>
          <button class="btn btn-primary w-full" @click="startVersionMigration">
            Start Version Migration
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Platform Migration</h3>
          <p class="text-sm text-gray-600">Migrate from other LoRA management systems</p>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Source Platform</label>
            <select
              class="form-input"
              :value="config.source_platform"
              @change="onSelectChange('source_platform', $event)"
            >
              <option value="automatic1111">Automatic1111</option>
              <option value="invokeai">InvokeAI</option>
              <option value="comfyui">ComfyUI</option>
              <option value="fooocus">Fooocus</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label class="form-label">Data Location</label>
            <input
              type="text"
              class="form-input"
              placeholder="/path/to/source/data"
              :value="config.source_path"
              @input="onInputChange('source_path', $event)"
            >
          </div>
          <button class="btn btn-primary w-full" @click="startPlatformMigration">
            Start Platform Migration
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MigrationConfig } from '@/composables/import-export';

import { useImportExportContext } from '@/composables/import-export';

type MigrationConfigKey = keyof MigrationConfig;

const {
  migrationWorkflow: { migrationConfig: config },
  actions: { updateMigrationConfig, startVersionMigration, startPlatformMigration }
} = useImportExportContext();

const onSelectChange = <K extends MigrationConfigKey>(key: K, event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (target) {
    updateMigrationConfig(key, target.value as MigrationConfig[K]);
  }
};

const onInputChange = <K extends MigrationConfigKey>(key: K, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target) {
    updateMigrationConfig(key, target.value as MigrationConfig[K]);
  }
};
</script>
