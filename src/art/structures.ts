/**
 * Buildings and machines — the twenty structures of `docs/CATALOG.md` section 7 and the
 * thirty factories of section 4, drawn native at 32 px per tile.
 *
 * Three rules govern everything below.
 *
 * **A building is a place, not a box with a roof.** Each one is drawn across its whole
 * real footprint from `BuildingDef.footprint`, and each carries the thing that makes it
 * that building: the coop has a pop-hole, a ramp and a wire run; the barn has doors a
 * cow fits through and a hayloft above them; the silo is a tall banded cylinder with a
 * ladder; the stall has a counter, an awning and produce on display. A tier is a bigger,
 * better building — more storeys, more glazing, a stone footing, a lamp over the door —
 * never the same shed in another colour.
 *
 * **Light falls from the upper left, always.** Roof slopes, wall boards, cylinders and
 * every machine body carry the five-tone ramp of `docs/GRAPHICS.md` section 5 with the
 * lit edge up and left and the shadow down and right, and every structure casts one hard
 * two-pixel shadow down-right. No blur, ever, per `DESIGN.md` section 6.
 *
 * **Machines are thirty silhouettes.** A mill is a tower with turning sails, a loom is a
 * warped frame with a shuttle, a keg is a barrel on a stand with a tap. Idle, a four-frame
 * working cycle with real motion, and a ready glow — `docs/GRAPHICS.md` section 6.
 *
 * Ambient motion — smoke, sails, shuttles, steam, the ready pulse — runs on `beatOf`, so
 * reduced motion freezes all of it to a static frame while the *state* stays legible: a
 * working machine still has its fire lit and its hopper full, because that is information,
 * not decoration.
 */
import type { BuildingDef, Machine, MachineDef, PlacementCheck } from '../game/farm-types'
import type { Ramp } from '../engine/palette'
import type { Season } from '../game/types'
import { TILE } from '../game/constants'
import { PAL, ramp, withAlpha } from '../engine/palette'
import { dither, ellipse, hline, outline, px, rect, shadeRect, vline } from '../engine/pixel'
import { artNoise, beatOf, mixHex, prefersReducedMotion } from './tiles'

type Ctx = CanvasRenderingContext2D

/** Machine icons are a full tile, so a shop row shows the real sprite. */
export const MACHINE_ICON = TILE

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

const PLANK = PAL.bark
const PLANK_PALE = mixHex(PAL.bark, PAL.parchment, 0.35)
const ROOF_RED = mixHex(PAL.berry, PAL.bark, 0.35)
const ROOF_GREY = mixHex(PAL.dusk, PAL.ink, 0.15)
const ROOF_TILE = mixHex(PAL.berry, PAL.ink, 0.3)
const STONE = mixHex(PAL.dusk, PAL.cream, 0.3)
const BRICK = mixHex(PAL.berry, PAL.bark, 0.5)
const IRON = mixHex(PAL.dusk, PAL.cream, 0.38)
const BRASS = mixHex(PAL.lantern, PAL.bark, 0.4)
const GLASS = mixHex(PAL.sky, PAL.cream, 0.3)
const HAY = mixHex(PAL.lantern, PAL.parchment, 0.45)
const CLOTH = PAL.parchment
const INDIGO = mixHex(PAL.sky, PAL.dusk, 0.65)
const CHOC = mixHex(PAL.bark, PAL.ink, 0.15)
const EMBER = mixHex(PAL.lantern, PAL.berry, 0.35)

/* ------------------------------------------------------------------ *
 * Shared structural primitives
 * ------------------------------------------------------------------ */

/** The hard two-pixel shadow of `DESIGN.md` section 6, doubled. Never blurred. */
function castShadow(c: Ctx, x: number, y: number, w: number, h: number): void {
  rect(c, x + 4, y + 4, w, h, withAlpha(PAL.ink, 0.3))
}

/** Ground contact: a flat pool under a footprint so nothing floats. */
function seat(c: Ctx, x: number, y: number, w: number): void {
  rect(c, x, y, w, 2, withAlpha(PAL.ink, 0.28))
  rect(c, x + 2, y + 2, w - 4, 1, withAlpha(PAL.ink, 0.15))
}

/** Vertical boarding: the ramp, then a seam every four pixels with a lit left lip. */
function boarded(c: Ctx, x: number, y: number, w: number, h: number, r: Ramp): void {
  shadeRect(c, x, y, w, h, r)
  for (let bx = x + 5; bx < x + w - 2; bx += 5) {
    vline(c, bx, y + 2, h - 4, r.dark)
    vline(c, bx + 1, y + 2, h - 4, r.lit)
  }
}

/** Horizontal clapboard: courses with a lit top lip and a shadow beneath each. */
function clapboard(c: Ctx, x: number, y: number, w: number, h: number, r: Ramp): void {
  shadeRect(c, x, y, w, h, r)
  for (let by = y + 5; by < y + h - 2; by += 5) {
    hline(c, x + 2, by, w - 4, r.dark)
    hline(c, x + 2, by + 1, w - 4, r.lit)
  }
}

/** Coursed stone: staggered blocks with an ink joint and a lit top edge. */
function stonework(c: Ctx, x: number, y: number, w: number, h: number, seed: number): void {
  const r = ramp(STONE)
  shadeRect(c, x, y, w, h, r)
  let course = 0
  for (let by = y + 2; by < y + h - 2; by += 6) {
    hline(c, x + 1, by + 5, w - 2, r.ink)
    for (let bx = x + 2 + (course & 1 ? 6 : 0); bx < x + w - 3; bx += 12) {
      vline(c, bx, by, 5, r.ink)
      vline(c, bx + 1, by, 4, r.lit)
      if (artNoise(seed, bx + by) > 0.6) px(c, bx + 4, by + 2, r.dark)
    }
    course++
  }
}

/**
 * A pitched roof: `topW` wide at the ridge, `w` at the eaves, shingled in courses. The
 * left slope takes the light, the right slope falls away, and the ridge is ink.
 */
function pitched(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  topW: number,
  r: Ramp,
): void {
  const span = h > 1 ? h - 1 : 1
  for (let i = 0; i < h; i++) {
    const ww = Math.round(topW + ((w - topW) * i) / span)
    const xx = x + ((w - ww) >> 1)
    hline(c, xx, y + i, ww, r.mid)
    hline(c, xx, y + i, ww < 8 ? 1 : 3, r.lit)
    hline(c, xx + ww - (ww < 8 ? 1 : 2), y + i, ww < 8 ? 1 : 2, r.dark)
    px(c, xx - 1, y + i, PAL.ink)
    px(c, xx + ww, y + i, PAL.ink)
    // Shingle courses, offset every other row so they do not read as stripes.
    if (i % 4 === 3) {
      hline(c, xx + 1, y + i, ww - 2, r.dark)
      for (let sx = xx + 2 + ((i >> 2) & 1 ? 3 : 0); sx < xx + ww - 2; sx += 6) {
        px(c, sx, y + i - 1, r.dark)
      }
    }
  }
  hline(c, x + ((w - topW) >> 1) - 1, y - 1, topW + 2, PAL.ink)
  hline(c, x + ((w - topW) >> 1), y - 2, topW, r.lit)
  hline(c, x, y + h, w, PAL.ink)
}

/** A flat overhanging eave board under a roof, with its own shadow on the wall. */
function eave(c: Ctx, x: number, y: number, w: number, r: Ramp): void {
  rect(c, x, y, w, 3, r.mid)
  hline(c, x, y, w, r.lit)
  hline(c, x, y + 2, w, PAL.ink)
  rect(c, x + 2, y + 3, w - 4, 2, withAlpha(PAL.ink, 0.3))
}

/** A plank door with two hinges, a handle and a lit top-left edge. */
function door(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = ramp(mixHex(PLANK, PAL.ink, 0.2))
  boarded(c, x, y, w, h, r)
  for (let i = 0; i < 2; i++) {
    const hy = y + 3 + i * (h - 8)
    rect(c, x + 1, hy, 5, 3, IRON)
    hline(c, x + 1, hy, 5, mixHex(IRON, PAL.cream, 0.4))
    px(c, x + 5, hy + 2, PAL.ink)
  }
  rect(c, x + w - 5, y + (h >> 1) - 1, 3, 3, BRASS)
  px(c, x + w - 5, y + (h >> 1) - 1, mixHex(BRASS, PAL.cream, 0.5))
}

