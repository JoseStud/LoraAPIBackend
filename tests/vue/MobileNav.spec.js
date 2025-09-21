import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MobileNav from '../../app/frontend/src/components/MobileNav.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('MobileNav.vue', () => {
  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    // Minimal location stub for isActive()
    // eslint-disable-next-line no-global-assign
    delete window.location;
    // Provide only what component needs
    // @ts-ignore
    window.location = { pathname: '/recommendations' };
  });

  afterEach(() => {
    // Restore original window.location
    // eslint-disable-next-line no-global-assign
    window.location = originalLocation;
  });

  it('toggles menu open/closed and overlay visibility', async () => {
    const wrapper = mount(MobileNav);

    const toggleBtn = wrapper.find('.mobile-nav-toggle');
    const menu = wrapper.find('#mobile-navigation');
    const overlay = wrapper.find('.mobile-nav-overlay');

    expect(toggleBtn.exists()).toBe(true);
    expect(menu.exists()).toBe(true);
    expect(overlay.exists()).toBe(true);

    // Initial state: closed
    expect(menu.classes()).toContain('closed');
    expect(overlay.element.style.display).toBe('none');

    // Open
    await toggleBtn.trigger('click');
    await flush();
    expect(menu.classes()).toContain('open');
    expect(overlay.element.style.display).not.toBe('none');

    // Close by clicking overlay
    await overlay.trigger('click');
    await flush();
    expect(menu.classes()).toContain('closed');
    expect(overlay.element.style.display).toBe('none');

    wrapper.unmount();
  });

  it('closes the menu on Escape key', async () => {
    const wrapper = mount(MobileNav);

    // Open
    await wrapper.find('.mobile-nav-toggle').trigger('click');
    await flush();
    expect(wrapper.find('#mobile-navigation').classes()).toContain('open');

    // Send Escape
    const evt = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(evt);
    await flush();
    expect(wrapper.find('#mobile-navigation').classes()).toContain('closed');

    wrapper.unmount();
  });

  it('marks the current route link as active based on pathname', async () => {
    const wrapper = mount(MobileNav);
    await flush();

    // Link with href=/recommendations should be active per stubbed pathname
    const active = wrapper.find('a.mobile-nav-link.active');
    expect(active.exists()).toBe(true);
    expect(active.attributes('href')).toBe('/recommendations');

    wrapper.unmount();
  });
});

