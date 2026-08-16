/**
 * The colour contract.
 *
 * `docs/SHELL-CONTRACT.md`: "All colour comes from the CSS custom properties in
 * `src/shell/ui/tokens.css`, which are generated from `src/engine/palette.ts`. No literal
 * hex in any other stylesheet." and "Generated tokens must match `src/engine/palette.ts`
 * exactly; a test asserts it."
 *
 * This is that test. It reads the real stylesheet off disk — not a fixture, not a mock —
 * parses every `--sh-color-*` declaration out of it and compares the fourteen values
 * character for character against `PAL`. A drift in either direction fails, and fails
 * with a message naming the entry and both values.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PAL } from '../src/engine/palette'
import type { PaletteName } from '../src/engine/palette'
import {
  PALETTE_NAMES,
  PALETTE_VARS,
  PALETTE_VAR_PREFIX,
  comparePaletteTokens,
  describePaletteTokenIssues,
  parsePaletteTokens,
  paletteVar,
  paletteVarName,
  tokensMatchPalette,
} from '../src/shell/ui/tokens'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const TOKENS_CSS = read('../src/shell/ui/tokens.css')
const BASE_CSS = read('../src/shell/ui/base.css')

/** The fourteen entries DESIGN.md section 3 tabulates. */
const EXPECTED_PALETTE: Record<PaletteName, string> = {
  ink: '#1b1a24',
  shadow: '#2f2b3d',
  bark: '#4a3a34',
  soil: '#6b4a34',
  soilWet: '#43291f',
  grass: '#4f7a3a',
  grassLit: '#6d9c46',
  leaf: '#2f5c33',
  parchment: '#e8d9b0',
  cream: '#f6efd8',
  lantern: '#f2a541',
  berry: '#c1504a',
  sky: '#8fb8c9',
  dusk: '#5c5470',
}

/* ------------------------------------------------------------------------ *
 * The palette itself
 * ------------------------------------------------------------------------ */

