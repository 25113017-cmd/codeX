// Ready-made requests that hit real public APIs, so the tool can be tried
// immediately. Each one also pre-fills checks that demonstrate PASS and FAIL.

import type { HttpMethod } from './api-types'
import type { TestConfig } from './assertions'
import { emptyDraft, newId, type BodyMode, type RequestDraft } from './request-draft'

export interface SampleRequest {
  id: string
  label: string
  description: string
  method: HttpMethod
  url: string
  headers?: Array<[string, string]>
  bodyMode?: BodyMode
  body?: unknown
  timeoutMs?: number
  expectedStatus?: string
  maxTimeMs?: string
  fields?: Array<[string, string]>
}

export const SAMPLES: SampleRequest[] = [
  {
    id: 'get-user',
    label: 'Get user',
    description: 'JSONPlaceholder user with nested fields',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/users/1',
    expectedStatus: '200',
    maxTimeMs: '3000',
    fields: [
      ['id', '1'],
      ['name', ''],
      ['address.geo.lat', ''],
      ['company.name', ''],
    ],
  },
  {
    id: 'create-post',
    label: 'Create post',
    description: 'POST a JSON body, expect 201 Created',
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    bodyMode: 'json',
    body: { title: 'Hello from API Sentinel', body: 'Testing a real POST request.', userId: 1 },
    expectedStatus: '201',
    fields: [
      ['id', ''],
      ['title', 'Hello from API Sentinel'],
    ],
  },
  {
    id: 'update-post',
    label: 'Replace post',
    description: 'PUT a full resource',
    method: 'PUT',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    bodyMode: 'json',
    body: { id: 1, title: 'Updated title', body: 'Replaced content', userId: 1 },
    expectedStatus: '200',
    fields: [['title', 'Updated title']],
  },
  {
    id: 'patch-post',
    label: 'Patch post',
    description: 'PATCH a single field',
    method: 'PATCH',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    bodyMode: 'json',
    body: { title: 'Patched title' },
    expectedStatus: '200',
    fields: [
      ['title', 'Patched title'],
      ['userId', ''],
    ],
  },
  {
    id: 'delete-post',
    label: 'Delete post',
    description: 'DELETE a resource',
    method: 'DELETE',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    expectedStatus: '200',
  },
  {
    id: 'not-found',
    label: 'Failing checks',
    description: 'A 404 — watch the checks fail honestly',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/users/9999',
    expectedStatus: '200',
    fields: [
      ['id', ''],
      ['user.name', ''],
    ],
  },
  {
    id: 'echo-headers',
    label: 'Echo headers',
    description: 'httpbin reflects the headers you send',
    method: 'GET',
    url: 'https://httpbin.org/headers',
    headers: [
      ['X-Sentinel-Demo', 'hello'],
      ['Accept', 'application/json'],
    ],
    expectedStatus: '200',
    fields: [['headers.X-Sentinel-Demo', 'hello']],
  },
  {
    id: 'html',
    label: 'Non-JSON page',
    description: 'HTML response; JSON checks fail',
    method: 'GET',
    url: 'https://example.com/',
    expectedStatus: '200',
    fields: [['title', '']],
  },
  {
    id: 'timeout',
    label: 'Timeout',
    description: 'Server waits 8 s, timeout is 3 s',
    method: 'GET',
    url: 'https://httpbin.org/delay/8',
    timeoutMs: 3000,
    expectedStatus: '200',
  },
  {
    id: 'ssrf',
    label: 'Blocked: metadata',
    description: 'Proxy refuses cloud metadata IPs',
    method: 'GET',
    url: 'http://169.254.169.254/latest/meta-data/',
    expectedStatus: '200',
  },
]

export function sampleToState(sample: SampleRequest): { draft: RequestDraft; tests: TestConfig } {
  const base = emptyDraft()
  const headers = (sample.headers ?? []).map(([key, value]) => ({
    id: newId('h'),
    key,
    value,
    enabled: true,
  }))
  const draft: RequestDraft = {
    ...base,
    method: sample.method,
    url: sample.url,
    headers: [...headers, { id: newId('h'), key: '', value: '', enabled: true }],
    bodyMode: sample.bodyMode ?? 'none',
    body: sample.body === undefined ? '' : JSON.stringify(sample.body, null, 2),
    timeoutMs: sample.timeoutMs ?? base.timeoutMs,
  }
  const tests: TestConfig = {
    expectedStatus: sample.expectedStatus ?? '',
    maxTimeMs: sample.maxTimeMs ?? '',
    fieldChecks: (sample.fields ?? []).map(([path, expected]) => ({
      id: newId('f'),
      path,
      expected,
    })),
  }
  return { draft, tests }
}
