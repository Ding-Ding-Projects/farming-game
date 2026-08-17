import type { Season, Weather } from '../game/types'
import { LOGICAL_W, TILE, WORLD_H, WORLD_Y } from '../game/constants'
import type { Ramp } from '../engine/palette'
import { PAL, ramp, shade, withAlpha } from '../engine/palette'
import { ellipse, hline, px, rect, vline } from '../engine/pixel'
import { artNoise, beatOf, mixHex, prefersReducedMotion } from './tiles'

/**
 * Scenery, weather and light at 32 px tiles.
 *
 * Everything here is built from the five-tone ramp of `docs/GRAPHICS.md` section 5 —
 * `ink` outline, dark side, mid body, lit edge, `cream` specular — with the light
 * falling from the upper left, always.
 */

/* ------------------------------------------------------------------ *
 * Materials. Ramps are memoised by `ramp`, so these are one object each.
 * ------------------------------------------------------------------ */

const STONE_RAMP = ramp(mixHex(PAL.dusk, PAL.cream, 0.34))
/** Sawn timber: bark warmed toward soil, or the whole house reads grey. */
const PLANK_RAMP = ramp(mixHex(PAL.bark, PAL.soil, 0.5))
/** Cedar shingle: bark warmed with soil, then knocked back, so it stays wood not slate. */
const ROOF_RAMP = ramp(shade(mixHex(PAL.bark, PAL.soil, 0.3), -0.14))
const DOOR_RAMP = ramp(mixHex(PAL.bark, PAL.ink, 0.28))
const TRUNK_RAMP = ramp(mixHex(PAL.bark, PAL.soil, 0.25))

const ROOF_SHADE = mixHex(ROOF_RAMP.dark, PAL.ink, 0.42)
const ROOF_MIDLIT = mixHex(ROOF_RAMP.mid, ROOF_RAMP.lit, 0.5)
/** The far pitch is in shade, not in a hole: it keeps enough tone to show its courses. */
const ROOF_SHADED_PITCH = mixHex(ROOF_RAMP.dark, ROOF_RAMP.mid, 0.4)
/** Course lines and shingle joints: a step off each pitch, never a black grid. */
const ROOF_SEAM_LIT = mixHex(ROOF_RAMP.lit, ROOF_RAMP.mid, 0.55)
const ROOF_SEAM_DARK = mixHex(ROOF_RAMP.dark, PAL.ink, 0.3)
const PLANK_MIDLIT = mixHex(PLANK_RAMP.mid, PLANK_RAMP.lit, 0.5)
const PLANK_MIDDARK = mixHex(PLANK_RAMP.mid, PLANK_RAMP.dark, 0.5)
const EAVE_SHADOW = mixHex(PLANK_RAMP.dark, PAL.ink, 0.45)
const MORTAR = mixHex(PAL.dusk, PAL.ink, 0.4)

const SASH = mixHex(PAL.cream, PAL.bark, 0.24)
const SASH_DARK = mixHex(SASH, PAL.ink, 0.42)
const GLASS = mixHex(PAL.sky, PAL.shadow, 0.62)
const GLASS_LIT = mixHex(PAL.sky, PAL.shadow, 0.3)
const PANE_WARM = mixHex(PAL.lantern, PAL.cream, 0.42)
const PANE_DEEP = mixHex(PAL.lantern, PAL.bark, 0.3)
const CURTAIN = mixHex(PAL.bark, PAL.ink, 0.2)

const SMOKE = mixHex(PAL.dusk, PAL.cream, 0.55)
const SMOKE_DARK = mixHex(PAL.dusk, PAL.shadow, 0.4)

const CONTACT = withAlpha(PAL.ink, 0.3)
const CONTACT_SOFT = withAlpha(PAL.ink, 0.16)

/* ------------------------------------------------------------------ *
 * The ambient sub-clock.
 *
 * `drawFarmhouse` and `drawTree` carry no frame argument — their signatures are
 * fixed by `docs/ARCHITECTURE.md` and by every caller — but chimney smoke and the
 * canopy sway both animate on the 6 fps sub-clock. So the clock is held here: the
 * renderer may push its own 60 fps counter with `setAmbientFrame`, and until it
 * does, one is derived from wall time at the same 60 fps rate. Either way the beat
 * comes out of `beatOf`, which is what freezes it flat under reduced motion.
 * ------------------------------------------------------------------ */

const FRAME_MS = 1000 / 60
let ambientFrame = -1

/**
 * Hand the scenery layer the renderer's 60 fps frame counter, so ambient motion in
 * sprites that take no `frame` argument runs on exactly the same beat as everything
 * else on screen. Optional: without it the beat follows wall time.
 */
export function setAmbientFrame(frame: number): void {
  const f = Math.floor(frame)
  ambientFrame = f < 0 ? 0 : f
}

/** The 6 fps beat for sprites that are handed no frame. Zero under reduced motion. */
function ambientBeat(): number {
  return beatOf(ambientFrame >= 0 ? ambientFrame : Math.floor(Date.now() / FRAME_MS))
}

/* ------------------------------------------------------------------ *
 * Farmhouse — 3x3 tiles, 96x96, drawn from its top-left corner.
 *
 * The footprint is fixed by `game/state.ts`: tiles (1,0)..(3,2) with the doorstep
 * directly below the middle column, so the door is centred on the middle tile and
 * nothing reaches above the top edge — row 0 sits against the HUD.
 * ------------------------------------------------------------------ */

const APEX = 48
const RIDGE_Y = 17
const ROOF_ROWS = 33
const EAVE_Y = RIDGE_Y + ROOF_ROWS

const CHIM_X = 62
const CHIM_W = 16
const CHIM_Y = 9
const CHIM_H = 32

const WALL_X = 10
const WALL_W = 76
const WALL_Y = 54
const WALL_H = 30

const BASE_X = 6
const BASE_W = 84
const BASE_Y = 82
const BASE_H = 10

const DOOR_X = 40
const DOOR_W = 18
const DOOR_Y = 58
const DOOR_H = 34

const WIN_S = 18
const WIN_Y = 58
const WIN_LX = 16
const WIN_RX = 64

export function drawFarmhouse(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  season: Season,
  lit: boolean,
): void {
  const winter = season === 'winter'

  // Hard cast shadow, down-right, no blur.
  rect(ctx, sx + 12, sy + 92, 88, 3, CONTACT)
  rect(ctx, sx + 18, sy + 95, 78, 1, CONTACT_SOFT)

  chimney(ctx, sx, sy, winter)
  if (lit) chimneySmoke(ctx, sx + CHIM_X + (CHIM_W >> 1), sy + CHIM_Y)
  roof(ctx, sx, sy, winter)
  walls(ctx, sx, sy)
  houseWindow(ctx, sx + WIN_LX, sy + WIN_Y, lit, winter)
  houseWindow(ctx, sx + WIN_RX, sy + WIN_Y, lit, winter)
  stoneBase(ctx, sx, sy, winter)
  flowerBox(ctx, sx + WIN_RX - 3, sy + 82, season)
  door(ctx, sx + DOOR_X, sy + DOOR_Y, winter)

  if (lit) lampSpill(ctx, sx, sy)
}

