// Server-side HTTP proxy used by netlify/functions/proxy.mts.
//
// Safety properties:
//  - Only http: and https: targets; no credentials embedded in URLs.
//  - Hostnames and every resolved IP are checked against private, loopback,
//    link-local (cloud metadata), CGNAT, multicast and reserved ranges. The
//    check runs inside the socket's DNS lookup, so DNS rebinding can't slip
//    a private address in between "validate" and "connect".
//  - Redirects are followed manually (max 5); each hop is re-validated,
//    HTTPS→HTTP downgrades are refused, and credentials are stripped when the
//    origin changes.
//  - One overall timeout covers all hops and the body download.
//  - Response bodies are capped after decompression (zip-bomb safe).
//  - Header values are never logged.

import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import zlib from 'node:zlib'
import { z } from 'zod'

import {
  HTTP_METHODS,
  METHODS_WITH_BODY,
  PROXY_LIMITS,
  type ProxyErrorCode,
  type ProxyFailure,
  type ProxyRequestPayload,
  type ProxyResult,
  type ProxySuccess,
  type RedirectHop,
} from '../lib/api-types'
import {
  BlockedDestinationError,
  blockedHostnameReason,
  guardedLookup,
} from './net-guard'

export class ProxyError extends Error {
  code: ProxyErrorCode
  constructor(code: ProxyErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const HTTP_STATUS_FOR: Record<ProxyErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_URL: 400,
  BLOCKED_DESTINATION: 403,
  UNSAFE_REDIRECT: 403,
  REQUEST_TOO_LARGE: 413,
  RESPONSE_TOO_LARGE: 502,
  DNS_FAILURE: 502,
  CONNECTION_FAILED: 502,
  TLS_ERROR: 502,
  TOO_MANY_REDIRECTS: 502,
  TIMEOUT: 504,
  INTERNAL: 500,
}

const payloadSchema = z.object({
  url: z.string().trim().min(1, 'URL is required').max(PROXY_LIMITS.maxUrlLength),
  method: z.enum(HTTP_METHODS),
  headers: z
    .array(z.object({ key: z.string().max(256), value: z.string().max(8192) }))
    .max(PROXY_LIMITS.maxHeaders, `At most ${PROXY_LIMITS.maxHeaders} headers`)
    .default([]),
  body: z.string().optional(),
  timeoutMs: z
    .number()
    .int()
    .min(PROXY_LIMITS.minTimeoutMs)
    .max(PROXY_LIMITS.maxTimeoutMs)
    .optional(),
  followRedirects: z.boolean().optional(),
})

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const INVALID_HEADER_VALUE = /[\r\n\0]/

/** Headers the proxy controls itself or that could be used to spoof hops. */
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'expect',
  'accept-encoding',
  'proxy-authorization',
  'proxy-connection',
  'forwarded',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
])

const CREDENTIAL_HEADERS = ['authorization', 'cookie']
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const TEXT_TYPE =
  /^(text\/|application\/(json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml|x-yaml|ld\+json|problem\+json)|[^;]*\+(json|xml))/i

const USER_AGENT = 'API-Sentinel/1.0 (+https://api-testing-tool-cc4776.netlify.app)'

type OutgoingHeaders = Record<string, string | string[]>

export function validateTargetUrl(raw: string, context: 'request' | 'redirect' = 'request'): URL {
  const errorCode = context === 'request' ? 'INVALID_URL' : 'UNSAFE_REDIRECT'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ProxyError(errorCode, `"${raw.slice(0, 200)}" is not a valid absolute URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError(errorCode, `Only http:// and https:// URLs are allowed (got ${url.protocol}).`)
  }
  if (url.username || url.password) {
    throw new ProxyError(
      errorCode,
      'URLs with embedded credentials (user:pass@host) are not supported. Send an Authorization header instead.',
    )
  }
  const reason = blockedHostnameReason(url.hostname)
  if (reason) {
    throw new ProxyError(
      context === 'request' ? 'BLOCKED_DESTINATION' : 'UNSAFE_REDIRECT',
      `${context === 'redirect' ? 'Redirect target refused: ' : ''}${reason}.`,
    )
  }
  return url
}

