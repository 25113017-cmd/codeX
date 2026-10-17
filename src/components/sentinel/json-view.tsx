import * as React from 'react'

import { cn } from '@/lib/utils'

const TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g

const MAX_HIGHLIGHT_LINES = 6000

function highlightLine(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (start > last) out.push(line.slice(last, start))
    let cls = 'json-punct'
    if (m[1]) cls = m[2] ? 'json-key' : 'json-string'
    else if (m[3]) cls = 'json-boolean'
    else if (m[4]) cls = 'json-null'
    else if (m[5]) cls = 'json-number'
    if (m[1] && m[2]) {
      out.push(<span key={i++} className="json-key">{m[1]}</span>, <span key={i++} className="json-punct">{m[2]}</span>)
    } else {
      out.push(<span key={i++} className={cls}>{m[0]}</span>)
    }
    last = start + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

/** Read-only code view with line numbers and optional JSON highlighting. */
export function CodeView({ text, json = false, className }: { text: string; json?: boolean; className?: string }) {
  const lines = React.useMemo(() => text.split('\n'), [text])
  const highlight = json && lines.length <= MAX_HIGHLIGHT_LINES

  if (lines.length > MAX_HIGHLIGHT_LINES) {
    return (
      <pre className={cn('scrollbar-thin overflow-auto p-4 font-mono text-[12.5px] leading-5 whitespace-pre text-foreground/90', className)}>
        {text}
      </pre>
    )
  }

  return (
    <div className={cn('scrollbar-thin overflow-auto font-mono text-[12.5px] leading-5', className)}>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => (
            <tr key={idx} className="hover:bg-accent/30">
              <td className="w-px pr-3 pl-4 text-right align-top text-muted-foreground/50 select-none tabular-nums">
                {idx + 1}
              </td>
              <td className="pr-4 align-top break-all whitespace-pre-wrap text-foreground/90">
                {highlight ? highlightLine(line) : line || ' '}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
