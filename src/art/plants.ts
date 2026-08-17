/**
 * Crops and fruit trees, drawn native at 32x32.
 *
 * Nothing here is the old 16 px art scaled up. Every mass carries the full five-tone
 * ramp of `docs/GRAPHICS.md` section 5 — an `ink` outline, a dark side, a mid body, a
 * lit edge and a `cream` specular — and the light falls from the upper left without
 * exception, so a fruit's highlight, a stem's lit column and a canopy's glint all agree.
 *
 * The crop sprite is parametric: it is built from `CropDef.art` alone, so thirty-three
 * field crops and fourteen perennials need no hand-drawn sheets. The five `PlantArt`
 * shapes are drawn to be told apart by **silhouette**, not by colour:
 *
 *   round    a tall stalk studded with spheres, or one big gourd on the ground
 *   long     parallel vertical capsules, the tallest thing in the field
 *   cluster  a triangular bunch drooping from the crown
 *   leafy    a wide low dome, broader than it is tall, no visible fruit
 *   root     a narrow spray of blades over a swollen shoulder breaking the soil
 *
 * Growth reads as growth, in five states: a seed mound, a two-leaf sprout, a young
 * stem, a full plant, then a ripe one carrying its fruit. Only the ripe one sways.
 */
import type { CropDef, Plant, PlantArt, Quality, Season } from '../game/types'
import type { TreeDef } from '../game/trees'
import type { Ramp } from '../engine/palette'
import { isRipe } from '../game/crops'
import { isTreeMature, isTreeRipe, treeFruitsIn } from '../game/trees'
import { LOGICAL_W, WORLD_Y } from '../game/constants'
import { PAL, ramp, withAlpha } from '../engine/palette'
import { hline, outline, px, rect } from '../engine/pixel'
import { artNoise, beatOf, mixHex, prefersReducedMotion } from './tiles'

type Ctx = CanvasRenderingContext2D
/** Plots one pixel in sprite-local space, clipped and sway-shifted. */
type Put = (x: number, y: number, color: string) => void

const TILE_PX = 32
/** Soil line inside the tile: every plant grows up from here. */
const BASE_Y = 26
/** Stem column. Sway pushes it to 16, so the plant oscillates around the tile centre. */
const STEM_X = 15
/** Both item icons are drawn inside a 24x24 box, matching the belt tool icons. */
const ICON = 24

/** Snow sitting on the top edge of a winter limb. `docs/GRAPHICS.md` section 7. */
const SNOW = mixHex(PAL.cream, PAL.sky, 0.14)
/** The bleached grey-brown a withered stalk fades to. Not `berry`: berry means loss. */
const WITHER = mixHex(mixHex(PAL.bark, PAL.dusk, 0.35), PAL.parchment, 0.3)

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Even spacing that always lands on a whole pixel: item `i` of `n`, `step` apart. */
function spread(i: number, n: number, step: number): number {
  return i * step - (((n - 1) * step) >> 1)
}

/* ------------------------------------------------------------------ *
 * Sprite-local primitives
 * ------------------------------------------------------------------ */

function row(put: Put, x: number, y: number, w: number, color: string): void {
  for (let i = 0; i < w; i++) put(x + i, y, color)
}

function col(put: Put, x: number, y: number, h: number, color: string): void {
  for (let i = 0; i < h; i++) put(x, y + i, color)
}

/** Clipped to the tile, with everything above `swayTop` shifted by `sway`. */
function brush(ctx: Ctx, sx: number, sy: number, size: number, swayTop: number, sway: number): Put {
  return (x, y, color) => {
    const gx = y < swayTop ? x + sway : x
    if (gx < 0 || gx >= size || y < 0 || y >= size) return
    px(ctx, sx + gx, sy + y, color)
  }
}

/**
 * A tree's canopy is deliberately wider and taller than its tile, so it clips to the
 * framebuffer rather than to the sprite box. `minY` is the highest row it may reach —
 * the top of the world band, so a canopy never bleeds into the HUD.
 */
function treeBrush(
  ctx: Ctx,
  sx: number,
  sy: number,
  minY: number,
  swayTop: number,
  sway: number,
): Put {
  return (x, y, color) => {
    const gx = y < swayTop ? x + sway : x
    const ax = sx + gx
    const ay = sy + y
    if (ax < 0 || ax >= LOGICAL_W || ay < minY || y >= TILE_PX) return
    px(ctx, ax, ay, color)
  }
}

/** Half-width of a filled disc of radius `r` at row `dy`, or -1 outside it. */
function span(r: number, dy: number): number {
  const k = r * r + r * 0.6 - dy * dy
  return k <= 0 ? -1 : Math.floor(Math.sqrt(k))
}

/** Half-width of a filled ellipse at row `dy`, or -1 outside it. */
function ellipseSpan(rx: number, ry: number, dy: number): number {
  const b = ry + 0.5
  const k = 1 - (dy * dy) / (b * b)
  return k <= 0 ? -1 : Math.floor((rx + 0.5) * Math.sqrt(k))
}

/** A fruit: ink rim, lit upper-left crescent, dark lower-right, cream glint. */
function ball(put: Put, cx: number, cy: number, r: number, rp: Ramp): void {
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    const w = span(r + 1, dy)
    if (w >= 0) row(put, cx - w, cy + dy, w * 2 + 1, rp.ink)
  }
  for (let dy = -r; dy <= r; dy++) {
    const w = span(r, dy)
    if (w < 0) continue
    for (let x = cx - w; x <= cx + w; x++) {
      // Distance from a light off the upper-left shoulder, normalised by the radius, so
      // the highlight stays a round patch on a two-pixel berry and on a seven-pixel gourd.
      const nx = (x - cx) / (r + 0.5) + 0.42
      const ny = dy / (r + 0.5) + 0.45
      const d = Math.sqrt(nx * nx + ny * ny)
      put(x, cy + dy, d <= 0.5 ? rp.lit : d >= 1 ? rp.dark : rp.mid)
    }
  }
  if (r >= 4) {
    row(put, cx - r + 1, cy - r + 1, 2, rp.spec)
    put(cx - r + 1, cy - r + 2, rp.spec)
  } else if (r >= 2) {
    put(cx - 1, cy - 1, rp.spec)
  }
}

