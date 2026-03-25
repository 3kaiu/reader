export interface ErrorHandlerInstance {
  handleError: (error: unknown, context?: string, showToast?: boolean) => void
}

export type HeaderBag = Record<string, unknown>

export interface ErrorResponseLike {
  headers?: Headers | HeaderBag | { get?: (name: string) => unknown }
}

export interface HttpErrorLike {
  name?: string
  message?: string
  status?: number
  response?: ErrorResponseLike
  toString?: () => string
}