function chimney(ctx: CanvasRenderingContext2D, sx: number, sy: number, winter: boolean): void {
  const x = sx + CHIM_X
  const y = sy + CHIM_Y
  const s = STONE_RAMP

  rect(ctx, x - 1, y - 1, CHIM_W + 2, CHIM_H + 1, PAL.ink)
  rect(ctx, x, y, CHIM_W, CHIM_H, s.mid)

  // The cap oversails the stack by a pixel each side and takes the light square on.
  rect(ctx, x - 1, y, CHIM_W + 2, 4, s.mid)
  hline(ctx, x - 1, y, CHIM_W + 2, s.lit)
  hline(ctx, x - 1, y + 3, CHIM_W + 2, s.dark)
  hline(ctx, x + 1, y + 1, 3, s.spec)

  // Stack: lit on the left, falling away to the right.
  vline(ctx, x, y + 4, CHIM_H - 4, s.lit)
  vline(ctx, x + 1, y + 4, CHIM_H - 4, mixHex(s.mid, s.lit, 0.5))
  vline(ctx, x + CHIM_W - 1, y + 4, CHIM_H - 4, s.dark)
  vline(ctx, x + CHIM_W - 2, y + 4, CHIM_H - 4, mixHex(s.mid, s.dark, 0.5))

  // Mortar courses with staggered joints, so it reads as laid stone.
  for (let c = 0; c < 4; c++) {
    const cy = y + 8 + c * 6
    if (cy >= y + CHIM_H) break
    hline(ctx, x + 1, cy, CHIM_W - 2, MORTAR)
    const jx = x + ((c & 1) === 0 ? 5 : 10)
    vline(ctx, jx, cy - 5, 5, MORTAR)
  }

  // The flue mouth, dark inside.
  rect(ctx, x + 4, y + 1, CHIM_W - 8, 2, mixHex(PAL.ink, PAL.shadow, 0.4))
  if (winter) {
    hline(ctx, x - 1, y, CHIM_W + 2, PAL.cream)
    hline(ctx, x, y + 1, CHIM_W, withAlpha(PAL.cream, 0.55))
  }
}

/** Four frames of smoke, only when the house is lit. Rises left-to-right and thins. */
function chimneySmoke(ctx: CanvasRenderingContext2D, cx: number, capY: number): void {
  const f = ambientBeat() & 3
  for (let i = 0; i < 3; i++) {
    const age = (f + i) & 3
    const y = capY - 1 - age * 2
    const x = cx + age + (i === 1 ? -2 : 0)
    const r = age < 2 ? 1 : 2
    const a = 0.5 - age * 0.11
    ellipse(ctx, x, y, r + 1, r, withAlpha(SMOKE_DARK, a * 0.55))
    ellipse(ctx, x, y, r, r - 1, withAlpha(SMOKE, a))
  }
}

function roof(ctx: CanvasRenderingContext2D, sx: number, sy: number, winter: boolean): void {
  const r5 = ROOF_RAMP

  for (let r = 0; r < ROOF_ROWS; r++) {
    const half = 5 + Math.round(r * 1.21)
    const y = sy + RIDGE_Y + r
    const x0 = sx + APEX - half
    const w = half * 2

    hline(ctx, x0 - 1, y, w + 2, r5.ink)
    // The left pitch takes the light square on; the right pitch turns away from it.
    hline(ctx, x0, y, half, r5.lit)
    hline(ctx, sx + APEX, y, half, ROOF_SHADED_PITCH)

    // Barge boards.
    hline(ctx, x0, y, 2, r5.spec)
    px(ctx, x0 + 2, y, ROOF_MIDLIT)
    hline(ctx, x0 + w - 2, y, 2, ROOF_SHADE)

    // The ridge itself catches the sky.
    if (r === 0) {
      hline(ctx, x0, y, w, r5.spec)
    } else if (r === 1) {
      hline(ctx, x0, y, w, ROOF_MIDLIT)
    }

    // Shingle courses every five rows, joints anchored to the ridge so they stack
    // vertically instead of fanning out with the widening rows.
    const course = Math.floor(r / 5)
    if (r % 5 === 4) {
      hline(ctx, x0 + 1, y, half - 1, ROOF_SEAM_LIT)
      hline(ctx, sx + APEX, y, half - 1, ROOF_SEAM_DARK)
    } else if (r % 5 === 1 || r % 5 === 2) {
      const step = 9
      const anchor = sx + APEX + ((course & 1) === 0 ? 0 : 4)
      const first = anchor - Math.ceil((anchor - x0 - 2) / step) * step
      for (let jx = first; jx < x0 + w - 2; jx += step) {
        if (jx <= x0 + 2) continue
        px(ctx, jx, y, jx < sx + APEX ? ROOF_SEAM_LIT : ROOF_SEAM_DARK)
      }
    }

    if (winter) snowOnRoof(ctx, x0, y, w, r)
  }

  eaves(ctx, sx, sy, winter)
}

function snowOnRoof(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y: number,
  w: number,
  r: number,
): void {
  // Snow lies deep along the ridge and slides off the pitch below it, catching on
  // the lip of each shingle course. A dither over the whole slope reads as static.
  if (r < 4) {
    hline(ctx, x0, y, w, PAL.cream)
  } else if (r < 10) {
    hline(ctx, x0, y, w, withAlpha(PAL.cream, 0.8 - (r - 4) * 0.12))
  } else if (r % 5 === 0) {
    for (let k = 0; k < w; k++) {
      if (artNoise(x0 + k, y) > 0.42) px(ctx, x0 + k, y, withAlpha(PAL.cream, 0.4))
    }
  }
  hline(ctx, x0, y, 2, PAL.cream)
}

function eaves(ctx: CanvasRenderingContext2D, sx: number, sy: number, winter: boolean): void {
  const x = sx + 2
  const y = sy + EAVE_Y
  const w = 92
  const r5 = ROOF_RAMP

  rect(ctx, x - 1, y, w + 2, 4, PAL.ink)
  rect(ctx, x, y, w, 3, r5.mid)
  hline(ctx, x, y, w, ROOF_MIDLIT)
  hline(ctx, x, y + 2, w, ROOF_SHADE)

  // Rafter tails ticking along the underside.
  for (let k = 4; k < w - 3; k += 8) px(ctx, x + k, y + 2, PAL.ink)

  if (!winter) return
  hline(ctx, x, y, w, PAL.cream)
  for (let k = 0; k < w; k += 1) {
    if (artNoise(k, 5) > 0.72) px(ctx, x + k, y + 1, withAlpha(PAL.cream, 0.4))
  }
  // Icicles, longest where the roof valleys drain.
  const drips = [9, 23, 38, 55, 71, 84]
  for (let i = 0; i < drips.length; i++) {
    const dx = x + drips[i]
    const len = 2 + Math.floor(artNoise(i, 61) * 4)
    for (let k = 0; k < len; k++) {
      px(ctx, dx, y + 4 + k, withAlpha(PAL.cream, 0.85 - k * 0.14))
    }
  }
}

