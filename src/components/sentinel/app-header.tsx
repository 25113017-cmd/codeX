import { Globe, Server, ShieldCheck } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SendMode } from '@/lib/http-client'
import { cn } from '@/lib/utils'

export function AppHeader({ mode, onModeChange }: { mode: SendMode; onModeChange: (m: SendMode) => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/30">
            <ShieldCheck className="size-[18px]" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-bold tracking-tight">API Sentinel</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">API Testing Tool</span>
          </span>
        </a>

        <div role="radiogroup" aria-label="How requests are sent" className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
          <ModeButton
            active={mode === 'proxy'}
            onClick={() => onModeChange('proxy')}
            icon={<Server className="size-3.5" />}
            label="Proxy"
            tip="Sent from a secure serverless proxy. No CORS limits, full headers, SSRF-protected."
          />
          <ModeButton
            active={mode === 'direct'}
            onClick={() => onModeChange('direct')}
            icon={<Globe className="size-3.5" />}
            label="Direct"
            tip="Sent straight from your browser. Subject to CORS; can only see exposed headers."
          />
        </div>
      </div>
    </header>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  tip,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  tip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="radio"
          aria-checked={active}
          onClick={onClick}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none',
            active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {icon}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{tip}</TooltipContent>
    </Tooltip>
  )
}
