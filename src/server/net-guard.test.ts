// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { blockedHostnameReason, blockedIpReason } from './net-guard'
import { executeProxyRequest, validateTargetUrl } from './proxy'

describe('blockedIpReason', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
  ])('blocks %s', (ip) => {
    expect(blockedIpReason(ip)).not.toBeNull()
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(blockedIpReason(ip)).toBeNull()
  })
})

describe('blockedHostnameReason', () => {
  it('blocks local and metadata hostnames', () => {
    expect(blockedHostnameReason('localhost')).not.toBeNull()
    expect(blockedHostnameReason('api.localhost')).not.toBeNull()
    expect(blockedHostnameReason('metadata.google.internal')).not.toBeNull()
    expect(blockedHostnameReason('[::1]')).not.toBeNull()
    expect(blockedHostnameReason('intranet')).not.toBeNull()
    expect(blockedHostnameReason('api.github.com')).toBeNull()
  })
})

describe('validateTargetUrl', () => {
  it('normalises obfuscated IPv4 forms before checking', () => {
    expect(() => validateTargetUrl('http://2130706433/')).toThrow() // 127.0.0.1 as an integer
    expect(() => validateTargetUrl('http://0x7f.1/')).toThrow()
  })

  it('rejects non-http schemes and embedded credentials', () => {
    expect(() => validateTargetUrl('file:///etc/passwd')).toThrow()
    expect(() => validateTargetUrl('https://user:pass@example.com')).toThrow()
  })
})

describe('executeProxyRequest', () => {
  it('refuses cloud metadata endpoints without connecting', async () => {
    const res = await executeProxyRequest({ url: 'http://169.254.169.254/latest/meta-data/', method: 'GET', headers: [] })
    expect(res).toMatchObject({ ok: false, code: 'BLOCKED_DESTINATION' })
  })

  it('rejects malformed payloads', async () => {
    const res = await executeProxyRequest({ url: 'https://example.com', method: 'TRACE' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_REQUEST' })
  })
})
