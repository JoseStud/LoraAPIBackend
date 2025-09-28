import { computed, ref, unref, type ComputedRef } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { debounce, type DebouncedFunction } from '@/utils/async';
import { listResults as listHistoryResults } from '@/services/history/historyService';
import type {
  GenerationHistoryQuery,
  GenerationHistoryResult,
  GenerationHistoryStats,
  JsonObject,
} from '@/types';

export type HistorySortOption = 'created_at' | 'created_at_asc' | 'prompt' | 'rating';
export type DateFilterOption = 'all' | 'today' | 'week' | 'month';
export type RatingFilterOption = 0 | 1 | 2 | 3 | 4 | 5;
export type DimensionFilterOption = 'all' | '512x512' | '768x768' | '1024x1024';

type FilterSnapshot = {
  search: string;
  sort: HistorySortOption;
  date: DateFilterOption;
  rating: RatingFilterOption;
  dimension: DimensionFilterOption;
  pageSize: number;
};

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

  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(true);
  const currentPage = ref(1);
  const pageSize = ref(initialPageSize);
  const activeRequestKey = ref(0);
  let pendingController: AbortController | null = null;

  const searchTerm = ref('');
  const sortBy = ref<HistorySortOption>('created_at');
  const dateFilter = ref<DateFilterOption>('all');
  const ratingFilter = ref<RatingFilterOption>(0);
  const dimensionFilter = ref<DimensionFilterOption>('all');

  const appliedFilters = ref<FilterSnapshot>({
    search: '',
    sort: 'created_at',
    date: 'all',
    rating: 0,
    dimension: 'all',
    pageSize: pageSize.value,
  });
  const serverStats = ref<GenerationHistoryStats | null>(null);
  let hasFetchedOnce = false;

  const filteredResults = computed(() => data.value);

  const stats = computed<GenerationHistoryStats>(() => {
    const sanitize = (value: unknown): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    if (serverStats.value) {
      const snapshot = serverStats.value;
      return {
        total_results: sanitize(snapshot.total_results),
        avg_rating: sanitize(snapshot.avg_rating),
        total_favorites: sanitize(snapshot.total_favorites),
        total_size: sanitize(snapshot.total_size),
      };
    }

    const results = filteredResults.value;
    const totalResults = results.length;

    if (totalResults === 0) {
      return {
        total_results: 0,
        avg_rating: 0,
        total_favorites: 0,
        total_size: 0,
      };
    }

    const totalRating = results.reduce((sum, result) => sum + (result.rating ?? 0), 0);
    const totalFavorites = results.reduce(
      (sum, result) => (result.is_favorite ? sum + 1 : sum),
      0,
    );
    const totalSize = results.reduce((sum, result) => {
      const metadata = result.metadata as JsonObject | null;
      if (metadata) {
        const sizeCandidate =
          metadata.size_bytes ?? metadata.file_size ?? metadata.byte_size ?? metadata.size;
        if (typeof sizeCandidate === 'number' && Number.isFinite(sizeCandidate)) {
          return sum + sizeCandidate;
        }
      }
      return sum;
    }, 0);

    return {
      total_results: totalResults,
      avg_rating: totalRating / totalResults,
      total_favorites: totalFavorites,
      total_size: totalSize,
    };
  });

  const isAbortError = (err: unknown): boolean => {
    if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
      return err.name === 'AbortError';
    }
    return err instanceof Error && err.name === 'AbortError';
  };

  const cancelPendingRequest = (): void => {
    if (pendingController) {
      pendingController.abort();
      pendingController = null;
    }
  };

  const createFilterSnapshot = (): FilterSnapshot => ({
    search: searchTerm.value.trim(),
    sort: sortBy.value,
    date: dateFilter.value,
    rating: ratingFilter.value,
    dimension: dimensionFilter.value,
    pageSize: pageSize.value,
  });

  const areFiltersEqual = (a: FilterSnapshot, b: FilterSnapshot): boolean =>
    a.search === b.search &&
    a.sort === b.sort &&
    a.date === b.date &&
    a.rating === b.rating &&
    a.dimension === b.dimension &&
    a.pageSize === b.pageSize;

  const parseDimensionFilter = (
    dimension: DimensionFilterOption,
  ): { width?: number; height?: number } => {
    if (dimension === 'all') {
      return {};
    }

    const [widthText, heightText] = dimension.split('x');
    const width = Number(widthText);
    const height = Number(heightText);

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return {};
    }

    return { width, height };
  };

  const buildQuery = (filters: FilterSnapshot, page: number): GenerationHistoryQuery => {
    const query: GenerationHistoryQuery = {
      page,
      page_size: filters.pageSize,
      sort: filters.sort,
    };

    const search = filters.search;
    if (search) {
      query.search = search;
    }

    if (filters.rating > 0) {
      query.min_rating = filters.rating;
    }

    if (filters.date && filters.date !== 'all') {
      query.date_filter = filters.date;
    }

    const { width, height } = parseDimensionFilter(filters.dimension);
    if (typeof width === 'number') {
      query.width = width;
    }
    if (typeof height === 'number') {
      query.height = height;
    }

    return query;
  };

  const applyFilters = (): void => {
    const nextFilters = createFilterSnapshot();
    if (areFiltersEqual(appliedFilters.value, nextFilters)) {
      if (hasFetchedOnce) {
        return;
      }
    }

    appliedFilters.value = nextFilters;
    currentPage.value = 1;
    hasMore.value = true;
    data.value = [];
    serverStats.value = null;
    hasFetchedOnce = false;
    void loadPage(1, false);
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

    const requestId = activeRequestKey.value + 1;
    activeRequestKey.value = requestId;

    cancelPendingRequest();
    const controller = new AbortController();
    pendingController = controller;

    const filters = appliedFilters.value ?? createFilterSnapshot();

    try {
      const response = await listHistoryResults(resolveApiBase(apiBase), buildQuery(filters, page), {
        signal: controller.signal,
      });

      if (requestId !== activeRequestKey.value) {
        return;
      }

      const results = Array.isArray(response.results) ? response.results : [];
      updatePaginationState(results, response.response);

      if (append) {
        if (results.length > 0) {
          data.value.push(...results);
        }
      } else {
        data.value.length = 0;
        if (results.length > 0) {
          data.value.push(...results);
        }
        currentPage.value = page;
      }

      if (response.stats && typeof response.stats === 'object') {
        serverStats.value = response.stats as GenerationHistoryStats;
      } else if (!append) {
        serverStats.value = null;
      }
      hasFetchedOnce = true;
    } catch (err) {
      if (isAbortError(err) || requestId !== activeRequestKey.value) {
        return;
      }
      error.value = err instanceof Error ? err.message : 'Failed to load results';
    } finally {
      if (requestId === activeRequestKey.value) {
        if (pendingController === controller) {
          pendingController = null;
        }
        isLoading.value = false;
      }
    }
  };

  const loadInitialResults = async (): Promise<void> => {
    appliedFilters.value = createFilterSnapshot();
    currentPage.value = 1;
    hasMore.value = true;
    data.value = [];
    serverStats.value = null;
    hasFetchedOnce = false;
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
