import { reactive, ref, unref, type ComputedRef } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { debounce, type DebouncedFunction } from '@/utils/async';
import { listResults as listHistoryResults } from '@/services/historyService';
import type {
  GenerationHistoryResult,
  GenerationHistoryStats,
} from '@/types';

export type HistorySortOption = 'created_at' | 'created_at_asc' | 'prompt' | 'rating';
export type DateFilterOption = 'all' | 'today' | 'week' | 'month';
export type RatingFilterOption = 0 | 1 | 2 | 3 | 4 | 5;
export type DimensionFilterOption = 'all' | '512x512' | '768x768' | '1024x1024';

export interface UseGenerationHistoryOptions {
  apiBase: MaybeRefOrGetter<string> | ComputedRef<string>;
  pageSize?: number;
}

const resolveApiBase = (source: MaybeRefOrGetter<string> | ComputedRef<string>): string => {
  if (typeof source === 'function') {
    return source() ?? '';
  }
  return unref(source) ?? '';
};

export const useGenerationHistory = ({
  apiBase,
  pageSize: initialPageSize = 50,
}: UseGenerationHistoryOptions) => {
  const data = ref<GenerationHistoryResult[]>([]);
  const filteredResults = ref<GenerationHistoryResult[]>([]);

  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(true);
  const currentPage = ref(1);
  const pageSize = ref(initialPageSize);

  const searchTerm = ref('');
  const sortBy = ref<HistorySortOption>('created_at');
  const dateFilter = ref<DateFilterOption>('all');
  const ratingFilter = ref<RatingFilterOption>(0);
  const dimensionFilter = ref<DimensionFilterOption>('all');

  const stats = reactive<GenerationHistoryStats>({
    total_results: 0,
    avg_rating: 0,
    total_favorites: 0,
    total_size: 0,
  });

  const calculateStats = (): void => {
    stats.total_results = filteredResults.value.length;

    if (filteredResults.value.length > 0) {
      const totalRating = filteredResults.value.reduce((sum, result) => sum + (result.rating ?? 0), 0);
      stats.avg_rating = totalRating / filteredResults.value.length;
      stats.total_favorites = filteredResults.value.filter((result) => Boolean(result.is_favorite)).length;
      stats.total_size = filteredResults.value.length * 2.5 * 1024 * 1024;
      return;
    }

    stats.avg_rating = 0;
    stats.total_favorites = 0;
    stats.total_size = 0;
  };

  const sortResults = (results: GenerationHistoryResult[]): void => {
    switch (sortBy.value) {
      case 'created_at':
        results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'created_at_asc':
        results.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'prompt':
        results.sort((a, b) => a.prompt.localeCompare(b.prompt));
        break;
      case 'rating':
        results.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
    }
  };

  const applyFilters = (): void => {
    let working = [...data.value];

    if (searchTerm.value.trim()) {
      const searchLower = searchTerm.value.toLowerCase();
      working = working.filter((result) => {
        const promptText = result.prompt.toLowerCase();
        const negativeText = typeof result.negative_prompt === 'string'
          ? result.negative_prompt.toLowerCase()
          : '';
        return promptText.includes(searchLower) || negativeText.includes(searchLower);
      });
    }

    if (dateFilter.value !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter.value) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        default:
          break;
      }

      working = working.filter((result) => {
        const createdAt = new Date(result.created_at);
        return Number.isFinite(createdAt.getTime()) && createdAt >= filterDate;
      });
    }

    if (ratingFilter.value > 0) {
      working = working.filter((result) => (result.rating ?? 0) >= ratingFilter.value);
    }

    if (dimensionFilter.value !== 'all') {
      const [widthText, heightText] = dimensionFilter.value.split('x');
      const width = Number(widthText);
      const height = Number(heightText);

      if (Number.isFinite(width) && Number.isFinite(height)) {
        working = working.filter((result) => result.width === width && result.height === height);
      }
    }

    sortResults(working);

    filteredResults.value = working;
    calculateStats();
  };

  const debouncedApplyFilters: DebouncedFunction<() => void> = debounce(() => applyFilters(), 300);

  const updatePaginationState = (results: GenerationHistoryResult[], response: unknown): void => {
    if (!response || typeof response !== 'object') {
      hasMore.value = results.length >= pageSize.value;
      return;
    }

    const pageInfo = response as { has_more?: boolean; page?: number; pages?: number };
    if (typeof pageInfo.has_more === 'boolean') {
      hasMore.value = pageInfo.has_more;
      return;
    }

    if (typeof pageInfo.page === 'number' && typeof pageInfo.pages === 'number') {
      hasMore.value = pageInfo.page < pageInfo.pages;
      return;
    }

    hasMore.value = results.length >= pageSize.value;
  };

  const loadPage = async (page: number, append: boolean): Promise<void> => {
    isLoading.value = true;
    error.value = null;

    try {
      const response = await listHistoryResults(resolveApiBase(apiBase), {
        page,
        page_size: pageSize.value,
      });

      const results = Array.isArray(response.results) ? response.results : [];
      updatePaginationState(results, response.response);

      if (append) {
        data.value = [...data.value, ...results];
      } else {
        data.value = [...results];
      }

      applyFilters();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load results';
    } finally {
      isLoading.value = false;
    }
  };

  const loadInitialResults = async (): Promise<void> => {
    currentPage.value = 1;
    await loadPage(currentPage.value, false);
  };

  const loadMore = async (): Promise<void> => {
    if (!hasMore.value || isLoading.value) {
      return;
    }

    currentPage.value += 1;
    await loadPage(currentPage.value, true);
  };

  const clearFilters = (): void => {
    searchTerm.value = '';
    sortBy.value = 'created_at';
    dateFilter.value = 'all';
    ratingFilter.value = 0;
    dimensionFilter.value = 'all';
    applyFilters();
  };

  return {
    data,
    filteredResults,
    stats,
    isLoading,
    error,
    hasMore,
    currentPage,
    pageSize,
    searchTerm,
    sortBy,
    dateFilter,
    ratingFilter,
    dimensionFilter,
    loadInitialResults,
    loadMore,
    applyFilters,
    debouncedApplyFilters,
    clearFilters,
  };
};

export type UseGenerationHistoryReturn = ReturnType<typeof useGenerationHistory>;
