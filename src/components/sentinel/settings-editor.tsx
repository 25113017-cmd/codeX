import { PROXY_LIMITS } from '@/lib/api-types'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function SettingsEditor({
  timeoutMs,
  followRedirects,
  onTimeoutChange,
  onFollowRedirectsChange,
}: {
  timeoutMs: number
  followRedirects: boolean
  onTimeoutChange: (ms: number) => void
  onFollowRedirectsChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="timeout">Request timeout</Label>
          <span className="font-mono text-sm text-primary tabular-nums">{(timeoutMs / 1000).toFixed(0)} s</span>
        </div>
        <input
          id="timeout"
          type="range"
          min={PROXY_LIMITS.minTimeoutMs}
          max={PROXY_LIMITS.maxTimeoutMs}
          step={1000}
          value={timeoutMs}
          onChange={(e) => onTimeoutChange(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        <p className="text-xs text-muted-foreground">
          Covers connecting, redirects and downloading the body. Between {PROXY_LIMITS.minTimeoutMs / 1000} and{' '}
          {PROXY_LIMITS.maxTimeoutMs / 1000} seconds.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="follow-redirects">Follow redirects</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Up to {PROXY_LIMITS.maxRedirects} hops. Each hop is re-checked; HTTPS→HTTP downgrades and redirects to private
            addresses are refused.
          </p>
        </div>
        <Switch id="follow-redirects" checked={followRedirects} onCheckedChange={onFollowRedirectsChange} />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Proxy limits</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>Public http/https hosts only — localhost, private ranges and cloud metadata IPs are blocked.</li>
          <li>Request body up to {PROXY_LIMITS.maxRequestBodyBytes / 1024} KB; response body up to {PROXY_LIMITS.maxResponseBytes / 1024 / 1024} MB.</li>
          <li>Header values are forwarded but never logged or stored.</li>
        </ul>
      </div>
    </div>
  )
}
