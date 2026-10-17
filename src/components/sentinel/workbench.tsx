import { AlertCircle, X } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import {
  countConfiguredChecks,
  emptyTestConfig,
  runChecks,
  validateTestConfig,
  type TestConfig,
  type TestReport,
} from '@/lib/assertions'
import { sendRequest, type ExecResult, type SendMode } from '@/lib/http-client'
import { emptyDraft, validateDraft, type RequestDraft } from '@/lib/request-draft'
import { sampleToState, type SampleRequest } from '@/lib/samples'

import { AppHeader } from './app-header'
import { RequestPanel, UrlBar, type RequestTab } from './request-panel'
import { ResponsePanel, type ResponseTab } from './response-panel'
import { SamplesBar } from './samples-bar'

export function Workbench() {
  const [mode, setMode] = React.useState<SendMode>('proxy')
  const [draft, setDraft] = React.useState<RequestDraft>(emptyDraft)
  const [tests, setTests] = React.useState<TestConfig>(emptyTestConfig)
  const [requestTab, setRequestTab] = React.useState<RequestTab>('headers')
  const [responseTab, setResponseTab] = React.useState<ResponseTab>('body')
  const [errors, setErrors] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [liveElapsed, setLiveElapsed] = React.useState(0)
  const [result, setResult] = React.useState<ExecResult | null>(null)
  const [report, setReport] = React.useState<TestReport | null>(null)
  const [testsAtRun, setTestsAtRun] = React.useState<TestConfig | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const configuredChecks = countConfiguredChecks(tests)
  const reportStale = !!testsAtRun && JSON.stringify(testsAtRun) !== JSON.stringify(tests)

  const patchDraft = (patch: Partial<RequestDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (errors.length) setErrors([])
  }

  const send = React.useCallback(async () => {
    if (abortRef.current) return
    const validation = validateDraft(draft)
    const testErrors = validateTestConfig(tests)
    const problems = [...(validation.ok ? [] : validation.errors), ...testErrors]
    if (!validation.ok || testErrors.length) {
      setErrors(problems)
      if (testErrors.length && validation.ok) setRequestTab('tests')
      return
    }
    setErrors([])

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setLiveElapsed(0)
    const started = performance.now()
    const ticker = setInterval(() => setLiveElapsed(Math.round(performance.now() - started)), 50)

    const snapshot = tests
    try {
      const res = await sendRequest(validation.request, mode, controller.signal)
      setResult(res)
      const cancelled = res.kind === 'error' && res.code === 'CANCELLED'
      const configured = cancelled ? 0 : countConfiguredChecks(snapshot)
      const r = configured > 0 ? runChecks(snapshot, res) : null
      setReport(r)
      setTestsAtRun(configured > 0 ? snapshot : null)
      if (res.kind === 'error') setResponseTab('body')
      if (r && r.total > 0) {
        if (r.failed === 0) toast.success(`All ${r.total} checks passed`)
        else toast.error(`${r.failed} of ${r.total} checks failed`)
      }
    } finally {
      clearInterval(ticker)
      abortRef.current = null
      setLoading(false)
    }
  }, [draft, tests, mode])

  const cancel = () => abortRef.current?.abort()

  const clear = () => {
    setDraft(emptyDraft())
    setTests(emptyTestConfig())
    setResult(null)
    setReport(null)
    setTestsAtRun(null)
    setErrors([])
    setRequestTab('headers')
    setResponseTab('body')
  }

  const rerunChecks = () => {
    if (!result) return
    const testErrors = validateTestConfig(tests)
    if (testErrors.length) {
      setErrors(testErrors)
      setRequestTab('tests')
      return
    }
    setReport(countConfiguredChecks(tests) > 0 ? runChecks(tests, result) : null)
    setTestsAtRun(tests)
    setResponseTab('tests')
  }

  const pickSample = (sample: SampleRequest) => {
    const state = sampleToState(sample)
    setDraft(state.draft)
    setTests(state.tests)
    setResult(null)
    setReport(null)
    setTestsAtRun(null)
    setErrors([])
    setRequestTab(state.draft.bodyMode !== 'none' ? 'body' : state.draft.headers.length > 1 ? 'headers' : 'tests')
    toast(`Loaded “${sample.label}”`, { description: 'Press Send to run it against the live API.' })
  }

  // Ctrl/Cmd + Enter sends from anywhere on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void send()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send])

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,oklch(0.82_0.15_175/12%),transparent_65%)]" />
      <AppHeader mode={mode} onModeChange={setMode} />

      <main className="relative mx-auto max-w-content space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Test any API. <span className="text-primary">Trust every result.</span>
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Send real HTTP requests, inspect status, timing, headers and JSON, and assert exactly what you expect —
              each check reports PASS only when it actually ran and held.
            </p>
          </div>
        </div>

        <SamplesBar onPick={pickSample} disabled={loading} />

        <UrlBar
          draft={draft}
          loading={loading}
          onChange={patchDraft}
          onSend={() => void send()}
          onCancel={cancel}
          onClear={clear}
          invalid={errors.length > 0}
        />

        {errors.length > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-destructive">Fix {errors.length === 1 ? 'this' : 'these'} before sending</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/90">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={() => setErrors([])} aria-label="Dismiss errors" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <RequestPanel
            draft={draft}
            tests={tests}
            tab={requestTab}
            onTabChange={setRequestTab}
            onChange={patchDraft}
            onTestsChange={setTests}
            configuredChecks={configuredChecks}
          />
          <ResponsePanel
            result={result}
            loading={loading}
            liveElapsed={liveElapsed}
            report={report}
            reportStale={reportStale}
            configuredChecks={configuredChecks}
            tab={responseTab}
            onTabChange={setResponseTab}
            onCancel={cancel}
            onConfigureTests={() => setRequestTab('tests')}
            onRerunChecks={rerunChecks}
          />
        </div>
      </main>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>API Sentinel — built for the college hackathon. Requests are never stored; secrets are never logged.</p>
          <p>Proxy blocks localhost, private networks &amp; cloud metadata endpoints.</p>
        </div>
      </footer>
    </div>
  )
}