/** A glazed window: ink frame, sky glass, a cream glint upper-left, bark bars. */
function pane(c: Ctx, x: number, y: number, w: number, h: number, lit: boolean): void {
  outline(c, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(c, x, y, w, h, lit ? mixHex(PAL.lantern, PAL.cream, 0.35) : GLASS)
  rect(c, x, y, w, 2, lit ? PAL.cream : mixHex(GLASS, PAL.cream, 0.5))
  rect(c, x, y + h - 2, w, 2, lit ? mixHex(PAL.lantern, PAL.bark, 0.3) : mixHex(GLASS, PAL.dusk, 0.4))
  vline(c, x + (w >> 1), y, h, PAL.bark)
  hline(c, x, y + (h >> 1), w, PAL.bark)
  rect(c, x + 1, y + 1, 2, 2, PAL.cream)
}

/** A chimney stack. `smoke` is drawn separately so it can sit above the roof line. */
function stack(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = ramp(BRICK)
  shadeRect(c, x, y, w, h, r)
  for (let by = y + 3; by < y + h; by += 4) hline(c, x + 1, by, w - 2, r.dark)
  rect(c, x - 1, y - 2, w + 2, 3, r.dark)
  hline(c, x - 1, y - 2, w + 2, r.lit)
  rect(c, x + 1, y - 1, w - 2, 1, PAL.ink)
}

/** Four frames of smoke, rising and spreading. Still when motion is reduced. */
function smoke(c: Ctx, x: number, y: number, beat: number): void {
  if (prefersReducedMotion()) {
    ellipse(c, x, y - 3, 2, 2, withAlpha(PAL.parchment, 0.4))
    return
  }
  const s = beat & 3
  for (let i = 0; i < 3; i++) {
    const t = i + s * 0.5
    const py = y - 3 - Math.round(t * 5)
    const pxx = x + Math.round(Math.sin((t + s) * 0.8) * 3)
    const rad = 1 + ((i + s) % 3 === 0 ? 1 : 0) + (i > 1 ? 1 : 0)
    ellipse(c, pxx, py, rad, rad, withAlpha(PAL.parchment, 0.42 - i * 0.1))
    ellipse(c, pxx - 1, py - 1, rad - 1, rad - 1, withAlpha(PAL.cream, 0.3))
  }
}

/** A post-and-rail fence run, left to right. */
function fence(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = ramp(PLANK_PALE)
  for (let bx = x; bx < x + w; bx += 12) {
    rect(c, bx, y, 3, h, r.ink)
    rect(c, bx, y, 2, h - 1, r.mid)
    vline(c, bx, y, h - 1, r.lit)
  }
  for (let i = 0; i < 2; i++) {
    const by = y + 2 + i * ((h - 6) < 4 ? 4 : h - 6)
    rect(c, x, by, w, 3, r.ink)
    rect(c, x, by, w, 2, r.mid)
    hline(c, x, by, w, r.lit)
  }
}

/** Chicken wire over a run: an ink mesh on two rails, with posts. */
function wireRun(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = ramp(PLANK_PALE)
  rect(c, x, y, w, 2, r.ink)
  rect(c, x, y, w, 1, r.lit)
  rect(c, x, y + h - 2, w, 2, r.ink)
  dither(c, x + 1, y + 2, w - 2, h - 4, withAlpha(PAL.ink, 0.45), 0, 2)
  dither(c, x + 1, y + 2, w - 2, h - 4, withAlpha(PAL.cream, 0.12), 1, 2)
  for (let bx = x; bx < x + w; bx += 16) {
    rect(c, bx, y, 2, h, r.ink)
    vline(c, bx, y, h - 1, r.mid)
  }
  rect(c, x + w - 2, y, 2, h, r.ink)
}

/** A boarded ramp up to a pop-hole, with cross-cleats for grip. */
function plankRamp(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = ramp(PLANK_PALE)
  for (let i = 0; i < h; i++) {
    const ww = Math.round(w - (w / 3) * (i / (h > 1 ? h - 1 : 1)))
    hline(c, x, y + i, ww, i === 0 ? r.lit : r.mid)
    px(c, x + ww, y + i, PAL.ink)
    if (i % 4 === 3) hline(c, x, y + i, ww, r.dark)
  }
  hline(c, x, y + h, w, PAL.ink)
}

/** A hanging lamp. Lit gives a warm pool; the pulse is on the beat. */
function lamp(c: Ctx, x: number, y: number, beat: number): void {
  const glow = prefersReducedMotion() ? 0.3 : 0.24 + ((beat & 1) === 0 ? 0.14 : 0)
  ellipse(c, x + 2, y + 6, 7, 6, withAlpha(PAL.lantern, glow * 0.5))
  rect(c, x, y, 5, 2, PAL.ink)
  rect(c, x + 1, y + 2, 3, 4, PAL.lantern)
  rect(c, x + 1, y + 2, 1, 4, PAL.cream)
  rect(c, x, y + 6, 5, 1, PAL.ink)
  vline(c, x + 2, y - 3, 3, IRON)
}

/** A weather vane, swinging one notch per beat. */
function vane(c: Ctx, x: number, y: number, beat: number): void {
  const s = prefersReducedMotion() ? 0 : beat & 3
  vline(c, x, y, 9, PAL.ink)
  vline(c, x, y, 5, IRON)
  const d = s === 1 ? 1 : s === 3 ? -1 : 0
  hline(c, x - 4, y + 1 + d, 4, PAL.ink)
  hline(c, x + 1, y + 1 - d, 4, PAL.ink)
  hline(c, x + 1, y - d, 3, IRON)
  px(c, x, y - 2, PAL.lantern)
}

/** Snow on the top edge of anything, per `docs/GRAPHICS.md` section 7. Winter only. */
function snowOn(c: Ctx, x: number, y: number, w: number, season: Season): void {
  if (season !== 'winter') return
  hline(c, x, y, w, PAL.cream)
  hline(c, x, y + 1, w, withAlpha(PAL.cream, 0.65))
  for (let i = 0; i < w; i += 3) {
    if (artNoise(x + i, y) > 0.5) px(c, x + i, y + 2, withAlpha(PAL.cream, 0.5))
  }
}

/** Ground dressing at a building's feet: blossom, dry grass, leaf fall, drift. */
function groundDressing(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  season: Season,
  seed: number,
): void {
  for (let i = 0; i < 7; i++) {
    const px0 = x + Math.floor(artNoise(seed, i) * w)
    const py0 = y - Math.floor(artNoise(seed, i + 40) * 4)
    switch (season) {
      case 'spring':
        px(c, px0, py0, PAL.grassLit)
        px(c, px0, py0 - 1, i % 3 === 0 ? PAL.cream : PAL.lantern)
        break
      case 'summer':
        px(c, px0, py0, PAL.grassLit)
        px(c, px0 + 1, py0, PAL.grass)
        break
      case 'fall':
        px(c, px0, py0, mixHex(PAL.lantern, PAL.bark, 0.3))
        px(c, px0 + 1, py0, mixHex(PAL.berry, PAL.bark, 0.4))
        break
      case 'winter':
        px(c, px0, py0, withAlpha(PAL.cream, 0.6))
        px(c, px0 + 1, py0, withAlpha(PAL.cream, 0.35))
        break
    }
  }
}

/* ------------------------------------------------------------------ *
 * The twenty buildings
 * ------------------------------------------------------------------ */

interface Box {
  x: number
  y: number
  w: number
  h: number
}

type BuildDraw = (c: Ctx, b: Box, season: Season, beat: number) => void

function farmhouse(c: Ctx, b: Box, season: Season, beat: number, big: boolean): void {
  const wallR = ramp(PLANK_PALE)
  const roofR = ramp(big ? ROOF_TILE : ROOF_RED)
  const eaves = Math.round(b.h * (big ? 0.42 : 0.36))
  const wallTop = b.y + eaves
  const floor = b.y + b.h - 6

  castShadow(c, b.x + 6, wallTop, b.w - 12, floor - wallTop)
  seat(c, b.x + 2, floor + 2, b.w - 4)

  // Footing, then the walls.
  stonework(c, b.x + 6, floor - 10, b.w - 12, 10, 11)
  clapboard(c, b.x + 8, wallTop, b.w - 16, floor - wallTop - 8, wallR)
  pitched(c, b.x, b.y + (big ? 6 : 10), b.w, eaves - (big ? 6 : 10), big ? 10 : 18, roofR)
  eave(c, b.x + 4, wallTop - 3, b.w - 8, ramp(PLANK))
  snowOn(c, b.x + ((b.w - (big ? 10 : 18)) >> 1), b.y + (big ? 3 : 7), big ? 10 : 18, season)

  // Chimney, and the smoke that says someone is home.
  const cx = b.x + b.w - 30
  stack(c, cx, b.y + (big ? 2 : 6), 12, eaves - (big ? 0 : 2))
  smoke(c, cx + 6, b.y + (big ? 0 : 4), beat)

  // Porch: its own little roof on two posts, with steps down to the ground.
  const px0 = b.x + 14
  const pw = 46
  pitched(c, px0 - 8, floor - 42, pw + 16, 8, pw + 2, ramp(big ? ROOF_TILE : ROOF_RED))
  rect(c, px0 - 4, floor - 34, pw + 8, 4, ramp(PLANK).ink)
  rect(c, px0 - 4, floor - 34, pw + 8, 2, ramp(PLANK).lit)
  for (const post of [px0, px0 + pw - 4]) {
    rect(c, post, floor - 30, 4, 30, ramp(PLANK).ink)
    rect(c, post, floor - 30, 3, 29, ramp(PLANK).mid)
    vline(c, post, floor - 30, 29, ramp(PLANK).lit)
    // A brace at the head of each post.
    for (let i = 0; i < 5; i++) hline(c, post === px0 ? post + 4 : post - 4 - i, floor - 30 + i, 5 - i, ramp(PLANK).dark)
  }
  door(c, px0 + 12, floor - 30, 20, 30)
  rect(c, px0 + 6, floor - 2, 32, 4, ramp(STONE).mid)
  hline(c, px0 + 6, floor - 2, 32, ramp(STONE).lit)

  // Windows: one storey, or two with a dormer once it is the big house.
  pane(c, b.x + b.w - 34, floor - 28, 18, 16, true)
  if (big) {
    pane(c, b.x + 16, wallTop + 6, 16, 14, false)
    pane(c, b.x + b.w - 34, wallTop + 6, 16, 14, true)
    // Dormer in the roof, with its own little pitch.
    const dx = b.x + (b.w >> 1) - 11
    rect(c, dx, b.y + 16, 22, 16, wallR.ink)
    clapboard(c, dx + 1, b.y + 17, 20, 15, wallR)
    pitched(c, dx - 3, b.y + 8, 28, 9, 8, roofR)
    pane(c, dx + 6, b.y + 20, 10, 9, true)
    vane(c, b.x + (b.w >> 1), b.y - 4, beat)
    lamp(c, px0 + 4, floor - 26, beat)
  } else {
    pane(c, b.x + 16, floor - 28, 14, 12, false)
  }
  groundDressing(c, b.x + 4, floor + 2, b.w - 8, season, 3)
}

function well(c: Ctx, b: Box, season: Season, beat: number): void {
  const cx = b.x + (b.w >> 1)
  const base = b.y + b.h - 8
  castShadow(c, b.x + 10, base - 18, b.w - 20, 18)
  seat(c, b.x + 6, base + 4, b.w - 12)

  // A round kerb with a real hole in it: the shaft mouth, then water down inside, then
  // the front wall of the kerb over the near lip.
  ellipse(c, cx, base - 14, 18, 9, PAL.ink)
  ellipse(c, cx, base - 14, 17, 8, ramp(STONE).dark)
  ellipse(c, cx, base - 13, 13, 6, mixHex(PAL.ink, PAL.sky, 0.2))
  ellipse(c, cx, base - 12, 11, 5, withAlpha(PAL.sky, 0.7))
  const shine = prefersReducedMotion() ? 0 : (beat & 3) - 1
  hline(c, cx - 6 + shine, base - 13, 5, withAlpha(PAL.cream, 0.65))
  hline(c, cx + 2 + shine, base - 10, 4, withAlpha(PAL.cream, 0.4))
  stonework(c, b.x + 6, base - 9, b.w - 12, 11, 5)
  ellipse(c, cx, base - 9, 18, 4, ramp(STONE).lit)
  ellipse(c, cx, base - 8, 17, 3, ramp(STONE).mid)
  ellipse(c, cx, base - 10, 13, 2, ramp(STONE).dark)

  // Two posts, a peaked shingle cap, the windlass and a bucket on the rope.
  for (const post of [b.x + 12, b.x + b.w - 16]) {
    rect(c, post, b.y + 14, 4, base - b.y - 22, ramp(PLANK).ink)
    rect(c, post, b.y + 14, 3, base - b.y - 23, ramp(PLANK).mid)
    vline(c, post, b.y + 14, base - b.y - 23, ramp(PLANK).lit)
  }
  pitched(c, b.x + 4, b.y + 4, b.w - 8, 12, 6, ramp(ROOF_RED))
  snowOn(c, b.x + (b.w >> 1) - 3, b.y + 1, 6, season)
  rect(c, b.x + 12, b.y + 20, b.w - 28, 4, ramp(PLANK).dark)
  hline(c, b.x + 12, b.y + 20, b.w - 28, ramp(PLANK).lit)
  vline(c, cx, b.y + 24, 10, mixHex(PAL.parchment, PAL.bark, 0.3))
  rect(c, cx - 4, b.y + 34, 9, 8, ramp(PLANK).ink)
  rect(c, cx - 3, b.y + 34, 7, 7, ramp(PLANK).mid)
  hline(c, cx - 3, b.y + 34, 7, IRON)
  hline(c, cx - 3, b.y + 38, 7, IRON)
  groundDressing(c, b.x + 4, base + 6, b.w - 8, season, 7)
}

function silo(c: Ctx, b: Box, season: Season, beat: number): void {
  const cx = b.x + (b.w >> 1)
  const base = b.y + b.h - 6
  const top = b.y + 14
  const halfW = (b.w >> 1) - 8
  castShadow(c, cx - halfW, top, halfW * 2, base - top)
  seat(c, cx - halfW - 2, base + 2, halfW * 2 + 4)

  // A tall cylinder: ink jamb, a lit column on the left, a dark one on the right.
  const r = ramp(mixHex(PAL.parchment, PAL.dusk, 0.3))
  rect(c, cx - halfW - 1, top, halfW * 2 + 2, base - top, r.ink)
  rect(c, cx - halfW, top, halfW * 2, base - top, r.mid)
  rect(c, cx - halfW, top, 4, base - top, r.lit)
  rect(c, cx - halfW + 1, top, 2, base - top, r.spec)
  rect(c, cx + halfW - 5, top, 5, base - top, r.dark)
  // Banding hoops, each with its own lit lip.
  for (let by = top + 6; by < base - 3; by += 9) {
    hline(c, cx - halfW, by, halfW * 2, mixHex(IRON, PAL.ink, 0.3))
    hline(c, cx - halfW, by + 1, halfW * 2, IRON)
    hline(c, cx - halfW, by + 1, 4, mixHex(IRON, PAL.cream, 0.5))
  }
  // Domed cap and a vent.
  ellipse(c, cx, top + 1, halfW + 2, 10, PAL.ink)
  ellipse(c, cx, top + 1, halfW + 1, 9, ramp(ROOF_GREY).mid)
  ellipse(c, cx - 3, top - 2, halfW - 4, 5, ramp(ROOF_GREY).lit)
  rect(c, cx - 3, top - 12, 6, 6, PAL.ink)
  rect(c, cx - 2, top - 11, 4, 5, IRON)
  snowOn(c, cx - halfW + 2, top - 8, halfW * 2 - 4, season)

  // Ladder up the lit side, and the hay chute at the foot.
  const lx = cx - halfW + 6
  vline(c, lx, top + 4, base - top - 8, PAL.ink)
  vline(c, lx + 4, top + 4, base - top - 8, PAL.ink)
  for (let by = top + 8; by < base - 6; by += 5) hline(c, lx, by, 5, IRON)
  rect(c, cx + 2, base - 18, 14, 18, ramp(PLANK).ink)
  boarded(c, cx + 3, base - 17, 12, 17, ramp(PLANK))
  rect(c, cx + 5, base - 8, 8, 8, HAY)
  for (let i = 0; i < 5; i++) px(c, cx + 5 + i, base - 9 + (i & 1), mixHex(HAY, PAL.cream, 0.5))
  if (!prefersReducedMotion() && (beat & 3) === 0) px(c, cx + 9, base - 20, HAY)
  groundDressing(c, b.x + 4, base + 4, b.w - 8, season, 13)
}

function stall(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 4
  castShadow(c, b.x + 6, b.y + 20, b.w - 12, base - b.y - 20)
  seat(c, b.x + 2, base + 2, b.w - 4)

  // Counter with a boarded front and a worn top.
  const counterTop = base - 26
  rect(c, b.x + 6, counterTop, b.w - 12, base - counterTop, ramp(PLANK).ink)
  boarded(c, b.x + 7, counterTop + 3, b.w - 14, base - counterTop - 3, ramp(PLANK))
  rect(c, b.x + 4, counterTop, b.w - 8, 4, ramp(PLANK_PALE).mid)
  hline(c, b.x + 4, counterTop, b.w - 8, ramp(PLANK_PALE).spec)
  hline(c, b.x + 4, counterTop + 3, b.w - 8, PAL.ink)

  // Two posts and a striped awning, fluttering at its hem.
  for (const post of [b.x + 6, b.x + b.w - 10]) {
    rect(c, post, b.y + 16, 4, counterTop - b.y - 16, ramp(PLANK).ink)
    rect(c, post, b.y + 16, 3, counterTop - b.y - 17, ramp(PLANK).mid)
    vline(c, post, b.y + 16, counterTop - b.y - 17, ramp(PLANK).lit)
  }
  const aw = b.w - 4
  const ax = b.x + 2
  for (let i = 0; i < 10; i++) {
    const stripe = i % 2 === 0 ? PAL.berry : PAL.cream
    const cw = Math.ceil(aw / 10)
    const sx = ax + i * cw
    rect(c, sx, b.y + 8, Math.min(cw, ax + aw - sx), 12, stripe)
    hline(c, sx, b.y + 8, Math.min(cw, ax + aw - sx), mixHex(stripe, PAL.cream, 0.4))
  }
  const flap = prefersReducedMotion() ? 0 : (beat & 1)
  hline(c, ax, b.y + 20, aw, PAL.ink)
  for (let i = 0; i < aw; i += 6) {
    rect(c, ax + i, b.y + 20, 3, 2 + ((i >> 1) + flap) % 2, i % 12 === 0 ? PAL.berry : PAL.cream)
  }
  snowOn(c, ax, b.y + 6, aw, season)

  // Crates of produce, a price slate and the cash box.
  for (let i = 0; i < 3; i++) {
    const cx0 = b.x + 12 + i * 24
    rect(c, cx0, counterTop - 10, 18, 10, ramp(PLANK).ink)
    rect(c, cx0 + 1, counterTop - 9, 16, 9, ramp(PLANK_PALE).mid)
    hline(c, cx0 + 1, counterTop - 9, 16, ramp(PLANK_PALE).lit)
    for (let k = 0; k < 3; k++) {
      const g = k === 1 ? PAL.berry : k === 0 ? PAL.lantern : PAL.leaf
      ellipse(c, cx0 + 4 + k * 5, counterTop - 11, 2, 2, PAL.ink)
      ellipse(c, cx0 + 4 + k * 5, counterTop - 11, 1, 1, g)
    }
  }
  rect(c, b.x + b.w - 26, counterTop - 16, 18, 14, PAL.ink)
  rect(c, b.x + b.w - 25, counterTop - 15, 16, 12, mixHex(PAL.dusk, PAL.ink, 0.3))
  for (let i = 0; i < 3; i++) hline(c, b.x + b.w - 22, counterTop - 12 + i * 3, 10, withAlpha(PAL.cream, 0.6))
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 17)
}

function barnStore(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const wallTop = b.y + 26
  castShadow(c, b.x + 6, wallTop, b.w - 12, base - wallTop)
  seat(c, b.x + 2, base + 2, b.w - 4)

  boarded(c, b.x + 6, wallTop, b.w - 12, base - wallTop, ramp(mixHex(PLANK, PAL.soil, 0.3)))
  pitched(c, b.x, b.y + 6, b.w, 20, b.w - 26, ramp(ROOF_GREY))
  snowOn(c, b.x + 12, b.y + 4, b.w - 24, season)
  eave(c, b.x + 3, wallTop - 3, b.w - 6, ramp(PLANK))

  // A sliding door on a rail, pushed part-open so the stock inside shows.
  const dy = base - 34
  rect(c, b.x + 10, dy - 4, b.w - 20, 3, IRON)
  hline(c, b.x + 10, dy - 4, b.w - 20, mixHex(IRON, PAL.cream, 0.4))
  rect(c, b.x + 12, dy, 30, 34, PAL.ink)
  rect(c, b.x + 13, dy + 1, 28, 33, mixHex(PAL.ink, PAL.bark, 0.25))
  for (let i = 0; i < 3; i++) {
    rect(c, b.x + 16 + i * 8, dy + 6, 6, 8, mixHex(HAY, PAL.bark, 0.3))
    rect(c, b.x + 16 + i * 8, dy + 18, 6, 10, ramp(PLANK_PALE).dark)
  }
  door(c, b.x + b.w - 46, dy, 32, 34)
  rect(c, b.x + b.w - 48, dy, 3, 34, IRON)

  // A loading platform and two sacks waiting on it.
  rect(c, b.x + 4, base - 6, b.w - 8, 6, ramp(PLANK).ink)
  rect(c, b.x + 5, base - 6, b.w - 10, 4, ramp(PLANK_PALE).mid)
  hline(c, b.x + 5, base - 6, b.w - 10, ramp(PLANK_PALE).lit)
  for (let i = 0; i < 2; i++) {
    const sx = b.x + 10 + i * 16
    ellipse(c, sx, base - 11, 6, 5, PAL.ink)
    ellipse(c, sx, base - 11, 5, 4, mixHex(PAL.soil, PAL.parchment, 0.4))
    ellipse(c, sx - 2, base - 13, 2, 1, PAL.cream)
  }
  if (!prefersReducedMotion() && (beat & 3) === 1) px(c, b.x + 20, base - 18, withAlpha(PAL.cream, 0.4))
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 19)
}

