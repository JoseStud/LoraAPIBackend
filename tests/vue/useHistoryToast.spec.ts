import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { useHistoryToast } from '../../app/frontend/src/composables/history/useHistoryToast';

describe('useHistoryToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('shows toast message and hides after the configured duration', () => {
    const toast = useHistoryToast({ duration: 1000 });

    toast.showToastMessage('hello world', 'info');

    expect(toast.toastVisible.value).toBe(true);
    expect(toast.toastMessage.value).toBe('hello world');
    expect(toast.toastType.value).toBe('info');

    vi.advanceTimersByTime(1000);

    expect(toast.toastVisible.value).toBe(false);
  });

  it('resets the timer when a new toast is shown', () => {
    const toast = useHistoryToast({ duration: 1000 });

    toast.showToastMessage('first', 'success');
    vi.advanceTimersByTime(700);

    toast.showToastMessage('second', 'error');
    expect(toast.toastMessage.value).toBe('second');
    expect(toast.toastType.value).toBe('error');

    vi.advanceTimersByTime(900);
    expect(toast.toastVisible.value).toBe(true);

    vi.advanceTimersByTime(100);
    expect(toast.toastVisible.value).toBe(false);
  });
});
