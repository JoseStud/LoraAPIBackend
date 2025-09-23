<template>
  <div v-if="show" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-content">
      <h3 class="modal-title">All Tags</h3>
      <div class="all-tags-list">
        <label v-for="tag in availableTags" :key="tag" class="checkbox-label">
          <input
            type="checkbox"
            class="form-checkbox"
            :value="tag"
            :checked="selectedTags.includes(tag)"
            @change="onToggleTag(tag, $event)"
          >
          <span class="checkbox-text">{{ tag }}</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" @click="$emit('close')">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'LoraGalleryTagModal' });

const props = defineProps<{
  show: boolean;
  availableTags: string[];
  selectedTags: string[];
}>();

const emit = defineEmits<{
  (event: 'update:selected-tags', value: string[]): void;
  (event: 'close'): void;
}>();

const onToggleTag = (tag: string, event: Event) => {
  const isChecked = (event.target as HTMLInputElement).checked;
  const next = new Set(props.selectedTags);
  if (isChecked) {
    next.add(tag);
  } else {
    next.delete(tag);
  }
  emit('update:selected-tags', Array.from(next));
};
</script>
