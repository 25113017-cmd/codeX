// SSRF protection for the proxy: decides which hosts and IP addresses the
// proxy may connect to. The guarded DNS lookup is passed to node:http so the
// check runs on the exact address used for the connection (defeating DNS
// rebinding between "check" and "connect").

import dns from 'node:dns'
import net from 'node:net'

export class BlockedDestinationError extends Error {
  code = 'ESENTINEL_BLOCKED'
}

const BLOCKED_V4: Array<[string, number, string]> = [
  ['0.0.0.0', 8, 'unspecified/"this" network'],
  ['10.0.0.0', 8, 'private network'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'loopback (localhost)'],
  ['169.254.0.0', 16, 'link-local / cloud metadata'],
  ['172.16.0.0', 12, 'private network'],
  ['192.0.0.0', 24, 'IETF protocol assignments'],
  ['192.0.2.0', 24, 'documentation range'],
  ['192.88.99.0', 24, '6to4 relay'],
  ['192.168.0.0', 16, 'private network'],
  ['198.18.0.0', 15, 'benchmarking range'],
  ['198.51.100.0', 24, 'documentation range'],
  ['203.0.113.0', 24, 'documentation range'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
]

const BLOCKED_V6: Array<[string, number, string]> = [
  ['::', 128, 'unspecified'],
  ['::1', 128, 'loopback (localhost)'],
  ['::', 96, 'IPv4-compatible'],
  ['64:ff9b::', 96, 'NAT64'],
  ['64:ff9b:1::', 48, 'NAT64'],
  ['100::', 64, 'discard-only'],
  ['2001::', 32, 'Teredo'],
  ['2001:db8::', 32, 'documentation range'],
  ['2002::', 16, '6to4'],
  ['fc00::', 7, 'unique local (private)'],
  ['fe80::', 10, 'link-local'],
  ['fec0::', 10, 'site-local'],
  ['ff00::', 8, 'multicast'],
]

let blockList: { list: net.BlockList; reasons: Array<[net.BlockList, string]> } | null = null

function getBlockList() {
  if (blockList) return blockList
  const list = new net.BlockList()
  const reasons: Array<[net.BlockList, string]> = []
  for (const [addr, prefix, reason] of BLOCKED_V4) {
    list.addSubnet(addr, prefix, 'ipv4')
    const single = new net.BlockList()
    single.addSubnet(addr, prefix, 'ipv4')
    reasons.push([single, reason])
  }
  for (const [addr, prefix, reason] of BLOCKED_V6) {
    list.addSubnet(addr, prefix, 'ipv6')
    const single = new net.BlockList()
    single.addSubnet(addr, prefix, 'ipv6')
    reasons.push([single, reason])
  }
  blockList = { list, reasons }
  return blockList
}

/** Extracts the IPv4 address embedded in an IPv4-mapped IPv6 address (::ffff:a.b.c.d). */
function unmapIPv4(ip: string): string | null {
  let canonical: string
  try {
    // The WHATWG URL parser serialises IPv6 in canonical compressed hex form,
    // so every spelling of a mapped address becomes "::ffff:xxxx:xxxx".
    canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  } catch {
    return null
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
  if (!hex) return null
  const hi = parseInt(hex[1], 16)
  const lo = parseInt(hex[2], 16)
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
}

/** Returns a reason string when the IP must not be contacted, otherwise null. */
export function blockedIpReason(rawIp: string): string | null {
  const ip = rawIp.replace(/^\[|\]$/g, '').split('%')[0]
  const family = net.isIP(ip)
  if (family === 0) return 'not a valid IP address'

  if (family === 6) {
    const mapped = unmapIPv4(ip)
    if (mapped) return blockedIpReason(mapped)
  }

  const { list, reasons } = getBlockList()
  const type = family === 4 ? 'ipv4' : 'ipv6'
  if (!list.check(ip, type)) return null
  for (const [single, reason] of reasons) {
    if (single.check(ip, type)) return reason
  }
  return 'non-public address'
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa']
const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
])

/** Hostname-level check, run before any DNS lookup. */
export function blockedHostnameReason(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTS.has(host)) return `"${host}" is a local or metadata hostname`
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return `"${host}" is a local/internal hostname`
  }
  const bare = host.replace(/^\[|\]$/g, '')
  if (net.isIP(bare)) {
    const reason = blockedIpReason(bare)
    if (reason) return `${bare} is a ${reason} address`
  } else if (!host.includes('.')) {
    return `"${host}" is not a fully-qualified public hostname`
  }
  return null
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void

/** Drop-in replacement for dns.lookup that rejects non-public addresses. */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions | number | LookupCallback,
  maybeCallback?: LookupCallback,
): void {
  const callback = (typeof options === 'function' ? options : maybeCallback) as LookupCallback
  const opts: dns.LookupOptions =
    typeof options === 'object' && options !== null
      ? options
      : typeof options === 'number'
        ? { family: options }
        : {}

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0) {
      const e: NodeJS.ErrnoException = new Error(`No addresses for ${hostname}`)
      e.code = 'ENOTFOUND'
      return callback(e, '')
    }
    for (const a of list) {
      const reason = blockedIpReason(a.address)
      if (reason) {
        return callback(
          new BlockedDestinationError(`${hostname} resolves to ${a.address}, a ${reason} address`),
          '',
        )
      }
    }
    if (opts.all) callback(null, list)
    else callback(null, list[0].address, list[0].family)
  })
}
