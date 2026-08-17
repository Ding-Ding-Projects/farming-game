/**
 * Livestock art — the twelve species of `docs/CATALOG.md` section 3, drawn native at
 * 32 px with the five-tone ramp `docs/GRAPHICS.md` section 5 asks for.
 *
 * Every species is built from the same small vocabulary — a shaded volume, a neck, a set
 * of legs, a taper — but no two share a construction: the chicken is a plump oval with a
 * comb and a fan tail, the goose is an S of neck over a low body, the turkey is a spread
 * disc of tail, the rabbit is two long ears over a haunch, the sheep is a cloud of curls,
 * the bee hovers on flickering wings and the fish is a wedge over its own ripple. Held
 * against each other in silhouette alone, twelve different animals.
 *
 * Three things the sprite must say without the caller telling it:
 *
 *   - **Unwell reads as unwell without colour.** The back slumps, the head hangs, the
 *     ears and the tail fall, and the eye closes to a line. The dusk wash over the coat
 *     is the last of the four signals, not the first.
 *   - **Young is visibly smaller.** A young animal is the same construction drawn at
 *     three quarters of every offset — `ageInDays` from the rules layer decides, so the
 *     art and the production clock agree about who is grown.
 *   - **The light never moves.** Facing is mirrored from the animal's id so a pen is not
 *     a row of clones, but the lit edge and the specular stay upper-left through the
 *     flip, because `docs/GRAPHICS.md` section 5 says light falls from the upper left
 *     always and a mirrored highlight is the tell of cheap art.
 *
 * Animation is the table in `docs/GRAPHICS.md` section 6 — idle 2, walk 4, eat 3,
 * happy 2 — on the 6 fps sub-clock, sequenced into an ambient loop whose phase comes
 * from the animal's id. `GameState` does not record what an animal is *doing*, so the
 * art picks a behaviour from what it does record: a fed or grazing animal eats, a petted
 * or well-loved animal has a happy beat in its loop, an unfed one just stands there.
 * Under reduced motion the loop collapses to a single idle frame, which is ambient
 * motion dropped exactly as section 6 requires.
 */
import type { Animal, SpeciesDef, SpeciesId } from '../game/farm-types'
import type { Ramp } from '../engine/palette'
import { TILE } from '../game/constants'
import { ageInDays } from '../game/livestock'
import { PAL, ramp, withAlpha } from '../engine/palette'
import { ellipse, hline, px, rect } from '../engine/pixel'
import { beatOf, mixHex, prefersReducedMotion } from './tiles'

type Ctx = CanvasRenderingContext2D

/** Animal and machine icons are a full tile, so a shop row shows the real sprite. */
export const ANIMAL_ICON = TILE

/* ------------------------------------------------------------------ *
 * Coats
 * ------------------------------------------------------------------ */

interface Build {
  /**
   * Width of the idle silhouette in design pixels. Over `TILE` it overhangs its tile;
   * a head reaching down to feed adds a few pixels more on the leading side.
   */
  w: number
  coat: string
  /** The second colour: a mallard's head, a sheep's face, a fish's fins. */
  trim: string
}

const HORN = mixHex(PAL.bark, PAL.parchment, 0.35)
const HOOF = mixHex(PAL.ink, PAL.bark, 0.2)
const MANE = mixHex(PAL.ink, PAL.bark, 0.3)
const PINK = mixHex(PAL.berry, PAL.cream, 0.55)
const FLESH = mixHex(PAL.berry, PAL.parchment, 0.4)

const BUILDS: Readonly<Record<SpeciesId, Build>> = {
  chicken: { w: 27, coat: PAL.parchment, trim: PAL.berry },
  duck: { w: 29, coat: mixHex(PAL.parchment, PAL.sky, 0.3), trim: PAL.leaf },
  goose: { w: 27, coat: PAL.cream, trim: mixHex(PAL.lantern, PAL.ink, 0.25) },
  turkey: { w: 31, coat: mixHex(PAL.bark, PAL.ink, 0.22), trim: PAL.berry },
  rabbit: { w: 25, coat: mixHex(PAL.dusk, PAL.cream, 0.5), trim: FLESH },
  cow: { w: 39, coat: PAL.cream, trim: PINK },
  goat: { w: 32, coat: mixHex(PAL.soil, PAL.cream, 0.45), trim: HORN },
  sheep: { w: 32, coat: mixHex(PAL.parchment, PAL.dusk, 0.16), trim: mixHex(PAL.ink, PAL.dusk, 0.4) },
  pig: { w: 34, coat: PINK, trim: mixHex(PAL.berry, PAL.ink, 0.3) },
  bee: { w: 25, coat: PAL.lantern, trim: PAL.sky },
  fish: { w: 29, coat: mixHex(PAL.sky, PAL.dusk, 0.25), trim: PAL.lantern },
  horse: { w: 35, coat: mixHex(PAL.bark, PAL.soil, 0.5), trim: MANE },
}

/** A species the table has never heard of still has to stand somewhere. */
const GENERIC: Build = { w: 30, coat: mixHex(PAL.soil, PAL.parchment, 0.3), trim: PAL.bark }

/**
 * The same twelve with the coat washed toward `dusk`. Built once at load rather than
 * mixed per frame — an unwell animal is redrawn sixty times a second and the wash is a
 * pure function of the coat.
 */
const BUILDS_UNWELL: Readonly<Record<SpeciesId, Build>> = Object.fromEntries(
  Object.entries(BUILDS).map(([id, b]) => [id, { ...b, coat: mixHex(b.coat, PAL.dusk, 0.3) }]),
)

