import { describe, expect, it } from 'vitest'

import { runChecks, validateTestConfig, type TestConfig } from './assertions'
import type { ExecResponse, ExecResult } from './http-client'
import { parsePath, resolvePath } from './json-path'

const response = (body: string | null, status = 200, timeMs = 120): ExecResponse => ({
  kind: 'response',
  via: 'proxy',
  status,
  statusText: 'OK',
  headers: [['content-type', 'application/json']],
  body,
  bodyIsBinary: body === null,
  sizeBytes: body?.length ?? 0,
  timeMs,
  finalUrl: 'https://api.example.com',
  redirects: [],
  droppedHeaders: [],
  headersRestricted: false,
})

const config = (partial: Partial<TestConfig>): TestConfig => ({
  expectedStatus: '',
  maxTimeMs: '',
  fieldChecks: [],
  ...partial,
})

describe('json path', () => {
  it('parses dot, bracket and quoted segments', () => {
    expect(parsePath('user.id')).toEqual(['user', 'id'])
    expect(parsePath('$.items[0].name')).toEqual(['items', 0, 'name'])
    expect(parsePath('data["a.b"].c')).toEqual(['data', 'a.b', 'c'])
  })

  it('rejects malformed paths', () => {
    expect(() => parsePath('user..id')).toThrow()
    expect(() => parsePath('items[x]')).toThrow()
    expect(() => parsePath('a.')).toThrow()
  })

  it('distinguishes null values from missing keys', () => {
    expect(resolvePath({ a: null }, ['a'])).toEqual({ found: true, value: null })
    expect(resolvePath({ a: null }, ['a', 'b']).found).toBe(false)
    expect(resolvePath({ items: [{ id: 3 }] }, ['items', 0, 'id'])).toEqual({ found: true, value: 3 })
  })
})

describe('runChecks', () => {
  const body = JSON.stringify({ user: { id: 1, name: 'Ada', tags: ['x'] } })

  it('passes only checks that actually hold', () => {
    const report = runChecks(
      config({
        expectedStatus: '200',
        maxTimeMs: '100',
        fieldChecks: [
          { id: 'a', path: 'user.id', expected: '1' },
          { id: 'b', path: 'user.name', expected: 'Ada' },
          { id: 'c', path: 'user.email', expected: '' },
          { id: 'd', path: 'user.tags', expected: '["x"]' },
        ],
      }),
      response(body, 200, 120),
    )
    expect(report.checks.map((c) => [c.id, c.passed])).toEqual([
      ['status', true],
      ['time', false],
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', true],
    ])
    expect(report).toMatchObject({ total: 6, passed: 4, failed: 2, percent: 67 })
  })

  it('fails every check when the request did not complete', () => {
    const error: ExecResult = {
      kind: 'error',
      via: 'proxy',
      code: 'TIMEOUT',
      title: 'Request timed out',
      message: 'x',
    }
    const report = runChecks(
      config({ expectedStatus: '200', fieldChecks: [{ id: 'a', path: 'id', expected: '' }] }),
      error,
    )
    expect(report.passed).toBe(0)
    expect(report.checks.every((c) => !c.passed && !c.executed)).toBe(true)
  })

  it('fails field checks on non-JSON bodies', () => {
    const report = runChecks(
      config({ fieldChecks: [{ id: 'a', path: 'title', expected: '' }] }),
      response('<html></html>'),
    )
    expect(report.checks[0]).toMatchObject({ passed: false, detail: 'Response body is not valid JSON.' })
  })

  it('reports a status mismatch', () => {
    const report = runChecks(config({ expectedStatus: '200' }), response('{}', 404))
    expect(report.checks[0].passed).toBe(false)
  })
})

describe('validateTestConfig', () => {
  it('flags invalid inputs', () => {
    expect(validateTestConfig(config({ expectedStatus: '99' }))).toHaveLength(1)
    expect(validateTestConfig(config({ fieldChecks: [{ id: 'a', path: 'a..b', expected: '' }] }))).toHaveLength(1)
    expect(validateTestConfig(config({ expectedStatus: '201' }))).toHaveLength(0)
  })
})
