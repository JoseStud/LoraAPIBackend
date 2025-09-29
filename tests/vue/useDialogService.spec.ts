import { beforeEach, describe, expect, it } from 'vitest'

import { useDialogService } from '../../app/frontend/src/composables/shared/useDialogService'

describe('useDialogService', () => {
  beforeEach(() => {
    const dialog = useDialogService()
    dialog.cancelDialog()
  })

  it('resolves confirm dialog with true when accepted', async () => {
    const dialog = useDialogService()

    const confirmation = dialog.confirm({
      message: 'Perform action?',
      title: 'Confirm',
    })

    expect(dialog.state.isOpen).toBe(true)
    expect(dialog.state.type).toBe('confirm')

    dialog.confirmDialog()

    await expect(confirmation).resolves.toBe(true)
    expect(dialog.state.isOpen).toBe(false)
  })

  it('resolves confirm dialog with false when cancelled', async () => {
    const dialog = useDialogService()

    const confirmation = dialog.confirm({
      message: 'Delete item?',
    })

    dialog.cancelDialog()

    await expect(confirmation).resolves.toBe(false)
    expect(dialog.state.isOpen).toBe(false)
  })

  it('returns entered value for prompt dialogs and null when cancelled', async () => {
    const dialog = useDialogService()

    const promptPromise = dialog.prompt({
      message: 'Name the preset',
      requireValue: true,
    })

    expect(dialog.isConfirmDisabled.value).toBe(true)
    dialog.updateInputValue('My Preset')
    expect(dialog.isConfirmDisabled.value).toBe(false)

    dialog.confirmDialog()

    await expect(promptPromise).resolves.toBe('My Preset')

    const cancelled = dialog.prompt({ message: 'Name again' })
    dialog.cancelDialog()

    await expect(cancelled).resolves.toBeNull()
  })
})