const GENERIC_UNWELL: Build = { ...GENERIC, coat: mixHex(GENERIC.coat, PAL.dusk, 0.3) }

function buildOf(id: SpeciesId, unwell = false): Build {
  if (unwell) return BUILDS_UNWELL[id] ?? GENERIC_UNWELL
  return BUILDS[id] ?? GENERIC
}

/** Design-space width. A caller laying out a pen needs to know who overhangs. */
export function animalWidth(species: SpeciesDef): number {
  return buildOf(species.id).w
}

/* ------------------------------------------------------------------ *
 * The pen: a mirrored, scaled, posed coordinate system
 * ------------------------------------------------------------------ */

type PoseKind = 'idle' | 'walk' | 'eat' | 'happy'

interface Pen {
  ctx: Ctx
  /** Screen column the animal is centred on. */
  cx: number
  /** Screen row the feet stand on. */
  gy: number
  /** +1 faces right, -1 faces left. Never mirrors the light. */
  dir: 1 | -1
  /** Numerator over four: 4 grown, 3 young, 3 for a large animal in an icon. */
  k: number
  pose: PoseKind
  step: number
  /** Whole-body lift in screen pixels — the walk bob and the happy hop. */
  bob: number
  /** 0 head up, 1 head at the ground. Drives every neck in the file. */
  graze: number
  /** Added to the head after grazing: the unwell hang and the happy lift. */
  tilt: number
  /** Added to ears, tails and combs. Positive falls, negative perks up. */
  lift: number
  /** The unwell slump, in design pixels down. */
  slump: number
  unwell: boolean
}

function X(p: Pen, dx: number): number {
  return p.cx + p.dir * Math.round((dx * p.k) / 4)
}

function Y(p: Pen, dy: number): number {
  return p.gy + Math.round((dy * p.k) / 4) + p.bob
}

function S(p: Pen, v: number): number {
  const r = Math.round((v * p.k) / 4)
  return r < 1 ? 1 : r
}

/** A rectangle in design space. Mirrors by its corners, so `dir` never flips a width. */
function bar(p: Pen, dx: number, dy: number, w: number, h: number, c: string): void {
  const x0 = X(p, dx)
  const x1 = X(p, dx + w - 1)
  const y0 = Y(p, dy)
  const y1 = Y(p, dy + h - 1)
  const lx = x0 < x1 ? x0 : x1
  const ly = y0 < y1 ? y0 : y1
  rect(p.ctx, lx, ly, Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1, c)
}

function dot(p: Pen, dx: number, dy: number, c: string): void {
  px(p.ctx, X(p, dx), Y(p, dy), c)
}

/** A flat ellipse — fins, ears, puffs, anything that is one tone by design. */
function oval(p: Pen, dx: number, dy: number, rx: number, ry: number, c: string): void {
  ellipse(p.ctx, X(p, dx), Y(p, dy), S(p, rx), S(p, ry), c)
}

/**
 * The volume primitive: an ink-ringed ellipse carrying the full five-tone ramp, lit from
 * the upper left in *screen* space so a mirrored animal keeps its highlight where the sun
 * is. Every body, head and haunch in this file is one of these.
 */
function orb(p: Pen, dx: number, dy: number, rx: number, ry: number, r: Ramp): void {
  const cx = X(p, dx)
  const cy = Y(p, dy)
  const a = S(p, rx)
  const b = S(p, ry)
  ellipse(p.ctx, cx, cy, a, b, r.ink)
  shadeOval(p.ctx, cx, cy, a - 1, b - 1, r)
}

function shadeOval(ctx: Ctx, cx: number, cy: number, a: number, b: number, r: Ramp): void {
  if (a < 1 || b < 1) {
    ellipse(ctx, cx, cy, a, b, r.mid)
    return
  }
  const ae = a + 0.5
  const be = b + 0.5
  const aa = ae * ae
  const bb = be * be
  const edge = a >= 5 && b >= 4 ? 2 : 1
  for (let dy = -b; dy <= b; dy++) {
    const k = 1 - (dy * dy) / bb
    const half = k <= 0 ? 0 : Math.floor(Math.sqrt(aa * k))
    const x0 = cx - half
    const w = half * 2 + 1
    hline(ctx, x0, cy + dy, w, r.mid)
    if (dy > 0) hline(ctx, x0 + w - (w > edge * 2 ? edge : 1), cy + dy, w > edge * 2 ? edge : 1, r.dark)
    if (dy < 0) hline(ctx, x0, cy + dy, w > edge * 2 ? edge : 1, r.lit)
    if (dy >= b - edge + 1) hline(ctx, x0, cy + dy, w, r.dark)
    if (dy <= -(b - edge + 1)) hline(ctx, x0, cy + dy, w, r.lit)
  }
  if (a >= 3 && b >= 3) {
    const sx = cx - (((a * 5) / 9) | 0)
    const sy = cy - (((b * 5) / 9) | 0)
    hline(ctx, sx, sy, a >= 6 ? 2 : 1, r.spec)
    if (b >= 5) px(ctx, sx, sy + 1, r.spec)
  }
}

/**
 * A horizontal wedge: `w` columns whose height eases from `h0` to `h1` about `dy`.
 * Beaks, fins, ears, horns, tail feathers — everything that comes to a point.
 */
function taper(p: Pen, dx: number, dy: number, w: number, h0: number, h1: number, c: string): void {
  const span = w > 1 ? w - 1 : 1
  for (let i = 0; i < w; i++) {
    const h = Math.round(h0 + ((h1 - h0) * i) / span)
    if (h <= 0) continue
    bar(p, dx + i, dy - ((h - 1) >> 1), 1, h, c)
  }
}

