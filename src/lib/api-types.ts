// Types shared by the browser client and the proxy function.

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const METHODS_WITH_BODY: ReadonlyArray<HttpMethod> = [
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]

/** Limits enforced by the proxy. The UI mirrors them so users see them up front. */
export const PROXY_LIMITS = {
  maxUrlLength: 4096,
  maxHeaders: 50,
  maxRequestBodyBytes: 1024 * 1024, // 1 MB
  maxResponseBytes: 2 * 1024 * 1024, // 2 MB (after decompression)
  maxRedirects: 5,
  minTimeoutMs: 1000,
  maxTimeoutMs: 20000,
  defaultTimeoutMs: 10000,
} as const

export interface HeaderPair {
  key: string
  value: string
}

/** Body posted by the browser to the proxy function. */
export interface ProxyRequestPayload {
  url: string
  method: HttpMethod
  headers: HeaderPair[]
  body?: string
  timeoutMs?: number
  followRedirects?: boolean
}

export interface RedirectHop {
  status: number
  location: string
}

export interface ProxySuccess {
  ok: true
  status: number
  statusText: string
  headers: Array<[string, string]>
  /** Decoded text body, or null when the body is binary. */
  body: string | null
  bodyIsBinary: boolean
  sizeBytes: number
  timeMs: number
  finalUrl: string
  redirects: RedirectHop[]
  /** Request headers the proxy refused to forward (names only). */
  droppedHeaders: string[]
}

export type ProxyErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_URL'
  | 'BLOCKED_DESTINATION'
  | 'DNS_FAILURE'
  | 'TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'TLS_ERROR'
  | 'REQUEST_TOO_LARGE'
  | 'RESPONSE_TOO_LARGE'
  | 'TOO_MANY_REDIRECTS'
  | 'UNSAFE_REDIRECT'
  | 'INTERNAL'

export interface ProxyFailure {
  ok: false
  code: ProxyErrorCode
  message: string
  timeMs?: number
}

export type ProxyResult = ProxySuccess | ProxyFailure
