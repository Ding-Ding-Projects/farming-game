import type { Season, Weather } from '../game/types'
import { LOGICAL_W, WORLD_H, WORLD_Y } from '../game/constants'
import { PAL, shade, withAlpha } from '../engine/palette'
import { hline, px, rect, vline } from '../engine/pixel'
import { artNoise, mixHex, prefersReducedMotion } from './tiles'

const STONE = mixHex(PAL.dusk, PAL.cream, 0.32)
const STONE_LIT = mixHex(PAL.dusk, PAL.cream, 0.58)
const STONE_DARK = mixHex(PAL.dusk, PAL.ink, 0.3)
const PLANK = PAL.bark
const PLANK_LIT = mixHex(PAL.bark, PAL.grassLit, 0.28)
const PLANK_DARK = mixHex(PAL.bark, PAL.ink, 0.3)
const ROOF = shade(PAL.bark, -0.32)
const ROOF_LIT = mixHex(shade(PAL.bark, -0.32), PAL.grassLit, 0.3)
const ROOF_DARK = shade(PAL.bark, -0.55)

/* ------------------------------------------------------------------ *
 * Farmhouse — three tiles wide, three tall, drawn from its top-left.
 * ------------------------------------------------------------------ */

export function drawFarmhouse(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  season: Season,
  lit: boolean,
): void {
  const winter = season === 'winter'

  // Hard cast shadow, down-right, no blur.
  rect(ctx, sx + 4, sy + 47, 46, 2, withAlpha(PAL.ink, 0.3))

  chimney(ctx, sx + 33, sy + 1, winter)
  roof(ctx, sx, sy, winter)
  walls(ctx, sx, sy)
  door(ctx, sx + 9, sy + 27)
  houseWindow(ctx, sx + 27, sy + 25, lit)
  flowerBox(ctx, sx + 26, sy + 34, season)
  stoneBase(ctx, sx + 2, sy + 41, winter)

  if (lit) lampGlow(ctx, sx + 32, sy + 29)
}

function chimney(ctx: CanvasRenderingContext2D, x: number, y: number, winter: boolean): void {
  rect(ctx, x - 1, y, 8, 14, PAL.ink)
  rect(ctx, x, y + 1, 6, 13, STONE)
  vline(ctx, x, y + 1, 13, STONE_LIT)
  vline(ctx, x + 5, y + 1, 13, STONE_DARK)
  hline(ctx, x - 1, y, 8, PAL.ink)
  hline(ctx, x, y + 1, 6, STONE_LIT)
  // Mortar courses.
  hline(ctx, x + 1, y + 5, 4, STONE_DARK)
  hline(ctx, x + 1, y + 9, 4, STONE_DARK)
  if (winter) hline(ctx, x, y + 1, 6, PAL.cream)
}

function roof(ctx: CanvasRenderingContext2D, sx: number, sy: number, winter: boolean): void {
  const apex = sx + 24
  const slopeRows = 18

  for (let r = 0; r < slopeRows; r++) {
    const half = Math.round(3 + r * 1.15)
    const x = apex - half
    const w = half * 2

    hline(ctx, x - 1, sy + r, w + 2, PAL.ink)
    hline(ctx, x, sy + r, w, ROOF)

    // Light from the upper left: the left pitch catches it, the right falls away.
    px(ctx, x, sy + r, ROOF_LIT)
    px(ctx, x + 1, sy + r, mixHex(ROOF, ROOF_LIT, 0.5))
    px(ctx, x + w - 1, sy + r, ROOF_DARK)
    px(ctx, x + w - 2, sy + r, ROOF_DARK)

    // Shingle courses every fourth row.
    if (r % 4 === 3) {
      for (let k = 3; k < w - 3; k += 3) px(ctx, x + k, sy + r, ROOF_DARK)
    }
    if (winter) {
      px(ctx, x, sy + r, PAL.cream)
      px(ctx, x + 1, sy + r, mixHex(PAL.cream, ROOF, 0.35))
      px(ctx, x + w - 1, sy + r, mixHex(PAL.cream, ROOF_DARK, 0.45))
    }
  }

  // Eaves.
  hline(ctx, sx, sy + slopeRows, 48, ROOF_DARK)
  hline(ctx, sx, sy + slopeRows + 1, 48, PAL.ink)
  hline(ctx, sx + 1, sy + slopeRows, 3, ROOF_LIT)
  if (winter) {
    for (let k = 0; k < 48; k += 2) px(ctx, sx + k, sy + slopeRows, withAlpha(PAL.cream, 0.7))
    // Icicles.
    px(ctx, sx + 9, sy + slopeRows + 2, withAlpha(PAL.cream, 0.8))
    px(ctx, sx + 22, sy + slopeRows + 2, withAlpha(PAL.cream, 0.8))
    px(ctx, sx + 22, sy + slopeRows + 3, withAlpha(PAL.cream, 0.5))
    px(ctx, sx + 39, sy + slopeRows + 2, withAlpha(PAL.cream, 0.8))
  }
}

