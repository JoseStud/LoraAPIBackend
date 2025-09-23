<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <button class="card card-interactive text-center p-6" @click="$emit('create-full-backup')">
        <svg class="w-12 h-12 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <h3 class="text-lg font-semibold mb-2">Full System Backup</h3>
        <p class="text-sm text-gray-600">Complete backup of all data and settings</p>
      </button>

      <button class="card card-interactive text-center p-6" @click="$emit('create-quick-backup')">
        <svg class="w-12 h-12 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
        <h3 class="text-lg font-semibold mb-2">Quick Backup</h3>
        <p class="text-sm text-gray-600">Essential data only for fast backup</p>
      </button>

      <button class="card card-interactive text-center p-6" @click="$emit('schedule-backup')">
        <svg class="w-12 h-12 mx-auto mb-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <h3 class="text-lg font-semibold mb-2">Schedule Backup</h3>
        <p class="text-sm text-gray-600">Automatic recurring backups</p>
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Backup History</h3>
        <p class="text-sm text-gray-600">Manage existing backups</p>
      </div>
      <div class="card-body">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="backup in history" :key="backup.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatDate(backup.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ backup.type }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatFileSize(backup.size ?? 0) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                    :class="backup.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : backup.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'"
                  >
                    {{ backup.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div class="flex space-x-2">
                    <button class="text-blue-600 hover:text-blue-900" @click="$emit('download-backup', backup.id)">
                      Download
                    </button>
                    <button class="text-green-600 hover:text-green-900" @click="$emit('restore-backup', backup.id)">
                      Restore
                    </button>
                    <button class="text-red-600 hover:text-red-900" @click="$emit('delete-backup', backup.id)">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="history.length === 0">
                <td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">
                  No backups found. Create your first backup above.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BackupEntry } from '@/composables/import-export';

defineProps<{
  history: readonly BackupEntry[];
  formatFileSize: (bytes: number) => string;
  formatDate: (input: string) => string;
}>();

defineEmits<{
  (e: 'create-full-backup'): void;
  (e: 'create-quick-backup'): void;
  (e: 'schedule-backup'): void;
  (e: 'download-backup', backupId: string): void;
  (e: 'restore-backup', backupId: string): void;
  (e: 'delete-backup', backupId: string): void;
}>();
</script>
