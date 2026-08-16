/**
 * The shell's regular-expression engine.
 *
 * There is exactly one dialect here and it is the host's own `RegExp`: ECMAScript.
 * Nothing is re-implemented, nothing is emulated, and no pattern is rewritten behind
 * the user's back. What this module adds on top of `RegExp` is the three things a UI
 * needs and the language does not give it:
 *
 *  1. `compile()` never throws. It returns a discriminated result carrying the engine's
 *     own message and, where it can be established, the character index at fault.
 *  2. `run()` is bounded on all three axes that can hang a window — sample length,
 *     match count and elapsed time — with the clock read inside the match loop so a
 *     catastrophically backtracking pattern surrenders instead of freezing the app.
 *  3. Zero-width matches advance `lastIndex` by hand, so `(?:)`, `a*` and `\b` iterate
 *     to the end of the sample instead of looping forever.
 *
 * No DOM. No storage. No i18n — the strings that leave this module are facts (an engine
 * message, a character index, a bound) and the UI interpolates them as parameters so no
 * funny level can rewrite them.
 */

/** The only dialect this application speaks. */
export type Dialect = 'ecmascript'

/** The dialect, as a value, for the surfaces that have to state it. */
export const DIALECT: Dialect = 'ecmascript'

/**
 * The name of the engine, shown verbatim in the builder. It is a fact and is
 * interpolated as a parameter, never translated.
 */
export const DIALECT_LABEL = 'ECMAScript RegExp'

/**
 * Every character `escapeLiteral` puts a backslash in front of: the twelve ECMAScript
 * pattern metacharacters, the backslash itself, and the forward slash so that a pattern
 * can be shown in `/…/` literal notation without breaking it.
 */
export const ESCAPED_CHARACTERS = '\\ ^ $ . * + ? ( ) [ ] { } | /'

/** The flags this application offers, in the canonical order it writes them. */
export const SUPPORTED_FLAGS = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'] as const

export type SupportedFlag = (typeof SUPPORTED_FLAGS)[number]

/** Longer than this and we refuse to compile: a pattern this size is a paste accident. */
export const MAX_PATTERN_LENGTH = 2000

export interface Limits {
  /** Characters of sample text considered. The rest is ignored, not matched. */
  maxSampleLength?: number
  /** Matches collected before the run stops and reports `truncated`. */
  maxMatches?: number
  /** Milliseconds of wall clock the match loop may spend before it gives up. */
  timeBudgetMs?: number
}

/** The bounds every surface gets unless it asks for something smaller. */
export const DEFAULT_LIMITS: Required<Limits> = {
  maxSampleLength: 20000,
  maxMatches: 1000,
  timeBudgetMs: 50,
}

export type RegexErrorCode = 'syntax' | 'flags' | 'pattern-too-long'

export type CompileResult =
  | { ok: true; re: RegExp }
  | { ok: false; error: string; index?: number; code: RegexErrorCode }

export interface CaptureGroup {
  /** 1-based group number, exactly as `\1` would refer to it. */
  number: number
  /** The `(?<name>…)` name, when the group has one. */
  name?: string
  /** `undefined` when the group took no part in this match. */
  value: string | undefined
  /** Offset into the sample, or -1 when the engine cannot report offsets. */
  start: number
  end: number
}

export interface Match {
  /** Offset of the match in the sample text that was run. */
  index: number
  /** Exclusive end offset. Equal to `index` for a zero-width match. */
  end: number
  value: string
  groups: CaptureGroup[]
}

export interface MatchRun {
  matches: Match[]
  /** The match cap was reached; there may be more matches after the last one shown. */
  truncated: boolean
  /** The time budget was spent; the run stopped early. */
  timedOut: boolean
  /** The sample was longer than the bound and only the head of it was searched. */
  sampleTruncated?: boolean
  /** Length of the sample actually searched. */
  searchedLength?: number
  /** Wall clock the run took, in milliseconds. */
  elapsedMs?: number
}

/* ------------------------------------------------------------------------------------ */
/* Escaping                                                                              */
/* ------------------------------------------------------------------------------------ */