/** A fin or a crest: `w` columns standing off a fixed base line rather than centred. */
function crest(
  p: Pen,
  dx: number,
  base: number,
  w: number,
  h0: number,
  h1: number,
  up: boolean,
  c: string,
): void {
  const span = w > 1 ? w - 1 : 1
  for (let i = 0; i < w; i++) {
    const h = Math.round(h0 + ((h1 - h0) * i) / span)
    if (h <= 0) continue
    bar(p, dx + i, up ? base - h + 1 : base, 1, h, c)
  }
}

/**
 * A neck: a smooth tube from the shoulder to wherever the head has gone, so a goose that
 * bends down to feed keeps one unbroken outline.
 *
 * Four passes over the whole run rather than a shaded blob per segment — a per-segment
 * ring would read as a caterpillar. The 1 px offsets are taken in *screen* space, not
 * design space, so the light stays upper-left when the animal is mirrored.
 */
function neck(
  p: Pen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number,
  r: Ramp,
  segments: number,
): void {
  const tones = [r.ink, r.lit, r.mid, r.dark]
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const cx = X(p, x0 + (x1 - x0) * t)
      const cy = Y(p, y0 + (y1 - y0) * t)
      const rr = S(p, r0 + (r1 - r0) * t)
      const shrink = pass === 0 ? 0 : pass === 3 ? 3 : 1
      const push = pass === 2 ? 1 : pass === 3 ? 2 : 0
      const rad = rr - shrink
      if (rad < 0) continue
      ellipse(p.ctx, cx + push, cy + push, rad, rad, tones[pass])
    }
  }
}

/** The 1 px contact shadow that seats a sprite on the ground. */
function contact(p: Pen, rx: number, ry: number): void {
  ellipse(p.ctx, p.cx, p.gy, S(p, rx), S(p, ry), withAlpha(PAL.ink, 0.26))
}

const SWING = [0, 1, 0, -1] as const

/** Which way a leg is swinging this frame. Diagonal pairs move together. */
function swingOf(p: Pen, index: number): number {
  if (p.pose !== 'walk') return 0
  const diagonal = index === 0 || index === 3
  return SWING[(p.step + (diagonal ? 0 : 2)) & 3]
}

/**
 * Legs from `top` to the ground, hooved, stepping on the walk beat. The lit and dark
 * columns are placed in screen space so a mirrored animal is still lit from the left.
 */
function legs(p: Pen, xs: readonly number[], top: number, w: number, r: Ramp, hoof: string): void {
  for (let i = 0; i < xs.length; i++) {
    const s = swingOf(p, i)
    const foot = s > 0 ? -1 : 0
    const x = xs[i] + s
    const xa = X(p, x)
    const xb = X(p, x + w - 1)
    const lx = xa < xb ? xa : xb
    const lw = Math.abs(xb - xa) + 1
    const y0 = Y(p, top)
    const y1 = Y(p, foot)
    const h = y1 - y0
    if (h <= 0) continue
    rect(p.ctx, lx - 1, y0, lw + 2, h, r.ink)
    rect(p.ctx, lx, y0, lw, h - 1, r.mid)
    rect(p.ctx, lx, y0, 1, h - 1, r.lit)
    // A thin leg has no room for a shaded far side; two ink edges and a lit one is all
    // the volume it can carry, and adding the third tone only reads as a black post.
    if (lw > 2) rect(p.ctx, lx + lw - 1, y0, 1, h - 1, r.dark)
    rect(p.ctx, lx - 1, y1 - 2, lw + 2, 2, hoof)
  }
}

/** Two bird legs with three toes each. */
function birdLegs(p: Pen, x0: number, x1: number, top: number, c: string): void {
  const dark = mixHex(c, PAL.ink, 0.35)
  const xs = [x0, x1]
  for (let i = 0; i < 2; i++) {
    const s = p.pose === 'walk' ? SWING[(p.step + i * 2) & 3] : 0
    const x = xs[i] + s
    const foot = s > 0 ? -1 : 0
    bar(p, x, top, 1, -top + foot, dark)
    bar(p, x - 1, top + 1, 1, -top + foot - 1, c)
    bar(p, x - 1, foot, 4, 1, c)
    dot(p, x - 1, foot - 1, dark)
    dot(p, x + 2, foot, dark)
  }
}

/** Webbed feet, for the two birds that swim. */
function webFeet(p: Pen, x0: number, x1: number, top: number, c: string): void {
  const xs = [x0, x1]
  for (let i = 0; i < 2; i++) {
    const s = p.pose === 'walk' ? SWING[(p.step + i * 2) & 3] : 0
    bar(p, xs[i] + s, top, 1, -top, mixHex(c, PAL.ink, 0.3))
    taper(p, xs[i] + s - 1, 0, 5, 2, 1, c)
  }
}

/**
 * The eye, and the only place in the file where the pose changes a face: open with a
 * cream glint normally, shut to a line when the animal is unwell, and a happy caret on
 * the happy beat. Colour is never the only difference.
 */
function eye(p: Pen, dx: number, dy: number): void {
  if (p.unwell) {
    bar(p, dx - 1, dy, 3, 1, PAL.ink)
    return
  }
  if (p.pose === 'happy') {
    bar(p, dx - 1, dy, 3, 1, PAL.ink)
    dot(p, dx, dy - 1, PAL.ink)
    return
  }
  bar(p, dx, dy - 1, 1, 2, PAL.ink)
  if (p.k >= 4) dot(p, dx, dy - 2, PAL.cream)
}

