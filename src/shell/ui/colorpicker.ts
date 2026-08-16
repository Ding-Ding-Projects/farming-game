/**
 * The colour system for the shell.
 *
 * Two halves live here:
 *
 * 1. **Colour maths** — a canonical `Rgba` value plus lossless conversions to and from
 *    hex, `rgb()`, `hsl()`, HSV and the fourteen named palette entries of
 *    `src/engine/palette.ts`. Every conversion is pure, DOM-free and safe to import in a
 *    node test environment. Round-tripping is stable: `parseColor(formatHsl(c))` returns
 *    exactly `c` for every one of the 16.7 million opaque colours, because `formatHsl`
 *    keeps one decimal place — integer degrees and percents drift by up to five 8-bit
 *    steps, one decimal drifts by none.
 *
 * 2. **The picker widget** — a continuous 2-D saturation/value field, a hue slider and an
 *    alpha slider, with live bidirectional hex / rgb / hsl / palette-name editing, a
 *    searchable strip of the fourteen palette swatches and a contrast readout that flags
 *    any pair below 4.5:1. Everything is a real focusable control; the 2-D field is
 *    driven by the arrow keys as well as the pointer.
 *
 * The pieces this file used to carry for the rest of the lane now live where the shell
 * contract names them: the anchored popover, the live region and the injected stylesheet
 * are in `primitives.ts`, the search field is in `searchfield.ts` and its builder is in
 * `regexbuilder.ts`. This file uses all three and owns none of them, which is what lets
 * the picker's own swatch filter be the same control as every other search in the app.
 *
 * DESIGN.md notes, recorded deliberately:
 * - Section 8 forbids gradients as *decoration*. The saturation/value field, the hue ramp
 *   and the alpha ramp are not decoration: the continuous ramp **is** the data the control
 *   presents, and the brief requires a continuous picker rather than a swatch grid. No
 *   other surface here uses a gradient, and there is still no radius, no blur and no
 *   literal hex outside `palette.ts`.
 * - Colour is taken from the `--pal-*` custom properties with the matching `palette.ts`
 *   value as the CSS fallback, so the control is correct whether or not `tokens.css` has
 *   been loaded yet.
 */

import { PAL } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'
import { announce, el, ensureSharedStyles, nextId, tok, tr } from './primitives'
import { createSearchField } from './searchfield'

/* ------------------------------------------------------------------ *
 * Colour maths
 * ------------------------------------------------------------------ */

/** Canonical colour: 8-bit channels plus an alpha in 0..1. */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** Hue 0..360, saturation and lightness 0..100. */
export interface Hsl {
  readonly h: number
  readonly s: number
  readonly l: number
}

/** Hue 0..360, saturation and value 0..100. */
export interface Hsv {
  readonly h: number
  readonly s: number
  readonly v: number
}

/** The fourteen palette entries, in DESIGN.md table order. */
export const PALETTE_NAMES: readonly PaletteName[] = [
  'ink',
  'shadow',
  'bark',
  'soil',
  'soilWet',
  'grass',
  'grassLit',
  'leaf',
  'parchment',
  'cream',
  'lantern',
  'berry',
  'sky',
  'dusk',
]

/** The contrast floor this shell holds itself to, WCAG 2.1 AA for body text. */
export const CONTRAST_AA = 4.5

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  if (v < min) return min
  return v > max ? max : v
}

function byte(v: number): number {
  return clamp(Math.round(v), 0, 255)
}

function hex2(v: number): string {
  const s = byte(v).toString(16)
  return s.length === 1 ? `0${s}` : s
}

/** Trims a fixed-point number: 43.90 -> "43.9", 46.0 -> "46". */
function trim(v: number, places: number): string {
  const s = v.toFixed(places)
  if (s.indexOf('.') < 0) return s
  return s.replace(/0+$/, '').replace(/\.$/, '')
}