function buildHeaders(payload: ProxyRequestPayload, body: Buffer | undefined) {
  const headers: OutgoingHeaders = {}
  const dropped: string[] = []
  for (const { key, value } of payload.headers) {
    const name = key.trim()
    if (!name) continue
    if (!HEADER_NAME.test(name)) {
      throw new ProxyError('INVALID_REQUEST', `Header name "${name.slice(0, 60)}" contains invalid characters.`)
    }
    if (INVALID_HEADER_VALUE.test(value)) {
      throw new ProxyError('INVALID_REQUEST', `Header "${name}" contains a line break or NUL character.`)
    }
    const lower = name.toLowerCase()
    if (FORBIDDEN_REQUEST_HEADERS.has(lower)) {
      dropped.push(name)
      continue
    }
    const existing = headers[lower]
    if (existing === undefined) headers[lower] = value
    else headers[lower] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  headers['user-agent'] ??= USER_AGENT
  headers['accept'] ??= '*/*'
  headers['accept-encoding'] = 'gzip, deflate, br'
  if (body) headers['content-length'] = String(body.byteLength)
  return { headers, dropped }
}

function performHop(
  url: URL,
  method: string,
  headers: OutgoingHeaders,
  body: Buffer | undefined,
  signal: AbortSignal,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(
      url,
      {
        method,
        headers,
        signal,
        agent: false, // fresh connection per hop so every hop goes through guardedLookup
        lookup: guardedLookup as unknown as LookupFunction,
      },
      resolve,
    )
    req.on('error', reject)
    req.end(body)
  })
}

async function readBody(res: http.IncomingMessage, limit: number): Promise<Buffer> {
  const encoding = String(res.headers['content-encoding'] ?? '').trim().toLowerCase()
  const declared = Number(res.headers['content-length'])
  if (!encoding && Number.isFinite(declared) && declared > limit) {
    res.destroy()
    throw tooLarge()
  }

  let decoder: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null
  if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip()
  else if (encoding === 'deflate') decoder = zlib.createInflate()
  else if (encoding === 'br') decoder = zlib.createBrotliDecompress()

  const source: Readable = decoder ? (pipeline(res, decoder, () => {}) as Readable) : res
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of source) {
    const buf = chunk as Buffer
    total += buf.byteLength
    if (total > limit) {
      res.destroy()
      decoder?.destroy()
      throw tooLarge()
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks, total)
}

function tooLarge() {
  return new ProxyError(
    'RESPONSE_TOO_LARGE',
    `Response body exceeded the ${PROXY_LIMITS.maxResponseBytes / 1024 / 1024} MB limit and was discarded.`,
  )
}

function decodeBody(buffer: Buffer, contentType: string): string | null {
  const isText = contentType
    ? TEXT_TYPE.test(contentType)
    : !buffer.subarray(0, 1024).includes(0)
  if (!isText) return null
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, '')
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function mapNetworkError(err: unknown, timedOut: boolean, timeoutMs: number, afterRedirect: boolean): ProxyError {
  if (err instanceof ProxyError) return err
  if (timedOut) return new ProxyError('TIMEOUT', `No complete response within ${timeoutMs} ms.`)
  if (err instanceof BlockedDestinationError) {
    return new ProxyError(
      afterRedirect ? 'UNSAFE_REDIRECT' : 'BLOCKED_DESTINATION',
      `${afterRedirect ? 'Redirect target refused: ' : ''}${err.message}.`,
    )
  }
  const e = err as NodeJS.ErrnoException
  const code = e?.code ?? ''
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') {
    return new ProxyError('DNS_FAILURE', `Could not resolve host (${code}).`)
  }
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code)) {
    return new ProxyError('TLS_ERROR', `TLS handshake failed (${code}).`)
  }
  if (code.startsWith('HPE_')) {
    return new ProxyError('CONNECTION_FAILED', `The server sent an invalid HTTP response (${code}).`)
  }
  if (code.startsWith('Z_') || code === 'ERR_PADDING_1' || /decompress|incorrect header/i.test(e?.message ?? '')) {
    return new ProxyError('CONNECTION_FAILED', 'The response body could not be decompressed.')
  }
  if (code) {
    const friendly: Record<string, string> = {
      ECONNREFUSED: 'The server refused the connection',
      ECONNRESET: 'The connection was reset by the server',
      EHOSTUNREACH: 'The host is unreachable',
      ENETUNREACH: 'The network is unreachable',
      ETIMEDOUT: 'The TCP connection timed out',
      EPIPE: 'The connection closed while sending the request',
      ERR_STREAM_PREMATURE_CLOSE: 'The connection closed before the response finished',
    }
    return new ProxyError('CONNECTION_FAILED', `${friendly[code] ?? 'Network error'} (${code}).`)
  }
  return new ProxyError('INTERNAL', 'The proxy could not complete the request.')
}

