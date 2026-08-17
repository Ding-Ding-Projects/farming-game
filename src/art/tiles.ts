import type { Ground, Season, Tile } from '../game/types'
import { FARM_H, FARM_W, TILE } from '../game/constants'
import { PAL, ramp, shade, withAlpha } from '../engine/palette'
import type { Ramp } from '../engine/palette'
import { dither, ellipse, hline, px, rect, shadeRect, vline } from '../engine/pixel'

/* ------------------------------------------------------------------ *
 * Shared art helpers. Kept here because tiles.ts is the lowest art
 * module; every other art module imports `prefersReducedMotion` and
 * `beatOf` from here rather than duplicating them.
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

/** `artNoise` quantised to `0..n-1`. The workhorse of every scatter below. */
function noiseInt(seed: number, k: number, n: number): number {
  if (n <= 1) return 0
  return Math.floor(artNoise(seed, k) * n)
}

/** A pixel that refuses to leave its own tile, so nothing bleeds onto a neighbour. */
function pxIn(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x: number,
  y: number,
  color: string,
): void {
  if (x < sx || y < sy || x > sx + TILE - 1 || y > sy + TILE - 1) return
  px(ctx, x, y, color)
}

/* ------------------------------------------------------------------ *
 * Variants
 *
 * Every ground type has eight structural layouts per season. The layout
 * index and the texture seed both come from `tile.variant` (0..255), so a
 * tile looks the same on every frame of its life but no two neighbours
 * agree; the seasonal salt means the same plot re-dresses itself when the
 * calendar turns instead of merely re-tinting.
 * ------------------------------------------------------------------ */

const SEASON_SALT: Record<Season, number> = { spring: 11, summer: 46, fall: 85, winter: 152 }

function tileSeed(v: number, season: Season): number {
  return (v * 131 + SEASON_SALT[season] * 7919) | 0
}

function variantOf(v: number, season: Season): number {
  return (v + SEASON_SALT[season]) & 7
}

/* ------------------------------------------------------------------ *
 * Season colouring
 * ------------------------------------------------------------------ */

interface GroundPalette {
  /** The turf itself. */
  base: string
  /** Shaded patch — the hollows between clumps. */
  dark: string
  /** Sunlit patch, where the light pools. */
  litPatch: string
  /** Blade body. */
  blade: string
  /** Blade tip in the light. */
  bladeLit: string
  /** The specular catch on a very few tips. */
  bladeSpec: string
  /** Shadow at the foot of a clump. */
  fleck: string
  /** Seasonal scatter — petals, dry straw, fallen leaves. Null in winter. */
  litter: string | null
  litterAlt: string | null
  /** Cream frost laid on the top edge of every tile. Winter only. */
  dust: string | null
}

/**
 * Turf bases. The tonal patches are mixed *from the base* rather than from a
 * palette entry, which is what keeps them reading as light and shade on one
 * material instead of as blobs of a second colour dropped on the lawn.
 */
const SPRING_TURF = mixHex(PAL.grass, PAL.grassLit, 0.3)
const SUMMER_TURF = shade(PAL.grass, -0.08)
const FALL_TURF = mixHex(PAL.grass, PAL.lantern, 0.4)
const WINTER_TURF = mixHex(shade(PAL.grass, 0.06), PAL.cream, 0.46)

const SEASON_GROUND: Record<Season, GroundPalette> = {
  // Fresh, wet, new growth: a yellow-green base with real green in the hollows.
  spring: {
    base: SPRING_TURF,
    dark: mixHex(SPRING_TURF, PAL.leaf, 0.34),
    litPatch: mixHex(SPRING_TURF, PAL.grassLit, 0.5),
    blade: PAL.grassLit,
    bladeLit: mixHex(PAL.grassLit, PAL.cream, 0.34),
    bladeSpec: mixHex(PAL.grassLit, PAL.cream, 0.7),
    fleck: PAL.leaf,
    litter: mixHex(PAL.cream, PAL.parchment, 0.35),
    litterAlt: PAL.lantern,
    dust: null,
  },
  // High summer: deeper, drier, sun-bleached crowns over dark shade.
  summer: {
    base: SUMMER_TURF,
    dark: mixHex(SUMMER_TURF, PAL.leaf, 0.42),
    litPatch: mixHex(SUMMER_TURF, PAL.lantern, 0.2),
    blade: mixHex(PAL.grassLit, PAL.lantern, 0.2),
    bladeLit: mixHex(PAL.grassLit, PAL.cream, 0.26),
    bladeSpec: mixHex(PAL.lantern, PAL.cream, 0.55),
    fleck: shade(PAL.leaf, -0.18),
    litter: mixHex(PAL.grassLit, PAL.lantern, 0.55),
    litterAlt: null,
    dust: null,
  },
  // Ochre: the green is still under there, but everything has turned.
  fall: {
    base: FALL_TURF,
    dark: mixHex(FALL_TURF, PAL.bark, 0.3),
    litPatch: mixHex(FALL_TURF, PAL.lantern, 0.34),
    blade: mixHex(PAL.grassLit, PAL.lantern, 0.52),
    bladeLit: mixHex(PAL.lantern, PAL.cream, 0.38),
    bladeSpec: mixHex(PAL.lantern, PAL.cream, 0.72),
    fleck: mixHex(PAL.leaf, PAL.bark, 0.5),
    litter: mixHex(PAL.lantern, PAL.berry, 0.38),
    litterAlt: mixHex(PAL.bark, PAL.lantern, 0.4),
    dust: null,
  },
  // Pale and frosted: the turf reads through a cream dusting, cold in the hollows.
  winter: {
    base: WINTER_TURF,
    dark: mixHex(WINTER_TURF, PAL.dusk, 0.22),
    litPatch: mixHex(WINTER_TURF, PAL.cream, 0.36),
    blade: mixHex(PAL.grassLit, PAL.cream, 0.48),
    bladeLit: mixHex(PAL.cream, PAL.sky, 0.12),
    bladeSpec: PAL.cream,
    fleck: mixHex(PAL.leaf, PAL.sky, 0.42),
    litter: null,
    litterAlt: null,
    dust: PAL.cream,
  },
}

const STONE = mixHex(PAL.dusk, PAL.cream, 0.3)
const STONE_DARK = mixHex(PAL.dusk, PAL.ink, 0.25)
const STONE_RAMP = ramp(STONE)
const BARK_RAMP = ramp(PAL.bark)
const METAL = mixHex(PAL.dusk, PAL.cream, 0.45)
const METAL_RAMP = ramp(METAL)
const PATH_BASE = mixHex(mixHex(PAL.soil, PAL.cream, 0.36), PAL.dusk, 0.1)
const PATH_RAMP = ramp(PATH_BASE)
const PATH_DARK = mixHex(PATH_BASE, PAL.ink, 0.22)
const PATH_LIT = mixHex(PATH_BASE, PAL.cream, 0.34)
const SOIL_RAMP = ramp(PAL.soil)
const SOIL_WET_RAMP = ramp(PAL.soilWet)
const CONTACT = withAlpha(PAL.ink, 0.26)

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

/**
 * One 32x32 ground tile, with no knowledge of its neighbours. Transitions
 * between two grounds are `drawGroundEdges`, which must run after this.
 */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  sx: number,
  sy: number,
  season: Season,
  frame: number,
): void {
  const g = SEASON_GROUND[season]
  const seed = tileSeed(tile.variant, season)
  const vi = variantOf(tile.variant, season)

  switch (tile.ground) {
    case 'grass':
      grassBed(ctx, sx, sy, seed, g, season)
      break
    case 'weeds':
      grassBed(ctx, sx, sy, seed, g, season)
      weedTangle(ctx, sx, sy, seed, vi, season)
      break
    case 'rock':
      grassBed(ctx, sx, sy, seed, g, season)
      rockMass(ctx, sx, sy, seed, vi, season === 'winter')
      break
    case 'log':
      grassBed(ctx, sx, sy, seed, g, season)
      logPile(ctx, sx, sy, seed, vi, season === 'winter')
      break
    case 'soil':
      tilledSoil(ctx, sx, sy, seed, vi, tile.watered)
      break
    case 'path':
      packedPath(ctx, sx, sy, seed, vi)
      break
    case 'water':
      pond(ctx, sx, sy, seed, vi, season, frame)
      return // open water carries its own cold crust; no frost dusting on it
  }

  if (g.dust !== null) frostTop(ctx, sx, sy, seed, g.dust)
}

