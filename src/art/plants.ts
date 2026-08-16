import type { CropDef, Plant, PlantArt, Quality } from '../game/types'
import { isRipe } from '../game/crops'
import { PAL, shade } from '../engine/palette'
import { hline, outline, px, rect, vline } from '../engine/pixel'
import { beatOf, prefersReducedMotion } from './tiles'

type Ctx = CanvasRenderingContext2D
/** Plots one pixel in a sprite-local coordinate space, clipped and sway-shifted. */
type Put = (x: number, y: number, color: string) => void

const TILE_PX = 16
/** Soil line inside the tile: every plant grows up from here. */
const BASE_Y = 13
/** Stem column. Sway pushes it to 8, so the plant oscillates around the tile centre. */
const STEM_X = 7
/** Both item icons are drawn inside a 12x12 box, matching the belt tool icons. */
const ICON = 12

const shadeCache = new Map<string, string>()
/** `shade` parses a hex string on every call; plants redraw 220 tiles a frame. */
function tone(hex: string, amount: number): string {
  const key = `${hex}|${amount}`
  const hit = shadeCache.get(key)
  if (hit !== undefined) return hit
  const value = shade(hex, amount)
  shadeCache.set(key, value)
  return value
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
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

function brush(ctx: Ctx, sx: number, sy: number, size: number, swayTop: number, sway: number): Put {
  return (x, y, color) => {
    const gx = y < swayTop ? x + sway : x
    if (gx < 0 || gx >= size || y < 0 || y >= size) return
    px(ctx, sx + gx, sy + y, color)
  }
}

function contactShadow(ctx: Ctx, sx: number, sy: number, width: number): void {
  const w = clamp(width, 2, 14)
  hline(ctx, sx + 8 - ((w / 2) | 0), sy + BASE_Y + 1, w, PAL.ink)
}

/** 0..1 across the whole growing life, half a stage of credit for partial progress. */
function growth(crop: CropDef, plant: Plant): number {
  const stages = Math.max(1, crop.stageDays.length)
  const stage = clamp(plant.stage, 0, stages)
  const need = stage < crop.stageDays.length ? crop.stageDays[stage] : 0
  const partial = need > 0 ? Math.min(1, Math.max(0, plant.progress) / need) : 0
  return Math.min(1, (stage + partial * 0.5) / stages)
}

function shadowWidth(shape: PlantArt['shape'], h: number, ripe: boolean): number {
  if (!ripe) return 3 + ((h / 4) | 0)
  if (shape === 'leafy') return 9
  if (shape === 'root') return 7
  return 5
}

/** Round body with an upper-left highlight and a lower-right shade. */
function ball(put: Put, cx: number, cy: number, r: number, color: string): void {
  const lit = tone(color, 0.32)
  const dark = tone(color, -0.32)
  const fudge = r >= 2 ? r : 0
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + fudge) continue
      const sum = x + y
      put(cx + x, cy + y, sum <= -r ? lit : sum >= r ? dark : color)
    }
  }
}

/** Vertical capsule: `hw` 1 for the 16x16 tile, 2 for the fatter icon. */
function pod(put: Put, cx: number, bottom: number, height: number, color: string, hw: number): void {
  const lit = tone(color, 0.3)
  const dark = tone(color, -0.32)
  const top = bottom - height + 1
  for (let y = top; y <= bottom; y++) {
    const inset = y === top || y === bottom ? 1 : 0
    for (let x = cx - hw + inset; x <= cx + hw - inset; x++) {
      put(x, y, x === cx - hw ? lit : x === cx + hw ? dark : color)
    }
  }
  for (let y = top + 2; y < bottom; y += 3) put(cx + hw - 1, y, dark)
}

const BUNCH_ROWS = [3, 2, 2, 1] as const

