import { ref, watch } from 'vue';
import {
  NavigationFailureType,
  isNavigationFailure,
  useRoute,
  useRouter,
} from 'vue-router';
import type { Ref } from 'vue';
import type { LocationQueryRaw } from 'vue-router';

const normalizeQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return typeof value === 'string' ? value : '';
};

export function useSyncedQueryParam(key = 'q'): Ref<string> {
  const route = useRoute();
  const router = useRouter();

  const value = ref<string>(normalizeQueryValue(route.query[key]));

  const syncFromRoute = () => {
    const normalized = normalizeQueryValue(route.query[key]);
    if (normalized !== value.value) {
      value.value = normalized;
    }
  };

  watch(
    () => route.query[key],
    () => {
      syncFromRoute();
    }
  );

  let pendingNavigation: Promise<void> | null = null;
  let scheduledLocation: { path: string; query: LocationQueryRaw } | null = null;

  const flushNavigation = () => {
    const location = scheduledLocation;
    pendingNavigation = null;
    scheduledLocation = null;

    if (!location) {
      return;
    }

    router.replace(location).catch(error => {
      if (!isNavigationFailure(error, NavigationFailureType.duplicated)) {
        console.error(`Failed to update "${key}" query parameter`, error);
      }
    });
  };

  const scheduleNavigation = (location: { path: string; query: LocationQueryRaw }) => {
    scheduledLocation = location;

    if (!pendingNavigation) {
      pendingNavigation = Promise.resolve().then(flushNavigation);
    }
  };

  watch(value, newValue => {
    const currentQueryValue = normalizeQueryValue(route.query[key]);

    if (newValue === currentQueryValue) {
      return;
    }

    const nextQuery = { ...route.query } as LocationQueryRaw;

    if (newValue) {
      nextQuery[key] = newValue;
    } else {
      delete nextQuery[key];
    }

    scheduleNavigation({ path: route.path, query: nextQuery });
  });

  syncFromRoute();

  return value;
}