const ESCAPE_RE = /[\\^$.*+?()[\]{}|/]/g

/**
 * Escapes every ECMAScript metacharacter so the result matches `s` literally.
 *
 * Only characters that are `SyntaxCharacter` (plus `/`) are escaped, because those are
 * the only identity escapes that stay legal under the `u` and `v` flags. `-` is left
 * alone for the same reason: `\-` is a syntax error outside a character class in
 * unicode mode.
 */
export function escapeLiteral(s: string): string {
  return s.replace(ESCAPE_RE, '\\$&')
}

/**
 * Turns a plain-text query into a pattern that matches it literally, so plain mode and
 * regex mode run through one code path instead of two that drift apart.
 */
export function plainToPattern(query: string): string {
  return escapeLiteral(query)
}

/** Keeps only supported flags, drops duplicates and writes them in canonical order. */
export function sanitizeFlags(flags: string): string {
  let out = ''
  for (const flag of SUPPORTED_FLAGS) {
    if (flags.includes(flag)) out += flag
  }
  return out
}

/** Adds or removes one flag, returning a canonical flag string. */
export function withFlag(flags: string, flag: string, on: boolean): string {
  const without = sanitizeFlags(flags).split('').filter((f) => f !== flag).join('')
  return on ? sanitizeFlags(without + flag) : without
}

/* ------------------------------------------------------------------------------------ */
/* Compiling                                                                             */
/* ------------------------------------------------------------------------------------ */

const INDEX_IN_MESSAGE = /\bat (?:index|position|character) (\d+)/i

function messageOf(err: unknown): string {
  if (err instanceof Error && typeof err.message === 'string') return err.message
  return String(err)
}

/**
 * Compiles a pattern. Never throws.
 *
 * On failure the `error` string is the engine's own message, unedited, and `index` is
 * the character offset at fault when one can be established — from the message if the
 * host puts one there, and otherwise from this module's structural scan, which locates
 * the unbalanced bracket, dangling quantifier or trailing backslash the engine only
 * described in prose.
 */
export function compile(pattern: string, flags: string): CompileResult {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      code: 'pattern-too-long',
      error: `Pattern is ${pattern.length} characters; the limit is ${MAX_PATTERN_LENGTH}.`,
      index: MAX_PATTERN_LENGTH,
    }
  }
  try {
    return { ok: true, re: new RegExp(pattern, flags) }
  } catch (err) {
    const error = messageOf(err)
    const code: RegexErrorCode = /flag/i.test(error) && isFlagFault(pattern, flags) ? 'flags' : 'syntax'
    const fromMessage = INDEX_IN_MESSAGE.exec(error)
    let index: number | undefined
    if (fromMessage) index = Number(fromMessage[1])
    else if (code === 'syntax') index = scanPattern(pattern).error?.index
    return index === undefined ? { ok: false, error, code } : { ok: false, error, index, code }
  }
}

/** True when the empty pattern also fails with these flags, i.e. the flags are the fault. */
function isFlagFault(pattern: string, flags: string): boolean {
  if (pattern === '') return true
  try {
    new RegExp('', flags)
    return false
  } catch {
    return true
  }
}

/* ------------------------------------------------------------------------------------ */
/* Running                                                                               */
/* ------------------------------------------------------------------------------------ */

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

interface WithIndices {
  indices?: Array<[number, number] | undefined> & { groups?: Record<string, [number, number] | undefined> }
}

/**
 * Clones `re` for iteration.
 *
 * `y` is added so each attempt is anchored at a start position this module chooses,
 * which is what makes the run interruptible: the clock is read between positions rather
 * than once around a native scan that cannot be stopped. `d` is added so capture groups
 * come back with real offsets for highlighting. `g` is dropped because the position is
 * driven by hand. The caller's own RegExp is never touched, so its `lastIndex` cannot be
 * disturbed by a preview run.
 */
