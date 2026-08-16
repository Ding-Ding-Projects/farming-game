import type { Season, Tile } from '../game/types'
import { TILE } from '../game/constants'
import { PAL, shade, withAlpha } from '../engine/palette'
import { hline, px, rect, vline } from '../engine/pixel'

/* ------------------------------------------------------------------ *
 * Shared art helpers. Kept here because tiles.ts is the lowest art
 * module; scenery.ts imports them rather than duplicating them.
 * ------------------------------------------------------------------ */

let reducedMotion: boolean | null = null

/**
 * True when the user asked for reduced motion. Probed once and cached, so a
 * frame loop can call it freely. Safe in a non-DOM environment.
 */
export function prefersReducedMotion(): boolean {
  if (reducedMotion === null) {
    let m = false
    try {
      if (typeof matchMedia === 'function') m = matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      m = false
    }
    reducedMotion = m
  }
  return reducedMotion
}

/** Deterministic 0..1 from two integers. The art layer's stand-in for randomness. */
export function artNoise(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x165667b1) | 0, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function chan(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
}

function hex2(v: number): string {
  const c = v < 0 ? 0 : v > 255 ? 255 : v
  return c.toString(16).padStart(2, '0')
}

/**
 * Blend two palette hexes. `shade` only moves toward ink or cream; this is how
 * the art layer shifts a colour toward another palette entry (grass -> ochre).
 */
export function mixHex(a: string, b: string, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return (
    '#' +
    hex2(Math.round(chan(a, 0) + (chan(b, 0) - chan(a, 0)) * k)) +
    hex2(Math.round(chan(a, 1) + (chan(b, 1) - chan(a, 1)) * k)) +
    hex2(Math.round(chan(a, 2) + (chan(b, 2) - chan(a, 2)) * k))
  )
}

/** The 6 fps sub-clock from DESIGN section 5, frozen when motion is reduced. */
export function beatOf(frame: number): number {
  return prefersReducedMotion() ? 0 : Math.floor(frame / 10)
}

/* ------------------------------------------------------------------ *
 * Season colouring
 * ------------------------------------------------------------------ */

interface GroundPalette {
  base: string
  blade: string
  fleck: string
  /** Cream frost laid on the top edge of every tile. Winter only. */
  dust: string | null
}

const SEASON_GROUND: Record<Season, GroundPalette> = {
  spring: {
    base: mixHex(PAL.grass, PAL.grassLit, 0.22),
    blade: PAL.grassLit,
    fleck: PAL.leaf,
    dust: null,
  },
  summer: {
    base: shade(PAL.grass, -0.1),
    blade: mixHex(PAL.grassLit, PAL.lantern, 0.16),
    fleck: PAL.leaf,
    dust: null,
  },
  fall: {
    base: mixHex(PAL.grass, PAL.lantern, 0.28),
    blade: mixHex(PAL.grassLit, PAL.lantern, 0.45),
    fleck: mixHex(PAL.leaf, PAL.bark, 0.45),
    dust: null,
  },
  winter: {
    base: mixHex(shade(PAL.grass, 0.06), PAL.cream, 0.28),
    blade: mixHex(PAL.grassLit, PAL.cream, 0.4),
    fleck: mixHex(PAL.leaf, PAL.sky, 0.35),
    dust: PAL.cream,
  },
}

const STONE = mixHex(PAL.dusk, PAL.cream, 0.3)
const STONE_DARK = mixHex(PAL.dusk, PAL.ink, 0.25)
const METAL = mixHex(PAL.dusk, PAL.cream, 0.45)
const METAL_DARK = mixHex(PAL.dusk, PAL.ink, 0.35)
const PATH_BASE = mixHex(PAL.soil, PAL.cream, 0.3)
const PATH_DARK = mixHex(PAL.soil, PAL.ink, 0.18)
const PATH_LIT = mixHex(PAL.soil, PAL.cream, 0.5)

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

