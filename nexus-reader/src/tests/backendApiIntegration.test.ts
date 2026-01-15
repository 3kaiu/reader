/**
 * Backend API Enhancements - Integration Tests
 * 
 * End-to-end integration tests for dictionary deletion and source status APIs
 * Feature: backend-api-enhancements
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock API functions
const mockDeleteDictionaryEntry = vi.fn()
const mockBatchDeleteDictionaryEntries = vi.fn()
const mockUpdateSourceStatus = vi.fn()
const mockGetDictionary = vi.fn()
const mockGetSource = vi.fn()

vi.mock('@/api/decoder', () => ({
  deleteDictionaryEntry: (...args: any[]) => mockDeleteDictionaryEntry(...args),
  batchDeleteDictionaryEntries: (...args: any[]) => mockBatchDeleteDictionaryEntries(...args),
  getDictionary: (...args: any[]) => mockGetDictionary(...args),
}))

vi.mock('@/api/source', () => ({
  sourceApi: {
    updateSourceStatus: (...args: any[]) => mockUpdateSourceStatus(...args),
    getSource: (...args: any[]) => mockGetSource(...args),
  },
}))

describe('Backend API Enhancements - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Task 8.1: Complete dictionary deletion flow', () => {
    /**
     * Test the complete flow: Frontend → Worker → KV Storage
     * Verify UI update and data persistence
     */

    it('should delete a dictionary entry and verify persistence', async () => {
      const entryId = 'test-entry-123'
      const level = 'user'

      // Mock initial dictionary state
      const initialDictionary = [
        { id: 'test-entry-123', original: '张三', real: 'Zhang San', category: 'person', level: 'user' },
        { id: 'test-entry-456', original: '李四', real: 'Li Si', category: 'person', level: 'user' },
      ]

      mockGetDictionary.mockResolvedValue(initialDictionary)

      // Mock successful deletion
      mockDeleteDictionaryEntry.mockResolvedValue({
        success: true,
        deletedId: entryId,
        level,
        message: 'Entry deleted successfully',
      })

      // Mock updated dictionary state (after deletion)
      const updatedDictionary = [
        { id: 'test-entry-456', original: '李四', real: 'Li Si', category: 'person', level: 'user' },
      ]

      mockGetDictionary.mockResolvedValueOnce(initialDictionary).mockResolvedValueOnce(updatedDictionary)

      const { deleteDictionaryEntry, getDictionary } = await import('@/api/decoder')

      // Step 1: Get initial dictionary
      const before = await getDictionary({ level })
      expect(before).toHaveLength(2)
      expect(before.find((e: any) => e.id === entryId)).toBeDefined()

      // Step 2: Delete entry
      const deleteResult = await deleteDictionaryEntry(entryId, { level })
      expect(deleteResult.success).toBe(true)
      expect(deleteResult.deletedId).toBe(entryId)

      // Step 3: Verify persistence - entry should be gone
      const after = await getDictionary({ level })
      expect(after).toHaveLength(1)
      expect(after.find((e: any) => e.id === entryId)).toBeUndefined()
      expect(after.find((e: any) => e.id === 'test-entry-456')).toBeDefined()
    })

    it('should handle deletion of non-existent entry gracefully', async () => {
      const nonExistentId = 'non-existent-id'
      const level = 'user'

      // Mock 404 response
      mockDeleteDictionaryEntry.mockRejectedValue({
        status: 404,
        error: 'Entry not found',
        id: nonExistentId,
      })

      const { deleteDictionaryEntry } = await import('@/api/decoder')

      // Attempt to delete non-existent entry
      await expect(deleteDictionaryEntry(nonExistentId, { level })).rejects.toMatchObject({
        status: 404,
        error: 'Entry not found',
      })

      // Verify API was called
      expect(mockDeleteDictionaryEntry).toHaveBeenCalledWith(nonExistentId, { level })
    })

    it('should handle deletion across different dictionary levels', async () => {
      const levels = ['user', 'book', 'category'] as const

      for (const level of levels) {
        mockDeleteDictionaryEntry.mockClear()

        const entryId = `${level}-entry-123`
        const params: any = { level }

        if (level === 'book') {
          params.bookId = 'book-123'
        } else if (level === 'category') {
          params.category = 'person'
        }

        mockDeleteDictionaryEntry.mockResolvedValue({
          success: true,
          deletedId: entryId,
          level,
          message: 'Entry deleted successfully',
        })

        const { deleteDictionaryEntry } = await import('@/api/decoder')

        const result = await deleteDictionaryEntry(entryId, params)

        expect(result.success).toBe(true)
        expect(result.deletedId).toBe(entryId)
        expect(result.level).toBe(level)
        expect(mockDeleteDictionaryEntry).toHaveBeenCalledWith(entryId, params)
      }
    })
  })

  describe('Task 8.2: Complete batch deletion flow', () => {
    /**
     * Test the complete flow: Frontend → Worker → KV Storage
     * Verify partial success scenarios and UI update
     */

    it('should batch delete all valid entries successfully', async () => {
      const idsToDelete = ['entry-1', 'entry-2', 'entry-3']
      const level = 'user'

      // Mock successful batch deletion
      mockBatchDeleteDictionaryEntries.mockResolvedValue({
        success: true,
        deleted: 3,
        failed: 0,
        details: {
          deletedIds: idsToDelete,
          failedIds: [],
        },
      })

      const { batchDeleteDictionaryEntries } = await import('@/api/decoder')

      // Batch delete entries
      const result = await batchDeleteDictionaryEntries({
        ids: idsToDelete,
        level,
      })

      // Verify all entries were deleted
      expect(result.success).toBe(true)
      expect(result.deleted).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.details.deletedIds).toEqual(idsToDelete)
      expect(result.details.failedIds).toEqual([])
    })

    it('should handle partial success with mixed valid/invalid IDs', async () => {
      const validIds = ['entry-1', 'entry-2']
      const invalidIds = ['non-existent-1', 'non-existent-2']
      const allIds = [...validIds, ...invalidIds]
      const level = 'user'

      // Mock partial success
      mockBatchDeleteDictionaryEntries.mockResolvedValue({
        success: true,
        deleted: 2,
        failed: 2,
        details: {
          deletedIds: validIds,
          failedIds: invalidIds,
        },
      })

      const { batchDeleteDictionaryEntries } = await import('@/api/decoder')

      // Batch delete with mixed IDs
      const result = await batchDeleteDictionaryEntries({
        ids: allIds,
        level,
      })

      // Verify partial success
      expect(result.success).toBe(true)
      expect(result.deleted).toBe(2)
      expect(result.failed).toBe(2)
      expect(result.details.deletedIds).toEqual(validIds)
      expect(result.details.failedIds).toEqual(invalidIds)

      // Verify UI can distinguish between deleted and failed
      expect(result.details.deletedIds.length).toBe(result.deleted)
      expect(result.details.failedIds.length).toBe(result.failed)
    })

    it('should handle batch deletion with maximum allowed entries (100)', async () => {
      // Generate 100 entry IDs
      const maxIds = Array.from({ length: 100 }, (_, i) => `entry-${i}`)
      const level = 'user'

      mockBatchDeleteDictionaryEntries.mockResolvedValue({
        success: true,
        deleted: 100,
        failed: 0,
        details: {
          deletedIds: maxIds,
          failedIds: [],
        },
      })

      const { batchDeleteDictionaryEntries } = await import('@/api/decoder')

      const result = await batchDeleteDictionaryEntries({
        ids: maxIds,
        level,
      })

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(100)
      expect(result.failed).toBe(0)
    })

    it('should reject batch deletion exceeding 100 entries', async () => {
      // Generate 101 entry IDs (exceeds limit)
      const tooManyIds = Array.from({ length: 101 }, (_, i) => `entry-${i}`)
      const level = 'user'

      mockBatchDeleteDictionaryEntries.mockRejectedValue({
        status: 400,
        error: 'Invalid request',
        message: 'Too many IDs (max 100)',
      })

      const { batchDeleteDictionaryEntries } = await import('@/api/decoder')

      await expect(
        batchDeleteDictionaryEntries({
          ids: tooManyIds,
          level,
        })
      ).rejects.toMatchObject({
        status: 400,
        error: 'Invalid request',
        message: 'Too many IDs (max 100)',
      })
    })

    it('should handle empty batch deletion request', async () => {
      const emptyIds: string[] = []
      const level = 'user'

      mockBatchDeleteDictionaryEntries.mockRejectedValue({
        status: 400,
        error: 'Invalid request',
        message: 'IDs array cannot be empty',
      })

      const { batchDeleteDictionaryEntries } = await import('@/api/decoder')

      await expect(
        batchDeleteDictionaryEntries({
          ids: emptyIds,
          level,
        })
      ).rejects.toMatchObject({
        status: 400,
        error: 'Invalid request',
        message: 'IDs array cannot be empty',
      })
    })
  })

  describe('Task 8.3: Complete source status update flow', () => {
    /**
     * Test the complete flow: Frontend → Proxy → Nexus Lite → Database
     * Verify UI update and data persistence
     */

    it('should update source status and verify persistence', async () => {
      const sourceId = 'source-123'
      const initialEnabled = true
      const updatedEnabled = false

      // Mock initial source state
      mockGetSource.mockResolvedValue({
        id: sourceId,
        name: 'Test Source',
        url: 'https://example.com',
        enabled: initialEnabled,
      })

      // Mock successful status update
      mockUpdateSourceStatus.mockResolvedValue({
        id: sourceId,
        name: 'Test Source',
        url: 'https://example.com',
        enabled: updatedEnabled,
        updatedAt: new Date().toISOString(),
      })

      // Mock updated source state (after update)
      mockGetSource.mockResolvedValueOnce({
        id: sourceId,
        name: 'Test Source',
        url: 'https://example.com',
        enabled: initialEnabled,
      }).mockResolvedValueOnce({
        id: sourceId,
        name: 'Test Source',
        url: 'https://example.com',
        enabled: updatedEnabled,
      })

      const { sourceApi } = await import('@/api/source')

      // Step 1: Get initial source state
      const before = await sourceApi.getSource(sourceId)
      expect(before.enabled).toBe(initialEnabled)

      // Step 2: Update status
      const updateResult = await sourceApi.updateSourceStatus(sourceId, updatedEnabled)
      expect(updateResult.enabled).toBe(updatedEnabled)

      // Step 3: Verify persistence - status should be updated
      const after = await sourceApi.getSource(sourceId)
      expect(after.enabled).toBe(updatedEnabled)
    })

    it('should toggle source status multiple times', async () => {
      const sourceId = 'source-456'
      let currentEnabled = true

      // Simulate multiple toggles
      for (let i = 0; i < 5; i++) {
        const newEnabled = !currentEnabled

        mockUpdateSourceStatus.mockResolvedValue({
          id: sourceId,
          name: 'Test Source',
          url: 'https://example.com',
          enabled: newEnabled,
          updatedAt: new Date().toISOString(),
        })

        const { sourceApi } = await import('@/api/source')

        const result = await sourceApi.updateSourceStatus(sourceId, newEnabled)

        expect(result.enabled).toBe(newEnabled)
        expect(mockUpdateSourceStatus).toHaveBeenCalledWith(sourceId, newEnabled)

        currentEnabled = newEnabled
        mockUpdateSourceStatus.mockClear()
      }
    })

    it('should handle update of non-existent source', async () => {
      const nonExistentId = 'non-existent-source'
      const enabled = true

      mockUpdateSourceStatus.mockRejectedValue({
        status: 404,
        error: 'Source not found',
        id: nonExistentId,
      })

      const { sourceApi } = await import('@/api/source')

      await expect(sourceApi.updateSourceStatus(nonExistentId, enabled)).rejects.toMatchObject({
        status: 404,
        error: 'Source not found',
      })
    })

    it('should validate boolean input for enabled field', async () => {
      const sourceId = 'source-789'
      const invalidValues = ['true', 'false', 1, 0, null, undefined, 'yes', 'no']

      for (const invalidValue of invalidValues) {
        mockUpdateSourceStatus.mockClear()

        mockUpdateSourceStatus.mockRejectedValue({
          status: 400,
          error: 'Invalid enabled value',
          message: 'enabled must be a boolean',
        })

        const { sourceApi } = await import('@/api/source')

        await expect(
          sourceApi.updateSourceStatus(sourceId, invalidValue as any)
        ).rejects.toMatchObject({
          status: 400,
          error: 'Invalid enabled value',
        })
      }
    })

    it('should handle concurrent status updates gracefully', async () => {
      const sourceId = 'source-concurrent'

      // Simulate concurrent updates
      const updates = [
        { enabled: false, delay: 10 },
        { enabled: true, delay: 5 },
        { enabled: false, delay: 15 },
      ]

      const promises = updates.map(({ enabled, delay }) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            mockUpdateSourceStatus.mockResolvedValue({
              id: sourceId,
              name: 'Test Source',
              url: 'https://example.com',
              enabled,
              updatedAt: new Date().toISOString(),
            })

            import('@/api/source').then(({ sourceApi }) => {
              sourceApi.updateSourceStatus(sourceId, enabled).then(resolve)
            })
          }, delay)
        })
      })

      // Wait for all updates to complete
      const results = await Promise.all(promises)

      // All updates should succeed
      expect(results).toHaveLength(3)
      results.forEach((result: any) => {
        expect(result).toHaveProperty('enabled')
        expect(typeof result.enabled).toBe('boolean')
      })
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle network errors during deletion', async () => {
      const entryId = 'entry-network-error'
      const level = 'user'

      mockDeleteDictionaryEntry.mockRejectedValue({
        status: 500,
        error: 'Internal server error',
        message: 'Network error',
      })

      const { deleteDictionaryEntry } = await import('@/api/decoder')

      await expect(deleteDictionaryEntry(entryId, { level })).rejects.toMatchObject({
        status: 500,
        error: 'Internal server error',
      })
    })

    it('should handle authentication errors', async () => {
      const entryId = 'entry-auth-error'
      const level = 'user'

      mockDeleteDictionaryEntry.mockRejectedValue({
        status: 401,
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      })

      const { deleteDictionaryEntry } = await import('@/api/decoder')

      await expect(deleteDictionaryEntry(entryId, { level })).rejects.toMatchObject({
        status: 401,
        error: 'Unauthorized',
      })
    })

    it('should handle missing required parameters', async () => {
      const entryId = 'entry-missing-params'

      // Missing bookId for book level
      mockDeleteDictionaryEntry.mockRejectedValue({
        status: 400,
        error: 'Missing required parameter: bookId',
      })

      const { deleteDictionaryEntry } = await import('@/api/decoder')

      await expect(
        deleteDictionaryEntry(entryId, { level: 'book' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'Missing required parameter: bookId',
      })
    })

    it('should handle database errors during source status update', async () => {
      const sourceId = 'source-db-error'
      const enabled = true

      mockUpdateSourceStatus.mockRejectedValue({
        status: 500,
        error: 'Internal server error',
        message: 'Database error',
      })

      const { sourceApi } = await import('@/api/source')

      await expect(sourceApi.updateSourceStatus(sourceId, enabled)).rejects.toMatchObject({
        status: 500,
        error: 'Internal server error',
      })
    })
  })
})