/** Grape-style bunch of 2x2 berries, widest at the top. */
function bunch(put: Put, cx: number, topY: number, count: number, color: string, floor: number): void {
  const lit = tone(color, 0.3)
  const dark = tone(color, -0.3)
  let placed = 0
  for (let row = 0; row < BUNCH_ROWS.length && placed < count; row++) {
    const per = BUNCH_ROWS[row]
    const x0 = cx - per + 1
    const y = Math.min(topY + row * 2, floor - 1)
    for (let i = 0; i < per && placed < count; i++, placed++) {
      const x = x0 + i * 2
      put(x, y, lit)
      put(x + 1, y, color)
      put(x, y + 1, color)
      put(x + 1, y + 1, dark)
    }
  }
}

/** Broad leaf head: outer leaves in `leaf`, the heart in the crop colour. */
function head(put: Put, cx: number, bottom: number, height: number, maxW: number, art: PlantArt): void {
  const lit = tone(art.leaf, 0.3)
  const dark = tone(art.leaf, -0.32)
  for (let i = 0; i < height; i++) {
    const y = bottom - i
    const f = (i + 0.75) / (height + 0.5)
    const w = clamp(Math.round(maxW * Math.sin(Math.PI * f)), 3, maxW)
    const x0 = cx - ((w - 1) >> 1)
    for (let x = x0; x < x0 + w; x++) {
      const inner = x > x0 + 1 && x < x0 + w - 2 && i > 0 && i < height - 2
      let c: string
      if (i === 0 || x === x0 + w - 1) c = dark
      else if (i === height - 1 || x === x0) c = lit
      else c = inner ? art.fruit : art.leaf
      put(x, y, c)
    }
  }
  for (let j = 0; j < 3; j++) {
    put(cx - j, bottom - 1 - j, dark)
    put(cx + 1 + j, bottom - 1 - j, dark)
  }
}

function leafPair(put: Put, y: number, dir: number, color: string): void {
  const lit = tone(color, 0.3)
  put(STEM_X + dir, y, color)
  put(STEM_X + 2 * dir, y, color)
  put(STEM_X + 2 * dir, y - 1, lit)
  put(STEM_X + 3 * dir, y - 1, color)
}

/**
 * The stem-and-leaves body every non-root, non-leafy plant is built on. A ripe plant keeps
 * its leaves low so the fruit owns the top half of the tile and the silhouette stays legible.
 */
function stalk(put: Put, art: PlantArt, h: number, leaves: number): void {
  const top = BASE_Y - h + 1
  const stemDark = tone(art.stem, -0.35)
  for (let y = BASE_Y; y >= top; y--) put(STEM_X, y, art.stem)
  if (h >= 5) for (let y = BASE_Y; y > top; y--) put(STEM_X + 1, y, stemDark)
  put(STEM_X, top, tone(art.leaf, 0.2))
  for (let i = 0; i < leaves; i++) {
    const ly = BASE_Y - 1 - i * 3
    if (ly <= top) break
    leafPair(put, ly, i % 2 === 0 ? -1 : 1, art.leaf)
  }
}

function berries(put: Put, art: PlantArt, h: number): void {
  const n = clamp(Math.round(art.fruits), 1, 6)
  const top = BASE_Y - h + 1
  if (n === 1) {
    ball(put, STEM_X, BASE_Y - 2, 2, art.fruit)
    return
  }
  const r = n === 2 ? 2 : 1
  const first = top + r
  const last = Math.max(first, BASE_Y - 4)
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? -1 : 1
    const cy = clamp(first + Math.round((i * (last - first)) / (n - 1)), first, last)
    ball(put, STEM_X + dir * (r + 1), cy, r, art.fruit)
  }
}

function pods(put: Put, art: PlantArt, h: number): void {
  const n = clamp(Math.round(art.fruits), 1, 3)
  const height = clamp(h - 3, 4, 9)
  const lanes = n === 1 ? [0] : n === 2 ? [-3, 3] : [-4, 0, 4]
  for (const lane of lanes) pod(put, STEM_X + lane, BASE_Y - 1, height, art.fruit, 1)
}