export function drawGround(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  sx: number,
  sy: number,
  season: Season,
  frame: number,
): void {
  const g = SEASON_GROUND[season]
  const v = tile.variant

  switch (tile.ground) {
    case 'grass':
      grassBed(ctx, sx, sy, v, g)
      break
    case 'weeds':
      grassBed(ctx, sx, sy, v, g)
      weedTangle(ctx, sx, sy, v, g)
      break
    case 'rock':
      grassBed(ctx, sx, sy, v, g)
      rockMass(ctx, sx, sy, v, g.base, season === 'winter')
      break
    case 'log':
      grassBed(ctx, sx, sy, v, g)
      logPile(ctx, sx, sy, v, g.base, season === 'winter')
      break
    case 'soil':
      tilledSoil(ctx, sx, sy, v, tile.watered)
      break
    case 'path':
      packedPath(ctx, sx, sy, v)
      break
    case 'water':
      pond(ctx, sx, sy, v, season, frame)
      return // water keeps its own cold edge; no frost crust on open water
  }

  if (g.dust !== null) frostTop(ctx, sx, sy, v, g.dust)
}

function grassBed(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  g: GroundPalette,
): void {
  rect(ctx, sx, sy, TILE, TILE, g.base)

  // Two soft patches keep large lawns from reading as flat colour. Drawn as
  // tapered rows, because a rectangle of a second green reads as a rectangle.
  const patch = mixHex(g.base, PAL.leaf, 0.2)
  for (let i = 0; i < 2; i++) {
    const pw = 5 + Math.floor(artNoise(v, 90 + i) * 5)
    const x = sx + Math.floor(artNoise(v, 100 + i) * (TILE - pw - 1))
    const y = sy + 1 + Math.floor(artNoise(v, 105 + i) * (TILE - 5))
    hline(ctx, x + 1, y, pw - 2, patch)
    hline(ctx, x, y + 1, pw, patch)
    hline(ctx, x + 2, y + 2, pw - 3, patch)
  }

  // Shadow flecks under the blades.
  for (let i = 0; i < 4; i++) {
    const x = sx + Math.floor(artNoise(v, 20 + i) * 15)
    const y = sy + Math.floor(artNoise(v, 30 + i) * 15)
    px(ctx, x, y, g.fleck)
    if (artNoise(v, 40 + i) > 0.62) px(ctx, x + 1, y, g.fleck)
  }

  // Blades, lit from the upper left.
  const blades = 5 + Math.floor(artNoise(v, 3) * 4)
  for (let i = 0; i < blades; i++) {
    const x = sx + Math.floor(artNoise(v, 50 + i) * 15)
    const y = sy + 1 + Math.floor(artNoise(v, 65 + i) * 13)
    px(ctx, x, y, g.blade)
    px(ctx, x, y + 1, g.blade)
    if (artNoise(v, 80 + i) > 0.55) px(ctx, x + 1, y + 1, g.blade)
  }
}

function frostTop(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  dust: string,
): void {
  const pale = withAlpha(dust, 0.6)
  const paler = withAlpha(dust, 0.3)
  for (let x = 0; x < TILE; x++) {
    const n = artNoise(v, 300 + x)
    if (n > 0.55) px(ctx, sx + x, sy, n > 0.8 ? pale : paler)
    if (artNoise(v, 330 + x) > 0.84) px(ctx, sx + x, sy + 1, paler)
  }
  for (let i = 0; i < 3; i++) {
    const x = sx + Math.floor(artNoise(v, 360 + i) * 15)
    const y = sy + 3 + Math.floor(artNoise(v, 370 + i) * 11)
    px(ctx, x, y, paler)
  }
}

function weedTangle(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  g: GroundPalette,
): void {
  const tip = mixHex(PAL.leaf, PAL.grassLit, 0.45)
  const strands = 7 + Math.floor(artNoise(v, 401) * 3)
  for (let i = 0; i < strands; i++) {
    const x = sx + 1 + Math.floor(artNoise(v, 410 + i) * 13)
    const y = sy + 3 + Math.floor(artNoise(v, 430 + i) * 10)
    const lean = artNoise(v, 450 + i) > 0.5 ? 1 : -1
    const len = 3 + Math.floor(artNoise(v, 470 + i) * 3)
    for (let k = 0; k < len; k++) {
      const bx = x + (k > 1 ? lean : 0)
      const by = y - k
      if (by < sy || by > sy + TILE - 1 || bx < sx || bx > sx + TILE - 1) continue
      px(ctx, bx, by, k === len - 1 ? tip : PAL.leaf)
    }
  }
  // A couple of seed heads so the tangle has a silhouette.
  for (let i = 0; i < 2; i++) {
    const x = sx + 2 + Math.floor(artNoise(v, 490 + i) * 11)
    const y = sy + 2 + Math.floor(artNoise(v, 495 + i) * 5)
    px(ctx, x, y, g.blade)
    px(ctx, x + 1, y, PAL.leaf)
  }
}