/** The three coops: same 4x3 footprint, visibly more building at every tier. */
function coop(c: Ctx, b: Box, season: Season, beat: number, tier: number): void {
  const base = b.y + b.h - 6
  // Each tier fills more of its footprint and stands taller in it: a bigger house and a
  // bigger yard, not the same shed in another colour.
  const margin = tier === 1 ? 14 : tier === 2 ? 8 : 2
  const total = b.w - margin * 2
  const runW = Math.round(total * 0.36)
  const bodyW = total - runW - 2
  const bodyX = b.x + margin
  const wallTop = b.y + (tier === 1 ? 38 : tier === 2 ? 28 : 18)
  const ridge = b.y + (tier === 1 ? 22 : tier === 2 ? 10 : 2)
  castShadow(c, bodyX, wallTop, bodyW, base - wallTop)
  seat(c, b.x + 2, base + 2, b.w - 4)

  // Tier three stands on a stone footing; the first two sit in the dirt.
  if (tier === 3) stonework(c, bodyX - 2, base - 14, bodyW + 4, 14, 23)
  boarded(c, bodyX, wallTop, bodyW, base - wallTop - (tier === 3 ? 12 : 0), ramp(PLANK_PALE))
  pitched(
    c,
    bodyX - 6,
    ridge,
    bodyW + 12,
    wallTop - ridge,
    tier === 1 ? bodyW - 16 : tier === 2 ? 16 : 10,
    ramp(tier === 3 ? ROOF_TILE : ROOF_RED),
  )
  snowOn(c, bodyX, ridge - 2, bodyW, season)
  eave(c, bodyX - 4, wallTop - 3, bodyW + 8, ramp(PLANK))

  // The pop-hole, at the run end of the wall, with its ramp running down into the yard.
  const holeX = bodyX + bodyW - 20
  rect(c, holeX - 2, base - 26, 18, 4, ramp(PLANK).mid)
  hline(c, holeX - 2, base - 26, 18, ramp(PLANK).lit)
  rect(c, holeX - 1, base - 22, 16, 18, PAL.ink)
  rect(c, holeX, base - 21, 14, 17, mixHex(PAL.ink, PAL.bark, 0.22))
  // A hen-sized hole is dark inside, with the light only just reaching the threshold.
  hline(c, holeX, base - 5, 14, mixHex(PAL.bark, PAL.parchment, 0.3))
  hline(c, holeX, base - 4, 14, ramp(PLANK).dark)
  plankRamp(c, holeX + 10, base - 16, 24, 16)

  // Nest boxes, hung off the far wall and projecting out of it with a lift-up lid.
  const nx = bodyX - 8
  rect(c, nx, wallTop + 10, 22, 18, ramp(PLANK).ink)
  boarded(c, nx + 1, wallTop + 13, 20, 15, ramp(mixHex(PLANK, PAL.soil, 0.35)))
  rect(c, nx - 2, wallTop + 8, 26, 5, ramp(PLANK).mid)
  hline(c, nx - 2, wallTop + 8, 26, ramp(PLANK).lit)
  hline(c, nx - 2, wallTop + 12, 26, PAL.ink)
  rect(c, nx + 4, wallTop + 18, 6, 8, HAY)
  rect(c, nx + 13, wallTop + 18, 6, 8, HAY)
  ellipse(c, nx + 7, wallTop + 19, 2, 1, PAL.cream)

  // The run: wire on rails, bigger and better kept at every tier.
  const runX = bodyX + bodyW + 2
  const runH = tier === 1 ? 26 : tier === 2 ? 34 : 42
  wireRun(c, runX, base - runH, runW, runH)
  for (let i = 0; i < (tier === 1 ? 1 : tier === 2 ? 2 : 3); i++) {
    // Feed and water in the run, so it reads as kept rather than empty.
    ellipse(c, runX + 9 + i * 13, base - 3, 5, 2, PAL.ink)
    ellipse(c, runX + 9 + i * 13, base - 4, 4, 1, i === 1 ? withAlpha(PAL.sky, 0.8) : HAY)
  }
  if (tier >= 2) {
    vane(c, bodyX + (bodyW >> 1), ridge - 12, beat)
    // A perch rail across the run.
    rect(c, runX + 4, base - runH + 10, runW - 8, 3, ramp(PLANK).ink)
    hline(c, runX + 4, base - runH + 10, runW - 8, ramp(PLANK).lit)
  }
  if (tier === 3) {
    pane(c, bodyX + 8, wallTop + 12, 16, 14, true)
    lamp(c, holeX - 6, base - 32, beat)
    // The auto-feeder hopper the deluxe tier pays for, bracketed to the run and
    // dropping feed through a chute into the trough below.
    const hx = runX + runW - 16
    rect(c, hx - 1, base - runH - 15, 16, 13, ramp(IRON).ink)
    rect(c, hx, base - runH - 14, 14, 11, ramp(IRON).mid)
    hline(c, hx, base - runH - 14, 14, ramp(IRON).spec)
    rect(c, hx + 2, base - runH - 12, 10, 4, HAY)
    for (let i = 0; i < 5; i++) hline(c, hx + i, base - runH - 3 + i, 14 - i * 2, ramp(IRON).dark)
    vline(c, hx + 6, base - runH + 2, 6, ramp(IRON).mid)
    ellipse(c, hx + 6, base - runH + 9, 5, 2, PAL.ink)
    ellipse(c, hx + 6, base - runH + 9, 4, 1, HAY)
  }
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 29 + tier)
}

/** The three barns: same 5x4 footprint, and a great deal more barn at each tier. */
function barn(c: Ctx, b: Box, season: Season, beat: number, tier: number): void {
  const base = b.y + b.h - 6
  // The footprint never changes, so the tier shows as a bigger barn standing in it.
  const margin = tier === 1 ? 18 : tier === 2 ? 11 : 4
  const eaves = b.y + (tier === 1 ? 50 : tier === 2 ? 40 : 30)
  const bodyX = b.x + margin
  const bodyW = b.w - margin * 2
  castShadow(c, bodyX, eaves, bodyW, base - eaves)
  seat(c, b.x + 2, base + 2, b.w - 4)

  if (tier === 3) stonework(c, bodyX - 3, base - 16, bodyW + 6, 16, 31)
  boarded(c, bodyX, eaves, bodyW, base - eaves, ramp(ROOF_RED))
  // Gambrel: a shallow upper pitch over a steep lower one is what says barn.
  const gable = b.y + (tier === 1 ? 22 : tier === 2 ? 16 : 10)
  pitched(c, bodyX - 8, gable, bodyW + 16, eaves - gable, bodyW - 20, ramp(ROOF_GREY))
  pitched(c, bodyX + 4, gable - 12, bodyW - 8, 12, 14, ramp(ROOF_GREY))
  snowOn(c, bodyX + 10, gable - 14, bodyW - 20, season)
  eave(c, bodyX - 6, eaves - 3, bodyW + 12, ramp(PLANK))

  // Hayloft door in the gable with a hoist beam, and hay showing through.
  const lx = bodyX + (bodyW >> 1) - 11
  rect(c, lx, gable + 2, 22, 20, PAL.ink)
  rect(c, lx + 1, gable + 3, 20, 18, mixHex(PAL.ink, PAL.bark, 0.3))
  rect(c, lx + 3, gable + 10, 16, 11, HAY)
  for (let i = 0; i < 6; i++) px(c, lx + 4 + i * 3, gable + 9 + (i & 1), mixHex(HAY, PAL.cream, 0.5))
  rect(c, lx + 8, gable - 6, 6, 8, ramp(PLANK).mid)
  hline(c, lx + 8, gable - 6, 6, ramp(PLANK).lit)

  // Doors a cow fits through: double, X-braced, with a lit upper-left leaf.
  const dw = tier === 1 ? 44 : tier === 2 ? 54 : 64
  const dx = bodyX + ((bodyW - dw) >> 1)
  const dh = tier === 1 ? 42 : tier === 2 ? 48 : 56
  const dy = base - dh
  rect(c, dx - 2, dy - 2, dw + 4, dh + 2, ramp(PLANK).ink)
  for (let i = 0; i < 2; i++) {
    const hx = dx + i * (dw >> 1)
    boarded(c, hx, dy, dw >> 1, dh, ramp(mixHex(PLANK, PAL.ink, i === 0 ? 0.05 : 0.2)))
    // The brace.
    for (let k = 0; k < dh; k++) {
      const bxp = hx + Math.round((k * ((dw >> 1) - 4)) / dh)
      rect(c, i === 0 ? bxp : hx + (dw >> 1) - 4 - (bxp - hx), dy + k, 3, 1, ramp(PLANK_PALE).mid)
    }
    rect(c, hx, dy, dw >> 1, 3, ramp(PLANK_PALE).lit)
    rect(c, hx, dy + dh - 3, dw >> 1, 3, ramp(PLANK_PALE).dark)
  }
  vline(c, dx + (dw >> 1), dy, dh, PAL.ink)
  rect(c, dx + (dw >> 1) - 5, dy + (dh >> 1), 4, 3, BRASS)
  rect(c, dx + (dw >> 1) + 2, dy + (dh >> 1), 4, 3, BRASS)

  if (tier >= 2) {
    pane(c, bodyX + 8, eaves + 10, 16, 14, false)
    pane(c, bodyX + bodyW - 24, eaves + 10, 16, 14, true)
    // A cupola on the ridge, with the vane on top of it.
    const cux = bodyX + (bodyW >> 1) - 8
    const cuy = gable - 24
    rect(c, cux, cuy, 16, 12, ramp(PLANK_PALE).ink)
    boarded(c, cux + 1, cuy + 1, 14, 10, ramp(PLANK_PALE))
    pitched(c, cux - 3, cuy - 8, 22, 8, 6, ramp(ROOF_GREY))
    vane(c, cux + 8, cuy - 16, beat)
  }
  if (tier === 3) {
    lamp(c, dx - 12, dy + 4, beat)
    lamp(c, dx + dw + 8, dy + 4, beat)
    // Paddock rail and a water trough — the deluxe barn keeps a yard.
    fence(c, b.x + 2, base - 14, 26, 14)
    fence(c, b.x + b.w - 28, base - 14, 26, 14)
    rect(c, b.x + b.w - 30, base - 8, 22, 8, ramp(PLANK).ink)
    rect(c, b.x + b.w - 29, base - 7, 20, 6, ramp(PLANK_PALE).dark)
    rect(c, b.x + b.w - 28, base - 6, 18, 3, withAlpha(PAL.sky, 0.8))
    hline(c, b.x + b.w - 28, base - 6, 8, withAlpha(PAL.cream, 0.6))
  }
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 37 + tier)
}

function apiary(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 8
  castShadow(c, b.x + 12, base - 32, b.w - 24, 32)
  seat(c, b.x + 8, base + 2, b.w - 16)

  // Two hives on one stand — the apiary holds six colonies, not one box of bees.
  rect(c, b.x + 4, base - 6, b.w - 8, 6, ramp(PLANK).ink)
  rect(c, b.x + 5, base - 6, b.w - 10, 4, ramp(PLANK).mid)
  hline(c, b.x + 5, base - 6, b.w - 10, ramp(PLANK).lit)
  const hw = 24
  const stacks: ReadonlyArray<readonly [number, number]> = [
    [b.x + 5, 3],
    [b.x + 34, 2],
  ]
  for (const stack2 of stacks) {
    const hx = stack2[0]
    const boxes = stack2[1]
    for (let i = 0; i < boxes; i++) {
      const hy = base - 16 - i * 10
      const r = ramp(mixHex(PAL.parchment, PAL.lantern, 0.12 + i * 0.12))
      rect(c, hx - 1, hy - 1, hw + 2, 11, r.ink)
      rect(c, hx, hy, hw, 10, r.mid)
      rect(c, hx, hy, hw, 2, r.lit)
      rect(c, hx, hy + 8, hw, 2, r.dark)
      rect(c, hx + 1, hy + 1, 3, 2, r.spec)
      if (i === 0) {
        // Entrance slot and the landing board the bees walk in on.
        rect(c, hx + 5, hy + 6, hw - 10, 3, PAL.ink)
        rect(c, hx - 3, hy + 9, hw + 6, 3, r.dark)
        hline(c, hx - 3, hy + 9, hw + 6, r.lit)
      }
    }
    const lidY = base - 16 - (boxes - 1) * 10 - 5
    rect(c, hx - 3, lidY, hw + 6, 5, ramp(ROOF_GREY).ink)
    rect(c, hx - 2, lidY, hw + 4, 4, ramp(ROOF_GREY).mid)
    hline(c, hx - 2, lidY, hw + 4, ramp(ROOF_GREY).lit)
    ellipse(c, hx + (hw >> 1), lidY - 2, 4, 2, ramp(STONE).mid)
    ellipse(c, hx + (hw >> 1) - 1, lidY - 3, 2, 1, ramp(STONE).lit)
    snowOn(c, hx - 2, lidY - 1, hw + 4, season)
  }

  // Bees on the wing, and clover for them to work.
  if (!prefersReducedMotion()) {
    for (let i = 0; i < 3; i++) {
      const t = beat + i * 5
      const bx0 = b.x + 8 + ((t * 3 + i * 11) % (b.w - 16))
      const by0 = base - 26 - ((t + i * 3) % 14)
      px(c, bx0, by0, PAL.lantern)
      px(c, bx0 + 1, by0, PAL.ink)
    }
  }
  groundDressing(c, b.x + 2, base + 4, b.w - 4, season, 41)
}

function stable(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const eaves = b.y + 30
  castShadow(c, b.x + 6, eaves, b.w - 12, base - eaves)
  seat(c, b.x + 2, base + 2, b.w - 4)

  boarded(c, b.x + 6, eaves, b.w - 12, base - eaves, ramp(mixHex(PLANK, PAL.soil, 0.25)))
  pitched(c, b.x, b.y + 8, b.w, 22, b.w - 30, ramp(ROOF_GREY))
  snowOn(c, b.x + 14, b.y + 6, b.w - 28, season)
  eave(c, b.x + 3, eaves - 3, b.w - 6, ramp(PLANK))

  // Two dutch doors with their top halves latched open, hay showing in the dark.
  for (let i = 0; i < 2; i++) {
    const dx = b.x + 14 + i * ((b.w - 28) >> 1)
    const dw = 30
    rect(c, dx - 1, eaves + 5, dw + 2, base - eaves - 5, PAL.ink)
    rect(c, dx, eaves + 6, dw, 20, mixHex(PAL.ink, PAL.bark, 0.22))
    rect(c, dx + 3, eaves + 14, dw - 6, 12, HAY)
    boarded(c, dx, eaves + 26, dw, base - eaves - 26, ramp(mixHex(PLANK, PAL.ink, 0.15)))
    rect(c, dx - 6, eaves + 6, 6, 20, ramp(PLANK_PALE).mid)
    hline(c, dx - 6, eaves + 6, 6, ramp(PLANK_PALE).lit)
    rect(c, dx + dw - 6, eaves + 30, 5, 3, BRASS)
  }

  // A horseshoe over the doors for luck, and a hay bale at the corner.
  const sx = b.x + (b.w >> 1) - 4
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.15 + i * 0.1)
    px(c, sx + 4 - Math.round(Math.cos(a) * 5), eaves + 2 - Math.round(Math.sin(a) * 5), IRON)
  }
  rect(c, b.x + 2, base - 14, 18, 14, ramp(mixHex(HAY, PAL.bark, 0.25)).ink)
  rect(c, b.x + 3, base - 13, 16, 13, HAY)
  hline(c, b.x + 3, base - 13, 16, mixHex(HAY, PAL.cream, 0.5))
  for (let i = 0; i < 2; i++) hline(c, b.x + 3, base - 10 + i * 5, 16, mixHex(HAY, PAL.bark, 0.4))
  lamp(c, b.x + b.w - 14, eaves + 4, beat)
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 43)
}