function walls(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const x = sx + WALL_X
  const y = sy + WALL_Y
  const w = WALL_W
  const h = WALL_H
  const p = PLANK_RAMP

  vline(ctx, x - 1, y, h, PAL.ink)
  vline(ctx, x + w, y, h, PAL.ink)
  rect(ctx, x, y, w, h, p.mid)

  // Clapboard courses: a lit lip on top of every board, its shadow underneath.
  for (let c = 0; c * 6 < h; c++) {
    const cy = y + c * 6
    hline(ctx, x, cy, w, p.lit)
    hline(ctx, x, cy + 1, w, PLANK_MIDLIT)
    if (cy + 5 < y + h) hline(ctx, x, cy + 5, w, p.dark)
    // Staggered board ends.
    for (let k = 0; k < 4; k++) {
      const jx = x + 7 + ((c & 1) === 0 ? 0 : 13) + k * 24
      if (jx < x + w - 1) vline(ctx, jx, cy + 1, 4, PLANK_MIDDARK)
    }
  }

  // Grain nicks, deterministic per position so the wall never crawls.
  for (let i = 0; i < 16; i++) {
    const gx = x + 2 + Math.floor(artNoise(i, 11) * (w - 5))
    const gy = y + 3 + Math.floor(artNoise(i, 12) * (h - 6))
    px(ctx, gx, gy, p.dark)
    if (artNoise(i, 13) > 0.6) px(ctx, gx + 1, gy, PLANK_MIDDARK)
  }

  // Corner posts: into the light on the left, away from it on the right.
  vline(ctx, x, y, h, p.lit)
  vline(ctx, x + 1, y, h, PLANK_MIDLIT)
  vline(ctx, x + w - 1, y, h, p.dark)
  vline(ctx, x + w - 2, y, h, PLANK_MIDDARK)

  // The eave shadow lies across the top of the wall.
  rect(ctx, x, y, w, 2, EAVE_SHADOW)
  hline(ctx, x, y + 2, w, mixHex(p.dark, PAL.ink, 0.18))
}

function houseWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lit: boolean,
  winter: boolean,
): void {
  const s = WIN_S

  // Lantern light bleeding onto the boards around the frame.
  if (lit) warmPool(ctx, x + (s >> 1), y + (s >> 1), 20, 18, 4, 0.05)

  // Head board and sill, both bark, both reading as boards in their own right.
  rect(ctx, x - 3, y - 4, s + 6, 3, PAL.ink)
  rect(ctx, x - 2, y - 4, s + 4, 2, PLANK_RAMP.mid)
  hline(ctx, x - 2, y - 4, s + 4, PLANK_RAMP.lit)
  rect(ctx, x - 4, y + s + 1, s + 8, 4, PAL.ink)
  rect(ctx, x - 3, y + s + 1, s + 6, 3, PLANK_RAMP.mid)
  hline(ctx, x - 3, y + s + 1, s + 6, PLANK_RAMP.lit)
  hline(ctx, x - 3, y + s + 3, s + 6, PLANK_RAMP.dark)
  hline(ctx, x - 2, y + s + 5, s + 4, withAlpha(PAL.ink, 0.35))

  // Sash.
  rect(ctx, x - 2, y - 2, s + 4, s + 4, PAL.ink)
  rect(ctx, x - 1, y - 1, s + 2, s + 2, SASH)
  hline(ctx, x - 1, y + s, s + 2, SASH_DARK)
  vline(ctx, x + s, y - 1, s + 2, SASH_DARK)

  // Glass.
  if (lit) {
    rect(ctx, x, y, s, s, PANE_WARM)
    rect(ctx, x, y, s, 5, mixHex(PANE_WARM, PAL.cream, 0.5))
    rect(ctx, x, y + s - 5, s, 5, PANE_DEEP)
    // Curtains gathered in the upper corners.
    for (let k = 0; k < 5; k++) {
      vline(ctx, x + k, y, 5 - k, CURTAIN)
      vline(ctx, x + s - 1 - k, y, 5 - k, CURTAIN)
    }
  } else {
    rect(ctx, x, y, s, s, GLASS)
    rect(ctx, x, y, s, 4, GLASS_LIT)
    // A raked reflection, upper left, where the sky lands on the pane.
    for (let k = 0; k < 9; k++) {
      px(ctx, x + 1 + k, y + 10 - k, withAlpha(PAL.cream, 0.2))
      px(ctx, x + 2 + k, y + 10 - k, withAlpha(PAL.cream, 0.12))
    }
  }

  // Mullions: two lights across, two down.
  rect(ctx, x + 8, y, 2, s, SASH)
  rect(ctx, x, y + 8, s, 2, SASH)
  vline(ctx, x + 9, y, s, SASH_DARK)
  hline(ctx, x, y + 9, s, SASH_DARK)

  if (winter) {
    for (let i = 0; i < 10; i++) {
      const fx = x + Math.floor(artNoise(i, 71) * s)
      const fy = y + Math.floor(artNoise(i, 72) * s)
      const edge = Math.min(fx - x, fy - y, x + s - 1 - fx, y + s - 1 - fy)
      if (edge > 3) continue
      px(ctx, fx, fy, withAlpha(PAL.cream, 0.5))
    }
  }
}

