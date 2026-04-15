export interface ApiInterceptorResponse<T = unknown> {
  headers: Headers
  status: number
  statusText: string
  url: string
  _data?: T
}
