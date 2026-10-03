import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

import JobQueue from '@/features/generation/components/JobQueue.vue';

// JobQueue is a view over useJobQueue/useJobQueueActions; those composables have their own specs,
// so here they are replaced with controllable doubles.
const queueState = vi.hoisted(() => ({ jobs: null }));
const actionMocks = vi.hoisted(() => ({
  cancelJob: vi.fn(),
  clearCompletedJobs: vi.fn(),
}));

vi.mock('@/features/generation/composables/useJobQueue', () => ({
  useJobQueue: () => ({
    jobs: queueState.jobs,
    isReady: { value: true },
    queueManagerActive: { value: true },
  }),
}));

vi.mock('@/features/generation/composables/useJobQueueActions', async () => {
  const { ref: vueRef } = await vi.importActual('vue');
  return {
    useJobQueueActions: () => ({
      isCancelling: vueRef(false),
      cancelJob: actionMocks.cancelJob,
      clearCompletedJobs: actionMocks.clearCompletedJobs,
    }),
  };
});

const createJob = (overrides = {}) => ({
  id: 'job1',
  uiId: 'job1',
  name: null,
  prompt: null,
  status: 'processing',
  progress: 0,
  message: null,
  params: null,
  startTime: null,
  ...overrides,
});

describe('JobQueue.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueState.jobs = ref([]);
    actionMocks.cancelJob.mockResolvedValue(true);
  });

  it('renders the empty state when no jobs are present', () => {
    const wrapper = mount(JobQueue);

    expect(wrapper.text()).toContain('Generation Queue');
    expect(wrapper.text()).toContain('No active generations');
    expect(wrapper.text()).toContain('Start a generation to see progress here');
    expect(wrapper.text()).toContain('0 active');
  });

  it('renders jobs with their details', () => {
    queueState.jobs.value = [
      createJob({
        name: 'Test Generation',
        progress: 25,
        params: { width: 512, height: 512, steps: 20 },
        message: 'Processing...',
      }),
      createJob({
        id: 'job2',
        uiId: 'job2',
        name: 'Another Job',
        status: 'completed',
        progress: 100,
        params: { width: 768, height: 768, steps: 30 },
      }),
    ];

    const wrapper = mount(JobQueue);

    expect(wrapper.text()).toContain('Test Generation');
    expect(wrapper.text()).toContain('Another Job');
    expect(wrapper.text()).toContain('512x512 • 20 steps');
    expect(wrapper.text()).toContain('768x768 • 30 steps');
    expect(wrapper.text()).toContain('25%');
    expect(wrapper.text()).toContain('Processing...');
    expect(wrapper.text()).toContain('2 active');
    expect(wrapper.text()).not.toContain('No active generations');
  });

  it('applies the status colour classes', () => {
    queueState.jobs.value = [
      createJob({ id: 'job1', status: 'processing' }),
      createJob({ id: 'job2', status: 'queued' }),
      createJob({ id: 'job3', status: 'completed' }),
      createJob({ id: 'job4', status: 'failed' }),
    ];

    const html = mount(JobQueue).html();

    expect(html).toContain('text-blue-600');
    expect(html).toContain('text-yellow-600');
    expect(html).toContain('text-green-600');
    expect(html).toContain('text-red-600');
  });

  it('shows a cancel button only for queued or processing jobs', () => {
    queueState.jobs.value = [
      createJob({ id: 'job1', status: 'processing' }),
      createJob({ id: 'job2', status: 'queued' }),
      createJob({ id: 'job3', status: 'completed' }),
      createJob({ id: 'job4', status: 'failed' }),
    ];

    const wrapper = mount(JobQueue);

    expect(wrapper.findAll('button.text-gray-400')).toHaveLength(2);
  });

  it('cancels a job through the queue actions', async () => {
    queueState.jobs.value = [createJob({ id: 'job1', status: 'processing' })];

    const wrapper = mount(JobQueue);
    await wrapper.find('button.text-gray-400').trigger('click');

    expect(actionMocks.cancelJob).toHaveBeenCalledWith('job1');
  });

  it('shows the clear completed button only when enabled and jobs exist', async () => {
    const hidden = mount(JobQueue, { props: { showClearCompleted: true } });
    expect(hidden.text()).not.toContain('Clear Completed');

    queueState.jobs.value = [createJob({ status: 'completed' })];
    const wrapper = mount(JobQueue, { props: { showClearCompleted: true } });
    const button = wrapper.findAll('button').find((item) => item.text() === 'Clear Completed');

    expect(button).toBeDefined();
    await button.trigger('click');
    expect(actionMocks.clearCompletedJobs).toHaveBeenCalledTimes(1);
  });

  it('formats elapsed time from the job start time', async () => {
    const now = Date.now();
    queueState.jobs.value = [
      createJob({ id: 'job1', startTime: new Date(now - 65_000).toISOString() }),
      createJob({ id: 'job2', startTime: new Date(now - 3_665_000).toISOString() }),
    ];

    const wrapper = mount(JobQueue);
    await nextTick();

    expect(wrapper.text()).toMatch(/1m \d+s/);
    expect(wrapper.text()).toMatch(/1h \d+m/);
  });
});
