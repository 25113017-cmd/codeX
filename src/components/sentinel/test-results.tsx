import { CheckCircle2, CircleSlash, FlaskConical, RotateCw, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { TestReport } from '@/lib/assertions'
import { cn } from '@/lib/utils'

export function TestResults({
  report,
  configuredCount,
  hasResponse,
  stale,
  onConfigure,
  onRerun,
}: {
  report: TestReport | null
  configuredCount: number
  hasResponse: boolean
  stale: boolean
  onConfigure: () => void
  onRerun: () => void
}) {
  if (!report || report.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <FlaskConical className="size-6" />
        </div>
        <p className="font-medium">
          {configuredCount === 0 ? 'No checks configured' : `${configuredCount} check${configuredCount === 1 ? '' : 's'} ready`}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {configuredCount === 0
            ? 'Add an expected status code or required JSON fields, then send the request to see PASS / FAIL results.'
            : hasResponse
              ? 'Run the checks against the current response, or send the request again.'
              : 'Send the request to run them against the real response.'}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            {configuredCount === 0 ? 'Add checks' : 'Edit checks'}
          </Button>
          {configuredCount > 0 && hasResponse && (
            <Button size="sm" onClick={onRerun}>
              <RotateCw /> Run checks
            </Button>
          )}
        </div>
      </div>
    )
  }

  const allPassed = report.failed === 0

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total" value={report.total} />
        <Stat label="Passed" value={report.passed} tone="success" />
        <Stat label="Failed" value={report.failed} tone={report.failed ? 'fail' : undefined} />
        <Stat label="Pass rate" value={`${report.percent}%`} tone={allPassed ? 'success' : 'fail'} />
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-destructive/25"
        role="progressbar"
        aria-label="Pass rate"
        aria-valuenow={report.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-success transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${report.percent}%` }} />
      </div>

      {stale && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>Checks were edited after this run.</span>
          <Button variant="ghost" size="xs" onClick={onRerun} className="text-warning hover:text-warning">
            <RotateCw /> Re-run on this response
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {report.checks.map((c) => (
          <li
            key={c.id}
            className={cn(
              'rounded-lg border px-3 py-2.5',
              c.passed ? 'border-success/25 bg-success/[0.06]' : 'border-destructive/30 bg-destructive/[0.07]',
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider',
                  c.passed ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive',
                )}
              >
                {c.passed ? <CheckCircle2 className="size-3" /> : c.executed ? <XCircle className="size-3" /> : <CircleSlash className="size-3" />}
                {c.passed ? 'PASS' : 'FAIL'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {c.kind === 'field' ? (
                    <>
                      Field <code className="text-primary">{c.label}</code>
                    </>
                  ) : (
                    c.label
                  )}
                </p>
                <dl className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-mono text-xs">
                  <dt className="text-muted-foreground">expected</dt>
                  <dd className="truncate">{c.expected}</dd>
                  <dt className="text-muted-foreground">actual</dt>
                  <dd className={cn('break-all', !c.passed && 'text-destructive')}>{c.actual}</dd>
                </dl>
                {c.detail && <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'success' | 'fail' }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <p className="text-[11px] tracking-wider text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'font-display text-xl font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'fail' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  )
}