export function rgbToHsl(c: Rgba): Hsl {
  const rn = c.r / 255
  const gn = c.g / 255
  const bn = c.b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb(hsl: Hsl, alpha = 1): Rgba {
  const h = ((hsl.h % 360) + 360) % 360
  const s = clamp(hsl.s, 0, 100) / 100
  const l = clamp(hsl.l, 0, 100) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = sector(h, c, x)
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255), a: clamp(alpha, 0, 1) }
}

export function rgbToHsv(c: Rgba): Hsv {
  const rn = c.r / 255
  const gn = c.g / 255
  const bn = c.b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 }
}

export function hsvToRgb(hsv: Hsv, alpha = 1): Rgba {
  const h = ((hsv.h % 360) + 360) % 360
  const s = clamp(hsv.s, 0, 100) / 100
  const v = clamp(hsv.v, 0, 100) / 100
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = sector(h, c, x)
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255), a: clamp(alpha, 0, 1) }
}

function sector(h: number, c: number, x: number): [number, number, number] {
  if (h < 60) return [c, x, 0]
  if (h < 120) return [x, c, 0]
  if (h < 180) return [0, c, x]
  if (h < 240) return [0, x, c]
  if (h < 300) return [x, 0, c]
  return [c, 0, x]
}

/** `#rrggbb`, or `#rrggbbaa` when the colour is not fully opaque. */
export function formatHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  return c.a >= 1 ? base : `${base}${hex2(c.a * 255)}`
}

/** `rgb(r, g, b)` or `rgba(r, g, b, a)`. */
export function formatRgb(c: Rgba): string {
  const head = `${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}`
  return c.a >= 1 ? `rgb(${head})` : `rgba(${head}, ${trim(clamp(c.a, 0, 1), 3)})`
}

/**
 * `hsl(h, s%, l%)` or `hsla(h, s%, l%, a)`, to one decimal place. One decimal is the
 * precision at which every 8-bit colour survives the trip out to HSL and back unchanged.
 */
export function formatHsl(c: Rgba): string {
  const hsl = rgbToHsl(c)
  const head = `${trim(hsl.h, 1)}, ${trim(hsl.s, 1)}%, ${trim(hsl.l, 1)}%`
  return c.a >= 1 ? `hsl(${head})` : `hsla(${head}, ${trim(clamp(c.a, 0, 1), 3)})`
}

/** The value stored and applied: hex while opaque, `rgba()` once alpha is involved. */
export function formatCss(c: Rgba): string {
  return c.a >= 1 ? formatHex(c) : formatRgb(c)
}

export function sameColor(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.0005
}

