import { describe, it, expect } from 'vitest'
import { useConfirm } from '@/composables/useConfirm'

describe('useConfirm composable', () => {
  it('returns readonly confirmDialog with visible=false initially', () => {
    const { confirmDialog } = useConfirm()
    expect(confirmDialog.value.visible).toBe(false)
    expect(confirmDialog.value.options).toBeNull()
  })

  it('confirm() opens the dialog and returns a promise that resolves to true on confirm', async () => {
    const { confirmDialog, confirm, handleConfirm } = useConfirm()

    const promise = confirm({ title: 'Test', message: 'Are you sure?' })
    expect(confirmDialog.value.visible).toBe(true)
    expect(confirmDialog.value.options?.title).toBe('Test')
    expect(confirmDialog.value.options?.message).toBe('Are you sure?')

    handleConfirm(true)
    const result = await promise
    expect(result).toBe(true)
    expect(confirmDialog.value.visible).toBe(false)
  })

  it('confirm() resolves to false on cancel', async () => {
    const { confirm, handleConfirm } = useConfirm()

    const promise = confirm({ message: 'Cancel?' })
    handleConfirm(false)
    const result = await promise
    expect(result).toBe(false)
  })

  it('hideConfirm() resolves to false', async () => {
    const { confirm, hideConfirm } = useConfirm()

    const promise = confirm({ message: 'Hide?' })
    hideConfirm()
    const result = await promise
    expect(result).toBe(false)
  })

  it('showConfirm accepts raw options and handlesConfirm resolves', async () => {
    const { showConfirm, handleConfirm } = useConfirm()

    const promise = showConfirm({ message: 'Raw' })
    handleConfirm(true)
    await expect(promise).resolves.toBe(true)
  })

  it('confirm() falls back description to message when message is missing', async () => {
    const { confirm, confirmDialog } = useConfirm()
    // The public `confirm` signature uses `message || description || ''`
    confirm({ title: 'Info', description: 'Desc fallback', type: 'info' })
    expect(confirmDialog.value.options?.message).toBe('Desc fallback')
    expect(confirmDialog.value.options?.type).toBe('info')
  })

  it('confirm() maps variant destructive to type danger', async () => {
    const { confirm, confirmDialog } = useConfirm()
    confirm({ title: 'Danger', message: 'Watch out', variant: 'destructive' })
    expect(confirmDialog.value.options?.type).toBe('danger')
  })
})
