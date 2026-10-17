import { Sparkles } from 'lucide-react'

import { SAMPLES, type SampleRequest } from '@/lib/samples'
import { cn } from '@/lib/utils'

import { METHOD_CHIP } from './method-style'

export function SamplesBar({ onPick, disabled }: { onPick: (s: SampleRequest) => void; disabled: boolean }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Sparkles className="size-3.5 text-primary" /> Try a sample request
      </p>
      <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            title={s.description}
            className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card/70 py-1.5 pr-3 pl-1.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-card disabled:opacity-50 motion-reduce:transition-none"
          >
            <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ring-1 ring-inset', METHOD_CHIP[s.method])}>
              {s.method}
            </span>
            <span className="font-medium text-foreground/90 group-hover:text-foreground">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