function pond(c: Ctx, b: Box, season: Season, beat: number): void {
  const cx = b.x + (b.w >> 1)
  const cy = b.y + (b.h >> 1) + 4
  const rx = (b.w >> 1) - 6
  const ry = (b.h >> 1) - 8
  const cold = season === 'winter'

  // Stone rim, then the water, then the shoreline shadow along the top edge.
  ellipse(c, cx, cy, rx + 4, ry + 4, PAL.ink)
  ellipse(c, cx, cy, rx + 3, ry + 3, ramp(STONE).mid)
  ellipse(c, cx - 2, cy - 2, rx + 1, ry + 1, ramp(STONE).lit)
  ellipse(c, cx, cy, rx, ry, PAL.ink)
  const water = cold ? mixHex(PAL.sky, PAL.cream, 0.3) : PAL.sky
  ellipse(c, cx, cy, rx - 1, ry - 1, water)
  ellipse(c, cx, cy - 2, rx - 1, ry - 3, mixHex(water, PAL.dusk, 0.3))
  ellipse(c, cx, cy + 1, rx - 3, ry - 3, water)
  // Stones set into the rim.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const sx = cx + Math.round(Math.cos(a) * (rx + 2))
    const sy = cy + Math.round(Math.sin(a) * (ry + 2))
    ellipse(c, sx, sy, 3, 2, ramp(STONE).dark)
    ellipse(c, sx - 1, sy - 1, 2, 1, ramp(STONE).lit)
  }

  // Deep water in the middle, so the pond has a floor rather than being a blue disc.
  ellipse(c, cx + 2, cy + 2, rx - 8, ry - 6, mixHex(water, PAL.dusk, 0.4))
  ellipse(c, cx + 2, cy + 2, rx - 12, ry - 9, mixHex(water, PAL.dusk, 0.55))

  const s = prefersReducedMotion() ? 0 : beat & 3
  for (let i = 0; i < 5; i++) {
    const wy = cy - ry + 6 + i * 5
    const ww = rx - 6 - Math.abs(i - 2) * 3
    hline(c, cx - ww + ((s * 2 + i * 3) % 9), wy, 7, withAlpha(PAL.cream, 0.5))
    hline(c, cx + 3 + ((s + i * 2) % 6), wy + 2, 4, withAlpha(PAL.cream, 0.28))
  }
  // Reeds standing in the shallows at the far bank, not floating over it.
  for (let i = 0; i < 10; i++) {
    // Set round the back arc of the bank, following the rim rather than in one clump.
    const a = Math.PI * (1.08 + i * 0.093)
    const rx0 = cx + Math.round(Math.cos(a) * rx * 0.86)
    const foot = cy + Math.round(Math.sin(a) * ry * 0.86) + 4
    const h = 9 + ((i * 5) % 7)
    rect(c, rx0, foot - h, 2, h, PAL.leaf)
    vline(c, rx0, foot - h + 2, h - 2, PAL.grassLit)
    vline(c, rx0 + 1, foot - h, h, mixHex(PAL.leaf, PAL.ink, 0.3))
    if (i % 2 === 0) rect(c, rx0, foot - h - 4, 2, 5, mixHex(PAL.bark, PAL.lantern, 0.3))
    ellipse(c, rx0, foot, 2, 1, withAlpha(PAL.cream, 0.45))
  }
  // Lily pads with a notch cut out of each, and one in flower.
  for (let i = 0; i < 4; i++) {
    const px0 = cx - rx + 12 + i * 12
    const py0 = cy + 3 + (i & 1) * 6
    ellipse(c, px0, py0, 6, 4, PAL.ink)
    ellipse(c, px0, py0, 5, 3, PAL.leaf)
    ellipse(c, px0 - 2, py0 - 1, 3, 1, PAL.grassLit)
    rect(c, px0 + 2, py0, 4, 2, water)
    if (i === 1) {
      ellipse(c, px0 - 1, py0 - 3, 2, 2, PAL.cream)
      px(c, px0 - 1, py0 - 3, PAL.lantern)
    }
  }
  // A jetty on the lit side, on two piles, with a mooring post.
  rect(c, cx - rx - 6, cy - 6, 22, 9, ramp(PLANK).ink)
  boarded(c, cx - rx - 5, cy - 5, 20, 7, ramp(PLANK_PALE))
  for (let i = 0; i < 2; i++) rect(c, cx - rx - 2 + i * 12, cy + 3, 3, 6, ramp(PLANK).dark)
  rect(c, cx - rx + 12, cy - 12, 4, 8, ramp(PLANK).ink)
  rect(c, cx - rx + 12, cy - 12, 3, 7, ramp(PLANK).mid)
  if (cold) {
    ellipse(c, cx, cy + ry - 4, rx - 6, 3, withAlpha(PAL.cream, 0.45))
    ellipse(c, cx - rx + 8, cy, 4, 3, withAlpha(PAL.cream, 0.4))
  }
  groundDressing(c, b.x + 2, cy + ry + 6, b.w - 4, season, 47)
}

function sawmillYard(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const roofY = b.y + 10
  castShadow(c, b.x + 8, roofY, b.w - 16, base - roofY)
  seat(c, b.x + 2, base + 2, b.w - 4)

  // An open shed: four posts, a roof, no walls, so the work shows.
  for (const post of [b.x + 8, b.x + b.w - 12]) {
    rect(c, post, roofY + 12, 4, base - roofY - 12, ramp(PLANK).ink)
    rect(c, post, roofY + 12, 3, base - roofY - 13, ramp(PLANK).mid)
    vline(c, post, roofY + 12, base - roofY - 13, ramp(PLANK).lit)
  }
  rect(c, b.x + 4, base - 20, b.w - 8, 3, ramp(PLANK).dark)
  pitched(c, b.x + 2, roofY, b.w - 4, 14, b.w - 30, ramp(ROOF_GREY))
  snowOn(c, b.x + 14, roofY - 2, b.w - 28, season)

  // The blade, on a bench, with a log fed against it.
  const bx0 = b.x + (b.w >> 1)
  const by0 = base - 16
  rect(c, b.x + 12, by0, b.w - 24, 5, ramp(PLANK).ink)
  rect(c, b.x + 13, by0, b.w - 26, 3, ramp(PLANK_PALE).mid)
  const s = prefersReducedMotion() ? 0 : beat & 3
  ellipse(c, bx0, by0 - 6, 12, 12, PAL.ink)
  ellipse(c, bx0, by0 - 6, 10, 10, mixHex(IRON, PAL.ink, 0.25))
  ellipse(c, bx0 - 1, by0 - 7, 7, 7, IRON)
  ellipse(c, bx0, by0 - 6, 5, 5, mixHex(IRON, PAL.ink, 0.35))
  ellipse(c, bx0, by0 - 6, 2, 2, PAL.ink)
  // Teeth, stepping round the rim on the beat.
  for (let i = 0; i < 12; i++) {
    const a = ((i + s * 0.25) / 12) * Math.PI * 2
    const tx = bx0 + Math.round(Math.cos(a) * 11)
    const ty = by0 - 6 + Math.round(Math.sin(a) * 11)
    rect(c, tx, ty, 2, 2, PAL.ink)
    px(c, tx, ty, mixHex(IRON, PAL.cream, 0.6))
  }
  // The log on the bed, cut end toward the light so the rings show.
  rect(c, bx0 - 22, by0 - 11, 16, 11, ramp(PAL.bark).ink)
  rect(c, bx0 - 21, by0 - 10, 15, 9, ramp(PAL.bark).mid)
  hline(c, bx0 - 21, by0 - 10, 15, ramp(PAL.bark).lit)
  ellipse(c, bx0 - 21, by0 - 6, 3, 5, ramp(PAL.bark).ink)
  ellipse(c, bx0 - 21, by0 - 6, 2, 4, mixHex(PAL.bark, PAL.parchment, 0.4))
  ellipse(c, bx0 - 21, by0 - 6, 1, 2, mixHex(PAL.bark, PAL.ink, 0.2))

  // A plank stack and sawdust on the ground.
  for (let i = 0; i < 4; i++) {
    rect(c, b.x + 6, base - 6 - i * 4, 26, 4, ramp(PLANK_PALE).ink)
    rect(c, b.x + 7, base - 6 - i * 4, 24, 3, ramp(PLANK_PALE).mid)
    hline(c, b.x + 7, base - 6 - i * 4, 24, ramp(PLANK_PALE).lit)
  }
  for (let i = 0; i < 8; i++) {
    px(c, bx0 + 6 + ((i * 5) % 18), base - 2 - (i & 3), mixHex(HAY, PAL.cream, 0.4))
  }
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 53)
}

function bakeryShop(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const wallTop = b.y + 26
  castShadow(c, b.x + 6, wallTop, b.w - 12, base - wallTop)
  seat(c, b.x + 2, base + 2, b.w - 4)

  stonework(c, b.x + 6, wallTop, b.w - 12, base - wallTop, 59)
  pitched(c, b.x, b.y + 6, b.w, 20, b.w - 34, ramp(ROOF_TILE))
  snowOn(c, b.x + 16, b.y + 4, b.w - 32, season)
  eave(c, b.x + 3, wallTop - 3, b.w - 6, ramp(PLANK))
  stack(c, b.x + b.w - 22, b.y + 2, 12, 24)
  smoke(c, b.x + b.w - 16, b.y, beat)

  // A shopfront: a wide warm window with loaves on the sill, a door, an awning.
  const winX = b.x + 12
  const winW = b.w - 60
  pane(c, winX, base - 34, winW, 22, true)
  for (let i = 0; i < 3; i++) {
    ellipse(c, winX + 8 + i * 12, base - 16, 5, 3, mixHex(PAL.lantern, PAL.bark, 0.35))
    ellipse(c, winX + 7 + i * 12, base - 17, 3, 1, mixHex(PAL.lantern, PAL.cream, 0.6))
  }
  rect(c, winX - 2, base - 12, winW + 4, 3, ramp(PLANK_PALE).mid)
  hline(c, winX - 2, base - 12, winW + 4, ramp(PLANK_PALE).lit)
  door(c, b.x + b.w - 42, base - 36, 24, 36)
  for (let i = 0; i < 8; i++) {
    rect(c, winX - 4 + i * 6, base - 40, 6, 5, i % 2 === 0 ? PAL.berry : PAL.cream)
  }
  hline(c, winX - 4, base - 35, 48, PAL.ink)
  // The sign: a painted loaf on a hanging board.
  rect(c, b.x + b.w - 40, base - 48, 22, 12, ramp(PLANK).ink)
  rect(c, b.x + b.w - 39, base - 47, 20, 10, ramp(PLANK_PALE).mid)
  ellipse(c, b.x + b.w - 29, base - 42, 6, 3, mixHex(PAL.lantern, PAL.bark, 0.3))
  ellipse(c, b.x + b.w - 30, base - 43, 4, 1, PAL.cream)
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 59)
}

function workshop(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const wallTop = b.y + 22
  castShadow(c, b.x + 6, wallTop, b.w - 12, base - wallTop)
  seat(c, b.x + 2, base + 2, b.w - 4)

  boarded(c, b.x + 6, wallTop, b.w - 12, base - wallTop, ramp(mixHex(PLANK_PALE, PAL.dusk, 0.12)))
  pitched(c, b.x, b.y + 4, b.w, 18, b.w - 24, ramp(ROOF_GREY))
  snowOn(c, b.x + 12, b.y + 2, b.w - 24, season)
  eave(c, b.x + 3, wallTop - 3, b.w - 6, ramp(PLANK))

  // A shutter propped open over the bench, so you can see the work.
  const sx = b.x + 10
  const sw = b.w - 42
  rect(c, sx - 1, wallTop + 9, sw + 2, 26, PAL.ink)
  rect(c, sx, wallTop + 10, sw, 24, mixHex(PAL.ink, PAL.dusk, 0.3))
  rect(c, sx - 3, wallTop + 2, sw + 6, 8, ramp(PLANK_PALE).ink)
  boarded(c, sx - 2, wallTop + 3, sw + 4, 6, ramp(PLANK_PALE))
  // Bench, vice, and tools on the pegboard behind.
  rect(c, sx + 1, wallTop + 26, sw - 2, 4, ramp(PLANK_PALE).mid)
  hline(c, sx + 1, wallTop + 26, sw - 2, ramp(PLANK_PALE).lit)
  rect(c, sx + 3, wallTop + 22, 6, 4, IRON)
  rect(c, sx + 3, wallTop + 22, 6, 1, mixHex(IRON, PAL.cream, 0.5))
  for (let i = 0; i < 3; i++) {
    vline(c, sx + 14 + i * 6, wallTop + 13, 8, IRON)
    rect(c, sx + 13 + i * 6, wallTop + 13, 3, 2, i === 1 ? BRASS : PAL.bark)
  }
  door(c, b.x + b.w - 30, base - 34, 22, 34)

  // A grindstone outside, turning on the beat.
  const gx = b.x + 14
  const gy = base - 12
  const s = prefersReducedMotion() ? 0 : beat & 3
  rect(c, gx - 8, gy + 4, 20, 8, ramp(PLANK).ink)
  rect(c, gx - 7, gy + 5, 18, 6, ramp(PLANK).mid)
  ellipse(c, gx, gy, 8, 8, PAL.ink)
  ellipse(c, gx, gy, 7, 7, ramp(STONE).mid)
  ellipse(c, gx - 2, gy - 2, 4, 4, ramp(STONE).lit)
  for (let i = 0; i < 4; i++) {
    const a = ((i + s * 0.25) / 4) * Math.PI * 2
    px(c, gx + Math.round(Math.cos(a) * 5), gy + Math.round(Math.sin(a) * 5), ramp(STONE).dark)
  }
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 61)
}

function greenhouse(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const eaves = b.y + 34
  castShadow(c, b.x + 6, eaves, b.w - 12, base - eaves)
  seat(c, b.x + 2, base + 2, b.w - 4)

  // A knee wall of brick, then glass all the way up.
  stonework(c, b.x + 6, base - 14, b.w - 12, 14, 67)
  rect(c, b.x + 6, eaves, b.w - 12, base - eaves - 12, PAL.ink)
  rect(c, b.x + 7, eaves + 1, b.w - 14, base - eaves - 14, withAlpha(GLASS, 0.85))
  // Benches of plants showing through the glass — the reason the building exists.
  rect(c, b.x + 10, base - 18, b.w - 20, 3, withAlpha(PAL.bark, 0.75))
  for (let i = 0; i < 5; i++) {
    const px0 = Math.round(b.x + 16 + i * ((b.w - 32) / 4))
    rect(c, px0 - 5, base - 26, 10, 8, withAlpha(PAL.leaf, 0.85))
    rect(c, px0 - 5, base - 26, 4, 4, withAlpha(PAL.grassLit, 0.9))
    ellipse(c, px0, base - 30, 4, 4, withAlpha(PAL.leaf, 0.85))
    ellipse(c, px0 - 2, base - 32, 2, 1, withAlpha(PAL.grassLit, 0.9))
    if (i % 2 === 0) ellipse(c, px0 + 2, base - 30, 1, 1, withAlpha(PAL.berry, 0.9))
    if (i % 2 === 1) ellipse(c, px0 + 2, base - 29, 1, 1, withAlpha(PAL.lantern, 0.9))
  }
  for (let bx = b.x + 14; bx < b.x + b.w - 12; bx += 14) {
    vline(c, bx, eaves + 1, base - eaves - 14, PAL.bark)
    vline(c, bx + 1, eaves + 1, base - eaves - 14, mixHex(PAL.bark, PAL.cream, 0.3))
  }
  hline(c, b.x + 7, eaves + 12, b.w - 14, PAL.bark)
  // A glass roof: the same pitch, but panes instead of shingles.
  const ridge = b.y + 8
  const span = eaves - ridge
  for (let i = 0; i < span; i++) {
    const ww = Math.round(16 + ((b.w - 16) * i) / span)
    const xx = b.x + ((b.w - ww) >> 1)
    hline(c, xx, ridge + i, ww, withAlpha(GLASS, 0.8))
    hline(c, xx, ridge + i, 3, withAlpha(PAL.cream, 0.55))
    hline(c, xx + ww - 2, ridge + i, 2, withAlpha(PAL.dusk, 0.4))
    px(c, xx - 1, ridge + i, PAL.ink)
    px(c, xx + ww, ridge + i, PAL.ink)
    if (i % 6 === 5) hline(c, xx, ridge + i, ww, PAL.bark)
  }
  // The ridge vent, propped open.
  const lift = prefersReducedMotion() ? 3 : 2 + (beat & 1)
  rect(c, b.x + (b.w >> 1) - 14, ridge - lift, 28, 3, PAL.ink)
  rect(c, b.x + (b.w >> 1) - 13, ridge - lift, 26, 2, withAlpha(PAL.cream, 0.6))
  hline(c, b.x + (b.w >> 1) - 14, ridge - 1, 28, PAL.ink)
  door(c, b.x + (b.w >> 1) - 12, base - 34, 24, 34)
  snowOn(c, b.x + (b.w >> 1) - 12, b.y + 5, 24, season)
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 67)
}