function stoneBase(ctx: CanvasRenderingContext2D, sx: number, sy: number, winter: boolean): void {
  const x = sx + BASE_X
  const y = sy + BASE_Y
  const w = BASE_W
  const h = BASE_H
  const s = STONE_RAMP

  rect(ctx, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(ctx, x, y, w, h, MORTAR)

  // Two staggered courses of laid stone, each stone lit on its own upper left.
  for (let c = 0; c < 2; c++) {
    const cy = y + 1 + c * 5
    let cx = x + 1 - (c === 1 ? 6 : 0)
    while (cx < x + w - 1) {
      const sw = 9 + Math.floor(artNoise(cx, 90 + c) * 5)
      const x0 = cx < x + 1 ? x + 1 : cx
      const x1 = Math.min(cx + sw, x + w - 1)
      const bw = x1 - x0
      if (bw > 1) {
        rect(ctx, x0, cy, bw, 4, s.mid)
        hline(ctx, x0, cy, bw, s.lit)
        hline(ctx, x0, cy + 3, bw, s.dark)
        vline(ctx, x1 - 1, cy, 4, s.dark)
        if (bw > 4) px(ctx, x0 + 1, cy + 1, s.spec)
        if (artNoise(cx, 95 + c) > 0.6) px(ctx, x0 + 3, cy + 2, s.dark)
      }
      cx += sw + 1
    }
  }

  hline(ctx, x, y + h - 1, w, mixHex(PAL.ink, PAL.dusk, 0.3))
  if (!winter) return
  for (let k = 0; k < w; k++) {
    if (artNoise(k, 96) > 0.4) px(ctx, x + k, y, withAlpha(PAL.cream, 0.6))
  }
}

function flowerBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  season: Season,
): void {
  const w = 24
  const h = 8

  rect(ctx, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(ctx, x, y, w, h, PLANK_RAMP.mid)
  hline(ctx, x, y, w, PLANK_RAMP.lit)
  hline(ctx, x, y + h - 1, w, PLANK_RAMP.dark)
  vline(ctx, x, y, h, PLANK_MIDLIT)
  vline(ctx, x + w - 1, y, h, PLANK_RAMP.dark)
  rect(ctx, x + 2, y + 1, w - 4, 2, PAL.soilWet)
  // Two feet, so the planter stands on the stone rather than floating against it.
  vline(ctx, x + 3, y + h, 2, PAL.ink)
  vline(ctx, x + w - 4, y + h, 2, PAL.ink)

  const winter = season === 'winter'
  const bloom =
    season === 'spring'
      ? PAL.cream
      : season === 'summer'
        ? mixHex(PAL.lantern, PAL.cream, 0.45)
        : season === 'fall'
          ? mixHex(PAL.lantern, PAL.bark, 0.25)
          : mixHex(PAL.cream, PAL.sky, 0.3)
  const stalk = winter ? mixHex(PAL.leaf, PAL.cream, 0.3) : PAL.leaf
  const stalkLit = winter ? PAL.cream : mixHex(PAL.grassLit, PAL.cream, 0.15)

  for (let i = 0; i < 6; i++) {
    const bx = x + 2 + i * 4
    const tall = 3 + Math.floor(artNoise(i, 120) * 3)
    for (let k = 0; k < tall; k++) px(ctx, bx, y - 1 - k, k === tall - 1 ? stalkLit : stalk)
    px(ctx, bx - 1, y - 2, stalk)
    if (winter && (i & 1) === 1) continue
    px(ctx, bx, y - 1 - tall, bloom)
    px(ctx, bx - 1, y - tall, mixHex(bloom, PAL.ink, 0.25))
    px(ctx, bx + 1, y - tall, bloom)
  }
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number, winter: boolean): void {
  const w = DOOR_W
  const h = DOOR_H
  const d = DOOR_RAMP

  // Frame: a proper cased opening, two pixels proud of the leaf.
  rect(ctx, x - 4, y - 4, w + 8, h + 4, PAL.ink)
  rect(ctx, x - 3, y - 3, w + 6, h + 3, PLANK_RAMP.mid)
  hline(ctx, x - 3, y - 3, w + 6, PLANK_RAMP.lit)
  vline(ctx, x - 3, y - 3, h + 3, PLANK_RAMP.lit)
  vline(ctx, x + w + 2, y - 3, h + 3, PLANK_RAMP.dark)
  rect(ctx, x - 1, y - 1, w + 2, h + 1, PAL.ink)

  // Leaf: five vertical boards.
  rect(ctx, x, y, w, h, d.mid)
  for (let k = 6; k < w; k += 6) {
    vline(ctx, x + k, y, h, d.ink)
    vline(ctx, x + k - 1, y, h, d.dark)
    vline(ctx, x + k + 1, y, h, mixHex(d.mid, d.lit, 0.5))
  }
  vline(ctx, x, y, h, d.lit)
  vline(ctx, x + w - 1, y, h, d.dark)
  hline(ctx, x, y, w, d.lit)

  // Ledge and brace: two rails and the diagonal between them.
  rect(ctx, x + 1, y + 4, w - 2, 2, d.dark)
  hline(ctx, x + 1, y + 4, w - 2, mixHex(d.mid, d.lit, 0.4))
  rect(ctx, x + 1, y + h - 9, w - 2, 2, d.dark)
  hline(ctx, x + 1, y + h - 9, w - 2, mixHex(d.mid, d.lit, 0.4))
  for (let k = 0; k < w - 2; k++) {
    const by = y + h - 9 - Math.round((k * (h - 15)) / (w - 3))
    px(ctx, x + 1 + k, by, d.dark)
    px(ctx, x + 1 + k, by + 1, mixHex(d.mid, d.lit, 0.3))
  }

  // Strap hinges on the light side, latch and handle on the other.
  for (let i = 0; i < 2; i++) {
    const hy = y + 5 + i * (h - 15)
    rect(ctx, x, hy, 8, 2, mixHex(PAL.dusk, PAL.ink, 0.3))
    hline(ctx, x, hy, 8, mixHex(PAL.dusk, PAL.cream, 0.35))
  }
  rect(ctx, x + w - 6, y + 16, 4, 3, PAL.ink)
  rect(ctx, x + w - 6, y + 16, 4, 2, PAL.lantern)
  px(ctx, x + w - 6, y + 16, mixHex(PAL.lantern, PAL.cream, 0.6))
  px(ctx, x + w - 4, y + 20, mixHex(PAL.lantern, PAL.ink, 0.35))

  // Threshold stone, standing a little proud of the foundation.
  rect(ctx, x - 4, y + h - 2, w + 8, 3, PAL.ink)
  rect(ctx, x - 3, y + h - 2, w + 6, 2, STONE_RAMP.mid)
  hline(ctx, x - 3, y + h - 2, w + 6, STONE_RAMP.lit)
  if (winter) hline(ctx, x - 3, y + h - 2, w + 6, withAlpha(PAL.cream, 0.55))
}

/**
 * Nested ellipses of a low alpha: each ring adds `a`, so the centre reaches
 * `steps * a` and the edge fades out. No blur, no gradient — just stacked pixels.
 */
function warmPool(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  steps: number,
  a: number,
): void {
  const tint = withAlpha(PAL.lantern, a)
  for (let i = steps; i >= 1; i--) {
    ellipse(ctx, cx, cy, Math.round((rx * i) / steps), Math.round((ry * i) / steps), tint)
  }
}

/** Lantern light pooling on the ground in front of a lit house. */
function lampSpill(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  warmPool(ctx, sx + WIN_LX + (WIN_S >> 1), sy + 100, 20, 8, 4, 0.045)
  warmPool(ctx, sx + WIN_RX + (WIN_S >> 1), sy + 100, 22, 9, 4, 0.045)
  warmPool(ctx, sx + DOOR_X + (DOOR_W >> 1), sy + 97, 15, 6, 3, 0.05)
}

/* ------------------------------------------------------------------ *
 * Tree — one 32x32 tile. Seasonal canopy, 3-frame sway.
 * ------------------------------------------------------------------ */

interface Lobe {
  readonly dx: number
  readonly dy: number
  readonly rx: number
  readonly ry: number
  /** How much of the sway this lobe takes. The crown moves, the skirt barely does. */
  readonly sway: number
}

const CANOPY_LOBES: readonly Lobe[] = [
  { dx: -1, dy: -1, rx: 10, ry: 9, sway: 0.5 },
  { dx: -5, dy: -4, rx: 7, ry: 6, sway: 1 },
  { dx: 6, dy: -3, rx: 6, ry: 5, sway: 1 },
  { dx: 0, dy: 5, rx: 7, ry: 4, sway: 0.25 },
]

/** Row spans of the canopy, reused every call so a wood of trees allocates nothing. */
const EMPTY_LO = 32767
const EMPTY_HI = -32768
const BODY_X0 = new Int16Array(TILE)
const BODY_X1 = new Int16Array(TILE)
const EDGE_X0 = new Int16Array(TILE)
const EDGE_X1 = new Int16Array(TILE)

/** Three distinct sway frames, held one beat at the extremes: -1, 0, +1, 0. */
const SWAY_STEP = [-1, 0, 1, 0] as const

/** The wind holds a direction for about four seconds, then may turn. */
function windDir(beat: number): number {
  return artNoise(Math.floor(beat / 24), 91) > 0.5 ? 1 : -1
}

export function drawTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  season: Season,
  variant: number,
): void {
  const beat = ambientBeat()
  const sway = SWAY_STEP[(beat + (variant & 1)) & 3] * windDir(beat)

  // Contact shadow, thrown down-right away from the light.
  ellipse(ctx, sx + 18, sy + 30, 10, 2, CONTACT)
  ellipse(ctx, sx + 18, sy + 30, 6, 1, withAlpha(PAL.ink, 0.2))

  if (season === 'winter') {
    bareTree(ctx, sx, sy, variant, sway)
    return
  }

  trunk(ctx, sx, sy, 12, variant)
  canopy(ctx, sx, sy, season, variant, sway)

  if (season === 'fall' && !prefersReducedMotion()) fallingLeaves(ctx, sx, sy, variant, beat)
}