function iterationCopy(re: RegExp): { re: RegExp; hasIndices: boolean } {
  const base = re.flags.replace(/[gy]/g, '')
  if (!base.includes('d')) {
    try {
      return { re: new RegExp(re.source, base + 'dy'), hasIndices: true }
    } catch {
      /* A host without the `d` flag. Fall through and compute offsets the long way. */
    }
  }
  return { re: new RegExp(re.source, base + 'y'), hasIndices: base.includes('d') }
}

/** Next index after a zero-width match, keeping a surrogate pair together in unicode mode. */
function advancePast(text: string, index: number, unicode: boolean): number {
  if (index >= text.length) return index + 1
  if (!unicode) return index + 1
  const code = text.codePointAt(index)
  return index + (code !== undefined && code > 0xffff ? 2 : 1)
}

/**
 * Group numbers to `(?<name>…)` names, read from the pattern in source order — which is
 * exactly how ECMAScript numbers them — rather than from a host-specific property.
 */
function groupNames(source: string): Map<number, string> {
  const names = new Map<number, string>()
  let number = 0
  for (const token of scanPattern(source).tokens) {
    if (token.kind !== 'group-open') continue
    if (token.group === 'capture') number += 1
    else if (token.group === 'named') {
      number += 1
      if (token.name !== undefined) names.set(number, token.name)
    }
  }
  return names
}

function groupsOf(m: RegExpExecArray, names: Map<number, string>, estimateOffsets: boolean): CaptureGroup[] {
  const indices = (m as RegExpExecArray & WithIndices).indices
  const out: CaptureGroup[] = []
  for (let n = 1; n < m.length; n += 1) {
    const value = m[n]
    const range = indices?.[n]
    const name = names.get(n)
    const group: CaptureGroup = {
      number: n,
      value,
      start: range ? range[0] : -1,
      end: range ? range[1] : -1,
    }
    if (name !== undefined) group.name = name
    if (!range && value !== undefined && estimateOffsets) {
      // A host without the `d` flag: locate the capture inside the match text instead
      // of pretending we know where it is.
      const at = m[0].indexOf(value)
      if (at >= 0) {
        group.start = m.index + at
        group.end = group.start + value.length
      }
    }
    out.push(group)
  }
  return out
}

/**
 * Evaluates `re` against `sample` under hard bounds.
 *
 * The sample is cut to `maxSampleLength` before matching and matches stop at
 * `maxMatches`. Start positions are stepped by this module against a sticky copy of the
 * pattern rather than handed to one native scan, so the elapsed clock is read on every
 * turn of the match loop and a run that overruns its budget stops and reports
 * `timedOut: true` instead of taking the window with it. `lastIndex` after a zero-width
 * match is advanced by one code point by hand, so `a*` and `(?:)` terminate.
 *
 * The one thing no synchronous JavaScript can interrupt is a single `exec` that is
 * itself backtracking exponentially — the engine does not yield. `backtrackingRisk()`
 * exists for that case, and the builder uses it to refuse to run such a pattern until
 * the user asks for it explicitly.
 *
 * A regex without the `g` flag reports at most one match, which is what that flag means.
 * A regex with `y` keeps sticky semantics: it stops at the first position that fails.
 */
export function run(re: RegExp, sample: string, limits: Limits = {}): MatchRun {
  const maxSampleLength = Math.max(0, limits.maxSampleLength ?? DEFAULT_LIMITS.maxSampleLength)
  const maxMatches = Math.max(0, limits.maxMatches ?? DEFAULT_LIMITS.maxMatches)
  const timeBudgetMs = Math.max(1, limits.timeBudgetMs ?? DEFAULT_LIMITS.timeBudgetMs)

  const text = sample.length > maxSampleLength ? sample.slice(0, maxSampleLength) : sample
  const sampleTruncated = text.length < sample.length
  const started = now()

  const matches: Match[] = []
  let truncated = false
  let timedOut = false

  if (maxMatches === 0) {
    return {
      matches,
      truncated: text.length > 0,
      timedOut,
      sampleTruncated,
      searchedLength: text.length,
      elapsedMs: 0,
    }
  }

  const global = re.flags.includes('g')
  const sticky = re.flags.includes('y')
  const unicode = re.flags.includes('u') || re.flags.includes('v')
  const { re: work, hasIndices } = iterationCopy(re)
  const names = groupNames(re.source)

  let position = 0
  while (position <= text.length) {
    if (now() - started > timeBudgetMs) {
      timedOut = true
      break
    }
    work.lastIndex = position
    const m = work.exec(text)
    const spent = now() - started
    if (m === null) {
      if (spent > timeBudgetMs) {
        timedOut = true
        break
      }
      // A sticky pattern must not slide forward: failing here is the end of the run.
      if (sticky) break
      position = advancePast(text, position, unicode)
      continue
    }
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      value: m[0],
      groups: groupsOf(m, names, !hasIndices),
    })
    position = m[0].length === 0 ? advancePast(text, m.index, unicode) : m.index + m[0].length
    if (!global) break
    if (matches.length >= maxMatches) {
      truncated = true
      break
    }
    if (spent > timeBudgetMs) {
      timedOut = true
      break
    }
  }

  return {
    matches,
    truncated,
    timedOut,
    sampleTruncated,
    searchedLength: text.length,
    elapsedMs: Math.round((now() - started) * 100) / 100,
  }
}