/** Where the head sits this frame: `rest` normally, `rest + reach` with its nose down. */
function headY(p: Pen, rest: number, reach: number): number {
  return rest + Math.round(reach * p.graze) + p.tilt + p.slump
}

function headX(p: Pen, rest: number, forward: number): number {
  return rest + Math.round(forward * p.graze)
}

/** Scattered feed, drawn only where a head has gone down to look for it. */
function feed(p: Pen, dx: number): void {
  if (p.graze <= 0) return
  const grain = mixHex(PAL.lantern, PAL.parchment, 0.4)
  for (let i = 0; i < 5; i++) {
    dot(p, dx + i * 2 - 3, -1 - (i & 1), i === 2 ? PAL.parchment : grain)
  }
  bar(p, dx - 4, 0, 11, 1, withAlpha(PAL.ink, 0.2))
}

/* ------------------------------------------------------------------ *
 * The twelve
 * ------------------------------------------------------------------ */

function chicken(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const foot = ramp(PAL.lantern)
  contact(p, 9, 3)

  // Tail: four feathers fanning up and back, behind everything.
  for (let i = 0; i < 4; i++) {
    taper(p, -13 + i, -14 - i * 2 + p.lift, 7, 2, 4, i === 3 ? body.lit : body.mid)
    dot(p, -13 + i, -14 - i * 2 + p.lift, body.ink)
  }

  birdLegs(p, -3, 3, -6, foot.mid)
  orb(p, -1, -12 + p.slump, 8, 7, body)

  // Folded wing: a crescent of the lit tone over the mid body, with two quill lines.
  oval(p, 0, -12 + p.slump, 6, 5, body.lit)
  oval(p, 1, -13 + p.slump, 5, 4, body.mid)
  bar(p, -4, -11 + p.slump, 7, 1, body.dark)
  bar(p, -3, -9 + p.slump, 6, 1, body.dark)

  const hx = headX(p, 7, 4)
  const hy = headY(p, -21, 15)
  orb(p, hx, hy, 4, 4, body)
  // Comb, then wattle, then beak.
  for (let i = 0; i < 3; i++) dot(p, hx - 1 + i, hy - 5 + (i === 1 ? -1 : 0) + p.lift, b.trim)
  bar(p, hx - 1, hy - 4 + p.lift, 3, 1, mixHex(b.trim, PAL.ink, 0.3))
  bar(p, hx + 2, hy + 2, 2, 2, b.trim)
  taper(p, hx + 4, hy, 4, 4, 1, PAL.lantern)
  dot(p, hx + 4, hy + 2, mixHex(PAL.lantern, PAL.ink, 0.4))
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 4)
}

function duck(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const head = ramp(b.trim)
  contact(p, 10, 3)

  taper(p, -14, -14 + p.lift, 6, 2, 5, body.mid)
  webFeet(p, -3, 3, -5, PAL.lantern)
  orb(p, -2, -11 + p.slump, 9, 6, body)
  oval(p, -1, -11 + p.slump, 6, 4, body.lit)
  oval(p, 0, -12 + p.slump, 5, 3, body.mid)
  bar(p, -6, -10 + p.slump, 8, 1, body.dark)

  const hx = headX(p, 8, 3)
  const hy = headY(p, -18, 12)
  neck(p, 4, -14 + p.slump, hx - 2, hy + 2, 3, 3, head, 2)
  orb(p, hx, hy, 4, 4, head)
  // The bill is the duck: flat, wide, blunt, and clear of the head.
  bar(p, hx + 3, hy + 1, 6, 2, PAL.lantern)
  bar(p, hx + 3, hy + 3, 5, 1, mixHex(PAL.lantern, PAL.ink, 0.35))
  bar(p, hx + 3, hy, 5, 1, mixHex(PAL.lantern, PAL.cream, 0.4))
  dot(p, hx + 8, hy + 1, mixHex(PAL.lantern, PAL.ink, 0.4))
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 5)
}

function goose(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  contact(p, 9, 3)

  taper(p, -14, -12 + p.lift, 6, 3, 6, body.mid)
  birdLegs(p, -3, 2, -5, PAL.lantern)
  orb(p, -2, -10 + p.slump, 9, 6, body)
  oval(p, -1, -10 + p.slump, 6, 4, body.lit)
  oval(p, 0, -11 + p.slump, 5, 3, body.mid)

  // The long neck is the whole silhouette, and it bends when the head goes down.
  const hx = headX(p, 10, 4)
  const hy = headY(p, -25, 22)
  neck(p, 4, -13 + p.slump, hx - 2, hy + 3, 3, 2, body, 4)
  orb(p, hx, hy, 3, 3, body)
  bar(p, hx + 2, hy, 4, 2, b.trim)
  bar(p, hx + 2, hy - 1, 3, 1, mixHex(b.trim, PAL.cream, 0.35))
  dot(p, hx + 5, hy + 1, PAL.ink)
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 4)
}