/* ----------------------------------------------------------------- turf */

/**
 * A patch of turf with a real texture: two broad tonal blooms so a lawn is
 * never flat colour, clumps of individual blades lit from the upper left,
 * shadow at the foot of every clump, and the season's scatter on top.
 */
function grassBed(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  g: GroundPalette,
  season: Season,
): void {
  rect(ctx, sx, sy, TILE, TILE, g.base)

  // Broad tonal blooms: a halved outer wash, a small core, then a ragged
  // fringe. A single flat ellipse reads as a blob; three steps read as ground.
  tonalBloom(ctx, sx, sy, seed, 0, g.base, g.dark)
  tonalBloom(ctx, sx, sy, seed, 1, g.base, g.litPatch)

  // Fine speckle over the whole tile, both ways off the base, so no square
  // inch of a lawn is flat colour.
  for (let i = 0; i < 8; i++) {
    const x = sx + noiseInt(seed, 6 + i, TILE - 1)
    const y = sy + noiseInt(seed, 26 + i, TILE - 1)
    px(ctx, x, y, (i & 1) === 0 ? g.litPatch : g.dark)
    if (artNoise(seed, 46 + i) > 0.6) px(ctx, x + 1, y, (i & 1) === 0 ? g.litPatch : g.dark)
  }

  // Shadow flecks — the gaps between crowns.
  for (let i = 0; i < 6; i++) {
    const x = sx + 1 + noiseInt(seed, 20 + i, TILE - 3)
    const y = sy + 2 + noiseInt(seed, 34 + i, TILE - 4)
    px(ctx, x, y, g.fleck)
    if (artNoise(seed, 48 + i) > 0.55) px(ctx, x + 1, y + 1, g.fleck)
  }

  // Clumps of blades. Winter turf is beaten down, so it grows fewer and shorter.
  const clumps = season === 'winter' ? 4 : 6
  const short = season === 'winter' ? 1 : 0
  for (let c = 0; c < clumps; c++) {
    const bx = sx + 3 + noiseInt(seed, 60 + c, TILE - 7)
    const by = sy + 7 + noiseInt(seed, 74 + c, TILE - 10)
    px(ctx, bx, by + 1, g.fleck)
    const n = 2 + noiseInt(seed, 88 + c, 2)
    for (let b = 0; b < n; b++) {
      const lean = ((b + c) & 1) === 0 ? 1 : -1
      const h = 4 + noiseInt(seed, 100 + c * 3 + b, 4) - short
      blade(ctx, sx, sy, bx + b * 2 - 1, by, h, lean, g, artNoise(seed, 140 + c * 3 + b) > 0.78)
    }
  }

  seasonScatter(ctx, sx, sy, seed, g, season)
}

/**
 * A patch of light or shade on the turf, drawn as six stacked runs rather than
 * as an ellipse: fewer fills, and a hand-cut outline reads as ground where a
 * true ellipse reads as an ellipse.
 */
function tonalBloom(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  k: number,
  base: string,
  color: string,
): void {
  const w = 13 + noiseInt(seed, 10 + k, 5)
  const x = sx + noiseInt(seed, 14 + k, TILE - w)
  const y = sy + noiseInt(seed, 16 + k, TILE - 7)
  const lean = artNoise(seed, 12 + k) > 0.5 ? 1 : -1
  const wash = mixHex(base, color, 0.45)
  hline(ctx, x + 4, y, w - 8, wash)
  hline(ctx, x + 2, y + 1, w - 4, wash)
  hline(ctx, x, y + 2, w, wash)
  hline(ctx, x, y + 3, w, wash)
  hline(ctx, x + 1, y + 4, w - 2, wash)
  hline(ctx, x + 3, y + 5, w - 6, wash)
  hline(ctx, x + 2 + lean, y + 2, w - 6, color)
  hline(ctx, x + 1 + lean, y + 3, w - 4, color)
  hline(ctx, x + 3 + lean, y + 4, w - 8, color)
  // Break the rim so the patch has no edge to see.
  pxIn(ctx, sx, sy, x + 3, y + 1, base)
  pxIn(ctx, sx, sy, x + w - 3, y + 3, base)
  pxIn(ctx, sx, sy, x + 2, y + 5, wash)
}

/**
 * One blade: a straight lower stem, a bend of two pixels at the tip, and the
 * light on the last pixel. Drawn as a run plus two pixels rather than pixel by
 * pixel — a screen of turf is two hundred tiles of these.
 */
function blade(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x: number,
  y: number,
  h: number,
  lean: number,
  g: GroundPalette,
  glint: boolean,
): void {
  const stem = h - 2 < 1 ? 1 : h - 2
  const top = y - stem + 1
  if (x >= sx && x <= sx + TILE - 1) {
    const clipped = top < sy ? sy : top
    vline(ctx, x, clipped, y - clipped + 1, g.blade)
  }
  pxIn(ctx, sx, sy, x + lean, top - 1, g.blade)
  pxIn(ctx, sx, sy, x + lean * 2, top - 2, glint ? g.bladeSpec : g.bladeLit)
}

function seasonScatter(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  g: GroundPalette,
  season: Season,
): void {
  const lit = g.litter
  if (lit === null) return
  const alt = g.litterAlt ?? lit
  const n = season === 'fall' ? 6 : 4
  for (let i = 0; i < n; i++) {
    const x = sx + 2 + noiseInt(seed, 200 + i, TILE - 6)
    const y = sy + 3 + noiseInt(seed, 214 + i, TILE - 7)
    if (season === 'spring') {
      // Five-petal head with a lantern eye.
      px(ctx, x, y, lit)
      px(ctx, x + 1, y - 1, lit)
      px(ctx, x + 2, y, lit)
      px(ctx, x + 1, y + 1, lit)
      px(ctx, x + 1, y, alt)
    } else if (season === 'fall') {
      // A curled leaf: lit along its upper left, dark where it lifts off the turf.
      hline(ctx, x, y, 3, lit)
      px(ctx, x + 3, y + 1, lit)
      px(ctx, x, y + 1, alt)
      px(ctx, x + 1, y + 1, withAlpha(PAL.ink, 0.25))
    } else {
      hline(ctx, x, y, 2 + (i & 1), lit)
      px(ctx, x, y + 1, withAlpha(PAL.ink, 0.2))
    }
  }
}

/**
 * Winter's cream dusting: snow banked along the top edge of the tile, where
 * the step up to the row behind catches it, plus drifts lying further in.
 *
 * The top run is deliberately **broken**. A solid cream line on the first row
 * of every tile is the single worst thing this whole file could do — two
 * hundred of them turn the farm into scan lines. Snow lies where it lies.
 */
