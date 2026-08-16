/**
 * The token layer's TypeScript half.
 *
 * `tokens.css` holds the fourteen palette entries as custom properties; this module
 * holds the same mapping in TS, a comparison helper so a test can prove the stylesheet
 * has not drifted from `src/engine/palette.ts`, and the one function that writes the
 * display scale and any persisted appearance overrides onto the document root.
 *
 * There is no literal colour here on purpose: every value is read from
 * `src/engine/palette.ts`, so this file cannot be the thing that drifts. The stylesheet
 * is the transcription under test.
 *
 * Importing this module also pulls in the stylesheets, so any lane that needs a token
 * gets the CSS with it.
 */

import './tokens.css'
import './base.css'

import { PAL } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'

/** The prefix every palette custom property shares. Nothing else may use it. */
export const PALETTE_VAR_PREFIX = '--sh-color-'

/**
 * Palette entry to custom property. Written out rather than derived from the key so
 * the mapping is greppable from either direction.
 */
export const PALETTE_VARS: Readonly<Record<PaletteName, string>> = {
  ink: '--sh-color-ink',
  shadow: '--sh-color-shadow',
  bark: '--sh-color-bark',
  soil: '--sh-color-soil',
  soilWet: '--sh-color-soil-wet',
  grass: '--sh-color-grass',
  grassLit: '--sh-color-grass-lit',
  leaf: '--sh-color-leaf',
  parchment: '--sh-color-parchment',
  cream: '--sh-color-cream',
  lantern: '--sh-color-lantern',
  berry: '--sh-color-berry',
  sky: '--sh-color-sky',
  dusk: '--sh-color-dusk',
}

/** Every palette entry name, in the order `src/engine/palette.ts` declares them. */
export const PALETTE_NAMES: readonly PaletteName[] = Object.keys(PAL) as PaletteName[]

/**
 * The palette as the tokens express it: custom property to colour. Values come from
 * `PAL`, so this side of the comparison is true by construction and the stylesheet is
 * the side being checked.
 */
export const PALETTE_TOKENS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    PALETTE_NAMES.map((name) => [PALETTE_VARS[name], normaliseHex(PAL[name])]),
  ),
)

/** `--sh-color-lantern` for `lantern`. */
export function paletteVarName(name: PaletteName): string {
  return PALETTE_VARS[name]
}

/** `var(--sh-color-lantern)` for `lantern`, ready to drop into a style value. */
export function paletteVar(name: PaletteName): string {
  return `var(${PALETTE_VARS[name]})`
}

// ---------------------------------------------------------------------------
// tokens.css vs palette.ts
// ---------------------------------------------------------------------------

export type PaletteTokenIssueKind = 'missing' | 'mismatch' | 'unknown'

export interface PaletteTokenIssue {
  /** The custom property the issue is about. */
  readonly variable: string
  /** The palette entry it should have carried, when there is one. */
  readonly name: PaletteName | null
  /** What `src/engine/palette.ts` says, lower-cased and expanded to six digits. */
  readonly expected: string | null
  /** What the stylesheet says, in the same form. `null` when it says nothing. */
  readonly actual: string | null
  readonly kind: PaletteTokenIssueKind
}

/** `#ABC` and `#AABBCC` both become `#aabbcc`. Anything else is handed back trimmed. */
function normaliseHex(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw.startsWith('#')) return raw
  const body = raw.slice(1)
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
  }
  return raw
}

/**
 * Every `--sh-color-*` declaration in a stylesheet, keyed by custom property. Values
 * are normalised so `#FFF` and `#ffffff` compare equal. A property declared more than
 * once keeps the last declaration, which is what the cascade would use.
 */
export function parsePaletteTokens(css: string): Record<string, string> {
  const found: Record<string, string> = {}
  const pattern = /(--sh-color-[a-z0-9-]+)\s*:\s*([^;{}]+)/g
  let match = pattern.exec(css)
  while (match !== null) {
    const variable = match[1]
    const value = match[2]
    if (variable !== undefined && value !== undefined) {
      found[variable] = normaliseHex(value)
    }
    match = pattern.exec(css)
  }
  return found
}

/**
 * Compare the stylesheet against `src/engine/palette.ts`. An empty array means the
 * fourteen entries are present, correct and unaccompanied by any stray `--sh-color-*`.
 */
export function comparePaletteTokens(css: string): PaletteTokenIssue[] {
  const declared = parsePaletteTokens(css)
  const issues: PaletteTokenIssue[] = []

  for (const name of PALETTE_NAMES) {
    const variable = PALETTE_VARS[name]
    const expected = normaliseHex(PAL[name])
    const actual = declared[variable]
    if (actual === undefined) {
      issues.push({ variable, name, expected, actual: null, kind: 'missing' })
    } else if (actual !== expected) {
      issues.push({ variable, name, expected, actual, kind: 'mismatch' })
    }
  }

  const known = new Set(Object.values(PALETTE_VARS))
  for (const variable of Object.keys(declared)) {
    if (!known.has(variable)) {
      const actual = declared[variable]
      issues.push({
        variable,
        name: null,
        expected: null,
        actual: actual === undefined ? null : actual,
        kind: 'unknown',
      })
    }
  }

  return issues
}

/** True when the stylesheet and the engine palette agree exactly. */
export function tokensMatchPalette(css: string): boolean {
  return comparePaletteTokens(css).length === 0
}

