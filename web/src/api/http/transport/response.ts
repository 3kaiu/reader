import { reportError } from '@/utils/errors'
import { logger } from '@/utils/logger'
import { convertToNexusError, reportBusinessError, reportRequestError } from '../errors'
import type { InternalApiFetchOptions } from '../types'
import type { ApiInterceptorResponse } from './types'

interface BusinessErrorPayload {
  isSuccess: false
  errorMsg?: string
}

function isBusinessErrorPayload(value: unknown): value is BusinessErrorPayload {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'isSuccess' in value &&
    (value as { isSuccess?: unknown }).isSuccess === false
  )
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return undefined
}

export function decodeMessagePackResponse(response: ApiInterceptorResponse<unknown>): void {
  // MessagePack transport disabled — backend does not support it.
  // Kept as a hook for future implementation when backend adds support.
}

export function handleBusinessResponse(
  response: ApiInterceptorResponse<unknown>,
  options: InternalApiFetchOptions
): void {
  const data = response._data
  if (!isBusinessErrorPayload(data) || options.silent === true) {
    return
  }

  reportBusinessError(data.errorMsg)
}

export function handleHttpResponseError(
  response: ApiInterceptorResponse<unknown> | undefined,
  error: unknown,
  options: InternalApiFetchOptions
): void {
  if (!response) {
    return
  }

  if (response.status < 400 || options.silent === true) {
    return
  }

  const url = options._requestUrl || response.url
  const method = options._method || 'GET'
  const nexusError = convertToNexusError(
    {
      status: response.status,
      message: getErrorMessage(error) || response.statusText,
      response,
    },
    url,
    method
  )

  reportError(nexusError, {
    status: response.status,
    url,
    method,
    responseData: response._data,
  })

  reportRequestError(nexusError)
}
