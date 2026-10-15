import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import LoraCard from '@/features/lora/components/lora-gallery/LoraCard.vue';
import { createAdapterFixture } from '../fixtures/adapters';

const clipboard = vi.hoisted(() => ({ copy: vi.fn() }));
const notify = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const router = vi.hoisted(() => ({ push: vi.fn(), resolve: vi.fn() }));

vi.mock('vue-router', () => ({
  useRouter: () => router,
}));

vi.mock('@/utils/promptClipboard', () => ({
  copyPromptToClipboard: clipboard.copy,
}));

vi.mock('@/composables/shared/useNotifications', () => ({
  useNotifications: () => notify,
}));

const killua = createAdapterFixture({
  id: 'k1',
  name: 'Killua Zoldyck',
  description: '<p>White-haired <b>assassin</b> &amp; rival.</p><script>bad()</script>',
  tags: ['anime', 'archetype:Cool-Sharp-Rival', 'series:Hunter x Hunter', 'hair:white spiky'],
  trained_words: ['killua_zoldyck', 'white hair'],
  triggers: [],
  preview_image_url: 'https://image.civitai.com/killua.jpeg',
});

describe('LoraCard library metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clipboard.copy.mockResolvedValue(true);
    router.push.mockResolvedValue(undefined);
  });

  it('shows archetype, series, clean description, triggers and the preview', () => {
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode: 'grid' } });

    const library = wrapper.find('[data-testid="lora-card-library"]');
    expect(library.text()).toContain('Cool Sharp Rival');
    expect(library.text()).toContain('Hunter x Hunter');
    expect(wrapper.find('.lora-card-description').text()).toBe('White-haired assassin & rival.');
    expect(wrapper.find('[data-testid="lora-card-triggers"]').text()).toContain(
      'killua_zoldyck, white hair',
    );
    expect(wrapper.find('img.lora-card-preview-image').attributes('src')).toBe(
      'https://image.civitai.com/killua.jpeg',
    );
    // raw and metadata tags stay off the card
    expect(wrapper.text()).not.toContain('archetype:');
    expect(wrapper.text()).not.toContain('hair:');
  });

  it('copies the trigger words', async () => {
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode: 'grid' } });

    await wrapper.find('button[aria-label="Copy trigger words"]').trigger('click');
    await flushPromises();

    expect(clipboard.copy).toHaveBeenCalledWith('killua_zoldyck, white hair');
    expect(notify.showSuccess).toHaveBeenCalled();
  });

  it('reports a failed copy', async () => {
    clipboard.copy.mockResolvedValue(false);
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode: 'list' } });

    expect(wrapper.find('[data-testid="lora-card-archetype"]').text()).toBe('Cool Sharp Rival');
    await wrapper.find('button[aria-label="Copy trigger words"]').trigger('click');
    await flushPromises();

    expect(notify.showError).toHaveBeenCalled();
  });

  it('hides the trigger row when a LoRA has none', () => {
    const wrapper = mount(LoraCard, {
      props: { lora: { ...killua, trained_words: [], activation_text: null }, viewMode: 'grid' },
    });

    expect(wrapper.find('[data-testid="lora-card-triggers"]').exists()).toBe(false);
  });

  it.each(['grid', 'list'] as const)('opens the detail page in-app from the %s title', async (viewMode) => {
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode } });
    const link = wrapper.find('[data-testid="lora-card-title-link"]');

    expect(link.attributes('href')).toBe('/loras/k1');
    const click = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true });
    link.element.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/loras/k1');
  });

  it('leaves modified clicks to the browser (open in new tab)', () => {
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode: 'grid' } });

    let leftToBrowser = false;
    // Record what the card did, then stop jsdom attempting a real navigation.
    wrapper.element.addEventListener('click', (event) => {
      leftToBrowser = !event.defaultPrevented;
      event.preventDefault();
    });
    const click = new MouseEvent('click', { button: 0, ctrlKey: true, bubbles: true, cancelable: true });
    wrapper.find('[data-testid="lora-card-preview-link"]').element.dispatchEvent(click);

    expect(leftToBrowser).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens details from the preview, but not in bulk mode', async () => {
    const wrapper = mount(LoraCard, { props: { lora: killua, viewMode: 'grid' } });
    const preview = wrapper.find('[data-testid="lora-card-preview-link"]');
    expect(preview.element.tagName).toBe('A');
    await preview.trigger('click');
    expect(router.push).toHaveBeenCalledWith('/loras/k1');

    router.push.mockClear();
    await wrapper.setProps({ bulkMode: true });
    const bulkPreview = wrapper.find('[data-testid="lora-card-preview-link"]');
    expect(bulkPreview.element.tagName).toBe('DIV');
    await bulkPreview.trigger('click');
    expect(router.push).not.toHaveBeenCalled();
  });
});
