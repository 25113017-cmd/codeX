import { describe, expect, it } from 'vitest'

import { emptyDraft, toCurl, validateDraft, type RequestDraft } from './request-draft'

const draft = (patch: Partial<RequestDraft>): RequestDraft => ({ ...emptyDraft(), ...patch })

describe('validateDraft', () => {
  it('requires an http(s) URL', () => {
    expect(validateDraft(draft({ url: '' })).ok).toBe(false)
    expect(validateDraft(draft({ url: 'api.example.com' })).ok).toBe(false)
    expect(validateDraft(draft({ url: 'ftp://example.com' })).ok).toBe(false)
    expect(validateDraft(draft({ url: 'https://example.com' })).ok).toBe(true)
  })

  it('rejects invalid JSON bodies and adds a JSON content type', () => {
    const bad = validateDraft(draft({ url: 'https://x.io', method: 'POST', bodyMode: 'json', body: '{"a":}' }))
    expect(bad.ok).toBe(false)
    const good = validateDraft(draft({ url: 'https://x.io', method: 'POST', bodyMode: 'json', body: '{"a":1}' }))
    expect(good.ok && good.request.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' })
  })

  it('does not send a body with GET', () => {
    const res = validateDraft(draft({ url: 'https://x.io', method: 'GET', bodyMode: 'json', body: '{"a":1}' }))
    expect(res.ok && res.request.body).toBeUndefined()
  })

  it('rejects invalid header names', () => {
    const res = validateDraft(
      draft({ url: 'https://x.io', headers: [{ id: '1', key: 'Bad Header', value: 'v', enabled: true }] }),
    )
    expect(res.ok).toBe(false)
  })
})

describe('toCurl', () => {
  it('redacts secret headers', () => {
    const cmd = toCurl(
      draft({ url: 'https://x.io', headers: [{ id: '1', key: 'Authorization', value: 'Bearer s3cret', enabled: true }] }),
    )
    expect(cmd).toContain('<redacted>')
    expect(cmd).not.toContain('s3cret')
  })
})
