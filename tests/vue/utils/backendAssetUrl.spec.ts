import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import HistoryRecentResultCard from '@/features/history/components/HistoryRecentResultCard.vue';
import {
  resetBackendEnvironment,
  setBackendEnvironmentOverrides,
} from '@/services/backendEnvironment';
import { resolveBackendAssetUrl } from '@/utils/backend';

const ROUTE = '/api/v1/generation/results/job-1/images/0';
const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

describe('resolveBackendAssetUrl', () => {
  afterEach(() => {
    resetBackendEnvironment();
  });

  it('keeps API paths on the default same-origin backend', () => {
    expect(resolveBackendAssetUrl(ROUTE)).toBe(ROUTE);
  });

  it('re-roots API paths on a configured backend URL', () => {
    setBackendEnvironmentOverrides({ backendUrl: 'http://gpu-box:8000/api/v1' });
    expect(resolveBackendAssetUrl(ROUTE)).toBe(
      'http://gpu-box:8000/api/v1/generation/results/job-1/images/0',
    );
  });

  it('re-roots API paths on a backend mounted under another prefix', () => {
    expect(resolveBackendAssetUrl(ROUTE, 'http://gpu-box:8000/v1')).toBe(
      'http://gpu-box:8000/v1/generation/results/job-1/images/0',
    );
    expect(resolveBackendAssetUrl(ROUTE, '/backend/api/v1')).toBe(
      '/backend/api/v1/generation/results/job-1/images/0',
    );
  });

  it('resolves other root-relative paths against the backend origin', () => {
    expect(resolveBackendAssetUrl('/static/a.png', 'http://gpu-box:8000/api/v1')).toBe(
      'http://gpu-box:8000/static/a.png',
    );
  });

  it('passes data URIs and absolute URLs through', () => {
    setBackendEnvironmentOverrides({ backendUrl: 'http://gpu-box:8000/api/v1' });
    expect(resolveBackendAssetUrl(DATA_URI)).toBe(DATA_URI);
    expect(resolveBackendAssetUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
    expect(resolveBackendAssetUrl('blob:http://x/1')).toBe('blob:http://x/1');
  });

  it('returns null for empty values', () => {
    expect(resolveBackendAssetUrl(null)).toBeNull();
    expect(resolveBackendAssetUrl(undefined)).toBeNull();
    expect(resolveBackendAssetUrl('  ')).toBeNull();
  });
});

describe('result image rendering', () => {
  afterEach(() => {
    resetBackendEnvironment();
  });

  it('loads result images from the configured backend', () => {
    setBackendEnvironmentOverrides({ backendUrl: 'http://gpu-box:8000/api/v1' });
    const wrapper = mount(HistoryRecentResultCard, {
      props: {
        result: { id: 'job-1', prompt: 'p', image_url: ROUTE, created_at: '2024-01-01' },
      },
    });

    expect(wrapper.get('img').attributes('src')).toBe(
      'http://gpu-box:8000/api/v1/generation/results/job-1/images/0',
    );
  });
});
