<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="dialogState.isOpen" class="dialog-service__overlay">
        <div class="dialog-service__backdrop" @click="onCancel"></div>
        <div
          class="dialog-service__panel"
          role="dialog"
          :aria-labelledby="titleId"
          aria-modal="true"
          @keydown.esc.prevent="onCancel"
        >
          <header class="dialog-service__header">
            <h2 :id="titleId" class="dialog-service__title">
              {{ dialogState.title || defaultTitle }}
            </h2>
            <p v-if="dialogState.message" class="dialog-service__message">
              {{ dialogState.message }}
            </p>
          </header>

          <section class="dialog-service__body">
            <p v-if="dialogState.description" class="dialog-service__description">
              {{ dialogState.description }}
            </p>

            <div v-if="dialogState.type === 'prompt'" class="dialog-service__input-wrapper">
              <label v-if="dialogState.inputLabel" class="dialog-service__input-label">
                {{ dialogState.inputLabel }}
              </label>
              <input
                ref="inputRef"
                v-model="inputModel"
                type="text"
                class="dialog-service__input"
                :placeholder="dialogState.placeholder"
                @keyup.enter.prevent="onConfirm"
              >
            </div>
          </section>

          <footer class="dialog-service__footer">
            <button type="button" class="btn btn-secondary" @click="onCancel">
              {{ dialogState.cancelLabel || 'Cancel' }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isConfirmDisabled"
              @click="onConfirm"
            >
              {{ dialogState.confirmLabel || 'Confirm' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useDialogService } from '@/composables/shared'

const { state: dialogState, confirmDialog, cancelDialog, updateInputValue, isConfirmDisabled } =
  useDialogService()

const inputRef = ref<HTMLInputElement | null>(null)
const titleId = `dialog-${Math.random().toString(36).slice(2)}`

const inputModel = computed({
  get: () => dialogState.inputValue,
  set: (value: string) => updateInputValue(value),
})

const defaultTitle = computed(() =>
  dialogState.type === 'prompt' ? 'Enter a value' : 'Confirm Action',
)

const onConfirm = () => {
  if (isConfirmDisabled.value) {
    return
  }

  confirmDialog()
}

const onCancel = () => {
  cancelDialog()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!dialogState.isOpen) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelDialog()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(
  () => dialogState.isOpen,
  (isOpen) => {
    if (isOpen && dialogState.type === 'prompt') {
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }
  },
)
</script>

<style scoped>
.dialog-service__overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.dialog-service__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
}

.dialog-service__panel {
  position: relative;
  width: 100%;
  max-width: 28rem;
  border-radius: 0.75rem;
  background: white;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
  border: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-service__header {
  padding: 1.25rem 1.5rem 0.75rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.dialog-service__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: rgb(15, 23, 42);
}

.dialog-service__message {
  margin-top: 0.5rem;
  color: rgb(100, 116, 139);
  font-size: 0.95rem;
  line-height: 1.5;
}

.dialog-service__body {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dialog-service__description {
  color: rgb(71, 85, 105);
  font-size: 0.95rem;
  line-height: 1.5;
}

.dialog-service__input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dialog-service__input-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(51, 65, 85);
}

.dialog-service__input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.7);
  padding: 0.65rem 0.75rem;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dialog-service__input:focus {
  outline: none;
  border-color: rgb(59, 130, 246);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.dialog-service__footer {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: rgba(241, 245, 249, 0.7);
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
