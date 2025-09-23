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

const stubComponent = (name: string, testId: string) =>
  defineComponent({
    name,
    setup(_, { slots }) {
      return () => h('div', { 'data-testid': testId }, slots.default?.());
    }
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