function turkey(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const skin = ramp(mixHex(b.trim, PAL.dusk, 0.3))
  contact(p, 10, 3)

  // The spread tail: an ink disc, a barred fan, then the body sitting over its foot.
  const fy = -16 + p.lift
  oval(p, -4, fy, 13, 13, PAL.ink)
  oval(p, -4, fy, 12, 12, body.dark)
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.62 + i * 0.13)
    const tx = -4 + Math.round(Math.cos(a) * 11)
    const ty = fy - Math.round(Math.sin(a) * 11)
    const mx = -4 + Math.round(Math.cos(a) * 6)
    const my = fy - Math.round(Math.sin(a) * 6)
    bar(p, mx, my, 1, 1, body.mid)
    bar(p, tx, ty, 1, 1, PAL.lantern)
    bar(p, Math.round((tx + mx) / 2), Math.round((ty + my) / 2), 1, 1, body.lit)
  }
  oval(p, -4, fy, 7, 7, body.mid)
  oval(p, -4, fy - 1, 6, 5, body.lit)
  oval(p, -3, fy, 5, 4, body.mid)

  legs(p, [-1, 4], -6, 2, ramp(PAL.lantern), HOOF)
  orb(p, 3, -12 + p.slump, 8, 8, body)
  oval(p, 4, -12 + p.slump, 5, 5, body.dark)

  const hx = headX(p, 10, 4)
  const hy = headY(p, -20, 15)
  neck(p, 7, -17 + p.slump, hx - 1, hy + 2, 2, 3, skin, 2)
  orb(p, hx, hy, 3, 3, skin)
  // Snood over the beak, wattle under it — the two things only a turkey has.
  bar(p, hx + 2, hy - 2 + p.lift, 1, 5, b.trim)
  dot(p, hx + 2, hy + 3 + p.lift, mixHex(b.trim, PAL.ink, 0.3))
  bar(p, hx, hy + 3, 3, 2, b.trim)
  taper(p, hx + 3, hy, 3, 3, 1, PAL.lantern)
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 4)
}

function rabbit(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  contact(p, 9, 3)

  oval(p, -9, -9 + p.slump, 3, 3, body.ink)
  oval(p, -9, -9 + p.slump, 2, 2, PAL.cream)
  orb(p, -4, -8 + p.slump, 7, 6, body)
  orb(p, 2, -10 + p.slump, 6, 6, body)
  // Chest, so the forepaws belong to something rather than floating under the head.
  orb(p, 6, -7 + p.slump, 4, 4, body)

  const hx = headX(p, 8, 3)
  const hy = headY(p, -14, 9)
  orb(p, hx, hy, 4, 4, body)

  // Two long ears, forward when well, folded back and down when not.
  const ear = p.lift
  const back = p.unwell ? -3 : 0
  for (let i = 0; i < 2; i++) {
    const ex = hx - 2 + i * 3 + back
    oval(p, ex, hy - 7 + ear, 2, 5, body.ink)
    oval(p, ex, hy - 7 + ear, 1, 4, body.mid)
    bar(p, ex, hy - 9 + ear, 1, 4, i === 0 ? b.trim : body.lit)
  }

  // Front paws and a hind foot, so it reads as sitting rather than floating.
  bar(p, hx - 1, -3, 3, 3, body.ink)
  bar(p, hx - 1, -3, 3, 2, body.lit)
  bar(p, -6, -3, 6, 3, body.ink)
  bar(p, -6, -3, 6, 2, body.mid)
  bar(p, -6, -3, 5, 1, body.lit)

  bar(p, hx + 3, hy + 1, 2, 1, b.trim)
  dot(p, hx + 4, hy + 2, PAL.ink)
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 4)
}

function cow(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const patch = ramp(mixHex(PAL.ink, PAL.dusk, 0.22))
  const udder = ramp(b.trim)
  contact(p, 16, 3)

  // Tail down the far side, before the body.
  bar(p, -17, -20 + p.slump, 2, 13, MANE)
  taper(p, -18, -6, 3, 4, 2, MANE)

  legs(p, [-12, -6, 6, 11], -9, 3, body, HOOF)
  orb(p, -3, -15 + p.slump, 14, 8, body)
  oval(p, -9, -18 + p.slump, 4, 3, patch.mid)
  oval(p, -8, -19 + p.slump, 3, 2, patch.lit)
  oval(p, 2, -12 + p.slump, 5, 3, patch.mid)
  oval(p, 2, -13 + p.slump, 4, 2, patch.lit)
  orb(p, -4, -7 + p.slump, 4, 2, udder)

  const hx = headX(p, 14, 5)
  const hy = headY(p, -17, 13)
  neck(p, 8, -18 + p.slump, hx - 3, hy - 1, 5, 5, body, 2)
  orb(p, hx, hy, 5, 5, body)
  orb(p, hx + 4, hy + 2, 3, 2, udder)
  dot(p, hx + 5, hy + 2, PAL.ink)
  dot(p, hx + 3, hy + 3, PAL.ink)
  // Horns and ears sit either side of the poll.
  for (let i = 0; i < 2; i++) {
    const ox = hx - 3 + i * 5
    bar(p, ox, hy - 7 + p.lift, 3, 3, PAL.ink)
    bar(p, ox, hy - 7 + p.lift, 2, 2, HORN)
    dot(p, ox, hy - 7 + p.lift, mixHex(HORN, PAL.cream, 0.4))
  }
  oval(p, hx - 5, hy - 1 + p.lift, 2, 1, body.dark)
  oval(p, hx + 4, hy - 2 + p.lift, 2, 1, body.dark)
  eye(p, hx + 2, hy - 1)
  feed(p, hx + 5)
}