function leafRamp(season: Season, variant: number): Ramp {
  if (season === 'fall') {
    return ramp(mixHex(PAL.lantern, PAL.bark, (variant & 1) === 0 ? 0.42 : 0.55))
  }
  if (season === 'spring') return ramp(mixHex(PAL.leaf, PAL.grassLit, 0.55))
  return ramp(mixHex(PAL.leaf, PAL.grassLit, (variant & 1) === 0 ? 0.3 : 0.42))
}

function canopy(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  season: Season,
  variant: number,
  sway: number,
): void {
  const r5 = leafRamp(season, variant)
  const cx = sx + 16
  const cy = sy + 12

  // A row with no lobe over it keeps hi < lo, which is how "empty" reads below.
  BODY_X0.fill(EMPTY_LO)
  BODY_X1.fill(EMPTY_HI)
  EDGE_X0.fill(EMPTY_LO)
  EDGE_X1.fill(EMPTY_HI)

  for (let i = 0; i < CANOPY_LOBES.length; i++) {
    const lobe = CANOPY_LOBES[i]
    // A pixel of jitter per lobe per tree, so no two trees share a silhouette.
    const jx = artNoise(variant, 200 + i) > 0.55 ? 1 : 0
    const jy = artNoise(variant, 220 + i) > 0.62 ? 1 : 0
    const ox = cx + lobe.dx + Math.round(lobe.sway * sway) + jx
    const oy = cy + lobe.dy
    spanLobe(BODY_X0, BODY_X1, sy, ox, oy, lobe.rx + jx, lobe.ry + jy)
    spanLobe(EDGE_X0, EDGE_X1, sy, ox, oy, lobe.rx + jx + 1, lobe.ry + jy + 1)
  }

  let top = TILE
  let bottom = 0
  for (let r = 0; r < TILE; r++) {
    if (BODY_X1[r] < BODY_X0[r]) continue
    if (r < top) top = r
    if (r > bottom) bottom = r
  }
  if (bottom < top) return
  const span = bottom - top

  for (let r = 0; r < TILE; r++) {
    if (EDGE_X1[r] >= EDGE_X0[r]) {
      hline(ctx, EDGE_X0[r], sy + r, EDGE_X1[r] - EDGE_X0[r] + 1, r5.ink)
    }
  }

  for (let r = top; r <= bottom; r++) {
    const x0 = BODY_X0[r]
    const w = BODY_X1[r] - x0 + 1
    if (w < 1) continue
    const y = sy + r
    const t = span === 0 ? 0 : (r - top) / span

    hline(ctx, x0, y, w, r5.mid)
    if (t < 0.14) {
      // The crown takes the sky full on.
      hline(ctx, x0, y, w, r5.lit)
      hline(ctx, x0 + w - 2, y, 2, r5.mid)
    } else if (t < 0.32) {
      hline(ctx, x0, y, Math.max(2, Math.round(w * 0.62)), r5.lit)
      hline(ctx, x0 + Math.max(0, w - 3), y, Math.min(3, w), r5.dark)
    } else if (t < 0.58) {
      hline(ctx, x0, y, Math.min(5, w), r5.lit)
      hline(ctx, x0 + Math.max(0, w - 5), y, Math.min(5, w), r5.dark)
    } else if (t < 0.84) {
      hline(ctx, x0, y, Math.min(3, w), mixHex(r5.mid, r5.lit, 0.5))
      hline(ctx, x0 + Math.max(0, w - 8), y, Math.min(8, w), r5.dark)
    } else {
      hline(ctx, x0, y, w, r5.dark)
      hline(ctx, x0, y, Math.min(3, w), r5.mid)
    }
  }

  // The specular, where the upper-left lobe turns into the light.
  const specRow = top + Math.max(1, Math.round(span * 0.16))
  for (let k = 0; k < 3; k++) {
    const r = specRow + k
    if (r > bottom || BODY_X1[r] < BODY_X0[r]) continue
    px(ctx, BODY_X0[r] + 1 + k, sy + r, r5.spec)
    if (k === 0) px(ctx, BODY_X0[r] + 2, sy + r, r5.spec)
  }

  // Clump texture: shade in the lower right, catchlights in the upper left, so the
  // canopy reads as leaves rather than as one painted mass.
  for (let i = 0; i < 14; i++) {
    const r = top + 1 + Math.floor(artNoise(variant, 240 + i) * Math.max(1, span - 1))
    if (r < 0 || r >= TILE || BODY_X1[r] < BODY_X0[r]) continue
    const bw = BODY_X1[r] - BODY_X0[r] + 1
    if (bw < 6) continue
    // Shade clumps only where the light has already left, catchlights only where it
    // has not: a highlight on the shaded side would read as noise, not as leaves.
    const lower = (i & 1) === 0
    const room = Math.max(1, bw - 5)
    const cxk = lower
      ? BODY_X0[r] + 3 + Math.floor(artNoise(variant, 260 + i) * room * 0.7) + Math.floor(room * 0.3)
      : BODY_X0[r] + 1 + Math.floor(artNoise(variant, 260 + i) * room * 0.6)
    const tone = lower ? r5.dark : r5.lit
    hline(ctx, cxk, sy + r, 2, tone)
    px(ctx, cxk + 2, sy + r, lower ? mixHex(r5.mid, r5.dark, 0.5) : mixHex(r5.mid, r5.lit, 0.5))
    if (artNoise(variant, 280 + i) > 0.5 && r + 1 <= bottom) {
      if (cxk >= BODY_X0[r + 1] && cxk + 1 <= BODY_X1[r + 1]) {
        hline(ctx, cxk, sy + r + 1, 2, lower ? r5.ink : r5.mid)
      }
    }
  }

  // The canopy throws its own shade onto the trunk beneath it.
  for (let k = 1; k <= 2; k++) {
    const r = bottom + k
    if (r > 29) break
    hline(ctx, sx + 12, sy + r, 8, withAlpha(PAL.ink, 0.32 - k * 0.12))
  }

  // Blossom in spring, turned leaves in autumn.
  if (season === 'spring' || season === 'fall') {
    const fleck = season === 'spring' ? PAL.cream : mixHex(PAL.berry, PAL.lantern, 0.45)
    const fleckLow = mixHex(fleck, PAL.ink, 0.3)
    for (let i = 0; i < 9; i++) {
      const r = top + 1 + Math.floor(artNoise(variant, 300 + i) * Math.max(1, span - 2))
      if (r < 0 || r >= TILE || BODY_X1[r] < BODY_X0[r]) continue
      const bw = BODY_X1[r] - BODY_X0[r] + 1
      const fx = BODY_X0[r] + 1 + Math.floor(artNoise(variant, 320 + i) * Math.max(1, bw - 2))
      px(ctx, fx, sy + r, (r - top) / (span === 0 ? 1 : span) > 0.6 ? fleckLow : fleck)
    }
  }
}

