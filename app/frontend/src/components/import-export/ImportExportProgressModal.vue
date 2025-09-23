<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 overflow-y-auto transition-opacity duration-300"
    role="dialog"
    aria-modal="true"
    :aria-busy="show"
    aria-labelledby="progress-title"
  >
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75"></div>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <h3 id="progress-title" class="text-lg leading-6 font-medium text-gray-900 mb-4">{{ title }}</h3>

          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span>{{ currentStep }}</span>
                <span>{{ value }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" :style="`width: ${value}%`"></div>
              </div>
            </div>

            <div class="max-h-40 overflow-y-auto text-xs font-mono bg-gray-100 p-3 rounded">
              <div v-for="message in messages" :key="message.id">
                {{ message.text }}
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            @click="$emit('cancel')"
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:ml-3 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ProgressMessage {
  id: number | string;
  text: string;
}

defineProps<{
  show: boolean;
  title: string;
  value: number;
  currentStep: string;
  messages: readonly ProgressMessage[];
}>();

defineEmits<{
  (e: 'cancel'): void;
}>();
</script>