function walls(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const x = sx + 4
  const y = sy + 20
  const w = 40
  const h = 21

  vline(ctx, x - 1, y, h, PAL.ink)
  vline(ctx, x + w, y, h, PAL.ink)
  rect(ctx, x, y, w, h, PLANK)

  for (let k = 5; k < w; k += 5) vline(ctx, x + k, y, h, PLANK_DARK)
  // Grain nicks.
  for (let k = 0; k < 9; k++) {
    const gx = x + 2 + Math.floor(artNoise(k, 11) * (w - 4))
    const gy = y + 2 + Math.floor(artNoise(k, 12) * (h - 4))
    px(ctx, gx, gy, PLANK_DARK)
  }
  hline(ctx, x, y, w, PLANK_LIT)
  vline(ctx, x, y, h, PLANK_LIT)
  hline(ctx, x, y + h - 1, w, PLANK_DARK)
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const w = 10
  const h = 14
  rect(ctx, x - 1, y - 1, w + 2, h + 1, PAL.ink)
  rect(ctx, x, y, w, h, mixHex(PAL.bark, PAL.ink, 0.42))
  vline(ctx, x, y, h, mixHex(PAL.bark, PAL.ink, 0.2))
  vline(ctx, x + 3, y, h, PAL.ink)
  vline(ctx, x + 6, y, h, PAL.ink)
  // Cross brace and latch.
  hline(ctx, x + 1, y + 4, w - 2, mixHex(PAL.bark, PAL.ink, 0.15))
  px(ctx, x + w - 2, y + 7, PAL.lantern)
  px(ctx, x + w - 2, y + 8, mixHex(PAL.lantern, PAL.ink, 0.4))
}

function houseWindow(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean): void {
  const w = 10
  const h = 9
  rect(ctx, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(ctx, x, y, w, h, lit ? PAL.lantern : mixHex(PAL.sky, PAL.shadow, 0.62))
  if (lit) {
    // Warm falloff inside the pane.
    hline(ctx, x, y, w, mixHex(PAL.lantern, PAL.cream, 0.5))
    hline(ctx, x, y + h - 1, w, mixHex(PAL.lantern, PAL.bark, 0.35))
  } else {
    hline(ctx, x, y, w, mixHex(PAL.sky, PAL.shadow, 0.35))
  }
  // Frame: cream sash, one-pixel mullions.
  vline(ctx, x + 4, y, h, PAL.cream)
  hline(ctx, x, y + 4, w, PAL.cream)
  hline(ctx, x, y - 2, w + 1, PAL.bark)
  px(ctx, x - 1, y - 2, PAL.ink)
  px(ctx, x + w, y - 2, PAL.ink)
}

function flowerBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  season: Season,
): void {
  const w = 12
  rect(ctx, x - 1, y - 1, w + 2, 5, PAL.ink)
  rect(ctx, x, y, w, 3, PAL.bark)
  hline(ctx, x, y, w, mixHex(PAL.bark, PAL.cream, 0.2))
  hline(ctx, x + 1, y + 1, w - 2, PAL.soil)

  const bloom =
    season === 'spring'
      ? PAL.cream
      : season === 'summer'
        ? PAL.grassLit
        : season === 'fall'
          ? mixHex(PAL.lantern, PAL.bark, 0.3)
          : PAL.cream
  const stalk = season === 'winter' ? mixHex(PAL.bark, PAL.cream, 0.25) : PAL.leaf
  for (let i = 0; i < 5; i++) {
    const bx = x + 1 + i * 2
    px(ctx, bx, y - 1, stalk)
    if (season !== 'winter' || i % 2 === 0) px(ctx, bx, y - 2, bloom)
  }
}

function stoneBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  winter: boolean,
): void {
  const w = 44
  const h = 7
  rect(ctx, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(ctx, x, y, w, h, STONE)
  hline(ctx, x, y, w, STONE_LIT)
  hline(ctx, x, y + h - 1, w, STONE_DARK)

  // Staggered courses.
  for (let row = 0; row < 2; row++) {
    const gy = y + 2 + row * 3
    hline(ctx, x, gy, w, STONE_DARK)
    for (let k = row === 0 ? 3 : 7; k < w; k += 8) vline(ctx, x + k, gy - 2, 2, STONE_DARK)
  }
  if (winter) {
    for (let k = 0; k < w; k += 3) px(ctx, x + k, y, withAlpha(PAL.cream, 0.6))
  }
}

/** Warm light spilling from the window, pooling on the ground below the house. */
function lampGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  // Tapered rows, not rectangles: a rectangle of light reads as a rectangle.
  for (let ring = 0; ring < 2; ring++) {
    const rw = 18 + ring * 10
    const rh = 14 + ring * 8
    const a = 0.15 - ring * 0.07
    for (let r = 0; r < rh; r++) {
      const t = Math.abs(r / (rh - 1) - 0.5) * 2
      const w = Math.round(rw * (1 - t * t * 0.75))
      rect(ctx, cx - (w >> 1), cy - (rh >> 1) + r, w, 1, withAlpha(PAL.lantern, a))
    }
  }
  // The pool on the ground in front of the house.
  for (let r = 0; r < 9; r++) {
    const w = 14 + r * 3
    const a = 0.2 - r * 0.02
    if (a <= 0) break
    rect(ctx, cx - (w >> 1), cy + 19 + r, w, 1, withAlpha(PAL.lantern, a))
  }
}

/* ------------------------------------------------------------------ *
 * Tree — one 16x16 tile, silhouette varied by `variant`.
 * ------------------------------------------------------------------ */

const CANOPY_BASE = [5, 9, 11, 12, 12, 11, 10, 8, 6]

export function drawTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  season: Season,
  variant: number,
): void {
  const lean = (variant % 3) - 1
  const bare = season === 'winter'

  hline(ctx, sx + 4, sy + 15, 8, withAlpha(PAL.ink, 0.28))

  if (bare) {
    bareTree(ctx, sx, sy, variant, lean)
    return
  }

  trunk(ctx, sx, sy, 8)

  const leafBase =
    season === 'fall' ? mixHex(PAL.lantern, PAL.bark, 0.45) : PAL.leaf
  const leafLit =
    season === 'fall'
      ? mixHex(PAL.lantern, PAL.cream, 0.25)
      : season === 'spring'
        ? mixHex(PAL.grassLit, PAL.cream, 0.2)
        : PAL.grassLit
  const leafDark = mixHex(leafBase, PAL.ink, 0.32)
  const squat = ((variant >> 2) & 1) === 1

  const rows = CANOPY_BASE.length
  for (let r = 0; r < rows; r++) {
    let w = CANOPY_BASE[r] + (squat && r > 1 && r < 6 ? 1 : 0)
    if (artNoise(variant, r) > 0.66) w += 1
    else if (artNoise(variant, 40 + r) > 0.74) w -= 1
    if (w < 3) w = 3
    if (w > 13) w = 13

    const cx = sx + 8 + Math.round(lean * (1 - r / rows))
    const x = cx - (w >> 1)
    const y = sy + r

    hline(ctx, x - 1, y, w + 2, PAL.ink)
    hline(ctx, x, y, w, leafBase)

    // Sunlit clump on the upper left, shade pooling under the right side.
    if (r >= 1 && r <= 3) {
      hline(ctx, x + 1, y, Math.min(4, w - 3), leafLit)
      px(ctx, x, y, mixHex(leafBase, leafLit, 0.55))
    } else if (r === 0) {
      hline(ctx, x + 1, y, Math.max(1, w - 3), leafLit)
    }
    if (r >= 4) {
      const dw = Math.min(4, w - 2)
      hline(ctx, x + w - dw, y, dw, leafDark)
      if (r >= 6) hline(ctx, x + 1, y, w - dw - 1, mixHex(leafBase, PAL.ink, 0.15))
    }
    if (r === rows - 1) hline(ctx, x, y + 1, w, PAL.ink)
  }

  // Season flecks: blossom in spring, a couple of turned leaves in fall.
  if (season === 'spring' || season === 'fall') {
    const fleck = season === 'spring' ? PAL.cream : PAL.berry
    for (let i = 0; i < 6; i++) {
      const fx = sx + 3 + Math.floor(artNoise(variant, 70 + i) * 10)
      const fy = sy + 1 + Math.floor(artNoise(variant, 90 + i) * 8)
      px(ctx, fx, fy, fleck)
      if (artNoise(variant, 110 + i) > 0.7) px(ctx, fx + 1, fy + 1, withAlpha(fleck, 0.6))
    }
  } else {
    // Summer canopy gets a couple of deep gaps so it is not one solid blob.
    for (let i = 0; i < 3; i++) {
      const fx = sx + 4 + Math.floor(artNoise(variant, 130 + i) * 8)
      const fy = sy + 3 + Math.floor(artNoise(variant, 150 + i) * 6)
      px(ctx, fx, fy, leafDark)
      px(ctx, fx + 1, fy, leafDark)
    }
  }
}

