import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import LoraDetail from '@/features/lora/components/lora-detail/LoraDetail.vue';
import { ApiError } from '@/types';
import { createAdapterFixture } from '../fixtures/adapters';

const service = vi.hoisted(() => ({ fetchById: vi.fn(), toggle: vi.fn() }));

vi.mock('@/features/lora/services/lora/loraService', async () => {
  const actual = await vi.importActual('@/features/lora/services/lora/loraService');
  return {
    ...actual,
    fetchAdapterById: service.fetchById,
    toggleLoraActiveState: service.toggle,
  };
});

vi.mock('@/utils/promptClipboard', () => ({
  copyPromptToClipboard: vi.fn().mockResolvedValue(true),
}));

const router = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn((to: string) => ({ href: to })),
}));

vi.mock('vue-router', () => ({ useRouter: () => router }));

const mountDetail = (loraId = 'g1') => mount(LoraDetail, { props: { loraId } });

const gojo = createAdapterFixture({
  id: 'g1',
  name: 'Satoru Gojo',
  active: false,
  description: '<p>Strongest sorcerer.</p>',
  tags: [
    'archetype:Cool-Sharp-Rival',
    'series:Jujutsu Kaisen',
    'hair-color:white/silver',
    'outfit:school uniform',
    'color:black',
    'color:white',
    'anime',
    'gojo satoru',
    'blindfold',
  ],
  trained_words: ['gojo_satoru', 'blindfold'],
  triggers: [],
  extra: { archetype_axes: { hair: 'white spiky', build: 'very tall' } },
  primary_file_name: 'Gojo.safetensors',
  primary_file_size_kb: 223108,
  primary_file_sha256: 'ABC123',
  civitai_model_id: 1,
  civitai_version_id: 1407438,
});

describe('LoraDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '');
  });

  it('shows the full library record', async () => {
    service.fetchById.mockResolvedValue(gojo);
    const wrapper = mountDetail();
    await flushPromises();

    expect(service.fetchById).toHaveBeenCalledWith('g1', expect.anything());
    expect(wrapper.find('h1').text()).toBe('Satoru Gojo');
    expect(wrapper.text()).toContain('Cool Sharp Rival');
    expect(wrapper.text()).toContain('Jujutsu Kaisen');
    expect(wrapper.findAll('[data-testid="lora-detail-triggers"] li')).toHaveLength(2);
    const facets = wrapper.find('[data-testid="lora-detail-facets"]').text();
    expect(facets).toContain('Hair colour');
    expect(facets).toContain('white/silver');
    expect(facets).toContain('school uniform');
    expect(wrapper.find('[data-testid="lora-detail-traits"]').text()).toContain('very tall');
    // generic and name-only tags are hidden; descriptive ones stay
    expect(wrapper.text()).toContain('blindfold');
    expect(wrapper.text()).not.toMatch(/\banime\b/);
    expect(wrapper.text()).not.toContain('gojo satoru');
    expect(wrapper.find('[data-testid="lora-detail-description"]').text()).toBe('Strongest sorcerer.');
    expect(wrapper.text()).toContain('ABC123');
    expect(wrapper.find('[data-testid="lora-detail-civitai"]').attributes('href')).toBe(
      'https://civitai.com/models/1?modelVersionId=1407438',
    );
  });

  it('toggles the active state', async () => {
    service.fetchById.mockResolvedValue(gojo);
    service.toggle.mockResolvedValue({ ...gojo, active: true });
    const wrapper = mountDetail();
    await flushPromises();

    await wrapper.find('button.btn').trigger('click');
    await flushPromises();

    expect(service.toggle).toHaveBeenCalledWith('g1', true, expect.anything());
    expect(wrapper.find('button.btn').text()).toBe('Deactivate');
  });

  it('explains a missing LoRA', async () => {
    service.fetchById.mockRejectedValue(
      new ApiError({ message: 'not found', status: 404, meta: { ok: false, status: 404 } as never }),
    );
    const wrapper = mountDetail('missing');
    await flushPromises();

    expect(wrapper.find('[data-testid="lora-detail-error"]').text()).toContain('not found');
  });

  it('goes back to the filtered gallery it came from', async () => {
    service.fetchById.mockResolvedValue(gojo);
    window.history.replaceState({ back: '/loras?q=gojo&build=tall' }, '');
    const wrapper = mountDetail();
    await flushPromises();

    const back = wrapper.find('[data-testid="lora-detail-back"]');
    expect(back.attributes('href')).toBe('/loras?q=gojo&build=tall');
    await back.trigger('click');

    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the gallery when the page was reached some other way', async () => {
    service.fetchById.mockResolvedValue(gojo);
    window.history.replaceState({ back: '/history' }, '');
    const wrapper = mountDetail();
    await flushPromises();

    const back = wrapper.find('[data-testid="lora-detail-back"]');
    expect(back.attributes('href')).toBe('/loras');
    await back.trigger('click');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/loras');
  });
});
