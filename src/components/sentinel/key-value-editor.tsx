import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { emptyRow, isSensitiveHeader, type KeyValueRow } from '@/lib/request-draft'
import { cn } from '@/lib/utils'

const COMMON_HEADERS = ['Accept', 'Authorization', 'Content-Type', 'X-API-Key', 'User-Agent', 'Cache-Control']

export function KeyValueEditor({
  rows,
  onChange,
}: {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
}) {
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({})

  const update = (id: string, patch: Partial<KeyValueRow>) => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    // Keep one blank row at the end so there is always somewhere to type.
    const last = next[next.length - 1]
    if (!last || last.key || last.value) next.push(emptyRow())
    onChange(next)
  }

  const remove = (id: string) => {
    const next = rows.filter((r) => r.id !== id)
    onChange(next.length ? next : [emptyRow()])
  }

  const addPreset = (name: string) => {
    const blank = rows.find((r) => !r.key && !r.value)
    if (blank) update(blank.id, { key: name })
    else onChange([...rows, { ...emptyRow(), key: name }, emptyRow()])
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_2.25rem] items-center border-b border-border bg-muted/40 px-1 py-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <span className="sr-only">Enabled</span>
          <span />
          <span className="px-2">Key</span>
          <span className="px-2">Value</span>
          <span />
        </div>
        {rows.map((row, idx) => {
          const sensitive = isSensitiveHeader(row.key)
          const isBlank = !row.key && !row.value
          return (
            <div
              key={row.id}
              className={cn(
                'grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_2.25rem] items-center border-b border-border/60 px-1 last:border-b-0',
                !row.enabled && 'opacity-50',
              )}
            >
              <div className="flex justify-center">
                <Checkbox
                  checked={row.enabled}
                  onCheckedChange={(v) => update(row.id, { enabled: v === true })}
                  aria-label={`Send header ${row.key || idx + 1}`}
                  disabled={isBlank}
                />
              </div>
              <input
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                placeholder="Header name"
                aria-label={`Header ${idx + 1} name`}
                spellCheck={false}
                autoComplete="off"
                className="h-9 min-w-0 bg-transparent px-2 font-mono text-[13px] outline-none placeholder:text-muted-foreground/50 focus:bg-accent/30"
              />
              <div className="flex min-w-0 items-center">
                <input
                  value={row.value}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  placeholder="Value"
                  aria-label={`Header ${idx + 1} value`}
                  type={sensitive && !revealed[row.id] ? 'password' : 'text'}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none placeholder:text-muted-foreground/50 focus:bg-accent/30"
                />
                {sensitive && (
                  <button
                    type="button"
                    onClick={() => setRevealed((s) => ({ ...s, [row.id]: !s[row.id] }))}
                    className="mr-1 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={revealed[row.id] ? 'Hide secret value' : 'Show secret value'}
                  >
                    {revealed[row.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(row.id)}
                aria-label={`Remove header ${row.key || idx + 1}`}
                disabled={isBlank && rows.length === 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Quick add:</span>
        {COMMON_HEADERS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => addPreset(h)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="size-3" />
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}
