import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Copy,
  FileWarning,
  Inbox,
  Loader2,
  Radar,
  ShieldAlert,
  Timer,
  WifiOff,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TestReport } from '@/lib/assertions'
import type { ExecError, ExecResponse, ExecResult } from '@/lib/http-client'
import { cn } from '@/lib/utils'

import { CodeView } from './json-view'
import { formatBytes, STATUS_CHIP, statusTone } from './method-style'
import { CountPill, Panel, PanelHeader, PanelTab, PanelTabContent, PanelTabList, PanelTabs } from './panel-tabs'
import { TestResults } from './test-results'

export type ResponseTab = 'body' | 'headers' | 'tests'

export function ResponsePanel({
  result,
  loading,
  liveElapsed,
  report,
  reportStale,
  configuredChecks,
  tab,
  onTabChange,
  onCancel,
  onConfigureTests,
  onRerunChecks,
}: {
  result: ExecResult | null
  loading: boolean
  liveElapsed: number
  report: TestReport | null
  reportStale: boolean
  configuredChecks: number
  tab: ResponseTab
  onTabChange: (t: ResponseTab) => void
  onCancel: () => void
  onConfigureTests: () => void
  onRerunChecks: () => void
}) {
  const response = result?.kind === 'response' ? result : null

  return (
    <Panel aria-busy={loading} className="min-h-[34rem]">
      <PanelHeader title="Response" icon={<Radar className="size-4" />}>
        {response && <CopyBodyButton text={response.body} />}
      </PanelHeader>

      {loading ? (
        <LoadingState elapsed={liveElapsed} onCancel={onCancel} />
      ) : !result ? (
        <EmptyState />
      ) : (
        <>
          <StatusBar result={result} report={report} />
          <PanelTabs value={tab} onValueChange={(v) => onTabChange(v as ResponseTab)} className="flex flex-1 flex-col">
            <PanelTabList>
              <PanelTab value="body">Body</PanelTab>
              <PanelTab value="headers">
                Headers {response && <CountPill>{response.headers.length}</CountPill>}
              </PanelTab>
              <PanelTab value="tests">
                Test Results{' '}
                {report && report.total > 0 && (
                  <CountPill tone={report.failed ? 'fail' : 'success'}>
                    {report.passed}/{report.total}
                  </CountPill>
                )}
              </PanelTab>
            </PanelTabList>
            <PanelTabContent value="body" className="min-h-0">
              {result.kind === 'error' ? <ErrorState error={result} /> : <BodyView response={result} />}
            </PanelTabContent>
            <PanelTabContent value="headers" className="min-h-0">
              {result.kind === 'error' ? (
                <p className="p-6 text-sm text-muted-foreground">No response headers — the request did not complete.</p>
              ) : (
                <HeadersView response={result} />
              )}
            </PanelTabContent>
            <PanelTabContent value="tests" className="min-h-0">
              <TestResults
                report={report}
                configuredCount={configuredChecks}
                hasResponse={!!result}
                stale={reportStale}
                onConfigure={onConfigureTests}
                onRerun={onRerunChecks}
              />
            </PanelTabContent>
          </PanelTabs>
        </>
      )}
    </Panel>
  )
}

function StatusBar({ result, report }: { result: ExecResult; report: TestReport | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 pb-3 font-mono text-xs">
      {result.kind === 'response' ? (
        <span
          className={cn(
            'rounded-md px-2 py-1 text-sm font-semibold ring-1 ring-inset',
            STATUS_CHIP[statusTone(result.status)],
          )}
        >
          {result.status} {result.statusText}
        </span>
      ) : (
        <span className="rounded-md bg-destructive/15 px-2 py-1 text-sm font-semibold text-destructive ring-1 ring-destructive/35 ring-inset">
          {result.title}
        </span>
      )}
      {result.timeMs !== undefined && (
        <Meta label="Time" value={`${result.timeMs} ms`} />
      )}
      {result.kind === 'response' && <Meta label="Size" value={formatBytes(result.sizeBytes)} />}
      <Meta label="Via" value={result.via === 'proxy' ? 'Proxy' : 'Browser'} />
      {result.kind === 'response' && result.redirects.length > 0 && (
        <Meta label="Redirects" value={String(result.redirects.length)} />
      )}
      {report && report.total > 0 && (
        <span className={cn('ml-auto font-sans text-xs font-medium', report.failed ? 'text-destructive' : 'text-success')}>
          {report.passed}/{report.total} checks passed
        </span>
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground">
      {label} <span className="text-foreground">{value}</span>
    </span>
  )
}

function CopyBodyButton({ text }: { text: string | null }) {
  const [copied, setCopied] = React.useState(false)
  if (!text) return null
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error('Clipboard access was blocked by the browser.')
        }
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy body'}
    </Button>
  )
}

