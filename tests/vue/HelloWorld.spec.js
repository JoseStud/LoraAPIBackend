import { mount } from '@vue/test-utils';
import HelloWorld from '../../app/frontend/static/vue/HelloWorld.vue';

describe('HelloWorld.vue', () => {
  it('renders greeting and message', () => {
    const wrapper = mount(HelloWorld);
    expect(wrapper.text()).toContain('Hello from Vue!');
    expect(wrapper.text()).toContain('This is our first Vue island.');
  });
});