/** One 3x3 berry of a bunch. The ink corner is what keeps neighbours separate. */
function berryBlock(put: Put, x: number, y: number, rp: Ramp): void {
  put(x, y, rp.spec)
  put(x + 1, y, rp.lit)
  put(x + 2, y, rp.mid)
  put(x, y + 1, rp.lit)
  put(x + 1, y + 1, rp.mid)
  put(x + 2, y + 1, rp.dark)
  put(x, y + 2, rp.mid)
  put(x + 1, y + 2, rp.dark)
  put(x + 2, y + 2, rp.ink)
}

/** Widest near the crown, tapering to a point: a bunch, and a grain head both. */
const BUNCH_ROWS = [3, 4, 4, 3, 2, 1] as const

function bunch(put: Put, cx: number, topY: number, count: number, rp: Ramp, floorY: number): void {
  // Two passes over the same layout: an ink silhouette, then the berries inside it.
  for (let pass = 0; pass < 2; pass++) {
    let placed = 0
    for (let r = 0; r < BUNCH_ROWS.length && placed < count; r++) {
      const per = BUNCH_ROWS[r]
      const x0 = cx - ((per * 3 - 1) >> 1)
      const y = topY + r * 3
      if (y + 2 > floorY) break
      for (let i = 0; i < per && placed < count; i++, placed++) {
        const bx = x0 + i * 3
        if (pass === 0) {
          for (let k = -1; k < 4; k++) row(put, bx - 1, y + k, 5, rp.ink)
        } else {
          berryBlock(put, bx, y, rp)
        }
      }
    }
  }
}

/** A vertical capsule — the `long` fruit, and a hanging tree pod at `hw` 1. */
function pod(put: Put, cx: number, bottom: number, height: number, hw: number, rp: Ramp): void {
  const top = bottom - height + 1
  for (let y = top; y <= bottom; y++) {
    const cap = y === top || y === bottom ? 1 : 0
    const x0 = cx - hw + cap
    const x1 = cx + hw - cap
    put(x0 - 1, y, rp.ink)
    put(x1 + 1, y, rp.ink)
    for (let x = x0; x <= x1; x++) {
      put(x, y, x0 === x1 ? rp.mid : x === x0 ? rp.lit : x === x1 ? rp.dark : rp.mid)
    }
  }
  row(put, cx - hw + 1, top - 1, hw * 2 - 1, rp.ink)
  row(put, cx - hw + 1, bottom + 1, hw * 2 - 1, rp.ink)
  if (hw >= 2) {
    put(cx - hw + 1, top + 1, rp.spec)
    put(cx - hw + 1, top + 2, rp.spec)
    for (let y = top + 3; y < bottom - 1; y += 4) put(cx + hw - 1, y, rp.dark)
  }
}

/** A leaf blade reaching out and up, ink-edged, with a midrib of mid tone. */
function leafBlade(put: Put, bx: number, by: number, dir: number, len: number, rp: Ramp): void {
  const n = clamp(len, 3, 9)
  for (let i = 0; i < n; i++) {
    const x = bx + dir * (i + 1)
    const y = by - ((i * 5) >> 3)
    const half = i === n - 1 ? 0 : n <= 4 || i === 0 || i >= n - 2 ? 1 : 2
    put(x, y - half - 1, rp.ink)
    put(x, y + half + 1, rp.ink)
    for (let k = -half; k <= half; k++) put(x, y + k, k < 0 ? rp.lit : k > 0 ? rp.dark : rp.mid)
  }
  // The glint only ever lands on a leaf turned toward the light.
  if (dir < 0 && n >= 5) put(bx - 2, by - 1, rp.spec)
}

const COT_HALF = [1, 2, 2, 1, 0] as const
const COT_RISE = [0, 1, 1, 2, 2] as const

/** A seed leaf: rounder and fatter than a true leaf, which is what says "sprout". */
function cotyledon(put: Put, bx: number, by: number, dir: number, rp: Ramp): void {
  for (let i = 0; i < COT_HALF.length; i++) {
    const x = bx + dir * i
    const y = by - COT_RISE[i]
    const half = COT_HALF[i]
    put(x, y - half - 1, rp.ink)
    put(x, y + half + 1, rp.ink)
    for (let k = -half; k <= half; k++) put(x, y + k, k < 0 ? rp.lit : k > 0 ? rp.dark : rp.mid)
  }
  put(bx + dir * COT_HALF.length, by - 2, rp.ink)
  if (dir < 0) put(bx - 2, by - 2, rp.spec)
}

/* ------------------------------------------------------------------ *
 * Plant bodies
 * ------------------------------------------------------------------ */

/**
 * The stem-and-leaves body every non-root, non-leafy plant is built on. The stem
 * thickens with height and carries a lit left column, a dark right one and a 1 px ink
 * line on both sides, so it stays legible against wet soil.
 */
function stalk(put: Put, art: PlantArt, h: number, leaves: number): void {
  const st = ramp(art.stem)
  const lf = ramp(art.leaf)
  const top = BASE_Y - h + 1
  const thick = h >= 16 ? 3 : h >= 8 ? 2 : 1
  const x0 = STEM_X - ((thick - 1) >> 1)

  col(put, x0 - 1, top, h, st.ink)
  col(put, x0 + thick, top, h, st.ink)
  for (let c = 0; c < thick; c++) {
    col(put, x0 + c, top, h, thick === 1 ? st.mid : c === 0 ? st.lit : c === thick - 1 ? st.dark : st.mid)
  }
  row(put, x0 - 1, top - 1, thick + 2, st.ink)
  if (thick >= 2) col(put, x0, top + 1, 3, st.spec)

  // The growing tip is leaf-coloured, so a plant always looks like it is still going.
  row(put, x0, top, thick, lf.lit)

  const gap = Math.max(4, (h / (leaves + 1)) | 0)
  const len = clamp(5 + (h >> 3), 5, 9)
  for (let i = 0; i < leaves; i++) {
    const ly = BASE_Y - 3 - i * gap
    if (ly <= top + 1) break
    const dir = i % 2 === 0 ? -1 : 1
    leafBlade(put, dir < 0 ? x0 - 1 : x0 + thick, ly, dir, len, lf)
  }
}

