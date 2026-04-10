import { describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/api/client', () => ({
  $get: (...args: unknown[]) => mockGet(...args),
  $put: (...args: unknown[]) => mockPut(...args),
  $delete: (...args: unknown[]) => mockDelete(...args),
}))

describe('progressApi normalization', () => {
  it('fills serverUpdatedAt from updatedAt for GET', async () => {
    ;(globalThis as unknown as { location?: { origin?: string } }).location = {
      origin: 'http://localhost',
    }
    const { progressApi } = await import('@/api/progress')

    mockGet.mockResolvedValue({
      isSuccess: true,
      data: {
        bookId: 'b',
        chapterIndex: 3,
        scrollPercent: 12,
        scrollKind: 'chapter',
        updatedAt: 123,
      },
    })

    const res = await progressApi.get('b')
    expect(res.isSuccess).toBe(true)
    expect(res.data.updatedAt).toBe(123)
    expect(res.data.serverUpdatedAt).toBe(123)
  })

  it('fills serverUpdatedAt for PUT progress snapshot', async () => {
    ;(globalThis as unknown as { location?: { origin?: string } }).location = {
      origin: 'http://localhost',
    }
    const { progressApi } = await import('@/api/progress')

    mockPut.mockResolvedValue({
      isSuccess: true,
      data: {
        success: true,
        progress: {
          bookId: 'b',
          chapterIndex: 10,
          scrollPercent: 50,
          scrollKind: 'chapter',
          updatedAt: 999,
        },
      },
    })

    const res = await progressApi.put('b', { chapterIndex: 10 })
    expect(res.isSuccess).toBe(true)
    expect(res.data.progress?.updatedAt).toBe(999)
    expect(res.data.progress?.serverUpdatedAt).toBe(999)
  })
})