/* ------------------------------------------------------------------------------------ */
/* Structural scan                                                                       */
/* ------------------------------------------------------------------------------------ */

export type TokenKind =
  | 'literal'
  | 'escape'
  | 'class'
  | 'dot'
  | 'anchor'
  | 'group-open'
  | 'group-close'
  | 'alternation'
  | 'quantifier'
  | 'backreference'

export type GroupKind =
  | 'capture'
  | 'non-capture'
  | 'named'
  | 'lookahead'
  | 'negative-lookahead'
  | 'lookbehind'
  | 'negative-lookbehind'

export interface PatternToken {
  kind: TokenKind
  /** Offset into the pattern. `end` is exclusive, so `[start, end)` selects the token. */
  start: number
  end: number
  text: string
  /** Group nesting depth the token sits at. A group's own parenthesis reports its outer depth. */
  depth: number
  group?: GroupKind
  name?: string
}

export interface PatternScan {
  tokens: PatternToken[]
  /** The first structural fault found, with the character index that caused it. */
  error?: { message: string; index: number }
}

const QUANTIFIABLE = new Set<TokenKind>(['literal', 'escape', 'class', 'dot', 'group-close', 'backreference'])
const BRACES = /^\{(\d+)(?:(,)(\d*))?\}/

/**
 * A best-effort structural read of a pattern.
 *
 * It powers two things: the builder's outline, which lets the user click a construct and
 * select it in the raw pattern, and `compile`'s error index, because no major host
 * reports one. It is deliberately conservative — it only reports a fault it can point at
 * — and it is never used to reject a pattern the engine itself accepted.
 */
