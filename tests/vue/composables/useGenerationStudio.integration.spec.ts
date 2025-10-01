import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationStudio } from '@/composables/generation/useGenerationStudio'
import { useGenerationFormStore } from '@/features/generation/stores/form'
import type { UseGenerationStudioReturn } from '@/composables/generation'
import { PERSISTENCE_KEYS } from '@/composables/shared'

const orchestratorBindingMocks = vi.hoisted(() => {
  const { ref } = require('vue')

  return {
    activeJobs: ref([] as unknown[]),
    sortedActiveJobs: ref([] as unknown[]),
    recentResults: ref([] as unknown[]),
    systemStatus: ref({ status: 'healthy' }),
    isConnected: ref(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    loadSystemStatusData: vi.fn(),
    loadActiveJobsData: vi.fn(),
    loadRecentResultsData: vi.fn(),
    startGeneration: vi.fn().mockResolvedValue(undefined),
    cancelJob: vi.fn().mockResolvedValue(undefined),
    clearQueue: vi.fn().mockResolvedValue(undefined),
    deleteResult: vi.fn().mockResolvedValue(undefined),
    refreshResults: vi.fn().mockResolvedValue(undefined),
    canCancelJob: vi.fn().mockReturnValue(true),
    release: vi.fn(),
  }
})

const orchestratorManagerMocks = vi.hoisted(() => ({
  activeJobs: orchestratorBindingMocks.activeJobs,
  sortedActiveJobs: orchestratorBindingMocks.sortedActiveJobs,
  recentResults: orchestratorBindingMocks.recentResults,
  systemStatus: orchestratorBindingMocks.systemStatus,
  isConnected: orchestratorBindingMocks.isConnected,
  acquire: vi.fn(() => orchestratorBindingMocks),
}))

const dialogServiceMocks = vi.hoisted(() => {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn(),
    state: {
      isOpen: false,
      type: null,
      title: '',
      message: '',
      description: '',
      confirmLabel: '',
      cancelLabel: '',
      inputLabel: '',
      placeholder: '',
      inputValue: '',
      requireValue: false,
    },
    confirmDialog: vi.fn(),
    cancelDialog: vi.fn(),
    updateInputValue: vi.fn(),
    isConfirmDisabled: { value: false },
  }
})

const notificationMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  showToast: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
  showToastWarning: vi.fn(),
  showToastInfo: vi.fn(),
}))

vi.mock('@/composables/generation/useGenerationOrchestratorManager', () => ({
  useGenerationOrchestratorManager: () => orchestratorManagerMocks,
}))

vi.mock('@/composables/shared/useDialogService', () => ({
  useDialogService: () => dialogServiceMocks,
}))

vi.mock('@/composables/shared', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    useNotifications: () => ({
      notifications: { value: [] },
      addNotification: vi.fn(),
      notify: notificationMocks.notify,
      removeNotification: vi.fn(),
      clearAll: vi.fn(),
      showSuccess: notificationMocks.showSuccess,
      showError: notificationMocks.showError,
      showWarning: notificationMocks.showWarning,
      showInfo: notificationMocks.showInfo,
      toastVisible: { value: false },
      toastMessage: { value: '' },
      toastType: { value: 'info' },
      toastDuration: { value: 0 },
      showToast: notificationMocks.showToast,
      showToastSuccess: notificationMocks.showToastSuccess,
      showToastError: notificationMocks.showToastError,
      showToastWarning: notificationMocks.showToastWarning,
      showToastInfo: notificationMocks.showToastInfo,
      hideToast: vi.fn(),
      clearToastTimer: vi.fn(),
    }),
  }
})

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

const mountComposable = async () => {
  const TestComponent = defineComponent({
    setup(_, { expose }) {
      const studio = useGenerationStudio()
      expose({ studio })
      return () => null
    },
  })

  const wrapper = mount(TestComponent)
  await flushPromises()

  return wrapper as typeof wrapper & { vm: { studio: UseGenerationStudioReturn } }
}

describe('useGenerationStudio integration', () => {
  let wrapper: Awaited<ReturnType<typeof mountComposable>>

  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })
    localStorageMock.getItem.mockReturnValue(null)
    dialogServiceMocks.confirm.mockClear()
    dialogServiceMocks.confirm.mockResolvedValue(true)
    wrapper = await mountComposable()
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  it('initializes the controller on mount', () => {
    expect(orchestratorManagerMocks.acquire).toHaveBeenCalled()
    expect(orchestratorBindingMocks.initialize).toHaveBeenCalled()
  })

  it('starts a generation job and persists parameters', async () => {
    const formStore = useGenerationFormStore()
    formStore.setPrompt('  integration test prompt  ')

    await wrapper.vm.studio.startGeneration()

    expect(orchestratorBindingMocks.startGeneration).toHaveBeenCalledTimes(1)
    const payload = orchestratorBindingMocks.startGeneration.mock.calls[0][0]
    expect(payload.prompt).toBe('integration test prompt')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.generationParams,
      expect.stringContaining('"integration test prompt"'),
    )
    expect(formStore.isGenerating).toBe(false)
  })

  it('forwards cancel actions to the controller', async () => {
    await wrapper.vm.studio.cancelJob('job-456')

    expect(orchestratorBindingMocks.cancelJob).toHaveBeenCalledWith('job-456')
  })

  it('confirms before deleting results and forwards the action', async () => {
    dialogServiceMocks.confirm.mockResolvedValueOnce(true)

    await wrapper.vm.studio.deleteResult('result-789')

    expect(dialogServiceMocks.confirm).toHaveBeenCalled()
    expect(orchestratorBindingMocks.deleteResult).toHaveBeenCalledWith('result-789')
  })

  it('surfaces initialization failures through notifications', async () => {
    wrapper.unmount()
    orchestratorBindingMocks.initialize.mockRejectedValueOnce(new Error('boom'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    wrapper = await mountComposable()
    await flushPromises()

    expect(notificationMocks.notify).toHaveBeenCalledWith(
      'Failed to initialize the generation studio: boom',
      'error',
    )

    consoleError.mockRestore()
  })
})