/** Adds one ellipse into a row-span buffer, clipped to the tile. */
function spanLobe(
  lo: Int16Array,
  hi: Int16Array,
  sy: number,
  ox: number,
  oy: number,
  rx: number,
  ry: number,
): void {
  const aa = (rx + 0.5) * (rx + 0.5)
  const bb = (ry + 0.5) * (ry + 0.5)
  for (let dy = -ry; dy <= ry; dy++) {
    const r = oy + dy - sy
    if (r < 0 || r >= TILE) continue
    const k = 1 - (dy * dy) / bb
    const half = k <= 0 ? 0 : Math.floor(Math.sqrt(aa * k))
    const x0 = ox - half
    const x1 = ox + half
    if (x0 < lo[r]) lo[r] = x0
    if (x1 > hi[r]) hi[r] = x1
  }
}

function trunk(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  top: number,
  variant: number,
): void {
  const t5 = TRUNK_RAMP
  const x = sx + 13
  const w = 6
  const bottom = sy + 30
  const y = sy + top

  rect(ctx, x - 1, y, w + 2, bottom - y, PAL.ink)
  rect(ctx, x, y, w, bottom - y, t5.mid)
  vline(ctx, x, y, bottom - y, t5.lit)
  vline(ctx, x + w - 1, y, bottom - y, t5.dark)
  vline(ctx, x + w - 2, y, bottom - y, mixHex(t5.mid, t5.dark, 0.5))
  px(ctx, x, y + 2, t5.spec)
  px(ctx, x, y + 3, t5.spec)

  // Bark ticks.
  for (let i = 0; i < 5; i++) {
    const by = y + 2 + Math.floor(artNoise(variant, 400 + i) * (bottom - y - 4))
    const bx = x + 1 + Math.floor(artNoise(variant, 420 + i) * (w - 3))
    px(ctx, bx, by, t5.dark)
    px(ctx, bx, by + 1, t5.ink)
  }

  // Root flare spreading into the ground.
  for (let i = 0; i < 3; i++) {
    const fy = bottom - 3 + i
    const spread = i === 0 ? 1 : 2
    px(ctx, x - spread - 1, fy, PAL.ink)
    px(ctx, x + w + spread, fy, PAL.ink)
    hline(ctx, x - spread, fy, w + spread * 2, i === 2 ? t5.dark : t5.mid)
    px(ctx, x - spread, fy, t5.lit)
    px(ctx, x + w - 1 + spread, fy, t5.dark)
  }
  hline(ctx, x - 4, bottom, w + 8, PAL.ink)
}

function fallingLeaves(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  variant: number,
  beat: number,
): void {
  const leaf = mixHex(PAL.lantern, PAL.bark, 0.3)
  const leafDark = mixHex(PAL.lantern, PAL.ink, 0.45)
  for (let i = 0; i < 3; i++) {
    const cycle = 14 + i * 3
    const p = (beat + Math.floor(artNoise(variant, 440 + i) * cycle)) % cycle
    const y = sy + 20 + Math.floor((p * 11) / cycle)
    const x = sx + 5 + Math.floor(artNoise(variant, 460 + i) * 21) + ((p & 3) < 2 ? 1 : 0)
    px(ctx, x, y, leaf)
    px(ctx, x + 1, y, leafDark)
  }
}

const FORK_Y = 20

function bareTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  variant: number,
  sway: number,
): void {
  const t5 = TRUNK_RAMP
  const cx = sx + 16

  // A trunk that tapers from a flared foot up to the fork, rather than a post.
  for (let k = 0; k < 30 - FORK_Y; k++) {
    const y = sy + 30 - k
    const half = k < 2 ? 3 : 2
    hline(ctx, cx - half - 1, y, half * 2 + 2, PAL.ink)
    hline(ctx, cx - half, y, half * 2, t5.mid)
    px(ctx, cx - half, y, t5.lit)
    px(ctx, cx + half - 1, y, t5.dark)
    if (k > 2 && k < 8 && (k & 1) === 0) px(ctx, cx - half + 1, y, t5.ink)
  }
  hline(ctx, cx - 4, sy + 31, 8, PAL.ink)

  // Two boughs off the fork, a lower branch either side, and a leader between them.
  // Every one of them forks again as it climbs, so the crown fills its tile.
  limb(ctx, sx, sy, cx - 2, sy + FORK_Y, -1, 11 + (artNoise(variant, 500) > 0.5 ? 2 : 0), 2, sway, 0)
  limb(ctx, sx, sy, cx + 1, sy + FORK_Y, 1, 11 + (artNoise(variant, 501) > 0.5 ? 2 : 0), 2, sway, 0)
  limb(ctx, sx, sy, cx - 2, sy + FORK_Y + 3, -1, 7, 1, sway, 1)
  limb(ctx, sx, sy, cx + 1, sy + FORK_Y + 4, 1, 6, 1, sway, 1)
  limb(ctx, sx, sy, cx, sy + FORK_Y - 2, (variant & 1) === 0 ? 1 : -1, 12, 1, sway, 0)

  // Snow sits in the crotch of the fork, where it cannot blow off.
  for (let k = -3; k <= 3; k++) {
    if (artNoise(variant, 520 + k) < 0.35) continue
    px(ctx, cx + k, sy + FORK_Y - 1, withAlpha(PAL.cream, k < 1 ? 0.75 : 0.45))
  }
}

/**
 * One bare limb, climbing steeply and thinning to a twig, with snow lying along its
 * upper edge. Forks once at a little past half its length.
 */
function limb(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  x0: number,
  y0: number,
  dir: number,
  len: number,
  thick: number,
  sway: number,
  depth: number,
): void {
  const t5 = TRUNK_RAMP
  let x = x0
  let y = y0
  const forkAt = Math.floor(len * 0.55)

  for (let k = 0; k < len; k++) {
    y -= 1
    // Spread away from the trunk low down, then climb steeply: a branch, not a ray.
    if (k * 5 < len * 2 || (k & 1) === 0) x += dir
    const tip = k > len - 4
    const t = tip ? 1 : thick
    const xx = x + (tip ? sway : 0)
    if (xx < sx || xx + t > sx + TILE || y < sy + 1) return
    hline(ctx, xx, y, t, tip ? t5.dark : t5.mid)
    if (!tip) px(ctx, dir > 0 ? xx : xx + t - 1, y, dir > 0 ? t5.dark : t5.lit)
    if ((k & 1) === 0) px(ctx, xx, y - 1, withAlpha(PAL.cream, tip ? 0.35 : 0.62))
    if (depth < 2 && k === forkAt) {
      limb(ctx, sx, sy, xx, y, -dir, Math.max(3, len - forkAt - 2), 1, sway, depth + 1)
    }
  }
}

/* ------------------------------------------------------------------ *
 * Fence post — 32x32. The rails run to both tile edges, so a line of
 * posts one tile apart reads as an unbroken fence.
 * ------------------------------------------------------------------ */

const POST_X = 12
const POST_W = 10
const POST_Y = 6
const POST_H = 24
const RAIL_TOP = 12
const RAIL_LOW = 21