describe('src/engine/palette.ts', () => {
  it('still holds exactly the fourteen entries DESIGN.md tabulates', () => {
    expect(Object.keys(PAL)).toHaveLength(14)
    expect(PAL).toEqual(EXPECTED_PALETTE)
  })

  it('writes every entry as a lower-case six-digit hex triple', () => {
    for (const [name, value] of Object.entries(PAL)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('names all fourteen in the tokens module, one custom property each', () => {
    expect(PALETTE_NAMES).toHaveLength(14)
    expect([...PALETTE_NAMES].sort()).toEqual(Object.keys(PAL).sort())

    const variables = Object.values(PALETTE_VARS)
    expect(new Set(variables).size).toBe(14)
    for (const variable of variables) {
      expect(variable.startsWith(PALETTE_VAR_PREFIX), variable).toBe(true)
      expect(variable, variable).toMatch(/^--sh-color-[a-z0-9-]+$/)
    }
  })

  it('builds the two helper forms other lanes write into styles', () => {
    expect(paletteVarName('grassLit')).toBe('--sh-color-grass-lit')
    expect(paletteVar('lantern')).toBe('var(--sh-color-lantern)')
  })
})

/* ------------------------------------------------------------------------ *
 * The transcription
 * ------------------------------------------------------------------------ */

describe('tokens.css matches src/engine/palette.ts', () => {
  it('declares all fourteen palette custom properties and nothing else with that prefix', () => {
    const declared = parsePaletteTokens(TOKENS_CSS)
    expect(Object.keys(declared).sort()).toEqual(Object.values(PALETTE_VARS).sort())
  })

  it('carries the exact value from the engine palette, entry by entry', () => {
    const declared = parsePaletteTokens(TOKENS_CSS)
    const drift: string[] = []
    for (const name of PALETTE_NAMES) {
      const variable = PALETTE_VARS[name]
      const actual = declared[variable]
      const expected = PAL[name].toLowerCase()
      if (actual === undefined) drift.push(`${variable} (${name}) is missing from tokens.css`)
      else if (actual !== expected) {
        drift.push(`${variable} (${name}): tokens.css says ${actual}, palette.ts says ${expected}`)
      }
    }
    expect(drift, `palette drift:\n${drift.join('\n')}`).toEqual([])
  })

  it('passes the module’s own comparison, with an empty issue list', () => {
    const issues = comparePaletteTokens(TOKENS_CSS)
    expect(issues, describePaletteTokenIssues(issues)).toEqual([])
    expect(tokensMatchPalette(TOKENS_CSS)).toBe(true)
  })

  it('fails loudly on drift rather than quietly passing', () => {
    // The guard has to be able to fail, so prove it does — on a missing entry, on a wrong
    // value, and on a stray property nobody declared in the palette.
    const missing = comparePaletteTokens(TOKENS_CSS.replace('--sh-color-lantern:', '--sh-gone:'))
    expect(missing.some((issue) => issue.kind === 'missing' && issue.name === 'lantern')).toBe(true)

    const wrong = comparePaletteTokens(TOKENS_CSS.replace(PAL.berry, '#ff0000'))
    const mismatch = wrong.find((issue) => issue.kind === 'mismatch')
    expect(mismatch?.name).toBe('berry')
    expect(mismatch?.expected).toBe(PAL.berry)
    expect(mismatch?.actual).toBe('#ff0000')

    const extra = comparePaletteTokens(`${TOKENS_CSS}\n:root { --sh-color-mauve: #ff00ff; }`)
    expect(extra.some((issue) => issue.kind === 'unknown')).toBe(true)

    expect(tokensMatchPalette('')).toBe(false)
    expect(describePaletteTokenIssues(wrong).length).toBeGreaterThan(0)
  })

  it('compares shorthand and case-shifted hex on value, not on spelling', () => {
    expect(parsePaletteTokens(':root{--sh-color-ink:#ABC;}')['--sh-color-ink']).toBe('#aabbcc')
    expect(parsePaletteTokens(':root{--sh-color-ink:  #1B1A24  ;}')['--sh-color-ink']).toBe(
      '#1b1a24',
    )
    // The cascade keeps the last declaration; so does the parser.
    expect(
      parsePaletteTokens(':root{--sh-color-ink:#000000;}\n:root{--sh-color-ink:#111111;}')[
        '--sh-color-ink'
      ],
    ).toBe('#111111')
  })
})

/* ------------------------------------------------------------------------ *
 * No literal colour anywhere else
 * ------------------------------------------------------------------------ */

describe('no stylesheet but tokens.css names a colour', () => {
  /** A hex colour literal: three, four, six or eight digits, not part of a longer word. */
  const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g

  it('keeps base.css free of hex literals', () => {
    const found = BASE_CSS.match(HEX) ?? []
    expect(found, `literal colours in base.css: ${found.join(', ')}`).toEqual([])
  })

  it('keeps base.css free of hand-written rgb() and hsl() values', () => {
    // `rgb(from var(--sh-color-ink) …)` would still be reading a token, so only a call
    // with no `var()` anywhere inside it is a literal colour someone typed in.
    const literals = (BASE_CSS.match(/\b(?:rgba?|hsla?)\([^)]*\)/g) ?? []).filter(
      (call) => !call.includes('var('),
    )
    expect(literals, `literal colours in base.css: ${literals.join(', ')}`).toEqual([])
  })

  it('reads every colour it needs from a custom property', () => {
    // A stylesheet that names no colour and reads no token would simply be unstyled.
    expect((BASE_CSS.match(/var\(--sh-/g) ?? []).length).toBeGreaterThan(20)
  })
})

/* ------------------------------------------------------------------------ *
 * The rest of the token contract DESIGN.md 10.3 asks for
 * ------------------------------------------------------------------------ */

/** The argument list of every `drop-shadow(…)`, with nested `var(…)` kept whole. */
function dropShadowArguments(css: string): string[] {
  const out: string[] = []
  const marker = 'drop-shadow('
  let at = css.indexOf(marker)
  while (at !== -1) {
    let depth = 1
    let i = at + marker.length
    while (i < css.length && depth > 0) {
      if (css[i] === '(') depth += 1
      else if (css[i] === ')') depth -= 1
      i += 1
    }
    out.push(css.slice(at + marker.length, i - 1))
    at = css.indexOf(marker, i)
  }
  return out
}

/** Splits on whitespace that is not inside a nested function call. */
function topLevelParts(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of value) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && /\s/.test(character)) {
      if (current.length > 0) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += character
  }
  if (current.length > 0) parts.push(current)
  return parts
}

describe('tokens.css carries the rest of the contract', () => {
  const declares = (name: string): boolean => new RegExp(`${name}\\s*:`).test(TOKENS_CSS)

  it('offers all four rungs of the display-scale ladder', () => {
    for (const scale of [100, 125, 150, 200]) {
      expect(TOKENS_CSS, `scale ${scale}`).toContain(`data-sh-scale='${scale}'`)
    }
    expect(declares('--sh-scale')).toBe(true)
  })

  it('keeps every interactive target at or above 24 CSS px', () => {
    // `max(rem, px)` is what holds the floor when the user's base font is small.
    expect(TOKENS_CSS).toMatch(/--sh-target-min\s*:\s*max\([^;]*24px\)/)
  })

  it('has a reduced-motion block, and an in-app override in both directions', () => {
    expect(TOKENS_CSS).toContain('prefers-reduced-motion: reduce')
    expect(TOKENS_CSS).toContain('sh-motion-full')
    expect(TOKENS_CSS).toContain('sh-reduce-motion')
  })

  it('spells out the carved-wood recipe from DESIGN.md section 6', () => {
    expect(declares('--sh-notch')).toBe(true)
    expect(declares('--sh-shadow-hard')).toBe(true)
    expect(declares('--sh-focus-ring')).toBe(true)
    expect(declares('--sh-frame')).toBe(true)
  })

  it('never rounds a corner and never blurs a shadow', () => {
    // DESIGN.md section 8: no rounded corners, no drop shadows with blur.
    const radii = TOKENS_CSS.match(/border-radius\s*:\s*(?!0)/g) ?? []
    expect(radii, `rounded corners: ${radii.join(', ')}`).toEqual([])

    const shadows = dropShadowArguments(TOKENS_CSS)
    expect(shadows.length, 'expected tokens.css to declare hard shadows').toBeGreaterThan(0)
    for (const shadow of shadows) {
      // drop-shadow(<x> <y> <blur> <colour>) — the third length must be exactly zero.
      const parts = topLevelParts(shadow)
      expect(parts.length, shadow).toBeGreaterThanOrEqual(3)
      expect(parts[2], `blur radius in drop-shadow(${shadow})`).toBe('0')
    }
  })

  it('never eases longer than the 250 ms DESIGN.md section 5 allows', () => {
    for (const duration of TOKENS_CSS.match(/--sh-dur-[a-z]+\s*:\s*(\d+)ms/g) ?? []) {
      const ms = Number(/(\d+)ms/.exec(duration)?.[1] ?? '0')
      expect(ms, duration).toBeLessThanOrEqual(250)
    }
  })
})
