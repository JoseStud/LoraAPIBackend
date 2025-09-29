import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive, type Ref } from 'vue';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  failures: { duplicated: 1 },
}));

const route = reactive({
  path: '/loras',
  query: reactive({}) as Record<string, unknown>,
});

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({
    push: routerMocks.push,
  }),
  isNavigationFailure: (error: unknown, failureType: number) =>
    typeof error === 'object' && error !== null && 'type' in (error as Record<string, unknown>)
      ? (error as { type?: number }).type === failureType
      : false,
  NavigationFailureType: routerMocks.failures,
}));

import { useSyncedQueryParam } from '@/composables/shared';

describe('useSyncedQueryParam', () => {
  beforeEach(() => {
    routerMocks.push.mockReset();
    routerMocks.push.mockResolvedValue(undefined);
    route.path = '/loras';
    Object.keys(route.query).forEach(key => {
      delete (route.query as Record<string, unknown>)[key];
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

  it('pushes router updates when the ref changes', async () => {
    const queryRef = withSetup();

    queryRef.value = 'epsilon';
    await nextTick();

    expect(routerMocks.push).toHaveBeenCalledTimes(1);
    expect(routerMocks.push).toHaveBeenCalledWith({
      path: '/loras',
      query: { q: 'epsilon' },
    });

    route.query.q = 'epsilon';
    await nextTick();

    queryRef.value = '';
    await nextTick();

    expect(routerMocks.push).toHaveBeenCalledTimes(2);
    expect(routerMocks.push).toHaveBeenLastCalledWith({
      path: '/loras',
      query: {},
    });
  });

  it('suppresses duplicate navigation errors while logging others', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const queryRef = withSetup();

    routerMocks.push.mockRejectedValueOnce({ type: routerMocks.failures.duplicated });
    queryRef.value = 'zeta';
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    routerMocks.push.mockRejectedValueOnce(new Error('boom'));
    queryRef.value = 'eta';
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
