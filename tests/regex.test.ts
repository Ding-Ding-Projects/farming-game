/**
 * The regex engine behind every search field.
 *
 * `docs/SHELL-CONTRACT.md`: "State the real dialect (ECMAScript `RegExp`), the real
 * escaping rules and the real bounds. Bound sample length, match count and elapsed time;
 * abort a run that exceeds the time budget so an adversarial pattern cannot hang the app.
 * Handle Unicode, multiline, zero-width matches and no-match cleanly."
 *
 * The timeout cases below carry generous per-test deadlines on purpose: the point of the
 * assertion is that `run()` **returns** with `timedOut: true`, so the test must be able to
 * fail by timing out rather than by hanging the whole suite.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LIMITS,
  DIALECT,
  DIALECT_LABEL,
  ESCAPED_CHARACTERS,
  MAX_PATTERN_LENGTH,
  SUPPORTED_FLAGS,
  backtrackingRisk,
  captureCount,
  compile,
  escapeLiteral,
  plainToPattern,
  run,
  sanitizeFlags,
  scanPattern,
  withFlag,
} from '../src/shell/core/regex'
import type { CompileResult } from '../src/shell/core/regex'

/** Narrows a successful compile, failing loudly with the engine's message otherwise. */
function mustCompile(pattern: string, flags = ''): RegExp {
  const result: CompileResult = compile(pattern, flags)
  if (!result.ok) throw new Error(`expected ${pattern} /${flags} to compile: ${result.error}`)
  return result.re
}

/* ------------------------------------------------------------------------ *
 * The stated dialect
 * ------------------------------------------------------------------------ */

describe('the dialect is stated honestly', () => {
  it('is ECMAScript and says so', () => {
    expect(DIALECT).toBe('ecmascript')
    expect(DIALECT_LABEL).toBe('ECMAScript RegExp')
  })

  it('offers only flags the host RegExp really accepts', () => {
    for (const flag of SUPPORTED_FLAGS) {
      expect(() => new RegExp('a', flag)).not.toThrow()
    }
  })

  it('names every character it escapes', () => {
    for (const character of ESCAPED_CHARACTERS.split(' ')) {
      expect(escapeLiteral(character)).toBe(`\\${character}`)
    }
  })
})

/* ------------------------------------------------------------------------ *
 * compile
 * ------------------------------------------------------------------------ */

describe('compile', () => {
  it('returns the compiled expression for a valid pattern', () => {
    const result = compile('a(b)c', 'gi')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.re.source).toBe('a(b)c')
    expect(result.re.flags).toBe('gi')
  })

  it('compiles the empty pattern', () => {
    const result = compile('', '')
    expect(result.ok).toBe(true)
  })

  const broken: Array<[string, string]> = [
    ['an unclosed group', '(abc'],
    ['an unmatched close', 'abc)'],
    ['an unterminated class', '[a-z'],
    ['a dangling quantifier', '*abc'],
    ['a trailing backslash', 'abc\\'],
    ['reversed brace bounds', 'a{5,2}'],
    ['an unterminated group name', '(?<name'],
    ['a lone lookbehind marker', '(?'],
  ]

  for (const [label, pattern] of broken) {
    it(`reports ${label} without throwing`, () => {
      let result: CompileResult | null = null
      expect(() => {
        result = compile(pattern, '')
      }).not.toThrow()
      expect(result).not.toBeNull()
      const value = result as unknown as CompileResult
      expect(value.ok).toBe(false)
      if (value.ok) return
      expect(value.error.length).toBeGreaterThan(0)
      expect(value.code).toBe('syntax')
      // The index, when reported, points inside the pattern.
      if (value.index !== undefined) {
        expect(value.index).toBeGreaterThanOrEqual(0)
        expect(value.index).toBeLessThanOrEqual(pattern.length)
      }
    })
  }

  it('points at the character at fault where the engine only described it in prose', () => {
    const result = compile('abc(def', '')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.index).toBe(3)
  })

  it('separates a flags fault from a syntax fault', () => {
    const bad = compile('abc', 'q')
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.code).toBe('flags')

    const duplicated = compile('abc', 'gg')
    expect(duplicated.ok).toBe(false)
    if (duplicated.ok) return
    expect(duplicated.code).toBe('flags')
  })

  it('refuses a pattern longer than the stated bound, and says what the bound is', () => {
    const oversized = 'a'.repeat(MAX_PATTERN_LENGTH + 1)
    const result = compile(oversized, '')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('pattern-too-long')
    expect(result.error).toContain(String(MAX_PATTERN_LENGTH))
    expect(result.error).toContain(String(oversized.length))

    // Exactly at the bound is still allowed.
    expect(compile('a'.repeat(MAX_PATTERN_LENGTH), '').ok).toBe(true)
  })

  it('never throws for any of a pile of hostile inputs', () => {
    const hostile = [
      '(((((((((((((((((((((',
      '[[[[[[[[',
      '\\',
      '\\u{',
      '\\p{NotAScript}',
      '(?<=a)*',
      'a{',
      'a{1,',
      '(?<dup>a)(?<dup>b)',
      '\\k<missing>',
      '[z-a]',
      '\uD800',
    ]
    for (const pattern of hostile) {
      expect(() => compile(pattern, ''), pattern).not.toThrow()
      expect(() => compile(pattern, 'gimsuy'), pattern).not.toThrow()
    }
  })
})

