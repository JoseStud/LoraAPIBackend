import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import JobQueue from '../../app/frontend/static/vue/JobQueue.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

// Mock the Alpine store
const mockStore = {
  activeJobs: [],
  removeJob: vi.fn(),
  updateJob: vi.fn(),
  addResult: vi.fn(),
  addNotification: vi.fn(),
};

beforeEach(() => {
  // Reset the mock store before each test
  mockStore.activeJobs = [];
  mockStore.removeJob.mockClear();
  mockStore.updateJob.mockClear();
  mockStore.addResult.mockClear();
  mockStore.addNotification.mockClear();
  
  // Mock Alpine global
  global.Alpine = {
    store: vi.fn(() => mockStore)
  };
  
  global.window = {
    Alpine: global.Alpine,
    BACKEND_URL: ''
  };
});

describe('JobQueue.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when no jobs are present', async () => {
    const wrapper = mount(JobQueue);
    await flush();

    expect(wrapper.text()).toContain('Generation Queue');
    expect(wrapper.text()).toContain('No active generations');
    expect(wrapper.text()).toContain('Start a generation to see progress here');
    expect(wrapper.text()).toContain('0 active');

    wrapper.unmount();
  });

  it('renders jobs when they are present in the store', async () => {
    // Add mock jobs to the store
    mockStore.activeJobs = [
      {
        id: 'job1',
        name: 'Test Generation',
        status: 'running',
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
    ];

    const wrapper = mount(JobQueue);
    await flush();

    expect(wrapper.text()).toContain('Test Generation');
    expect(wrapper.text()).toContain('Another Job');
    expect(wrapper.text()).toContain('512x512 • 20 steps');
    expect(wrapper.text()).toContain('768x768 • 30 steps');
    expect(wrapper.text()).toContain('running');
    expect(wrapper.text()).toContain('completed');
    expect(wrapper.text()).toContain('25%');
    expect(wrapper.text()).toContain('100%');
    expect(wrapper.text()).toContain('Processing...');
    expect(wrapper.text()).toContain('2 active');

    wrapper.unmount();
  });

  it('applies correct status color classes', async () => {
    mockStore.activeJobs = [
      { id: 'job1', status: 'running', startTime: new Date() },
      { id: 'job2', status: 'completed', startTime: new Date() },
      { id: 'job3', status: 'failed', startTime: new Date() },
      { id: 'job4', status: 'cancelled', startTime: new Date() }
    ];

    const wrapper = mount(JobQueue);
    await flush();

    // Check for status-specific CSS classes
    expect(wrapper.html()).toContain('text-blue-600'); // running
    expect(wrapper.html()).toContain('text-green-600'); // completed
    expect(wrapper.html()).toContain('text-red-600'); // failed
    expect(wrapper.html()).toContain('text-gray-600'); // cancelled

    wrapper.unmount();
  });

  it('shows cancel button only for running/starting jobs', async () => {
    mockStore.activeJobs = [
      { id: 'job1', status: 'running', startTime: new Date() },
      { id: 'job2', status: 'starting', startTime: new Date() },
      { id: 'job3', status: 'completed', startTime: new Date() },
      { id: 'job4', status: 'failed', startTime: new Date() }
    ];

    const wrapper = mount(JobQueue);
    await flush();

    // Should have 2 cancel buttons (for running and starting jobs)
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

    mockStore.activeJobs = [
      { 
        id: 'job1', 
        // No jobId property, should fallback to id
        status: 'running', 
        startTime: new Date() 
      }
    ];

    const wrapper = mount(JobQueue);
    await flush();

    // Simulate cancel action
    await wrapper.vm.handleCancelJob('job1');
    await flush();

    // Should use the job.id when jobId is not available
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/generation/jobs/job1/cancel', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(mockStore.removeJob).toHaveBeenCalledWith('job1');

    wrapper.unmount();
  });

  it('calls cancelJob when cancel button is clicked', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200
    }));

    mockStore.activeJobs = [
      { 
        id: 'job1', 
        jobId: 'backend-job-1',
        status: 'running', 
        startTime: new Date() 
      }
    ];

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
    expect(mockStore.removeJob).toHaveBeenCalledWith('job1');
    expect(mockStore.addNotification).toHaveBeenCalledWith('Job cancelled', 'info');

    wrapper.unmount();
  });

  it('supports custom props', async () => {
    const wrapper = mount(JobQueue, {
      props: {
        title: 'Custom Title',
        emptyStateTitle: 'Custom Empty Title',
        emptyStateMessage: 'Custom empty message',
        showClearCompleted: true,
        showJobCount: false
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
    mockStore.activeJobs = [
      { id: 'job1', status: 'running', startTime: new Date() },
      { id: 'job2', status: 'completed', startTime: new Date() },
      { id: 'job3', status: 'failed', startTime: new Date() }
    ];

    const wrapper = mount(JobQueue, {
      props: {
        showClearCompleted: true
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

    // Should have called removeJob for completed and failed jobs
    expect(mockStore.removeJob).toHaveBeenCalledWith('job2');
    expect(mockStore.removeJob).toHaveBeenCalledWith('job3');
    expect(mockStore.removeJob).not.toHaveBeenCalledWith('job1');

    wrapper.unmount();
  });

  it('formats duration correctly', async () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 65000); // 65 seconds ago
    const oneHourAgo = new Date(now.getTime() - 3665000); // 1 hour, 1 minute, 5 seconds ago

    mockStore.activeJobs = [
      { id: 'job1', status: 'running', startTime: oneMinuteAgo },
      { id: 'job2', status: 'running', startTime: oneHourAgo }
    ];

    const wrapper = mount(JobQueue);
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