/** Spheres hung either side of the stalk, or one gourd resting on the soil. */
function berries(put: Put, art: PlantArt, h: number): void {
  const ft = ramp(art.fruit)
  const st = ramp(art.stem)
  const n = clamp(Math.round(art.fruits), 1, 5)

  if (n === 1) {
    const r = clamp((h >> 1) + 1, 4, 7)
    const cy = BASE_Y - r
    ball(put, STEM_X, cy, r, ft)
    // Ribs, so a single big fruit reads as a gourd and not as a coloured circle.
    for (const rib of [-1, 1]) {
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        const w = span(r, dy)
        if (w < 1) continue
        put(STEM_X + rib * Math.max(1, (w * 2) / 3) | 0, cy + dy, ft.dark)
      }
    }
    // A short curled peduncle on the shoulder, so the gourd is attached to something.
    put(STEM_X + 1, cy - r - 1, st.mid)
    put(STEM_X + 2, cy - r - 2, st.dark)
    put(STEM_X, cy - r - 1, st.ink)
    return
  }

  const r = n === 2 ? 4 : 3
  const top = BASE_Y - h + 1
  const first = top + r + 1
  const last = BASE_Y - r - 1

  if (last - first < r) {
    // Too short to stack: lay the fruit out along the ground instead.
    for (let i = 0; i < n; i++) ball(put, STEM_X + spread(i, n, r * 2 + 1), BASE_Y - r - 1, r, ft)
    return
  }
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? -1 : 1
    const cy = clamp(first + Math.round((i * (last - first)) / (n - 1)), first, last)
    const cx = STEM_X + dir * (r + 2)
    col(put, STEM_X + dir, cy - r, 2, st.dark)
    ball(put, cx, cy, r, ft)
  }
}

/** Parallel capsules, the middle one carried higher so the silhouette is not a wall. */
function pods(put: Put, art: PlantArt, h: number): void {
  const ft = ramp(art.fruit)
  const n = clamp(Math.round(art.fruits), 1, 3)
  const height = clamp(h - 6, 7, 18)
  const lanes = n === 1 ? [0] : n === 2 ? [-6, 6] : [-8, 0, 8]
  for (const lane of lanes) {
    pod(put, STEM_X + lane, BASE_Y - 2 - (lane === 0 ? 3 : 0), height, 2, ft)
  }
}

/**
 * The broad head of a `leafy` crop: outer leaves in `leaf`, the heart in the crop's own
 * colour, two seams curving out from the base and one glint on the upper left.
 */
function dome(
  put: Put,
  cx: number,
  bottom: number,
  h: number,
  maxW: number,
  art: PlantArt,
  heart: boolean,
): void {
  const lf = ramp(art.leaf)
  const ft = ramp(art.fruit)

  // Widest just off the soil and tapering only upward: a head sitting on the ground,
  // not a lens floating in the middle of the tile.
  const ws: number[] = []
  for (let i = 0; i < h; i++) {
    const f = 0.46 + 0.52 * ((i + 0.5) / h)
    ws.push(clamp(Math.round(maxW * Math.sin(Math.PI * f)), 5, maxW))
  }

  for (let i = 0; i < h; i++) {
    const y = bottom - i
    const w = ws[i]
    const x0 = cx - ((w - 1) >> 1)
    put(x0 - 1, y, lf.ink)
    put(x0 + w, y, lf.ink)
    for (let x = x0; x < x0 + w; x++) {
      const inner = heart && x > x0 + 2 && x < x0 + w - 3 && i > 1 && i < h - 3
      put(x, y, x >= x0 + w - 2 ? lf.dark : x <= x0 + 1 ? lf.lit : inner ? ft.mid : lf.mid)
    }
    // Seams a quarter of the way out on every row, so they converge on the crown the
    // way the wrapped leaves of a real head do.
    if (i < h - 1) {
      const sw = w >> 2
      put(cx - sw, y, lf.dark)
      put(cx + sw, y, lf.dark)
    }
  }
  const capW = ws[h - 1]
  row(put, cx - ((capW - 1) >> 1), bottom - h, capW, lf.ink)

  const gi = Math.max(0, h - 4)
  const gx = cx - (ws[gi] >> 2) - 1
  row(put, gx, bottom - gi, 2, lf.spec)
  put(gx, bottom - gi - 1, lf.spec)
}

/** Foliage-only crop: a fan of blades over the root's shoulder breaking the soil. */
function rootTop(put: Put, art: PlantArt, h: number, swollen: boolean): void {
  const ft = ramp(art.fruit)
  const lf = ramp(art.leaf)
  const n = clamp(Math.round(art.fruits), 1, 6)
  const halfW = clamp(3 + n, 4, 8)
  const crown = swollen ? BASE_Y - 5 : BASE_Y - 1

  if (swollen) {
    const widths = [halfW - 3, halfW - 1, halfW, halfW, halfW - 1]
    for (let i = 0; i < widths.length; i++) {
      const w = Math.max(1, widths[i])
      const y = BASE_Y - 4 + i
      put(STEM_X - w - 1, y, ft.ink)
      put(STEM_X + w + 1, y, ft.ink)
      for (let x = STEM_X - w; x <= STEM_X + w; x++) {
        put(x, y, x <= STEM_X - w + 1 ? ft.lit : x >= STEM_X + w - 1 ? ft.dark : ft.mid)
      }
    }
    row(put, STEM_X - halfW + 3, BASE_Y - 5, (halfW - 3) * 2 + 1, ft.ink)
    row(put, STEM_X - halfW + 1, BASE_Y - 4, 2, ft.spec)
    put(STEM_X - halfW + 1, BASE_Y - 3, ft.spec)
  }

  const spikes = clamp(n + 2, 3, 7)
  const len = clamp(swollen ? h + 1 : h + 5, 8, 18)
  for (let k = 0; k < spikes; k++) {
    const a = spikes === 1 ? 0 : (k / (spikes - 1) - 0.5) * 2
    const reach = Math.max(5, len - Math.round(Math.abs(a) * 4))
    const fat = Math.abs(a) < 0.4
    for (let s = 0; s < reach; s++) {
      const x = STEM_X + Math.round(a * s * 0.75)
      const y = crown - 1 - s
      const tip = s >= reach - 1
      if (k === 0) put(x - 1, y, lf.ink)
      put(x, y, tip ? lf.spec : a < -0.15 ? lf.lit : a > 0.15 ? lf.dark : lf.mid)
      if (fat && !tip && s < reach - 2) {
        put(x + 1, y, a > 0.15 ? lf.dark : lf.mid)
        put(x + 2, y, lf.ink)
      } else {
        put(x + 1, y, lf.ink)
      }
    }
  }
}

