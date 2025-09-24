import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import HistoryGridItem from '../../app/frontend/src/components/history/HistoryGridItem.vue';
import HistoryListItem from '../../app/frontend/src/components/history/HistoryListItem.vue';
import HistoryModalLauncher from '../../app/frontend/src/components/history/HistoryModalLauncher.vue';
import { formatHistoryDate } from '../../app/frontend/src/utils/format';
import type { GenerationHistoryResult } from '../../app/frontend/src/types';

describe('formatHistoryDate', () => {
  const baseDate = new Date('2024-05-10T12:00:00Z');

  it('returns "Today" for dates on the same day', () => {
    expect(formatHistoryDate('2024-05-10T00:00:00Z', baseDate)).toBe('Today');
  });

  it('returns "Today" for dates within the last 24 hours', () => {
    expect(formatHistoryDate('2024-05-09T12:01:00Z', baseDate)).toBe('Today');
  });

  it('returns "Yesterday" for dates at least one day old but less than two days', () => {
    expect(formatHistoryDate('2024-05-09T11:59:00Z', baseDate)).toBe('Yesterday');
  });

  it('returns relative copy for multi-day ranges within a week', () => {
    expect(formatHistoryDate('2024-05-08T12:00:00Z', baseDate)).toBe('2 days ago');
    expect(formatHistoryDate('2024-05-03T12:00:00Z', baseDate)).toBe('7 days ago');
  });

  it('falls back to locale date strings beyond one week', () => {
    const expected = new Date('2024-05-02T12:00:00Z').toLocaleDateString();
    expect(formatHistoryDate('2024-05-02T12:00:00Z', baseDate)).toBe(expected);
  });

  it('returns an empty string for invalid input', () => {
    expect(formatHistoryDate('invalid-date', baseDate)).toBe('');
  });
});

describe('History components consuming formatted history dates', () => {
  const createResult = (overrides: Partial<GenerationHistoryResult> = {}): GenerationHistoryResult => ({
    id: 1,
    prompt: 'Prompt',
    negative_prompt: null,
    image_url: 'https://example.com/image.png',
    thumbnail_url: 'https://example.com/thumb.png',
    created_at: '2024-05-10T12:00:00Z',
    width: 512,
    height: 512,
    steps: 20,
    cfg_scale: 7,
    rating: 0,
    is_favorite: false,
    ...overrides,
  });

  const referenceDate = new Date('2024-05-12T12:00:00Z');

  it('displays the formatted label in HistoryGridItem', () => {
    const result = createResult();
    const formatted = formatHistoryDate(result.created_at, referenceDate);
    const wrapper = mount(HistoryGridItem, {
      props: {
        result,
        isSelected: false,
        formattedDate: formatted,
      },
    });

    expect(wrapper.text()).toContain(formatted);
  });

  it('displays the formatted label in HistoryListItem', () => {
    const result = createResult();
    const formatted = formatHistoryDate(result.created_at, referenceDate);
    const wrapper = mount(HistoryListItem, {
      props: {
        result,
        isSelected: false,
        formattedDate: formatted,
      },
    });

    expect(wrapper.text()).toContain(formatted);
  });

  it('passes the formatted label through HistoryModalLauncher', () => {
    const result = createResult();
    const formatted = formatHistoryDate(result.created_at, referenceDate);
    const formatDateMock = vi.fn().mockReturnValue(formatted);
    const wrapper = mount(HistoryModalLauncher, {
      props: {
        visible: true,
        result,
        formatDate: formatDateMock,
      },
      global: {
        stubs: {
          HistoryModal: {
            props: ['visible', 'result', 'formattedDate'],
            template: '<div data-test="modal">{{ formattedDate }}</div>',
          },
        },
      },
    });

    expect(formatDateMock).toHaveBeenCalledWith(result.created_at);
    expect(wrapper.find('[data-test="modal"]').text()).toBe(formatted);
  });
});
