import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Notifications from '../../app/frontend/static/vue/Notifications.vue';

describe('Notifications.vue', () => {
  it('renders empty notifications container initially', async () => {
    const wrapper = mount(Notifications);
    await nextTick();

    expect(wrapper.find('.fixed.top-4.right-4').exists()).toBe(true);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    
    wrapper.unmount();
  });

  it('displays notifications when added', async () => {
    const wrapper = mount(Notifications);
    await nextTick();

    // Add a notification directly using the component's exposed method
    wrapper.vm.addNotification('Test message', 'success');
    await nextTick();

    const notifications = wrapper.findAll('[role="alert"]');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].text()).toContain('Test message');
    expect(notifications[0].text()).toContain('✅');
    
    wrapper.unmount();
  });

  it('applies correct classes for different notification types', async () => {
    const wrapper = mount(Notifications);
    await nextTick();

    wrapper.vm.addNotification('Success message', 'success');
    wrapper.vm.addNotification('Error message', 'error');
    await nextTick();

    const notifications = wrapper.findAll('[role="alert"]');
    expect(notifications).toHaveLength(2);
    
    expect(notifications[0].classes()).toContain('bg-green-50');
    expect(notifications[1].classes()).toContain('bg-red-50');
    
    wrapper.unmount();
  });

  it('dismisses notifications when close button is clicked', async () => {
    const wrapper = mount(Notifications);
    await nextTick();

    wrapper.vm.addNotification('Test message', 'info');
    await nextTick();

    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1);

    const dismissButton = wrapper.find('button');
    await dismissButton.trigger('click');
    await nextTick();

    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    
    wrapper.unmount();
  });

  it('provides proper accessibility attributes', async () => {
    const wrapper = mount(Notifications);
    await nextTick();

    wrapper.vm.addNotification('Accessible message', 'warning');
    await nextTick();

    const notification = wrapper.find('[role="alert"]');
    expect(notification.exists()).toBe(true);
    expect(notification.attributes('aria-label')).toContain('warning notification: Accessible message');

    const dismissButton = wrapper.find('button');
    expect(dismissButton.attributes('aria-label')).toContain('Dismiss warning notification');
    expect(dismissButton.attributes('type')).toBe('button');

    const liveRegion = wrapper.find('[aria-live="polite"]');
    expect(liveRegion.exists()).toBe(true);
    expect(liveRegion.attributes('aria-atomic')).toBe('true');
    
    wrapper.unmount();
  });
});