/** Foliage-only crop: a fan of tops with the root's shoulder breaking the soil. */
function rootTop(put: Put, art: PlantArt, h: number): void {
  const fruit = art.fruit
  put(6, BASE_Y, fruit)
  put(7, BASE_Y, tone(fruit, 0.25))
  put(8, BASE_Y, fruit)
  put(9, BASE_Y, tone(fruit, -0.3))
  put(7, BASE_Y - 1, tone(fruit, 0.15))
  put(8, BASE_Y - 1, fruit)
  const spikes = clamp(Math.round(art.fruits), 3, 5)
  const len = clamp(h - 1, 3, 12)
  const tip = tone(art.leaf, 0.35)
  const lit = tone(art.leaf, 0.2)
  const dark = tone(art.leaf, -0.25)
  for (let k = 0; k < spikes; k++) {
    const a = (k / (spikes - 1) - 0.5) * 2
    const color = a < -0.1 ? lit : a > 0.1 ? dark : art.leaf
    const reach = Math.max(3, len - Math.round(Math.abs(a) * 2))
    for (let s = 0; s < reach; s++) {
      put(STEM_X + Math.round(a * s * 0.7), BASE_Y - 2 - s, s === reach - 1 ? tip : color)
    }
  }
}

function seedMound(ctx: Ctx, art: PlantArt, sx: number, sy: number): void {
  const put = brush(ctx, sx, sy, TILE_PX, -1, 0)
  const lit = tone(PAL.soil, 0.22)
  const mid = PAL.soil
  const crevice = PAL.bark
  for (let x = 5; x <= 10; x++) put(x, 12, x >= 6 && x <= 9 ? lit : mid)
  for (let x = 4; x <= 11; x++) put(x, 13, x === 4 || x === 11 ? crevice : tone(PAL.soil, -0.18))
  put(7, 11, tone(art.fruit, 0.2))
  put(8, 11, tone(art.fruit, -0.3))
  contactShadow(ctx, sx, sy, 8)
}

function deadPlant(ctx: Ctx, sx: number, sy: number): void {
  const put = brush(ctx, sx, sy, TILE_PX, -1, 0)
  const dry = tone(PAL.bark, 0.2)
  const grey = PAL.dusk
  const dark = tone(PAL.bark, -0.15)
  contactShadow(ctx, sx, sy, 9)
  // Two stalks that have folded in on each other, plus a fallen length on the soil.
  put(7, 10, dry)
  put(6, 11, dry)
  put(5, 12, dry)
  put(4, 13, dark)
  put(8, 11, grey)
  put(9, 12, grey)
  put(10, 13, dark)
  put(7, 11, grey)
  put(7, 12, dry)
  put(7, 13, dark)
  put(11, 13, dry)
  put(12, 13, dark)
}

