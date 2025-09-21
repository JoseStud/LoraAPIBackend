import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores/app';

type ThemePreference = 'light' | 'dark';

const THEME_STORAGE_KEY = 'lora-manager-theme';
let themeInitialized = false;

const applyThemeToDocument = (theme: ThemePreference) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const body = document.body;

  root.dataset.theme = theme;
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');

  if (body) {
    body.dataset.theme = theme;
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('theme-light', theme === 'light');
  }
};

const resolveStoredTheme = (): ThemePreference | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage?.getItem(
    THEME_STORAGE_KEY
  ) as ThemePreference | null;

  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return null;
};

export const useTheme = () => {
  const appStore = useAppStore();
  const { preferences } = storeToRefs(appStore);

  if (!themeInitialized) {
    themeInitialized = true;
    const initialTheme = resolveStoredTheme();
    if (initialTheme) {
      appStore.setPreferences({ theme: initialTheme });
    }
  }

  const currentTheme = computed<ThemePreference>(() =>
    preferences.value.theme === 'dark' ? 'dark' : 'light'
  );

  const setTheme = (theme: ThemePreference) => {
    appStore.setPreferences({ theme });
  };

  const toggleTheme = () => {
    setTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
  };

  watch(
    currentTheme,
    (theme) => {
      applyThemeToDocument(theme);
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
      }
    },
    { immediate: true }
  );

  return {
    currentTheme,
    setTheme,
    toggleTheme,
  };
};

export type UseThemeReturn = ReturnType<typeof useTheme>;
