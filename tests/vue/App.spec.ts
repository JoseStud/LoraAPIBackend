import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import App from '../../app/frontend/src/App.vue';
import { useSettingsStore } from '../../app/frontend/src/stores/settings';

let pinia: ReturnType<typeof createPinia>;

const createWrapper = () =>
  mount(App, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterView: { template: '<div><slot /></div>' },
        AppMainLayout: {
          template: '<div class="app-main-layout"><slot /></div>',
        },
        MobileNav: { template: '<nav />' },
        MainNavigation: { template: '<nav />' },
        AppFooter: { template: '<footer />' },
        Notifications: { template: '<div />' },
        DialogRenderer: { template: '<div />' },
      },
    },
  });

describe('App.vue', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const settingsStore = useSettingsStore();
    settingsStore.reset();
  });

  it('shows a loading banner while settings hydrate', async () => {
    const wrapper = createWrapper();
    const settingsStore = useSettingsStore();

    settingsStore.$patch({ isLoading: true, isLoaded: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settings-loading-banner').exists()).toBe(true);

    settingsStore.$patch({ isLoading: false });
    settingsStore.setSettings({ backendUrl: '/api/v1' });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settings-loading-banner').exists()).toBe(false);
  });
});