/**
 * Parametric: builds the plant from CropDef.art, so twelve crops need no hand-drawn sheets.
 * `frame` is the shell's 60 fps counter; every animation here runs off `beatOf(frame)`.
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
  if (!ripe && plant.stage <= 0) {
    seedMound(ctx, art, sx, sy)
    return
  }
  const fullH = clamp(Math.round(art.height), 4, 14)
  const h = ripe ? fullH : clamp(Math.round(2 + (fullH - 2) * growth(crop, plant)), 2, fullH)
  const sway = ripe && !prefersReducedMotion() ? swayPhase(sx, sy, beatOf(frame)) : 0
  const swayTop = BASE_Y - Math.max(1, Math.round(h * 0.45))
  const put = brush(ctx, sx, sy, TILE_PX, swayTop, sway)

  contactShadow(ctx, sx, sy, shadowWidth(art.shape, h, ripe))

  if (!ripe) {
    stalk(put, art, h, h >= 5 ? 2 : 1)
    return
  }
  switch (art.shape) {
    case 'round':
      stalk(put, art, h, 2)
      berries(put, art, h)
      break
    case 'long':
      stalk(put, art, h, 2)
      pods(put, art, h)
      break
    case 'cluster':
      stalk(put, art, h, 2)
      bunch(put, STEM_X, BASE_Y - h + 1, clamp(Math.round(art.fruits), 3, 8), art.fruit, BASE_Y - 1)
      break
    case 'leafy':
      put(STEM_X, BASE_Y, tone(art.stem, -0.2))
      put(STEM_X + 1, BASE_Y, tone(art.stem, -0.35))
      head(put, STEM_X, BASE_Y - 1, clamp(h, 4, 12), 11, art)
      break
    case 'root':
      rootTop(put, art, h)
      break
  }
}

/** The little bagged-seed icon used in the shop and inventory. 12x12. */
export function drawSeedIcon(ctx: Ctx, crop: CropDef, sx: number, sy: number): void {
  const fruit = crop.art.fruit
  outline(ctx, sx + 2, sy + 1, 8, 10, PAL.ink)
  rect(ctx, sx + 3, sy + 2, 6, 8, PAL.parchment)
  hline(ctx, sx + 3, sy + 2, 6, PAL.cream)
  vline(ctx, sx + 3, sy + 2, 3, PAL.cream)
  hline(ctx, sx + 3, sy + 4, 6, tone(PAL.soil, 0.3))
  px(ctx, sx + 4, sy + 5, tone(fruit, -0.35))
  px(ctx, sx + 7, sy + 5, tone(fruit, -0.35))
  rect(ctx, sx + 4, sy + 6, 4, 3, fruit)
  hline(ctx, sx + 4, sy + 6, 4, tone(fruit, 0.3))
  hline(ctx, sx + 4, sy + 8, 4, tone(fruit, -0.3))
  hline(ctx, sx + 3, sy + 9, 6, tone(PAL.parchment, -0.25))
}

function qualityStar(ctx: Ctx, quality: Quality, sx: number, sy: number): void {
  if (quality === 'normal') return
  const c = quality === 'gold' ? PAL.lantern : tone(PAL.dusk, 0.5)
  const lit = tone(c, 0.4)
  px(ctx, sx + 9, sy, c)
  px(ctx, sx + 8, sy + 1, c)
  px(ctx, sx + 9, sy + 1, lit)
  px(ctx, sx + 10, sy + 1, c)
  px(ctx, sx + 9, sy + 2, c)
  px(ctx, sx + 11, sy + 3, lit)
}

export function drawProduceIcon(
  ctx: Ctx,
  crop: CropDef,
  quality: Quality,
  sx: number,
  sy: number,
): void {
  const art = crop.art
  const put = brush(ctx, sx, sy, ICON, -1, 0)
  const stemDark = tone(art.stem, -0.3)
  switch (art.shape) {
    case 'round':
      ball(put, 5, 6, 4, art.fruit)
      put(5, 1, stemDark)
      put(5, 2, art.stem)
      put(4, 1, art.leaf)
      put(3, 2, tone(art.leaf, 0.3))
      put(6, 2, art.leaf)
      break
    case 'long':
      pod(put, 5, 10, 9, art.fruit, 2)
      put(5, 1, art.stem)
      put(4, 1, tone(art.leaf, 0.3))
      put(6, 1, art.leaf)
      break
    case 'cluster':
      put(5, 1, art.stem)
      put(6, 1, tone(art.leaf, 0.3))
      bunch(put, 5, 2, 8, art.fruit, ICON - 1)
      break
    case 'leafy':
      head(put, 5, 10, 8, 10, art)
      break
    case 'root': {
      const lit = tone(art.fruit, 0.3)
      const dark = tone(art.fruit, -0.32)
      for (let i = 0; i < 7; i++) {
        const y = 4 + i
        const w = Math.max(1, 6 - i)
        const x0 = 5 - ((w - 1) >> 1)
        for (let x = x0; x < x0 + w; x++) {
          put(x, y, w === 1 ? dark : x === x0 ? lit : x === x0 + w - 1 ? dark : art.fruit)
        }
      }
      for (let k = 0; k < 3; k++) {
        const a = k - 1
        for (let s = 0; s < 4; s++) {
          put(5 + Math.round(a * s * 0.7), 3 - s, s === 3 ? tone(art.leaf, 0.35) : art.leaf)
        }
      }
      break
    }
  }
  qualityStar(ctx, quality, sx, sy)
}