function frostTop(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  dust: string,
): void {
  const solid = withAlpha(dust, 0.88)
  const soft = withAlpha(dust, 0.55)
  const faint = withAlpha(dust, 0.3)
  const cool = mixHex(dust, PAL.sky, 0.3)

  // Banked on the top edge, but sparsely: roughly a third of the run, so a
  // field of tiles never resolves into a dashed line.
  for (let s = 0; s < 8; s++) {
    const n = artNoise(seed, 300 + s)
    if (n < 0.58) continue
    const w = 2 + noiseInt(seed, 312 + s, 3)
    const x = sx + s * 4 + noiseInt(seed, 324 + s, 2)
    hline(ctx, x, sy, w, solid)
    if (n > 0.78) hline(ctx, x + 1, sy + 1, w - 1, soft)
  }

  // Patches lying on the ground: a lit crown, a body, and a cool underside, so
  // each one has volume and the field reads as snow rather than as spilt paint.
  for (let i = 0; i < 3; i++) {
    const w = 6 + noiseInt(seed, 336 + i, 7)
    const x = sx + noiseInt(seed, 340 + i, TILE - w)
    const y = sy + 5 + noiseInt(seed, 344 + i, TILE - 9)
    hline(ctx, x, y, w, solid)
    hline(ctx, x + 1, y - 1, w - 3, solid)
    hline(ctx, x + 2, y - 2, w - 6, soft)
    hline(ctx, x + 1, y + 1, w - 2, cool)
    px(ctx, x + 2, y - 1, dust)
  }

  for (let i = 0; i < 6; i++) {
    const x = sx + noiseInt(seed, 352 + i, TILE)
    const y = sy + 3 + noiseInt(seed, 364 + i, TILE - 4)
    px(ctx, x, y, faint)
    if (artNoise(seed, 376 + i) > 0.6) px(ctx, x + 1, y, faint)
  }
}

/* ---------------------------------------------------------------- weeds */

/**
 * The tangle that says "clear me": a low rosette of broad ground leaves with
 * ink beneath them, three tall stalks with paired leaves, and seed heads.
 * Five tones throughout, light from the upper left.
 */
function weedTangle(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
  season: Season,
): void {
  const r = ramp(PAL.leaf)
  const head =
    season === 'fall'
      ? mixHex(PAL.lantern, PAL.bark, 0.35)
      : season === 'winter'
        ? mixHex(PAL.parchment, PAL.dusk, 0.35)
        : mixHex(PAL.grassLit, PAL.cream, 0.3)

  const cx = sx + 13 + (vi & 3)
  const cy = sy + 25 - ((vi >> 2) & 1) * 2

  // Ground rosette: four flattened leaves radiating, each with a shadow under it.
  const spread = [-9, -4, 3, 8]
  for (let i = 0; i < spread.length; i++) {
    const lx = cx + spread[i]
    const ly = cy - noiseInt(seed, 420 + i, 3)
    const w = 3 + noiseInt(seed, 430 + i, 2)
    ellipse(ctx, lx, ly, w, 1, r.mid)
    hline(ctx, lx - w, ly + 2, w * 2 + 1, withAlpha(PAL.ink, 0.22))
    hline(ctx, lx - w + 1, ly - 1, w, r.lit)
    px(ctx, lx + w, ly, r.dark)
  }

  // Stalks, each drawn as three straight runs that step sideways as they climb
  // — the bend without the cost of walking it a pixel at a time. The lean
  // pattern is part of the variant, so a field of weeds does not repeat.
  const stalks = 3 + ((vi >> 1) & 1)
  for (let s = 0; s < stalks; s++) {
    const bx = cx - 8 + s * 6 + noiseInt(seed, 440 + s, 3)
    const h = 10 + noiseInt(seed, 452 + s, 6)
    const lean = ((vi + s) & 1) === 0 ? 1 : -1
    const top = cy - h

    stalkRun(ctx, sx, sy, bx, cy - 5, 6, r.mid, r.dark)
    stalkRun(ctx, sx, sy, bx + lean, cy - 10, 5, r.mid, r.dark)
    if (h > 10) stalkRun(ctx, sx, sy, bx + lean * 2, top, h - 10, r.lit, r.mid)

    // Paired leaves, twice up the stalk: a run out to the left into the light,
    // a shorter darker one falling away to the right.
    for (let p = 0; p < 2; p++) {
      const ly = cy - (p === 0 ? 4 : 8)
      const lx = bx + (p === 0 ? 0 : lean)
      const arm = 3 + noiseInt(seed, 464 + s * 2 + p, 3)
      const x0 = lx - arm < sx ? sx : lx - arm
      hline(ctx, x0, ly, lx - x0, r.mid)
      pxIn(ctx, sx, sy, lx - arm, ly - 1, r.lit)
      const x1 = lx + 2 + arm > sx + TILE ? sx + TILE - lx - 2 : arm
      hline(ctx, lx + 2, ly + 1, x1, r.dark)
    }

    // Seed head.
    pxIn(ctx, sx, sy, bx + lean * 2, top - 1, head)
    pxIn(ctx, sx, sy, bx + lean * 2 + 1, top - 1, r.ink)
    pxIn(ctx, sx, sy, bx + lean * 2, top - 2, head)
  }
}

/** One straight section of stalk: lit body on the left, shade on the right. */
function stalkRun(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x: number,
  y: number,
  h: number,
  body: string,
  shade_: string,
): void {
  const y0 = y < sy ? sy : y
  const hh = y + h - y0
  if (hh <= 0 || x < sx || x > sx + TILE - 1) return
  vline(ctx, x, y0, hh, body)
  if (x + 1 <= sx + TILE - 1) vline(ctx, x + 1, y0, hh, shade_)
}

/* ----------------------------------------------------------------- rock */

/** Silhouettes as `[inset from the left, width]` per row. Two shapes, mirrored and drifted. */
const ROCK_A: ReadonlyArray<readonly [number, number]> = [
  [9, 7],
  [7, 11],
  [5, 15],
  [4, 17],
  [3, 19],
  [2, 20],
  [1, 21],
  [1, 22],
  [0, 23],
  [0, 23],
  [0, 22],
  [1, 21],
  [2, 19],
  [3, 16],
  [5, 12],
]

/** A wedge, not a dome: high shoulder on the lit side, falling away to the right. */
const ROCK_B: ReadonlyArray<readonly [number, number]> = [
  [3, 6],
  [2, 9],
  [2, 11],
  [1, 13],
  [1, 15],
  [0, 16],
  [0, 18],
  [0, 19],
  [0, 20],
  [0, 21],
  [0, 22],
  [0, 22],
  [1, 21],
  [2, 19],
  [4, 15],
  [7, 10],
]

/**
 * A boulder in the full ramp: an ink silhouette dilated one pixel out of the
 * body, a mid mass, a lit upper-left facet with a cream catch at its corner,
 * a dark lower-right side, a crack, and a contact shadow on the turf.
 */
function rockMass(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
  snowy: boolean,
): void {
  const rows = (vi & 1) === 0 ? ROCK_A : ROCK_B
  const mirror = ((vi >> 1) & 1) === 1
  const drift = ((vi >> 2) & 1) === 1 ? 1 : -1
  const left = sx + 4 + drift
  const top = sy + TILE - 6 - rows.length
  const r = STONE_RAMP

  // A companion stone on half the variants, always on the side the boulder
  // leans away from, so the pair reads as one arrangement.
  if (((vi >> 2) & 1) === 1) {
    const bx = mirror ? sx + 2 : sx + 23
    const by = sy + TILE - 9
    ellipse(ctx, bx + 3, by + 3, 4, 1, CONTACT)
    hline(ctx, bx, by - 1, 6, r.ink)
    hline(ctx, bx - 1, by, 8, r.ink)
    hline(ctx, bx - 1, by + 1, 8, r.ink)
    hline(ctx, bx, by + 2, 6, r.ink)
    hline(ctx, bx, by, 6, r.mid)
    hline(ctx, bx, by + 1, 6, r.dark)
    hline(ctx, bx, by, 4, r.lit)
    px(ctx, bx + 1, by, r.spec)
  }

  const xOf = (i: number): number => {
    const row = rows[i]
    return mirror ? left + (24 - row[0] - row[1]) : left + row[0]
  }

  // Contact shadow first, so the mass sits on it.
  const lastW = rows[rows.length - 1][1]
  ellipse(ctx, xOf(rows.length - 1) + (lastW >> 1), top + rows.length, (lastW >> 1) + 1, 1, CONTACT)

  // Ink: the body dilated by one in all four directions.
  for (let i = 0; i < rows.length; i++) {
    const x = xOf(i)
    const w = rows[i][1]
    hline(ctx, x - 1, top + i, w + 2, r.ink)
    hline(ctx, x, top + i - 1, w, r.ink)
    hline(ctx, x, top + i + 1, w, r.ink)
  }

  // Mass.
  for (let i = 0; i < rows.length; i++) {
    hline(ctx, xOf(i), top + i, rows[i][1], r.mid)
  }

  // Lit facet, upper left; dark side, lower right. Both taper with the silhouette.
  for (let i = 0; i < rows.length; i++) {
    const x = xOf(i)
    const w = rows[i][1]
    if (i < 7) {
      const lw = 4 + i > w - 2 ? w - 2 : 4 + i
      if (lw > 0) hline(ctx, mirror ? x + w - lw : x, top + i, lw, r.lit)
    }
    if (i > 6) {
      const dw = i - 4 > w - 3 ? w - 3 : i - 4
      if (dw > 0) hline(ctx, mirror ? x : x + w - dw, top + i, dw, r.dark)
    }
  }

  // The catch of light on the shoulder, and a crack falling away from it.
  const shx = mirror ? xOf(1) + rows[1][1] - 4 : xOf(1) + 1
  hline(ctx, shx, top + 1, 3, r.spec)
  hline(ctx, shx + (mirror ? 1 : -1), top + 2, 2, r.spec)
  const crx = xOf(6) + (rows[6][1] >> 1)
  for (let k = 0; k < 5; k++) {
    px(ctx, crx + (k > 2 ? 1 : 0) + noiseInt(seed, 480 + k, 2), top + 5 + k, r.ink)
    px(ctx, crx + 1 + (k > 2 ? 1 : 0), top + 5 + k, r.lit)
  }

  if (snowy) {
    // Snow banks on the top of the mass, following its shoulder.
    for (let i = 0; i < 4; i++) {
      const x = xOf(i)
      const w = rows[i][1]
      hline(ctx, x + 1, top + i, w - 2 - i, withAlpha(PAL.cream, i === 0 ? 0.95 : 0.7 - i * 0.16))
    }
  }
}