function goat(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  contact(p, 12, 3)

  // A goat carries its tail up, which is half of how you tell it from a sheep.
  bar(p, -11, -20 + p.lift, 2, 5, body.ink)
  bar(p, -11, -20 + p.lift, 1, 4, body.lit)
  legs(p, [-9, -5, 0, 4], -11, 2, body, HOOF)
  orb(p, -4, -15 + p.slump, 8, 6, body)
  bar(p, -10, -11 + p.slump, 10, 1, body.dark)

  // Head forward of the barrel on a real neck, not sitting on the back like a fleece.
  const hx = headX(p, 13, 4)
  const hy = headY(p, -22, 18)
  neck(p, 3, -16 + p.slump, hx - 2, hy + 1, 3, 2, body, 3)
  orb(p, hx, hy, 3, 3, body)
  neck(p, hx + 1, hy + 1, hx + 5, hy + 2, 2, 2, body, 2)
  dot(p, hx + 6, hy + 2, PAL.ink)

  // Horns: two short thick curves swept back over the poll — the other half.
  const horn: ReadonlyArray<readonly [number, number]> = [
    [-1, -4],
    [-3, -5],
    [-6, -5],
  ]
  for (const h of horn) {
    bar(p, hx + h[0], hy + h[1] + p.lift, 3, 3, body.ink)
    bar(p, hx + h[0], hy + h[1] + p.lift, 3, 2, HORN)
    bar(p, hx + h[0], hy + h[1] + p.lift, 2, 1, mixHex(HORN, PAL.cream, 0.35))
  }
  // Ears out behind the jaw, and the beard.
  oval(p, hx - 3, hy + 2 + p.lift, 3, 2, body.ink)
  oval(p, hx - 3, hy + 2 + p.lift, 2, 1, body.mid)
  bar(p, hx + 2, hy + 4, 2, 4, body.dark)
  bar(p, hx + 2, hy + 7, 1, 2, body.ink)
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 6)
}

function sheep(p: Pen, b: Build): void {
  const wool = ramp(b.coat)
  const face = ramp(b.trim)
  contact(p, 13, 3)

  legs(p, [-8, -3, 4, 8], -7, 2, face, HOOF)

  // The fleece is a cloud of curls: seven volumes drawn back to front, each ink ring
  // reading as the parting between two curls.
  const lobes: ReadonlyArray<readonly [number, number, number, number]> = [
    [7, -11, 6, 5],
    [-8, -11, 6, 5],
    [0, -10, 7, 6],
    [9, -16, 5, 4],
    [3, -17, 6, 5],
    [-4, -18, 6, 5],
    [-10, -16, 5, 4],
  ]
  for (const l of lobes) orb(p, l[0], l[1] + p.slump, l[2], l[3], wool)

  const hx = headX(p, 12, 4)
  const hy = headY(p, -16, 11)
  orb(p, hx, hy, 4, 4, face)
  oval(p, hx - 2, hy - 4, 3, 2, wool.mid)
  oval(p, hx - 2, hy - 5, 3, 1, wool.lit)
  taper(p, hx + 3, hy + 1, 3, 3, 2, face.lit)
  oval(p, hx - 3, hy + 1 + p.lift, 3, 1, face.dark)
  oval(p, hx + 3, hy + 3 + p.lift, 2, 1, face.dark)
  if (p.unwell) bar(p, hx, hy - 1, 3, 1, PAL.ink)
  else {
    bar(p, hx + 1, hy - 1, 1, 2, PAL.cream)
    dot(p, hx + 1, hy - 1, PAL.ink)
  }
  feed(p, hx + 5)
}

function pig(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const snout = ramp(b.trim)
  contact(p, 14, 3)

  // Curly tail: five pixels that actually curl.
  const ty = -15 + p.lift
  dot(p, -12, ty, body.dark)
  dot(p, -13, ty - 1, body.dark)
  dot(p, -14, ty, body.mid)
  dot(p, -13, ty + 1, body.mid)
  dot(p, -11, ty + 1, body.dark)

  legs(p, [-9, -4, 6, 10], -6, 3, body, HOOF)
  orb(p, 0, -12 + p.slump, 12, 8, body)
  bar(p, -8, -8 + p.slump, 10, 1, body.dark)

  const hx = headX(p, 12, 4)
  const hy = headY(p, -13, 9)
  orb(p, hx, hy, 5, 5, body)
  orb(p, hx + 4, hy + 1, 3, 3, snout)
  dot(p, hx + 5, hy, PAL.ink)
  dot(p, hx + 5, hy + 2, PAL.ink)
  // Floppy ears, forward and up when happy, flat over the eyes when unwell.
  for (let i = 0; i < 2; i++) {
    const ex = hx - 5 + i * 5
    crest(p, ex, hy - 3 + p.lift, 5, 3, 7, true, body.ink)
    crest(p, ex, hy - 4 + p.lift, 4, 2, 5, true, body.dark)
    crest(p, ex, hy - 5 + p.lift, 3, 1, 3, true, body.mid)
  }
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 5)
}

function horse(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const mane = ramp(MANE)
  contact(p, 14, 3)

  // Tail: a long sweep off the croup, drawn behind everything.
  for (let i = 0; i < 5; i++) {
    const c = i === 0 ? mane.ink : i === 1 ? mane.lit : i === 4 ? mane.ink : mane.mid
    bar(p, -16 + i, -19 + p.slump + ((i * 3) >> 1), 1, 14 - i, c)
  }

  legs(p, [-11, -6, 4, 9], -11, 2, body, HOOF)
  orb(p, -4, -17 + p.slump, 11, 5, body)
  bar(p, -12, -13 + p.slump, 12, 1, body.dark)
  oval(p, -7, -19 + p.slump, 3, 0, body.spec)

  // Neck, head and muzzle are three tubes off one line, so the profile stays smooth.
  const hx = headX(p, 12, 10)
  const hy = headY(p, -25, 20)
  neck(p, 2, -19 + p.slump, hx - 2, hy + 1, 4, 3, body, 4)
  orb(p, hx, hy, 3, 3, body)
  neck(p, hx + 1, hy + 1, hx + 5, hy + 3, 2, 2, body, 2)
  bar(p, hx + 6, hy + 3, 1, 2, body.ink)
  dot(p, hx + 5, hy + 3, PAL.ink)

  // Mane: one unbroken strip along the crest, on the lit upper-left edge of the neck.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const mx = Math.round(1 + (hx - 3 - 1) * t)
    const my = Math.round(-22 + p.slump + (hy - 3 - (-22 + p.slump)) * t)
    bar(p, mx, my, 1, 3, mane.mid)
    dot(p, mx, my, mane.lit)
    dot(p, mx, my + 3, mane.ink)
  }

  for (let i = 0; i < 2; i++) crest(p, hx - 1 + i * 3, hy - 3 + p.lift, 2, 3, 2, true, body.dark)
  bar(p, hx - 2, hy - 3, 3, 2, mane.mid)
  eye(p, hx + 1, hy)
  feed(p, hx + 7)
}

