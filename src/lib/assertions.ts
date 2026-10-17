// Turns the user's test configuration into PASS/FAIL checks against a real
// result. A check only passes when it was actually evaluated against a
// response and the comparison held — there is no default-pass path.

import type { ExecResult } from './http-client'
import { deepEqual, parsePath, PathSyntaxError, resolvePath } from './json-path'

export interface FieldCheck {
  id: string
  path: string
  /** Optional expected value. Empty means "field must exist". */
  expected: string
}

export interface TestConfig {
  expectedStatus: string
  maxTimeMs: string
  fieldChecks: FieldCheck[]
}

export interface CheckResult {
  id: string
  kind: 'status' | 'time' | 'field'
  label: string
  passed: boolean
  executed: boolean
  expected: string
  actual: string
  detail?: string
}

export interface TestReport {
  checks: CheckResult[]
  total: number
  passed: number
  failed: number
  percent: number
}

export function emptyTestConfig(): TestConfig {
  return { expectedStatus: '', maxTimeMs: '', fieldChecks: [] }
}

/** Returns human-readable problems with the configuration itself. */
export function validateTestConfig(config: TestConfig): string[] {
  const errors: string[] = []
  const status = config.expectedStatus.trim()
  if (status && (!/^\d{3}$/.test(status) || +status < 100 || +status > 599)) {
    errors.push('Expected status must be a 3-digit code between 100 and 599.')
  }
  const time = config.maxTimeMs.trim()
  if (time && (!/^\d+$/.test(time) || +time <= 0)) {
    errors.push('Max response time must be a positive whole number of milliseconds.')
  }
  for (const f of config.fieldChecks) {
    if (!f.path.trim()) continue
    try {
      parsePath(f.path)
    } catch (e) {
      errors.push(`Field path "${f.path}": ${(e as Error).message}`)
    }
  }
  return errors
}

function activeFieldChecks(config: TestConfig) {
  return config.fieldChecks.filter((f) => f.path.trim() !== '')
}

export function countConfiguredChecks(config: TestConfig): number {
  return (
    (config.expectedStatus.trim() ? 1 : 0) +
    (config.maxTimeMs.trim() ? 1 : 0) +
    activeFieldChecks(config).length
  )
}

function preview(value: unknown): string {
  const text = JSON.stringify(value)
  if (text === undefined) return String(value)
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

function matchesExpected(actual: unknown, expectedRaw: string): boolean {
  try {
    if (deepEqual(JSON.parse(expectedRaw), actual)) return true
  } catch {
    // Not JSON — fall through to a plain string comparison.
  }
  return typeof actual === 'string' && actual === expectedRaw
}

export function runChecks(config: TestConfig, result: ExecResult): TestReport {
  const checks: CheckResult[] = []
  const status = config.expectedStatus.trim()
  const maxTime = config.maxTimeMs.trim()
  const fields = activeFieldChecks(config)

  if (result.kind === 'error') {
    const detail = `Not executed — the request failed (${result.title}).`
    if (status) checks.push({ id: 'status', kind: 'status', label: 'Status code', passed: false, executed: false, expected: status, actual: 'No response', detail })
    if (maxTime) checks.push({ id: 'time', kind: 'time', label: 'Response time', passed: false, executed: false, expected: `≤ ${maxTime} ms`, actual: 'No response', detail })
    for (const f of fields) {
      checks.push({ id: f.id, kind: 'field', label: f.path.trim(), passed: false, executed: false, expected: f.expected.trim() || 'exists', actual: 'No response', detail })
    }
    return summarise(checks)
  }

  if (status) {
    const passed = result.status === Number(status)
    checks.push({
      id: 'status',
      kind: 'status',
      label: 'Status code',
      passed,
      executed: true,
      expected: status,
      actual: `${result.status}${result.statusText ? ` ${result.statusText}` : ''}`,
    })
  }

  if (maxTime) {
    const limit = Number(maxTime)
    checks.push({
      id: 'time',
      kind: 'time',
      label: 'Response time',
      passed: result.timeMs <= limit,
      executed: true,
      expected: `≤ ${limit} ms`,
      actual: `${result.timeMs} ms`,
    })
  }

  if (fields.length) {
    let json: unknown
    let parseError: string | null = null
    if (result.bodyIsBinary || result.body === null) {
      parseError = 'Response body is binary, not JSON.'
    } else if (result.body.trim() === '') {
      parseError = 'Response body is empty.'
    } else {
      try {
        json = JSON.parse(result.body)
      } catch {
        parseError = 'Response body is not valid JSON.'
      }
    }

    for (const f of fields) {
      const label = f.path.trim()
      const expected = f.expected.trim()
      const base = { id: f.id, kind: 'field' as const, label, expected: expected || 'exists' }
      if (parseError) {
        checks.push({ ...base, passed: false, executed: false, actual: 'Unavailable', detail: parseError })
        continue
      }
      let tokens
      try {
        tokens = parsePath(label)
      } catch (e) {
        const msg = e instanceof PathSyntaxError ? e.message : 'Invalid path'
        checks.push({ ...base, passed: false, executed: false, actual: 'Invalid path', detail: msg })
        continue
      }
      const found = resolvePath(json, tokens)
      if (!found.found) {
        checks.push({ ...base, passed: false, executed: true, actual: 'missing', detail: `Not found at ${found.missingAt}` })
        continue
      }
      if (!expected) {
        checks.push({ ...base, passed: true, executed: true, actual: preview(found.value) })
        continue
      }
      checks.push({
        ...base,
        passed: matchesExpected(found.value, expected),
        executed: true,
        actual: preview(found.value),
      })
    }
  }

  return summarise(checks)
}

function summarise(checks: CheckResult[]): TestReport {
  const passed = checks.filter((c) => c.passed && c.executed).length
  const total = checks.length
  return {
    checks,
    total,
    passed,
    failed: total - passed,
    percent: total ? Math.round((passed / total) * 100) : 0,
  }
}