function rockMass(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  bg: string,
  snowy: boolean,
): void {
  const widths = [5, 9, 11, 12, 12, 10, 7]
  const bulge = (v & 1) === 1 ? 1 : 0
  const drift = ((v >> 1) & 1) === 1 ? -1 : 0
  const top = sy + 5
  const cx = sx + 8 + drift

  // Ink silhouette first, then the body one pixel inside it.
  for (let r = 0; r < widths.length; r++) {
    const w = widths[r] + (r > 1 && r < 5 ? bulge : 0)
    const x = cx - (w >> 1)
    hline(ctx, x - 1, top + r, w + 2, PAL.ink)
  }
  hline(ctx, cx - 2, top - 1, 5 + bulge, PAL.ink)

  for (let r = 0; r < widths.length; r++) {
    const w = widths[r] + (r > 1 && r < 5 ? bulge : 0)
    const x = cx - (w >> 1)
    hline(ctx, x, top + r, w, STONE)
    // Lower right falls away from the light.
    px(ctx, x + w - 1, top + r, STONE_DARK)
    if (r > 3) hline(ctx, x + w - 3, top + r, 3, STONE_DARK)
  }

  // Upper-left highlight and one crack.
  const lit = mixHex(STONE, PAL.cream, 0.6)
  px(ctx, cx - 2, top, lit)
  px(ctx, cx - 1, top, lit)
  px(ctx, cx - 3, top + 1, lit)
  px(ctx, cx - 4, top + 2, lit)
  px(ctx, cx + 1, top + 2, STONE_DARK)
  px(ctx, cx + 1, top + 3, STONE_DARK)
  px(ctx, cx + 2, top + 4, STONE_DARK)

  if (snowy) {
    px(ctx, cx - 1, top, PAL.cream)
    px(ctx, cx, top, PAL.cream)
    px(ctx, cx - 3, top + 1, PAL.cream)
    px(ctx, cx + 2, top + 1, PAL.cream)
  }

  // Contact shadow, and clip the corners back to the ground colour.
  hline(ctx, cx - 3, top + widths.length, 7, withAlpha(PAL.ink, 0.28))
  px(ctx, cx - 2, top - 1, bg)
  px(ctx, cx + 2 + bulge, top - 1, bg)
}

function logPile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  bg: string,
  snowy: boolean,
): void {
  const bx = sx + 1
  const by = sy + 7
  const bw = 14
  const bh = 7
  const lit = mixHex(PAL.bark, PAL.cream, 0.24)
  const dark = mixHex(PAL.bark, PAL.ink, 0.35)

  hline(ctx, bx, by - 1, bw, PAL.ink)
  hline(ctx, bx, by + bh, bw, PAL.ink)
  vline(ctx, bx - 1, by, bh, PAL.ink)
  vline(ctx, bx + bw, by, bh, PAL.ink)
  rect(ctx, bx, by, bw, bh, PAL.bark)

  // Round the four corners back to the ground behind.
  px(ctx, bx - 1, by, bg)
  px(ctx, bx - 1, by + bh - 1, bg)
  px(ctx, bx + bw, by, bg)
  px(ctx, bx + bw, by + bh - 1, bg)
  px(ctx, bx, by - 1, bg)
  px(ctx, bx + bw - 1, by - 1, bg)

  hline(ctx, bx + 1, by, bw - 2, lit)
  hline(ctx, bx, by + bh - 1, bw, dark)

  // Bark lines.
  const j = (v & 3) - 1
  hline(ctx, bx + 4, by + 2, 7, dark)
  hline(ctx, bx + 6 + j, by + 4, 6, dark)
  px(ctx, bx + 12, by + 3, dark)

  // Cut end with rings, on the left where the light lands.
  rect(ctx, bx, by + 1, 3, bh - 2, mixHex(PAL.bark, PAL.cream, 0.14))
  vline(ctx, bx + 1, by + 2, 3, mixHex(PAL.bark, PAL.ink, 0.2))
  px(ctx, bx + 1, by + 3, mixHex(PAL.bark, PAL.cream, 0.35))
  px(ctx, bx, by + 1, PAL.ink)
  px(ctx, bx, by + bh - 2, PAL.ink)

  if (snowy) {
    hline(ctx, bx + 2, by - 1, bw - 4, PAL.cream)
    px(ctx, bx + 1, by, withAlpha(PAL.cream, 0.7))
    px(ctx, bx + bw - 2, by, withAlpha(PAL.cream, 0.7))
  }
}

