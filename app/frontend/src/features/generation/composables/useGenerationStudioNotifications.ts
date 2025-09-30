import { useDialogService, useNotifications } from '@/composables/shared'
import type { UseDialogServiceReturn } from '@/composables/shared'
import type { NotificationType } from '@/types'

export interface UseGenerationStudioNotificationsOptions {
  debugLabel?: string
}

export interface UseGenerationStudioNotificationsReturn {
  notify: (message: string, type?: NotificationType) => void
  confirm: UseDialogServiceReturn['confirm']
  prompt: UseDialogServiceReturn['prompt']
  logDebug: (...args: unknown[]) => void
}

export const useGenerationStudioNotifications = ({
  debugLabel = '[GenerationStudio]',
}: UseGenerationStudioNotificationsOptions = {}): UseGenerationStudioNotificationsReturn => {
  const { notify: pushNotification } = useNotifications()
  const dialogService = useDialogService()

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info(debugLabel, ...args)
    }
  }

  const notify = (message: string, type: NotificationType = 'success'): void => {
    logDebug(`notify:${type}`, message)
    pushNotification(message, type)
  }

  const confirm: UseDialogServiceReturn['confirm'] = async (options) => {
    logDebug('confirm', options.title ?? options.message)
    return dialogService.confirm(options)
  }

  const prompt: UseDialogServiceReturn['prompt'] = async (options) => {
    logDebug('prompt', options.title ?? options.message)
    return dialogService.prompt(options)
  }

  return {
    notify,
    confirm,
    prompt,
    logDebug,
  }
}

export type UseGenerationStudioNotifications = ReturnType<typeof useGenerationStudioNotifications>