export async function executeProxyRequest(input: unknown): Promise<ProxyResult> {
  const parsed = payloadSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail('INVALID_REQUEST', `${issue.path.join('.') || 'request'}: ${issue.message}`)
  }
  const payload = parsed.data

  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  const timeoutMs = payload.timeoutMs ?? PROXY_LIMITS.defaultTimeoutMs
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const redirects: RedirectHop[] = []
  try {
    let current = validateTargetUrl(payload.url)
    let method: string = payload.method
    let body =
      payload.body !== undefined && METHODS_WITH_BODY.includes(payload.method)
        ? Buffer.from(payload.body, 'utf8')
        : undefined
    if (body && body.byteLength > PROXY_LIMITS.maxRequestBodyBytes) {
      throw new ProxyError(
        'REQUEST_TOO_LARGE',
        `Request body is ${(body.byteLength / 1024).toFixed(0)} KB; the limit is ${PROXY_LIMITS.maxRequestBodyBytes / 1024} KB.`,
      )
    }
    const { headers, dropped } = buildHeaders(payload, body)

    for (;;) {
      const res = await performHop(current, method, headers, body, controller.signal)
      const status = res.statusCode ?? 0
      const location = res.headers.location

      if (payload.followRedirects !== false && REDIRECT_STATUSES.has(status) && location) {
        res.resume() // discard the redirect body
        if (redirects.length >= PROXY_LIMITS.maxRedirects) {
          throw new ProxyError('TOO_MANY_REDIRECTS', `Stopped after ${PROXY_LIMITS.maxRedirects} redirects.`)
        }
        let nextRaw: string
        try {
          nextRaw = new URL(location, current).toString()
        } catch {
          throw new ProxyError('UNSAFE_REDIRECT', 'The server sent an invalid Location header.')
        }
        const next = validateTargetUrl(nextRaw, 'redirect')
        if (current.protocol === 'https:' && next.protocol === 'http:') {
          throw new ProxyError('UNSAFE_REDIRECT', 'Refused to follow a redirect that downgrades HTTPS to plain HTTP.')
        }
        redirects.push({ status, location: next.toString() })

        if ((status === 303 && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')) {
          method = 'GET'
          body = undefined
          delete headers['content-length']
          delete headers['content-type']
        }
        if (next.origin !== current.origin) {
          for (const h of CREDENTIAL_HEADERS) delete headers[h]
        }
        current = next
        continue
      }

      const buffer = await readBody(res, PROXY_LIMITS.maxResponseBytes)
      const contentType = String(res.headers['content-type'] ?? '')
      const text = decodeBody(buffer, contentType)
      const responseHeaders: Array<[string, string]> = []
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        responseHeaders.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]])
      }
      const success: ProxySuccess = {
        ok: true,
        status,
        statusText: res.statusMessage ?? '',
        headers: responseHeaders,
        body: text,
        bodyIsBinary: text === null,
        sizeBytes: buffer.byteLength,
        timeMs: elapsed(),
        finalUrl: current.toString(),
        redirects,
        droppedHeaders: dropped,
      }
      return success
    }
  } catch (err) {
    const mapped = mapNetworkError(err, timedOut, timeoutMs, redirects.length > 0)
    if (mapped.code === 'INTERNAL') {
      // Log only the error class — never URLs, headers or bodies, which may hold secrets.
      console.error('[proxy] internal error:', (err as Error)?.name ?? 'unknown')
    }
    return fail(mapped.code, mapped.message, elapsed())
  } finally {
    clearTimeout(timer)
  }
}

function fail(code: ProxyErrorCode, message: string, timeMs?: number): ProxyFailure {
  return { ok: false, code, message, timeMs }
}

function json(result: ProxyResult, extraHeaders: Record<string, string> = {}): Response {
  const status = result.ok ? 200 : HTTP_STATUS_FOR[result.code]
  return Response.json(result, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  })
}

/** HTTP entry point: validates the incoming call, then runs the proxy request. */
export async function handleProxyHttpRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json(fail('INVALID_REQUEST', 'Use POST with a JSON body.'), { allow: 'POST' })
  }

  // Only accept browser calls from this site. No CORS headers are ever sent,
  // so other origins can't read responses either.
  const origin = req.headers.get('origin')
  if (origin) {
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === new URL(req.url).host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return json(fail('INVALID_REQUEST', 'Cross-origin use of this proxy is not allowed.'))
  }

  if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
    return json(fail('INVALID_REQUEST', 'Content-Type must be application/json.'))
  }

  const maxEnvelope = PROXY_LIMITS.maxRequestBodyBytes * 2 + 256 * 1024
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxEnvelope) {
    return json(fail('REQUEST_TOO_LARGE', 'Request is too large for the proxy.'))
  }
  const raw = await req.text()
  if (raw.length > maxEnvelope) {
    return json(fail('REQUEST_TOO_LARGE', 'Request is too large for the proxy.'))
  }

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return json(fail('INVALID_REQUEST', 'Body must be valid JSON.'))
  }
  return json(await executeProxyRequest(input))
}