function tilledSoil(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  watered: boolean,
): void {
  const base = watered ? PAL.soilWet : PAL.soil
  rect(ctx, sx, sy, TILE, TILE, base)

  // Broken clods, so the bed is not a flat rectangle.
  const clod = mixHex(base, PAL.ink, 0.16)
  const clodLit = mixHex(base, PAL.cream, watered ? 0.1 : 0.14)
  for (let i = 0; i < 5; i++) {
    const x = sx + Math.floor(artNoise(v, 510 + i) * 14)
    const y = sy + Math.floor(artNoise(v, 525 + i) * 15)
    px(ctx, x, y, clod)
    px(ctx, x + 1, y, clod)
    px(ctx, x, y - 1 < sy ? y + 1 : y - 1, clodLit)
  }

  const furrow = watered ? mixHex(PAL.soilWet, PAL.ink, 0.4) : PAL.bark
  const lip = mixHex(base, PAL.cream, watered ? 0.12 : 0.18)
  for (let f = 0; f < 4; f++) {
    const y = sy + 2 + f * 4
    const gap = 2 + Math.floor(artNoise(v, 540 + f) * 11)
    hline(ctx, sx, y, gap, furrow)
    hline(ctx, sx + gap + 1, y, TILE - gap - 1, furrow)
    if (y - 1 >= sy) {
      hline(ctx, sx, y - 1, gap, lip)
      hline(ctx, sx + gap + 1, y - 1, TILE - gap - 1, lip)
    }
  }

  if (watered) {
    const sheen = mixHex(PAL.soilWet, PAL.sky, 0.45)
    const sx1 = sx + 3 + Math.floor(artNoise(v, 560) * 8)
    const sy1 = sy + 4 + Math.floor(artNoise(v, 561) * 3)
    px(ctx, sx1, sy1, sheen)
    px(ctx, sx1 + 1, sy1, sheen)
    px(ctx, sx + 2 + Math.floor(artNoise(v, 562) * 10), sy + 11, sheen)
  }
}

function packedPath(ctx: CanvasRenderingContext2D, sx: number, sy: number, v: number): void {
  rect(ctx, sx, sy, TILE, TILE, PATH_BASE)

  for (let i = 0; i < 10; i++) {
    const x = sx + Math.floor(artNoise(v, 600 + i) * TILE)
    const y = sy + Math.floor(artNoise(v, 620 + i) * TILE)
    px(ctx, x, y, artNoise(v, 640 + i) > 0.5 ? PATH_DARK : PATH_LIT)
  }

  // Two trodden pebbles with a hard one-pixel shadow.
  for (let i = 0; i < 2; i++) {
    const x = sx + 2 + Math.floor(artNoise(v, 660 + i) * 11)
    const y = sy + 3 + Math.floor(artNoise(v, 665 + i) * 10)
    px(ctx, x, y, STONE)
    px(ctx, x + 1, y, STONE)
    px(ctx, x, y + 1, STONE_DARK)
    px(ctx, x + 1, y + 1, withAlpha(PAL.ink, 0.35))
  }

  // A faint wheel rut across the middle keeps paths reading as travelled.
  hline(ctx, sx, sy + 6 + (v & 1), 6, PATH_DARK)
  hline(ctx, sx + 8, sy + 6 + (v & 1), 8, PATH_DARK)
}

function pond(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
  season: Season,
  frame: number,
): void {
  const cold = season === 'winter'
  const base = cold ? mixHex(PAL.sky, PAL.cream, 0.22) : PAL.sky
  const deep = mixHex(base, PAL.dusk, 0.35)
  rect(ctx, sx, sy, TILE, TILE, base)

  // Depth mottling.
  for (let i = 0; i < 3; i++) {
    const w = 3 + Math.floor(artNoise(v, 700 + i) * 6)
    const x = sx + Math.floor(artNoise(v, 710 + i) * (TILE - w))
    const y = sy + 3 + Math.floor(artNoise(v, 720 + i) * 11)
    hline(ctx, x, y, w, mixHex(base, PAL.dusk, 0.16))
  }

  // The bank sits above the water, so its shadow lies along the top edge.
  hline(ctx, sx, sy, TILE, deep)
  hline(ctx, sx, sy + 1, TILE, mixHex(base, PAL.dusk, 0.18))

  const shine = mixHex(base, PAL.cream, 0.6)
  const beat = beatOf(frame)
  const off = (beat + (v & 7)) % 12
  const rows = [5, 10]
  for (let r = 0; r < rows.length; r++) {
    const y = sy + rows[r]
    const x = sx + ((off + r * 5 + (v % 5)) % 13)
    hline(ctx, x, y, 2, shine)
    px(ctx, x + 3, y + 1, withAlpha(shine, 0.5))
  }

  if (cold) {
    // Thin ice crust hugging the edges.
    hline(ctx, sx, sy + TILE - 1, TILE, withAlpha(PAL.cream, 0.45))
    px(ctx, sx, sy + 8, withAlpha(PAL.cream, 0.4))
    px(ctx, sx + TILE - 1, sy + 6, withAlpha(PAL.cream, 0.4))
  }
}