/* ------------------------------------------------------------------ log */

/**
 * A felled trunk: cylinder ends drawn as ellipses so the form reads round,
 * rings on the cut face where the light lands, bark cracks along the barrel,
 * and — on half the variants — a second billet resting on top of it.
 */
function logPile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
  snowy: boolean,
): void {
  const flip = ((vi >> 2) & 1) === 1
  const by = sy + 20 - ((vi >> 1) & 1)
  billet(ctx, sx, sy, sx + 2, by, 28, 6, flip, seed, 0)
  if ((vi & 1) === 1) billet(ctx, sx, sy, sx + 7, by - 11, 17, 4, !flip, seed, 40)

  if (snowy) {
    const capY = (vi & 1) === 1 ? by - 11 - 5 : by - 7
    const capX = (vi & 1) === 1 ? sx + 9 : sx + 4
    const capW = (vi & 1) === 1 ? 13 : 24
    hline(ctx, capX, capY, capW, withAlpha(PAL.cream, 0.95))
    hline(ctx, capX + 2, capY + 1, capW - 4, withAlpha(PAL.cream, 0.6))
  }
}

/**
 * One length of timber lying east-west. `cy` is the axis, `ry` the half-height,
 * so the barrel spans `cy - ry .. cy + ry`.
 */
function billet(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x: number,
  cy: number,
  w: number,
  ry: number,
  flip: boolean,
  seed: number,
  salt: number,
): void {
  const r = BARK_RAMP
  const endX = flip ? x + w - 3 : x + 3

  // Ink shell: the barrel plus the two rounded caps.
  rect(ctx, x + 2, cy - ry - 1, w - 4, ry * 2 + 3, r.ink)
  ellipse(ctx, x + 3, cy, 4, ry + 1, r.ink)
  ellipse(ctx, x + w - 4, cy, 4, ry + 1, r.ink)

  // Barrel: dark underside, mid body, lit crown.
  rect(ctx, x + 2, cy - ry, w - 4, ry * 2 + 1, r.mid)
  hline(ctx, x + 2, cy + ry, w - 4, r.dark)
  hline(ctx, x + 3, cy + ry - 1, w - 6, mixHex(r.dark, r.mid, 0.5))
  hline(ctx, x + 3, cy - ry, w - 6, r.lit)
  hline(ctx, x + 5, cy - ry + 1, w - 12, mixHex(r.lit, r.mid, 0.45))

  // Bark cracks: short, broken, never a ruled line.
  for (let i = 0; i < 3; i++) {
    const cx0 = x + 6 + noiseInt(seed, salt + 500 + i, w - 14)
    const cw = 4 + noiseInt(seed, salt + 510 + i, 5)
    const cyy = cy - ry + 2 + noiseInt(seed, salt + 520 + i, ry * 2 - 2)
    hline(ctx, cx0, cyy, cw, r.ink)
    hline(ctx, cx0 + 1, cyy + 1, cw - 2, mixHex(r.mid, r.lit, 0.5))
  }

  // Cut face: concentric rings, lit from the upper left, with a cream catch.
  ellipse(ctx, endX, cy, 3, ry, mixHex(PAL.bark, PAL.parchment, 0.42))
  ellipse(ctx, endX, cy, 2, ry - 2, mixHex(PAL.bark, PAL.parchment, 0.18))
  ellipse(ctx, endX, cy, 1, ry - 4 < 0 ? 0 : ry - 4, mixHex(PAL.bark, PAL.cream, 0.5))
  px(ctx, endX - 1, cy - ry + 1, mixHex(PAL.cream, PAL.parchment, 0.3))

  // Contact shadow.
  hline(ctx, x + 3, cy + ry + 2, w - 6, CONTACT)
  pxIn(ctx, sx, sy, x + 2, cy + ry + 2, withAlpha(PAL.ink, 0.14))
  pxIn(ctx, sx, sy, x + w - 3, cy + ry + 2, withAlpha(PAL.ink, 0.14))
}

/* ----------------------------------------------------------------- soil */

/**
 * Tilled earth: four furrows on an eight-pixel pitch — a lit crest, two rows of
 * open bed, then the shadowed trough the seed sits in. The pitch is anchored to
 * the tile rather than to the variant, so a ploughed field runs unbroken across
 * every tile of it instead of stepping at each seam; the variation is in the
 * wobble of each line and in the clods, which is where a real field varies.
 *
 * Watered soil swaps to `soilWet` — much darker at a glance — and catches a
 * cold sheen where the water stands in the troughs.
 */
