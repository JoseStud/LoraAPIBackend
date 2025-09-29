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

    router.push({ path: route.path, query: nextQuery }).catch(error => {
      if (!isNavigationFailure(error, NavigationFailureType.duplicated)) {
        console.error(`Failed to update "${key}" query parameter`, error);
      }
    });
  });

  syncFromRoute();

  return value;
}