function trunk(ctx: CanvasRenderingContext2D, sx: number, sy: number, top: number): void {
  const x = sx + 7
  const h = 16 - top
  vline(ctx, x - 1, sy + top, h, PAL.ink)
  vline(ctx, x, sy + top, h, mixHex(PAL.bark, PAL.cream, 0.2))
  vline(ctx, x + 1, sy + top, h, mixHex(PAL.bark, PAL.ink, 0.25))
  vline(ctx, x + 2, sy + top, h, PAL.ink)
  // Root flare.
  px(ctx, x - 2, sy + 15, PAL.bark)
  px(ctx, x + 3, sy + 15, PAL.bark)
  px(ctx, x - 2, sy + 14, PAL.ink)
  px(ctx, x + 3, sy + 14, PAL.ink)
}

function bareTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  variant: number,
  lean: number,
): void {
  trunk(ctx, sx, sy, 4)
  const limb = PAL.bark
  const limbDark = mixHex(PAL.bark, PAL.ink, 0.4)
  const snow = PAL.cream

  // Limbs climb steeply, one sideways step for every two upward, so they read
  // as a tree rather than a mast.
  const forks = [
    { y: 11, dir: -1, len: 6 },
    { y: 9, dir: 1, len: 6 },
    { y: 7, dir: -1, len: 5 },
    { y: 6, dir: 1, len: 4 },
  ]
  for (let i = 0; i < forks.length; i++) {
    const f = forks[i]
    const len = f.len + (artNoise(variant, 200 + i) > 0.6 ? 1 : 0)
    let x = sx + 8 + (f.dir > 0 ? 1 : -1)
    let y = sy + f.y
    for (let k = 0; k < len; k++) {
      y -= 1
      if (k % 2 === 0) x += f.dir
      if (x < sx || x > sx + 15 || y < sy) break
      px(ctx, x, y, k > len - 3 ? limbDark : limb)
      if (k % 2 === 0) px(ctx, x, y - 1, withAlpha(snow, k > len - 3 ? 0.5 : 0.8))
    }
  }
  // A snow cap on the crown.
  const cx = sx + 8 + lean
  px(ctx, cx, sy + 3, limb)
  px(ctx, cx, sy + 2, limb)
  px(ctx, cx, sy + 1, withAlpha(snow, 0.9))
  px(ctx, cx - 1, sy + 2, withAlpha(snow, 0.45))
}

/* ------------------------------------------------------------------ *
 * Fence post
 * ------------------------------------------------------------------ */

