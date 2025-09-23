import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import JobQueue from '../../app/frontend/src/components/shared/JobQueue.vue';
import { useAppStore } from '../../app/frontend/src/stores/app';
import { useGenerationQueueStore } from '../../app/frontend/src/stores/generation';
import { useSettingsStore } from '../../app/frontend/src/stores/settings';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

let appStore;
let queueStore;
let removeJobSpy;
let updateJobSpy;
let addNotificationSpy;

beforeEach(() => {
  appStore = useAppStore();
  appStore.$reset();
  queueStore = useGenerationQueueStore();
  queueStore.reset();
  const settingsStore = useSettingsStore();
  settingsStore.setSettings({ backendUrl: '/api/v1' });
  removeJobSpy = vi.spyOn(queueStore, 'removeJob');
  updateJobSpy = vi.spyOn(queueStore, 'updateJob');
  addNotificationSpy = vi.spyOn(appStore, 'addNotification');

  global.window = {
    ...global.window,
    BACKEND_URL: ''
  };
});

describe('JobQueue.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when no jobs are present', async () => {
    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    expect(wrapper.text()).toContain('Generation Queue');
    expect(wrapper.text()).toContain('No active generations');
    expect(wrapper.text()).toContain('Start a generation to see progress here');
    expect(wrapper.text()).toContain('0 active');

    wrapper.unmount();
  });

  it('renders jobs when they are present in the store', async () => {
    // Add mock jobs to the store
    queueStore.setJobs([
      {
        id: 'job1',
        name: 'Test Generation',
        status: 'processing',
        progress: 25,
        startTime: new Date('2023-01-01T10:00:00Z'),
        params: { width: 512, height: 512, steps: 20 },
        message: 'Processing...'
      },
      {
        id: 'job2',
        name: 'Another Job',
        status: 'completed',
        progress: 100,
        startTime: new Date('2023-01-01T09:30:00Z'),
        params: { width: 768, height: 768, steps: 30 }
      }
    ]);

    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    expect(wrapper.text()).toContain('Test Generation');
    expect(wrapper.text()).toContain('Another Job');
    expect(wrapper.text()).toContain('512x512 • 20 steps');
    expect(wrapper.text()).toContain('768x768 • 30 steps');
    expect(wrapper.text()).toContain('processing');
    expect(wrapper.text()).toContain('completed');
    expect(wrapper.text()).toContain('25%');
    expect(wrapper.text()).toContain('100%');
    expect(wrapper.text()).toContain('Processing...');
    expect(wrapper.text()).toContain('2 active');

    wrapper.unmount();
  });

  it('applies correct status color classes', async () => {
    queueStore.setJobs([
      { id: 'job1', status: 'processing', startTime: new Date() },
      { id: 'job2', status: 'queued', startTime: new Date() },
      { id: 'job3', status: 'completed', startTime: new Date() },
      { id: 'job4', status: 'failed', startTime: new Date() }
    ]);

    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    // Check for status-specific CSS classes
    expect(wrapper.html()).toContain('text-blue-600'); // processing
    expect(wrapper.html()).toContain('text-yellow-600'); // queued
    expect(wrapper.html()).toContain('text-green-600'); // completed
    expect(wrapper.html()).toContain('text-red-600'); // failed

    wrapper.unmount();
  });

  it('shows cancel button only for running/starting jobs', async () => {
    queueStore.setJobs([
      { id: 'job1', status: 'processing', startTime: new Date() },
      { id: 'job2', status: 'queued', startTime: new Date() },
      { id: 'job3', status: 'completed', startTime: new Date() },
      { id: 'job4', status: 'failed', startTime: new Date() }
    ]);

    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    // Should have 2 cancel buttons (for processing and queued jobs)
    const cancelButtons = wrapper.findAll('button[type="button"]').filter(btn => 
      btn.element.innerHTML.includes('M6 18L18 6M6 6l12 12')
    );
    
    expect(cancelButtons).toHaveLength(2);

    wrapper.unmount();
  });

  it('handles job cancellation with id fallback when jobId is missing', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200
    }));

    queueStore.setJobs([
      {
        id: 'job1',
        // No jobId property, should fallback to id
        status: 'processing',
        startTime: new Date()
      }
    ]);

    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    // Simulate cancel action
    await wrapper.vm.handleCancelJob('job1');
    await flush();

    // Should use the job.id when jobId is not available
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/generation/jobs/job1/cancel', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(removeJobSpy).toHaveBeenCalledWith('job1');

    wrapper.unmount();
  });

  it('calls cancelJob when cancel button is clicked', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200
    }));

    queueStore.setJobs([
      {
        id: 'job1',
        jobId: 'backend-job-1',
        status: 'processing',
        startTime: new Date()
      }
    ]);

    const wrapper = mount(JobQueue);
    await flush();

    // Find cancel button by looking for SVG with specific path
    const cancelButtons = wrapper.findAll('button').filter(btn => 
      btn.element.innerHTML.includes('M6 18L18 6M6 6l12 12')
    );
    
    expect(cancelButtons).toHaveLength(1);
    
    // Simulate click by calling the handler directly
    await wrapper.vm.handleCancelJob('job1');
    await flush();

    // Should try generation endpoint first
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/generation/jobs/backend-job-1/cancel', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(removeJobSpy).toHaveBeenCalledWith('job1');
    expect(addNotificationSpy).toHaveBeenCalledWith('Job cancelled', 'info', expect.any(Number));

    wrapper.unmount();
  });

  it('supports custom props', async () => {
    const wrapper = mount(JobQueue, {
      props: {
        title: 'Custom Title',
        emptyStateTitle: 'Custom Empty Title',
        emptyStateMessage: 'Custom empty message',
        showClearCompleted: true,
        showJobCount: false,
        disabled: true
      }
    });
    await flush();

    expect(wrapper.text()).toContain('Custom Title');
    expect(wrapper.text()).toContain('Custom Empty Title');
    expect(wrapper.text()).toContain('Custom empty message');
    expect(wrapper.text()).not.toContain('0 active'); // showJobCount: false

    wrapper.unmount();
  });

  it('shows and handles clear completed button when enabled', async () => {
    queueStore.setJobs([
      { id: 'job1', status: 'processing', startTime: new Date() },
      { id: 'job2', status: 'completed', startTime: new Date() },
      { id: 'job3', status: 'failed', startTime: new Date() }
    ]);

    const wrapper = mount(JobQueue, {
      props: {
        showClearCompleted: true,
        disabled: true
      }
    });
    await flush();

    // Find clear completed button 
    const clearButtons = wrapper.findAll('button').filter(btn => 
      btn.text().includes('Clear Completed')
    );
    expect(clearButtons).toHaveLength(1);

    // Call the handler directly to test functionality
    await wrapper.vm.handleClearCompleted();
    await flush();

    // Completed and failed jobs removed from store
    expect(queueStore.activeJobs).toHaveLength(1);
    expect(queueStore.activeJobs[0].id).toBe('job1');

    wrapper.unmount();
  });

  it('formats duration correctly', async () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 65000); // 65 seconds ago
    const oneHourAgo = new Date(now.getTime() - 3665000); // 1 hour, 1 minute, 5 seconds ago

    queueStore.setJobs([
      { id: 'job1', status: 'processing', startTime: oneMinuteAgo },
      { id: 'job2', status: 'processing', startTime: oneHourAgo }
    ]);

    const wrapper = mount(JobQueue, { props: { disabled: true } });
    await flush();

    // Check for duration formatting patterns
    expect(wrapper.text()).toMatch(/1m \d+s/); // 1 minute X seconds
    expect(wrapper.text()).toMatch(/1h \d+m/); // 1 hour X minutes

    wrapper.unmount();
  });

  it('handles API polling errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const wrapper = mount(JobQueue, {
      props: {
        pollingInterval: 100 // Fast polling for test
      }
    });
    await flush();

    // Wait for polling to trigger
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should handle error gracefully and not crash
    expect(wrapper.isVisible()).toBe(true);
    
    consoleDebugSpy.mockRestore();
    wrapper.unmount();
  });
});