function bee(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const fuzz = ramp(PAL.bark)
  const dark = mixHex(PAL.ink, PAL.bark, 0.15)
  // A bee never touches down: a small faint shadow, and a body held well clear of it.
  ellipse(p.ctx, p.cx, p.gy, S(p, 5), S(p, 2), withAlpha(PAL.ink, 0.16))

  // Down to the flower to feed, low and heavy when unwell.
  const d = Math.round(9 * p.graze) + p.slump * 2
  const up = (p.step & 1) === 0

  // Wings first so the body sits in front of them; they lift on alternate beats.
  const wy = (up ? -27 : -25) + d
  for (let i = 0; i < 2; i++) {
    const wx = -2 + i * 6
    oval(p, wx, wy + i, 6 - i * 2, 2, withAlpha(PAL.ink, 0.4))
    oval(p, wx, wy + i, 5 - i * 2, 1, withAlpha(PAL.sky, 0.55))
    dot(p, wx - 2, wy + i - 1, withAlpha(PAL.cream, 0.6))
  }

  taper(p, -14, -18 + d, 3, 1, 3, dark)
  orb(p, -6, -18 + d, 6, 5, body)
  // Three bands, each cut to the depth of the abdomen it crosses.
  bar(p, -9, -20 + d, 1, 4, dark)
  bar(p, -6, -22 + d, 2, 7, dark)
  bar(p, -2, -21 + d, 1, 6, dark)

  orb(p, 2, -20 + d, 4, 4, fuzz)
  dot(p, 0, -22 + d, PAL.cream)
  dot(p, 1, -23 + d, PAL.cream)
  // A fuzz collar so the dark head does not merge into the dark thorax.
  bar(p, 5, -22 + d, 1, 4, mixHex(PAL.bark, PAL.cream, 0.55))
  orb(p, 7, -21 + d, 3, 3, ramp(dark))
  if (p.unwell) bar(p, 7, -21 + d, 3, 1, PAL.ink)
  else {
    dot(p, 8, -22 + d, PAL.cream)
    dot(p, 8, -21 + d, PAL.sky)
  }
  // Antennae, then three legs trailing under the thorax.
  for (let i = 0; i < 2; i++) {
    bar(p, 8 + i * 2, -25 - i + d + p.lift, 1, 2, dark)
    dot(p, 9 + i * 2, -27 - i + d + p.lift, dark)
  }
  for (let i = 0; i < 3; i++) {
    bar(p, i * 3 - 2, -16 + d, 1, 3, dark)
    dot(p, i * 3 - 3, -13 + d, dark)
  }
}

function fish(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  const fin = ramp(b.trim)
  // The ripple stands in for the water it lives in, and drifts with the beat.
  const drift = p.pose === 'walk' ? p.step - 1 : 0
  bar(p, -8 + drift, -1, 13, 1, withAlpha(PAL.sky, 0.55))
  bar(p, -4 - drift, -3, 8, 1, withAlpha(PAL.sky, 0.35))

  // Feeding is a rise to the surface, so the whole fish lifts rather than stooping.
  const y = -13 + p.slump - Math.round(3 * p.graze)

  // Tail fan, overlapping the body so the join is hidden under it.
  taper(p, -17, y, 8, 15, 5, fin.ink)
  taper(p, -16, y, 7, 12, 4, fin.mid)
  taper(p, -16, y - 3, 4, 4, 2, fin.lit)
  // Dorsal crest over the shoulder, and the anal fin trailing under the tail.
  crest(p, -6, y - 3, 5, 2, 7, true, fin.ink)
  crest(p, -2, y - 3, 5, 7, 1, true, fin.ink)
  crest(p, -5, y - 4, 4, 2, 5, true, fin.mid)
  crest(p, -2, y - 5, 3, 5, 2, true, fin.lit)
  crest(p, -6, y + 4, 5, 4, 1, false, fin.ink)
  crest(p, -6, y + 4, 4, 3, 1, false, fin.mid)

  orb(p, 0, y, 10, 6, body)
  // Gill plate, three scale crescents, a pectoral fin, then the face.
  bar(p, 4, y - 3, 1, 7, body.dark)
  bar(p, 3, y - 3, 1, 7, body.lit)
  for (let i = 0; i < 3; i++) oval(p, -5 + i * 4, y + 1, 2, 1, body.lit)
  oval(p, 2, y + 3, 2, 1, fin.dark)
  dot(p, 1, y + 3, fin.mid)
  bar(p, 8, y + 1, 3, 1, PAL.ink)
  eye(p, 6, y - 1)
  if (p.graze > 0) {
    // Blowing at the surface: two bubbles, straight up, never a diagonal streak.
    dot(p, 11, y - 6, withAlpha(PAL.cream, 0.8))
    oval(p, 12, y - 9, 1, 1, withAlpha(PAL.cream, 0.55))
  }
}

