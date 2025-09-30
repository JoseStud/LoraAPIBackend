<template>
  <div class="card mb-6">
    <div class="card-body">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="form-label">Search Prompts</label>
          <input
            type="text"
            :value="searchTerm"
            @input="onSearchInput"
            placeholder="Search prompts..."
            class="form-input"
          />
        </div>

        <div>
          <label class="form-label">Date Range</label>
          <select :value="dateFilter" @change="onDateChange" class="form-input">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
          </select>
        </div>

        <div>
          <label class="form-label">Minimum Rating</label>
          <select :value="String(ratingFilter)" @change="onRatingChange" class="form-input">
            <option value="0">All Ratings</option>
            <option value="1">1+ Stars</option>
            <option value="2">2+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="4">4+ Stars</option>
            <option value="5">5 Stars Only</option>
          </select>
        </div>

        <div>
          <label class="form-label">Dimensions</label>
          <select :value="dimensionFilter" @change="onDimensionChange" class="form-input">
            <option value="all">All Sizes</option>
            <option value="512x512">512x512</option>
            <option value="768x768">768x768</option>
            <option value="1024x1024">1024x1024</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  DateFilterOption,
  DimensionFilterOption,
  RatingFilterOption,
} from '@/features/history';

const DATE_FILTER_OPTIONS = ['all', 'today', 'week', 'month'] as const;
const RATING_FILTER_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
const DIMENSION_FILTER_OPTIONS = ['all', '512x512', '768x768', '1024x1024'] as const;

const isDateFilterOption = (value: string): value is DateFilterOption =>
  DATE_FILTER_OPTIONS.includes(value as DateFilterOption);

const isRatingFilterOption = (value: number): value is RatingFilterOption =>
  RATING_FILTER_OPTIONS.includes(value as RatingFilterOption);

const isDimensionFilterOption = (value: string): value is DimensionFilterOption =>
  DIMENSION_FILTER_OPTIONS.includes(value as DimensionFilterOption);

const toDateFilterOption = (value: string): DateFilterOption =>
  isDateFilterOption(value) ? value : 'all';

const toRatingFilterOption = (value: string): RatingFilterOption => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && isRatingFilterOption(numeric) ? numeric : 0;
};

const toDimensionFilterOption = (value: string): DimensionFilterOption =>
  isDimensionFilterOption(value) ? value : 'all';

defineProps<{
  searchTerm: string;
  dateFilter: DateFilterOption;
  ratingFilter: RatingFilterOption;
  dimensionFilter: DimensionFilterOption;
}>();

const emit = defineEmits<{
  (e: 'update:searchTerm', value: string): void;
  (e: 'update:dateFilter', value: DateFilterOption): void;
  (e: 'update:ratingFilter', value: RatingFilterOption): void;
  (e: 'update:dimensionFilter', value: DimensionFilterOption): void;
  (e: 'search'): void;
  (e: 'change'): void;
}>();

const onSearchInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:searchTerm', value);
  emit('search');
};

const onDateChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:dateFilter', toDateFilterOption(value));
  emit('change');
};

const onRatingChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:ratingFilter', toRatingFilterOption(value));
  emit('change');
};

const onDimensionChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:dimensionFilter', toDimensionFilterOption(value));
  emit('change');
};
</script>