export function drawFencePost(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const x = sx + 6
  const y = sy + 3
  const w = 5
  const h = 11

  hline(ctx, x + 3, sy + 14, 5, withAlpha(PAL.ink, 0.3))
  rect(ctx, x - 1, y - 1, w + 2, h + 2, PAL.ink)
  rect(ctx, x, y, w, h, PLANK)
  vline(ctx, x, y, h, mixHex(PAL.bark, PAL.cream, 0.22))
  vline(ctx, x + w - 1, y, h, PLANK_DARK)
  hline(ctx, x, y, w, mixHex(PAL.bark, PAL.cream, 0.35))

  // Weathering: a split top corner and two grain nicks.
  px(ctx, x + w - 1, y, PAL.ink)
  px(ctx, x + 1, y + 3, PLANK_DARK)
  px(ctx, x + 2, y + 4, PLANK_DARK)
  px(ctx, x + 3, y + 7, PLANK_DARK)
  px(ctx, x + 1, y + 8, mixHex(PAL.bark, PAL.cream, 0.15))
  // Wire loops, so a line of posts reads as a fence.
  px(ctx, x - 1, y + 3, mixHex(PAL.dusk, PAL.cream, 0.4))
  px(ctx, x + w, y + 3, mixHex(PAL.dusk, PAL.cream, 0.4))
}

/* ------------------------------------------------------------------ *
 * Weather. Clipped to the world band so the HUD and belt stay clean.
 * ------------------------------------------------------------------ */

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
    drawSnow(ctx, t)
  } else {
    const storm = weather === 'storm'
    drawRain(ctx, t, storm ? 130 : 78, storm ? 6 : 4, storm ? 0.75 : 0.5)
    if (storm && !still && flashAt(frame)) {
      rect(ctx, 0, WORLD_Y, LOGICAL_W, WORLD_H, withAlpha(PAL.cream, 0.34))
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
): void {
  const span = LOGICAL_W + 40
  const near = withAlpha(mixHex(PAL.sky, PAL.cream, 0.3), 0.7)
  const far = withAlpha(PAL.sky, 0.4)

  for (let i = 0; i < count; i++) {
    const speed = 5 + artNoise(i, 11) * 5
    const yy = (artNoise(i, 12) * WORLD_H + t * speed) % WORLD_H
    let xx = (artNoise(i, 13) * span - yy * slant * 2) % span
    if (xx < 0) xx += span
    xx -= 20
    const color = artNoise(i, 14) > 0.6 ? far : near
    const l = artNoise(i, 15) > 0.7 ? len + 1 : len
    for (let k = 0; k < l; k++) {
      const y = WORLD_Y + Math.round(yy) + k
      if (y >= WORLD_Y + WORLD_H) break
      px(ctx, Math.round(xx - k * slant), y, color)
    }
  }
}

function drawSnow(ctx: CanvasRenderingContext2D, t: number): void {
  const near = withAlpha(PAL.cream, 0.9)
  const far = withAlpha(PAL.parchment, 0.5)

  for (let i = 0; i < 70; i++) {
    const fall = 0.3 + artNoise(i, 21) * 0.4
    const yy = (artNoise(i, 22) * WORLD_H + t * fall) % WORLD_H
    const drift = Math.sin(t * 0.02 + artNoise(i, 23) * 6.283) * 4
    let xx = (artNoise(i, 24) * LOGICAL_W + drift) % LOGICAL_W
    if (xx < 0) xx += LOGICAL_W
    const x = Math.round(xx)
    const y = WORLD_Y + Math.round(yy)
    const big = artNoise(i, 25) > 0.76
    px(ctx, x, y, big ? near : far)
    if (big && y + 1 < WORLD_Y + WORLD_H) {
      px(ctx, x + 1, y, near)
      px(ctx, x, y + 1, near)
      px(ctx, x + 1, y + 1, withAlpha(PAL.cream, 0.6))
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
 * ------------------------------------------------------------------ */

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

  if (m < 360) {
    // 2:00-6:00 never happens in play, but a loaded save must still look right.
    wash(ctx, PAL.shadow, 0.38)
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
  }

  ctx.restore()
}

function wash(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
  if (alpha <= 0.002) return
  rect(ctx, 0, WORLD_Y, LOGICAL_W, WORLD_H, withAlpha(color, alpha))
}
