import { computed, reactive, readonly } from 'vue'

type DialogType = 'confirm' | 'prompt'

type BaseDialogOptions = {
  title?: string
  message: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmOptions = BaseDialogOptions

type PromptOptions = BaseDialogOptions & {
  defaultValue?: string
  placeholder?: string
  inputLabel?: string
  requireValue?: boolean
}

type DialogState = {
  isOpen: boolean
  type: DialogType | null
  title: string
  message: string
  description: string
  confirmLabel: string
  cancelLabel: string
  inputLabel: string
  placeholder: string
  inputValue: string
  requireValue: boolean
}

const defaultState: DialogState = {
  isOpen: false,
  type: null,
  title: '',
  message: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  inputLabel: '',
  placeholder: '',
  inputValue: '',
  requireValue: false,
}

const state = reactive({ ...defaultState })

let confirmResolver: ((value: boolean) => void) | null = null
let promptResolver: ((value: string | null) => void) | null = null

const resetState = (): void => {
  Object.assign(state, defaultState)
}

const openConfirm = (options: ConfirmOptions): Promise<boolean> => {
  if (state.isOpen) {
    cancelDialog()
  }

  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve
    state.type = 'confirm'
    state.title = options.title ?? 'Confirm Action'
    state.message = options.message
    state.description = options.description ?? ''
    state.confirmLabel = options.confirmLabel ?? 'Confirm'
    state.cancelLabel = options.cancelLabel ?? 'Cancel'
    state.isOpen = true
  })
}

const openPrompt = (options: PromptOptions): Promise<string | null> => {
  if (state.isOpen) {
    cancelDialog()
  }

  return new Promise<string | null>((resolve) => {
    promptResolver = resolve
    state.type = 'prompt'
    state.title = options.title ?? 'Enter a value'
    state.message = options.message
    state.description = options.description ?? ''
    state.confirmLabel = options.confirmLabel ?? 'Confirm'
    state.cancelLabel = options.cancelLabel ?? 'Cancel'
    state.placeholder = options.placeholder ?? ''
    state.inputLabel = options.inputLabel ?? ''
    state.requireValue = options.requireValue ?? false
    state.inputValue = options.defaultValue ?? ''
    state.isOpen = true
  })
}

const confirmDialog = (): void => {
  if (!state.isOpen) {
    return
  }

  if (state.type === 'confirm' && confirmResolver) {
    const resolver = confirmResolver
    confirmResolver = null
    promptResolver = null
    resetState()
    resolver(true)
    return
  }

  if (state.type === 'prompt' && promptResolver) {
    const value = state.inputValue
    const resolver = promptResolver
    confirmResolver = null
    promptResolver = null
    resetState()
    resolver(value)
  }
}

const cancelDialog = (): void => {
  if (!state.isOpen) {
    return
  }

  if (state.type === 'confirm' && confirmResolver) {
    const resolver = confirmResolver
    confirmResolver = null
    promptResolver = null
    resetState()
    resolver(false)
    return
  }

  if (state.type === 'prompt' && promptResolver) {
    const resolver = promptResolver
    confirmResolver = null
    promptResolver = null
    resetState()
    resolver(null)
  } else {
    confirmResolver = null
    promptResolver = null
    resetState()
  }
}

const updateInputValue = (value: string): void => {
  state.inputValue = value
}

const isConfirmDisabled = computed(() => {
  if (!state.isOpen || state.type !== 'prompt') {
    return false
  }

  if (!state.requireValue) {
    return false
  }

  return state.inputValue.trim().length === 0
})

export const useDialogService = () => ({
  state: readonly(state),
  confirm: openConfirm,
  prompt: openPrompt,
  confirmDialog,
  cancelDialog,
  updateInputValue,
  isConfirmDisabled,
})

export type UseDialogServiceReturn = ReturnType<typeof useDialogService>
