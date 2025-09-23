import { reactive, ref, unref, type ComputedRef } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { debounce, type DebouncedFunction } from '@/utils/async';
import { listResults as listHistoryResults } from '@/services';
import type {
  GenerationHistoryQuery,
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

  const updateDerivedData = (): void => {
    filteredResults.value = [...data.value];
    calculateStats();
  };

  const parseDimensionFilter = (): { width?: number; height?: number } => {
    if (dimensionFilter.value === 'all') {
      return {};
    }

    const [widthText, heightText] = dimensionFilter.value.split('x');
    const width = Number(widthText);
    const height = Number(heightText);

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return {};
    }

    return { width, height };
  };

  const buildFilterStateKey = (): string => JSON.stringify({
    search: searchTerm.value.trim(),
    sort: sortBy.value,
    date: dateFilter.value,
    rating: ratingFilter.value,
    dimension: dimensionFilter.value,
    pageSize: pageSize.value,
  });

  const buildQuery = (page: number): GenerationHistoryQuery => {
    const query: GenerationHistoryQuery = {
      page,
      page_size: pageSize.value,
      sort: sortBy.value,
    };

    const search = searchTerm.value.trim();
    if (search) {
      query.search = search;
    }

    if (ratingFilter.value > 0) {
      query.min_rating = ratingFilter.value;
    }

    if (dateFilter.value && dateFilter.value !== 'all') {
      query.date_filter = dateFilter.value;
    }

    const { width, height } = parseDimensionFilter();
    if (typeof width === 'number') {
      query.width = width;
    }
    if (typeof height === 'number') {
      query.height = height;
    }

    return query;
  };

  const lastAppliedFilterKey = ref('');

  const applyFilters = (): void => {
    const nextKey = buildFilterStateKey();

    if (nextKey !== lastAppliedFilterKey.value) {
      lastAppliedFilterKey.value = nextKey;
      currentPage.value = 1;
      hasMore.value = true;
      void loadPage(1, false);
      return;
    }

    if (!isLoading.value) {
      updateDerivedData();
    }
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
      const response = await listHistoryResults(resolveApiBase(apiBase), buildQuery(page));

      const results = Array.isArray(response.results) ? response.results : [];
      updatePaginationState(results, response.response);

      if (append) {
        data.value = [...data.value, ...results];
      } else {
        data.value = [...results];
        currentPage.value = page;
      }

      updateDerivedData();

      if (!append) {
        lastAppliedFilterKey.value = buildFilterStateKey();
      }
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
