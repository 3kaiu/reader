import type { ErrorLike } from './types'

export function toErrorLike(error: unknown): ErrorLike {
  if (error instanceof Error) {
    return error
  }

  if (error && typeof error === 'object') {
    return error as ErrorLike
  }

  return {
    message: typeof error === 'string' ? error : undefined,
    toString: () => String(error ?? 'Unknown error'),
  }
}

export function stringifyError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.toString()
  }

  const errorLike = toErrorLike(error)
  if (typeof errorLike.toString === 'function') {
    return errorLike.toString()
  }

  return String(error ?? 'Unknown error')
}

export function getErrorMessageValue(error: unknown): string | undefined {
  const errorLike = toErrorLike(error)

  if (typeof errorLike.message === 'string' && errorLike.message.trim().length > 0) {
    return errorLike.message
  }

  if (typeof errorLike.errorMsg === 'string' && errorLike.errorMsg.trim().length > 0) {
    return errorLike.errorMsg
  }

  if (typeof errorLike.error === 'string' && errorLike.error.trim().length > 0) {
    return errorLike.error
  }

  return undefined
}

export function getErrorStackValue(error: unknown): string | undefined {
  const errorLike = toErrorLike(error)
  return typeof errorLike.stack === 'string' ? errorLike.stack : undefined
}

export function getErrorStatusValue(error: unknown): number | undefined {
  const errorLike = toErrorLike(error)
  return typeof errorLike.status === 'number' ? errorLike.status : undefined
}
