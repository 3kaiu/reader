export type ApiMutationResult = {
  isSuccess: boolean
  errorMsg?: string
}

export function normalizeBatchIds(ids: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(ids).filter(Boolean)))
}

export function countSettledSuccesses<T extends ApiMutationResult>(
  results: PromiseSettledResult<T>[]
): number {
  return results.filter(
    result => result.status === 'fulfilled' && result.value.isSuccess
  ).length
}

export function collectSettledSuccessIds<T extends ApiMutationResult>(
  targetIds: string[],
  results: PromiseSettledResult<T>[]
): string[] {
  return targetIds.filter((_, index) => {
    const result = results[index]
    return result?.status === 'fulfilled' && result.value.isSuccess
  })
}

export function getSettledApiError<T extends ApiMutationResult>(
  results: PromiseSettledResult<T>[],
  fallbackMessage: string
): string | undefined {
  const firstFailure = results.find(
    result => result.status === 'rejected' || !result.value.isSuccess
  )

  return firstFailure?.status === 'fulfilled'
    ? firstFailure.value.errorMsg || fallbackMessage
    : firstFailure
      ? fallbackMessage
      : undefined
}

export function getRemainingBatchIds(
  targetIds: string[],
  successIds: string[]
): string[] {
  const successIdSet = new Set(successIds)
  return targetIds.filter(id => !successIdSet.has(id))
}

export function getDeleteBatchStatus(
  successCount: number,
  totalCount: number
): 'deleted' | 'partial' | 'failed' {
  if (successCount === totalCount) {
    return 'deleted'
  }

  if (successCount > 0) {
    return 'partial'
  }

  return 'failed'
}

export function getImportBatchStatus(
  successCount: number,
  totalCount: number
): 'imported' | 'partial' | 'failed' {
  if (successCount === totalCount && totalCount > 0) {
    return 'imported'
  }

  if (successCount > 0) {
    return 'partial'
  }

  return 'failed'
}

export function buildDeleteBatchSummary(
  targetIds: string[],
  deletedIds: string[],
  errorMsg?: string
): {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedIds: string[]
  remainingIds: string[]
  errorMsg?: string
} {
  const remainingIds = getRemainingBatchIds(targetIds, deletedIds)

  return {
    status: getDeleteBatchStatus(deletedIds.length, targetIds.length),
    deletedCount: deletedIds.length,
    failedCount: remainingIds.length,
    deletedIds,
    remainingIds,
    errorMsg,
  }
}
