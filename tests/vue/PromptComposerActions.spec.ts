import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import PromptComposerActions from '../../app/frontend/src/components/compose/PromptComposerActions.vue';

describe('PromptComposerActions', () => {
  const factory = (overrides = {}) =>
    mount(PromptComposerActions, {
      props: {
        basePrompt: '',
        negativePrompt: '',
        finalPrompt: 'Full prompt',
        basePromptError: '',
        isGenerating: false,
        canSave: true,
        canGenerate: true,
        ...overrides,
      },
    });

  it('emits updates for prompts', async () => {
    const wrapper = factory();
    await wrapper.find('[data-testid="base-prompt"]').setValue('New base');
    await wrapper.find('[data-testid="negative-prompt"]').setValue('bad');

    expect(wrapper.emitted('update:basePrompt')?.[0]).toEqual(['New base']);
    expect(wrapper.emitted('update:negativePrompt')?.[0]).toEqual(['bad']);
  });

  it('emits actions when buttons clicked', async () => {
    const wrapper = factory();

    await wrapper.find('[data-testid="copy-prompt"]').trigger('click');
    await wrapper.find('[data-testid="save-composition"]').trigger('click');
    await wrapper.find('[data-testid="generate-image"]').trigger('click');

    expect(wrapper.emitted('copy')).toBeTruthy();
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('generate')).toBeTruthy();
  });

  it('disables buttons according to state', () => {
    const wrapper = factory({ canSave: false, canGenerate: false, isGenerating: true });
    expect(wrapper.find('[data-testid="save-composition"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="generate-image"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Generating…');
  });
});