/** A species the table has never seen still gets legs, a head and the right light. */
function generic(p: Pen, b: Build): void {
  const body = ramp(b.coat)
  contact(p, 11, 3)
  bar(p, -12, -16 + p.lift, 2, 8, ramp(b.trim).mid)
  legs(p, [-8, -3, 4, 8], -8, 2, body, HOOF)
  orb(p, -1, -14 + p.slump, 10, 7, body)
  const hx = headX(p, 10, 4)
  const hy = headY(p, -18, 12)
  neck(p, 5, -17 + p.slump, hx - 2, hy + 1, 4, 4, body, 2)
  orb(p, hx, hy, 4, 4, body)
  taper(p, hx + 3, hy + 1, 4, 4, 2, body.mid)
  for (let i = 0; i < 2; i++) taper(p, hx - 2 + i * 4, hy - 5 + p.lift, 2, 3, 2, body.dark)
  eye(p, hx + 1, hy - 1)
  feed(p, hx + 5)
}

type Draw = (p: Pen, b: Build) => void

const DRAW: Readonly<Record<SpeciesId, Draw>> = {
  chicken,
  duck,
  goose,
  turkey,
  rabbit,
  cow,
  goat,
  sheep,
  pig,
  bee,
  fish,
  horse,
}

/* ------------------------------------------------------------------ *
 * Pose
 * ------------------------------------------------------------------ */

/** FNV-1a over the animal id: its phase in the ambient loop, and which way it faces. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Friendship at which an animal is pleased enough to skip about unprompted. */
const CHEERFUL = 600
const CYCLE = 24

/**
 * The ambient behaviour loop. Nothing in `GameState` records what an animal is doing, so
 * this reads the state that *is* recorded: a fed or grazing animal has something to eat,
 * a petted or well-loved one has a happy beat, and an unfed one stands and waits.
 */
function poseFor(animal: Animal, beat: number): { kind: PoseKind; step: number } {
  if (animal.unwell) return { kind: 'idle', step: (beat >> 2) & 1 }
  const t = (beat + hashId(animal.id)) % CYCLE
  if (t < 8) return { kind: 'idle', step: (t >> 2) & 1 }
  if (t < 16) return { kind: 'walk', step: (t - 8) >> 1 }
  if (t < 21) {
    if (!animal.fedToday && !animal.outside) return { kind: 'idle', step: t & 1 }
    const s = t - 16
    return { kind: 'eat', step: s < 2 ? 0 : s < 4 ? 1 : 2 }
  }
  if (animal.pettedToday || animal.friendship >= CHEERFUL) {
    return { kind: 'happy', step: (t - 21) >> 1 }
  }
  return { kind: 'idle', step: t & 1 }
}

const WALK_BOB = [0, -1, 0, -1] as const
const GRAZE = [0.62, 1, 0.8] as const

function bobOf(kind: PoseKind, step: number): number {
  if (kind === 'walk') return WALK_BOB[step & 3]
  if (kind === 'happy') return step === 1 ? -3 : 0
  return kind === 'idle' && step === 1 ? -1 : 0
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

function penFor(
  ctx: Ctx,
  cx: number,
  gy: number,
  dir: 1 | -1,
  k: number,
  kind: PoseKind,
  step: number,
  unwell: boolean,
): Pen {
  return {
    ctx,
    cx,
    gy,
    dir,
    k,
    pose: kind,
    step,
    bob: unwell ? 0 : bobOf(kind, step),
    graze: kind === 'eat' ? GRAZE[step] ?? 1 : 0,
    tilt: unwell ? 4 : kind === 'happy' ? -2 : 0,
    lift: unwell ? 3 : kind === 'happy' ? -2 : 0,
    slump: unwell ? 2 : 0,
    unwell,
  }
}

/**
 * One animal, centred on the tile at `sx, sy` and standing three pixels off its bottom
 * edge. The large species overhang their tile horizontally — see `animalWidth` — so a
 * caller drawing a full pen should draw the ground of every tile before any animal.
 *
 * `frame` is the 60 fps counter; the pose runs on `beatOf` from it.
 */
export function drawAnimal(
  ctx: Ctx,
  species: SpeciesDef,
  animal: Animal,
  sx: number,
  sy: number,
  frame: number,
): void {
  const build = buildOf(species.id, animal.unwell)
  const still = prefersReducedMotion()
  const pose = still ? { kind: 'idle' as PoseKind, step: 0 } : poseFor(animal, beatOf(frame))
  const hash = hashId(animal.id)
  const young = animal.age < ageInDays(species.id)
  const pen = penFor(
    ctx,
    sx + (TILE >> 1),
    sy + TILE - 3,
    (hash & 1) === 0 ? 1 : -1,
    young ? 3 : 4,
    pose.kind,
    pose.step,
    animal.unwell,
  )
  const draw = DRAW[species.id] ?? generic
  draw(pen, build)
}

/**
 * The shop and status icon: the same sprite, idle, facing right, healthy and grown, in a
 * `ANIMAL_ICON` box anchored top-left. The species that overhang a tile are drawn at
 * three quarters so the icon box holds all of them.
 */
export function drawAnimalIcon(ctx: Ctx, species: SpeciesDef, sx: number, sy: number): void {
  const build = buildOf(species.id)
  const k = build.w > ANIMAL_ICON ? 3 : 4
  const pen = penFor(ctx, sx + (ANIMAL_ICON >> 1), sy + ANIMAL_ICON - 3, 1, k, 'idle', 0, false)
  const draw = DRAW[species.id] ?? generic
  draw(pen, build)
}
