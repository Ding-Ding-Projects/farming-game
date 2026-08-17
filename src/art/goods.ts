/**
 * Icons for the two `ItemRef` variants wave three introduced: factory and animal products,
 * and raw materials.
 *
 * `products.ts` gives every good a unique tint and one of twenty-eight silhouette names.
 * Drawing twenty-eight hand-placed sprites is a job for the art lane; what is drawn here is
 * parametric, and each of those names is mapped onto one of four families — a round body, a
 * tall bottle, a squared block or a loose heap. The tint is what tells two goods in the same
 * family apart, and the tint is guaranteed unique by `validateEconomics()`.
 *
 * Every icon is 12x12 anchored top-left, exactly like `drawToolIcon` and `drawSeedIcon`, so
 * the inventory grid does not have to know which kind of thing it is holding.
 */
import type { MaterialId } from '../game/farm-types'
import type { ProductDef, ProductShape } from '../game/products'
import type { Quality } from '../game/types'
import { PAL, shade } from '../engine/palette'
import { hline, outline, px, rect, vline } from '../engine/pixel'

type Ctx = CanvasRenderingContext2D

type Family = 'round' | 'tall' | 'block' | 'heap'

/** Which silhouette family each catalogue shape is drawn as. */
const FAMILY: Readonly<Record<ProductShape, Family>> = {
  bar: 'block',
  board: 'block',
  bolt: 'tall',
  bottle: 'tall',
  bowl: 'round',
  cake: 'round',
  candle: 'tall',
  candy: 'heap',
  comb: 'block',
  cone: 'tall',
  cup: 'tall',
  egg: 'round',
  fish: 'block',
  flask: 'tall',
  fluff: 'heap',
  garment: 'block',
  ingot: 'block',
  jar: 'tall',
  loaf: 'round',
  nest: 'heap',
  ore: 'heap',
  pie: 'round',
  roe: 'heap',
  round: 'round',
  sack: 'heap',
  skewer: 'tall',
  slab: 'block',
  wheel: 'round',
}

/** A round body: eggs, cheeses, loaves, pies. */
function roundBody(ctx: Ctx, sx: number, sy: number, tint: string): void {
  const lit = shade(tint, 0.32)
  const dark = shade(tint, -0.3)
  rect(ctx, sx + 3, sy + 3, 6, 7, tint)
  hline(ctx, sx + 4, sy + 2, 4, tint)
  hline(ctx, sx + 4, sy + 10, 4, dark)
  vline(ctx, sx + 2, sy + 4, 5, tint)
  vline(ctx, sx + 9, sy + 4, 5, dark)
  hline(ctx, sx + 4, sy + 3, 3, lit)
  px(ctx, sx + 3, sy + 4, lit)
}

/** A tall body with a neck: bottles, flasks, cups, candles. */
function tallBody(ctx: Ctx, sx: number, sy: number, tint: string): void {
  const lit = shade(tint, 0.32)
  const dark = shade(tint, -0.3)
  rect(ctx, sx + 5, sy + 1, 2, 3, dark)
  rect(ctx, sx + 3, sy + 4, 6, 7, tint)
  vline(ctx, sx + 3, sy + 4, 7, lit)
  vline(ctx, sx + 8, sy + 4, 7, dark)
  hline(ctx, sx + 4, sy + 5, 2, lit)
}

/** A squared body: bars, ingots, boards, folded cloth. */
function blockBody(ctx: Ctx, sx: number, sy: number, tint: string): void {
  const lit = shade(tint, 0.32)
  const dark = shade(tint, -0.3)
  rect(ctx, sx + 2, sy + 4, 8, 6, tint)
  hline(ctx, sx + 2, sy + 4, 8, lit)
  hline(ctx, sx + 2, sy + 9, 8, dark)
  vline(ctx, sx + 9, sy + 4, 6, dark)
}

/** A loose heap: ore, wool, roe, a sack of something. */
function heapBody(ctx: Ctx, sx: number, sy: number, tint: string): void {
  const lit = shade(tint, 0.32)
  const dark = shade(tint, -0.3)
  hline(ctx, sx + 4, sy + 3, 4, lit)
  rect(ctx, sx + 3, sy + 4, 6, 3, tint)
  rect(ctx, sx + 2, sy + 7, 8, 3, tint)
  hline(ctx, sx + 2, sy + 9, 8, dark)
  px(ctx, sx + 4, sy + 5, lit)
  px(ctx, sx + 7, sy + 8, dark)
}

const BODY: Readonly<Record<Family, (ctx: Ctx, sx: number, sy: number, tint: string) => void>> = {
  round: roundBody,
  tall: tallBody,
  block: blockBody,
  heap: heapBody,
}

/** The same corner star produce wears, so one grading language covers the whole bag. */
function qualityStar(ctx: Ctx, quality: Quality, sx: number, sy: number): void {
  if (quality === 'normal') return
  const c = quality === 'gold' ? PAL.lantern : shade(PAL.dusk, 0.5)
  const lit = shade(c, 0.4)
  px(ctx, sx + 9, sy, c)
  px(ctx, sx + 8, sy + 1, c)
  px(ctx, sx + 9, sy + 1, lit)
  px(ctx, sx + 10, sy + 1, c)
  px(ctx, sx + 9, sy + 2, c)
  px(ctx, sx + 11, sy + 3, lit)
}

/** 12x12, anchored top-left. */
export function drawProductIcon(
  ctx: Ctx,
  product: ProductDef,
  quality: Quality,
  sx: number,
  sy: number,
): void {
  BODY[FAMILY[product.art.shape]](ctx, sx, sy, product.art.tint)
  qualityStar(ctx, quality, sx, sy)
}

/** Raw stock: timber brown, stone grey, fittings iron. Materials never carry a grade. */
const MATERIAL_TINT: Readonly<Record<MaterialId, string>> = {
  wood: '#9a6b3f',
  stone: '#8d8d94',
  fibre: '#b6c07a',
  plank: '#c08a4e',
  bolt: '#79808c',
  screw: '#8e96a2',
  nail: '#a6adb8',
  tape: '#5f6a75',
  deed: '#efe3c2',
  mallet: '#7f5a34',
  axe: '#6f7883',
  saw: '#9aa3ae',
}

const HEAPED: ReadonlySet<MaterialId> = new Set<MaterialId>(['stone', 'fibre', 'wood'])

/** 12x12, anchored top-left. A deed is paper; everything else is stock on a shelf. */
export function drawMaterialIcon(ctx: Ctx, id: MaterialId, sx: number, sy: number): void {
  const tint = MATERIAL_TINT[id] ?? PAL.soil
  if (id === 'deed') {
    outline(ctx, sx + 2, sy + 1, 8, 10, PAL.ink)
    rect(ctx, sx + 3, sy + 2, 6, 8, tint)
    hline(ctx, sx + 4, sy + 4, 4, shade(tint, -0.4))
    hline(ctx, sx + 4, sy + 6, 4, shade(tint, -0.4))
    hline(ctx, sx + 4, sy + 8, 3, shade(tint, -0.4))
    return
  }
  if (HEAPED.has(id)) heapBody(ctx, sx, sy, tint)
  else blockBody(ctx, sx, sy, tint)
}
