import * as TabsPrimitive from '@radix-ui/react-tabs'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export const PanelTabs = TabsPrimitive.Root

export function PanelTabList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'scrollbar-thin flex items-end gap-1 overflow-x-auto border-b border-border px-3',
        className,
      )}
      {...props}
    />
  )
}

export function PanelTab({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:rounded-t-md data-[state=active]:border-primary data-[state=active]:text-foreground motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function PanelTabContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 outline-none', className)} {...props} />
}

export function CountPill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'success' | 'fail' }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px font-mono text-[11px] leading-4 tabular-nums',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'fail' && 'bg-destructive/15 text-destructive',
      )}
    >
      {children}
    </span>
  )
}

export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/85 shadow-[0_1px_0_0_oklch(1_0_0/4%)_inset,0_20px_40px_-24px_oklch(0_0_0/60%)] backdrop-blur',
        className,
      )}
      {...props}
    />
  )
}

export function PanelHeader({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-foreground uppercase">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}
