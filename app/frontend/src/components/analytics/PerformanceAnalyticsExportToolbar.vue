<template>
  <div class="card">
    <div class="card-header">
      <h3 class="text-lg font-semibold">Export Analytics</h3>
      <p class="text-sm text-gray-600">Download performance data for external analysis</p>
    </div>
    <div class="card-body">
      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn btn-secondary" @click="emitExport('csv')">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Export CSV
        </button>
        <button type="button" class="btn btn-secondary" @click="emitExport('json')">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Export JSON
        </button>
        <button type="button" class="btn btn-secondary" @click="emitExport('pdf')">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Export PDF Report
        </button>
        <button type="button" class="btn btn-primary" @click="emitSchedule">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Schedule Report
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'export', format: string): void;
  (e: 'schedule'): void;
}>();

const emitExport = (format: string) => {
  emit('export', format);
};

const emitSchedule = () => {
  emit('schedule');
};
</script>
