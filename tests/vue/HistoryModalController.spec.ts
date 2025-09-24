import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { GenerationHistoryResult } from '../../app/frontend/src/types';

vi.mock('../../app/frontend/src/components/history/HistoryModalLauncher.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'HistoryModalLauncher',
      props: {
        visible: { type: Boolean, default: false },
        result: { type: Object as () => GenerationHistoryResult | null, default: null },
        formatDate: { type: Function, required: true },
      },
      emits: ['close', 'reuse', 'download', 'delete'],
      setup(props, { emit }) {
        return () =>
          h(
            'div',
            {
              class: 'launcher-stub',
              'data-visible': props.visible ? 'true' : 'false',
              onClick: () => emit('close'),
            },
            [],
          );
      },
    }),
  };
});

import HistoryModalController from '../../app/frontend/src/components/history/HistoryModalController.vue';

describe('HistoryModalController', () => {
  const createResult = (id: number): GenerationHistoryResult => ({
    id,
    prompt: `Prompt ${id}`,
    negative_prompt: null,
    image_url: `/image-${id}.png`,
    created_at: '2024-01-01T00:00:00Z',
    width: 512,
    height: 512,
    steps: 30,
    cfg_scale: 7,
    rating: 0,
    is_favorite: false,
  });

  const createWrapper = (props: Partial<InstanceType<typeof HistoryModalController>['$props']> = {}) =>
    mount(HistoryModalController, {
      props: {
        modalVisible: true,
        activeResult: createResult(1),
        toastVisible: false,
        toastMessage: '',
        toastType: 'success',
        formatDate: (value: string) => value,
        ...props,
      },
    });

  it('passes modal state to the launcher and toast components', () => {
    const wrapper = createWrapper({
      toastVisible: true,
      toastMessage: 'Saved!',
      toastType: 'info',
    });

    const launcher = wrapper.findComponent({ name: 'HistoryModalLauncher' });
    expect(launcher.exists()).toBe(true);
    expect(launcher.props('visible')).toBe(true);
    expect(launcher.props('result')).toEqual(createResult(1));

    const toast = wrapper.findComponent({ name: 'HistoryToast' });
    expect(toast.exists()).toBe(true);
    expect(toast.props()).toMatchObject({
      visible: true,
      message: 'Saved!',
      type: 'info',
    });
  });

  it('re-emits launcher interactions for container coordination', () => {
    const wrapper = createWrapper();
    const result = createResult(5);

    const launcher = wrapper.findComponent({ name: 'HistoryModalLauncher' });
    launcher.vm.$emit('close');
    launcher.vm.$emit('reuse', result);
    launcher.vm.$emit('download', result);
    launcher.vm.$emit('delete', result.id);

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('reuse')?.[0]).toEqual([result]);
    expect(wrapper.emitted('download')?.[0]).toEqual([result]);
    expect(wrapper.emitted('delete')?.[0]).toEqual([result.id]);
  });
});
