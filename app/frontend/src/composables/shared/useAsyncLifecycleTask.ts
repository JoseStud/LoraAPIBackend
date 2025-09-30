import { onMounted } from 'vue'

import { useDialogService, type UseDialogServiceReturn } from './useDialogService'
import { useNotifications } from './useNotifications'

type LifecycleHookRegistrar = (callback: () => void) => void

type Resolveable<T> = T | ((error: unknown) => T)

type ConfirmOptions = Parameters<UseDialogServiceReturn['confirm']>[0]

type NotifyErrorHandler = (message: string, error: unknown) => void

type AsyncLifecycleTaskOptions = {
  hook?: LifecycleHookRegistrar
  errorMessage?: Resolveable<string>
  notificationDuration?: number
  notifyError?: NotifyErrorHandler | null
  dialog?: UseDialogServiceReturn
  dialogOptions?: Resolveable<ConfirmOptions | null | undefined>
  onError?: (error: unknown) => void | Promise<void>
  onFinally?: () => void | Promise<void>
  logLabel?: string
  rethrow?: boolean
}

const resolveValue = <T>(value: Resolveable<T> | undefined, error: unknown): T | undefined => {
  if (typeof value === 'function') {
    return (value as (error: unknown) => T)(error)
  }

  return value
}

const defaultErrorMessage = 'An unexpected error occurred. Please try again.'

export const useAsyncLifecycleTask = (
  task: () => Promise<unknown>,
  {
    hook = onMounted,
    errorMessage,
    notificationDuration,
    notifyError,
    dialog,
    dialogOptions,
    onError,
    onFinally,
    logLabel = '[LifecycleTask]',
    rethrow = false,
  }: AsyncLifecycleTaskOptions = {},
) => {
  const notifications = useNotifications()
  const dialogService = dialog ?? useDialogService()

  const executeTask = async (): Promise<void> => {
    try {
      await task()
    } catch (error) {
      const message = resolveValue(errorMessage, error) ?? defaultErrorMessage

      console.error(`${logLabel} failed`, error)

      const effectiveNotify: NotifyErrorHandler | null =
        notifyError === null
          ? null
          : notifyError ?? ((msg: string) => notifications.showError(msg, notificationDuration))

      if (effectiveNotify) {
        effectiveNotify(message, error)
      }

      const resolvedDialogOptions = resolveValue(dialogOptions, error)

      if (resolvedDialogOptions) {
        await dialogService.confirm({
          confirmLabel: resolvedDialogOptions.confirmLabel ?? 'Dismiss',
          cancelLabel: resolvedDialogOptions.cancelLabel ?? 'Close',
          ...resolvedDialogOptions,
          message: resolvedDialogOptions.message ?? message,
        })
      }

      if (onError) {
        await onError(error)
      }

      if (rethrow) {
        throw error
      }
    } finally {
      if (onFinally) {
        await onFinally()
      }
    }
  }

  hook(() => {
    void executeTask()
  })

  return { run: executeTask }
}

export type UseAsyncLifecycleTaskReturn = ReturnType<typeof useAsyncLifecycleTask>