/* ------------------------------------------------------------------ *
 * Overlays: fertilizer and sprinkler
 * ------------------------------------------------------------------ */

export function drawTileOverlay(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  sx: number,
  sy: number,
  frame: number,
): void {
  if (tile.fertilized) fertilizerSpeckle(ctx, sx, sy, tile.variant)
  if (tile.sprinkler) sprinklerPost(ctx, sx, sy, frame)
}

function fertilizerSpeckle(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  v: number,
): void {
  const dark = mixHex(PAL.dusk, PAL.ink, 0.15)
  const mineral = mixHex(PAL.parchment, PAL.dusk, 0.35)
  for (let i = 0; i < 12; i++) {
    const x = sx + 1 + Math.floor(artNoise(v, 800 + i) * 14)
    const y = sy + 1 + Math.floor(artNoise(v, 830 + i) * 14)
    px(ctx, x, y, artNoise(v, 860 + i) > 0.72 ? mineral : dark)
    if (artNoise(v, 880 + i) > 0.8) px(ctx, x + 1, y, PAL.dusk)
  }
}

function sprinklerPost(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  frame: number,
): void {
  const cx = sx + 8
  const still = prefersReducedMotion()
  const beat = beatOf(frame)

  // Spray goes down first so the hardware reads on top of it.
  if (still || (beat & 1) === 0) {
    const jet = withAlpha(mixHex(PAL.sky, PAL.cream, 0.35), 0.9)
    const far = withAlpha(PAL.sky, 0.5)
    const reach = still ? 1 : 1 + (beat % 3)
    // Four arms off the head: west, east, north, and a fall of droplets south.
    for (let k = 0; k <= reach; k++) {
      const c = k === reach ? far : jet
      const drop = k >> 1
      px(ctx, cx - 5 - k, sy + 4 + drop, c)
      px(ctx, cx + 4 + k, sy + 4 + drop, c)
      if (k < 2) px(ctx, cx, sy + 1 - k, c)
    }
    px(ctx, cx - 5, sy + 10, far)
    px(ctx, cx + 5, sy + 11, far)
    px(ctx, cx - 4, sy + 13, jet)
    px(ctx, cx + 4, sy + 12, jet)
  }

  // Post.
  vline(ctx, cx, sy + 7, 7, METAL)
  vline(ctx, cx + 1, sy + 7, 7, METAL_DARK)
  vline(ctx, cx - 1, sy + 7, 7, PAL.ink)
  vline(ctx, cx + 2, sy + 7, 7, PAL.ink)

  // Foot plate.
  hline(ctx, cx - 3, sy + 13, 8, METAL_DARK)
  hline(ctx, cx - 3, sy + 14, 8, PAL.ink)
  px(ctx, cx - 3, sy + 13, METAL)

  // Head.
  hline(ctx, cx - 4, sy + 3, 9, PAL.ink)
  hline(ctx, cx - 4, sy + 4, 9, METAL)
  hline(ctx, cx - 4, sy + 5, 9, METAL_DARK)
  hline(ctx, cx - 4, sy + 6, 9, PAL.ink)
  px(ctx, cx - 5, sy + 4, PAL.ink)
  px(ctx, cx + 5, sy + 4, PAL.ink)
  px(ctx, cx - 3, sy + 4, mixHex(METAL, PAL.cream, 0.7))
  px(ctx, cx - 2, sy + 4, mixHex(METAL, PAL.cream, 0.35))
  px(ctx, cx, sy + 2, METAL)
  px(ctx, cx, sy + 1, PAL.ink)
}