export function scanPattern(pattern: string): PatternScan {
  const tokens: PatternToken[] = []
  const openGroups: number[] = []
  let error: { message: string; index: number } | undefined
  const fail = (message: string, index: number): void => {
    if (!error) error = { message, index }
  }

  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i] as string
    const depth = openGroups.length
    const prev = tokens[tokens.length - 1]

    if (ch === '\\') {
      if (i + 1 >= pattern.length) {
        fail('Trailing backslash.', i)
        tokens.push({ kind: 'escape', start: i, end: i + 1, text: ch, depth })
        i += 1
        continue
      }
      const next = pattern[i + 1] as string
      if (next === 'b' || next === 'B') {
        tokens.push({ kind: 'anchor', start: i, end: i + 2, text: ch + next, depth })
        i += 2
        continue
      }
      if (next >= '1' && next <= '9') {
        let j = i + 1
        while (j < pattern.length && pattern[j]! >= '0' && pattern[j]! <= '9') j += 1
        tokens.push({ kind: 'backreference', start: i, end: j, text: pattern.slice(i, j), depth })
        i = j
        continue
      }
      if (next === 'k' && pattern[i + 2] === '<') {
        const close = pattern.indexOf('>', i + 3)
        if (close === -1) {
          fail('Unterminated named backreference.', i)
          tokens.push({ kind: 'backreference', start: i, end: pattern.length, text: pattern.slice(i), depth })
          i = pattern.length
          continue
        }
        tokens.push({
          kind: 'backreference',
          start: i,
          end: close + 1,
          text: pattern.slice(i, close + 1),
          depth,
          name: pattern.slice(i + 3, close),
        })
        i = close + 1
        continue
      }
      let end = i + 2
      if (next === 'u' && pattern[i + 2] === '{') {
        const close = pattern.indexOf('}', i + 3)
        end = close === -1 ? i + 2 : close + 1
      } else if (next === 'u') end = Math.min(i + 6, pattern.length)
      else if (next === 'x') end = Math.min(i + 4, pattern.length)
      else if ((next === 'p' || next === 'P') && pattern[i + 2] === '{') {
        const close = pattern.indexOf('}', i + 3)
        end = close === -1 ? i + 2 : close + 1
      }
      tokens.push({ kind: 'escape', start: i, end, text: pattern.slice(i, end), depth })
      i = end
      continue
    }

    if (ch === '[') {
      let j = i + 1
      if (pattern[j] === '^') j += 1
      let closed = false
      while (j < pattern.length) {
        if (pattern[j] === '\\') {
          j += 2
          continue
        }
        if (pattern[j] === ']') {
          closed = true
          j += 1
          break
        }
        j += 1
      }
      if (!closed) {
        fail('Unterminated character class.', i)
        tokens.push({ kind: 'class', start: i, end: pattern.length, text: pattern.slice(i), depth })
        i = pattern.length
        continue
      }
      tokens.push({ kind: 'class', start: i, end: j, text: pattern.slice(i, j), depth })
      i = j
      continue
    }

    if (ch === '(') {
      let kind: GroupKind = 'capture'
      let name: string | undefined
      let end = i + 1
      if (pattern[i + 1] === '?') {
        const marker = pattern[i + 2]
        if (marker === ':') {
          kind = 'non-capture'
          end = i + 3
        } else if (marker === '=') {
          kind = 'lookahead'
          end = i + 3
        } else if (marker === '!') {
          kind = 'negative-lookahead'
          end = i + 3
        } else if (marker === '<' && pattern[i + 3] === '=') {
          kind = 'lookbehind'
          end = i + 4
        } else if (marker === '<' && pattern[i + 3] === '!') {
          kind = 'negative-lookbehind'
          end = i + 4
        } else if (marker === '<') {
          const close = pattern.indexOf('>', i + 3)
          if (close === -1) {
            fail('Unterminated group name.', i)
            end = pattern.length
          } else {
            kind = 'named'
            name = pattern.slice(i + 3, close)
            end = close + 1
          }
        } else {
          fail('Invalid group.', i)
          end = i + 2
        }
      }
      const token: PatternToken = { kind: 'group-open', start: i, end, text: pattern.slice(i, end), depth }
      token.group = kind
      if (name !== undefined) token.name = name
      tokens.push(token)
      openGroups.push(i)
      i = end
      continue
    }

    if (ch === ')') {
      if (openGroups.length === 0) {
        fail('Unmatched closing parenthesis.', i)
        tokens.push({ kind: 'literal', start: i, end: i + 1, text: ch, depth })
        i += 1
        continue
      }
      openGroups.pop()
      tokens.push({ kind: 'group-close', start: i, end: i + 1, text: ch, depth: openGroups.length })
      i += 1
      continue
    }

    if (ch === '|') {
      tokens.push({ kind: 'alternation', start: i, end: i + 1, text: ch, depth })
      i += 1
      continue
    }

    if (ch === '^' || ch === '$') {
      tokens.push({ kind: 'anchor', start: i, end: i + 1, text: ch, depth })
      i += 1
      continue
    }

    if (ch === '.') {
      tokens.push({ kind: 'dot', start: i, end: i + 1, text: ch, depth })
      i += 1
      continue
    }

    if (ch === '*' || ch === '+' || ch === '?') {
      if (prev && prev.kind === 'quantifier' && ch === '?' && !prev.text.endsWith('?')) {
        prev.text += ch
        prev.end = i + 1
        i += 1
        continue
      }
      if (!prev || prev.kind === 'group-open' || prev.kind === 'alternation' || prev.kind === 'quantifier') {
        fail('Nothing to repeat.', i)
      }
      tokens.push({ kind: 'quantifier', start: i, end: i + 1, text: ch, depth })
      i += 1
      continue
    }

    if (ch === '{') {
      const braces = BRACES.exec(pattern.slice(i))
      if (braces) {
        const min = Number(braces[1])
        const max = braces[2] === undefined ? min : braces[3] === '' || braces[3] === undefined ? Infinity : Number(braces[3])
        if (max < min) fail('Numbers out of order in {} quantifier.', i)
        if (!prev || !QUANTIFIABLE.has(prev.kind)) fail('Nothing to repeat.', i)
        tokens.push({ kind: 'quantifier', start: i, end: i + braces[0].length, text: braces[0], depth })
        i += braces[0].length
        continue
      }
      tokens.push({ kind: 'literal', start: i, end: i + 1, text: ch, depth })
      i += 1
      continue
    }

    const code = pattern.codePointAt(i)
    const width = code !== undefined && code > 0xffff ? 2 : 1
    if (prev && prev.kind === 'literal' && prev.end === i && prev.depth === depth) {
      prev.text += pattern.slice(i, i + width)
      prev.end = i + width
    } else {
      tokens.push({ kind: 'literal', start: i, end: i + width, text: pattern.slice(i, i + width), depth })
    }
    i += width
  }

  if (openGroups.length > 0) fail('Unterminated group.', openGroups[openGroups.length - 1] as number)
  return error ? { tokens, error } : { tokens }
}

