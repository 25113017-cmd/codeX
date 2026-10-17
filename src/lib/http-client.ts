// Sends requests either through the Sentinel proxy function or directly from
// the browser, and normalises both into one ExecResult shape for the UI.

import {
  PROXY_LIMITS,
  type HeaderPair,
  type HttpMethod,
  type ProxyErrorCode,
  type ProxyResult,
  type RedirectHop,
} from './api-types'

export const PROXY_ENDPOINT = '/.netlify/functions/proxy'

export type SendMode = 'proxy' | 'direct'

export interface ExecRequest {
  url: string
  method: HttpMethod
  headers: HeaderPair[]
  body?: string
  timeoutMs: number
  followRedirects: boolean
}

export interface ExecResponse {
  kind: 'response'
  via: SendMode
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string | null
  bodyIsBinary: boolean
  sizeBytes: number
  timeMs: number
  finalUrl: string
  redirects: RedirectHop[]
  droppedHeaders: string[]
  /** Direct mode: browsers hide non-safelisted headers unless the server exposes them. */
  headersRestricted: boolean
}

export type ClientErrorCode =
  | ProxyErrorCode
  | 'CORS_OR_NETWORK'
  | 'MIXED_CONTENT'
  | 'PROXY_UNAVAILABLE'
  | 'CANCELLED'

export interface ExecError {
  kind: 'error'
  via: SendMode
  code: ClientErrorCode
  title: string
  message: string
  hint?: string
  timeMs?: number
}

export type ExecResult = ExecResponse | ExecError

const ERROR_TITLES: Record<ClientErrorCode, string> = {
  INVALID_REQUEST: 'Invalid request',
  INVALID_URL: 'Invalid URL',
  BLOCKED_DESTINATION: 'Destination blocked by proxy',
  DNS_FAILURE: 'Host not found',
  TIMEOUT: 'Request timed out',
  CONNECTION_FAILED: 'Connection failed',
  TLS_ERROR: 'TLS / certificate error',
  REQUEST_TOO_LARGE: 'Request body too large',
  RESPONSE_TOO_LARGE: 'Response too large',
  TOO_MANY_REDIRECTS: 'Too many redirects',
  UNSAFE_REDIRECT: 'Unsafe redirect blocked',
  INTERNAL: 'Proxy error',
  CORS_OR_NETWORK: 'Blocked by CORS or network failure',
  MIXED_CONTENT: 'Mixed content blocked',
  PROXY_UNAVAILABLE: 'Proxy unavailable',
  CANCELLED: 'Request cancelled',
}

const ERROR_HINTS: Partial<Record<ClientErrorCode, string>> = {
  BLOCKED_DESTINATION:
    'For safety the proxy only reaches public internet hosts. Localhost, private networks and cloud metadata addresses are refused.',
  DNS_FAILURE: 'Check the hostname for typos, or confirm the domain exists.',
  TIMEOUT: 'Raise the timeout in the Settings tab (max 20 s), or check whether the server is slow or down.',
  CONNECTION_FAILED: 'The server refused or dropped the connection. Confirm the host and port are correct.',
  TLS_ERROR: 'The server’s HTTPS certificate is invalid, expired or self-signed.',
  RESPONSE_TOO_LARGE: `Responses are capped at ${PROXY_LIMITS.maxResponseBytes / 1024 / 1024} MB. Try a narrower query or pagination.`,
  UNSAFE_REDIRECT:
    'The server redirected to a non-HTTP(S) URL or downgraded HTTPS to HTTP. Turn off "Follow redirects" to inspect the 3xx response.',
  TOO_MANY_REDIRECTS: `More than ${PROXY_LIMITS.maxRedirects} redirects. Disable "Follow redirects" to inspect the first hop.`,
}

function errorResult(
  via: SendMode,
  code: ClientErrorCode,
  message: string,
  extra: Partial<ExecError> = {},
): ExecError {
  return {
    kind: 'error',
    via,
    code,
    title: ERROR_TITLES[code],
    message,
    hint: ERROR_HINTS[code],
    ...extra,
  }
}

export async function sendRequest(
  req: ExecRequest,
  mode: SendMode,
  signal: AbortSignal,
): Promise<ExecResult> {
  return mode === 'proxy' ? sendViaProxy(req, signal) : sendDirect(req, signal)
}