function tilledSoil(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
  watered: boolean,
): void {
  const r = watered ? SOIL_WET_RAMP : SOIL_RAMP
  rect(ctx, sx, sy, TILE, TILE, r.mid)

  const crest = mixHex(r.mid, r.lit, watered ? 0.38 : 0.48)
  const shoulder = mixHex(r.mid, r.lit, 0.18)
  const slope = mixHex(r.mid, r.dark, 0.45)
  const trough = mixHex(r.mid, r.dark, 0.85)
  const glint = mixHex(r.lit, PAL.cream, 0.3)

  // Earth grain, under everything: the fine tone break that stops a big brown
  // rectangle looking like a big brown rectangle.
  for (let i = 0; i < 14; i++) {
    const x = sx + noiseInt(seed, 520 + i, TILE)
    const y = sy + noiseInt(seed, 536 + i, TILE)
    px(ctx, x, y, (i & 1) === 0 ? slope : shoulder)
  }

  // Four ridges on an eight-pixel pitch: a one-pixel lit crown, four rows of
  // open bed, then the shoulder and the trough the seed sits in. Each ridge is
  // walked in overlapping stretches that step a pixel up or down, so the row is
  // continuous — a gap between stretches would read as mortar, and a ruled line
  // all the way across the tile would read as a plank.
  for (let f = 0; f < 4; f++) {
    const y = sy + f * 8
    let x = sx - noiseInt(seed, 540 + f, 9)
    for (let s = 0; s < 5 && x < sx + TILE; s++) {
      const w = 9 + noiseInt(seed, 550 + f * 5 + s, 7)
      const dy = artNoise(seed, 566 + f * 5 + s) > 0.55 ? 1 : 0
      const x0 = x < sx ? sx : x
      const x1 = x + w > sx + TILE ? sx + TILE : x + w
      const w0 = x1 - x0
      if (w0 > 0) {
        hline(ctx, x0, y + 1 + dy, w0, crest)
        hline(ctx, x0, y + 2 + dy, w0, shoulder)
        hline(ctx, x0, y + 5 + dy, w0, slope)
        hline(ctx, x0, y + 6 + dy, w0, trough)
        // The catch of light on the crown of the ridge.
        if (w0 > 5 && ((s + f) & 1) === 0) hline(ctx, x0 + 2, y + 1 + dy, 2, glint)
        // Standing water in the trough: a short sheen, not a painted band.
        if (watered && w0 > 6 && ((s + f) & 1) === 1) {
          hline(ctx, x0 + 2, y + 6 + dy, (w0 >> 1) + 1, mixHex(PAL.soilWet, PAL.sky, 0.34))
          px(ctx, x0 + 3, y + 5 + dy, mixHex(PAL.sky, PAL.cream, 0.5))
        }
      }
      x += w - 1
    }
  }

  // Clods turned up out of the rows. Which four of the eight candidate spots
  // are broken open is the variant.
  for (let i = 0; i < 8; i++) {
    if (((vi >> (i & 2)) & 1) === (i & 1)) continue
    const x = sx + 1 + noiseInt(seed, 590 + i, TILE - 5)
    const y = sy + 3 + noiseInt(seed, 606 + i, TILE - 5)
    const w = 2 + noiseInt(seed, 622 + i, 3)
    hline(ctx, x, y, w, mixHex(r.mid, r.dark, 0.75))
    hline(ctx, x, y - 1, w - 1, mixHex(r.mid, r.lit, 0.55))
    px(ctx, x + w, y + 1, withAlpha(PAL.ink, 0.24))
  }
}

/* ----------------------------------------------------------------- path */

/** Packed dirt: flatter and lighter than tilled soil, worn smooth, with trodden grit. */
function packedPath(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
): void {
  rect(ctx, sx, sy, TILE, TILE, PATH_BASE)

  // Worn hollows and a sunlit crown — very low contrast, because a path is
  // flat. Softened once at the rim so neither reads as a painted blob.
  const hollowX = sx + 8 + noiseInt(seed, 620, 8)
  const hollowY = sy + 10 + noiseInt(seed, 621, 8)
  ellipse(ctx, hollowX, hollowY, 7, 4, mixHex(PATH_BASE, PATH_DARK, 0.5))
  ellipse(ctx, hollowX + 1, hollowY + 1, 4, 2, PATH_DARK)
  const crownX = sx + 12 + noiseInt(seed, 622, 10)
  const crownY = sy + 20 + noiseInt(seed, 623, 8)
  ellipse(ctx, crownX, crownY, 6, 3, mixHex(PATH_BASE, PATH_LIT, 0.5))
  ellipse(ctx, crownX - 1, crownY - 1, 3, 1, PATH_LIT)

  // Grit, thick enough that the surface reads as packed dirt at a glance.
  for (let i = 0; i < 24; i++) {
    const x = sx + noiseInt(seed, 630 + i, TILE)
    const y = sy + noiseInt(seed, 656 + i, TILE)
    const n = artNoise(seed, 682 + i)
    px(ctx, x, y, n > 0.5 ? PATH_DARK : PATH_LIT)
    if (n > 0.86) px(ctx, x + 1, y, PATH_DARK)
  }

  // Three trodden pebbles, each with its own ramp and a hard one-pixel shadow.
  for (let i = 0; i < 3; i++) {
    const x = sx + 3 + noiseInt(seed, 710 + i, TILE - 9)
    const y = sy + 4 + noiseInt(seed, 720 + i, TILE - 10)
    const w = 2 + noiseInt(seed, 730 + i, 3)
    hline(ctx, x - 1, y + 1, w + 2, STONE_RAMP.ink)
    hline(ctx, x, y, w, STONE_RAMP.ink)
    hline(ctx, x, y + 1, w, STONE_RAMP.mid)
    hline(ctx, x, y, w - 1, STONE_RAMP.lit)
    px(ctx, x, y, STONE_RAMP.spec)
    hline(ctx, x + 1, y + 2, w, withAlpha(PAL.ink, 0.3))
  }

  // Wheel ruts, broken into the stretches where the ground took the weight.
  // Which pair, and how far they drift, is the variant.
  const ruts = [sy + 9 + (vi & 3), sy + 21 + ((vi >> 1) & 3)]
  for (let k = 0; k < 2; k++) {
    let x = sx - noiseInt(seed, 740 + k, 8)
    for (let s = 0; s < 3 && x < sx + TILE; s++) {
      const w = 9 + noiseInt(seed, 750 + k * 3 + s, 8)
      const dy = artNoise(seed, 760 + k * 3 + s) > 0.5 ? 1 : 0
      const x0 = x < sx ? sx : x
      const w0 = (x + w > sx + TILE ? sx + TILE : x + w) - x0
      if (w0 > 0) {
        hline(ctx, x0, ruts[k] + dy, w0, PATH_DARK)
        hline(ctx, x0 + 2, ruts[k] + dy - 1, (w0 >> 1) + 1, PATH_LIT)
      }
      x += w + 3
    }
  }
}

/* ---------------------------------------------------------------- water */

/** Four frames of glint offsets. Not a scroll — the light moves, it does not travel. */
const SHIMMER: ReadonlyArray<readonly [number, number, number]> = [
  [2, 14, 24],
  [7, 19, 3],
  [12, 5, 27],
  [18, 25, 9],
]
const SHIMMER_LEN: ReadonlyArray<readonly [number, number, number]> = [
  [4, 2, 3],
  [2, 4, 2],
  [3, 2, 4],
  [2, 3, 3],
]

/**
 * Open water: a depth gradient from the far bank, three glint rows on the
 * 6 fps sub-clock, and — in winter — an ice crust with cracks. The shoreline
 * and the reflection belong to `drawGroundEdges`, which knows the neighbours.
 */