/* ------------------------------------------------------------------------ *
 * escapeLiteral
 * ------------------------------------------------------------------------ */

describe('escapeLiteral', () => {
  const METACHARACTERS = ['\\', '^', '$', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/']

  it('round-trips every metacharacter, alone', () => {
    for (const character of METACHARACTERS) {
      const pattern = escapeLiteral(character)
      const re = mustCompile(pattern, '')
      expect(re.test(character), `${character} should match itself`).toBe(true)
      // And it is a literal, not a construct: it never matches something else.
      expect(new RegExp(`^${pattern}$`).test(character)).toBe(true)
    }
  })

  it('round-trips every metacharacter under the unicode flags too', () => {
    // `u` and `v` reject identity escapes that are not SyntaxCharacter, which is exactly
    // why `-` must be left alone. Compiling under both proves the escape set is right.
    for (const flags of ['u', 'v']) {
      for (const character of [...METACHARACTERS, '-', 'a', ' ', '#', '你']) {
        const pattern = escapeLiteral(character)
        const re = mustCompile(pattern, flags)
        expect(re.test(character), `${character} under /${flags}`).toBe(true)
      }
    }
  })

  it('round-trips the whole soup at once', () => {
    const soup = '\\^$.*+?()[]{}|/ a-b_c #1 "quoted" 你好 😀'
    const re = mustCompile(`^${escapeLiteral(soup)}$`, 'u')
    expect(re.test(soup)).toBe(true)
    expect(re.test(`${soup}x`)).toBe(false)
  })

  it('leaves an ordinary character alone', () => {
    expect(escapeLiteral('abc 123 你好')).toBe('abc 123 你好')
    expect(escapeLiteral('')).toBe('')
  })

  it('is what plainToPattern uses, so plain and regex mode share one code path', () => {
    const query = 'price: $12.50 (each)'
    expect(plainToPattern(query)).toBe(escapeLiteral(query))
    const re = mustCompile(plainToPattern(query), 'g')
    expect(re.test(`the price: $12.50 (each) today`)).toBe(true)
    expect(new RegExp(plainToPattern(query)).test('price: 912050 xeach')).toBe(false)
  })
})

/* ------------------------------------------------------------------------ *
 * flags
 * ------------------------------------------------------------------------ */

describe('flags', () => {
  it('keeps the supported ones, drops the rest, and writes them in canonical order', () => {
    expect(sanitizeFlags('igm')).toBe('gim')
    expect(sanitizeFlags('ggii')).toBe('gi')
    expect(sanitizeFlags('xyz')).toBe('y')
    expect(sanitizeFlags('')).toBe('')
    expect(sanitizeFlags('dgimsuvy')).toBe('dgimsuvy')
  })

  it('adds and removes one flag at a time', () => {
    expect(withFlag('', 'i', true)).toBe('i')
    expect(withFlag('gi', 'i', false)).toBe('g')
    expect(withFlag('gi', 'i', true)).toBe('gi')
    expect(withFlag('gi', 'm', true)).toBe('gim')
    expect(withFlag('gi', 'q', true)).toBe('gi') // unsupported, ignored
  })

  it('produces a flag string the host accepts', () => {
    for (const messy of ['iiggmm', 'zyxwv', 'dgimsuy']) {
      expect(() => new RegExp('a', sanitizeFlags(messy))).not.toThrow()
    }
  })
})

/* ------------------------------------------------------------------------ *
 * run — the ordinary cases
 * ------------------------------------------------------------------------ */

describe('run', () => {
  it('finds every match of a global pattern, with offsets', () => {
    const result = run(mustCompile('a', 'g'), 'banana')
    expect(result.matches.map((match) => match.index)).toEqual([1, 3, 5])
    expect(result.matches.map((match) => match.value)).toEqual(['a', 'a', 'a'])
    expect(result.matches.map((match) => match.end)).toEqual([2, 4, 6])
    expect(result.truncated).toBe(false)
    expect(result.timedOut).toBe(false)
  })

  it('reports one match for a pattern without the global flag, which is what that means', () => {
    const result = run(mustCompile('a', ''), 'banana')
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].index).toBe(1)
  })

  it('reports no matches cleanly rather than as a failure', () => {
    const result = run(mustCompile('zebra', 'g'), 'banana')
    expect(result.matches).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.timedOut).toBe(false)
    expect(result.searchedLength).toBe(6)
  })

  it('handles an empty sample', () => {
    const result = run(mustCompile('a', 'g'), '')
    expect(result.matches).toEqual([])
    expect(result.searchedLength).toBe(0)
  })

  it('reports capture groups, named and numbered, with their own offsets', () => {
    const result = run(mustCompile('(?<word>[a-z]+)-(\\d+)', 'g'), 'apple-12 pear-3')
    expect(result.matches).toHaveLength(2)

    const [first] = result.matches
    expect(first.value).toBe('apple-12')
    expect(first.groups).toHaveLength(2)
    expect(first.groups[0]).toMatchObject({ number: 1, name: 'word', value: 'apple' })
    expect(first.groups[1]).toMatchObject({ number: 2, value: '12' })
    expect(first.groups[0].start).toBe(0)
    expect(first.groups[0].end).toBe(5)
    expect(first.groups[1].start).toBe(6)
    expect(first.groups[1].end).toBe(8)
  })

  it('marks a group that took no part in the match as undefined, not as empty', () => {
    const result = run(mustCompile('a(x)?(b)', 'g'), 'ab')
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].groups[0].value).toBeUndefined()
    expect(result.matches[0].groups[1].value).toBe('b')
  })

  it('never disturbs the caller\u2019s own lastIndex', () => {
    const re = mustCompile('a', 'g')
    re.lastIndex = 4
    run(re, 'banana')
    expect(re.lastIndex).toBe(4)
  })

  it('keeps sticky semantics for a sticky pattern', () => {
    const stuck = run(mustCompile('a', 'gy'), 'banana')
    expect(stuck.matches).toEqual([]) // position 0 is 'b', so the run stops there
    const anchored = run(mustCompile('a', 'gy'), 'aab')
    expect(anchored.matches.map((match) => match.index)).toEqual([0, 1])
  })
})