/** One issue per line, for a test failure message a human can act on. */
export function describePaletteTokenIssues(issues: readonly PaletteTokenIssue[]): string {
  return issues
    .map((issue) => {
      switch (issue.kind) {
        case 'missing':
          return `${issue.variable} is missing from tokens.css (expected ${issue.expected})`
        case 'mismatch':
          return `${issue.variable} is ${issue.actual} in tokens.css but ${issue.expected} in palette.ts`
        case 'unknown':
          return `${issue.variable} is declared in tokens.css but is not a palette entry`
      }
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// the root: display scale, motion and appearance overrides
// ---------------------------------------------------------------------------

/** The four rungs of the display-scale ladder, as percentages. */
export type DisplayScale = 100 | 125 | 150 | 200

export const DISPLAY_SCALES: readonly DisplayScale[] = [100, 125, 150, 200]

export const DEFAULT_DISPLAY_SCALE: DisplayScale = 100

/** The attribute `tokens.css` keys the ladder off. */
export const SCALE_ATTRIBUTE = 'data-sh-scale'

/** The custom property the ladder sets; the root font size is derived from it. */
export const SCALE_VAR = '--sh-scale'

export function isDisplayScale(value: unknown): value is DisplayScale {
  return (
    typeof value === 'number' &&
    (DISPLAY_SCALES as readonly number[]).includes(value)
  )
}

/** 125 becomes 1.25. Anything unrecognised falls back to 1. */
export function scaleFactor(scale: DisplayScale | number): number {
  return isDisplayScale(scale) ? scale / 100 : 1
}

/** How the in-app motion setting relates to the system preference. */
export type MotionMode = 'system' | 'full' | 'reduced'

export const MOTION_CLASS = {
  full: 'sh-motion-full',
  reduced: 'sh-reduce-motion',
} as const

/**
 * An appearance override: either a palette entry name (`lantern`) or a whole custom
 * property (`--sh-tab-w`). Anything else is ignored rather than trusted, because these
 * values arrive from persisted storage.
 */
export type AppearanceOverrides = Readonly<Record<string, string>>

export interface RootTokenOptions {
  /** The display-scale rung. Omit to leave the current one alone. */
  scale?: DisplayScale
  /** Custom-property overrides to apply, replacing any applied by a previous call. */
  overrides?: AppearanceOverrides
  /** Motion mode. Omit to leave the current one alone. */
  motion?: MotionMode
  /** Defaults to `document.documentElement`. */
  root?: HTMLElement
}

/** Overrides written by the last call, per root, so a removed one is really removed. */
const applied = new WeakMap<HTMLElement, Set<string>>()

const VAR_NAME = /^--[a-z0-9-]+$/i

/** Rejects anything that could carry more than one declaration, plus control chars. */
const SAFE_VALUE = /^[^;{}<>\\]{1,256}$/

function resolveRoot(root?: HTMLElement): HTMLElement | null {
  if (root !== undefined) return root
  if (typeof document === 'undefined') return null
  return document.documentElement
}

/** A palette entry name, a bare custom property, or nothing usable at all. */
function resolveVarName(key: string): string | null {
  const trimmed = key.trim()
  if (trimmed.startsWith('--')) {
    return VAR_NAME.test(trimmed) ? trimmed : null
  }
  if (Object.prototype.hasOwnProperty.call(PALETTE_VARS, trimmed)) {
    return PALETTE_VARS[trimmed as PaletteName]
  }
  return null
}

/**
 * Write the display scale, the motion mode and the appearance overrides onto the root
 * as inline custom properties.
 *
 * Overrides are cumulative in one call and replaced across calls: whatever the previous
 * call set and this one does not is removed, so turning an appearance edit off restores
 * the stylesheet value instead of leaving it stuck. A no-op where there is no document.
 */
export function applyRootTokens(options: RootTokenOptions = {}): void {
  const root = resolveRoot(options.root)
  if (root === null) return

  if (options.scale !== undefined && isDisplayScale(options.scale)) {
    root.setAttribute(SCALE_ATTRIBUTE, String(options.scale))
    root.style.setProperty(SCALE_VAR, String(scaleFactor(options.scale)))
  }

  if (options.motion !== undefined) {
    root.classList.toggle(MOTION_CLASS.full, options.motion === 'full')
    root.classList.toggle(MOTION_CLASS.reduced, options.motion === 'reduced')
  }

  if (options.overrides !== undefined) {
    const previous = applied.get(root) ?? new Set<string>()
    const next = new Set<string>()

    for (const [key, value] of Object.entries(options.overrides)) {
      const variable = resolveVarName(key)
      if (variable === null) continue
      if (typeof value !== 'string') continue
      const trimmed = value.trim()
      if (!SAFE_VALUE.test(trimmed)) continue
      root.style.setProperty(variable, trimmed)
      next.add(variable)
    }

    for (const variable of previous) {
      if (!next.has(variable)) root.style.removeProperty(variable)
    }

    applied.set(root, next)
  }
}

/**
 * Drop every override and scale this module applied, returning the root to the values
 * the stylesheet declares. Used by "reset appearance" and by "reset everything".
 */
export function resetRootTokens(root?: HTMLElement): void {
  const target = resolveRoot(root)
  if (target === null) return

  const previous = applied.get(target)
  if (previous !== undefined) {
    for (const variable of previous) target.style.removeProperty(variable)
    applied.delete(target)
  }

  target.style.removeProperty(SCALE_VAR)
  target.setAttribute(SCALE_ATTRIBUTE, String(DEFAULT_DISPLAY_SCALE))
  target.classList.remove(MOTION_CLASS.full, MOTION_CLASS.reduced)
}

/** The custom properties currently overridden on a root, for the appearance editor. */
export function overriddenVars(root?: HTMLElement): string[] {
  const target = resolveRoot(root)
  if (target === null) return []
  return Array.from(applied.get(target) ?? [])
}