function pond(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  seed: number,
  vi: number,
  season: Season,
  frame: number,
): void {
  const cold = season === 'winter'
  const base = cold ? mixHex(PAL.sky, PAL.cream, 0.24) : PAL.sky
  const r = ramp(base)
  rect(ctx, sx, sy, TILE, TILE, r.mid)

  // Depth mottling: broad, low contrast and fixed per tile, so a wide pond
  // reads as one body of water rather than as a grid of tiles. The bank's
  // shadow belongs to the shoreline, which is `drawGroundEdges`.
  for (let i = 0; i < 5; i++) {
    const w = 7 + noiseInt(seed, 730 + i, 12)
    const x = sx + noiseInt(seed, 740 + i, TILE - w)
    const y = sy + noiseInt(seed, 750 + i, TILE - 2)
    hline(ctx, x, y, w, mixHex(r.mid, PAL.dusk, 0.14))
    hline(ctx, x + 2, y + 1, w - 4, mixHex(r.mid, PAL.dusk, 0.08))
  }

  if (cold) {
    // Frozen over: a sheet of ice with a crack network walked across it, each
    // crack carrying a lit lip on its lower side. No shimmer — ice is still.
    rect(ctx, sx, sy, TILE, TILE, mixHex(r.mid, PAL.cream, 0.42))
    const crack = mixHex(r.mid, PAL.dusk, 0.4)
    const lip = withAlpha(PAL.cream, 0.85)
    for (let k = 0; k < 3; k++) {
      let x = sx + noiseInt(seed, 770 + k, TILE)
      let y = sy + noiseInt(seed, 776 + k, TILE - 2)
      let dirX = artNoise(seed, 782 + k) > 0.5 ? 1 : -1
      const steps = 11 + noiseInt(seed, 788 + k, 9)
      for (let s = 0; s < steps; s++) {
        px(ctx, x, y, crack)
        px(ctx, x, y + 1, lip)
        const n = artNoise(seed, 794 + k * 24 + s)
        x += dirX
        if (n > 0.68) y += 1
        else if (n < 0.2) y -= 1
        if (x < sx || x > sx + TILE - 1) {
          dirX = -dirX
          x += dirX * 2
        }
        if (y < sy) y = sy
        if (y > sy + TILE - 3) y = sy + TILE - 3
      }
    }
    // Two plates catching the light where they have tilted.
    for (let i = 0; i < 2; i++) {
      const px0 = sx + 3 + noiseInt(seed, 866 + i, TILE - 12)
      const py0 = sy + 4 + noiseInt(seed, 870 + i, TILE - 10)
      hline(ctx, px0, py0, 6 + noiseInt(seed, 874 + i, 4), withAlpha(PAL.cream, 0.5))
      hline(ctx, px0 + 1, py0 + 1, 4, withAlpha(PAL.cream, 0.28))
    }
    return
  }

  // Glints: a bright crest with a soft lens of light spreading under it, so
  // each one reads as the sun on a ripple and not as a dash of white.
  const f = beatOf(frame) & 3
  const cols = SHIMMER[f]
  const lens = SHIMMER_LEN[f]
  const rows = [6 + (vi & 3), 15 + ((vi >> 1) & 3), 24 - ((vi >> 2) & 1) * 2]
  for (let i = 0; i < 3; i++) {
    const y = sy + rows[i]
    const x = sx + ((cols[i] + vi * 3) % (TILE - 8))
    const len = lens[i]
    // The soft lens starts one pixel left of the crest, and the crest can sit on the
    // tile's first column. Ground is painted left to right in one pass, so a pixel at
    // `sx - 1` lands on a neighbour that is already finished and stays there. Clamped,
    // not shifted: every glint that was already inside the tile is unchanged.
    const lx = x - 1 < sx ? sx : x - 1
    hline(ctx, lx, y, len + 4 - (lx - (x - 1)), withAlpha(r.lit, 0.45))
    hline(ctx, x, y, len, withAlpha(r.spec, 0.85))
    hline(ctx, x + 1, y + 1, len + 1, withAlpha(r.lit, 0.3))
    px(ctx, x + len + 3, y - 1, withAlpha(r.lit, 0.35))
  }
}

/* ------------------------------------------------------------------ *
 * Edge transitions
 * ------------------------------------------------------------------ */

/** Two grounds only need a transition when they belong to different families. */
type EdgeFamily = 'turf' | 'soil' | 'path' | 'water'

function familyOf(ground: Ground): EdgeFamily {
  switch (ground) {
    case 'soil':
      return 'soil'
    case 'path':
      return 'path'
    case 'water':
      return 'water'
    default:
      // grass, weeds, rock and log all stand on the same turf bed.
      return 'turf'
  }
}

/** North, east, south, west — the order every edge routine below assumes. */
const DX = [0, 1, 0, -1] as const
const DY = [-1, 0, 1, 0] as const

/**
 * The transition between this tile and its four orthogonal neighbours.
 *
 * **Neighbour lookup.** `tiles` is the farm grid exactly as `GameState.tiles`
 * holds it: row-major, `FARM_W * FARM_H` entries, `index = y * FARM_W + x`.
 * `x, y` are this tile's grid coordinates and `sx, sy` the pixel of its
 * top-left corner. Neighbours are read at `(x, y-1)`, `(x+1, y)`, `(x, y+1)`
 * and `(x-1, y)`; one that falls outside the grid draws no transition, so the
 * world border never grows a shoreline against nothing.
 *
 * **Draw order.** Every pixel this function paints lands inside this tile's own
 * 32x32 box, so it is safe to call immediately after `drawGround` for the same
 * tile inside a single loop — a transition never reaches into the neighbour
 * that caused it, and can therefore never be overwritten by a later tile.
 *
 * `frame` is the 60 fps counter and drives the animated shoreline foam. It is
 * optional so a caller that only wants static transitions can omit it; pass it
 * to get the foam moving on the 6 fps sub-clock.
 */
export function drawGroundEdges(
  ctx: CanvasRenderingContext2D,
  tiles: readonly Tile[],
  x: number,
  y: number,
  sx: number,
  sy: number,
  season: Season,
  frame = 0,
): void {
  if (x < 0 || y < 0 || x >= FARM_W || y >= FARM_H) return
  const self = tiles[y * FARM_W + x]
  if (self === undefined) return

  const mine = familyOf(self.ground)
  const g = SEASON_GROUND[season]
  const seed = tileSeed(self.variant, season)
  let touchedTop = false

  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]
    const ny = y + DY[d]
    if (nx < 0 || ny < 0 || nx >= FARM_W || ny >= FARM_H) continue
    const other = tiles[ny * FARM_W + nx]
    if (other === undefined) continue
    const theirs = familyOf(other.ground)
    if (theirs === mine) continue

    const salt = 900 + d * 60
    if (mine === 'water') {
      shoreOnWater(ctx, sx, sy, d, other, g, season, seed, salt, frame)
    } else if (theirs === 'water') {
      shoreOnLand(ctx, sx, sy, d, mine, g, season, seed, salt)
    } else if (mine === 'turf' && theirs === 'path') {
      wornBand(ctx, sx, sy, d, g, seed, salt)
    } else if (theirs === 'turf') {
      // Turf is the tall thing, so it hangs over the dug ground rather than
      // the other way about. Drawn on this tile, never on the neighbour.
      grassFringe(ctx, sx, sy, d, mine === 'soil' ? 5 : 3, g, seed, salt)
    } else if (mine === 'soil' && theirs === 'path') {
      gritBand(ctx, sx, sy, d, seed, salt)
    } else if (mine === 'path' && theirs === 'soil') {
      crumbBand(ctx, sx, sy, d, other, seed, salt)
    }
    // Turf beside soil draws nothing *here* on purpose: that pair is handled
    // once, from the soil side, as the overhanging fringe above. Drawing it
    // from both sides would double the seam and thicken it to ten pixels.

    if (d === 0) touchedTop = true
  }

  // Snow banks up wherever the surface changes, and it lies on top of the
  // transition rather than under it.
  if (season === 'winter' && touchedTop) snowLip(ctx, sx, sy, seed)
}

/* --------------------------------------------------- edge-space helpers */

/**
 * Edge space: `i` runs along the shared edge, `j` runs into this tile from it.
 * Writing every transition in these two coordinates is what lets one routine
 * serve all four sides without four copies of the art.
 */
function edgePx(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  i: number,
  j: number,
  color: string,
): void {
  if (i < 0 || i > TILE - 1 || j < 0 || j > TILE - 1) return
  switch (d) {
    case 0:
      px(ctx, sx + i, sy + j, color)
      break
    case 1:
      px(ctx, sx + TILE - 1 - j, sy + i, color)
      break
    case 2:
      px(ctx, sx + i, sy + TILE - 1 - j, color)
      break
    default:
      px(ctx, sx + j, sy + i, color)
      break
  }
}

function edgeFill(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  i: number,
  len: number,
  j: number,
  depth: number,
  color: string,
): void {
  const i0 = i < 0 ? 0 : i
  const l = i0 + len > TILE ? TILE - i0 : len
  if (l <= 0 || depth <= 0) return
  switch (d) {
    case 0:
      rect(ctx, sx + i0, sy + j, l, depth, color)
      break
    case 1:
      rect(ctx, sx + TILE - j - depth, sy + i0, depth, l, color)
      break
    case 2:
      rect(ctx, sx + i0, sy + TILE - j - depth, l, depth, color)
      break
    default:
      rect(ctx, sx + j, sy + i0, depth, l, color)
      break
  }
}

function edgeDither(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  j: number,
  depth: number,
  color: string,
  cell: number,
): void {
  if (depth <= 0) return
  switch (d) {
    case 0:
      dither(ctx, sx, sy + j, TILE, depth, color, 0, cell)
      break
    case 1:
      dither(ctx, sx + TILE - j - depth, sy, depth, TILE, color, 0, cell)
      break
    case 2:
      dither(ctx, sx, sy + TILE - j - depth, TILE, depth, color, 0, cell)
      break
    default:
      dither(ctx, sx + j, sy, depth, TILE, color, 0, cell)
      break
  }
}

