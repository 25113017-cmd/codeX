// The editable request in the builder, and validation that turns it into an
// ExecRequest (or a list of problems to show the user before anything is sent).

import { METHODS_WITH_BODY, PROXY_LIMITS, type HttpMethod } from './api-types'
import type { ExecRequest } from './http-client'

export interface KeyValueRow {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type BodyMode = 'none' | 'json' | 'text'

export interface RequestDraft {
  method: HttpMethod
  url: string
  headers: KeyValueRow[]
  bodyMode: BodyMode
  body: string
  timeoutMs: number
  followRedirects: boolean
}

let idCounter = 0
export function newId(prefix = 'row'): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export function emptyRow(): KeyValueRow {
  return { id: newId('h'), key: '', value: '', enabled: true }
}

export function emptyDraft(): RequestDraft {
  return {
    method: 'GET',
    url: '',
    headers: [emptyRow()],
    bodyMode: 'none',
    body: '',
    timeoutMs: PROXY_LIMITS.defaultTimeoutMs,
    followRedirects: true,
  }
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export interface JsonCheck {
  ok: boolean
  message?: string
  line?: number
  column?: number
}

export function checkJson(text: string): JsonCheck {
  if (!text.trim()) return { ok: true }
  try {
    JSON.parse(text)
    return { ok: true }
  } catch (e) {
    const message = (e as Error).message
    const lineCol = /line (\d+) column (\d+)/i.exec(message)
    if (lineCol) return { ok: false, message, line: +lineCol[1], column: +lineCol[2] }
    const pos = /position (\d+)/i.exec(message)
    if (pos) {
      const before = text.slice(0, +pos[1])
      const line = before.split('\n').length
      const column = +pos[1] - before.lastIndexOf('\n')
      return { ok: false, message, line, column }
    }
    return { ok: false, message }
  }
}

export function hasHeader(rows: KeyValueRow[], name: string): boolean {
  const lower = name.toLowerCase()
  return rows.some((r) => r.enabled && r.key.trim().toLowerCase() === lower)
}

export function methodSendsBody(method: HttpMethod): boolean {
  return METHODS_WITH_BODY.includes(method)
}

export function validateDraft(
  draft: RequestDraft,
): { ok: true; request: ExecRequest } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const rawUrl = draft.url.trim()

  if (!rawUrl) {
    errors.push('Enter a URL to send the request to.')
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)) {
    errors.push(`URL must start with http:// or https:// — try "https://${rawUrl}".`)
  } else {
    try {
      const u = new URL(rawUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        errors.push(`Only http and https URLs are supported (got ${u.protocol}).`)
      } else if (!u.hostname) {
        errors.push('URL is missing a hostname.')
      }
      if (rawUrl.length > PROXY_LIMITS.maxUrlLength) {
        errors.push(`URL is longer than ${PROXY_LIMITS.maxUrlLength} characters.`)
      }
    } catch {
      errors.push('URL is not valid. Check for spaces or illegal characters.')
    }
  }

  const headers: ExecRequest['headers'] = []
  for (const row of draft.headers) {
    if (!row.enabled) continue
    const key = row.key.trim()
    if (!key) {
      if (row.value.trim()) errors.push('A header has a value but no name.')
      continue
    }
    if (!HEADER_NAME.test(key)) {
      errors.push(`Header name "${key}" contains spaces or invalid characters.`)
      continue
    }
    if (/[\r\n\0]/.test(row.value)) {
      errors.push(`Header "${key}" must not contain line breaks.`)
      continue
    }
    headers.push({ key, value: row.value })
  }
  if (headers.length > PROXY_LIMITS.maxHeaders) {
    errors.push(`At most ${PROXY_LIMITS.maxHeaders} headers can be sent.`)
  }

  let body: string | undefined
  if (methodSendsBody(draft.method) && draft.bodyMode !== 'none' && draft.body.trim()) {
    if (draft.bodyMode === 'json') {
      const check = checkJson(draft.body)
      if (!check.ok) {
        errors.push(
          `Request body is not valid JSON${check.line ? ` (line ${check.line}, column ${check.column})` : ''}: ${check.message}`,
        )
      }
      if (!hasHeader(draft.headers, 'content-type')) {
        headers.push({ key: 'Content-Type', value: 'application/json' })
      }
    } else if (!hasHeader(draft.headers, 'content-type')) {
      headers.push({ key: 'Content-Type', value: 'text/plain; charset=utf-8' })
    }
    body = draft.body
    if (new TextEncoder().encode(body).byteLength > PROXY_LIMITS.maxRequestBodyBytes) {
      errors.push(`Request body is larger than ${PROXY_LIMITS.maxRequestBodyBytes / 1024} KB.`)
    }
  }

  const timeoutMs = Math.round(draft.timeoutMs)
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs < PROXY_LIMITS.minTimeoutMs ||
    timeoutMs > PROXY_LIMITS.maxTimeoutMs
  ) {
    errors.push(
      `Timeout must be between ${PROXY_LIMITS.minTimeoutMs / 1000} and ${PROXY_LIMITS.maxTimeoutMs / 1000} seconds.`,
    )
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    request: {
      url: rawUrl,
      method: draft.method,
      headers,
      body,
      timeoutMs,
      followRedirects: draft.followRedirects,
    },
  }
}

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token|x-access-token)$/i
export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER.test(name.trim())
}

/** Builds a copy-pasteable cURL command. Sensitive header values are masked. */
export function toCurl(draft: RequestDraft, revealSecrets = false): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  const parts = [`curl -X ${draft.method} ${q(draft.url.trim())}`]
  for (const h of draft.headers) {
    if (!h.enabled || !h.key.trim()) continue
    const value = !revealSecrets && isSensitiveHeader(h.key) ? '<redacted>' : h.value
    parts.push(`-H ${q(`${h.key.trim()}: ${value}`)}`)
  }
  if (methodSendsBody(draft.method) && draft.bodyMode !== 'none' && draft.body.trim()) {
    if (draft.bodyMode === 'json' && !hasHeader(draft.headers, 'content-type')) {
      parts.push(`-H ${q('Content-Type: application/json')}`)
    }
    parts.push(`--data-raw ${q(draft.body)}`)
  }
  return parts.join(' \\\n  ')
}
