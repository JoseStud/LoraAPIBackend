import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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

  it('exposes modal control methods and forwards actions', async () => {
    const reuseMock = vi.fn();
    const downloadMock = vi.fn();
    const deleteMock = vi.fn().mockResolvedValue(true);

    const wrapper = mount(HistoryModalController, {
      props: {
        formatDate: (value: string) => value,
        onReuse: reuseMock,
        onDownload: downloadMock,
        onDelete: deleteMock,
      },
    });

    const result = createResult(1);
    const controller = wrapper.vm.$.exposed as {
      openModal: (value: GenerationHistoryResult) => void;
      showToast: (message: string, type?: string) => void;
      isModalOpen: { value: boolean };
    };

    expect(controller.isModalOpen.value).toBe(false);

    controller.openModal(result);
    await nextTick();

    const launcher = wrapper.findComponent({ name: 'HistoryModalLauncher' });
    expect(launcher.exists()).toBe(true);
    expect(launcher.props('visible')).toBe(true);
    expect(controller.isModalOpen.value).toBe(true);

    launcher.vm.$emit('reuse', result);
    await nextTick();

    expect(reuseMock).toHaveBeenCalledWith(result);
    expect(controller.isModalOpen.value).toBe(false);

    controller.showToast('Hello world', 'info');
    await nextTick();

    const toast = wrapper.findComponent({ name: 'HistoryToast' });
    expect(toast.props('message')).toBe('Hello world');
    expect(toast.props('type')).toBe('info');
  });

  it('only closes the modal after a successful delete action', async () => {
    const deleteMock = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const wrapper = mount(HistoryModalController, {
      props: {
        formatDate: (value: string) => value,
        onReuse: vi.fn(),
        onDownload: vi.fn(),
        onDelete: deleteMock,
      },
    });

    const result = createResult(2);
    const controller = wrapper.vm.$.exposed as {
      openModal: (value: GenerationHistoryResult) => void;
      isModalOpen: { value: boolean };
    };

    controller.openModal(result);
    await nextTick();

    const launcher = wrapper.findComponent({ name: 'HistoryModalLauncher' });

    launcher.vm.$emit('delete', result.id);
    await Promise.resolve();
    await nextTick();

    expect(deleteMock).toHaveBeenNthCalledWith(1, result.id);
    expect(controller.isModalOpen.value).toBe(true);

    launcher.vm.$emit('delete', result.id);
    await Promise.resolve();
    await nextTick();

    expect(deleteMock).toHaveBeenNthCalledWith(2, result.id);
    await vi.waitFor(() => {
      expect(controller.isModalOpen.value).toBe(false);
    });
  });
});