/**
 * A band of one material reaching into another by a ragged, per-segment depth.
 * This is the transition that makes two grounds interlock: a ruled band or a
 * regular checker along the seam reads as a border, and a border is exactly
 * the checkerboard the edges exist to destroy.
 */
function raggedBand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  seed: number,
  salt: number,
  maxDepth: number,
  color: string,
): void {
  for (let s = 0; s < 16; s++) {
    const depth = noiseInt(seed, salt + s, maxDepth + 2) - 1
    if (depth <= 0) continue
    edgeFill(ctx, sx, sy, d, s * 2, 2, 0, depth, color)
  }
}

/* ------------------------------------------------------- the transitions */

/**
 * Turf hanging over dug ground. A solid lip of turf on the shared edge, tufts
 * of blade reaching `depth` pixels in, and — on the two edges the light comes
 * from — the shadow the overhang casts into the tile.
 */
function grassFringe(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  depth: number,
  g: GroundPalette,
  seed: number,
  salt: number,
): void {
  edgeFill(ctx, sx, sy, d, 0, TILE, 0, 1, g.base)

  for (let s = 0; s < 10; s++) {
    const i = s * 3 + noiseInt(seed, salt + s, 3)
    const len = 1 + noiseInt(seed, salt + 20 + s, depth)
    for (let j = 1; j < len; j++) {
      edgePx(ctx, sx, sy, d, i, j, j === len - 1 ? g.blade : g.base)
    }
    if (artNoise(seed, salt + 40 + s) > 0.55) {
      edgePx(ctx, sx, sy, d, i + 1, 1, g.dark)
      edgePx(ctx, sx, sy, d, i - 1, len, g.bladeLit)
    }
    // Light falls from the upper left, so only the north and west overhangs
    // throw a shadow onto the ground below them.
    if (d === 0 || d === 3) edgePx(ctx, sx, sy, d, i, len, CONTACT)
  }
}

/** Turf worn thin where it meets a path: the path colour dithered into the grass. */
function wornBand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  g: GroundPalette,
  seed: number,
  salt: number,
): void {
  raggedBand(ctx, sx, sy, d, seed, salt, 4, mixHex(g.base, PATH_BASE, 0.75))
  raggedBand(ctx, sx, sy, d, seed, salt + 20, 2, PATH_BASE)
  edgeDither(ctx, sx, sy, d, 4, 3, withAlpha(PATH_BASE, 0.34), 2)
  for (let s = 0; s < 6; s++) {
    const i = noiseInt(seed, salt + 40 + s, TILE)
    edgePx(ctx, sx, sy, d, i, 1 + noiseInt(seed, salt + 48 + s, 5), PATH_LIT)
    edgePx(ctx, sx, sy, d, i + 1, 3 + noiseInt(seed, salt + 56 + s, 4), g.dark)
  }
}

/** Tilled soil giving way to a path: grit and stones scattered up the bank. */
function gritBand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  seed: number,
  salt: number,
): void {
  raggedBand(ctx, sx, sy, d, seed, salt, 5, mixHex(PATH_BASE, PAL.soil, 0.3))
  raggedBand(ctx, sx, sy, d, seed, salt + 20, 3, PATH_BASE)
  edgeDither(ctx, sx, sy, d, 5, 3, withAlpha(PATH_BASE, 0.35), 2)
  for (let s = 0; s < 6; s++) {
    const i = noiseInt(seed, salt + 40 + s, TILE)
    const j = 1 + noiseInt(seed, salt + 48 + s, 5)
    edgePx(ctx, sx, sy, d, i, j, PATH_RAMP.lit)
    edgePx(ctx, sx, sy, d, i, j + 1, PATH_RAMP.dark)
  }
}

/** A path giving way to tilled soil: dark crumbs kicked out onto the packed dirt. */
function crumbBand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  other: Tile,
  seed: number,
  salt: number,
): void {
  const soil = other.watered ? PAL.soilWet : PAL.soil
  raggedBand(ctx, sx, sy, d, seed, salt, 4, mixHex(PATH_BASE, soil, 0.7))
  raggedBand(ctx, sx, sy, d, seed, salt + 20, 2, soil)
  edgeDither(ctx, sx, sy, d, 4, 3, withAlpha(soil, 0.32), 2)
  for (let s = 0; s < 5; s++) {
    const i = noiseInt(seed, salt + 40 + s, TILE)
    const j = 1 + noiseInt(seed, salt + 48 + s, 5)
    edgePx(ctx, sx, sy, d, i, j, mixHex(soil, PAL.ink, 0.2))
    edgePx(ctx, sx, sy, d, i + 1, j, soil)
    edgePx(ctx, sx, sy, d, i, j - 1, mixHex(soil, PAL.cream, 0.25))
  }
}

/** The land side of a shore: a wet lip, damp earth, and stones the water uncovered. */
function shoreOnLand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  mine: EdgeFamily,
  g: GroundPalette,
  season: Season,
  seed: number,
  salt: number,
): void {
  // The shore is earth whatever stands behind it — water strips a bank back to
  // mud and sand, so the band is built from `soil`, not from the turf or the
  // path it interrupts. Only the outermost fringe carries the land's own colour.
  const own = mine === 'soil' ? PAL.soil : mine === 'path' ? PATH_BASE : g.base
  const damp = mixHex(PAL.soil, PAL.soilWet, 0.4)
  const wet = mixHex(damp, PAL.ink, 0.3)
  const sand = mixHex(PAL.soil, PAL.parchment, 0.55)
  const blend = mixHex(own, sand, 0.5)

  edgeFill(ctx, sx, sy, d, 0, TILE, 0, 1, wet)
  edgeFill(ctx, sx, sy, d, 0, TILE, 1, 1, damp)
  // A ragged tideline: damp mud, dry sand above it, then a broken fringe of the
  // land itself. Three steps, so the bank is a slope and not a stripe.
  for (let s = 0; s < 8; s++) {
    const i = s * 4
    const m = 2 + noiseInt(seed, salt + s, 2)
    edgeFill(ctx, sx, sy, d, i, 4, 2, m - 1, damp)
    edgeFill(ctx, sx, sy, d, i + 1, 3, m, 2, sand)
    edgePx(ctx, sx, sy, d, i, m, sand)
    edgePx(ctx, sx, sy, d, i + 3, m + 1, sand)
    edgePx(ctx, sx, sy, d, i + 2, m + 2, blend)
    if (artNoise(seed, salt + 12 + s) > 0.5) edgePx(ctx, sx, sy, d, i + 1, m + 2, blend)
  }
  // Stones left at the water line.
  for (let s = 0; s < 3; s++) {
    const i = 3 + noiseInt(seed, salt + 20 + s, TILE - 6)
    edgePx(ctx, sx, sy, d, i, 1, STONE_RAMP.lit)
    edgePx(ctx, sx, sy, d, i + 1, 1, STONE_RAMP.mid)
    edgePx(ctx, sx, sy, d, i + 1, 2, STONE_RAMP.dark)
  }
  if (season === 'winter') {
    // Rime, held to the very edge where the spray freezes.
    for (let s = 0; s < 10; s++) {
      if (artNoise(seed, salt + 30 + s) < 0.45) continue
      edgePx(ctx, sx, sy, d, s * 3, 0, withAlpha(PAL.cream, 0.75))
      edgePx(ctx, sx, sy, d, s * 3 + 1, 1, withAlpha(PAL.cream, 0.4))
    }
  }
}

/**
 * The water side of a shore: the bank's shadow on the water, foam that moves
 * on the 6 fps beat, and — under a northern neighbour — its reflection, tinted
 * by whatever actually stands there.
 */
