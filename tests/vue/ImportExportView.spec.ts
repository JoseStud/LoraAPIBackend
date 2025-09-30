import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, onMounted } from 'vue';

vi.mock('@/components/import-export/ImportExportContainer.vue', () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const component = defineComponent({
        name: 'MockImportExportContainer',
        emits: ['initialized'],
        setup(_, { emit }) {
          onMounted(() => {
            emit('initialized');
          });

          return () =>
            h(
              'div',
              {
                'data-testid': 'import-export-interface'
              },
              'Import Export Ready'
            );
        }
      });

      resolve({
        __esModule: true,
        __isTeleport: false,
        default: component
      });
    }, 50);
  });
});

vi.mock('@/components/import-export/ImportExport.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'StubImportExport',
    setup: () => () => h('div', { 'data-testid': 'stub-import-export' })
  })
}));

const stubComponent = (name: string, testId: string) =>
  defineComponent({
    name,
    setup(_, { slots }) {
      return () => h('div', { 'data-testid': testId }, slots.default?.());
    }
  });

const notificationMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  showToast: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
  showToastWarning: vi.fn(),
  showToastInfo: vi.fn(),
}));

const importExportContextMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/composables/shared', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useNotifications: () => ({
      notifications: { value: [] },
      addNotification: vi.fn(),
      notify: notificationMocks.notify,
      removeNotification: vi.fn(),
      clearAll: vi.fn(),
      showSuccess: notificationMocks.showSuccess,
      showError: notificationMocks.showError,
      showWarning: notificationMocks.showWarning,
      showInfo: notificationMocks.showInfo,
      toastVisible: { value: false },
      toastMessage: { value: '' },
      toastType: { value: 'info' },
      toastDuration: { value: 0 },
      showToast: notificationMocks.showToast,
      showToastSuccess: notificationMocks.showToastSuccess,
      showToastError: notificationMocks.showToastError,
      showToastWarning: notificationMocks.showToastWarning,
      showToastInfo: notificationMocks.showToastInfo,
      hideToast: vi.fn(),
      clearToastTimer: vi.fn()
    })
  };
});

vi.mock('@/composables/import-export', async (importOriginal) => {
  const actual = await importOriginal();

  const context = {
    initialize: importExportContextMocks.initialize
  };

  return {
    ...actual,
    provideImportExportContext: () => context,
    useImportExportContext: () => context
  };
});

import ImportExportView from '../../app/frontend/src/views/ImportExportView.vue';

describe('ImportExportView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a skeleton until the lazy import resolves and panels hydrate', async () => {
    const wrapper = mount(ImportExportView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          PageHeader: stubComponent('PageHeader', 'page-header-stub'),
          JobQueue: stubComponent('JobQueue', 'job-queue-panel'),
          SystemStatusPanel: stubComponent('SystemStatusPanel', 'system-status-panel')
        }
      }
    });

    expect(wrapper.find('[data-testid="import-export-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="job-queue-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="system-status-panel"]').exists()).toBe(false);

    await vi.runAllTimersAsync();
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-testid="import-export-loading"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="import-export-interface"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="job-queue-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="system-status-panel"]').exists()).toBe(true);
  });
});

describe('ImportExportContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importExportContextMocks.initialize.mockResolvedValue(undefined);
  });

  it('surfaces initialization failures through notifications', async () => {
    const { default: ImportExportContainer } = await vi.importActual<
      typeof import('../../app/frontend/src/components/import-export/ImportExportContainer.vue')
    >('../../app/frontend/src/components/import-export/ImportExportContainer.vue');

    importExportContextMocks.initialize.mockRejectedValueOnce(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    expect(importExportContextMocks.initialize).toHaveBeenCalledTimes(1);
    expect(notificationMocks.showError).toHaveBeenCalledWith(
      'Failed to initialize the import/export interface: boom',
      8000,
    );
    expect(wrapper.emitted('initialized')).toBeUndefined();

    consoleError.mockRestore();
    wrapper.unmount();
  });
});
