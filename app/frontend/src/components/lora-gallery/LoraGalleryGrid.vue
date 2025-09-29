<template>
  <div ref="containerRef" class="lora-gallery-wrapper">
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10"
    >
      <div class="spinner"></div>
    </div>

    <DynamicScroller
      v-if="loras.length > 0"
      ref="scrollerRef"
      :items="loras"
      :key-field="keyField"
      :min-item-size="activeMinItemSize"
      :item-size="activeItemSize"
      :grid-items="gridItems"
      :item-secondary-size="itemSecondarySize"
      :buffer="buffer"
      :list-class="listClass"
      :item-class="itemClass"
      :class="[{ 'opacity-50': isLoading }, scrollerClasses]"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
          :size-dependencies="sizeDependencies"
          :class="itemWrapperClass"
        >
          <LoraCard
            :lora="item"
            :view-mode="viewMode"
            :bulk-mode="bulkMode"
            :is-selected="selectedSet.has(item.id)"
            @toggle-selection="$emit('toggle-selection', item.id)"
            @update="$emit('update', $event)"
            @delete="$emit('delete', item.id)"
          />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <div v-else-if="!isLoading" class="lora-gallery-empty-state">
      <svg class="lora-gallery-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-6m-6 0H4"></path>
      </svg>
      <h3 class="lora-gallery-empty-title">No LoRAs found</h3>
      <p class="lora-gallery-empty-copy">Try adjusting your search or filters.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';

import LoraCard from './LoraCard.vue';
import type {
  GalleryLora,
  LoraGallerySelectionState,
  LoraUpdatePayload,
} from '@/types';

defineOptions({ name: 'LoraGalleryGrid' });

const GRID_GAP_PX = 16;

const props = withDefaults(
  defineProps<{
    loras: GalleryLora[];
    isLoading: boolean;
    viewMode: LoraGallerySelectionState['viewMode'];
    bulkMode: boolean;
    selectedLoras: string[];
    keyField?: string;
    gridItemSize?: number;
    gridItemWidth?: number;
    listItemSize?: number;
    minItemSize?: number;
    buffer?: number;
  }>(),
  {
    keyField: 'id',
    gridItemSize: 420,
    gridItemWidth: 320,
    listItemSize: 200,
    minItemSize: 180,
    buffer: 600,
  },
);

const emit = defineEmits<{
  (event: 'toggle-selection', id: string): void;
  (event: 'update', payload: LoraUpdatePayload): void;
  (event: 'delete', id: string): void;
}>();

const scrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const containerWidth = ref(0);
const selectedSet = computed(() => new Set(props.selectedLoras));

const gridColumns = computed(() => {
  if (props.viewMode !== 'grid') {
    return 1;
  }

  const width = containerWidth.value;
  if (!width) {
    return 1;
  }

  const estimatedColumns = Math.floor((width + GRID_GAP_PX) / (props.gridItemWidth + GRID_GAP_PX));
  return Math.max(1, estimatedColumns || 1);
});

const computedGridItemWidth = computed(() => {
  if (props.viewMode !== 'grid') {
    return containerWidth.value || props.gridItemWidth;
  }

  const width = containerWidth.value;
  if (!width) {
    return props.gridItemWidth;
  }

  const columns = gridColumns.value;
  if (columns <= 1) {
    return Math.min(width, props.gridItemWidth);
  }

  const totalGap = GRID_GAP_PX * (columns - 1);
  return (width - totalGap) / columns;
});

const gridItems = computed(() => (props.viewMode === 'grid' ? gridColumns.value : undefined));
const itemSecondarySize = computed(() =>
  props.viewMode === 'grid' ? Math.max(200, Math.floor(computedGridItemWidth.value)) : undefined,
);

const activeItemSize = computed(() => (props.viewMode === 'grid' ? props.gridItemSize : undefined));
const activeMinItemSize = computed(() =>
  props.viewMode === 'grid' ? props.gridItemSize : props.minItemSize,
);

const sizeDependencies = computed(() => [props.bulkMode, props.viewMode]);

const scrollerClasses = computed(() => [
  'lora-gallery-scroller',
  props.viewMode === 'grid' ? 'lora-gallery-scroller--grid' : 'lora-gallery-scroller--list',
]);

const listClass = computed(() =>
  props.viewMode === 'grid' ? 'lora-gallery-grid-list' : 'lora-gallery-list-list',
);

const itemClass = computed(() =>
  props.viewMode === 'grid' ? 'lora-gallery-grid-item' : 'lora-gallery-list-item',
);

const itemWrapperClass = computed(() =>
  props.viewMode === 'grid' ? 'lora-gallery-item lora-gallery-item--grid' : 'lora-gallery-item lora-gallery-item--list',
);

let resizeObserver: ResizeObserver | null = null;

const forceUpdate = () => {
  nextTick(() => {
    const scroller = scrollerRef.value as { forceUpdate?: () => void } | null;
    if (scroller && typeof scroller.forceUpdate === 'function') {
      scroller.forceUpdate();
    }
  });
};

onMounted(() => {
  const element = containerRef.value;
  if (!element) {
    return;
  }

  containerWidth.value = element.clientWidth;

  resizeObserver = new ResizeObserver((entries) => {
    if (!entries.length) {
      return;
    }

    const entry = entries[0];
    const width = entry.contentRect.width;
    if (width !== containerWidth.value) {
      containerWidth.value = width;
      forceUpdate();
    }
  });

  resizeObserver.observe(element as unknown as Element);
});

onBeforeUnmount(() => {
  const element = containerRef.value;
  if (resizeObserver && element) {
    resizeObserver.unobserve(element as unknown as Element);
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => props.viewMode,
  () => {
    forceUpdate();
  },
);

watch(gridColumns, () => {
  if (props.viewMode === 'grid') {
    forceUpdate();
  }
});

watch(
  () => props.loras.length,
  () => {
    forceUpdate();
  },
);

const keyField = computed(() => props.keyField);
const buffer = computed(() => props.buffer);
</script>

<style scoped>
.lora-gallery-wrapper {
  position: relative;
  width: 100%;
  min-height: 24rem;
}

.lora-gallery-scroller {
  position: relative;
  height: clamp(30rem, 70vh, 64rem);
  width: 100%;
  padding: 0.5rem;
  box-sizing: border-box;
}

.lora-gallery-scroller--grid {
  padding-bottom: 1rem;
}

.lora-gallery-grid-item {
  padding: 0.5rem;
  box-sizing: border-box;
}

.lora-gallery-list-item {
  padding: 0.5rem 0;
  box-sizing: border-box;
}

.lora-gallery-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.lora-gallery-item--grid .lora-card-wrapper {
  height: 100%;
}

.lora-gallery-empty-state {
  padding: 3rem 1rem;
  text-align: center;
  color: #6b7280;
}

.lora-gallery-empty-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
  color: #d1d5db;
}

.lora-gallery-empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
}

.lora-gallery-empty-copy {
  color: #6b7280;
}
</style>