function shoreOnWater(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  d: number,
  other: Tile,
  g: GroundPalette,
  season: Season,
  seed: number,
  salt: number,
  frame: number,
): void {
  const cold = season === 'winter'
  const base = cold ? mixHex(PAL.sky, PAL.cream, 0.24) : PAL.sky
  const r = ramp(base)
  const beat = beatOf(frame)

  // Light falls from the upper left, so only a bank to the north or the west
  // throws its shadow onto the water. The other two sides are shallows, and
  // shallows catch light instead of losing it.
  if (d === 0 || d === 3) {
    edgeFill(ctx, sx, sy, d, 0, TILE, 0, 1, mixHex(r.mid, PAL.dusk, 0.5))
    edgeFill(ctx, sx, sy, d, 0, TILE, 1, 1, mixHex(r.mid, PAL.dusk, 0.26))
    edgeFill(ctx, sx, sy, d, 0, TILE, 2, 1, mixHex(r.mid, PAL.dusk, 0.1))
  } else {
    edgeFill(ctx, sx, sy, d, 0, TILE, 0, 2, mixHex(r.mid, r.lit, 0.35))
    edgeFill(ctx, sx, sy, d, 0, TILE, 2, 1, mixHex(r.mid, r.lit, 0.15))
  }

  if (cold) {
    // A shelf of ice welded to the bank, with a cracked outer edge.
    edgeFill(ctx, sx, sy, d, 0, TILE, 1, 2, withAlpha(PAL.cream, 0.7))
    for (let s = 0; s < 8; s++) {
      if (artNoise(seed, salt + s) < 0.5) continue
      edgeFill(ctx, sx, sy, d, s * 4, 3, 3, 1, withAlpha(PAL.cream, 0.45))
    }
  } else {
    // Foam: short dashes over about half the edge, shuffling one step per beat.
    // A line of foam all the way along is an outline, and an outline is exactly
    // what a shoreline must not be.
    for (let s = 0; s < 8; s++) {
      const phase = (s + beat) & 3
      if (phase >= 2) continue
      const i = s * 4 + phase
      const len = 2 + phase
      edgeFill(ctx, sx, sy, d, i, len, 1, 1, withAlpha(PAL.cream, 0.6))
      if (artNoise(seed, salt + s + phase * 7) > 0.55) {
        edgeFill(ctx, sx, sy, d, i + 1, len - 1, 2, 1, withAlpha(PAL.cream, 0.24))
      }
    }
  }

  // Reflection. Only from the north: a thing standing on the far bank drops its
  // image into the water in front of it, never sideways or upward. Kept faint
  // and broken — a reflection is a suggestion, and a solid one reads as a wall.
  if (d !== 0 || cold) return
  const tint = reflectTint(other, g)
  for (let j = 3; j < 8; j++) {
    const wobble = ((beat + j) & 3) - 1
    const w = 4 + ((j + (beat & 1)) & 3) * 2
    const x = sx + 2 + wobble + ((j * 9) % 17)
    hline(ctx, x, sy + j, w, withAlpha(tint, 0.44 - (j - 3) * 0.07))
    px(ctx, x - 3, sy + j, withAlpha(tint, 0.2))
    if (j < 6) px(ctx, x + w + 2, sy + j, withAlpha(tint, 0.18))
  }
}

/** What the water gives back of the tile above it. */
function reflectTint(other: Tile, g: GroundPalette): string {
  if (other.plant !== null) return mixHex(PAL.leaf, PAL.sky, 0.3)
  if (other.buildingId !== null || other.machineId !== null) return mixHex(PAL.bark, PAL.sky, 0.3)
  switch (other.ground) {
    case 'rock':
      return mixHex(STONE_DARK, PAL.sky, 0.3)
    case 'log':
      return mixHex(PAL.bark, PAL.sky, 0.3)
    case 'weeds':
      return mixHex(PAL.leaf, PAL.sky, 0.2)
    case 'soil':
      return mixHex(other.watered ? PAL.soilWet : PAL.soil, PAL.sky, 0.3)
    case 'path':
      return mixHex(PATH_DARK, PAL.sky, 0.35)
    default:
      return mixHex(g.dark, PAL.sky, 0.18)
  }
}

/**
 * Snow re-laid over a transition that crossed the top edge, so the drift sits
 * on the seam rather than under it. Broken, for the reason `frostTop` gives.
 */
function snowLip(ctx: CanvasRenderingContext2D, sx: number, sy: number, seed: number): void {
  for (let s = 0; s < 8; s++) {
    const n = artNoise(seed, 388 + s)
    if (n < 0.32) continue
    const w = 2 + noiseInt(seed, 400 + s, 3)
    const x = sx + s * 4 + noiseInt(seed, 412 + s, 2)
    hline(ctx, x, sy, w, withAlpha(PAL.cream, 0.9))
    if (n > 0.6) hline(ctx, x + 1, sy + 1, w - 1, withAlpha(PAL.cream, 0.5))
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
  const glint = mixHex(PAL.parchment, PAL.cream, 0.5)
  for (let i = 0; i < 18; i++) {
    const x = sx + 1 + Math.floor(artNoise(v, 800 + i) * (TILE - 3))
    const y = sy + 1 + Math.floor(artNoise(v, 830 + i) * (TILE - 3))
    const pale = artNoise(v, 860 + i) > 0.72
    px(ctx, x, y, pale ? mineral : dark)
    // Each grain is lit on its upper left and shadowed on its lower right.
    if (pale) px(ctx, x, y - 1, glint)
    if (artNoise(v, 880 + i) > 0.6) px(ctx, x + 1, y + 1, withAlpha(PAL.ink, 0.3))
  }
}

/**
 * The sprinkler, at 32 px: a plate on the ground, a post, and a rotating head
 * throwing four arms of spray. Reduced motion keeps the hardware and freezes
 * the spray to a single ring, because a sprinkler that is running is state.
 */
function sprinklerPost(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  frame: number,
): void {
  const cx = sx + 16
  const still = prefersReducedMotion()
  const beat = beatOf(frame)
  const r: Ramp = METAL_RAMP

  // Spray first, so the hardware reads on top of it.
  const jet = withAlpha(mixHex(PAL.sky, PAL.cream, 0.4), 0.9)
  const far = withAlpha(PAL.sky, 0.55)
  const reach = still ? 3 : 3 + (beat % 4) * 2
  for (let k = 0; k <= reach; k++) {
    const c = k >= reach - 1 ? far : jet
    const drop = (k * k) >> 4
    px(ctx, cx - 8 - k, sy + 9 + drop, c)
    px(ctx, cx + 7 + k, sy + 9 + drop, c)
    if (k < 5) {
      px(ctx, cx - 1, sy + 4 - k, c)
      px(ctx, cx + 1 + (k >> 1), sy + 5 - k, c)
    }
  }
  px(ctx, cx - 9, sy + 18, far)
  px(ctx, cx + 9, sy + 19, far)
  px(ctx, cx - 7, sy + 23, jet)
  px(ctx, cx + 8, sy + 22, jet)
  if (!still && (beat & 1) === 0) {
    px(ctx, cx - 11, sy + 14, far)
    px(ctx, cx + 11, sy + 15, far)
  }

  // Contact shadow, plate, post, head — bottom to top, light from the upper left.
  ellipse(ctx, cx, sy + 28, 8, 2, CONTACT)
  shadeRect(ctx, cx - 7, sy + 23, 15, 5, r)
  shadeRect(ctx, cx - 3, sy + 12, 7, 12, r)
  shadeRect(ctx, cx - 8, sy + 6, 17, 7, r)

  // Nozzles and cap.
  hline(ctx, cx - 10, sy + 8, 2, r.ink)
  hline(ctx, cx + 9, sy + 8, 2, r.ink)
  px(ctx, cx - 10, sy + 9, r.dark)
  px(ctx, cx + 10, sy + 9, r.dark)
  hline(ctx, cx - 2, sy + 4, 5, r.ink)
  hline(ctx, cx - 1, sy + 5, 3, r.lit)
  px(ctx, cx - 1, sy + 4, r.spec)
}