/** Two seed leaves on a stub of stem. The whole point is that it is not yet a plant. */
function sprout(put: Put, art: PlantArt): void {
  const st = ramp(art.stem)
  const lf = ramp(art.leaf)
  col(put, STEM_X - 1, BASE_Y - 6, 7, st.ink)
  col(put, STEM_X + 1, BASE_Y - 6, 7, st.ink)
  col(put, STEM_X, BASE_Y - 6, 7, st.mid)
  put(STEM_X, BASE_Y - 6, st.lit)
  cotyledon(put, STEM_X - 2, BASE_Y - 7, -1, lf)
  cotyledon(put, STEM_X + 2, BASE_Y - 7, 1, lf)
}

/* ------------------------------------------------------------------ *
 * Tile furniture: shadow, seed mound, dead plant
 * ------------------------------------------------------------------ */

function contactShadow(ctx: Ctx, sx: number, sy: number, width: number): void {
  const w = clamp(width, 6, 28)
  const x = sx + 16 - (w >> 1)
  const y = sy + BASE_Y + 1
  hline(ctx, x, y, w, withAlpha(PAL.ink, 0.5))
  hline(ctx, x + 2, y + 1, w - 4, withAlpha(PAL.ink, 0.27))
  if (w >= 14) hline(ctx, x + 5, y + 2, w - 10, withAlpha(PAL.ink, 0.15))
}

function shadowWidth(shape: PlantArt['shape'], h: number, ripe: boolean): number {
  if (!ripe) return 7 + (h >> 2)
  switch (shape) {
    case 'leafy':
      return 22
    case 'root':
      return 16
    case 'round':
      return 17
    case 'cluster':
      return 13
    default:
      return 15
  }
}

/** Freshly sown: a raked mound with the seed still showing at the crest. */
function seedMound(ctx: Ctx, art: PlantArt, sx: number, sy: number): void {
  const put = brush(ctx, sx, sy, TILE_PX, -1, 0)
  const so = ramp(PAL.soil)
  const ft = ramp(art.fruit)
  const halves = [3, 5, 6, 7]
  for (let i = 0; i < halves.length; i++) {
    const w = halves[i]
    const y = BASE_Y - 3 + i
    put(STEM_X - w - 1, y, so.ink)
    put(STEM_X + w + 1, y, so.ink)
    for (let x = STEM_X - w; x <= STEM_X + w; x++) {
      put(x, y, x <= STEM_X - w + 1 ? so.lit : x >= STEM_X + w - 1 ? so.dark : so.mid)
    }
  }
  row(put, STEM_X - 2, BASE_Y - 4, 5, so.ink)
  row(put, STEM_X - 3, BASE_Y - 3, 2, so.spec)
  ball(put, STEM_X + 1, BASE_Y - 6, 2, ft)
  contactShadow(ctx, sx, sy, 17)
}