function parseNumber(raw: string, full: number): number | null {
  const s = raw.trim()
  if (s.length === 0) return null
  if (s.endsWith('%')) {
    const pct = Number(s.slice(0, -1))
    if (!Number.isFinite(pct)) return null
    return (pct / 100) * full
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseAlpha(raw: string | undefined): number | null {
  if (raw === undefined) return 1
  const s = raw.trim()
  if (s.length === 0) return 1
  if (s.endsWith('%')) {
    const pct = Number(s.slice(0, -1))
    return Number.isFinite(pct) ? clamp(pct / 100, 0, 1) : null
  }
  const n = Number(s)
  return Number.isFinite(n) ? clamp(n, 0, 1) : null
}

function parseAngle(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  const m = /^(-?[0-9]*\.?[0-9]+)(deg|grad|rad|turn)?$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  switch (m[2]) {
    case 'grad':
      return (n * 360) / 400
    case 'rad':
      return (n * 180) / Math.PI
    case 'turn':
      return n * 360
    default:
      return n
  }
}

/** Splits `a, b, c` or `a b c / d` into its parts. Returns null on an unusable shape. */
function splitArgs(body: string): { parts: string[]; alpha?: string } | null {
  const slash = body.indexOf('/')
  const head = slash < 0 ? body : body.slice(0, slash)
  const alpha = slash < 0 ? undefined : body.slice(slash + 1)
  const parts = head
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.length === 4 && alpha === undefined) return { parts: parts.slice(0, 3), alpha: parts[3] }
  if (parts.length !== 3) return null
  return alpha === undefined ? { parts } : { parts, alpha }
}

/**
 * Reads any representation this shell writes or a user might type: `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, one of the fourteen
 * palette names, or `transparent`. Returns null rather than throwing on anything else, so
 * a half-typed value in a text field is simply "not yet valid".
 */
export function parseColor(input: string): Rgba | null {
  const raw = input.trim()
  if (raw.length === 0) return null

  const named = PALETTE_NAMES.find((n) => n.toLowerCase() === raw.toLowerCase())
  if (named) return parseColor(PAL[named])

  if (raw.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  if (raw.charCodeAt(0) === 35 /* # */) {
    const body = raw.slice(1)
    if (!/^[0-9a-fA-F]+$/.test(body)) return null
    let digits: string
    if (body.length === 3 || body.length === 4) {
      digits = body
        .split('')
        .map((d) => d + d)
        .join('')
    } else if (body.length === 6 || body.length === 8) {
      digits = body
    } else {
      return null
    }
    const r = parseInt(digits.slice(0, 2), 16)
    const g = parseInt(digits.slice(2, 4), 16)
    const b = parseInt(digits.slice(4, 6), 16)
    const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }

  const fn = /^([a-zA-Z]+)\((.*)\)$/.exec(raw)
  if (!fn) return null
  const name = fn[1].toLowerCase()
  const args = splitArgs(fn[2])
  if (!args) return null
  const alpha = parseAlpha(args.alpha)
  if (alpha === null) return null

  if (name === 'rgb' || name === 'rgba') {
    const r = parseNumber(args.parts[0], 255)
    const g = parseNumber(args.parts[1], 255)
    const b = parseNumber(args.parts[2], 255)
    if (r === null || g === null || b === null) return null
    return { r: byte(r), g: byte(g), b: byte(b), a: alpha }
  }

  if (name === 'hsl' || name === 'hsla') {
    const h = parseAngle(args.parts[0])
    const s = parseNumber(args.parts[1], 100)
    const l = parseNumber(args.parts[2], 100)
    if (h === null || s === null || l === null) return null
    return hslToRgb({ h, s: clamp(s, 0, 100), l: clamp(l, 0, 100) }, alpha)
  }

  return null
}

let paletteCache: ReadonlyArray<{ name: PaletteName; rgba: Rgba }> | null = null

function paletteEntries(): ReadonlyArray<{ name: PaletteName; rgba: Rgba }> {
  if (!paletteCache) {
    paletteCache = PALETTE_NAMES.map((name) => ({
      name,
      // `palette.ts` is a table of six-digit hex; the fallback only guards a future typo.
      rgba: parseColor(PAL[name]) ?? { r: 0, g: 0, b: 0, a: 1 },
    }))
  }
  return paletteCache
}

/** The palette entry this colour *is*, or null when it is a custom colour. */
export function paletteNameFor(c: Rgba): PaletteName | null {
  if (c.a < 1) return null
  for (const entry of paletteEntries()) {
    if (entry.rgba.r === c.r && entry.rgba.g === c.g && entry.rgba.b === c.b) return entry.name
  }
  return null
}

/** The colour of a named palette entry. */
export function colorForPaletteName(name: PaletteName): Rgba {
  const found = paletteEntries().find((e) => e.name === name)
  return found ? found.rgba : { r: 0, g: 0, b: 0, a: 1 }
}

/** Source-over composite of a translucent colour onto an opaque one. */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = clamp(fg.a, 0, 1)
  if (a >= 1) return fg
  return {
    r: byte(fg.r * a + bg.r * (1 - a)),
    g: byte(fg.g * a + bg.g * (1 - a)),
    b: byte(fg.b * a + bg.b * (1 - a)),
    a: 1,
  }
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(c: Rgba): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/**
 * WCAG 2.1 contrast ratio, 1..21. A translucent foreground is composited onto the
 * background first, so the number reflects what the eye actually receives.
 */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const base = bg.a >= 1 ? bg : compositeOver(bg, colorForPaletteName('parchment'))
  const front = compositeOver(fg, base)
  const l1 = relativeLuminance(front)
  const l2 = relativeLuminance(base)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export function meetsContrastAA(ratio: number): boolean {
  return ratio + 0.0005 >= CONTRAST_AA
}

/** Catalogue ids for every search field this lane creates. */
export const SEARCH_FIELD_IDS = {
  /** Filters the fourteen palette swatches inside any colour picker. */
  swatches: 'appearance.colorpicker.swatches',
  /** Filters the property rows of the appearance editor popover. */
  properties: 'appearance.editor.properties',
  /** Filters the items of an element's appearance context menu. */
  menu: 'appearance.menu.items',
} as const

/* ------------------------------------------------------------------ *
 * The picker
 * ------------------------------------------------------------------ */

export interface ColorPickerOpts {
  /** Starting colour in any representation `parseColor` understands. */
  readonly value: string
  /**
   * The colour this one is read against. Editing a foreground passes the background here;
   * editing a background passes the foreground.
   */
  readonly background?: string
  /** Show the alpha slider. Defaults to true. */
  readonly alpha?: boolean
  /** Accessible name for the whole control. */
  readonly labelKey?: string
  /** Catalogue id for the swatch search field. */
  readonly searchId?: string
  onChange(css: string): void
}

export interface ColorPicker {
  readonly el: HTMLElement
  value(): string
  color(): Rgba
  setValue(css: string): void
  setBackground(css: string): void
  contrast(): number
  focus(): void
}

/**
 * The continuous picker. Canonical state is HSV plus alpha, which is what keeps the
 * control honest under the pointer: dragging value down to black or saturation to zero
 * does not throw the hue away, so dragging back up returns the colour you started from.
 * Every other representation is derived from it on the way out and folded into it on the
 * way in.
 */
export function createColorPicker(opts: ColorPickerOpts): ColorPicker {
  ensureSharedStyles()

  const showAlpha = opts.alpha !== false
  let hsv: Hsv = { h: 0, s: 0, v: 0 }
  let alpha = 1
  let background: Rgba = parseColor(opts.background ?? PAL.parchment) ?? colorForPaletteName('parchment')

  const root = el('div', 'sh-cp')
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', tr(opts.labelKey ?? 'colorpicker.label'))

  /* --- 2-D saturation / value field --- */
  const field = el('div', 'sh-cp-field', root)
  const thumb = el('button', 'sh-cp-thumb', field)
  thumb.type = 'button'
  thumb.setAttribute('role', 'slider')
  thumb.setAttribute('aria-label', tr('colorpicker.field'))
  thumb.setAttribute('aria-valuemin', '0')
  thumb.setAttribute('aria-valuemax', '100')
  const fieldHelp = el('p', 'sh-vh', root)
  fieldHelp.id = nextId('sh-cp-help')
  fieldHelp.textContent = tr('colorpicker.fieldHelp')
  thumb.setAttribute('aria-describedby', fieldHelp.id)

  /* --- sliders --- */
  const hue = slider(root, 'colorpicker.hue', 0, 360, 1, 'sh-cp-hue')
  const sat = slider(root, 'colorpicker.saturation', 0, 100, 1, 'sh-cp-plain')
  const val = slider(root, 'colorpicker.brightness', 0, 100, 1, 'sh-cp-plain')
  const alphaSlider = slider(root, 'colorpicker.alpha', 0, 100, 1, 'sh-cp-alpha')
  if (!showAlpha) alphaSlider.row.hidden = true

  /* --- readouts --- */
  const head = el('div', 'sh-cp-head', root)
  const preview = el('span', 'sh-cp-preview', head)
  preview.setAttribute('role', 'img')
  const nameOut = el('span', 'sh-cp-name', head)

  const contrastOut = el('p', 'sh-cp-contrast', root)
  contrastOut.setAttribute('role', 'status')

  /* --- text representations --- */
  const texts = el('div', 'sh-cp-texts', root)
  const hexInput = textRow(texts, 'colorpicker.hex')
  const rgbInput = textRow(texts, 'colorpicker.rgb')
  const hslInput = textRow(texts, 'colorpicker.hsl')

  /* --- searchable palette swatches --- */
  const swatchWrap = el('div', 'sh-cp-swatches-wrap', root)
  const swatchHeading = el('h3', 'sh-small', swatchWrap)
  swatchHeading.id = nextId('sh-cp-swatches')
  swatchHeading.textContent = tr('colorpicker.swatches')
  const search = createSearchField({
    id: opts.searchId ?? SEARCH_FIELD_IDS.swatches,
    labelKey: 'colorpicker.searchLabel',
    placeholderKey: 'colorpicker.searchPlaceholder',
    onChange: () => applyFilter(),
  })
  swatchWrap.appendChild(search.el)
  const swatchList = el('div', 'sh-cp-swatches', swatchWrap)
  swatchList.setAttribute('role', 'group')
  swatchList.setAttribute('aria-labelledby', swatchHeading.id)
  const swatchCount = el('p', 'sh-small', swatchWrap)
  swatchCount.setAttribute('role', 'status')

  const swatches = PALETTE_NAMES.map((name) => {
    const button = el('button', 'sh-cp-swatch', swatchList)
    button.type = 'button'
    button.tabIndex = -1
    button.dataset.name = name
    button.style.setProperty('--sh-cp-swatch', tok(name))
    button.setAttribute('aria-label', tr('colorpicker.swatch', { name, hex: PAL[name] }))
    button.title = `${name} ${PAL[name]}`
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => {
      setColor(colorForPaletteName(name), 'swatch')
      announce(tr('colorpicker.chose', { name, hex: PAL[name] }))
    })
    return { name, button }
  })
  swatchList.addEventListener('keydown', onSwatchKeys)

  /* --- behaviour --- */

  function slider(
    parent: HTMLElement,
    labelKey: string,
    min: number,
    max: number,
    step: number,
    className: string,
  ): { row: HTMLElement; input: HTMLInputElement } {
    const row = el('div', 'sh-cp-slider', parent)
    const id = nextId('sh-cp-range')
    const lab = el('label', 'sh-small', row)
    lab.htmlFor = id
    lab.textContent = tr(labelKey)
    const range = el('input', className, row)
    range.id = id
    range.type = 'range'
    range.min = String(min)
    range.max = String(max)
    range.step = String(step)
    range.addEventListener('input', () => onSliderInput(range, className))
    range.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (!ev.shiftKey) return
      const delta =
        ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 10 : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -10 : 0
      if (delta === 0) return
      ev.preventDefault()
      range.value = String(clamp(Number(range.value) + delta, min, max))
      onSliderInput(range, className)
    })
    return { row, input: range }
  }

  function onSliderInput(range: HTMLInputElement, className: string): void {
    const n = Number(range.value)
    if (className === 'sh-cp-hue') hsv = { h: clamp(n, 0, 360), s: hsv.s, v: hsv.v }
    else if (className === 'sh-cp-alpha') alpha = clamp(n, 0, 100) / 100
    else if (range === sat.input) hsv = { h: hsv.h, s: clamp(n, 0, 100), v: hsv.v }
    else hsv = { h: hsv.h, s: hsv.s, v: clamp(n, 0, 100) }
    emit('slider')
  }

  function textRow(parent: HTMLElement, labelKey: string): HTMLInputElement {
    const row = el('div', 'sh-cp-text', parent)
    const id = nextId('sh-cp-text')
    const lab = el('label', 'sh-small', row)
    lab.htmlFor = id
    lab.textContent = tr(labelKey)
    const input = el('input', 'sh-search-input sh-mono', row)
    input.id = id
    input.type = 'text'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.addEventListener('input', () => {
      const parsed = parseColor(input.value)
      if (!parsed) {
        input.setAttribute('aria-invalid', 'true')
        return
      }
      input.removeAttribute('aria-invalid')
      setColor(parsed, input)
    })
    input.addEventListener('blur', () => {
      input.removeAttribute('aria-invalid')
      render(null)
    })
    return input
  }

  function currentRgba(): Rgba {
    return hsvToRgb(hsv, alpha)
  }

  /** Folds an RGBA in, keeping hue and saturation that the RGBA cannot express. */
  function setColor(next: Rgba, source: HTMLInputElement | 'swatch' | null): void {
    const nextHsv = rgbToHsv(next)
    hsv = {
      h: nextHsv.s === 0 || nextHsv.v === 0 ? hsv.h : nextHsv.h,
      s: nextHsv.v === 0 ? hsv.s : nextHsv.s,
      v: nextHsv.v,
    }
    alpha = next.a
    emit(source)
  }

  function emit(source: HTMLInputElement | 'slider' | 'field' | 'swatch' | null): void {
    render(source instanceof HTMLInputElement ? source : null)
    opts.onChange(formatCss(currentRgba()))
  }

  /** Repaints every representation except the one the user is typing into. */
  function render(skip: HTMLInputElement | null): void {
    const rgba = currentRgba()
    const css = formatCss(rgba)
    const name = paletteNameFor(rgba)

    root.style.setProperty('--sh-cp-color', css)
    root.style.setProperty('--sh-cp-hue-color', `hsl(${trim(hsv.h, 1)}, 100%, 50%)`)
    root.style.setProperty('--sh-cp-s', trim(hsv.s, 2))
    root.style.setProperty('--sh-cp-v', trim(hsv.v, 2))

    thumb.setAttribute('aria-valuenow', String(Math.round(hsv.s)))
    thumb.setAttribute(
      'aria-valuetext',
      name
        ? tr('colorpicker.fieldValueNamed', {
            saturation: Math.round(hsv.s),
            brightness: Math.round(hsv.v),
            hex: formatHex(rgba),
            name,
          })
        : tr('colorpicker.fieldValue', {
            saturation: Math.round(hsv.s),
            brightness: Math.round(hsv.v),
            hex: formatHex(rgba),
          }),
    )

    hue.input.value = String(Math.round(hsv.h))
    sat.input.value = String(Math.round(hsv.s))
    val.input.value = String(Math.round(hsv.v))
    alphaSlider.input.value = String(Math.round(alpha * 100))
    hue.input.setAttribute('aria-valuetext', tr('colorpicker.hueValue', { degrees: Math.round(hsv.h) }))
    sat.input.setAttribute('aria-valuetext', tr('colorpicker.percent', { percent: Math.round(hsv.s) }))
    val.input.setAttribute('aria-valuetext', tr('colorpicker.percent', { percent: Math.round(hsv.v) }))
    alphaSlider.input.setAttribute('aria-valuetext', tr('colorpicker.percent', { percent: Math.round(alpha * 100) }))

    if (skip !== hexInput) hexInput.value = formatHex(rgba)
    if (skip !== rgbInput) rgbInput.value = formatRgb(rgba)
    if (skip !== hslInput) hslInput.value = formatHsl(rgba)

    preview.setAttribute('aria-label', tr('colorpicker.preview', { hex: formatHex(rgba) }))
    nameOut.textContent = name ? tr('colorpicker.named', { name }) : tr('colorpicker.custom', { hex: formatHex(rgba) })

    for (const s of swatches) {
      const isCurrent = name === s.name
      s.button.setAttribute('aria-pressed', isCurrent ? 'true' : 'false')
    }

    renderContrast(rgba)
  }

  function renderContrast(rgba: Rgba): void {
    const ratio = contrastRatio(rgba, background)
    const shown = ratio.toFixed(2)
    const pass = meetsContrastAA(ratio)
    contrastOut.textContent = pass
      ? tr('colorpicker.contrastPass', { ratio: shown, required: CONTRAST_AA, against: formatHex(background) })
      : tr('colorpicker.contrastFail', { ratio: shown, required: CONTRAST_AA, against: formatHex(background) })
    contrastOut.dataset.fail = pass ? 'false' : 'true'
  }

  /* --- pointer and keyboard on the 2-D field --- */

  function setFromPoint(clientX: number, clientY: number): void {
    const rect = field.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100)
    hsv = { h: hsv.h, s, v }
    emit('field')
  }

  field.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    field.setPointerCapture(ev.pointerId)
    thumb.focus()
    setFromPoint(ev.clientX, ev.clientY)
  })
  field.addEventListener('pointermove', (ev: PointerEvent) => {
    if (!field.hasPointerCapture(ev.pointerId)) return
    ev.preventDefault()
    setFromPoint(ev.clientX, ev.clientY)
  })
  field.addEventListener('pointerup', (ev: PointerEvent) => {
    if (field.hasPointerCapture(ev.pointerId)) field.releasePointerCapture(ev.pointerId)
  })

  thumb.addEventListener('keydown', (ev: KeyboardEvent) => {
    const step = ev.shiftKey ? 10 : 1
    let s = hsv.s
    let v = hsv.v
    switch (ev.key) {
      case 'ArrowLeft':
        s -= step
        break
      case 'ArrowRight':
        s += step
        break
      case 'ArrowUp':
        v += step
        break
      case 'ArrowDown':
        v -= step
        break
      case 'Home':
        s = 0
        break
      case 'End':
        s = 100
        break
      case 'PageUp':
        v = 100
        break
      case 'PageDown':
        v = 0
        break
      default:
        return
    }
    ev.preventDefault()
    hsv = { h: hsv.h, s: clamp(s, 0, 100), v: clamp(v, 0, 100) }
    emit('field')
  })

  /* --- swatch roving tabindex --- */

  function visibleSwatches(): HTMLButtonElement[] {
    return swatches.filter((s) => !s.button.hidden).map((s) => s.button)
  }

  function focusSwatch(index: number): void {
    const list = visibleSwatches()
    if (list.length === 0) return
    const wrapped = ((index % list.length) + list.length) % list.length
    for (const b of list) b.tabIndex = -1
    list[wrapped].tabIndex = 0
    list[wrapped].focus()
  }

  function onSwatchKeys(ev: KeyboardEvent): void {
    const target = ev.target
    if (!(target instanceof HTMLButtonElement)) return
    const list = visibleSwatches()
    const at = list.indexOf(target)
    if (at < 0) return
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        ev.preventDefault()
        focusSwatch(at + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        ev.preventDefault()
        focusSwatch(at - 1)
        break
      case 'Home':
        ev.preventDefault()
        focusSwatch(0)
        break
      case 'End':
        ev.preventDefault()
        focusSwatch(list.length - 1)
        break
      default:
        break
    }
  }

  function applyFilter(): void {
    let shown = 0
    for (const s of swatches) {
      const hit = search.test(s.name) || search.test(PAL[s.name])
      s.button.hidden = !hit
      if (hit) shown += 1
    }
    const list = visibleSwatches()
    for (const b of list) b.tabIndex = -1
    if (list.length > 0) list[0].tabIndex = 0
    // Silent when everything is showing; the count only matters once a query narrows it.
    swatchCount.textContent =
      shown === swatches.length ? '' : tr('search.results', { count: shown, query: search.query() })
  }

  const start = parseColor(opts.value)
  if (start) {
    const startHsv = rgbToHsv(start)
    hsv = startHsv
    alpha = start.a
  }
  applyFilter()
  render(null)

  return {
    el: root,
    value: () => formatCss(currentRgba()),
    color: () => currentRgba(),
    setValue: (css: string) => {
      const parsed = parseColor(css)
      if (!parsed) return
      const next = rgbToHsv(parsed)
      hsv = {
        h: next.s === 0 || next.v === 0 ? hsv.h : next.h,
        s: next.v === 0 ? hsv.s : next.s,
        v: next.v,
      }
      alpha = parsed.a
      render(null)
    },
    setBackground: (css: string) => {
      const parsed = parseColor(css)
      if (!parsed) return
      background = parsed
      renderContrast(currentRgba())
    },
    contrast: () => contrastRatio(currentRgba(), background),
    focus: () => thumb.focus(),
  }
}