export function drawFencePost(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const p = PLANK_RAMP
  const x = sx + POST_X
  const y = sy + POST_Y

  // The shadow falls down-right, away from the light.
  ellipse(ctx, sx + 22, sy + 29, 9, 2, CONTACT)
  ellipse(ctx, sx + 19, sy + 29, 5, 1, withAlpha(PAL.ink, 0.2))

  rail(ctx, sx, sy + RAIL_TOP)
  rail(ctx, sx, sy + RAIL_LOW)

  rect(ctx, x - 1, y - 1, POST_W + 2, POST_H + 2, PAL.ink)
  rect(ctx, x, y, POST_W, POST_H, p.mid)

  // Chamfered top: two pixels off each corner, so it is a cut post not a domino.
  hline(ctx, x, y, 2, PAL.ink)
  hline(ctx, x + POST_W - 2, y, 2, PAL.ink)
  px(ctx, x, y + 1, PAL.ink)
  px(ctx, x + POST_W - 1, y + 1, PAL.ink)

  vline(ctx, x, y + 2, POST_H - 2, p.lit)
  vline(ctx, x + 1, y + 1, POST_H - 1, PLANK_MIDLIT)
  vline(ctx, x + POST_W - 1, y + 2, POST_H - 2, p.dark)
  vline(ctx, x + POST_W - 2, y + 1, POST_H - 1, PLANK_MIDDARK)
  hline(ctx, x + 2, y + 1, POST_W - 4, p.lit)
  hline(ctx, x + 3, y + 2, 3, p.spec)
  hline(ctx, x + 1, y + POST_H - 1, POST_W - 2, p.dark)

  // Grain: three long lines that wander a pixel, and a knot with a lit rim.
  for (let i = 0; i < 3; i++) {
    const gx = x + 2 + i * 3
    for (let k = 2; k < POST_H - 1; k++) {
      const wobble = artNoise(i, k) > 0.72 ? 1 : 0
      px(ctx, gx + wobble, y + k, PLANK_MIDDARK)
    }
  }
  const ky = y + 13
  rect(ctx, x + 4, ky, 3, 2, p.dark)
  px(ctx, x + 4, ky, p.ink)
  px(ctx, x + 3, ky - 1, PLANK_MIDLIT)
  px(ctx, x + 7, ky + 2, p.ink)

  // Weathering: a split down from the top and a chipped lower corner.
  vline(ctx, x + 6, y + 1, 5, p.ink)
  px(ctx, x + POST_W - 2, y + POST_H - 2, PAL.ink)
}

/** One rail passing behind the post, edge to edge of the tile. */
function rail(ctx: CanvasRenderingContext2D, sx: number, y: number): void {
  const p = PLANK_RAMP
  rect(ctx, sx, y - 1, TILE, 5, PAL.ink)
  rect(ctx, sx, y, TILE, 3, p.mid)
  hline(ctx, sx, y, TILE, PLANK_MIDLIT)
  hline(ctx, sx, y + 2, TILE, p.dark)
  for (let k = 3; k < TILE; k += 11) px(ctx, sx + k, y + 1, p.dark)
}

/* ------------------------------------------------------------------ *
 * Weather. One clip of the world band, so the HUD and belt stay clean.
 *
 * Streaks move on the raw 60 fps counter — rain read at 6 fps strobes — while the
 * splash rings step on `beatOf`, because a ring is a staged event, not a slide.
 * ------------------------------------------------------------------ */

const RAIN_NEAR = withAlpha(mixHex(PAL.sky, PAL.cream, 0.4), 0.72)
const RAIN_NEAR_HEAD = withAlpha(PAL.cream, 0.6)
const RAIN_FAR = withAlpha(PAL.sky, 0.3)
const RAIN_HEAVY = withAlpha(mixHex(PAL.sky, PAL.cream, 0.55), 0.85)
const SPLASH = mixHex(PAL.sky, PAL.cream, 0.5)
const SNOW_NEAR = withAlpha(PAL.cream, 0.92)
const SNOW_MID = withAlpha(PAL.cream, 0.6)
const SNOW_FAR = withAlpha(PAL.parchment, 0.42)

export function drawWeatherLayer(
  ctx: CanvasRenderingContext2D,
  weather: Weather,
  frame: number,
): void {
  if (weather === 'clear') return
  const still = prefersReducedMotion()
  const t = still ? 0 : frame

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, WORLD_Y, LOGICAL_W, WORLD_H)
  ctx.clip()

  if (weather === 'snow') {
    snowCrust(ctx)
    drawSnow(ctx, t)
  } else {
    const storm = weather === 'storm'
    // Far curtain first, then the near one over it: two depths, not one wall.
    drawRain(ctx, t, storm ? 250 : 180, 5, 0.34, 6, RAIN_FAR, false)
    drawRain(ctx, t, storm ? 160 : 110, storm ? 11 : 9, 0.5, 11, RAIN_NEAR, true)
    if (storm) drawRain(ctx, t, 34, 16, 0.62, 17, RAIN_HEAVY, true)
    splashes(ctx, beatOf(frame), storm ? 30 : 20)
    if (storm && !still && flashAt(frame)) {
      rect(ctx, 0, WORLD_Y, LOGICAL_W, WORLD_H, withAlpha(PAL.cream, 0.34))
      rect(ctx, 0, WORLD_Y, LOGICAL_W, WORLD_H, withAlpha(PAL.sky, 0.12))
    }
  }

  ctx.restore()
}

function drawRain(
  ctx: CanvasRenderingContext2D,
  t: number,
  count: number,
  len: number,
  slant: number,
  speed: number,
  color: string,
  near: boolean,
): void {
  const span = LOGICAL_W + 80

  for (let i = 0; i < count; i++) {
    const v = speed + artNoise(i, len) * speed * 0.5
    const yy = (artNoise(i, 12) * WORLD_H + t * v) % WORLD_H
    let xx = (artNoise(i, 13) * span - yy * slant * 2) % span
    if (xx < 0) xx += span
    xx -= 40
    const l = artNoise(i, 15) > 0.7 ? len + 2 : len
    const head = Math.round(xx)
    for (let k = 0; k < l; k++) {
      const y = WORLD_Y + Math.round(yy) + k
      if (y >= WORLD_Y + WORLD_H) break
      const x = Math.round(xx - k * slant)
      px(ctx, x, y, color)
      // The near curtain has body: a second column and a bright leading pixel.
      if (near && k > 0 && k < l - 1) px(ctx, x + 1, y, color)
    }
    if (near) px(ctx, head, WORLD_Y + Math.round(yy), RAIN_NEAR_HEAD)
  }
}

/** A ring of one pixel, drawn as integer scanlines. Flatter than it is wide. */
function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  const ry = r >> 1
  if (ry === 0) {
    hline(ctx, cx - r, cy, r * 2 + 1, color)
    return
  }
  const aa = (r + 0.5) * (r + 0.5)
  const bb = (ry + 0.5) * (ry + 0.5)
  for (let dy = -ry; dy <= ry; dy++) {
    const k = 1 - (dy * dy) / bb
    const half = k <= 0 ? 0 : Math.floor(Math.sqrt(aa * k))
    if (dy === -ry || dy === ry) {
      hline(ctx, cx - half, cy + dy, half * 2 + 1, color)
    } else {
      px(ctx, cx - half, cy + dy, color)
      px(ctx, cx + half, cy + dy, color)
    }
  }
}