function mine(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  seat(c, b.x + 2, base + 2, b.w - 4)

  // A rock face, not a heap of bubbles: a faceted skyline quantised to four-pixel steps,
  // lit on the left flank, mid across the crown, shadowed on the right.
  const rockR = ramp(STONE)
  const peak = b.h - 26
  for (let i = 0; i < b.w; i++) {
    const t = i / (b.w - 1)
    const bump = (artNoise(71, i >> 3) > 0.5 ? 5 : 0) - (artNoise(71, (i >> 3) + 9) > 0.62 ? 6 : 0)
    let h = 14 + Math.round(Math.sin(t * Math.PI) * peak) + bump
    h = Math.round(h / 4) * 4
    if (h < 8) h = 8
    const tone = t < 0.34 ? rockR.lit : t < 0.62 ? rockR.mid : rockR.dark
    vline(c, b.x + i, base - h, h, tone)
    px(c, b.x + i, base - h, rockR.ink)
    px(c, b.x + i, base - h + 1, t < 0.62 ? rockR.spec : rockR.mid)
  }
  // Facet seams and a scatter of loose stone across the face.
  for (let i = 0; i < 7; i++) {
    const rx0 = b.x + 12 + Math.floor(artNoise(73, i) * (b.w - 30))
    const ry0 = b.y + 20 + Math.floor(artNoise(73, i + 20) * (b.h - 44))
    const len = 6 + ((i * 3) % 7)
    for (let k = 0; k < len; k++) {
      px(c, rx0 + k, ry0 + (k >> 1), rockR.ink)
      px(c, rx0 + k, ry0 + (k >> 1) - 1, rockR.spec)
    }
  }
  snowOn(c, b.x + 10, b.y + 12, b.w - 20, season)

  const mx = b.x + (b.w >> 1)
  const mw = 34
  rect(c, mx - (mw >> 1) - 4, base - 40, mw + 8, 40, ramp(PLANK).ink)
  rect(c, mx - (mw >> 1) - 3, base - 39, 6, 39, ramp(PLANK).mid)
  vline(c, mx - (mw >> 1) - 3, base - 39, 39, ramp(PLANK).lit)
  rect(c, mx + (mw >> 1) - 3, base - 39, 6, 39, ramp(PLANK).dark)
  rect(c, mx - (mw >> 1) - 4, base - 44, mw + 8, 6, ramp(PLANK).mid)
  hline(c, mx - (mw >> 1) - 4, base - 44, mw + 8, ramp(PLANK).lit)
  rect(c, mx - (mw >> 1) + 3, base - 38, mw - 6, 38, PAL.ink)
  // A lamp inside the dark, and rails running out of it.
  const glow = prefersReducedMotion() ? 0.35 : 0.25 + ((beat & 1) === 0 ? 0.15 : 0)
  ellipse(c, mx, base - 20, 10, 12, withAlpha(PAL.lantern, glow))
  ellipse(c, mx, base - 20, 4, 5, withAlpha(PAL.lantern, glow + 0.2))
  for (let i = 0; i < 2; i++) {
    vline(c, mx - 8 + i * 16, base - 8, 8, IRON)
    hline(c, mx - 10 + i * 16, base - 1, 5, IRON)
  }
  for (let i = 0; i < 4; i++) hline(c, mx - 10, base - 7 + i * 2, 21, mixHex(PAL.bark, PAL.ink, 0.3))
  // A minecart of ore standing on the rails.
  rect(c, b.x + 8, base - 18, 24, 14, ramp(IRON).ink)
  rect(c, b.x + 9, base - 17, 22, 12, ramp(IRON).mid)
  rect(c, b.x + 9, base - 17, 22, 2, ramp(IRON).lit)
  for (let i = 0; i < 3; i++) {
    ellipse(c, b.x + 13 + i * 7, base - 19, 3, 2, ramp(STONE).mid)
    ellipse(c, b.x + 12 + i * 7, base - 20, 2, 1, PAL.lantern)
  }
  for (let i = 0; i < 2; i++) {
    ellipse(c, b.x + 13 + i * 14, base - 3, 3, 3, PAL.ink)
    ellipse(c, b.x + 13 + i * 14, base - 3, 2, 2, ramp(IRON).dark)
  }
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 71)
}

/** A kind the table has never seen still gets a real shed rather than a grey box. */
function genericBuilding(c: Ctx, b: Box, season: Season, beat: number): void {
  const base = b.y + b.h - 6
  const wallTop = b.y + Math.max(14, b.h >> 2)
  castShadow(c, b.x + 6, wallTop, b.w - 12, base - wallTop)
  seat(c, b.x + 2, base + 2, b.w - 4)
  boarded(c, b.x + 6, wallTop, b.w - 12, base - wallTop, ramp(PLANK_PALE))
  pitched(c, b.x, b.y + 4, b.w, wallTop - b.y - 4, Math.max(8, b.w - 30), ramp(ROOF_RED))
  eave(c, b.x + 3, wallTop - 3, b.w - 6, ramp(PLANK))
  snowOn(c, b.x + 12, b.y + 2, b.w - 24, season)
  door(c, b.x + (b.w >> 1) - 10, base - 28, 20, 28)
  if (b.w > 70) pane(c, b.x + 14, base - 26, 14, 12, false)
  lamp(c, b.x + (b.w >> 1) + 14, base - 30, beat)
  groundDressing(c, b.x + 4, base + 2, b.w - 8, season, 73)
}

const BUILDING_DRAW: Readonly<Record<string, BuildDraw>> = {
  farmhouse: (c, b, s, f) => farmhouse(c, b, s, f, false),
  'big-farmhouse': (c, b, s, f) => farmhouse(c, b, s, f, true),
  well,
  silo,
  stall,
  'barn-store': barnStore,
  coop: (c, b, s, f) => coop(c, b, s, f, 1),
  'big-coop': (c, b, s, f) => coop(c, b, s, f, 2),
  'deluxe-coop': (c, b, s, f) => coop(c, b, s, f, 3),
  barn: (c, b, s, f) => barn(c, b, s, f, 1),
  'big-barn': (c, b, s, f) => barn(c, b, s, f, 2),
  'deluxe-barn': (c, b, s, f) => barn(c, b, s, f, 3),
  apiary,
  stable,
  pond,
  'sawmill-yard': sawmillYard,
  bakery: bakeryShop,
  workshop,
  greenhouse,
  mine,
}

/**
 * One building, drawn across its whole footprint from `sx, sy` — the screen position of
 * the top-left tile it occupies. `frame` is the 60 fps counter; ambient motion runs on
 * `beatOf` from it.
 */
export function drawBuilding(
  ctx: Ctx,
  def: BuildingDef,
  sx: number,
  sy: number,
  season: Season,
  frame: number,
): void {
  const box: Box = { x: sx, y: sy, w: def.footprint.w * TILE, h: def.footprint.h * TILE }
  const draw = BUILDING_DRAW[def.kind] ?? genericBuilding
  draw(ctx, box, season, beatOf(frame))
}

/* ------------------------------------------------------------------ *
 * Placement ghost
 * ------------------------------------------------------------------ */

/**
 * The placement preview of `docs/GAMEPLAY.md` section 1: valid tiles tinted `grassLit`
 * and blocked tiles `berry`, **per tile**, so the player can see which corner is the
 * problem rather than being told the whole thing is wrong.
 *
 * Colour is never the only signal — a blocked tile also carries an ink cross and a heavy
 * border, and a valid one a light corner tick — and the footprint outline states the
 * verdict for the placement as a whole. The tile the player will walk up to is marked
 * with an arrow on the bottom edge, because reachability is one of the rules.
 *
 * Static by design: a preview that pulses is a preview that is hard to line up.
 */
export function drawBuildingGhost(
  ctx: Ctx,
  def: BuildingDef,
  sx: number,
  sy: number,
  check: PlacementCheck,
): void {
  const fw = def.footprint.w
  const fh = def.footprint.h
  const tiles = check.tiles
  const ox = tiles.length > 0 ? tiles[0].x : 0
  const oy = tiles.length > 0 ? tiles[0].y : 0

  // Tinted hard enough to read over grass, which is the colour it has to beat.
  const good = withAlpha(PAL.grassLit, 0.55)
  const goodEdge = PAL.grassLit
  const bad = withAlpha(PAL.berry, 0.8)
  const badEdge = PAL.berry

  for (let row = 0; row < fh; row++) {
    for (let col = 0; col < fw; col++) {
      // The per-tile list is row-major over the footprint. A check that carries none —
      // or a short one — falls back to the whole-placement verdict laid on the grid,
      // so the preview is never blank when the rules layer is terse.
      const t = tiles[row * fw + col]
      const ok = t === undefined ? check.ok : t.ok
      const tx = sx + ((t === undefined ? ox + col : t.x) - ox) * TILE
      const ty = sy + ((t === undefined ? oy + row : t.y) - oy) * TILE

      rect(ctx, tx + 1, ty + 1, TILE - 2, TILE - 2, ok ? good : bad)
      outline(ctx, tx + 1, ty + 1, TILE - 2, TILE - 2, ok ? goodEdge : badEdge)
      if (ok) {
        // A light corner tick, upper left, where the light comes from.
        hline(ctx, tx + 3, ty + 3, 7, PAL.cream)
        vline(ctx, tx + 3, ty + 3, 7, PAL.cream)
      } else {
        // A cross, so the refusal survives being read without colour.
        outline(ctx, tx + 1, ty + 1, TILE - 2, TILE - 2, badEdge)
        outline(ctx, tx + 2, ty + 2, TILE - 4, TILE - 4, withAlpha(PAL.ink, 0.55))
        for (let i = 0; i < TILE - 12; i++) {
          rect(ctx, tx + 6 + i, ty + 6 + i, 2, 2, PAL.ink)
          rect(ctx, tx + TILE - 8 - i, ty + 6 + i, 2, 2, PAL.ink)
        }
      }
    }
  }

  // The footprint as a whole: a two-pixel outline with the corners notched by one, per
  // DESIGN.md section 6 — never a rounded box.
  const w = fw * TILE
  const h = fh * TILE
  const edge = check.ok ? PAL.cream : PAL.berry
  rect(ctx, sx + 1, sy, w - 2, 2, edge)
  rect(ctx, sx + 1, sy + h - 2, w - 2, 2, edge)
  rect(ctx, sx, sy + 1, 2, h - 2, edge)
  rect(ctx, sx + w - 2, sy + 1, 2, h - 2, edge)

  // Which side you walk up to. The bottom edge has to be reachable, so say which tile.
  const doorX = sx + (w >> 1) - 5
  const doorY = sy + h - 12
  for (let i = 0; i < 5; i++) {
    rect(ctx, doorX + i, doorY + i, 10 - i * 2, 2, PAL.ink)
    rect(ctx, doorX + i + 1, doorY + i, 8 - i * 2, 1, check.ok ? PAL.lantern : PAL.berry)
  }
}

/* ------------------------------------------------------------------ *
 * Machine primitives
 * ------------------------------------------------------------------ */

/** A shaded slab. The workhorse: nearly every machine starts with one. */
function slab(c: Ctx, x: number, y: number, w: number, h: number, base: string): void {
  shadeRect(c, x, y, w, h, ramp(base))
}

/** A vertical cylinder: lit column left, dark right, elliptical cap on top. */
function drum(c: Ctx, cx: number, top: number, w: number, h: number, base: string): void {
  const r = ramp(base)
  const half = w >> 1
  rect(c, cx - half - 1, top, w + 2, h, r.ink)
  rect(c, cx - half, top, w, h, r.mid)
  rect(c, cx - half, top, 2, h, r.lit)
  vline(c, cx - half + 1, top, h, r.spec)
  rect(c, cx + half - 3, top, 3, h, r.dark)
  ellipse(c, cx, top, half + 1, 3, r.ink)
  ellipse(c, cx, top, half, 2, r.lit)
  ellipse(c, cx, top - 1, half - 3, 1, r.spec)
  ellipse(c, cx, top + h - 1, half, 2, r.dark)
}

/** A shaded disc: wheels, blades, grindstones, pot bellies. */
function disc(c: Ctx, cx: number, cy: number, rad: number, base: string): void {
  const r = ramp(base)
  ellipse(c, cx, cy, rad, rad, r.ink)
  ellipse(c, cx, cy, rad - 1, rad - 1, r.mid)
  ellipse(c, cx - 1, cy - 1, rad - 2, rad - 2, r.lit)
  ellipse(c, cx, cy, rad - 3, rad - 3, r.mid)
  ellipse(c, cx + 1, cy + 1, rad - 3, rad - 3, r.dark)
  ellipse(c, cx - 2, cy - 2, 1, 1, r.spec)
}

/** A downward funnel: a hopper, a strainer, a chute. */
function funnel(c: Ctx, cx: number, y: number, wTop: number, wBot: number, h: number, base: string): void {
  const r = ramp(base)
  const span = h > 1 ? h - 1 : 1
  for (let i = 0; i < h; i++) {
    const ww = Math.round(wTop + ((wBot - wTop) * i) / span)
    const xx = cx - (ww >> 1)
    hline(c, xx, y + i, ww, r.mid)
    hline(c, xx, y + i, 2, r.lit)
    hline(c, xx + ww - 2, y + i, 2, r.dark)
    px(c, xx - 1, y + i, r.ink)
    px(c, xx + ww, y + i, r.ink)
  }
  hline(c, cx - (wTop >> 1) - 1, y - 1, wTop + 2, r.ink)
  hline(c, cx - (wTop >> 1), y, wTop, r.spec)
}

/** Four legs or two, under a bench. */
function standLegs(c: Ctx, x: number, y: number, w: number, h: number, base: string): void {
  const r = ramp(base)
  for (const lx of [x, x + w - 3]) {
    rect(c, lx, y, 3, h, r.ink)
    rect(c, lx, y, 2, h - 1, r.mid)
    vline(c, lx, y, h - 1, r.lit)
  }
}

/** A crank handle at one of four positions around its axle. */
function crank(c: Ctx, cx: number, cy: number, rad: number, s: number, base: string): void {
  const a = (s / 4) * Math.PI * 2
  const hx = cx + Math.round(Math.cos(a) * rad)
  const hy = cy + Math.round(Math.sin(a) * rad)
  ellipse(c, cx, cy, 2, 2, PAL.ink)
  ellipse(c, cx, cy, 1, 1, base)
  // The arm, drawn as a run of pixels so it lands on whole coordinates.
  for (let i = 1; i <= rad; i++) {
    px(c, cx + Math.round((Math.cos(a) * rad * i) / rad), cy + Math.round((Math.sin(a) * rad * i) / rad), base)
  }
  rect(c, hx - 1, hy - 1, 3, 3, PAL.ink)
  rect(c, hx - 1, hy - 1, 2, 2, mixHex(base, PAL.cream, 0.4))
}

/** Spokes turning inside a wheel. */
function spokes(c: Ctx, cx: number, cy: number, rad: number, s: number, col: string): void {
  for (let i = 0; i < 4; i++) {
    const a = ((i + s * 0.25) / 4) * Math.PI * 2
    for (let k = 2; k < rad; k++) {
      px(c, cx + Math.round(Math.cos(a) * k), cy + Math.round(Math.sin(a) * k), col)
    }
  }
}

/** Fire in a mouth or under a pot. Two frames of flicker on the beat. */
function fire(c: Ctx, x: number, y: number, w: number, s: number): void {
  rect(c, x, y + 2, w, 3, EMBER)
  hline(c, x + 1, y + 4, w - 2, PAL.berry)
  for (let i = 0; i < w; i += 3) {
    const h = 2 + ((i + s) % 3)
    rect(c, x + i, y + 2 - h, 2, h, PAL.lantern)
    px(c, x + i, y + 2 - h, mixHex(PAL.lantern, PAL.cream, 0.6))
  }
}

/** A steam plume above a working machine. Dropped entirely under reduced motion. */
function steam(c: Ctx, x: number, y: number, s: number): void {
  if (prefersReducedMotion()) return
  for (let i = 0; i < 3; i++) {
    const t = i + s * 0.5
    const py = y - Math.round(t * 4)
    const pxx = x + Math.round(Math.sin(t * 1.1) * 3)
    const rad = 1 + (i > 1 ? 1 : 0)
    ellipse(c, pxx, py, rad, rad, withAlpha(PAL.cream, 0.4 - i * 0.1))
  }
}

