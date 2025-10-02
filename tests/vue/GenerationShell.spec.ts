import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref, h } from 'vue'

import GenerationShell from '@/features/generation/ui/GenerationShell.vue'
import GenerationShellView from '@/features/generation/ui/GenerationShellView.vue'
import type { GenerationFormState, SystemStatusState } from '@/types'
import type {
  GenerationJobView,
  GenerationResultView,
  ReadonlyQueue,
  ReadonlyResults,
  ResultItemView,
} from '@/features/generation/orchestrator'
import type { DeepReadonly } from '@/utils/freezeDeep'

type StudioInstance = ReturnType<typeof createStudioState>

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

const baseJob: GenerationJobView = Object.freeze({
  uiId: 'job-1',
  backendId: 'backend-1',
  jobId: 'backend-1',
  status: 'queued',
  prompt: 'Job prompt',
  id: 'job-1',
  created_at: new Date().toISOString(),
}) as GenerationJobView

const baseResult: GenerationResultView = Object.freeze({
  id: 'result-1',
  prompt: 'Result prompt',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  seed: 123,
  image_url: '/image.png',
}) as GenerationResultView

const recentResults: ReadonlyResults = Object.freeze([baseResult] as ResultItemView[]) as ReadonlyResults

const systemStatus: DeepReadonly<SystemStatusState> = Object.freeze({
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
}) as DeepReadonly<SystemStatusState>

const createStudioState = () => {
  const paramsRef = ref(params)
  const systemStatusRef = ref(systemStatus)
  const isGeneratingRef = ref(false)
  const showHistoryRef = ref(false)
  const showModalRef = ref(false)
  const selectedResultRef = ref<ResultItemView | null>(null)
  const activeJobsRef = ref<ReadonlyQueue>(Object.freeze([baseJob]))
  const recentResultsRef = ref<ReadonlyResults>(recentResults)
  const sortedActiveJobsRef = ref<ReadonlyQueue>(Object.freeze([baseJob]))
  const isConnectedRef = ref(true)

  const startGeneration = vi.fn().mockResolvedValue(undefined)
  const cancelJob = vi.fn().mockResolvedValue(undefined)
  const clearQueue = vi.fn().mockResolvedValue(undefined)
  const refreshResults = vi.fn().mockResolvedValue(undefined)
  const loadFromComposer = vi.fn()
  const useRandomPrompt = vi.fn()
  const savePreset = vi.fn()
  const showImageModal = vi.fn()
  const hideImageModal = vi.fn()
  const reuseParameters = vi.fn()
  const deleteResult = vi.fn().mockResolvedValue(undefined)
  const formatTime = vi.fn(() => 'just now')
  const getJobStatusClasses = vi.fn(() => 'status-class')
  const getJobStatusText = vi.fn(() => 'Status')
  const canCancelJob = vi.fn(() => true)
  const getSystemStatusClasses = vi.fn(() => 'system-status-class')
  const updateParams = vi.fn()
  const toggleHistory = vi.fn()
  const setHistoryLimit = vi.fn()
  const handleBackendUrlChange = vi.fn()
  const isManagerInitialized = ref(true)

  return {
    params: computed(() => paramsRef.value),
    systemStatus: computed(() => systemStatusRef.value),
    isGenerating: computed(() => isGeneratingRef.value),
    showHistory: computed(() => showHistoryRef.value),
    showModal: computed(() => showModalRef.value),
    selectedResult: computed(() => selectedResultRef.value),
    activeJobs: computed(() => activeJobsRef.value),
    recentResults: computed(() => recentResultsRef.value),
    sortedActiveJobs: computed(() => sortedActiveJobsRef.value),
    isConnected: computed(() => isConnectedRef.value),
    startGeneration,
    cancelJob,
    clearQueue,
    refreshResults,
    loadFromComposer,
    useRandomPrompt,
    savePreset,
    showImageModal,
    hideImageModal,
    reuseParameters,
    deleteResult,
    formatTime,
    getJobStatusClasses,
    getJobStatusText,
    canCancelJob,
    getSystemStatusClasses,
    updateParams,
    toggleHistory,
    setHistoryLimit,
    handleBackendUrlChange,
    isManagerInitialized,
  }
}

let studioInstance: StudioInstance

vi.mock('@/features/generation/composables/useGenerationStudio', () => ({
  useGenerationStudio: () => studioInstance,
}))

describe('GenerationShell', () => {
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

  const headerSlot = ({ toggleHistory, clearQueue }: Record<string, () => void>) =>
    h('div', [
      h(
        'button',
        {
          'data-testid': 'toggle-history',
          type: 'button',
          onClick: toggleHistory,
        },
        'Toggle History',
      ),
      h(
        'button',
        {
          'data-testid': 'clear-queue',
          type: 'button',
          onClick: clearQueue,
        },
        'Clear Queue',
      ),
    ])

  beforeEach(() => {
    studioInstance = createStudioState()
  })

  it('passes reactive props to the view', () => {
    const wrapper = mount(GenerationShell, { global })
    const view = wrapper.getComponent(GenerationShellView)

    expect(view.props('isConnected')).toBe(true)
    expect(view.props('showHistory')).toBe(false)
    expect(view.props('recentResults')).toEqual(recentResults)
  })

  it('forwards toggle-history to the composable', async () => {
    const wrapper = mount(GenerationShell, {
      global,
      slots: {
        header: headerSlot,
      },
    })

    await wrapper.get('[data-testid="toggle-history"]').trigger('click')

    expect(studioInstance.toggleHistory).toHaveBeenCalledTimes(1)
  })

  it('forwards clear-queue to the composable', async () => {
    const wrapper = mount(GenerationShell, {
      global,
      slots: {
        header: headerSlot,
      },
    })

    await wrapper.get('[data-testid="clear-queue"]').trigger('click')

    expect(studioInstance.clearQueue).toHaveBeenCalledTimes(1)
  })
})
