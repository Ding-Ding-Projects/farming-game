/**
 * The Sprout Hollow palette — fourteen colours, transcribed from DESIGN.md section 3.
 * Nothing in the game may invent a colour: every pixel comes from here, or from
 * `shade`/`withAlpha` applied to something here.
 */

export type PaletteName =
  | 'ink'
  | 'shadow'
  | 'bark'
  | 'soil'
  | 'soilWet'
  | 'grass'
  | 'grassLit'
  | 'leaf'
  | 'parchment'
  | 'cream'
  | 'lantern'
  | 'berry'
  | 'sky'
  | 'dusk'

export const PAL: Record<PaletteName, string> = {
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

/** Packed 0xrrggbb, or -1 when the string is not a hex colour we understand. */
function parseHex(hex: string): number {
  const body = hex.charCodeAt(0) === 35 /* # */ ? hex.slice(1) : hex
  let digits: string
  if (body.length === 3) {
    digits =
      body[0] + body[0] + body[1] + body[1] + body[2] + body[2]
  } else if (body.length === 6 || body.length === 8) {
    digits = body.slice(0, 6)
  } else {
    return -1
  }
  let packed = 0
  for (let i = 0; i < 6; i++) {
    const code = digits.charCodeAt(i)
    let nibble: number
    if (code >= 48 && code <= 57) nibble = code - 48
    else if (code >= 97 && code <= 102) nibble = code - 87
    else if (code >= 65 && code <= 70) nibble = code - 55
    else return -1
    packed = packed * 16 + nibble
  }
  return packed
}

function toHex(r: number, g: number, b: number): string {
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

function clamp01(v: number): number {
  if (!(v > 0)) return 0 // also catches NaN
  return v > 1 ? 1 : v
}

function byte(v: number): number {
  const r = Math.round(v)
  if (r < 0) return 0
  return r > 255 ? 255 : r
}

/**
 * `#rrggbb` plus an alpha in 0..1 to a css `rgba()` string. A colour that is not a
 * hex triple is handed back untouched rather than throwing mid-frame.
 */
export function withAlpha(hex: string, alpha: number): string {
  const packed = parseHex(hex)
  if (packed < 0) return hex
  const a = clamp01(alpha)
  const r = (packed >> 16) & 0xff
  const g = (packed >> 8) & 0xff
  const b = packed & 0xff
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
}

/**
 * Mix a colour toward `PAL.ink` (amount < 0) or `PAL.cream` (amount > 0) by up to
 * 100%. Keeps the palette coherent: darker and lighter tones still belong to the set.
 */
export function shade(hex: string, amount: number): string {
  const packed = parseHex(hex)
  if (packed < 0) return hex
  let t = amount
  if (Number.isNaN(t)) t = 0
  if (t > 1) t = 1
  if (t < -1) t = -1
  if (t === 0) return toHex((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff)

  const target = parseHex(t < 0 ? PAL.ink : PAL.cream)
  const k = t < 0 ? -t : t
  const r = (packed >> 16) & 0xff
  const g = (packed >> 8) & 0xff
  const b = packed & 0xff
  const tr = (target >> 16) & 0xff
  const tg = (target >> 8) & 0xff
  const tb = target & 0xff
  return toHex(
    byte(r + (tr - r) * k),
    byte(g + (tg - g) * k),
    byte(b + (tb - b) * k),
  )
}