/* ------------------------------------------------------------------------ *
 * Bounds
 * ------------------------------------------------------------------------ */

describe('bounds', () => {
  it('publishes the defaults it applies', () => {
    expect(DEFAULT_LIMITS.maxSampleLength).toBeGreaterThan(0)
    expect(DEFAULT_LIMITS.maxMatches).toBeGreaterThan(0)
    expect(DEFAULT_LIMITS.timeBudgetMs).toBeGreaterThan(0)
  })

  it('honours the match cap and says it truncated', () => {
    const result = run(mustCompile('a', 'g'), 'a'.repeat(50), { maxMatches: 7 })
    expect(result.matches).toHaveLength(7)
    expect(result.truncated).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('does not claim truncation when the run finished under the cap', () => {
    const result = run(mustCompile('a', 'g'), 'aaa', { maxMatches: 10 })
    expect(result.matches).toHaveLength(3)
    expect(result.truncated).toBe(false)
  })

  it('reports truncation whenever the cap is reached, which is what the flag means', () => {
    // `truncated` is documented as "the cap was reached; there MAY be more after the last
    // one shown". Reaching it on the final match still counts, so the UI can always offer
    // to widen the bound rather than quietly implying it saw everything.
    const exact = run(mustCompile('a', 'g'), 'aaa', { maxMatches: 3 })
    expect(exact.matches).toHaveLength(3)
    expect(exact.truncated).toBe(true)
  })

  it('applies the default match cap when none is given', () => {
    const result = run(mustCompile('a', 'g'), 'a'.repeat(DEFAULT_LIMITS.maxMatches + 10))
    expect(result.matches).toHaveLength(DEFAULT_LIMITS.maxMatches)
    expect(result.truncated).toBe(true)
  })

  it('cuts the sample to the bound and says only the head was searched', () => {
    const sample = `${'b'.repeat(20)}a`
    const result = run(mustCompile('a', 'g'), sample, { maxSampleLength: 10 })
    expect(result.sampleTruncated).toBe(true)
    expect(result.searchedLength).toBe(10)
    expect(result.matches).toEqual([]) // the 'a' was past the bound, so it is not matched
  })

  it('does not claim the sample was cut when it was not', () => {
    const result = run(mustCompile('a', 'g'), 'banana', { maxSampleLength: 100 })
    expect(result.sampleTruncated).toBe(false)
    expect(result.searchedLength).toBe(6)
  })

  it('reports elapsed time as a number', () => {
    const result = run(mustCompile('a', 'g'), 'banana')
    expect(result.elapsedMs).toBeTypeOf('number')
    expect(Number.isFinite(result.elapsedMs as number)).toBe(true)
    expect(result.elapsedMs as number).toBeGreaterThanOrEqual(0)
  })
})

/* ------------------------------------------------------------------------ *
 * The time budget
 * ------------------------------------------------------------------------ */

describe('the time budget', () => {
  it(
    'aborts a catastrophic backtracker and RETURNS with timedOut',
    () => {
      // `(a+)+$` against a run of a's that cannot match is the textbook exponential case.
      const evil = mustCompile('(a+)+$', 'g')
      const sample = `${'a'.repeat(24)}!`

      const started = Date.now()
      const result = run(evil, sample, { timeBudgetMs: 5 })
      const elapsed = Date.now() - started

      expect(result.timedOut).toBe(true)
      expect(result.matches).toEqual([])
      // It came back. That is the whole assertion — and it came back quickly enough that a
      // user would never see the window freeze.
      expect(elapsed).toBeLessThan(15_000)
    },
    30_000,
  )

  it(
    'aborts a long scan that never matches',
    () => {
      const result = run(mustCompile('needle', 'g'), 'h'.repeat(20_000), { timeBudgetMs: 1 })
      expect(result.timedOut).toBe(true)
      expect(result.matches).toEqual([])
    },
    30_000,
  )

  it('does not cry timeout on a run that finished inside its budget', () => {
    const result = run(mustCompile('a', 'g'), 'banana', { timeBudgetMs: 5_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches).toHaveLength(3)
  })

  it('flags a quantifier wrapped around a group that already has one', () => {
    // The one shape a single uninterruptible `exec` can hang on, caught before it starts.
    for (const pattern of ['(a+)+', '(a*)*b', '(?:x|y+)+', '([a-z]{20,})+']) {
      const risk = backtrackingRisk(pattern)
      expect(risk.risky, pattern).toBe(true)
      expect(risk.reason, pattern).toBe('nested-quantifier')
      expect(risk.index, pattern).toBeGreaterThanOrEqual(0)
    }
  })

  it('leaves an ordinary pattern unflagged, so the warning stays worth reading', () => {
    for (const pattern of ['a+b+', '[a-z]+', '(abc)+', '\\d{1,4}', '', 'parsnip']) {
      expect(backtrackingRisk(pattern).risky, pattern).toBe(false)
    }
  })

  it('answers for any pattern at all without throwing', () => {
    for (const pattern of ['.*.*', '(((a+)+)+)+', '(a+', '[', '\\', 'a{2,}{3,}']) {
      const risk = backtrackingRisk(pattern)
      expect(typeof risk.risky, pattern).toBe('boolean')
    }
  })

  it('returns immediately when the caller asks for no matches at all', () => {
    const result = run(mustCompile('a', 'g'), 'banana', { maxMatches: 0 })
    expect(result.matches).toEqual([])
    expect(result.truncated).toBe(true)
    expect(result.timedOut).toBe(false)
  })
})

/* ------------------------------------------------------------------------ *
 * Zero-width matches
 * ------------------------------------------------------------------------ */

describe('zero-width patterns terminate', () => {
  it('walks the empty pattern to the end of the sample instead of looping', () => {
    const result = run(mustCompile('(?:)', 'g'), 'abc', { timeBudgetMs: 2_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches.map((match) => match.index)).toEqual([0, 1, 2, 3])
    for (const match of result.matches) {
      expect(match.value).toBe('')
      expect(match.end).toBe(match.index)
    }
  })

  it('terminates on a star that can match nothing', () => {
    const result = run(mustCompile('a*', 'g'), 'bab', { timeBudgetMs: 2_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches.map((match) => [match.index, match.value])).toEqual([
      [0, ''],
      [1, 'a'],
      [2, ''],
      [3, ''],
    ])
  })

  it('terminates on a word boundary, which matches width zero', () => {
    const result = run(mustCompile('\\b', 'g'), 'hi there', { timeBudgetMs: 2_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches.map((match) => match.index)).toEqual([0, 2, 3, 8])
  })

  it('terminates on a lookahead, which consumes nothing', () => {
    const result = run(mustCompile('(?=a)', 'g'), 'banana', { timeBudgetMs: 2_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches.map((match) => match.index)).toEqual([1, 3, 5])
  })

  it('steps a whole code point at a time in unicode mode', () => {
    // Two astral characters: four UTF-16 units, three legal positions.
    const result = run(mustCompile('(?:)', 'gu'), '😀😀', { timeBudgetMs: 2_000 })
    expect(result.timedOut).toBe(false)
    expect(result.matches.map((match) => match.index)).toEqual([0, 2, 4])
  })

  it('respects the match cap on a zero-width pattern too', () => {
    const result = run(mustCompile('(?:)', 'g'), 'abcdefghij', { maxMatches: 4 })
    expect(result.matches).toHaveLength(4)
    expect(result.truncated).toBe(true)
  })
})

/* ------------------------------------------------------------------------ *
 * Unicode and multiline
 * ------------------------------------------------------------------------ */

describe('unicode', () => {
  it('matches an astral character as one thing under /u', () => {
    const result = run(mustCompile('.', 'gu'), '😀a')
    expect(result.matches.map((match) => match.value)).toEqual(['😀', 'a'])
  })

  it('splits a surrogate pair without /u, which is what the dialect really does', () => {
    const result = run(mustCompile('.', 'g'), '😀')
    expect(result.matches).toHaveLength(2)
  })

  it('supports property escapes', () => {
    const result = run(mustCompile('\\p{Script=Han}+', 'gu'), 'hello 你好 world')
    expect(result.matches.map((match) => match.value)).toEqual(['你好'])
  })

  it('matches non-Latin text and reports offsets in UTF-16 units, as the sample is indexed', () => {
    const sample = '早晨 good morning 早晨'
    const result = run(mustCompile('早晨', 'gu'), sample)
    expect(result.matches.map((match) => match.index)).toEqual([0, 16])
    for (const match of result.matches) {
      expect(sample.slice(match.index, match.end)).toBe('早晨')
    }
  })

  it('honours case-insensitive matching', () => {
    const result = run(mustCompile('parsnip', 'gi'), 'Parsnip PARSNIP parsnip')
    expect(result.matches).toHaveLength(3)
  })
})

describe('multiline', () => {
  const sample = 'alpha\nbeta\ngamma'

  it('anchors to the whole text without /m', () => {
    expect(run(mustCompile('^\\w+', 'g'), sample).matches.map((m) => m.value)).toEqual(['alpha'])
    expect(run(mustCompile('\\w+$', 'g'), sample).matches.map((m) => m.value)).toEqual(['gamma'])
  })

  it('anchors to each line with /m', () => {
    expect(run(mustCompile('^\\w+', 'gm'), sample).matches.map((m) => m.value)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
    expect(run(mustCompile('\\w+$', 'gm'), sample).matches.map((m) => m.value)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })

  it('keeps the dot away from the newline unless /s is set', () => {
    expect(run(mustCompile('alpha.beta', 'g'), sample).matches).toEqual([])
    expect(run(mustCompile('alpha.beta', 'gs'), sample).matches).toHaveLength(1)
  })

  it('handles CRLF text without losing a line', () => {
    const crlf = 'alpha\r\nbeta\r\ngamma'
    expect(run(mustCompile('^\\w+', 'gm'), crlf).matches.map((m) => m.value)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })
})

/* ------------------------------------------------------------------------ *
 * The structural scan the builder is drawn from
 * ------------------------------------------------------------------------ */

describe('scanPattern', () => {
  it('reads the constructs a builder has to draw', () => {
    const kinds = scanPattern('^a(?<n>b|c)[d-f]\\d+.$').tokens.map((token) => token.kind)
    expect(kinds).toContain('anchor')
    expect(kinds).toContain('group-open')
    expect(kinds).toContain('group-close')
    expect(kinds).toContain('alternation')
    expect(kinds).toContain('class')
    expect(kinds).toContain('escape')
    expect(kinds).toContain('quantifier')
    expect(kinds).toContain('dot')
  })

  it('gives every token a slice that really selects it in the pattern', () => {
    const pattern = '^ab(?<n>c|d)[e-f]\\d{2,4}?.$'
    for (const token of scanPattern(pattern).tokens) {
      expect(pattern.slice(token.start, token.end)).toBe(token.text)
    }
  })

  it('counts capturing groups, named ones included, and ignores the rest', () => {
    expect(captureCount('(a)(b)')).toBe(2)
    expect(captureCount('(?:a)(b)')).toBe(1)
    expect(captureCount('(?<x>a)(?=b)(?!c)(?<=d)')).toBe(1)
    expect(captureCount('')).toBe(0)
  })

  it('never reports a fault in a pattern the engine itself accepted', () => {
    const legal = [
      'a',
      '[]]',
      '[\\]]',
      'a{2,}',
      'a{,2}',
      '(?<n>a)\\k<n>',
      '\\u{1F600}',
      '(?<=a)b',
      '{}',
      'a|',
      '[a-z]{1,3}?',
    ]
    for (const pattern of legal) {
      const compiled = compile(pattern, 'u')
      if (!compiled.ok) continue // not legal under /u, so the scan says nothing about it
      expect(scanPattern(pattern).error, pattern).toBeUndefined()
    }
  })
})
