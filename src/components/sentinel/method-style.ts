import type { HttpMethod } from '@/lib/api-types'

export const METHOD_TEXT: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-300',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
}

export const METHOD_CHIP: Record<HttpMethod, string> = {
  GET: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
  POST: 'bg-amber-300/10 text-amber-200 ring-amber-300/25',
  PUT: 'bg-sky-400/10 text-sky-300 ring-sky-400/25',
  PATCH: 'bg-violet-400/10 text-violet-300 ring-violet-400/25',
  DELETE: 'bg-rose-400/10 text-rose-300 ring-rose-400/25',
}

export function statusTone(status: number): 'success' | 'redirect' | 'client' | 'server' | 'info' {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'redirect'
  if (status >= 400 && status < 500) return 'client'
  if (status >= 500) return 'server'
  return 'info'
}

export const STATUS_CHIP = {
  success: 'bg-success/12 text-success ring-success/30',
  redirect: 'bg-info/12 text-info ring-info/30',
  client: 'bg-warning/12 text-warning ring-warning/30',
  server: 'bg-destructive/15 text-destructive ring-destructive/35',
  info: 'bg-muted text-muted-foreground ring-border',
} as const

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
