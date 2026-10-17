import { Code2, Eraser, Loader2, Send, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HTTP_METHODS, type HttpMethod } from '@/lib/api-types'
import type { TestConfig } from '@/lib/assertions'
import { methodSendsBody, toCurl, type RequestDraft } from '@/lib/request-draft'
import { cn } from '@/lib/utils'

import { BodyEditor } from './body-editor'
import { KeyValueEditor } from './key-value-editor'
import { METHOD_TEXT } from './method-style'
import { CountPill, Panel, PanelHeader, PanelTab, PanelTabContent, PanelTabList, PanelTabs } from './panel-tabs'
import { SettingsEditor } from './settings-editor'
import { TestsEditor } from './tests-editor'

export type RequestTab = 'headers' | 'body' | 'tests' | 'settings'

export function UrlBar({
  draft,
  loading,
  onChange,
  onSend,
  onCancel,
  onClear,
  invalid,
}: {
  draft: RequestDraft
  loading: boolean
  onChange: (patch: Partial<RequestDraft>) => void
  onSend: () => void
  onCancel: () => void
  onClear: () => void
  invalid: boolean
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (loading) onCancel()
        else onSend()
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/50',
          invalid ? 'border-destructive/60' : 'border-border',
        )}
      >
        <Select value={draft.method} onValueChange={(v) => onChange({ method: v as HttpMethod })}>
          <SelectTrigger
            aria-label="HTTP method"
            className={cn(
              'h-12! w-[7.5rem] shrink-0 rounded-none border-0 border-r border-border bg-muted/40 font-mono text-sm font-semibold shadow-none focus-visible:ring-0 dark:bg-muted/40',
              METHOD_TEXT[draft.method],
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m} className={cn('font-mono font-semibold', METHOD_TEXT[m])}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          value={draft.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://api.example.com/v1/users/42"
          aria-label="Request URL"
          aria-invalid={invalid}
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
          className="h-12 min-w-0 flex-1 bg-transparent px-4 font-mono text-[14px] outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="h-12 flex-1 px-6 font-semibold sm:flex-none">
          {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}
          {loading ? 'Cancel' : 'Send'}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-12" onClick={onClear} disabled={loading}>
          <Eraser /> Clear
        </Button>
      </div>
    </form>
  )
}

export function RequestPanel({
  draft,
  tests,
  tab,
  onTabChange,
  onChange,
  onTestsChange,
  configuredChecks,
}: {
  draft: RequestDraft
  tests: TestConfig
  tab: RequestTab
  onTabChange: (t: RequestTab) => void
  onChange: (patch: Partial<RequestDraft>) => void
  onTestsChange: (t: TestConfig) => void
  configuredChecks: number
}) {
  const activeHeaders = draft.headers.filter((h) => h.enabled && h.key.trim()).length
  const hasBody = methodSendsBody(draft.method) && draft.bodyMode !== 'none' && draft.body.trim() !== ''

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(toCurl(draft))
      toast.success('cURL command copied', { description: 'Secret header values are replaced with <redacted>.' })
    } catch {
      toast.error('Clipboard access was blocked by the browser.')
    }
  }

  return (
    <Panel className="min-h-[34rem]">
      <PanelHeader title="Request" icon={<SquareTerminal className="size-4" />}>
        <Button variant="ghost" size="xs" onClick={copyCurl} disabled={!draft.url.trim()}>
          <Code2 /> Copy as cURL
        </Button>
      </PanelHeader>
      <PanelTabs value={tab} onValueChange={(v) => onTabChange(v as RequestTab)} className="flex flex-1 flex-col">
        <PanelTabList>
          <PanelTab value="headers">
            Headers {activeHeaders > 0 && <CountPill>{activeHeaders}</CountPill>}
          </PanelTab>
          <PanelTab value="body">
            Body {hasBody && <span className="size-1.5 rounded-full bg-primary" aria-label="has body" />}
          </PanelTab>
          <PanelTab value="tests">
            Tests {configuredChecks > 0 && <CountPill>{configuredChecks}</CountPill>}
          </PanelTab>
          <PanelTab value="settings">Settings</PanelTab>
        </PanelTabList>
        <div className="p-4">
          <PanelTabContent value="headers">
            <KeyValueEditor rows={draft.headers} onChange={(headers) => onChange({ headers })} />
          </PanelTabContent>
          <PanelTabContent value="body">
            <BodyEditor
              method={draft.method}
              mode={draft.bodyMode}
              body={draft.body}
              onModeChange={(bodyMode) => onChange({ bodyMode })}
              onBodyChange={(body) => onChange({ body })}
            />
          </PanelTabContent>
          <PanelTabContent value="tests">
            <TestsEditor config={tests} onChange={onTestsChange} />
          </PanelTabContent>
          <PanelTabContent value="settings">
            <SettingsEditor
              timeoutMs={draft.timeoutMs}
              followRedirects={draft.followRedirects}
              onTimeoutChange={(timeoutMs) => onChange({ timeoutMs })}
              onFollowRedirectsChange={(followRedirects) => onChange({ followRedirects })}
            />
          </PanelTabContent>
        </div>
      </PanelTabs>
    </Panel>
  )
}
