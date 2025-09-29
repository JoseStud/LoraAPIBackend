<template>
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">System Status</h3>
    </div>
    <div class="card-body">
      <div class="space-y-3">
        <div class="flex justify-between">
          <span class="text-sm text-gray-600">Status:</span>
          <span
            class="text-sm font-medium"
            :class="getSystemStatusClasses(systemStatus.status)"
          >
            {{ systemStatus.status || 'Unknown' }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-gray-600">Queue:</span>
          <span class="text-sm font-medium">{{ systemStatus.queue_length || 0 }} jobs</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-gray-600">Workers:</span>
          <span class="text-sm font-medium">{{ systemStatus.active_workers || 0 }} active</span>
        </div>
        <div v-if="systemStatus.gpu_status" class="flex justify-between">
          <span class="text-sm text-gray-600">GPU:</span>
          <span class="text-sm font-medium">{{ systemStatus.gpu_status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'

import type { UseGenerationStudioReturn } from '@/composables/generation'
import type { SystemStatusState } from '@/types'

const props = defineProps<{
  systemStatus: SystemStatusState
  getSystemStatusClasses: UseGenerationStudioReturn['getSystemStatusClasses']
}>()

const { systemStatus } = toRefs(props)
const getSystemStatusClasses = props.getSystemStatusClasses
</script>
