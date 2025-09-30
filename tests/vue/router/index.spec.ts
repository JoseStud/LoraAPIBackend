import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const importRouter = () => import('@/router');

const resetLocation = () => {
  window.history.replaceState({}, '', '/');
};

describe('app router base url handling', () => {
  beforeEach(() => {
    vi.resetModules();
    resetLocation();
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetLocation();
  });

  it('uses BASE_URL from the Vite environment when provided', async () => {
    vi.stubEnv('BASE_URL', '/demo/app/');

    const { default: router } = await importRouter();

    expect(router.options.history.base).toBe('/demo/app');
  });

  it('prefixes navigations with the configured base path', async () => {
    vi.stubEnv('BASE_URL', '/demo/app/');

    const { default: router } = await importRouter();

    await router.push('/loras');

    expect(window.location.pathname).toBe('/demo/app/loras');
    expect(router.currentRoute.value.fullPath).toBe('/loras');
  });

  it('resolves deep links that include the base path', async () => {
    vi.stubEnv('BASE_URL', '/demo/app/');
    window.history.replaceState({}, '', '/demo/app/generate');

    const { default: router } = await importRouter();

    expect(router.options.history.location).toBe('/generate');

    await router.push('/generate');

    expect(router.currentRoute.value.name).toBe('generate');
    expect(router.currentRoute.value.fullPath).toBe('/generate');
    expect(window.location.pathname).toBe('/demo/app/generate');
  });
});