/** Where the rain lands: a ring opening out over five beats, then gone. */
function splashes(ctx: CanvasRenderingContext2D, beat: number, count: number): void {
  const stages = 11
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(artNoise(i, 31) * LOGICAL_W)
    const cy = WORLD_Y + 3 + Math.floor(artNoise(i, 32) * (WORLD_H - 6))
    const p = (beat + Math.floor(artNoise(i, 33) * stages)) % stages
    if (p > 4) continue
    ring(ctx, cx, cy, 1 + p, withAlpha(SPLASH, 0.5 - p * 0.1))
    if (p === 0) {
      // The moment of impact throws two droplets up before the ring opens.
      px(ctx, cx - 2, cy - 2, withAlpha(SPLASH, 0.8))
      px(ctx, cx + 2, cy - 2, withAlpha(SPLASH, 0.8))
      px(ctx, cx, cy - 3, withAlpha(SPLASH, 0.5))
    }
  }
}

function drawSnow(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 130; i++) {
    const fall = 0.22 + artNoise(i, 21) * 0.3
    const yy = (artNoise(i, 22) * WORLD_H + t * fall) % WORLD_H
    const drift = Math.sin(t * 0.014 + artNoise(i, 23) * 6.283) * 5
    let xx = (artNoise(i, 24) * LOGICAL_W + drift) % LOGICAL_W
    if (xx < 0) xx += LOGICAL_W
    px(ctx, Math.round(xx), WORLD_Y + Math.round(yy), artNoise(i, 25) > 0.5 ? SNOW_FAR : SNOW_MID)
  }

  for (let i = 0; i < 54; i++) {
    const fall = 0.5 + artNoise(i, 41) * 0.4
    const yy = (artNoise(i, 42) * WORLD_H + t * fall) % WORLD_H
    const drift = Math.sin(t * 0.02 + artNoise(i, 43) * 6.283) * 8
    let xx = (artNoise(i, 44) * LOGICAL_W + drift) % LOGICAL_W
    if (xx < 0) xx += LOGICAL_W
    const x = Math.round(xx)
    const y = WORLD_Y + Math.round(yy)
    // A flake with a body, not a dot: a cross with one lit corner.
    px(ctx, x, y, SNOW_NEAR)
    px(ctx, x + 1, y, SNOW_NEAR)
    px(ctx, x, y + 1, SNOW_NEAR)
    px(ctx, x + 1, y + 1, SNOW_MID)
    if (artNoise(i, 45) > 0.6) {
      px(ctx, x - 1, y, SNOW_MID)
      px(ctx, x, y - 1, SNOW_MID)
    }
  }
}

/**
 * Snow settling on the top edge of everything: a dusting along every tile row, so
 * ground, buildings and machines all carry the same crust. DESIGN section 4.
 */
function snowCrust(ctx: CanvasRenderingContext2D): void {
  const pale = withAlpha(PAL.cream, 0.38)
  const paler = withAlpha(PAL.cream, 0.17)
  for (let y = WORLD_Y; y < WORLD_Y + WORLD_H; y += TILE) {
    for (let x = 0; x < LOGICAL_W; x++) {
      const n = artNoise(x, y)
      if (n <= 0.62) continue
      // Broken, and a pixel off the edge here and there: a ruled line would read as
      // a grid rather than as snow that has drifted onto whatever stands there.
      const yy = y + (artNoise(x, y + 7) > 0.5 ? 1 : 0)
      px(ctx, x, yy, n > 0.84 ? pale : paler)
      if (n > 0.95) px(ctx, x, yy + 1, paler)
    }
  }
}

/** Two-beat lightning, occasional rather than metronomic. */
function flashAt(frame: number): boolean {
  const cycle = 168
  const c = Math.floor(frame / cycle)
  if (artNoise(c, 7) < 0.5) return false
  const p = frame % cycle
  return p < 3 || (p >= 6 && p < 9)
}

/* ------------------------------------------------------------------ *
 * Light. DESIGN section 4, over the world band only.
 *
 * Exactly one clip is installed, of the world rectangle, and it is always closed
 * again: the HUD and the tool belt are drawn after this and are never dimmed.
 * ------------------------------------------------------------------ */

/** Mirrors the farmhouse footprint in `game/state.ts`, so the pools land on its windows. */
const HOUSE_ORIGIN_X = 1 * TILE
const HOUSE_ORIGIN_Y = 0 * TILE

export function drawLightLayer(
  ctx: CanvasRenderingContext2D,
  minutes: number,
  weather: Weather,
): void {
  let m = minutes % 1440
  if (m < 0) m += 1440

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, WORLD_Y, LOGICAL_W, WORLD_H)
  ctx.clip()

  // Weather first: rain desaturates, snow cools, a storm does both harder.
  if (weather === 'rain') wash(ctx, PAL.dusk, 0.15)
  else if (weather === 'storm') {
    wash(ctx, PAL.dusk, 0.2)
    wash(ctx, PAL.ink, 0.08)
  } else if (weather === 'snow') wash(ctx, PAL.sky, 0.1)

  let night = 0
  if (m < 360) {
    // 2:00-6:00 never happens in play, but a loaded save must still look right.
    wash(ctx, PAL.shadow, 0.38)
    night = 1
  } else if (m < 600) {
    // 6-10: a faint cold wash burning off toward mid-morning.
    wash(ctx, PAL.sky, 0.06 * (1 - (m - 360) / 240))
  } else if (m < 1020) {
    // 10-17: the palette shows true.
  } else if (m < 1200) {
    // 17-20: the good hour.
    wash(ctx, PAL.lantern, 0.1 * ((m - 1020) / 180))
  } else {
    // 20-2: night eases in while the last of the evening gold drains away.
    // Full depth by roughly 23:20, then held through the small hours.
    const t = Math.min(1, (m - 1200) / 200)
    wash(ctx, PAL.lantern, 0.1 * (1 - Math.min(1, t * 2)))
    wash(ctx, PAL.shadow, 0.38 * Math.pow(t, 1.6))
    night = t
  }

  // "Lit tiles near the house keep a warm pool" — laid over the shadow, inside the
  // same clip, so the world stays readable around the door at midnight.
  if (night > 0.05) lanternPools(ctx, night)

  ctx.restore()
}

function lanternPools(ctx: CanvasRenderingContext2D, night: number): void {
  const hx = HOUSE_ORIGIN_X
  const hy = WORLD_Y + HOUSE_ORIGIN_Y
  const a = 0.036 * night
  warmPool(ctx, hx + WIN_LX + (WIN_S >> 1), hy + 104, 26, 11, 6, a)
  warmPool(ctx, hx + WIN_RX + (WIN_S >> 1), hy + 104, 28, 12, 6, a)
  warmPool(ctx, hx + DOOR_X + (DOOR_W >> 1), hy + 100, 18, 8, 5, a * 1.2)
  // A little of it climbs the wall around each window.
  warmPool(ctx, hx + WIN_LX + (WIN_S >> 1), hy + WIN_Y + (WIN_S >> 1), 24, 22, 5, a * 0.7)
  warmPool(ctx, hx + WIN_RX + (WIN_S >> 1), hy + WIN_Y + (WIN_S >> 1), 24, 22, 5, a * 0.7)
}

function wash(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
  if (alpha <= 0.002) return
  rect(ctx, 0, WORLD_Y, LOGICAL_W, WORLD_H, withAlpha(color, alpha))
}
