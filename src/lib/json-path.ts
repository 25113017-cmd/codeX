// Minimal JSON path support for field checks:
//   user.id   items[0].name   items.0.name   data["key.with.dots"]   $.user.id

export type PathToken = string | number

export class PathSyntaxError extends Error {}

export function parsePath(input: string): PathToken[] {
  let path = input.trim()
  if (path.startsWith('$')) path = path.slice(1)
  if (path.startsWith('.')) path = path.slice(1)
  if (!path) throw new PathSyntaxError('Path is empty')

  const tokens: PathToken[] = []
  let i = 0
  let expectSegment = true

  while (i < path.length) {
    const ch = path[i]
    if (ch === '[') {
      const close = path.indexOf(']', i)
      if (close === -1) throw new PathSyntaxError(`Missing "]" in "${input}"`)
      const inner = path.slice(i + 1, close).trim()
      if (/^\d+$/.test(inner)) {
        tokens.push(Number(inner))
      } else if (/^(["']).*\1$/.test(inner) && inner.length >= 2) {
        tokens.push(inner.slice(1, -1))
      } else {
        throw new PathSyntaxError(
          `Invalid bracket "[${inner}]" — use [0] or ["key"]`,
        )
      }
      i = close + 1
      expectSegment = false
    } else if (ch === '.') {
      if (expectSegment) throw new PathSyntaxError(`Empty segment in "${input}"`)
      i++
      expectSegment = true
      if (i === path.length) throw new PathSyntaxError(`Path ends with "."`)
    } else {
      let j = i
      while (j < path.length && path[j] !== '.' && path[j] !== '[') {
        if (path[j] === ']') throw new PathSyntaxError(`Unexpected "]" in "${input}"`)
        j++
      }
      tokens.push(path.slice(i, j))
      i = j
      expectSegment = false
    }
  }
  return tokens
}

export function resolvePath(
  data: unknown,
  tokens: PathToken[],
): { found: true; value: unknown } | { found: false; missingAt: string } {
  let current: unknown = data
  let walked = '$'
  for (const token of tokens) {
    const label = typeof token === 'number' ? `[${token}]` : `.${token}`
    if (current === null || typeof current !== 'object') {
      return { found: false, missingAt: walked + label }
    }
    const key = String(token)
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, missingAt: walked + label }
    }
    current = (current as Record<string, unknown>)[key]
    walked += label
  }
  return { found: true, value: current }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  return ak.length === bk.length && ak.every((k) => k in bo && deepEqual(ao[k], bo[k]))
}
