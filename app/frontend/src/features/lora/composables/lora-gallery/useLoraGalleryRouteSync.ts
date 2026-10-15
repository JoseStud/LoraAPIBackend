import { computed, watch } from 'vue';
import type { Ref } from 'vue';
import {
  NavigationFailureType,
  isNavigationFailure,
  useRoute,
  useRouter,
} from 'vue-router';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

import type { LoraGallerySortOption } from '@/types';
import { FACET_KEYS } from '../../utils/libraryMeta';
import type { FacetSelection } from './useLoraGalleryFilters';

/** Filter state the gallery keeps in the URL. */
export interface GalleryFilterState {
  search: string;
  activeOnly: boolean;
  archetype: string;
  series: string;
  sortBy: LoraGallerySortOption;
  facets: FacetSelection;
}

const DEFAULT_SORT: LoraGallerySortOption = 'name_asc';
const SORT_OPTIONS = new Set<LoraGallerySortOption>([
  'name_asc',
  'name_desc',
  'created_at_desc',
  'created_at_asc',
  'last_updated_desc',
]);

/** Query keys owned by the gallery filters; anything else is left alone. */
export const GALLERY_FILTER_QUERY_KEYS = [
  'q',
  'active',
  'archetype',
  'series',
  'sort',
  ...FACET_KEYS,
] as const;

const firstValue = (value: LocationQuery[string] | undefined): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
};

const allValues = (value: LocationQuery[string] | undefined): string[] => {
  const raw = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(raw.filter((item): item is string => typeof item === 'string' && item.length > 0)),
  );
};

/** Read filter state from a route query; unknown or invalid values fall back to defaults. */
export const filtersFromQuery = (query: LocationQuery): GalleryFilterState => {
  const sort = firstValue(query.sort) as LoraGallerySortOption;
  const facets: FacetSelection = {};
  for (const key of FACET_KEYS) {
    const values = allValues(query[key]);
    if (values.length > 0) {
      facets[key] = values;
    }
  }
  return {
    search: firstValue(query.q),
    activeOnly: firstValue(query.active) === '1',
    archetype: firstValue(query.archetype),
    series: firstValue(query.series),
    sortBy: SORT_OPTIONS.has(sort) ? sort : DEFAULT_SORT,
    facets,
  };
};

/** Encode filter state as query params, leaving out defaults. Facets repeat their key. */
export const filtersToQuery = (state: GalleryFilterState): LocationQueryRaw => {
  const query: LocationQueryRaw = {};
  if (state.search) query.q = state.search;
  if (state.activeOnly) query.active = '1';
  if (state.archetype) query.archetype = state.archetype;
  if (state.series) query.series = state.series;
  if (state.sortBy !== DEFAULT_SORT) query.sort = state.sortBy;
  for (const key of FACET_KEYS) {
    const values = state.facets[key] ?? [];
    if (values.length > 0) {
      query[key] = [...values];
    }
  }
  return query;
};

const stateKey = (state: GalleryFilterState): string => JSON.stringify(filtersToQuery(state));

export interface GalleryFilterRefs {
  searchTerm: Ref<string>;
  activeOnly: Ref<boolean>;
  selectedArchetype: Ref<string>;
  selectedSeries: Ref<string>;
  sortBy: Ref<LoraGallerySortOption>;
  selectedFacets: Ref<FacetSelection>;
}

/**
 * Keep the gallery filters and the URL query in step, both ways, so leaving
 * for a LoRA's page and coming back (or sharing the link) restores them.
 *
 * One writer owns every filter key: separate per-key writers would race when
 * several filters change in the same tick, as "Clear Filters" does.
 */
export function useLoraGalleryRouteSync(filters: GalleryFilterRefs): void {
  const route = useRoute();
  const router = useRouter();
  const galleryPath = route.path;

  const readState = (): GalleryFilterState => ({
    search: filters.searchTerm.value,
    activeOnly: filters.activeOnly.value,
    archetype: filters.selectedArchetype.value,
    series: filters.selectedSeries.value,
    sortBy: filters.sortBy.value,
    facets: filters.selectedFacets.value,
  });

  const applyState = (state: GalleryFilterState) => {
    filters.searchTerm.value = state.search;
    filters.activeOnly.value = state.activeOnly;
    filters.selectedArchetype.value = state.archetype;
    filters.selectedSeries.value = state.series;
    filters.sortBy.value = state.sortBy;
    filters.selectedFacets.value = state.facets;
  };

  applyState(filtersFromQuery(route.query));

  // URL -> filters: back/forward, the header search box, a pasted link.
  // Watches the parsed values, so in-place query edits are seen too.
  watch(
    () => stateKey(filtersFromQuery(route.query)),
    (queryKey) => {
      if (route.path === galleryPath && queryKey !== stateKey(readState())) {
        applyState(filtersFromQuery(route.query));
      }
    },
  );

  // Filters -> URL.
  const currentKey = computed(() => stateKey(readState()));
  watch(currentKey, () => {
    if (route.path !== galleryPath || currentKey.value === stateKey(filtersFromQuery(route.query))) {
      return;
    }
    const otherParams: LocationQueryRaw = { ...route.query };
    for (const key of GALLERY_FILTER_QUERY_KEYS) {
      delete otherParams[key];
    }
    router
      .replace({ path: galleryPath, query: { ...otherParams, ...filtersToQuery(readState()) } })
      .catch((error: unknown) => {
        if (!isNavigationFailure(error, NavigationFailureType.duplicated)) {
          console.error('Failed to update the gallery filters in the URL', error);
        }
      });
  });
}
