import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import HistoryGrid from '../../app/frontend/src/components/HistoryGrid.vue';
import HistoryGridItem from '../../app/frontend/src/components/HistoryGridItem.vue';
import HistoryList from '../../app/frontend/src/components/HistoryList.vue';

const createResults = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    prompt: `Prompt ${index + 1}`,
    negative_prompt: null,
    image_url: `/image-${index + 1}.png`,
    thumbnail_url: `/thumb-${index + 1}.png`,
    created_at: '2024-01-01T00:00:00Z',
    width: 512,
    height: 512,
    steps: 20,
    cfg_scale: 7,
    seed: index,
    rating: 0,
    is_favorite: false,
  }));

describe('History virtualization components', () => {
  const originalResizeObserver = global.ResizeObserver;
  const originalIntersectionObserver = global.IntersectionObserver;

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    // @ts-expect-error jsdom environment mock
    global.ResizeObserver = ResizeObserverMock;

    class IntersectionObserverMock {
      constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    // @ts-expect-error jsdom environment mock
    global.IntersectionObserver = IntersectionObserverMock;
  });

  afterAll(() => {
    global.ResizeObserver = originalResizeObserver;
    global.IntersectionObserver = originalIntersectionObserver;
  });

  it('renders only the visible subset of list items for large datasets', async () => {
    const results = createResults(1000);
    const wrapper = mount(HistoryList, {
      props: {
        results,
        selectedSet: new Set<number>(),
        formatDate: (value: string) => value,
        estimateSize: 120,
        buffer: 240,
      },
    });

    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const renderedRows = wrapper.findAll('[data-test="history-list-row"]');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(results.length / 2);

    wrapper.unmount();
  });

  it('renders only the visible subset of grid items for large datasets', async () => {
    const results = createResults(1000);
    const wrapper = mount(HistoryGrid, {
      props: {
        results,
        selectedSet: new Set<number>(),
        formatDate: (value: string) => value,
        rowHeight: 260,
        minItemSize: 220,
        buffer: 240,
      },
    });

    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const renderedItems = wrapper.findAllComponents(HistoryGridItem);
    expect(renderedItems.length).toBeGreaterThan(0);
    expect(renderedItems.length).toBeLessThan(results.length / 2);

    wrapper.unmount();
  });
});
