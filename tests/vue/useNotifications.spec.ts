import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useNotifications } from '../../app/frontend/src/composables/shared/useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('shows toast message and hides after the configured duration', () => {
    const notifications = useNotifications();

    notifications.showToast('hello world', 'info', 1000);

    expect(notifications.toastVisible.value).toBe(true);
    expect(notifications.toastMessage.value).toBe('hello world');
    expect(notifications.toastType.value).toBe('info');

    vi.advanceTimersByTime(1000);

    expect(notifications.toastVisible.value).toBe(false);
  });

  it('resets the timer when a new toast is shown', () => {
    const notifications = useNotifications();

    notifications.showToastSuccess('first', 1000);
    vi.advanceTimersByTime(700);

    notifications.showToastError('second', 1000);
    expect(notifications.toastMessage.value).toBe('second');
    expect(notifications.toastType.value).toBe('error');

    vi.advanceTimersByTime(900);
    expect(notifications.toastVisible.value).toBe(true);

    vi.advanceTimersByTime(100);
    expect(notifications.toastVisible.value).toBe(false);
  });

  it('adds stacked notifications via shared helpers', () => {
    const notifications = useNotifications();

    const id = notifications.showSuccess('Saved successfully', 0);

    expect(id).toBeGreaterThan(0);
    expect(notifications.notifications.value).toHaveLength(1);
    expect(notifications.notifications.value[0]).toMatchObject({
      message: 'Saved successfully',
      type: 'success',
    });
  });
});