/** A liquid surface with a moving glint. */
function liquid(c: Ctx, x: number, y: number, w: number, h: number, col: string, s: number): void {
  rect(c, x, y, w, h, col)
  hline(c, x, y, w, mixHex(col, PAL.cream, 0.35))
  hline(c, x + 1 + ((s * 2) % (w - 4)), y, 3, mixHex(col, PAL.cream, 0.7))
  hline(c, x, y + h - 1, w, mixHex(col, PAL.ink, 0.35))
}

/* ------------------------------------------------------------------ *
 * The thirty machines
 * ------------------------------------------------------------------ */

type MachineDraw = (c: Ctx, x: number, y: number, s: number, on: boolean) => void

function feedMill(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 5, y + 22, 22, 8, PLANK)
  funnel(c, x + 16, y + 4, 22, 8, 12, IRON)
  if (on) {
    rect(c, x + 7, y + 5, 18, 4, HAY)
    hline(c, x + 7, y + 5, 18, mixHex(HAY, PAL.cream, 0.5))
    px(c, x + 16, y + 17 + (s & 3), HAY)
  }
  rect(c, x + 13, y + 16, 6, 5, ramp(IRON).dark)
  slab(c, x + 6, y + 21, 20, 4, PLANK)
  // A sack filling below the chute.
  ellipse(c, x + 16, y + 27, 7, 4, PAL.ink)
  ellipse(c, x + 16, y + 27, 6, 3, mixHex(PAL.soil, PAL.parchment, 0.4))
  ellipse(c, x + 14, y + 26, 2, 1, PAL.cream)
}

function sawmill(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 3, y + 22, 26, 8, PLANK)
  slab(c, x + 2, y + 19, 28, 4, PLANK_PALE)
  const cx = x + 20
  const cy = y + 13
  disc(c, cx, cy, 9, IRON)
  for (let i = 0; i < 10; i++) {
    const a = ((i + (on ? s * 0.25 : 0)) / 10) * Math.PI * 2
    px(c, cx + Math.round(Math.cos(a) * 9), cy + Math.round(Math.sin(a) * 9), PAL.ink)
  }
  spokes(c, cx, cy, 6, on ? s : 0, mixHex(IRON, PAL.ink, 0.3))
  // The log being fed against it.
  ellipse(c, x + 8, y + 15, 7, 5, ramp(PAL.bark).ink)
  ellipse(c, x + 8, y + 15, 6, 4, ramp(PAL.bark).mid)
  ellipse(c, x + 6, y + 13, 3, 2, ramp(PAL.bark).lit)
  if (on) for (let i = 0; i < 4; i++) px(c, cx + 2 + ((i * 3 + s) % 9), y + 6 - (i & 1), HAY)
}

function mill(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  drum(c, x + 16, y + 12, 14, 18, STONE)
  for (let i = 0; i < 3; i++) hline(c, x + 10, y + 17 + i * 5, 13, ramp(STONE).dark)
  rect(c, x + 13, y + 22, 6, 8, PAL.ink)
  rect(c, x + 14, y + 23, 4, 7, mixHex(PLANK, PAL.ink, 0.3))
  // The cap and the sails, which are the whole point of a mill.
  ellipse(c, x + 16, y + 10, 9, 4, PAL.ink)
  ellipse(c, x + 16, y + 9, 8, 3, ramp(ROOF_GREY).mid)
  ellipse(c, x + 14, y + 8, 4, 1, ramp(ROOF_GREY).lit)
  const cx = x + 16
  const cy = y + 9
  for (let i = 0; i < 4; i++) {
    const a = ((i + (on ? s * 0.25 : 0)) / 4) * Math.PI * 2
    for (let k = 2; k <= 9; k++) {
      const sx = cx + Math.round(Math.cos(a) * k)
      const sy = cy + Math.round(Math.sin(a) * k)
      px(c, sx, sy, PAL.ink)
      if (k > 3) px(c, sx + Math.round(Math.sin(a)), sy - Math.round(Math.cos(a)), CLOTH)
    }
  }
  ellipse(c, cx, cy, 2, 2, PAL.ink)
  ellipse(c, cx, cy, 1, 1, BRASS)
}

function dairy(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  drum(c, x + 13, y + 8, 16, 20, PLANK_PALE)
  for (let i = 0; i < 3; i++) {
    hline(c, x + 5, y + 12 + i * 6, 17, IRON)
    hline(c, x + 5, y + 12 + i * 6, 5, mixHex(IRON, PAL.cream, 0.5))
  }
  // The plunger, up on the working beat.
  const lift = on ? (s & 1) * 3 : 0
  vline(c, x + 13, y + 1 + lift, 8, ramp(PLANK).mid)
  vline(c, x + 12, y + 1 + lift, 8, PAL.ink)
  rect(c, x + 10, y + lift, 7, 2, ramp(PLANK).mid)
  hline(c, x + 10, y + lift, 7, ramp(PLANK).lit)
  // A milk can beside it.
  drum(c, x + 26, y + 18, 8, 10, IRON)
  rect(c, x + 24, y + 14, 5, 4, ramp(IRON).mid)
  hline(c, x + 24, y + 14, 5, ramp(IRON).spec)
  if (on) px(c, x + 21, y + 20 + (s & 3), PAL.cream)
}

function bakeryOven(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 1, y + 10, 30, 20, BRICK)
  for (let by = y + 13; by < y + 29; by += 4) {
    hline(c, x + 2, by, 28, ramp(BRICK).dark)
    for (let bx = x + 4 + ((by >> 2) & 1 ? 4 : 0); bx < x + 29; bx += 8) px(c, bx, by - 2, ramp(BRICK).dark)
  }
  // The arched mouth, and the fire in it when a job is running.
  for (let i = 0; i < 5; i++) hline(c, x + 9 + i, y + 15 + i, 14 - i * 2, PAL.ink)
  rect(c, x + 9, y + 19, 14, 9, PAL.ink)
  if (on) fire(c, x + 11, y + 23, 10, s)
  else rect(c, x + 11, y + 24, 10, 3, mixHex(PAL.ink, PAL.bark, 0.3))
  rect(c, x + 22, y + 2, 7, 9, ramp(BRICK).ink)
  rect(c, x + 23, y + 2, 5, 9, ramp(BRICK).mid)
  hline(c, x + 23, y + 2, 5, ramp(BRICK).lit)
  slab(c, x + 1, y + 28, 30, 3, STONE)
}

function pieOven(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  ellipse(c, x + 14, y + 24, 13, 13, PAL.ink)
  ellipse(c, x + 14, y + 24, 12, 12, ramp(mixHex(PAL.soil, PAL.parchment, 0.35)).mid)
  ellipse(c, x + 11, y + 20, 7, 6, ramp(mixHex(PAL.soil, PAL.parchment, 0.35)).lit)
  ellipse(c, x + 8, y + 17, 2, 1, ramp(mixHex(PAL.soil, PAL.parchment, 0.35)).spec)
  for (let i = 0; i < 4; i++) hline(c, x + 10 + i, y + 18 + i, 10 - i * 2, PAL.ink)
  rect(c, x + 10, y + 21, 10, 8, PAL.ink)
  if (on) fire(c, x + 11, y + 25, 8, s)
  slab(c, x + 1, y + 28, 30, 3, STONE)
  rect(c, x + 20, y + 4, 3, 8, ramp(BRICK).mid)
  vline(c, x + 20, y + 4, 8, ramp(BRICK).lit)
  // A peel leaning against the oven with a pie on it.
  for (let i = 0; i < 10; i++) px(c, x + 24 + (i >> 2), y + 26 - i, ramp(PLANK).mid)
  ellipse(c, x + 26, y + 14, 4, 3, PAL.ink)
  ellipse(c, x + 26, y + 14, 3, 2, mixHex(PAL.lantern, PAL.bark, 0.25))
  px(c, x + 25, y + 13, PAL.cream)
}

function sugarMill(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 3, y + 22, 26, 8, PLANK)
  slab(c, x + 2, y + 6, 4, 18, IRON)
  slab(c, x + 26, y + 6, 4, 18, IRON)
  disc(c, x + 12, y + 14, 7, IRON)
  disc(c, x + 21, y + 14, 7, IRON)
  spokes(c, x + 12, y + 14, 5, on ? s : 0, ramp(IRON).dark)
  spokes(c, x + 21, y + 14, 5, on ? 3 - s : 0, ramp(IRON).dark)
  // Cane going in over the top.
  for (let i = 0; i < 3; i++) {
    const cy = y + 4 + i * 2 - (on ? (s & 1) : 0)
    rect(c, x + 2 + i, cy, 12, 2, PAL.grassLit)
    hline(c, x + 2 + i, cy, 12, PAL.grass)
  }
  slab(c, x + 8, y + 22, 16, 3, PLANK)
  if (on) liquid(c, x + 12, y + 25, 8, 3, mixHex(PAL.lantern, PAL.bark, 0.3), s)
}

function jamMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 6, y + 24, 20, 6, IRON)
  ellipse(c, x + 15, y + 18, 11, 8, PAL.ink)
  ellipse(c, x + 15, y + 18, 10, 7, ramp(IRON).mid)
  ellipse(c, x + 12, y + 15, 5, 3, ramp(IRON).lit)
  rect(c, x + 4, y + 10, 23, 3, PAL.ink)
  rect(c, x + 5, y + 10, 21, 2, ramp(IRON).mid)
  if (on) {
    liquid(c, x + 6, y + 11, 19, 3, PAL.berry, s)
    steam(c, x + 15, y + 8, s)
  } else {
    ellipse(c, x + 15, y + 9, 10, 2, ramp(IRON).dark)
  }
  // A filled jar beside the pot.
  rect(c, x + 25, y + 19, 7, 11, PAL.ink)
  rect(c, x + 26, y + 20, 5, 9, PAL.berry)
  rect(c, x + 26, y + 20, 2, 9, mixHex(PAL.berry, PAL.cream, 0.4))
  rect(c, x + 25, y + 17, 7, 3, BRASS)
}

function juicePress(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 4, y + 22, 22, 8, PLANK)
  slab(c, x + 3, y + 19, 24, 4, PLANK)
  for (const cxp of [x + 5, x + 24]) {
    rect(c, cxp, y + 2, 3, 18, ramp(IRON).ink)
    rect(c, cxp, y + 2, 2, 17, ramp(IRON).mid)
  }
  slab(c, x + 3, y + 1, 26, 4, IRON)
  // The screw, driven down while it works.
  const down = on ? (s & 3) : 0
  vline(c, x + 15, y + 4, 6 + down, ramp(IRON).lit)
  vline(c, x + 16, y + 4, 6 + down, ramp(IRON).dark)
  for (let i = 0; i < 6; i++) px(c, x + 15 + (i & 1), y + 5 + i, PAL.ink)
  slab(c, x + 8, y + 9 + down, 16, 4, IRON)
  // The basket of fruit, and the spout with a glass under it.
  rect(c, x + 8, y + 13 + down, 16, 19 - down - 13 + 6, PAL.ink)
  rect(c, x + 9, y + 14 + down, 14, 5 - down + 5, mixHex(PAL.berry, PAL.lantern, 0.4))
  for (let i = 0; i < 3; i++) hline(c, x + 9, y + 15 + down + i * 3, 14, withAlpha(PAL.ink, 0.35))
  rect(c, x + 22, y + 21, 6, 2, ramp(IRON).mid)
  if (on) vline(c, x + 27, y + 23, 3, PAL.lantern)
  rect(c, x + 25, y + 25, 6, 6, PAL.ink)
  rect(c, x + 26, y + 26, 4, 4, on ? PAL.lantern : withAlpha(GLASS, 0.7))
}

function oilPress(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  ellipse(c, x + 16, y + 25, 14, 6, PAL.ink)
  ellipse(c, x + 16, y + 25, 13, 5, ramp(STONE).mid)
  ellipse(c, x + 13, y + 23, 7, 2, ramp(STONE).lit)
  ellipse(c, x + 16, y + 24, 8, 3, ramp(STONE).dark)
  // The runner stone stood on edge, turning about the post.
  const cx = x + 13 + (on ? ((s & 1) ? 1 : 0) : 0)
  disc(c, cx, y + 16, 8, STONE)
  vline(c, x + 16, y + 4, 14, ramp(PLANK).mid)
  vline(c, x + 17, y + 4, 14, PAL.ink)
  rect(c, x + 13, y + 3, 8, 3, ramp(PLANK).mid)
  hline(c, x + 13, y + 3, 8, ramp(PLANK).lit)
  for (let i = 0; i < 5; i++) px(c, cx + i - 2, y + 16, ramp(STONE).dark)
  // The jug catching the oil.
  rect(c, x + 24, y + 20, 7, 10, PAL.ink)
  rect(c, x + 25, y + 21, 5, 8, mixHex(PAL.leaf, PAL.lantern, 0.45))
  rect(c, x + 25, y + 21, 2, 8, mixHex(PAL.lantern, PAL.cream, 0.35))
  if (on) px(c, x + 23, y + 19 + (s & 3), PAL.lantern)
}

function loom(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  for (const post of [x + 3, x + 26]) {
    rect(c, post, y + 2, 4, 28, ramp(PLANK).ink)
    rect(c, post, y + 2, 3, 27, ramp(PLANK).mid)
    vline(c, post, y + 2, 27, ramp(PLANK).lit)
  }
  slab(c, x + 2, y + 1, 28, 4, PLANK)
  slab(c, x + 2, y + 26, 28, 4, PLANK)
  // Warp threads under tension.
  for (let i = 0; i < 8; i++) {
    vline(c, x + 8 + i * 2, y + 5, 16, i % 2 === 0 ? CLOTH : mixHex(CLOTH, PAL.dusk, 0.25))
  }
  // The woven cloth growing from the bottom, and the shuttle crossing it.
  const woven = on ? 6 + (s & 3) : 6
  rect(c, x + 7, y + 21 - woven + 6, 17, woven, mixHex(PAL.sky, PAL.parchment, 0.45))
  hline(c, x + 7, y + 27 - woven, 17, PAL.cream)
  for (let i = 0; i < woven; i += 2) hline(c, x + 7, y + 27 - woven + i, 17, withAlpha(PAL.ink, 0.18))
  const shx = x + 7 + (on ? (s * 5) % 15 : 5)
  rect(c, shx, y + 12, 6, 3, PAL.ink)
  rect(c, shx, y + 12, 5, 2, ramp(PAL.bark).lit)
}

function sewingBench(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 3, y + 24, 26, 6, PLANK)
  slab(c, x + 2, y + 21, 28, 4, PLANK_PALE)
  // The head: a column, an arm reaching left, and the needle bar under it.
  slab(c, x + 19, y + 6, 7, 15, IRON)
  slab(c, x + 7, y + 6, 19, 5, IRON)
  ellipse(c, x + 10, y + 12, 4, 3, ramp(IRON).ink)
  ellipse(c, x + 10, y + 12, 3, 2, ramp(IRON).mid)
  const bob = on ? (s & 1) * 2 : 0
  vline(c, x + 10, y + 11 + bob, 5 - bob, PAL.ink)
  px(c, x + 10, y + 16, mixHex(IRON, PAL.cream, 0.6))
  disc(c, x + 27, y + 13, 4, IRON)
  spokes(c, x + 27, y + 13, 3, on ? s : 0, ramp(IRON).dark)
  // Cloth feeding through.
  rect(c, x + 4, y + 17, 14, 4, mixHex(PAL.sky, PAL.parchment, 0.4))
  hline(c, x + 4, y + 17, 14, PAL.cream)
  if (on) hline(c, x + 4 + ((s * 3) % 10), y + 19, 3, PAL.ink)
}

function dyeVat(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A rail with cloth over it, above the vat.
  rect(c, x + 2, y + 4, 28, 3, ramp(PLANK).ink)
  rect(c, x + 2, y + 4, 28, 2, ramp(PLANK).mid)
  for (let i = 0; i < 2; i++) {
    const cxp = x + 6 + i * 14
    rect(c, cxp, y + 6, 8, 8 + i * 3, on ? INDIGO : CLOTH)
    rect(c, cxp, y + 6, 3, 8 + i * 3, on ? mixHex(INDIGO, PAL.cream, 0.3) : PAL.cream)
    hline(c, cxp, y + 13 + i * 3, 8, PAL.ink)
  }
  rect(c, x + 4, y + 16, 24, 14, PAL.ink)
  slab(c, x + 5, y + 17, 22, 13, PLANK)
  for (let i = 0; i < 2; i++) hline(c, x + 5, y + 20 + i * 6, 22, IRON)
  liquid(c, x + 7, y + 18, 18, 4, on ? INDIGO : mixHex(INDIGO, PAL.ink, 0.4), s)
  if (on) steam(c, x + 16, y + 15, s)
}

