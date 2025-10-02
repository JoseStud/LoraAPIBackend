import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import GenerationShellView from '@/features/generation/ui/GenerationShellView.vue'
import type { GenerationFormState, GenerationJob, GenerationResult, SystemStatusState } from '@/types'
import type { ReadonlyResults, ResultItemView } from '@/features/generation/orchestrator'

const createComponentStub = (name: string, props: string[], emits: string[] = []) =>
  defineComponent({
    name,
    props,
    emits,
    template: `<div class="${name}-stub"><slot /></div>`,
  })

const GenerationParameterFormStub = createComponentStub(
  'GenerationParameterForm',
  ['params', 'isGenerating'],
  ['update:params', 'start-generation', 'load-from-composer', 'use-random-prompt', 'save-preset'],
)

const GenerationActiveJobsListStub = createComponentStub(
  'GenerationActiveJobsList',
  ['activeJobs', 'sortedActiveJobs', 'formatTime', 'getJobStatusClasses', 'getJobStatusText', 'canCancelJob'],
  ['cancel-job'],
)

const GenerationResultsGalleryStub = createComponentStub(
  'GenerationResultsGallery',
  ['recentResults', 'showHistory', 'formatTime'],
  ['refresh-results', 'reuse-parameters', 'delete-result', 'show-image-modal'],
)

const GenerationSystemStatusCardStub = createComponentStub(
  'GenerationSystemStatusCard',
  ['systemStatus', 'getSystemStatusClasses'],
)

const JobQueueStub = createComponentStub('JobQueue', ['showClearCompleted'])

const SystemStatusCardStub = createComponentStub('SystemStatusCard', ['variant'])

const params: GenerationFormState = {
  prompt: 'Example prompt',
  negative_prompt: '',
  steps: 20,
  sampler_name: 'Euler',
  cfg_scale: 7,
  width: 512,
  height: 512,
  seed: -1,
  batch_size: 1,
  batch_count: 1,
}

const createJob = (overrides: Partial<GenerationJob> = {}): GenerationJob => ({
  uiId: 'job-1',
  backendId: 'backend-1',
  status: 'queued',
  prompt: 'Job prompt',
  id: 'job-1',
  created_at: new Date().toISOString(),
  ...overrides,
}) as GenerationJob

const result: GenerationResult = {
  id: 'result-1',
  prompt: 'Result prompt',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  seed: 123,
  image_url: '/image.png',
}

const recentResults: ReadonlyResults = Object.freeze([{ ...result } as ResultItemView]) as ReadonlyResults

const systemStatus: SystemStatusState = {
  status: 'healthy',
  queue_length: 1,
  gpu_available: true,
  active_workers: 1,
  gpu_status: 'Ready',
  memory_total: 16,
  memory_used: 8,
  disk_total: 512,
  disk_used: 128,
  uptime_seconds: 100,
  last_job_started_at: null,
  last_job_completed_at: null,
  api_available: true,
}

const baseProps = () => ({
  isConnected: true,
  showHistory: false,
  params,
  isGenerating: false,
  activeJobs: [createJob()],
  sortedActiveJobs: [createJob()],
  recentResults,
  formatTime: (value?: string) => value ?? 'Unknown',
  getJobStatusClasses: () => 'status-class',
  getJobStatusText: () => 'Status',
  canCancelJob: () => true,
  systemStatus,
  getSystemStatusClasses: () => 'system-status-class',
  showModal: false,
  selectedResult: null as GenerationResult | null,
})

describe('GenerationShellView', () => {
  const global = {
    stubs: {
      GenerationParameterForm: GenerationParameterFormStub,
      GenerationActiveJobsList: GenerationActiveJobsListStub,
      GenerationResultsGallery: GenerationResultsGalleryStub,
      GenerationSystemStatusCard: GenerationSystemStatusCardStub,
      JobQueue: JobQueueStub,
      SystemStatusCard: SystemStatusCardStub,
    },
  }

  it('renders default layout', () => {
    const wrapper = mount(GenerationShellView, {
      props: baseProps(),
      global,
    })

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('emits toggle-history when history button clicked', async () => {
    const wrapper = mount(GenerationShellView, {
      props: baseProps(),
      global,
    })

    await wrapper.get('[data-testid="toggle-history"]').trigger('click')

    expect(wrapper.emitted('toggle-history')).toHaveLength(1)
  })

  it('emits clear-queue when button clicked', async () => {
    const wrapper = mount(GenerationShellView, {
      props: baseProps(),
      global,
    })

    await wrapper.get('[data-testid="clear-queue"]').trigger('click')

    expect(wrapper.emitted('clear-queue')).toHaveLength(1)
  })

  it('renders modal when showModal is true and emits hide-image-modal on overlay click', async () => {
    const wrapper = mount(GenerationShellView, {
      props: {
        ...baseProps(),
        showModal: true,
        selectedResult: result,
      },
      global,
    })

    expect(wrapper.find('[data-testid="result-modal"]').exists()).toBe(true)

    await wrapper.get('[data-testid="result-modal"]').trigger('click')

    expect(wrapper.emitted('hide-image-modal')).toHaveLength(1)
  })
})