/** Walks an integer line, laying a body pixel with an ink edge either side of it. */
function stroke(
  put: Put,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  body: string,
  edge: string,
  cap: string | null,
): void {
  const dx = Math.abs(x1 - x0)
  const sx = x0 < x1 ? 1 : -1
  const dy = -Math.abs(y1 - y0)
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (let guard = 0; guard < 128; guard++) {
    put(x - 1, y, edge)
    put(x, y, body)
    put(x + 1, y, edge)
    if (cap !== null) {
      put(x, y - 1, cap)
      put(x - 1, y - 1, cap)
    }
    if (x === x1 && y === y1) return
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/**
 * Collapsed, grey-brown, unmistakably finished: three buckled stalks that have folded
 * back toward the soil, one length already down, and two shrivelled leaf curls. Bleached
 * rather than blackened — `berry` is reserved for loss and never used decoratively.
 */
function deadPlant(ctx: Ctx, sx: number, sy: number): void {
  const put = brush(ctx, sx, sy, TILE_PX, -1, 0)
  const dr = ramp(WITHER)
  contactShadow(ctx, sx, sy, 20)

  driedStalk(put, STEM_X - 5, -1, 13, dr)
  driedStalk(put, STEM_X, 1, 16, dr)
  driedStalk(put, STEM_X + 5, 1, 9, dr)

  // One length has already come down and lies across the bed.
  for (let x = 5; x < 16; x++) {
    put(x, BASE_Y - 1, x < 8 ? dr.lit : dr.mid)
    put(x, BASE_Y, dr.dark)
  }
  put(4, BASE_Y - 1, dr.ink)
  put(16, BASE_Y - 1, dr.ink)

  // Two shrivelled leaf curls, because a dead plant is not just sticks.
  for (const cx of [8, 21]) {
    put(cx, BASE_Y - 4, dr.lit)
    put(cx + 1, BASE_Y - 5, dr.mid)
    put(cx + 2, BASE_Y - 5, dr.dark)
    put(cx + 2, BASE_Y - 4, dr.ink)
    put(cx + 1, BASE_Y - 3, dr.dark)
  }
}

function driedStalk(put: Put, bx: number, lean: number, len: number, dr: Ramp): void {
  let x = bx
  let y = BASE_Y
  for (let i = 0; i < len; i++) {
    put(x, y, i > len * 0.72 ? dr.mid : dr.lit)
    put(x + 1, y, dr.mid)
    put(x + 2, y, dr.ink)
    const t = i / (len - 1)
    if (t < 0.52) y -= 1
    else if (t < 0.8) {
      y -= 1
      x += lean
    } else {
      x += lean
      if (i % 2 === 1) y += 1
    }
  }
}

/* ------------------------------------------------------------------ *
 * Growth reading and sway
 * ------------------------------------------------------------------ */

type Phase = 'seed' | 'sprout' | 'young' | 'full'

/** 0..1 across the whole growing life, half a stage of credit for partial progress. */
function growth(crop: CropDef, plant: Plant): number {
  const stages = Math.max(1, crop.stageDays.length)
  const stage = clamp(plant.stage, 0, stages)
  const need = stage < crop.stageDays.length ? crop.stageDays[stage] : 0
  const partial = need > 0 ? Math.min(1, Math.max(0, plant.progress) / need) : 0
  return Math.min(1, (stage + partial * 0.5) / stages)
}

function phaseOf(crop: CropDef, plant: Plant): Phase {
  if (plant.stage <= 0 && plant.progress <= 0) return 'seed'
  const g = growth(crop, plant)
  return g < 0.3 ? 'sprout' : g < 0.66 ? 'young' : 'full'
}

/**
 * Neighbouring tiles sway out of phase so a field never moves as one block.
 * `beat` is the 6 fps sub-clock of DESIGN section 5, so the sway turns over every
 * other beat — three times a second, not once per rendered frame.
 */
function swayPhase(sx: number, sy: number, beat: number): number {
  const cell = ((sx / TILE_PX) | 0) + ((sy / TILE_PX) | 0)
  return (((beat / 2) | 0) + cell) % 2 === 0 ? 0 : 1
}

/* ------------------------------------------------------------------ *
 * drawPlant
 * ------------------------------------------------------------------ */

/**
 * Parametric: builds the plant from `CropDef.art`, so the whole catalogue needs no
 * hand-drawn sheets. `frame` is the shell's 60 fps counter; every animation here runs
 * off `beatOf(frame)`, and only a ripe plant animates at all.
 */
export function drawPlant(
  ctx: Ctx,
  crop: CropDef,
  plant: Plant,
  sx: number,
  sy: number,
  frame: number,
): void {
  const art = crop.art
  if (plant.dead) {
    deadPlant(ctx, sx, sy)
    return
  }
  const ripe = isRipe(plant, crop)
  const phase = phaseOf(crop, plant)
  if (!ripe && phase === 'seed') {
    seedMound(ctx, art, sx, sy)
    return
  }

  const fullH = clamp(Math.round(art.height) * 2, 8, 25)
  const h = ripe
    ? fullH
    : phase === 'full'
      ? Math.max(10, fullH - 2)
      : phase === 'young'
        ? Math.max(7, ((fullH * 5) / 8) | 0)
        : 8

  const sway = ripe && !prefersReducedMotion() ? swayPhase(sx, sy, beatOf(frame)) : 0
  const swayTop = BASE_Y - Math.max(3, Math.round(h * 0.45))
  const put = brush(ctx, sx, sy, TILE_PX, swayTop, sway)

  contactShadow(ctx, sx, sy, shadowWidth(art.shape, h, ripe))

  if (!ripe) {
    if (phase === 'sprout') {
      sprout(put, art)
      return
    }
    // Young and full plants show the shape's foliage and nothing else: a plant that is
    // not carrying fruit must never be mistaken for one that is.
    switch (art.shape) {
      case 'leafy':
        dome(put, STEM_X, BASE_Y - 1, clamp((h * 7) / 10, 6, 14) | 0, clamp(h + 4, 9, 18), art, false)
        break
      case 'root':
        rootTop(put, art, Math.max(5, h - 3), false)
        break
      default:
        stalk(put, art, h, phase === 'full' ? 4 : 2)
    }
    return
  }

  switch (art.shape) {
    case 'round':
      stalk(put, art, art.fruits <= 1 ? clamp(h >> 1, 7, 14) : h, 3)
      berries(put, art, h)
      break
    case 'long':
      stalk(put, art, h, 3)
      pods(put, art, h)
      break
    case 'cluster':
      stalk(put, art, h, 3)
      bunch(
        put,
        STEM_X,
        BASE_Y - h + 3,
        clamp(Math.round(art.fruits) * 2, 6, 14),
        ramp(art.fruit),
        BASE_Y - 2,
      )
      break
    case 'leafy': {
      const st = ramp(art.stem)
      col(put, STEM_X - 1, BASE_Y - 1, 2, st.ink)
      col(put, STEM_X, BASE_Y - 1, 2, st.mid)
      col(put, STEM_X + 1, BASE_Y - 1, 2, st.dark)
      const dh = clamp(h, 8, 18)
      dome(put, STEM_X, BASE_Y - 1, dh, 22, art, true)
      // A head that also flowers — snowdrop — carries its bells above the crown.
      const bells = clamp(Math.round(art.fruits), 1, 4)
      if (bells >= 2) {
        const ft = ramp(art.fruit)
        for (let i = 0; i < bells; i++) {
          ball(put, STEM_X + spread(i, bells, 7), BASE_Y - dh - 3, 2, ft)
        }
      }
      break
    }
    case 'root':
      rootTop(put, art, h, true)
      break
  }
}

/* ------------------------------------------------------------------ *
 * Fruit trees
 * ------------------------------------------------------------------ */

interface TreeGeom {
  /** Trunk height above the soil line. */
  trunk: number
  /** Trunk half-width, excluding the ink edges. */
  half: number
  rx: number
  ry: number
  /** How far above its own tile the canopy reaches. */
  lift: number
  fruit: number
}

/** Four growth stages, sapling whip to a canopy wider than the tile it stands on. */
const TREE_GEOM: readonly TreeGeom[] = [
  { trunk: 9, half: 0, rx: 6, ry: 5, lift: 0, fruit: 2 },
  { trunk: 12, half: 1, rx: 10, ry: 7, lift: 0, fruit: 2 },
  { trunk: 15, half: 1, rx: 15, ry: 10, lift: 6, fruit: 3 },
  { trunk: 17, half: 2, rx: 20, ry: 12, lift: 12, fruit: 3 },
]

/** A bush keeps its mass low and wide and never grows a trunk worth the name. */
const BUSH_GEOM: readonly TreeGeom[] = [
  { trunk: 4, half: 0, rx: 7, ry: 5, lift: 0, fruit: 2 },
  { trunk: 5, half: 0, rx: 11, ry: 7, lift: 0, fruit: 2 },
  { trunk: 6, half: 0, rx: 14, ry: 9, lift: 0, fruit: 2 },
  { trunk: 7, half: 0, rx: 16, ry: 10, lift: 0, fruit: 2 },
]

/** The 3-frame canopy sway of `docs/GRAPHICS.md` section 6, as pixel offsets. */
const TREE_SWAY = [0, 1, 0, -1] as const

/** Satellite masses of the crown, as fractions of the canopy radii: x, y, radius. */
const CANOPY_LOBES = [
  [-0.62, 0.24, 0.52],
  [0.6, 0.3, 0.48],
  [-0.3, 0.66, 0.4],
  [0.28, 0.7, 0.36],
] as const

function treeGrade(tree: TreeDef, plant: Plant): number {
  const stages = Math.max(1, tree.stageDays.length)
  if (plant.stage >= stages) return 3
  const need = tree.stageDays[plant.stage]
  const partial = need > 0 ? Math.min(1, Math.max(0, plant.progress) / need) : 0
  const t = (plant.stage + partial) / stages
  return t >= 0.7 ? 2 : t >= 0.35 ? 1 : 0
}

function canopyBase(season: Season, art: PlantArt): string {
  switch (season) {
    case 'spring':
      return mixHex(art.leaf, PAL.grassLit, 0.58)
    case 'summer':
      return art.leaf
    case 'fall':
      return mixHex(art.leaf, PAL.lantern, 0.62)
    case 'winter':
      return mixHex(art.leaf, PAL.sky, 0.35)
  }
}

/** One rounded mass of foliage: ink rim, lit upper left, shade pooling lower right. */
function clump(put: Put, cx: number, cy: number, rx: number, ry: number, rp: Ramp): void {
  for (let dy = -ry - 1; dy <= ry + 1; dy++) {
    const w = ellipseSpan(rx + 1, ry + 1, dy)
    if (w >= 0) row(put, cx - w, cy + dy, w * 2 + 1, rp.ink)
  }
  for (let dy = -ry; dy <= ry; dy++) {
    const w = ellipseSpan(rx, ry, dy)
    if (w < 0) continue
    for (let x = cx - w; x <= cx + w; x++) {
      // Distance from a light sitting off the upper-left shoulder. Radial, not a
      // diagonal band: a band across a canopy reads as a stripe, not as a round mass.
      const nx = (x - cx) / rx + 0.46
      const ny = dy / ry + 0.5
      const d = Math.sqrt(nx * nx + ny * ny)
      put(x, cy + dy, d <= 0.6 ? rp.lit : d >= 1.12 ? rp.dark : rp.mid)
    }
  }
}

/** Trunk with a root flare at the soil and bark broken along its shaded side. */
function treeTrunk(put: Put, topY: number, half: number, rp: Ramp): void {
  for (let y = BASE_Y; y >= topY; y--) {
    const hw = half + Math.max(0, 2 - (BASE_Y - y))
    put(STEM_X - hw - 1, y, rp.ink)
    put(STEM_X + hw + 1, y, rp.ink)
    for (let x = STEM_X - hw; x <= STEM_X + hw; x++) {
      put(x, y, hw === 0 ? rp.mid : x === STEM_X - hw ? rp.lit : x >= STEM_X + hw - (hw >= 2 ? 1 : 0) ? rp.dark : rp.mid)
    }
  }
  for (let y = topY + 3; y < BASE_Y - 3; y += 5) {
    put(STEM_X + half, y, rp.ink)
    put(STEM_X - half, y + 2, rp.ink)
  }
  if (half >= 1) col(put, STEM_X - half, topY + 1, 3, rp.spec)
}

/** Where the limbs of a bare winter tree reach, as fractions of the canopy radii. */
const LIMB_ENDS = [
  [-0.92, -0.3],
  [-0.55, -0.85],
  [-0.1, -1.0],
  [0.42, -0.88],
  [0.88, -0.4],
  [0.62, 0.18],
  [-0.75, 0.24],
] as const

function bareLimbs(
  put: Put,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  originY: number,
  rp: Ramp,
  snowy: boolean,
): void {
  const cap = snowy ? SNOW : null
  for (const [fx, fy] of LIMB_ENDS) {
    const ex = cx + Math.round(rx * fx)
    const ey = cy + Math.round(ry * fy)
    stroke(put, STEM_X, originY, ex, ey, rp.mid, rp.ink, cap)
    // One twig off the midpoint, so the crown is not a bare star.
    const mx = (STEM_X + ex) >> 1
    const my = (originY + ey) >> 1
    stroke(put, mx, my, mx + Math.round(rx * fx * 0.35), my - Math.round(ry * 0.3), rp.dark, rp.ink, cap)
  }
}

/** A ripe tree's fruit, hung in the lower half of the canopy where it can be seen. */
function treeFruit(
  put: Put,
  art: PlantArt,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  r: number,
  seed: number,
): void {
  const ft = ramp(art.fruit)
  for (let i = 0; i < count; i++) {
    const a = artNoise(seed, 200 + i)
    const b = artNoise(seed, 240 + i)
    const fx = cx + Math.round((a * 2 - 1) * Math.max(1, rx - r - 2))
    const fy = cy + Math.round((0.1 + b * 0.85) * Math.max(1, ry - r - 1))
    switch (art.shape) {
      case 'long':
        pod(put, fx, fy + 4, 8, 1, ft)
        break
      case 'cluster':
        bunch(put, fx, fy - 2, 5, ft, fy + 8)
        break
      default:
        ball(put, fx, fy, r, ft)
    }
  }
}

/** Unripe fruit set: small green-tinted nubs, so the cycle is readable before payday. */
function fruitNubs(
  put: Put,
  art: PlantArt,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  seed: number,
): void {
  const nub = ramp(mixHex(art.fruit, art.leaf, 0.62))
  for (let i = 0; i < count; i++) {
    const a = artNoise(seed, 300 + i)
    const b = artNoise(seed, 340 + i)
    const fx = cx + Math.round((a * 2 - 1) * Math.max(1, rx - 3))
    const fy = cy + Math.round((0.2 + b * 0.7) * Math.max(1, ry - 2))
    ball(put, fx, fy, 1, nub)
  }
}

/**
 * A planted fruit tree or bush: `docs/CATALOG.md` section 2, growing on its tile forever.
 *
 * Four stages from sapling to mature; at full size the canopy is forty-one pixels across
 * and reaches twelve above its own tile, so it plainly occupies more room than it owns —
 * which is the whole trade a tree asks the player to make. It is built from a trunk with
 * a real root flare, three overlapping canopy clumps and visible fruit, none of which the
 * decorative scenery tree has: that one is a single blob on a stub of trunk.
 *
 * Seasons run blossom, full leaf, ochre, then bare limbs under snow. Fruit already
 * hanging survives the turn of the season, exactly as `growTree` promises, so a ripe
 * winter tree shows its crop on bare wood.
 *
 * `frame` is the shell's 60 fps counter. The canopy sways on `beatOf(frame)` and holds
 * still under reduced motion.
 */
export function drawTree(
  ctx: Ctx,
  tree: TreeDef,
  treeState: Plant,
  sx: number,
  sy: number,
  season: Season,
  frame: number,
): void {
  const art = tree.art
  const bush = tree.wood <= 4
  const grade = treeGrade(tree, treeState)
  const geom = (bush ? BUSH_GEOM : TREE_GEOM)[grade]

  // Never let a canopy bleed into the HUD: it gives up its overhang and squats instead.
  const room = sy < WORLD_Y ? geom.lift : Math.min(geom.lift, Math.max(0, sy - WORLD_Y))
  const drop = geom.lift - room
  const minY = sy - room

  const beat = beatOf(frame)
  const cell = ((sx / TILE_PX) | 0) + ((sy / TILE_PX) | 0)
  const sway = prefersReducedMotion() ? 0 : TREE_SWAY[(beat + cell) & 3]

  const trunkTop = BASE_Y - geom.trunk
  const cy = BASE_Y - geom.trunk - geom.ry + (bush ? 6 : 4) + drop
  const put = treeBrush(ctx, sx, sy, minY, trunkTop + 2, sway)

  contactShadow(ctx, sx, sy, bush ? 20 : 14 + grade * 4)

  const st = ramp(art.stem)
  if (treeState.dead) {
    treeTrunk(put, trunkTop, geom.half, ramp(WITHER))
    bareLimbs(put, STEM_X, cy, geom.rx >> 1, geom.ry >> 1, trunkTop, ramp(WITHER), false)
    return
  }

  const bare = season === 'winter' && !bush
  const leaf = ramp(canopyBase(season, art))

  if (bush) {
    // Canes arch out of the crown instead of a trunk, then the mass sits over them.
    for (let i = 0; i < 4; i++) {
      const fx = i - 2 + (i >= 2 ? 1 : 0)
      stroke(
        put,
        STEM_X,
        BASE_Y,
        STEM_X + fx * ((geom.rx * 2) / 5) | 0,
        cy + Math.round(geom.ry * 0.4),
        st.mid,
        st.ink,
        null,
      )
    }
  } else {
    treeTrunk(put, trunkTop, geom.half, st)
    if (grade >= 2) {
      stroke(put, STEM_X, trunkTop + 3, STEM_X - (geom.rx >> 1), cy + 2, st.mid, st.ink, null)
      stroke(put, STEM_X, trunkTop + 5, STEM_X + (geom.rx >> 1), cy + 3, st.dark, st.ink, null)
    }
  }

  if (bare) {
    bareLimbs(put, STEM_X, cy, geom.rx, geom.ry, trunkTop, st, true)
  } else {
    // Five overlapping masses, drawn back to front. The lower three hang past the base
    // of the crown, which is what scallops the underside — a canopy with a smooth arc
    // along the bottom reads as a balloon on a stick, which is the scenery tree's job.
    clump(put, STEM_X, cy, geom.rx, geom.ry, leaf)
    for (const [fx, fy, fr] of CANOPY_LOBES) {
      clump(
        put,
        STEM_X + Math.round(geom.rx * fx),
        cy + Math.round(geom.ry * fy),
        Math.max(3, Math.round(geom.rx * fr)),
        Math.max(3, Math.round(geom.ry * fr * 1.05)),
        leaf,
      )
    }

    // The glint where the light lands, and gaps punched through the shaded side.
    const gx = STEM_X - Math.round(geom.rx * 0.5)
    const gy = cy - Math.round(geom.ry * 0.55)
    row(put, gx, gy, 3, leaf.spec)
    row(put, gx, gy + 1, 2, leaf.spec)
    const seed = sx * 37 + sy
    for (let i = 0; i < 3 + grade; i++) {
      const hx = STEM_X + Math.round((artNoise(seed, 10 + i) * 1.4 - 0.5) * geom.rx)
      const hy = cy + Math.round((artNoise(seed, 40 + i) - 0.35) * geom.ry)
      row(put, hx, hy, 2, leaf.ink)
      put(hx, hy + 1, leaf.ink)
    }
    if (season === 'winter') {
      // A bush keeps its leaves; the snow still settles on the top of them.
      for (let dx = -geom.rx; dx <= geom.rx; dx++) {
        const dy = ellipseSpan(geom.ry, geom.rx, dx)
        if (dy < 0) continue
        put(STEM_X + dx, cy - dy, SNOW)
        if ((dx & 1) === 0) put(STEM_X + dx, cy - dy + 1, SNOW)
      }
    }
  }

  // Blossom in spring, turned leaves in autumn. Blossom is drawn as real four-pixel
  // florets with a lantern eye, not as noise: a spring orchard has to read across a field.
  if (!bare && (season === 'spring' || season === 'fall')) {
    const spring = season === 'spring'
    const petal = spring ? mixHex(PAL.cream, PAL.berry, 0.18) : mixHex(PAL.lantern, PAL.berry, 0.4)
    const eye = spring ? PAL.lantern : mixHex(PAL.berry, PAL.ink, 0.3)
    const seed = sx * 17 + sy * 3
    for (let i = 0; i < (spring ? 10 : 7) + grade * 4; i++) {
      const a = artNoise(seed, 60 + i) * 2 - 1
      const b = artNoise(seed, 100 + i) * 2 - 1
      if (a * a + b * b > 0.92) continue
      const fx = STEM_X + Math.round(a * geom.rx)
      const fy = cy + Math.round(b * geom.ry)
      if (!spring) {
        put(fx, fy, petal)
        put(fx + 1, fy, withAlpha(petal, 0.6))
        continue
      }
      put(fx, fy - 1, petal)
      put(fx - 1, fy, petal)
      put(fx + 1, fy, petal)
      put(fx, fy + 1, withAlpha(petal, 0.75))
      put(fx, fy, eye)
    }
  }

  const mature = isTreeMature(treeState, tree)
  if (!mature) return
  const seed = sx * 53 + sy * 7
  if (isTreeRipe(treeState, tree)) {
    // A cluster is five berries in itself, so a cluster tree hangs fewer of them.
    const hung =
      art.shape === 'cluster'
        ? clamp(Math.round(art.fruits / 2), 2, 3)
        : clamp(Math.round(art.fruits), 2, 5)
    treeFruit(put, art, STEM_X, cy, geom.rx, geom.ry, hung, geom.fruit, seed)
  } else if (treeFruitsIn(tree, season) && treeState.progress * 2 >= tree.regrowDays) {
    fruitNubs(put, art, STEM_X, cy, geom.rx, geom.ry, clamp(Math.round(art.fruits), 2, 6), seed)
  }
}

/* ------------------------------------------------------------------ *
 * Item icons — 24x24, anchored top-left
 * ------------------------------------------------------------------ */

/** The little bagged-seed icon used in the shop and inventory. 24x24. */
export function drawSeedIcon(ctx: Ctx, crop: CropDef, sx: number, sy: number): void {
  const put = brush(ctx, sx, sy, ICON, -1, 0)
  const paper = ramp(PAL.parchment)
  const ft = ramp(crop.art.fruit)
  const label = ramp(PAL.soil)

  outline(ctx, sx + 3, sy + 1, 18, 22, PAL.ink)
  rect(ctx, sx + 4, sy + 2, 16, 20, PAL.parchment)
  rect(ctx, sx + 4, sy + 2, 16, 2, PAL.cream)
  rect(ctx, sx + 4, sy + 2, 2, 20, PAL.cream)
  rect(ctx, sx + 18, sy + 4, 2, 18, paper.dark)
  rect(ctx, sx + 6, sy + 20, 12, 2, paper.dark)

  // The crimped glue line across the top of the packet.
  for (let x = 5; x < 19; x += 2) put(x, 5, PAL.ink)

  // Label strip, then the crop's own colour as the thing you actually read.
  put(4, 7, PAL.ink)
  row(put, 6, 7, 12, PAL.ink)
  row(put, 6, 8, 12, label.lit)
  row(put, 6, 9, 12, label.mid)
  row(put, 6, 10, 12, PAL.ink)
  ball(put, 12, 15, 4, ft)
  // Loose seed spilled along the bottom of the packet, inside the paper.
  put(6, 19, ft.dark)
  put(7, 19, ft.mid)
  put(7, 20, ft.ink)
  put(16, 20, ft.dark)
  put(17, 20, ft.mid)
  put(17, 19, ft.lit)
}

/** A five-point star, as a mask. Dilated once for its ink outline, then filled. */
const STAR = [
  '...#...',
  '..###..',
  '#######',
  '.#####.',
  '..###..',
  '.##.##.',
  '#.....#',
] as const

function qualityStar(ctx: Ctx, quality: Quality, sx: number, sy: number): void {
  if (quality === 'normal') return
  const rp = ramp(quality === 'gold' ? PAL.lantern : mixHex(PAL.dusk, PAL.cream, 0.55))
  const put = brush(ctx, sx, sy, ICON, -1, 0)
  const ox = ICON - 8
  const oy = 1
  for (let r = 0; r < STAR.length; r++) {
    for (let c = 0; c < STAR[r].length; c++) {
      if (STAR[r][c] !== '#') continue
      for (let k = 0; k < 9; k++) {
        put(ox + c + ((k % 3) - 1), oy + r + (((k / 3) | 0) - 1), rp.ink)
      }
    }
  }
  for (let r = 0; r < STAR.length; r++) {
    for (let c = 0; c < STAR[r].length; c++) {
      if (STAR[r][c] !== '#') continue
      put(ox + c, oy + r, r <= 1 || c <= 1 ? rp.lit : r >= 5 || c >= 5 ? rp.dark : rp.mid)
    }
  }
  put(ox + 2, oy + 2, rp.spec)
}

/** One harvested unit of a crop or tree fruit, drawn by shape family. 24x24. */
export function drawProduceIcon(
  ctx: Ctx,
  crop: CropDef,
  quality: Quality,
  sx: number,
  sy: number,
): void {
  const art = crop.art
  const put = brush(ctx, sx, sy, ICON, -1, 0)
  const st = ramp(art.stem)
  const lf = ramp(art.leaf)
  const ft = ramp(art.fruit)

  switch (art.shape) {
    case 'round':
      ball(put, 11, 14, 7, ft)
      col(put, 11, 3, 4, st.mid)
      col(put, 12, 3, 4, st.dark)
      col(put, 10, 3, 4, st.ink)
      leafBlade(put, 12, 4, 1, 5, lf)
      leafBlade(put, 10, 5, -1, 5, lf)
      break
    case 'long':
      pod(put, 11, 21, 18, 3, ft)
      col(put, 11, 1, 2, st.mid)
      leafBlade(put, 12, 2, 1, 4, lf)
      break
    case 'cluster':
      col(put, 11, 1, 3, st.mid)
      put(10, 1, st.ink)
      put(12, 1, st.dark)
      leafBlade(put, 12, 2, 1, 4, lf)
      bunch(put, 11, 4, 9, ft, ICON - 2)
      break
    case 'leafy':
      dome(put, 11, 21, 17, 20, art, true)
      break
    case 'root': {
      // Shoulder held for a few rows, then a long taper: a root, not a funnel.
      for (let i = 0; i < 15; i++) {
        const y = 7 + i
        const w = Math.max(1, 9 - ((i * 5) >> 3))
        const x0 = 11 - ((w - 1) >> 1)
        put(x0 - 1, y, ft.ink)
        put(x0 + w, y, ft.ink)
        for (let x = x0; x < x0 + w; x++) {
          put(x, y, w <= 2 ? ft.dark : x <= x0 + 1 ? ft.lit : x >= x0 + w - 2 ? ft.dark : ft.mid)
        }
        // Growth rings across the shaded flank.
        if (i % 3 === 2 && w > 3) put(x0 + w - 2, y, ft.ink)
      }
      row(put, 7, 6, 9, ft.ink)
      row(put, 8, 8, 2, ft.spec)
      put(8, 9, ft.spec)
      for (let k = 0; k < 3; k++) {
        const a = k - 1
        for (let s = 0; s < 6; s++) {
          const x = 11 + Math.round(a * s * 0.7)
          put(x + 1, 6 - s, lf.ink)
          put(x, 6 - s, s === 5 ? lf.spec : a < 0 ? lf.lit : a > 0 ? lf.dark : lf.mid)
        }
      }
      break
    }
  }
  qualityStar(ctx, quality, sx, sy)
}