function honeyHouse(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  drum(c, x + 15, y + 8, 18, 20, IRON)
  for (let i = 0; i < 2; i++) hline(c, x + 6, y + 14 + i * 7, 19, ramp(IRON).dark)
  // A sight glass showing the honey level.
  rect(c, x + 8, y + 13, 4, 12, PAL.ink)
  rect(c, x + 9, y + 14, 2, 10, on ? PAL.lantern : withAlpha(PAL.lantern, 0.4))
  crank(c, x + 15, y + 5, 5, on ? s : 0, BRASS)
  rect(c, x + 13, y + 6, 5, 3, ramp(IRON).mid)
  // The tap, and a jar of honey under it.
  rect(c, x + 24, y + 24, 5, 3, BRASS)
  rect(c, x + 27, y + 22, 2, 4, BRASS)
  if (on) vline(c, x + 28, y + 27, 2, PAL.lantern)
  rect(c, x + 25, y + 26, 6, 5, PAL.ink)
  rect(c, x + 26, y + 27, 4, 4, PAL.lantern)
}

function popcornPot(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A glass case on a little cart.
  rect(c, x + 4, y + 6, 24, 18, PAL.ink)
  rect(c, x + 5, y + 7, 22, 16, withAlpha(GLASS, 0.65))
  for (const barX of [x + 5, x + 26]) vline(c, barX, y + 7, 16, ramp(IRON).mid)
  slab(c, x + 3, y + 3, 26, 4, ROOF_RED)
  hline(c, x + 3, y + 3, 26, ramp(ROOF_RED).lit)
  // The kettle inside, and the corn it throws.
  ellipse(c, x + 16, y + 13, 6, 4, PAL.ink)
  ellipse(c, x + 16, y + 13, 5, 3, ramp(IRON).mid)
  rect(c, x + 15, y + 8, 3, 3, ramp(IRON).dark)
  const kernels = on ? 10 : 5
  for (let i = 0; i < kernels; i++) {
    const kx = x + 7 + ((i * 7 + (on ? s * 2 : 0)) % 18)
    const ky = y + 21 - (on ? (i * 3 + s) % 12 : (i & 1) * 2)
    // Popped corn is lumpy and bright, with an ink seat so it reads against the glass.
    rect(c, kx - 1, ky - 1, 3, 3, PAL.ink)
    rect(c, kx - 1, ky - 1, 2, 2, PAL.cream)
    px(c, kx + 1, ky + 1, mixHex(PAL.parchment, PAL.lantern, 0.3))
  }
  slab(c, x + 2, y + 23, 28, 3, PLANK)
  for (let i = 0; i < 2; i++) {
    ellipse(c, x + 8 + i * 16, y + 28, 3, 3, PAL.ink)
    ellipse(c, x + 8 + i * 16, y + 28, 2, 2, ramp(IRON).mid)
  }
}

function bbqGrill(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  for (let i = 0; i < 3; i++) {
    const lx = x + 5 + i * 10
    vline(c, lx, y + 20, 10, PAL.ink)
    vline(c, lx + 1, y + 20, 9, ramp(IRON).mid)
  }
  ellipse(c, x + 16, y + 17, 13, 8, PAL.ink)
  ellipse(c, x + 16, y + 17, 12, 7, ramp(mixHex(PAL.ink, PAL.dusk, 0.35)).mid)
  ellipse(c, x + 12, y + 14, 6, 3, ramp(mixHex(PAL.ink, PAL.dusk, 0.35)).lit)
  rect(c, x + 3, y + 13, 26, 3, PAL.ink)
  if (on) {
    fire(c, x + 8, y + 12, 16, s)
    steam(c, x + 20, y + 6, s)
  } else {
    for (let i = 0; i < 6; i++) px(c, x + 8 + i * 3, y + 14, mixHex(PAL.ink, PAL.berry, 0.3))
  }
  // The grate, and two skewers on it.
  for (let i = 0; i < 8; i++) vline(c, x + 5 + i * 3, y + 11, 2, IRON)
  hline(c, x + 4, y + 11, 24, mixHex(IRON, PAL.cream, 0.4))
  for (let i = 0; i < 2; i++) {
    const sy = y + 8 + i * 2
    hline(c, x + 7, sy, 18, IRON)
    for (let k = 0; k < 3; k++) {
      ellipse(c, x + 10 + k * 5, sy, 2, 1, k === 1 ? PAL.grassLit : mixHex(PAL.berry, PAL.bark, 0.3))
    }
  }
}

function soupKitchen(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A tripod: three legs off one apex, splayed to the ground, with the pot slung in it.
  const feet = [x + 3, x + 16, x + 29]
  for (const foot of feet) {
    for (let k = 0; k <= 26; k++) {
      const t = k / 26
      px(c, x + 16 + Math.round((foot - x - 16) * t), y + 3 + k, PAL.ink)
      if (foot < x + 16) px(c, x + 17 + Math.round((foot - x - 16) * t), y + 3 + k, ramp(IRON).mid)
    }
  }
  rect(c, x + 14, y + 1, 5, 3, ramp(IRON).mid)
  hline(c, x + 14, y + 1, 5, ramp(IRON).spec)
  if (on) fire(c, x + 10, y + 25, 12, s)
  ellipse(c, x + 15, y + 18, 11, 9, PAL.ink)
  ellipse(c, x + 15, y + 18, 10, 8, ramp(mixHex(PAL.ink, PAL.dusk, 0.3)).mid)
  ellipse(c, x + 11, y + 15, 5, 3, ramp(mixHex(PAL.ink, PAL.dusk, 0.3)).lit)
  rect(c, x + 4, y + 10, 23, 3, PAL.ink)
  rect(c, x + 5, y + 10, 21, 2, ramp(IRON).mid)
  if (on) {
    liquid(c, x + 6, y + 11, 19, 3, mixHex(PAL.lantern, PAL.berry, 0.35), s)
    steam(c, x + 15, y + 7, s)
    for (let i = 0; i < 3; i++) px(c, x + 9 + ((i * 6 + s) % 15), y + 11, PAL.grassLit)
  }
  // The ladle, hooked over the rim.
  vline(c, x + 26, y + 4, 10, ramp(PLANK).mid)
  ellipse(c, x + 26, y + 15, 3, 2, ramp(IRON).mid)
  ellipse(c, x + 25, y + 14, 1, 1, ramp(IRON).spec)
}

function saladBar(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 1, y + 18, 30, 12, PLANK)
  for (let i = 0; i < 3; i++) vline(c, x + 8 + i * 8, y + 20, 8, ramp(PLANK).dark)
  slab(c, x + 0, y + 15, 32, 4, PLANK_PALE)
  // Three bowls, each with a different filling.
  const fills = [PAL.grassLit, PAL.berry, PAL.lantern]
  for (let i = 0; i < 3; i++) {
    const cxp = x + 7 + i * 9
    ellipse(c, cxp, y + 14, 4, 3, PAL.ink)
    ellipse(c, cxp, y + 14, 3, 2, CLOTH)
    ellipse(c, cxp, y + 12, 3, 2, fills[i])
    ellipse(c, cxp - 1, y + 12, 1, 1, mixHex(fills[i], PAL.cream, 0.5))
    if (on) px(c, cxp + ((s & 1) ? 1 : -1), y + 9, fills[i])
  }
  // The curved guard over the top.
  for (let i = 0; i < 26; i++) {
    const gy = y + 8 - Math.round(Math.sin((i / 25) * Math.PI) * 4)
    px(c, x + 3 + i, gy, withAlpha(PAL.cream, 0.75))
    px(c, x + 3 + i, gy + 1, withAlpha(GLASS, 0.5))
  }
  vline(c, x + 3, y + 8, 7, ramp(IRON).mid)
  vline(c, x + 28, y + 8, 7, ramp(IRON).mid)
}

function sauceMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 6, y + 24, 20, 6, IRON)
  funnel(c, x + 15, y + 6, 24, 8, 16, IRON)
  crank(c, x + 15, y + 4, 5, on ? s : 0, BRASS)
  if (on) {
    liquid(c, x + 5, y + 8, 20, 3, PAL.berry, s)
    px(c, x + 15, y + 23 + (s & 3), PAL.berry)
  }
  // Tomatoes waiting beside the mill.
  for (let i = 0; i < 2; i++) {
    ellipse(c, x + 4 + i * 5, y + 27, 3, 3, PAL.ink)
    ellipse(c, x + 4 + i * 5, y + 27, 2, 2, PAL.berry)
    px(c, x + 3 + i * 5, y + 26, mixHex(PAL.berry, PAL.cream, 0.5))
    px(c, x + 4 + i * 5, y + 24, PAL.leaf)
  }
  rect(c, x + 21, y + 23, 8, 8, PAL.ink)
  rect(c, x + 22, y + 24, 6, 6, on ? PAL.berry : withAlpha(GLASS, 0.6))
  rect(c, x + 21, y + 21, 8, 2, BRASS)
}

function pastaMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  standLegs(c, x + 4, y + 22, 24, 8, PLANK)
  slab(c, x + 3, y + 8, 22, 14, IRON)
  hline(c, x + 4, y + 13, 20, ramp(IRON).dark)
  crank(c, x + 27, y + 14, 5, on ? s : 0, BRASS)
  rect(c, x + 24, y + 13, 4, 3, ramp(IRON).mid)
  // The die at the bottom, and the strands hanging from it.
  rect(c, x + 6, y + 21, 16, 3, ramp(IRON).dark)
  for (let i = 0; i < 6; i++) {
    const len = on ? 3 + ((i * 2 + s * 2) % 7) : 3 + (i & 1)
    vline(c, x + 8 + i * 3, y + 24, len, mixHex(PAL.lantern, PAL.parchment, 0.55))
    px(c, x + 8 + i * 3, y + 24 + len, mixHex(PAL.lantern, PAL.bark, 0.3))
  }
  // A drying rack of finished ribbons at the top.
  hline(c, x + 3, y + 5, 26, ramp(PLANK).mid)
  for (let i = 0; i < 4; i++) rect(c, x + 6 + i * 6, y + 5, 3, 3, mixHex(PAL.lantern, PAL.parchment, 0.4))
}

function candleMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  for (const post of [x + 4, x + 25]) {
    rect(c, post, y + 4, 3, 16, ramp(PLANK).ink)
    rect(c, post, y + 4, 2, 15, ramp(PLANK).mid)
  }
  rect(c, x + 3, y + 3, 26, 3, ramp(PLANK).ink)
  rect(c, x + 3, y + 3, 26, 2, ramp(PLANK).mid)
  hline(c, x + 3, y + 3, 26, ramp(PLANK).lit)
  // Four candles on their wicks, longer as they are dipped.
  const dips = on ? 2 + (s & 3) : 3
  for (let i = 0; i < 4; i++) {
    const cxp = x + 8 + i * 5
    vline(c, cxp, y + 6, 4, mixHex(PAL.parchment, PAL.bark, 0.4))
    rect(c, cxp - 1, y + 9, 3, dips + 3, mixHex(PAL.parchment, PAL.lantern, 0.25))
    vline(c, cxp - 1, y + 9, dips + 3, PAL.cream)
    px(c, cxp, y + 12 + dips, mixHex(PAL.parchment, PAL.bark, 0.3))
  }
  // The wax pot they are dipped into.
  rect(c, x + 5, y + 21, 22, 9, PAL.ink)
  slab(c, x + 6, y + 22, 20, 8, IRON)
  liquid(c, x + 7, y + 23, 18, 3, mixHex(PAL.lantern, PAL.parchment, 0.5), s)
  if (on) steam(c, x + 16, y + 20, s)
}

function soapMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A pot with a paddle at the back.
  ellipse(c, x + 10, y + 12, 8, 7, PAL.ink)
  ellipse(c, x + 10, y + 12, 7, 6, ramp(IRON).mid)
  ellipse(c, x + 8, y + 10, 3, 2, ramp(IRON).lit)
  rect(c, x + 2, y + 6, 17, 3, PAL.ink)
  liquid(c, x + 3, y + 7, 15, 2, mixHex(PAL.parchment, PAL.leaf, 0.3), s)
  const lean = on ? (s & 1) * 2 - 1 : 0
  for (let i = 0; i < 10; i++) px(c, x + 10 + lean + (i >> 3), y + 6 - i, ramp(PLANK).mid)
  if (on) steam(c, x + 10, y + 3, s)
  // The mould tray, with bars turned out of it.
  slab(c, x + 3, y + 20, 27, 4, PLANK)
  rect(c, x + 3, y + 24, 27, 6, PAL.ink)
  slab(c, x + 4, y + 24, 25, 5, PLANK_PALE)
  for (let i = 0; i < 4; i++) {
    const bxp = x + 5 + i * 6
    rect(c, bxp, y + 16, 5, 4, PAL.ink)
    rect(c, bxp, y + 16, 4, 3, mixHex(PAL.parchment, PAL.sky, 0.25))
    hline(c, bxp, y + 16, 4, PAL.cream)
  }
}

function preservesJar(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 3, y + 25, 26, 6, PLANK)
  for (let i = 0; i < 3; i++) vline(c, x + 8 + i * 7, y + 26, 4, ramp(PLANK).dark)
  // One big jar with a clamped lid.
  rect(c, x + 8, y + 5, 17, 21, PAL.ink)
  rect(c, x + 9, y + 6, 15, 19, withAlpha(GLASS, 0.55))
  rect(c, x + 9, y + 6, 3, 19, withAlpha(PAL.cream, 0.4))
  liquid(c, x + 10, y + 11, 13, 13, withAlpha(mixHex(PAL.leaf, PAL.lantern, 0.35), 0.8), s)
  for (let i = 0; i < 5; i++) {
    const gx = x + 11 + (i % 3) * 4
    const gy = y + 13 + ((i / 3) | 0) * 5 + (on ? (s & 1) : 0)
    ellipse(c, gx, gy, 2, 1, PAL.leaf)
    px(c, gx - 1, gy - 1, PAL.grassLit)
  }
  rect(c, x + 7, y + 2, 19, 4, ramp(IRON).mid)
  hline(c, x + 7, y + 2, 19, ramp(IRON).spec)
  rect(c, x + 6, y + 4, 2, 6, IRON)
  rect(c, x + 25, y + 4, 2, 6, IRON)
  if (on) px(c, x + 16, y + 9 + (s & 3), withAlpha(PAL.cream, 0.6))
}

function iceCreamMaker(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A wooden bucket with staves and iron hoops.
  const r = ramp(PLANK_PALE)
  for (let i = 0; i < 22; i++) {
    const h = 16
    vline(c, x + 5 + i, y + 12, h, i % 3 === 0 ? r.dark : r.mid)
  }
  vline(c, x + 5, y + 12, 16, r.ink)
  vline(c, x + 26, y + 12, 16, r.ink)
  rect(c, x + 5, y + 12, 4, 16, r.lit)
  hline(c, x + 5, y + 28, 22, PAL.ink)
  for (let i = 0; i < 2; i++) hline(c, x + 5, y + 15 + i * 8, 22, IRON)
  rect(c, x + 3, y + 8, 26, 4, ramp(IRON).mid)
  hline(c, x + 3, y + 8, 26, ramp(IRON).spec)
  crank(c, x + 16, y + 5, 5, on ? s : 0, BRASS)
  // Ice chips packed round the outside, and a cone leaning on the bucket.
  for (let i = 0; i < 5; i++) {
    ellipse(c, x + 7 + i * 4, y + 29, 2, 1, withAlpha(PAL.sky, 0.7))
    px(c, x + 7 + i * 4, y + 28, PAL.cream)
  }
  for (let i = 0; i < 6; i++) hline(c, x + 27 - (i >> 1), y + 20 + i, 4 - (i >> 1), mixHex(PAL.lantern, PAL.bark, 0.3))
  ellipse(c, x + 28, y + 18, 3, 3, PAL.ink)
  ellipse(c, x + 28, y + 18, 2, 2, on ? mixHex(PAL.berry, PAL.cream, 0.5) : PAL.cream)
}

