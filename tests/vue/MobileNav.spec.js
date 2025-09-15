import { mount } from '@vue/test-utils';
import MobileNav from '../../app/frontend/static/vue/MobileNav.vue';

describe('MobileNav.vue', () => {
  it('toggles menu open/close via button and overlay', async () => {
    const wrapper = mount(MobileNav);

    const toggle = wrapper.find('button.mobile-nav-toggle');
    expect(toggle.exists()).toBe(true);

    const nav = () => wrapper.find('nav.mobile-nav-menu');
    expect(nav().classes()).toContain('closed');

    // Open
    await toggle.trigger('click');
    expect(nav().classes()).toContain('open');
    expect(nav().attributes('aria-hidden')).toBe('false');

    // Close via overlay
    const overlay = wrapper.find('div.mobile-nav-overlay');
    expect(overlay.exists()).toBe(true);
    await overlay.trigger('click');
    expect(nav().classes()).toContain('closed');
  });
});

