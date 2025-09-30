import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive, ref, type Ref } from 'vue';

vi.mock('zod', () => {
  const passthrough: any = new Proxy(
    () => passthrough,
    {
      apply: () => passthrough,
      get: () => passthrough,
    }
  );

  return {
    z: passthrough,
    ZodError: class extends Error {},
  };
});

const routerMocks: {
  push: (...args: unknown[]) => Promise<unknown>;
  replace: (...args: unknown[]) => Promise<unknown>;
  failures: { duplicated: number };
} = {
  push: () => Promise.resolve(undefined),
  replace: () => Promise.resolve(undefined),
  failures: { duplicated: 1 },
};



type RouteMock = {
  path: string;
  query: Record<string, unknown>;
};

type TestGalleryLora = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_updated?: string | null;
};

let route: RouteMock;

vi.mock('vue-router', () => {
  const RouterLink = {
    name: 'RouterLink',
    props: {
      to: {
        type: [String, Object],
        default: '/',
      },
    },
    setup(_: unknown, { slots }: { slots: Record<string, (() => unknown) | undefined> }) {
      return () => slots.default?.();
    },
  };

  return {
    useRoute: () => route,
    useRouter: () => ({
      push: routerMocks.push,
      replace: routerMocks.replace,
    }),
    isNavigationFailure: (error: unknown, failureType: number) =>
      typeof error === 'object' && error !== null && 'type' in (error as Record<string, unknown>)
        ? (error as { type?: number }).type === failureType
        : false,
    NavigationFailureType: routerMocks.failures,
    RouterLink,
  };
});

import { useSyncedQueryParam } from '@/composables/shared';
import { useLoraGalleryFilters } from '@/composables/lora-gallery';

describe('useSyncedQueryParam', () => {
  beforeEach(() => {
    routerMocks.push = vi.fn().mockResolvedValue(undefined);
    routerMocks.replace = vi.fn().mockResolvedValue(undefined);
    route = reactive<RouteMock>({
      path: '/loras',
      query: reactive({}) as Record<string, unknown>,
    });
  });

  const withSetup = (key?: string): Ref<string> => {
    let result!: Ref<string>;
    mount({
      template: '<div />',
      setup() {
        result = useSyncedQueryParam(key);
        return {};
      },
    });

    return result;
  };

  it('initializes from the current route query and normalizes arrays', async () => {
    route.query.q = ['alpha', 'beta'];

    const queryRef = withSetup();
    await nextTick();

    expect(queryRef.value).toBe('alpha');
  });

  it('updates when the route query changes', async () => {
    const queryRef = withSetup();

    route.query.q = 'gamma';
    await nextTick();
    expect(queryRef.value).toBe('gamma');

    route.query.q = ['delta'];
    await nextTick();
    expect(queryRef.value).toBe('delta');
  });

  it('replaces router history when the ref changes', async () => {
    const queryRef = withSetup();

    queryRef.value = 'epsilon';
    await nextTick();
    await Promise.resolve();

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      path: '/loras',
      query: { q: 'epsilon' },
    });

    route.query.q = 'epsilon';
    await nextTick();

    queryRef.value = '';
    await nextTick();
    await Promise.resolve();

    expect(routerMocks.replace).toHaveBeenCalledTimes(2);
    expect(routerMocks.replace).toHaveBeenLastCalledWith({
      path: '/loras',
      query: {},
    });
  });

  it('batches rapid updates into a single navigation', async () => {
    const queryRef = withSetup();

    queryRef.value = 'first';
    queryRef.value = 'second';
    await nextTick();
    await Promise.resolve();

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      path: '/loras',
      query: { q: 'second' },
    });
  });

  it('suppresses duplicate navigation errors while logging others', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const queryRef = withSetup();

    routerMocks.replace.mockRejectedValueOnce({ type: routerMocks.failures.duplicated });
    queryRef.value = 'zeta';
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    routerMocks.replace.mockRejectedValueOnce(new Error('boom'));
    queryRef.value = 'eta';
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it('keeps MainNavigation search input in sync with the query parameter', async () => {
    vi.resetModules();
    const addNotification = vi.fn();
    vi.doMock('@/stores', () => ({
      useAppStore: () => ({
        addNotification,
        setPreferences: () => {},
        preferences: { theme: 'light' },
      }),
    }));
    vi.doMock('@/features/generation/stores', () => ({}));
    vi.doMock('@/features/generation/stores/form', () => ({}));
    vi.doMock('@/composables/shared/useTheme', () => ({
      useTheme: () => ({
        currentTheme: { value: 'light' },
        toggleTheme: () => {},
        setTheme: () => {},
      }),
    }));

    const { default: MainNavigation } = await import('@/components/layout/MainNavigation.vue');

    route.query.q = 'initial search';

    const wrapper = mount(MainNavigation, {
      global: {
        stubs: {
          NavigationIcon: true,
        },
      },
    });
    await nextTick();

    const searchInput = wrapper.get('#global-search');
    expect((searchInput.element as HTMLInputElement).value).toBe('initial search');

    route.query.q = 'gallery update';
    await nextTick();

    expect((searchInput.element as HTMLInputElement).value).toBe('gallery update');

    await searchInput.setValue('user typed query');
    await nextTick();
    await Promise.resolve();

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      path: '/loras',
      query: { q: 'user typed query' },
    });

    wrapper.unmount();
    vi.doUnmock('@/composables/shared/useTheme');
    vi.doUnmock('@/stores');
    vi.doUnmock('@/features/generation/stores');
    vi.doUnmock('@/features/generation/stores/form');
  });

  it('propagates query updates through LoraGallery filters', async () => {
    const createGalleryLora = (
      overrides: Partial<TestGalleryLora> & { id: string; name: string }
    ): TestGalleryLora => ({
      id: overrides.id,
      name: overrides.name,
      description: overrides.description ?? '',
      tags: overrides.tags ?? [],
      active: overrides.active ?? true,
      created_at: overrides.created_at ?? '2024-01-01T00:00:00.000Z',
      updated_at: overrides.updated_at ?? '2024-01-01T00:00:00.000Z',
      last_updated: overrides.last_updated ?? null,
    });

    const loraSource = ref<TestGalleryLora[]>([
      createGalleryLora({
        id: '1',
        name: 'Alpha Diffusion',
        description: 'Portrait specialist',
        tags: ['portrait'],
        active: true,
      }),
      createGalleryLora({
        id: '2',
        name: 'Gamma Burst',
        description: 'Synthwave magic',
        tags: ['sci-fi'],
        active: false,
        created_at: '2024-02-01T00:00:00.000Z',
        updated_at: '2024-02-01T00:00:00.000Z',
      }),
    ]);

    let filters!: ReturnType<typeof useLoraGalleryFilters>;

    const wrapper = mount({
      template: '<div />',
      setup() {
        filters = useLoraGalleryFilters(loraSource as unknown as Ref<any>);
        return {};
      },
    });

    await nextTick();
    expect(filters.searchTerm.value).toBe('');
    expect(filters.filteredLoras.value.map((lora: TestGalleryLora) => lora.id)).toEqual(['1', '2']);

    route.query.q = 'gamma';
    await nextTick();

    expect(filters.searchTerm.value).toBe('gamma');
    expect(filters.filteredLoras.value.map((lora: TestGalleryLora) => lora.id)).toEqual(['2']);

    filters.searchTerm.value = '';
    await nextTick();
    await Promise.resolve();

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(filters.filteredLoras.value.map((lora: TestGalleryLora) => lora.id)).toEqual(['1', '2']);

    wrapper.unmount();
  });
});
