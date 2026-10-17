import { AlignLeft, CheckCircle2, Minimize2, XCircle } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { checkJson, methodSendsBody, type BodyMode, type JsonCheck } from '@/lib/request-draft'
import type { HttpMethod } from '@/lib/api-types'
import { cn } from '@/lib/utils'

const MODES: Array<{ id: BodyMode; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
]

export function BodyEditor({
  method,
  mode,
  body,
  onModeChange,
  onBodyChange,
}: {
  method: HttpMethod
  mode: BodyMode
  body: string
  onModeChange: (m: BodyMode) => void
  onBodyChange: (b: string) => void
}) {
  const check = React.useMemo<JsonCheck>(() => (mode === 'json' ? checkJson(body) : { ok: true }), [mode, body])
  const lineCount = Math.max(body.split('\n').length, 12)
  const gutterRef = React.useRef<HTMLDivElement>(null)

  if (!methodSendsBody(method)) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium">GET requests don’t carry a body</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Switch the method to POST, PUT, PATCH or DELETE to send a request body.
        </p>
      </div>
    )
  }

  const format = (indent: number | undefined) => {
    try {
      onBodyChange(JSON.stringify(JSON.parse(body), null, indent))
    } catch {
      toast.error('Fix the JSON syntax error before formatting.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Body type" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => onModeChange(m.id)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                mode === m.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'json' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => format(2)} disabled={!body.trim()}>
              <AlignLeft /> Format
            </Button>
            <Button variant="ghost" size="xs" onClick={() => format(undefined)} disabled={!body.trim()}>
              <Minimize2 /> Minify
            </Button>
          </div>
        )}
      </div>

      {mode === 'none' ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No body will be sent. Choose <span className="font-medium text-foreground">JSON</span> or{' '}
          <span className="font-medium text-foreground">Text</span> to add one.
        </div>
      ) : (
        <>
          <div
            className={cn(
              'flex overflow-hidden rounded-lg border bg-background/60 focus-within:ring-2 focus-within:ring-ring/40',
              check.ok ? 'border-border' : 'border-destructive/60',
            )}
          >
            <div
              ref={gutterRef}
              aria-hidden
              className="overflow-hidden border-r border-border/70 bg-muted/30 py-3 pr-2 pl-3 text-right font-mono text-[12.5px] leading-5 text-muted-foreground/50 select-none"
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault()
                  const el = e.currentTarget
                  const { selectionStart, selectionEnd } = el
                  const next = body.slice(0, selectionStart) + '  ' + body.slice(selectionEnd)
                  onBodyChange(next)
                  requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
                }
              }}
              spellCheck={false}
              aria-label="Request body"
              aria-invalid={!check.ok}
              placeholder={mode === 'json' ? '{\n  "name": "Ada Lovelace"\n}' : 'Plain text body'}
              rows={12}
              className="scrollbar-thin min-h-[18rem] flex-1 resize-y bg-transparent px-3 py-3 font-mono text-[12.5px] leading-5 whitespace-pre outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          {mode === 'json' && body.trim() && (
            <p className={cn('flex items-start gap-1.5 text-xs', check.ok ? 'text-success' : 'text-destructive')} role="status">
              {check.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <XCircle className="mt-px size-3.5 shrink-0" />}
              {check.ok
                ? 'Valid JSON. Content-Type: application/json is added automatically unless you set one.'
                : `Invalid JSON${check.line ? ` at line ${check.line}, column ${check.column}` : ''} — ${check.message ?? ''}`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