function candyMachine(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  funnel(c, x + 12, y + 3, 18, 8, 10, IRON)
  if (on) liquid(c, x + 4, y + 4, 16, 3, mixHex(PAL.berry, PAL.lantern, 0.5), s)
  slab(c, x + 5, y + 13, 16, 10, IRON)
  hline(c, x + 6, y + 18, 14, ramp(IRON).dark)
  // The pull hook, swinging as it pulls the sugar.
  const hookY = y + 12 + (on ? (s & 3) : 1)
  vline(c, x + 24, y + 6, hookY - y - 6, ramp(IRON).mid)
  rect(c, x + 22, hookY, 6, 3, PAL.ink)
  rect(c, x + 22, hookY, 5, 2, mixHex(PAL.berry, PAL.cream, 0.4))
  if (on) {
    for (let i = 0; i < 3; i++) px(c, x + 21 - i, hookY + 1 + (i & 1), mixHex(PAL.berry, PAL.cream, 0.5))
  }
  // Wrapped sweets in the tray below.
  slab(c, x + 3, y + 24, 26, 4, PLANK)
  for (let i = 0; i < 4; i++) {
    const cxp = x + 7 + i * 6
    ellipse(c, cxp, y + 22, 2, 2, PAL.ink)
    ellipse(c, cxp, y + 22, 1, 1, i % 2 === 0 ? PAL.berry : PAL.sky)
    px(c, cxp - 3, y + 22, PAL.cream)
    px(c, cxp + 3, y + 22, PAL.cream)
  }
}

function chocolateWorks(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A glass-fronted warming tank on legs, a spout, and a tempering table under it.
  rect(c, x + 3, y + 2, 26, 14, PAL.ink)
  slab(c, x + 4, y + 3, 24, 12, IRON)
  rect(c, x + 7, y + 5, 18, 8, PAL.ink)
  liquid(c, x + 8, y + 6, 16, 6, CHOC, s)
  rect(c, x + 8, y + 6, 3, 6, mixHex(CHOC, PAL.cream, 0.3))
  // The spout, with a ribbon of chocolate falling from it while it runs.
  funnel(c, x + 16, y + 16, 10, 4, 5, IRON)
  if (on) {
    rect(c, x + 15, y + 21, 2, 3, CHOC)
    rect(c, x + 15, y + 24 - (s & 1), 2, 2, mixHex(CHOC, PAL.cream, 0.3))
  }
  standLegs(c, x + 4, y + 27, 24, 4, PLANK)
  slab(c, x + 2, y + 23, 28, 5, STONE)
  ellipse(c, x + 16, y + 23, 8, 2, on ? CHOC : mixHex(CHOC, PAL.ink, 0.35))
  ellipse(c, x + 13, y + 22, 3, 1, mixHex(CHOC, PAL.cream, 0.4))
  // A bar mould at each end of the table, one turned out and scored into squares.
  for (let i = 0; i < 2; i++) {
    const mx = x + 2 + i * 21
    rect(c, mx, y + 19, 9, 5, PAL.ink)
    rect(c, mx + 1, y + 19, 7, 4, CHOC)
    hline(c, mx + 1, y + 19, 7, mixHex(CHOC, PAL.cream, 0.3))
    vline(c, mx + 3, y + 19, 4, mixHex(CHOC, PAL.ink, 0.4))
    vline(c, mx + 6, y + 19, 4, mixHex(CHOC, PAL.ink, 0.4))
  }
}

function coffeeKiosk(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 2, y + 24, 28, 6, PLANK)
  slab(c, x + 4, y + 8, 24, 16, IRON)
  hline(c, x + 5, y + 8, 22, ramp(IRON).spec)
  // The group head and a cup under it.
  rect(c, x + 8, y + 16, 8, 3, ramp(IRON).dark)
  rect(c, x + 10, y + 19, 4, 2, PAL.ink)
  if (on) {
    vline(c, x + 11, y + 21, 3, CHOC)
    vline(c, x + 13, y + 21, 3, CHOC)
  }
  rect(c, x + 8, y + 21, 9, 3, PAL.ink)
  rect(c, x + 9, y + 21, 7, 2, PAL.cream)
  rect(c, x + 10, y + 22, 5, 1, on ? CHOC : PAL.parchment)
  // Steam wand and its knob, and a warming tray of cups on the top.
  vline(c, x + 22, y + 16, 7, ramp(IRON).mid)
  px(c, x + 22, y + 23, PAL.ink)
  if (on) steam(c, x + 22, y + 14, s)
  ellipse(c, x + 25, y + 15, 2, 2, BRASS)
  for (let i = 0; i < 3; i++) {
    rect(c, x + 7 + i * 6, y + 4, 5, 4, PAL.ink)
    rect(c, x + 8 + i * 6, y + 4, 3, 3, PAL.cream)
  }
  rect(c, x + 4, y + 12, 24, 3, PAL.ink)
  rect(c, x + 5, y + 12, 22, 2, on ? PAL.lantern : ramp(IRON).dark)
}

function teaHouse(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A brazier under a round pot with a handle over the top.
  slab(c, x + 6, y + 24, 18, 6, IRON)
  if (on) fire(c, x + 9, y + 23, 12, s)
  ellipse(c, x + 14, y + 15, 10, 8, PAL.ink)
  ellipse(c, x + 14, y + 15, 9, 7, ramp(mixHex(PAL.leaf, PAL.dusk, 0.35)).mid)
  ellipse(c, x + 11, y + 12, 4, 3, ramp(mixHex(PAL.leaf, PAL.dusk, 0.35)).lit)
  ellipse(c, x + 9, y + 10, 1, 1, PAL.cream)
  // A spout that reads as a spout: tapered, rising, with an ink underside.
  const pot = ramp(mixHex(PAL.leaf, PAL.dusk, 0.35))
  for (let i = 0; i < 8; i++) {
    const sy = y + 15 - i
    const h = 5 - (i >> 1)
    rect(c, x + 22 + i, sy - h + 1, 1, h, pot.mid)
    px(c, x + 22 + i, sy, PAL.ink)
    px(c, x + 22 + i, sy - h + 1, pot.lit)
  }
  // The handle, an arc over the lid.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.06 + i * 0.11)
    const hx2 = x + 13 - Math.round(Math.cos(a) * 7)
    const hy2 = y + 8 - Math.round(Math.sin(a) * 6)
    px(c, hx2, hy2, PAL.ink)
    px(c, hx2, hy2 + 1, pot.mid)
  }
  rect(c, x + 10, y + 6, 9, 3, pot.dark)
  hline(c, x + 10, y + 6, 9, pot.lit)
  ellipse(c, x + 14, y + 4, 2, 2, pot.mid)
  px(c, x + 13, y + 3, pot.spec)
  if (on) {
    steam(c, x + 26, y + 8, s)
    vline(c, x + 26, y + 17, 3, mixHex(PAL.lantern, PAL.bark, 0.3))
  }
  // Two cups on a tray.
  slab(c, x + 21, y + 21, 10, 3, PLANK)
  for (let i = 0; i < 2; i++) {
    ellipse(c, x + 23 + i * 5, y + 20, 2, 2, PAL.ink)
    ellipse(c, x + 23 + i * 5, y + 20, 1, 1, on ? mixHex(PAL.lantern, PAL.bark, 0.25) : PAL.cream)
  }
}

function smelter(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 5, y + 8, 22, 22, STONE)
  for (let by = y + 12; by < y + 29; by += 5) {
    hline(c, x + 6, by, 20, ramp(STONE).dark)
    for (let bx = x + 8 + ((by >> 2) & 1 ? 5 : 0); bx < x + 26; bx += 10) px(c, bx, by - 2, ramp(STONE).ink)
  }
  // The chimney and the glowing mouth.
  rect(c, x + 18, y + 1, 8, 8, ramp(STONE).ink)
  rect(c, x + 19, y + 1, 6, 8, ramp(STONE).mid)
  vline(c, x + 19, y + 1, 8, ramp(STONE).lit)
  if (on) steam(c, x + 22, y - 1, s)
  for (let i = 0; i < 4; i++) hline(c, x + 9 + i, y + 14 + i, 12 - i * 2, PAL.ink)
  rect(c, x + 9, y + 17, 12, 9, PAL.ink)
  if (on) {
    fire(c, x + 10, y + 21, 10, s)
    ellipse(c, x + 15, y + 21, 8, 7, withAlpha(PAL.lantern, 0.22))
  } else {
    rect(c, x + 11, y + 22, 8, 3, mixHex(PAL.ink, PAL.berry, 0.25))
  }
  // Bellows on the lit side, squeezed on the beat.
  const squash = on ? (s & 1) : 0
  for (let i = 0; i < 6; i++) {
    hline(c, x + 1, y + 12 + i + squash * (i > 2 ? 1 : 0), 5 - (i > 3 ? 1 : 0), i % 2 === 0 ? ramp(PLANK).mid : ramp(PLANK).dark)
  }
  rect(c, x + 5, y + 15, 3, 2, ramp(IRON).mid)
  // A finished bar cooling in front.
  rect(c, x + 22, y + 27, 8, 4, PAL.ink)
  rect(c, x + 23, y + 27, 6, 3, on ? EMBER : IRON)
  hline(c, x + 23, y + 27, 6, on ? PAL.lantern : mixHex(IRON, PAL.cream, 0.5))
}

function keg(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  // A barrel on its side, on a cradle, hooped, with a tap at the front.
  slab(c, x + 3, y + 25, 26, 5, PLANK)
  for (let i = 0; i < 2; i++) {
    rect(c, x + 6 + i * 15, y + 21, 4, 5, ramp(PLANK).ink)
    rect(c, x + 6 + i * 15, y + 21, 3, 4, ramp(PLANK).mid)
  }
  const r = ramp(mixHex(PAL.bark, PAL.soil, 0.35))
  for (let i = 0; i < 26; i++) {
    const bulge = Math.round(Math.sin((i / 25) * Math.PI) * 2)
    const top = y + 8 - bulge
    const h = 14 + bulge * 2
    vline(c, x + 3 + i, top, h, r.mid)
    px(c, x + 3 + i, top, r.lit)
    px(c, x + 3 + i, top + 1, r.lit)
    px(c, x + 3 + i, top + h - 1, r.ink)
    if (i % 4 === 3) vline(c, x + 3 + i, top + 2, h - 3, r.dark)
  }
  vline(c, x + 3, y + 8, 14, r.ink)
  vline(c, x + 28, y + 8, 14, r.ink)
  for (const hoopX of [x + 8, x + 23]) {
    vline(c, hoopX, y + 6, 18, IRON)
    vline(c, hoopX + 1, y + 6, 18, mixHex(IRON, PAL.ink, 0.35))
  }
  // Bung on top, tap at the head, and a glass under it when it is pouring.
  ellipse(c, x + 16, y + 7, 3, 1, PAL.ink)
  ellipse(c, x + 16, y + 6, 2, 1, ramp(PLANK).lit)
  rect(c, x + 14, y + 18, 5, 3, BRASS)
  rect(c, x + 17, y + 20, 2, 3, BRASS)
  if (on) {
    // One drip working its way down the tap, four frames from lip to catch.
    vline(c, x + 18, y + 23, 2, mixHex(PAL.berry, PAL.lantern, 0.3))
    px(c, x + 18, y + 24 + s, mixHex(PAL.berry, PAL.cream, 0.4))
    ellipse(c, x + 18, y + 29, 2 + (s >> 1), 1, withAlpha(mixHex(PAL.berry, PAL.lantern, 0.3), 0.7))
  }
}

/** An unknown machine kind still gets a crate, a lid and a working lamp. */
function genericMachine(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  slab(c, x + 4, y + 8, 24, 22, PLANK)
  for (let i = 0; i < 3; i++) hline(c, x + 5, y + 13 + i * 6, 22, ramp(PLANK).dark)
  slab(c, x + 2, y + 4, 28, 5, IRON)
  hline(c, x + 2, y + 4, 28, ramp(IRON).spec)
  rect(c, x + 10, y + 16, 12, 9, PAL.ink)
  rect(c, x + 11, y + 17, 10, 7, on ? mixHex(PAL.lantern, PAL.bark, 0.3) : mixHex(PAL.ink, PAL.dusk, 0.35))
  if (on) {
    px(c, x + 13 + ((s * 3) % 7), y + 20, PAL.lantern)
    steam(c, x + 24, y + 2, s)
  }
  ellipse(c, x + 25, y + 12, 2, 2, on ? PAL.lantern : ramp(IRON).dark)
}

const MACHINE_DRAW: Readonly<Record<string, MachineDraw>> = {
  'feed-mill': feedMill,
  sawmill,
  mill,
  dairy,
  bakery: bakeryOven,
  'pie-oven': pieOven,
  'sugar-mill': sugarMill,
  'jam-maker': jamMaker,
  'juice-press': juicePress,
  'oil-press': oilPress,
  loom,
  'sewing-machine': sewingBench,
  'dye-vat': dyeVat,
  'honey-extractor': honeyHouse,
  'popcorn-pot': popcornPot,
  'bbq-grill': bbqGrill,
  'soup-kitchen': soupKitchen,
  'salad-bar': saladBar,
  'sauce-maker': sauceMaker,
  'pasta-maker': pastaMaker,
  'candle-maker': candleMaker,
  'soap-maker': soapMaker,
  'preserves-jar': preservesJar,
  'ice-cream-maker': iceCreamMaker,
  'candy-machine': candyMachine,
  'chocolate-works': chocolateWorks,
  'coffee-kiosk': coffeeKiosk,
  'tea-house': teaHouse,
  smelter,
  keg,
}

/** The ready pulse: a warm halo and a collected-output pip on the lit corner. */
function readyGlow(c: Ctx, x: number, y: number, beat: number): void {
  const strong = prefersReducedMotion() ? 1 : beat & 1
  const a = strong ? 0.34 : 0.2
  outline(c, x + 1, y + 1, TILE - 2, TILE - 2, withAlpha(PAL.lantern, a))
  outline(c, x, y, TILE, TILE, withAlpha(PAL.lantern, a * 0.5))
  ellipse(c, x + 26, y + 6, 4, 4, withAlpha(PAL.lantern, a + 0.2))
  ellipse(c, x + 26, y + 6, 2, 2, PAL.cream)
  px(c, x + 25, y + 5, PAL.cream)
}

/**
 * One machine on its single tile. Idle when nothing is queued, a four-frame working
 * cycle while a job runs, and a ready pulse when output is waiting to be collected —
 * `docs/GRAPHICS.md` section 6. `frame` is the 60 fps counter.
 */
export function drawMachine(
  ctx: Ctx,
  def: MachineDef,
  machine: Machine,
  sx: number,
  sy: number,
  frame: number,
): void {
  const beat = beatOf(frame)
  const working = machine.queue.length > 0
  const ready = machine.ready.length > 0
  const step = working ? beat & 3 : 0

  ellipse(ctx, sx + 16, sy + 30, 13, 3, withAlpha(PAL.ink, 0.28))
  const draw = MACHINE_DRAW[def.kind] ?? genericMachine
  draw(ctx, sx, sy, step, working)
  if (ready) readyGlow(ctx, sx, sy, beat)
}

/** The shop and queue icon: the same machine, idle and still, in a `MACHINE_ICON` box. */
export function drawMachineIcon(ctx: Ctx, def: MachineDef, sx: number, sy: number): void {
  ellipse(ctx, sx + 16, sy + 30, 13, 2, withAlpha(PAL.ink, 0.22))
  const draw = MACHINE_DRAW[def.kind] ?? genericMachine
  draw(ctx, sx, sy, 0, false)
}
