import { clearAuthToken } from '@/utils/authStorage'
import { reportError } from '@/utils/errors'
import { logger } from '@/utils/logger'
import { decode } from '@/utils/msgpack'
import {
  convertToNexusError,
  reportBusinessError,
  reportRequestError,
} from '../errors'
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

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return undefined
}

export function decodeMessagePackResponse(response: ApiInterceptorResponse<unknown>): void {
  const contentType = response.headers.get('content-type')
  if (contentType !== 'application/x-msgpack') {
    return
  }

  try {
    const buffer = response._data
    if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
      response._data = decode(new Uint8Array(buffer))
    }
  } catch (error) {
    logger.error('Failed to decode MessagePack response', { error })
  }
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

  if (response.status === 401) {
    clearAuthToken()
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
