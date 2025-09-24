import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useToast } from '../../app/frontend/src/composables/shared/useToast';

describe('useToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('shows toast message and hides after the configured duration', () => {
    const toast = useToast();

    toast.showToast('hello world', 'info', 1000);

    expect(toast.isVisible.value).toBe(true);
    expect(toast.message.value).toBe('hello world');
    expect(toast.type.value).toBe('info');

    vi.advanceTimersByTime(1000);

    expect(toast.isVisible.value).toBe(false);
  });

  it('resets the timer when a new toast is shown', () => {
    const toast = useToast();

    toast.showSuccess('first', 1000);
    vi.advanceTimersByTime(700);

    toast.showError('second', 1000);
    expect(toast.message.value).toBe('second');
    expect(toast.type.value).toBe('error');

    vi.advanceTimersByTime(900);
    expect(toast.isVisible.value).toBe(true);

    vi.advanceTimersByTime(100);
    expect(toast.isVisible.value).toBe(false);
  });
});