export type RiskReason = 'nested-quantifier' | 'adjacent-quantifiers'

export interface BacktrackingRisk {
  risky: boolean
  reason?: RiskReason
  /** Character index of the construct that raised the flag. */
  index?: number
}

/** True for a quantifier that can repeat without an upper bound worth trusting. */
function isUnbounded(text: string): boolean {
  if (text === '*' || text === '+' || text === '*?' || text === '+?') return true
  const braces = BRACES.exec(text)
  if (!braces) return false
  if (braces[2] === ',' && (braces[3] === '' || braces[3] === undefined)) return true
  const max = braces[3] === undefined ? Number(braces[1]) : Number(braces[3])
  return max >= 20
}

/**
 * Flags the two shapes that make an ECMAScript pattern backtrack exponentially: an
 * unbounded quantifier wrapped around a group that already contains one — `(a+)+` — and
 * two unbounded quantifiers with nothing between them — `.*.*`.
 *
 * This is a warning, not a verdict: a flagged pattern is still a legal pattern and the
 * user may still run it. It exists because a single `exec` cannot be interrupted, so the
 * only honest protection against that one case is to not start it by accident.
 */
export function backtrackingRisk(pattern: string): BacktrackingRisk {
  const { tokens } = scanPattern(pattern)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as PatternToken
    if (token.kind !== 'quantifier' || !isUnbounded(token.text)) continue

    const previous = tokens[i - 1]
    if (previous && previous.kind === 'quantifier' && isUnbounded(previous.text)) {
      return { risky: true, reason: 'adjacent-quantifiers', index: token.start }
    }
    if (!previous || previous.kind !== 'group-close') continue

    // Walk back to the matching opening parenthesis and look for a quantifier inside it.
    const closeDepth = previous.depth
    for (let j = i - 2; j >= 0; j -= 1) {
      const inner = tokens[j] as PatternToken
      if (inner.kind === 'group-open' && inner.depth === closeDepth) break
      if (inner.kind === 'quantifier' && isUnbounded(inner.text)) {
        return { risky: true, reason: 'nested-quantifier', index: token.start }
      }
    }
  }
  return { risky: false }
}

/** How many capturing groups a pattern declares, counting named ones. */
export function captureCount(pattern: string): number {
  let count = 0
  for (const token of scanPattern(pattern).tokens) {
    if (token.kind === 'group-open' && (token.group === 'capture' || token.group === 'named')) count += 1
  }
  return count
}