function LoadingState({ elapsed, onCancel }: { elapsed: number; onCancel: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4" role="status">
      <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          Waiting for response…
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{elapsed} ms</span>
        </span>
        <Button variant="outline" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="space-y-2.5">
        {[70, 45, 82, 60, 38, 75, 50].map((w, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/10 motion-reduce:animate-none" />
        <div className="relative rounded-full border border-primary/30 bg-primary/10 p-4 text-primary">
          <Inbox className="size-7" />
        </div>
      </div>
      <p className="font-display text-lg font-semibold">No response yet</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Enter a URL and press <span className="font-medium text-foreground">Send</span>, or pick one of the sample
        requests above. Results from the real server will appear here.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Tip: <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">Ctrl</kbd> +{' '}
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">Enter</kbd> sends from anywhere.
      </p>
    </div>
  )
}

const ERROR_ICONS: Partial<Record<ExecError['code'], React.ComponentType<{ className?: string }>>> = {
  CORS_OR_NETWORK: ShieldAlert,
  MIXED_CONTENT: ShieldAlert,
  BLOCKED_DESTINATION: ShieldAlert,
  UNSAFE_REDIRECT: ShieldAlert,
  TIMEOUT: Timer,
  DNS_FAILURE: WifiOff,
  CONNECTION_FAILED: WifiOff,
  PROXY_UNAVAILABLE: WifiOff,
  RESPONSE_TOO_LARGE: FileWarning,
}

function ErrorState({ error }: { error: ExecError }) {
  const Icon = ERROR_ICONS[error.code] ?? AlertTriangle
  return (
    <div className="p-4">
      <div className="rounded-xl border border-destructive/35 bg-destructive/[0.08] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-destructive/15 p-2 text-destructive">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="font-display font-semibold text-destructive">{error.title}</p>
            <p className="text-sm leading-relaxed text-foreground/90">{error.message}</p>
            {error.hint && (
              <p className="rounded-md border border-border bg-background/50 p-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">How to fix: </span>
                {error.hint}
              </p>
            )}
            <p className="font-mono text-[11px] text-muted-foreground">
              code {error.code} · sent via {error.via === 'proxy' ? 'Sentinel proxy' : 'browser (direct)'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function headerValue(r: ExecResponse, name: string) {
  return r.headers.find(([k]) => k.toLowerCase() === name)?.[1] ?? ''
}

function BodyView({ response }: { response: ExecResponse }) {
  const [mode, setMode] = React.useState<'pretty' | 'raw'>('pretty')
  const contentType = headerValue(response, 'content-type')

  const parsed = React.useMemo(() => {
    if (response.body === null || !response.body.trim()) return null
    try {
      return { pretty: JSON.stringify(JSON.parse(response.body), null, 2) }
    } catch {
      return null
    }
  }, [response.body])

  if (response.bodyIsBinary) {
    return (
      <Notice
        title="Binary response"
        text={`${formatBytes(response.sizeBytes)} of ${contentType || 'binary data'} — not displayed as text.`}
      />
    )
  }
  if (!response.body) {
    return <Notice title="Empty body" text={`The server returned ${response.status} with no response body.`} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {contentType || 'no content-type'}
          {!parsed && ' · not JSON, shown as text'}
        </span>
        {parsed && (
          <div role="radiogroup" aria-label="Body view" className="inline-flex rounded-md border border-border p-0.5">
            {(['pretty', 'raw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs capitalize',
                  mode === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
      <CodeView
        text={parsed && mode === 'pretty' ? parsed.pretty : response.body}
        json={!!parsed && mode === 'pretty'}
        className="max-h-[36rem] min-h-0 flex-1 border-t border-border/70 bg-background/40 py-2"
      />
    </div>
  )
}

function HeadersView({ response }: { response: ExecResponse }) {
  return (
    <div className="space-y-3 p-4">
      {response.headersRestricted && (
        <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs leading-relaxed text-info">
          Sent directly from the browser: only CORS-safelisted headers and those listed in the server’s
          Access-Control-Expose-Headers are visible. Use Proxy mode to see every header.
        </p>
      )}
      {response.droppedHeaders.length > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          Not forwarded (managed by the proxy): {response.droppedHeaders.join(', ')}
        </p>
      )}
      {response.redirects.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <ArrowRightLeft className="size-3.5" /> Redirect chain
          </p>
          <ol className="space-y-0.5 font-mono text-muted-foreground">
            {response.redirects.map((r, i) => (
              <li key={i} className="break-all">
                {r.status ? `${r.status} → ` : '→ '}
                {r.location}
              </li>
            ))}
          </ol>
        </div>
      )}
      {response.headers.length === 0 ? (
        <p className="text-sm text-muted-foreground">The response had no readable headers.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-muted/40 text-[11px] tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="w-2/5 px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {response.headers.map(([k, v], i) => (
                <tr key={`${k}-${i}`} className="border-t border-border/60 align-top hover:bg-accent/30">
                  <td className="px-3 py-1.5 break-all text-info">{k}</td>
                  <td className="px-3 py-1.5 break-all text-foreground/90">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