async function sendViaProxy(
  req: ExecRequest,
  signal: AbortSignal,
): Promise<ExecResult> {
  let res: Response
  try {
    res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch (err) {
    if (signal.aborted) return errorResult('proxy', 'CANCELLED', 'You cancelled the request.')
    return errorResult(
      'proxy',
      'PROXY_UNAVAILABLE',
      `Could not reach the Sentinel proxy (${(err as Error).message}).`,
      { hint: 'Check your internet connection. When running locally, start the app with `netlify dev` so the proxy function is served.' },
    )
  }

  let data: ProxyResult
  try {
    data = (await res.json()) as ProxyResult
    if (typeof data !== 'object' || data === null || !('ok' in data)) throw new Error('bad shape')
  } catch {
    if (signal.aborted) return errorResult('proxy', 'CANCELLED', 'You cancelled the request.')
    return errorResult(
      'proxy',
      'PROXY_UNAVAILABLE',
      `The proxy returned an unexpected response (HTTP ${res.status}).`,
      {
        hint:
          res.status === 404
            ? 'The proxy function is not deployed at this address. Locally, run `netlify dev` instead of `npm run dev`, or switch to Direct mode.'
            : 'The serverless function may have exceeded its platform time limit. Try a shorter timeout.',
      },
    )
  }

  if (!data.ok) {
    return errorResult('proxy', data.code, data.message, { timeMs: data.timeMs })
  }
  return {
    kind: 'response',
    via: 'proxy',
    status: data.status,
    statusText: data.statusText,
    headers: data.headers,
    body: data.body,
    bodyIsBinary: data.bodyIsBinary,
    sizeBytes: data.sizeBytes,
    timeMs: data.timeMs,
    finalUrl: data.finalUrl,
    redirects: data.redirects,
    droppedHeaders: data.droppedHeaders,
    headersRestricted: false,
  }
}

const TEXT_TYPE = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|ld\+json|problem\+json)|[^;]*\+(json|xml))/i

async function sendDirect(
  req: ExecRequest,
  outerSignal: AbortSignal,
): Promise<ExecResult> {
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    req.url.toLowerCase().startsWith('http:')
  ) {
    return errorResult(
      'direct',
      'MIXED_CONTENT',
      'This page is served over HTTPS, so the browser refuses to call a plain HTTP URL directly.',
      { hint: 'Switch to Proxy mode, or use the https:// version of the API.' },
    )
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, req.timeoutMs)
  const onOuterAbort = () => controller.abort()
  outerSignal.addEventListener('abort', onOuterAbort)

  const headers = new Headers()
  for (const h of req.headers) headers.append(h.key, h.value)

  const started = performance.now()
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers,
      body: req.body,
      signal: controller.signal,
      redirect: req.followRedirects ? 'follow' : 'manual',
      credentials: 'omit',
    })

    if (res.type === 'opaqueredirect') {
      return errorResult(
        'direct',
        'CORS_OR_NETWORK',
        'The server answered with a redirect, but browsers hide redirect responses from scripts when "Follow redirects" is off.',
        { hint: 'Use Proxy mode to inspect the raw 3xx response.' },
      )
    }

    const buffer = await readLimited(res, PROXY_LIMITS.maxResponseBytes)
    const timeMs = Math.round(performance.now() - started)
    if (buffer === null) {
      return errorResult(
        'direct',
        'RESPONSE_TOO_LARGE',
        `Response exceeded ${PROXY_LIMITS.maxResponseBytes / 1024 / 1024} MB and was discarded.`,
        { timeMs },
      )
    }

    const contentType = res.headers.get('content-type') ?? ''
    const isText = contentType === '' || TEXT_TYPE.test(contentType)
    const headerList: Array<[string, string]> = []
    res.headers.forEach((value, key) => headerList.push([key, value]))

    return {
      kind: 'response',
      via: 'direct',
      status: res.status,
      statusText: res.statusText,
      headers: headerList,
      body: isText ? new TextDecoder().decode(buffer) : null,
      bodyIsBinary: !isText,
      sizeBytes: buffer.byteLength,
      timeMs,
      finalUrl: res.url || req.url,
      redirects: res.redirected ? [{ status: 0, location: res.url }] : [],
      droppedHeaders: [],
      headersRestricted: true,
    }
  } catch (err) {
    const timeMs = Math.round(performance.now() - started)
    if (timedOut) {
      return errorResult('direct', 'TIMEOUT', `No response within ${req.timeoutMs} ms.`, { timeMs })
    }
    if (outerSignal.aborted) {
      return errorResult('direct', 'CANCELLED', 'You cancelled the request.', { timeMs })
    }
    // Browsers deliberately give scripts no detail here: a CORS rejection,
    // DNS failure and refused connection all surface as the same TypeError.
    return errorResult(
      'direct',
      'CORS_OR_NETWORK',
      `The browser blocked the request or could not reach the server (${(err as Error).message}). The most common cause is CORS: the API did not send an Access-Control-Allow-Origin header that permits this site, so the browser hid the response.`,
      {
        timeMs,
        hint: 'Switch to Proxy mode — the request is sent server-side, where CORS does not apply. If it still fails there, the proxy will report the exact network error.',
      },
    )
  } finally {
    clearTimeout(timer)
    outerSignal.removeEventListener('abort', onOuterAbort)
  }
}

/** Reads a fetch body, returning null if it grows beyond `limit` bytes. */
async function readLimited(res: Response, limit: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
