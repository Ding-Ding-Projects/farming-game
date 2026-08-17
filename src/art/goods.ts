/**
 * Icons for the two `ItemRef` variants wave three introduced: factory and animal
 * products, and raw materials.
 *
 * ## The family system
 *
 * `products.ts` holds 213 goods across 28 catalogue silhouettes. Drawing 213 sprites by
 * hand would be 213 chances to draw one badly, so what is drawn here is a **family
 * system**: forty-six hand-built silhouettes — wine bottles, milk bottles, cruets,
 * preserve jars, sauce jars, burlap sacks, paper bags, soup bowls, salad bowls,
 * platters, mugs, teacups, cheese wheels, loaves, pies, soap cakes, candles, tins,
 * chocolate bars, wrapped sweets, lollipops, ice cream cones, milkshakes, pasta nests,
 * skewers, grill plates, shirts, hats, handbags, folded cloth, bolts of cloth, board
 * stacks, charcoal, ingots, glass panes, ore, eggs, tufts, feathers, honeycomb, fish,
 * roe, nuggets, rashers and flasks — each of which takes the good's own tint and four
 * per-good modifiers derived from its id: an accent (label, lid, garnish), a fill level,
 * a label style and a cap style.
 *
 * A family is chosen from the catalogue shape, refined by the group (an `animal` bottle
 * is a milk bottle, a `pantry` one a cruet, a `drink` one a juice bottle) and overridden
 * by id for the handful of goods whose shape name is a rough fit — `glass` is a pane,
 * `milkshake` is a tall glass, `burger` is a plate off the grill.
 *
 * The result is that no two goods a player can hold at once read alike: the silhouette
 * separates the families, the tint separates the members — and `validateEconomics()`
 * guarantees the tint is unique across the whole table.
 *
 * ## The drawing rules
 *
 * `docs/GRAPHICS.md` section 5: every icon carries the full five-tone ramp — a one-pixel
 * `ink` outline, a dark side, a mid body, a lit edge, and a `cream` specular where the
 * light catches. Light falls from the **upper left**, always.
 *
 * Icons draw at **24x24** (the default, the doubled inventory cell) or **32x32**, both
 * anchored top-left, exactly like `drawToolIcon` and `drawSeedIcon`, so the inventory
 * grid does not have to know which kind of thing it is holding. Neither size is the
 * other scaled: the gross silhouette is proportional to the box, the detail — an outline,
 * a label rule, a grill mark — is absolute pixels, so 32 gets detail 24 cannot hold
 * rather than the same art blown up.
 *
 * Nothing here animates, so there is nothing for `prefersReducedMotion` to drop: an
 * inventory icon is a state readout, not decoration.
 */
import type { MaterialId } from '../game/farm-types'
import type { ProductDef, ProductGroup, ProductShape } from '../game/products'
import type { Quality } from '../game/types'
import type { Ramp } from '../engine/palette'
import { PAL, ramp } from '../engine/palette'
import { dither, ellipse, hline, px, rect, shadeRect, vline } from '../engine/pixel'
import { mixHex } from './tiles'

type Ctx = CanvasRenderingContext2D

/** The default icon box: the old 12x12 cell, doubled. */
export const ICON = 24
/** The large icon box, for the almanac plate and the ledger header. */
export const ICON_LARGE = 32

/* ------------------------------------------------------------------ *
 * Shared materials
 *
 * A vessel is neutral and its contents carry the tint — a bowl of soup reads
 * as soup because the broth is the good's colour, not because the crockery is.
 * These are the neutral ramps every family draws its container from.
 * ------------------------------------------------------------------ */

const CROCK = ramp(mixHex(PAL.parchment, PAL.sky, 0.3))
const WOOD = ramp(mixHex(PAL.bark, PAL.soil, 0.45))
const PAPER = ramp(mixHex(PAL.parchment, PAL.soil, 0.12))
const CLOTH = ramp(mixHex(PAL.parchment, PAL.soil, 0.34))
const STEEL = ramp(mixHex(PAL.dusk, PAL.sky, 0.42))
const GLASS = ramp(mixHex(PAL.sky, PAL.cream, 0.5))
const CRUST = ramp(mixHex(PAL.soil, PAL.lantern, 0.42))
const FLAME = ramp(PAL.lantern)
const STONE = ramp(mixHex(PAL.dusk, PAL.parchment, 0.3))
const LEAFY = ramp(PAL.grassLit)

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** Two-pixel lit and dark edges at 32, one at 24. */
function edgeOf(s: number): number {
  return s >= 32 ? 2 : 1
}

/**
 * The specular. An L of two or three pixels tucked inside the lit edge — never a
 * whole face, which is what separates a glint from a blown highlight.
 */
function glint(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  if (s >= 32) {
    hline(ctx, x, y, 3, r.spec)
    hline(ctx, x, y + 1, 2, r.spec)
    return
  }
  hline(ctx, x, y, 2, r.spec)
  px(ctx, x, y + 1, r.spec)
}

/**
 * A five-tone ellipse: ink ring, dark lower-right crescent, mid body, lit upper-left
 * crescent. The workhorse for anything round — a scoop, a rock, an egg, a plate.
 */
function orb(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, r: Ramp): void {
  if (rx < 0 || ry < 0) return
  ellipse(ctx, cx, cy, rx + 1, ry + 1, r.ink)
  if (rx < 2 || ry < 2) {
    ellipse(ctx, cx, cy, rx, ry, r.mid)
    return
  }
  ellipse(ctx, cx, cy, rx, ry, r.dark)
  ellipse(ctx, cx - 1, cy - 1, rx - 1, ry - 1, r.lit)
  ellipse(ctx, cx, cy, rx - 2, ry - 2, r.mid)
}

/** A run of rows of equal half-width, interpolated from `from` to `to`. */
type Seg = readonly [rows: number, from: number, to: number]

/**
 * Expand a list of segments into a per-row half-width profile. Row `i` of the body is
 * `half[i] * 2 + 1` pixels wide, centred; `-1` leaves the row empty.
 *
 * Half-widths are integers at both icon sizes because each family computes its own
 * from `s` — no shared grid, so 32 is never 24 stretched.
 */
function buildProfile(segs: readonly Seg[]): number[] {
  const out: number[] = []
  for (const seg of segs) {
    const rows = seg[0]
    const from = seg[1]
    const to = seg[2]
    for (let i = 0; i < rows; i++) {
      out.push(rows < 2 ? from : from + Math.round(((to - from) * i) / (rows - 1)))
    }
  }
  return out
}

/**
 * An ovoid: a rounded point at the top, the widest line low, a round base. Straight
 * segments cannot make this — an egg built from three tapers reads as a hexagon.
 */
function ovoid(rows: number, hw: number): number[] {
  const out: number[] = []
  const c = Math.round(rows * 0.6)
  for (let i = 0; i < rows; i++) {
    const span = i <= c ? c + 1 : rows - c
    const u = (i - c) / span
    const k = 1 - u * u
    out.push(Math.max(0, Math.round(hw * Math.pow(k < 0 ? 0 : k, i <= c ? 0.62 : 0.46))))
  }
  return out
}

/**
 * Profiles depend only on the family and the icon size, of which there are two, so
 * every profile is built once and handed back on every later call.
 */
const PROFILES = new Map<string, readonly number[]>()

function profileOf(key: string, build: () => readonly number[]): readonly number[] {
  const hit = PROFILES.get(key)
  if (hit !== undefined) return hit
  const built = build()
  PROFILES.set(key, built)
  return built
}

/**
 * Fill a silhouette described by a half-width profile, in five tones.
 *
 * Ink goes down first, in its own pass, so an interior fill can never eat the outline
 * where a shoulder steps in or out. Then the body: mid everywhere, `dark` down the
 * right and across any row that caps a run, `lit` down the left and across any row that
 * opens one. The light comes from the upper left, so lit is drawn last and owns the
 * shared corner.
 *
 * A row only counts as opening or capping a run if it gains or loses two pixels of
 * half-width — a body that widens by one pixel a row is a slope, not a stack of ledges,
 * and lighting every row of it turns an ingot into a staircase.
 */
function profileBody(
  ctx: Ctx,
  cx: number,
  top: number,
  half: readonly number[],
  r: Ramp,
  e: number,
): void {
  const n = half.length

  for (let i = 0; i < n; i++) {
    const hw = half[i]
    if (hw < 0) continue
    const yy = top + i
    px(ctx, cx - hw - 1, yy, r.ink)
    px(ctx, cx + hw + 1, yy, r.ink)

    const prev = i > 0 ? half[i - 1] : -1
    if (prev < hw) {
      if (prev < 0) hline(ctx, cx - hw - 1, yy - 1, hw * 2 + 3, r.ink)
      else {
        hline(ctx, cx - hw - 1, yy - 1, hw - prev, r.ink)
        hline(ctx, cx + prev + 2, yy - 1, hw - prev, r.ink)
      }
    }
    const next = i < n - 1 ? half[i + 1] : -1
    if (next < hw) {
      if (next < 0) hline(ctx, cx - hw - 1, yy + 1, hw * 2 + 3, r.ink)
      else {
        hline(ctx, cx - hw - 1, yy + 1, hw - next, r.ink)
        hline(ctx, cx + next + 2, yy + 1, hw - next, r.ink)
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const hw = half[i]
    if (hw < 0) continue
    const yy = top + i
    const left = cx - hw
    const w = hw * 2 + 1
    hline(ctx, left, yy, w, r.mid)
    if (w < 3) continue
    const ee = w >= e * 2 + 1 ? e : 1
    const prev = i > 0 ? half[i - 1] : -1
    const next = i < n - 1 ? half[i + 1] : -1
    hline(ctx, cx + hw - ee + 1, yy, ee, r.dark)
    if (next < 0 || hw - next > 1) hline(ctx, left, yy, w, r.dark)
    if (prev < 0 || hw - prev > 1) hline(ctx, left, yy, w, r.lit)
    hline(ctx, left, yy, ee, r.lit)
  }
}

/** A liquid level inside a vessel: the tint below, glass above, a lit meniscus between. */
function fillTo(
  ctx: Ctx,
  cx: number,
  top: number,
  half: readonly number[],
  from: number,
  r: Ramp,
): void {
  for (let i = from; i < half.length; i++) {
    const hw = half[i]
    if (hw < 1) continue
    hline(ctx, cx - hw + 1, top + i, hw * 2 - 1, i === from ? r.lit : r.mid)
    if (i > from) px(ctx, cx + hw - 1, top + i, r.dark)
  }
}

/** A label band across a body: accent fill, lit top rule, ink base, and writing. */
function labelBand(
  ctx: Ctx,
  left: number,
  y: number,
  w: number,
  h: number,
  lines: number,
  m: Mods,
): void {
  if (w < 3 || h < 3) return
  rect(ctx, left, y, w, h, m.accent.mid)
  hline(ctx, left, y, w, m.accent.lit)
  hline(ctx, left, y + h - 1, w, m.accent.ink)
  for (let i = 0; i < lines; i++) {
    const ly = y + 2 + i * 2
    if (ly >= y + h - 1) break
    hline(ctx, left + 2, ly, w - 4 - (i & 1) * 2, m.accent.ink)
  }
}

/* ------------------------------------------------------------------ *
 * Per-good modifiers
 * ------------------------------------------------------------------ */

interface Mods {
  /** Label, lid, garnish and trim. One hue per almanac shelf, three tints per hue. */
  readonly accent: Ramp
  /** 0..2 — how full a vessel is. */
  readonly fill: number
  /** 0..3 — how the label is written. */
  readonly label: number
  /** 0..2 — cork, foil or wax. */
  readonly cap: number
  /** 0..3 — which garnish sits on top. */
  readonly spot: number
}

/** The shelf a good sits on picks its trim colour. Accents only — never the body. */
const GROUP_ACCENT: Readonly<Record<ProductGroup, string>> = {
  animal: PAL.parchment,
  baked: PAL.bark,
  cooked: PAL.berry,
  craft: PAL.dusk,
  dairy: PAL.cream,
  drink: PAL.sky,
  feed: PAL.grass,
  metal: PAL.dusk,
  milled: PAL.soil,
  mineral: PAL.shadow,
  pantry: PAL.lantern,
  preserve: PAL.berry,
  snack: PAL.lantern,
  sweet: PAL.berry,
  textile: PAL.sky,
  timber: PAL.soil,
}

function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* ------------------------------------------------------------------ *
 * Families
 * ------------------------------------------------------------------ */

type Family =
  | 'bolt'
  | 'boards'
  | 'bottle-juice'
  | 'bottle-milk'
  | 'bottle-wine'
  | 'bowl-salad'
  | 'bowl-soup'
  | 'candle'
  | 'charcoal'
  | 'choc-bar'
  | 'comb'
  | 'cone'
  | 'cruet'
  | 'egg'
  | 'feather'
  | 'fish'
  | 'flask'
  | 'folded'
  | 'grill'
  | 'handbag'
  | 'hat'
  | 'ingot'
  | 'jar-preserve'
  | 'jar-sauce'
  | 'loaf'
  | 'lollipop'
  | 'mug'
  | 'nest'
  | 'nugget'
  | 'ore'
  | 'pane'
  | 'paper-bag'
  | 'pie'
  | 'platter'
  | 'rashers'
  | 'roe'
  | 'sack'
  | 'shake'
  | 'shirt'
  | 'skewer'
  | 'soap'
  | 'sweet'
  | 'teacup'
  | 'tin'
  | 'tuft'
  | 'wheel'

type Draw = (ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods) => void

/* ---------------------------------------------------------- bottles and jars */

function wineBottle(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  const rows = s - 5
  const neck = big ? 8 : 6
  const shoulder = big ? 4 : 3
  const bh = big ? 6 : 5
  const half = profileOf(`wine${s}`, () => buildProfile([
    [neck, 1, 1],
    [shoulder, 1, bh],
    [rows - neck - shoulder, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)

  // Cork, foil or wax over the mouth.
  const capR = m.cap === 0 ? WOOD : m.cap === 1 ? STEEL : m.accent
  shadeRect(ctx, cx - 2, y, 5, big ? 5 : 4, capR)

  // The glass streak that says "bottle" and not "column".
  vline(ctx, cx - bh + e + 1, top + neck + shoulder + 2, big ? 9 : 6, r.spec)

  const ly = top + neck + shoulder + (big ? 5 : 3)
  labelBand(ctx, cx - bh, ly, bh * 2 + 1, big ? 10 : 7, 1 + (m.label & 1), m)
  glint(ctx, cx - 1, y + (big ? 6 : 5), s, r)
}

function milkBottle(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 4
  const rows = s - 6
  const neck = big ? 4 : 3
  const shoulder = big ? 5 : 4
  const nh = big ? 3 : 2
  const bh = big ? 7 : 5
  const half = profileOf(`milk${s}`, () => buildProfile([
    [neck, nh, nh],
    [shoulder, nh, bh],
    [rows - neck - shoulder, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)

  // A crimped foil cap that overhangs the neck by a pixel each side.
  shadeRect(ctx, cx - nh - 1, y, nh * 2 + 3, 4, m.accent)
  for (let i = 0; i < nh * 2 + 1; i += 2) px(ctx, cx - nh + i, y + 2, m.accent.ink)

  const ly = top + rows - (big ? 12 : 8)
  labelBand(ctx, cx - bh + 1, ly, bh * 2 - 1, big ? 8 : 6, 1 + (m.label & 1), m)
  glint(ctx, cx - bh + e, top + neck + shoulder + 1, s, r)
}

function juiceBottle(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 4
  const rows = s - 6
  const neck = big ? 5 : 4
  const shoulder = big ? 3 : 2
  const bh = big ? 7 : 5
  const half = profileOf(`juice${s}`, () => buildProfile([
    [neck, 2, 2],
    [shoulder, 2, bh],
    [rows - neck - shoulder, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)

  // Ridged screw cap.
  shadeRect(ctx, cx - 3, y, 7, big ? 5 : 4, m.accent)
  for (let i = 0; i < 3; i++) vline(ctx, cx - 2 + i * 2, y + 1, big ? 3 : 2, m.accent.ink)

  const ly = top + neck + shoulder + (big ? 4 : 2)
  const lh = big ? 12 : 9
  labelBand(ctx, cx - bh, ly, bh * 2 + 1, lh, 0, m)
  // A dot of the good's own colour on the label: which juice, at a glance.
  orb(ctx, cx + (big ? 3 : 2), ly + (lh >> 1), big ? 3 : 2, big ? 3 : 2, r)
  for (let i = 0; i < 1 + (m.label & 1); i++) {
    hline(ctx, cx - bh + 2, ly + 3 + i * 3, bh, m.accent.ink)
  }
  glint(ctx, cx - bh + e, top + neck + shoulder + 1, s, r)
}

function cruet(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 4
  const rows = s - 6
  const neck = big ? 10 : 7
  const shoulder = big ? 5 : 4
  const bh = big ? 5 : 4
  const half = profileOf(`cruet${s}`, () => buildProfile([
    [neck, 1, 1],
    [shoulder, 1, bh],
    [rows - neck - shoulder, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)

  // Ball stopper and a pour lip that leans into the light.
  orb(ctx, cx, y + 2, 2, 2, WOOD)
  px(ctx, cx - 2, top + 1, r.ink)
  px(ctx, cx - 3, top + 2, r.ink)
  px(ctx, cx - 2, top + 2, r.lit)

  const ly = top + neck + shoulder + (big ? 3 : 2)
  labelBand(ctx, cx - bh, ly, bh * 2 + 1, big ? 8 : 6, 1 + (m.label & 1), m)
  vline(ctx, cx - bh + e, top + neck + shoulder + 1, big ? 4 : 2, r.spec)
  glint(ctx, cx - 1, top + 2, s, r)
}

function preserveJar(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 5
  const rows = s - 7
  const bh = big ? 8 : 6
  const half = profileOf(`pjar${s}`, () => buildProfile([
    [2, bh - 1, bh - 1],
    [2, bh - 1, bh],
    [rows - 6, bh, bh],
    [2, bh, bh - 1],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Glass first, then the jam poured into it, so the headspace reads as empty glass.
  hline(ctx, cx - bh + 1, top, bh * 2 - 1, GLASS.lit)
  fillTo(ctx, cx, top, half, 3 + m.fill, r)

  // Cloth lid, overhanging, tied with string.
  const lidW = bh * 2 + 5
  shadeRect(ctx, cx - bh - 2, y, lidW, big ? 6 : 5, CLOTH)
  dither(ctx, cx - bh - 1, y + 1, lidW - 2, 2, m.accent.mid, m.label & 1)
  hline(ctx, cx - bh - 2, y + (big ? 5 : 4), lidW, WOOD.dark)
  for (let i = 1; i < lidW - 1; i += 2) px(ctx, cx - bh - 2 + i, y + (big ? 6 : 5), CLOTH.ink)

  labelBand(ctx, cx - bh + 2, top + rows - (big ? 10 : 7), bh * 2 - 3, big ? 7 : 5, 1, m)
  glint(ctx, cx - bh + e, top + 2, s, r)
}

function sauceJar(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 6
  const rows = s - 8
  const bh = big ? 7 : 5
  const half = profileOf(`sjar${s}`, () => buildProfile([
    [2, bh - 2, bh - 2],
    [2, bh - 2, bh],
    [rows - 4, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  hline(ctx, cx - bh + 3, top, bh * 2 - 5, GLASS.lit)
  fillTo(ctx, cx, top, half, 3 + m.fill, r)

  // Screw lid with a knurled edge.
  shadeRect(ctx, cx - bh + 1, y, bh * 2 - 1, big ? 7 : 5, STEEL)
  for (let i = 0; i < bh * 2 - 3; i += 2) px(ctx, cx - bh + 2 + i, y + 1, STEEL.ink)
  hline(ctx, cx - bh + 2, y + (big ? 4 : 3), bh * 2 - 3, m.accent.mid)

  labelBand(ctx, cx - bh + 1, top + rows - (big ? 11 : 8), bh * 2 - 1, big ? 8 : 6, 1 + (m.label & 1), m)
  glint(ctx, cx - bh + e, top + 3, s, r)
}

function flask(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 4
  const rows = s - 6
  const bh = big ? 8 : 6
  const half = profileOf(`flask${s}`, () => buildProfile([
    [big ? 7 : 5, 1, 1],
    [3, 2, bh - 2],
    [rows - (big ? 14 : 11), bh, bh],
    [4, bh, bh - 3],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  fillTo(ctx, cx, top, half, (big ? 8 : 6) + m.fill, r)

  // Ground stopper.
  shadeRect(ctx, cx - 2, y, 5, 4, m.cap === 0 ? WOOD : STEEL)
  // A bubble caught in the shoulder, and the glass streak.
  px(ctx, cx + 2, top + (big ? 11 : 9), GLASS.spec)
  vline(ctx, cx - bh + e + 1, top + (big ? 11 : 9), big ? 5 : 3, GLASS.spec)
  glint(ctx, cx - 1, top + 1, s, r)
}

/* ------------------------------------------------------------------ sacks */

function sack(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 4
  const rows = s - 6
  const bh = big ? 9 : 7
  // Ears of loose cloth, a pinched neck, then the belly settling on its base.
  const half = profileOf(`sack${s}`, () => buildProfile([
    [1, 3, 3],
    [1, 4, 4],
    [2, 2, 2],
    [3, 4, bh - 3],
    [2, bh - 1, bh],
    [rows - 13, bh, bh],
    [3, bh, bh - 2],
    [1, bh - 3, bh - 3],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Burlap weave, only across the belly.
  dither(ctx, cx - bh + 3, top + (big ? 14 : 11), bh * 2 - 5, big ? 9 : 6, r.dark, 0, 2)
  // The cord, pulled tight around the pinch.
  hline(ctx, cx - 3, top + 2, 7, m.accent.mid)
  hline(ctx, cx - 3, top + 3, 7, m.accent.ink)
  px(ctx, cx - 3, top + 2, m.accent.lit)
  // Stencil on the belly: one mark per label style, so two sacks never match.
  for (let i = 0; i <= m.label; i++) {
    hline(ctx, cx - 3, top + (big ? 14 : 10) + i * 2, 7 - i * 2, m.accent.ink)
  }
  glint(ctx, cx - bh + e + 1, top + (big ? 9 : 7), s, r)
}

function paperBag(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  const rows = s - 5
  const bh = big ? 8 : 6
  const half = profileOf(`bag${s}`, () => buildProfile([
    [3, bh - 1, bh - 1],
    [rows - 3, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Folded-over top.
  hline(ctx, cx - bh + 1, top + 2, bh * 2 - 1, r.ink)
  hline(ctx, cx - bh + 1, top + 1, bh * 2 - 1, r.spec)
  for (let i = 0; i < bh; i += 2) px(ctx, cx - bh + 2 + i * 2, top, r.dark)
  // Vertical stripes, the number set by the label style.
  const stripes = 2 + (m.label & 1)
  for (let i = 0; i < stripes; i++) {
    const sx = cx - bh + 2 + i * (big ? 5 : 4)
    vline(ctx, sx, top + 4, rows - 6, m.accent.mid)
    vline(ctx, sx + 1, top + 4, rows - 6, m.accent.dark)
  }
  // The contents peeking over the fold.
  orb(ctx, cx + 1, top + 1, 2, 1, r)
  glint(ctx, cx - bh + e, top + 4, s, r)
}

/* ------------------------------------------------------------ bowls and plates */

function soupBowl(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rim = big ? 11 : 8
  const foot = big ? 5 : 4
  const rows = big ? 15 : 11
  const top = y + s - 3 - rows
  const half = profileOf(`sbowl${s}`, () => buildProfile([
    [3, rim, rim],
    [rows - 5, rim - 1, foot],
    [2, foot, foot],
  ]))
  profileBody(ctx, cx, top, half, CROCK, e)

  // Broth: the good's own colour, filling the mouth.
  orb(ctx, cx, top + 2, rim - 2, big ? 3 : 2, r)
  // Garnish floating on it.
  for (let i = 0; i <= m.spot; i++) {
    px(ctx, cx - 3 + i * 3, top + 1 + (i & 1), m.accent.mid)
    px(ctx, cx - 3 + i * 3, top + 2 + (i & 1), m.accent.ink)
  }
  // A glazed band around the belly, in the shelf accent.
  hline(ctx, cx - rim + 3, top + (big ? 7 : 5), rim * 2 - 7, m.accent.mid)
  hline(ctx, cx - rim + 3, top + (big ? 8 : 6), rim * 2 - 7, m.accent.ink)
  glint(ctx, cx - rim + 2, top + 4, s, CROCK)
}

function saladBowl(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rim = big ? 12 : 9
  const rows = big ? 11 : 8
  const top = y + s - 3 - rows
  const half = profileOf(`salad${s}`, () => buildProfile([
    [2, rim, rim],
    [rows - 4, rim - 1, big ? 6 : 5],
    [2, big ? 6 : 5, big ? 5 : 4],
  ]))
  // Leaves heaped above the rim, drawn before the bowl so the rim overlaps them.
  orb(ctx, cx - (big ? 5 : 4), top - 2, big ? 5 : 4, big ? 4 : 3, LEAFY)
  orb(ctx, cx + (big ? 4 : 3), top - 3, big ? 5 : 4, big ? 4 : 3, r)
  orb(ctx, cx, top - (big ? 6 : 5), big ? 5 : 4, big ? 4 : 3, m.accent)

  profileBody(ctx, cx, top, half, WOOD, e)
  // The rim ring sits over the leaves.
  hline(ctx, cx - rim, top, rim * 2 + 1, WOOD.lit)
  hline(ctx, cx - rim, top + 1, rim * 2 + 1, WOOD.mid)
  px(ctx, cx - rim - 1, top, WOOD.ink)
  px(ctx, cx + rim + 1, top, WOOD.ink)
  for (let i = 0; i <= m.spot; i++) px(ctx, cx - 4 + i * 3, top - 4, m.accent.spec)
  glint(ctx, cx - rim + 2, top + 3, s, WOOD)
}

function platter(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + s - (big ? 9 : 7)
  const rx = big ? 14 : 10
  orb(ctx, cx, cy, rx, big ? 5 : 4, CROCK)
  // The plate's own rim, one tone in from the edge.
  ellipse(ctx, cx, cy - 1, rx - 3, big ? 3 : 2, CROCK.spec)
  // Three mounds: the good, its garnish, and greens.
  orb(ctx, cx - (big ? 7 : 5), cy - (big ? 4 : 3), big ? 5 : 4, big ? 4 : 3, r)
  orb(ctx, cx + (big ? 6 : 4), cy - (big ? 5 : 4), big ? 4 : 3, big ? 4 : 3, m.accent)
  orb(ctx, cx - 1, cy - (big ? 8 : 6), big ? 5 : 4, big ? 4 : 3, LEAFY)
  for (let i = 0; i <= m.spot; i++) px(ctx, cx - 3 + i * 3, cy - (big ? 11 : 8), r.spec)
  glint(ctx, cx - rx + 3, cy - 2, s, CROCK)
}

function nest(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + s - (big ? 10 : 8)
  const rx = big ? 13 : 10
  orb(ctx, cx, cy + (big ? 4 : 3), rx, big ? 4 : 3, CROCK)
  // The nest: coiled strands, drawn as rings so the coil reads and not a mound.
  orb(ctx, cx, cy, rx - 2, big ? 6 : 5, r)
  for (let i = 0; i < (big ? 4 : 3); i++) {
    const k = rx - 4 - i * 2
    if (k < 2) break
    ellipse(ctx, cx, cy, k, k - (big ? 2 : 1), r.ink)
    ellipse(ctx, cx, cy, k - 1, k - (big ? 3 : 2), r.lit)
    ellipse(ctx, cx - 1, cy, k - 2, k - (big ? 4 : 3), r.mid)
  }
  // Loose ends over the rim, and the sauce or cheese on top.
  for (let i = 0; i < 3; i++) {
    px(ctx, cx - rx + 2 + i * (big ? 8 : 6), cy + (big ? 4 : 3) - (i & 1), r.lit)
    px(ctx, cx - rx + 2 + i * (big ? 8 : 6), cy + (big ? 5 : 4) - (i & 1), r.ink)
  }
  for (let i = 0; i <= m.spot; i++) {
    orb(ctx, cx - 4 + i * 4, cy - (big ? 5 : 4) + (i & 1), 1, 1, m.accent)
  }
  glint(ctx, cx - rx + 4, cy - (big ? 4 : 3), s, r)
}

/* ------------------------------------------------------------------ cups */

function mug(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 2) + 1
  const bw = big ? 17 : 13
  const bh = big ? 18 : 13
  const top = y + s - 4 - bh
  // Handle first: the body's outline then closes over its root.
  const hx = cx + bw - 1
  const hy = top + 4
  const hh = big ? 9 : 7
  shadeRect(ctx, hx, hy, big ? 6 : 5, hh, CROCK)
  rect(ctx, hx, hy + 2, big ? 4 : 3, hh - 4, CROCK.ink)

  shadeRect(ctx, cx, top, bw, bh, CROCK)
  // The drink, sitting down inside the rim rather than perched on it.
  const mx = cx + (bw >> 1)
  ellipse(ctx, mx, top + 3, (bw >> 1) - 2, big ? 2 : 1, r.dark)
  ellipse(ctx, mx - 1, top + 2, (bw >> 1) - 3, big ? 2 : 1, r.mid)
  hline(ctx, cx + 3, top + 2, bw - 7, r.lit)
  hline(ctx, cx + 1, top, bw - 2, CROCK.spec)
  for (let i = 0; i <= m.spot; i++) px(ctx, cx + 4 + i * 3, top + 3, m.accent.spec)
  // A glazed band and the saucer.
  hline(ctx, cx + 1, top + (big ? 9 : 7), bw - 2, m.accent.mid)
  hline(ctx, cx + 1, top + (big ? 10 : 8), bw - 2, m.accent.ink)
  orb(ctx, cx + (bw >> 1), top + bh + 1, (bw >> 1) + (big ? 4 : 3), 1, CROCK)
  glint(ctx, cx + e, top + (big ? 4 : 3), s, CROCK)
}

function teacup(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1) - 1
  const rim = big ? 9 : 7
  const rows = big ? 12 : 9
  const top = y + s - 6 - rows
  const half = profileOf(`tcup${s}`, () => buildProfile([
    [2, rim, rim],
    [rows - 4, rim - 1, big ? 5 : 4],
    [2, big ? 5 : 4, big ? 4 : 3],
  ]))
  // Handle.
  shadeRect(ctx, cx + rim, top + 2, big ? 5 : 4, big ? 7 : 5, CROCK)
  rect(ctx, cx + rim, top + 4, big ? 3 : 2, big ? 3 : 1, CROCK.ink)

  profileBody(ctx, cx, top, half, CROCK, e)
  // The tea.
  orb(ctx, cx, top + 1, rim - 2, 1, r)
  hline(ctx, cx - rim + 2, top, rim * 2 - 3, r.lit)
  // Saucer.
  orb(ctx, cx, top + rows + 2, rim + (big ? 4 : 3), 1, CROCK)
  // The tag on its string, hanging over the rim.
  vline(ctx, cx - rim - 1, top + 2, big ? 5 : 4, PAPER.dark)
  shadeRect(ctx, cx - rim - 3, top + (big ? 7 : 6), 5, 4, m.accent)
  for (let i = 0; i <= (m.label & 1); i++) px(ctx, cx - rim - 2 + i, top + (big ? 8 : 7), PAPER.spec)
  glint(ctx, cx - rim + e, top + 3, s, CROCK)
}

function shake(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 5
  const rows = s - 8
  const bh = big ? 7 : 5
  const half = profileOf(`shake${s}`, () => buildProfile([
    [rows - 4, bh, bh - 2],
    [2, bh - 2, bh - 4],
    [2, big ? 6 : 4, big ? 6 : 4],
  ]))
  profileBody(ctx, cx, top, half, GLASS, e)
  fillTo(ctx, cx, top, half, 3, r)
  // Whipped top and the cherry.
  orb(ctx, cx, top, bh - 1, 2, ramp(PAL.cream))
  orb(ctx, cx, top - 3, 2, 2, m.accent)
  // Straw, leaning into the light.
  for (let i = 0; i < (big ? 8 : 6); i++) {
    px(ctx, cx + 3 - (i >> 1), y + i, m.accent.mid)
    px(ctx, cx + 4 - (i >> 1), y + i, m.accent.dark)
  }
  glint(ctx, cx - bh + e, top + 5, s, GLASS)
}

/* -------------------------------------------------------------- baked, dairy */

function cheeseWheel(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rx = big ? 9 : 7
  const ry = big ? 4 : 3
  const side = big ? 13 : 10
  const cy = y + ((s - side - ry * 2) >> 1) + ry + 1

  // A drum: straight walls, a rounded base, and a flat face on top of both.
  outlineDrum(ctx, cx, cy, rx, ry, side, r, e)
  orb(ctx, cx, cy, rx, ry, r)

  if (m.cap === 0) {
    // Holes through the paste.
    for (let i = 0; i <= m.spot; i++) {
      const hx = cx - 5 + i * 4
      const hy = cy + (i & 1) - 1
      ellipse(ctx, hx, hy, 1, 1, r.ink)
      px(ctx, hx, hy, r.dark)
      px(ctx, hx - 1, hy - 1, r.spec)
    }
  } else if (m.cap === 1) {
    // A stamped rind ring.
    ellipse(ctx, cx, cy, rx - 4, ry - 1, r.dark)
    ellipse(ctx, cx - 1, cy - 1, rx - 5, ry - 2, r.spec)
  } else {
    // Or labelled: a plaque on the front of the drum. A band right across the wall
    // cuts the wheel in two and reads as a bun, which is not what this is.
    const lw = big ? 13 : 9
    labelBand(ctx, cx - (lw >> 1), cy + 2, lw, big ? 6 : 4, 1, m)
  }
  // Waxed rind along the foot, where the wheel sat on the shelf.
  hline(ctx, cx - rx, cy + side - 1, rx * 2 + 1, m.accent.dark)
  glint(ctx, cx - rx + e + 1, cy - 1, s, r)
}

/** The wall and rounded base of a cylinder seen slightly from above. */
function outlineDrum(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  side: number,
  r: Ramp,
  e: number,
): void {
  ellipse(ctx, cx, cy + side, rx + 1, ry + 1, r.ink)
  rect(ctx, cx - rx - 1, cy, rx * 2 + 3, side, r.ink)
  // The foot stays in shadow throughout: light comes from above, so nothing on the
  // underside of a drum catches it, and lifting it there makes the wheel read as a bun.
  ellipse(ctx, cx, cy + side, rx, ry, r.dark)
  rect(ctx, cx - rx, cy, rx * 2 + 1, side, r.mid)
  rect(ctx, cx + rx - e + 1, cy, e, side, r.dark)
  rect(ctx, cx - rx, cy, e, side, r.lit)
}

function loaf(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 17 : 13
  const top = y + s - 4 - rows
  const bh = big ? 12 : 9
  const half = profileOf(`loaf${s}`, () => buildProfile([
    [1, bh - 5, bh - 4],
    [2, bh - 3, bh - 1],
    [rows - 5, bh, bh],
    [2, bh, bh - 1],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Slashes across the crust, each with a lit lip above it.
  const cuts = 2 + (m.label & 1)
  for (let i = 0; i < cuts; i++) {
    const sx = cx - bh + 3 + i * (big ? 7 : 5)
    for (let k = 0; k < (big ? 6 : 4); k++) {
      px(ctx, sx + k, top + 3 + k, r.ink)
      px(ctx, sx + k, top + 2 + k, r.spec)
    }
  }
  // A dusting of flour along the top.
  dither(ctx, cx - bh + 2, top + 1, bh * 2 - 3, 2, m.accent.spec, m.spot & 1)
  glint(ctx, cx - bh + e + 1, top + 3, s, r)
}

function pie(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rim = big ? 13 : 10
  const rows = big ? 9 : 7
  const top = y + s - 4 - rows
  const half = profileOf(`pie${s}`, () => buildProfile([
    [2, rim, rim],
    [rows - 2, rim - 1, big ? 8 : 6],
  ]))
  profileBody(ctx, cx, top, half, CROCK, e)

  // The filling, then the lattice over it.
  orb(ctx, cx, top - 2, rim - 2, big ? 4 : 3, r)
  for (let i = 0; i < (big ? 4 : 3); i++) {
    const lx = cx - rim + 4 + i * (big ? 6 : 5)
    vline(ctx, lx, top - (big ? 5 : 4), big ? 8 : 6, CRUST.mid)
    vline(ctx, lx + 1, top - (big ? 5 : 4), big ? 8 : 6, CRUST.dark)
  }
  for (let i = 0; i < 2; i++) {
    const ly = top - (big ? 4 : 3) + i * (big ? 4 : 3)
    hline(ctx, cx - rim + 3, ly, rim * 2 - 5, CRUST.lit)
    hline(ctx, cx - rim + 3, ly + 1, rim * 2 - 5, CRUST.dark)
  }
  // Crimped rim.
  for (let i = 0; i < rim; i++) {
    px(ctx, cx - rim + 1 + i * 2, top - 1, CRUST.spec)
    px(ctx, cx - rim + 1 + i * 2, top, CRUST.ink)
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 2 + i * 4, top - (big ? 6 : 5), m.accent.mid)
  glint(ctx, cx - rim + 3, top + 2, s, CROCK)
}

/* ------------------------------------------------------------ sweets and cooked */

function chocBar(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const bw = big ? 20 : 15
  const bh = big ? 26 : 19
  const bx = x + ((s - bw) >> 1)
  const by = y + ((s - bh) >> 1)
  shadeRect(ctx, bx, by, bw, bh, r)
  // Segments: a grid of blocks, each with its own lit lip.
  const cw = big ? 9 : 7
  const ch = big ? 7 : 5
  for (let cy = 0; cy < 2; cy++) {
    for (let cxi = 0; cxi < 2; cxi++) {
      const sx = bx + 1 + cxi * cw
      const sy = by + 1 + cy * ch
      rect(ctx, sx, sy, cw - 1, ch - 1, r.mid)
      hline(ctx, sx, sy, cw - 1, r.lit)
      vline(ctx, sx, sy, ch - 1, r.lit)
      hline(ctx, sx, sy + ch - 2, cw - 1, r.dark)
      vline(ctx, sx + cw - 2, sy, ch - 1, r.dark)
      px(ctx, sx + 1, sy + 1, r.spec)
    }
  }
  // Foil wrapper, folded back over the lower half.
  const fy = by + 1 + ch * 2
  shadeRect(ctx, bx - 1, fy, bw + 2, bh - (fy - by) + 1, m.accent)
  for (let i = 0; i < (big ? 4 : 3); i++) {
    vline(ctx, bx + 1 + i * (big ? 6 : 5), fy + 2, bh - (fy - by) - 3, m.accent.dark)
  }
  labelBand(ctx, bx + 1, fy + (big ? 6 : 4), bw - 2, big ? 8 : 6, 1 + (m.label & 1), m)
  glint(ctx, bx + e, by + e, s, r)
}

function wrappedSweet(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  const rx = big ? 8 : 6
  // Twisted ends.
  for (let i = 0; i < (big ? 6 : 5); i++) {
    const hh = 1 + (i >> 1)
    rect(ctx, cx - rx - 1 - i, cy - hh, 1, hh * 2 + 1, m.accent.mid)
    rect(ctx, cx + rx + 1 + i, cy - hh, 1, hh * 2 + 1, m.accent.mid)
    px(ctx, cx - rx - 1 - i, cy - hh, m.accent.lit)
    px(ctx, cx + rx + 1 + i, cy + hh, m.accent.dark)
  }
  orb(ctx, cx, cy, rx, big ? 6 : 5, r)
  // A stripe or a swirl, depending on the label style.
  if ((m.label & 1) === 0) {
    for (let i = 0; i < 2; i++) {
      vline(ctx, cx - 2 + i * 4, cy - (big ? 4 : 3), big ? 9 : 7, m.accent.mid)
    }
  } else {
    ellipse(ctx, cx, cy, big ? 4 : 3, 2, m.accent.mid)
    ellipse(ctx, cx, cy, 1, 1, m.accent.spec)
  }
  glint(ctx, cx - rx + 2, cy - (big ? 3 : 2), s, r)
}

function lollipop(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const rr = big ? 9 : 7
  const cy = y + rr + 2
  // Stick.
  shadeRect(ctx, cx - 1, cy, 3, s - (cy - y) - 2, PAPER)
  orb(ctx, cx, cy, rr, rr, r)
  // The spiral, drawn as three shrinking rings in the accent.
  for (let i = 0; i < 3; i++) {
    const k = rr - 2 - i * 2
    if (k < 1) break
    ellipse(ctx, cx, cy, k, k, i % 2 === 0 ? m.accent.mid : r.lit)
  }
  px(ctx, cx, cy, m.accent.spec)
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 1 + i * 2, cy - rr + 1, r.spec)
  glint(ctx, cx - rr + 3, cy - rr + 3, s, r)
}

function cone(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 16 : 12
  const top = y + s - 2 - rows
  const cw = big ? 7 : 5
  const half = profileOf(`cone${s}`, () => buildProfile([[rows, cw, 0]]))
  profileBody(ctx, cx, top, half, CRUST, e)
  // Waffle cross-hatch.
  for (let i = 0; i < rows - 2; i += 3) {
    const hw = half[i]
    hline(ctx, cx - hw + 1, top + i, hw * 2 - 1, CRUST.dark)
  }
  for (let i = 0; i < rows - 2; i++) {
    if ((i & 3) === 0) px(ctx, cx - 1 + ((i >> 1) & 1), top + i, CRUST.spec)
  }
  // Two scoops: the good, and its accent.
  orb(ctx, cx - (big ? 4 : 3), top - (big ? 3 : 2), big ? 6 : 5, big ? 5 : 4, r)
  orb(ctx, cx + (big ? 4 : 3), top - (big ? 5 : 4), big ? 6 : 5, big ? 5 : 4, m.accent)
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 2 + i * 5, top - (big ? 9 : 7), r.spec)
  glint(ctx, cx - (big ? 7 : 5), top - (big ? 4 : 3), s, r)
}

function skewer(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  // The stick, showing above the first chunk and below the last.
  shadeRect(ctx, cx - 1, y + 1, 3, s - 3, WOOD)
  const ry = big ? 3 : 2
  const cw = big ? 7 : 6
  const step = big ? 11 : 8
  for (let i = 0; i < 3; i++) {
    const cy = y + (big ? 5 : 4) + i * step
    orb(ctx, cx, cy, cw, ry, i === 1 ? m.accent : r)
    if (i !== 1) {
      // Char marks across the meat, following the light.
      hline(ctx, cx - cw + 3, cy - ry + 1, cw * 2 - 5, r.dark)
      hline(ctx, cx - cw + 4, cy + ry - 1, cw * 2 - 7, r.dark)
    }
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx + cw - 3 - i * 3, y + (big ? 5 : 4), r.spec)
  glint(ctx, cx - cw + 2, y + (big ? 5 : 4), s, r)
}

function grillPlate(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + s - (big ? 8 : 6)
  const rx = big ? 14 : 10
  orb(ctx, cx, cy, rx, big ? 4 : 3, CROCK)
  // The cut, sitting proud of the plate.
  const mw = big ? 11 : 8
  const mh = big ? 12 : 9
  shadeRect(ctx, cx - mw, cy - mh - 2, mw * 2, mh, r)
  // Grill marks: short diagonal sears, not full-width rules — a line right across
  // the cut turns one piece of meat into a stack of them.
  for (let i = 0; i < 3; i++) {
    const gx = cx - mw + 3 + i * (big ? 6 : 4)
    for (let k = 0; k < (big ? 7 : 5); k++) {
      px(ctx, gx + k, cy - mh + k, r.ink)
      px(ctx, gx + k, cy - mh + k - 1, r.spec)
    }
  }
  // Garnish alongside.
  orb(ctx, cx + rx - (big ? 5 : 4), cy - (big ? 4 : 3), big ? 4 : 3, big ? 3 : 2, m.accent)
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - rx + 4 + i * 2, cy - 2, LEAFY.mid)
  glint(ctx, cx - mw + 1, cy - mh - 1, s, r)
}

function soap(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 18 : 13
  const top = y + ((s - rows) >> 1)
  const bh = big ? 11 : 8
  const half = profileOf(`soap${s}`, () => buildProfile([
    [2, bh - 2, bh],
    [rows - 4, bh, bh],
    [2, bh, bh - 2],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // The stamped oval.
  ellipse(ctx, cx, top + (rows >> 1), bh - 4, big ? 4 : 3, r.dark)
  ellipse(ctx, cx - 1, top + (rows >> 1) - 1, bh - 5, big ? 3 : 2, r.lit)
  ellipse(ctx, cx, top + (rows >> 1), bh - 7, big ? 2 : 1, m.accent.mid)
  // Petals or lather pressed into the face.
  for (let i = 0; i <= m.spot; i++) {
    px(ctx, cx - 4 + i * 3, top + 2 + (i & 1), m.accent.spec)
  }
  glint(ctx, cx - bh + e + 1, top + 2, s, r)
}

function candle(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 20 : 15
  const top = y + s - 4 - rows
  const bh = big ? 6 : 5
  const half = profileOf(`candle${s}`, () => buildProfile([
    [1, bh - 1, bh - 1],
    [rows - 1, bh, bh],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Wax that ran down the lit side and set.
  for (let i = 0; i < 2; i++) {
    const dx = cx - bh + 1 + i * (big ? 4 : 3)
    vline(ctx, dx, top + 1, 3 + i * 2 + m.spot, r.spec)
    px(ctx, dx, top + 4 + i * 2 + m.spot, r.lit)
  }
  // Wick and a still flame — a shape, not a pulse.
  vline(ctx, cx, top - 2, 3, PAL.ink)
  orb(ctx, cx, top - 4, 2, 3, FLAME)
  px(ctx, cx, top - 5, PAL.cream)
  // Dish.
  shadeRect(ctx, cx - bh - 2, top + rows, bh * 2 + 5, 3, m.accent)
  glint(ctx, cx - bh + e, top + 2, s, r)
}

function tin(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rx = big ? 11 : 8
  const side = big ? 9 : 7
  const cy = y + s - 5 - side
  shadeRect(ctx, cx - rx, cy, rx * 2 + 1, side, STEEL)
  orb(ctx, cx, cy, rx, big ? 4 : 3, STEEL)
  // The lid's pressed ring, and the product colour showing through the label.
  ellipse(ctx, cx, cy, rx - 3, big ? 2 : 1, STEEL.spec)
  labelBand(ctx, cx - rx + 2, cy + 2, rx * 2 - 3, big ? 6 : 4, 1 + (m.label & 1), m)
  hline(ctx, cx - rx, cy + side - 1, rx * 2 + 1, STEEL.ink)
  px(ctx, cx - 1, cy, r.mid)
  px(ctx, cx, cy, r.lit)
  glint(ctx, cx - rx + e + 1, cy - 1, s, STEEL)
}

/* ------------------------------------------------------------------ textile */

function shirt(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const top = y + 5
  const rows = s - 8
  const body = big ? 7 : 5
  const sleeve = big ? 5 : 4
  const arm = big ? 8 : 6
  // A T: sleeves out to the cuffs for the first few rows, then the body straight down.
  const half = profileOf(`shirt${s}`, () => buildProfile([
    [arm, body + sleeve, body + sleeve],
    [rows - arm, body, body],
  ]))
  profileBody(ctx, cx, top, half, r, e)

  // Cuff bands at the end of each sleeve.
  for (let i = 0; i < 2; i++) {
    const bx = i === 0 ? cx - body - sleeve : cx + body + sleeve - 1
    vline(ctx, bx, top + 2, arm - 3, m.accent.mid)
    vline(ctx, bx + 1, top + 2, arm - 3, m.accent.ink)
  }
  // Collar: a scoop bitten out of the shoulders, with a lit inside edge.
  ellipse(ctx, cx, top, big ? 5 : 4, 2, PAL.ink)
  ellipse(ctx, cx, top - 1, big ? 4 : 3, 2, m.accent.mid)
  ellipse(ctx, cx, top - 1, big ? 3 : 2, 1, m.accent.lit)
  // Placket, buttons, and a hem the light does not reach.
  vline(ctx, cx, top + 3, rows - 5, r.dark)
  for (let i = 0; i <= m.label; i++) px(ctx, cx + 1, top + 5 + i * (big ? 5 : 4), m.accent.spec)
  hline(ctx, cx - body, top + rows - 2, body * 2 + 1, m.accent.dark)
  glint(ctx, cx - body - sleeve + e, top + 2, s, r)
}

function hat(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const brim = big ? 12 : 9
  const ch = big ? 15 : 11
  const cw = big ? 7 : 5
  const top = y + 3
  const cy = top + ch
  // A tall crown, rounded at the top, so the hat is not a saucer.
  const half = profileOf(`hat${s}`, () => buildProfile([
    [2, cw - 3, cw - 1],
    [ch - 2, cw, cw],
  ]))
  profileBody(ctx, cx, top, half, r, e)
  // Band, sitting on the brim.
  rect(ctx, cx - cw, cy - 5, cw * 2 + 1, 4, m.accent.mid)
  hline(ctx, cx - cw, cy - 5, cw * 2 + 1, m.accent.lit)
  hline(ctx, cx - cw, cy - 2, cw * 2 + 1, m.accent.ink)
  // Brim, drawn last so it reads in front of the crown.
  orb(ctx, cx, cy, brim, 2, r)
  hline(ctx, cx - brim + 2, cy - 1, brim * 2 - 3, r.lit)
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx + 2 + i * 2, cy - 4, m.accent.spec)
  glint(ctx, cx - cw + e, top + 3, s, r)
}

function handbag(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const bw = big ? 20 : 15
  const bh = big ? 16 : 12
  const bx = cx - (bw >> 1)
  const by = y + s - 4 - bh
  // Handle: an arch of two uprights and a top.
  const hw = big ? 12 : 9
  shadeRect(ctx, cx - (hw >> 1), by - (big ? 9 : 7), hw, 3, m.accent)
  vline(ctx, cx - (hw >> 1), by - (big ? 8 : 6), big ? 8 : 6, m.accent.lit)
  vline(ctx, cx - (hw >> 1) + 1, by - (big ? 8 : 6), big ? 8 : 6, m.accent.ink)
  vline(ctx, cx + (hw >> 1) - 2, by - (big ? 8 : 6), big ? 8 : 6, m.accent.mid)
  vline(ctx, cx + (hw >> 1) - 1, by - (big ? 8 : 6), big ? 8 : 6, m.accent.ink)

  shadeRect(ctx, bx, by, bw, bh, r)
  // Flap and clasp.
  rect(ctx, bx + 1, by + 1, bw - 2, big ? 6 : 4, r.dark)
  hline(ctx, bx + 1, by + 1, bw - 2, r.lit)
  hline(ctx, bx + 1, by + (big ? 6 : 4), bw - 2, r.ink)
  shadeRect(ctx, cx - 2, by + (big ? 5 : 3), 5, 4, m.accent)
  for (let i = 0; i <= (m.label & 1); i++) {
    hline(ctx, bx + 3, by + (big ? 10 : 7) + i * 2, bw - 6, m.accent.dark)
  }
  glint(ctx, bx + e, by + e, s, r)
}

function folded(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const bw = big ? 22 : 17
  const lh = big ? 7 : 5
  const top = y + s - 3 - lh * 3
  // Three folded layers, each stepped one pixel further into the light.
  for (let i = 2; i >= 0; i--) {
    const bx = cx - (bw >> 1) + i
    const by = top + i * lh
    shadeRect(ctx, bx, by, bw - i * 2, lh + 1, i === 1 ? m.accent : r)
    // The fold at the left-hand end.
    vline(ctx, bx + 2, by + 1, lh - 1, i === 1 ? m.accent.spec : r.spec)
  }
  // Stitched edge along the front.
  for (let i = 0; i < bw - 4; i += 3) px(ctx, cx - (bw >> 1) + 2 + i, top + lh * 3, r.ink)
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx + 4 + i * 3, top + 2, m.accent.spec)
  glint(ctx, cx - (bw >> 1) + 2 + e, top + e, s, r)
}

function clothBolt(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const bw = big ? 13 : 10
  const bh = big ? 24 : 18
  const bx = cx - (bw >> 1) - 2
  const by = y + ((s - bh) >> 1)
  // The bolt, and the rolled end that gives it depth.
  shadeRect(ctx, bx, by, bw, bh, r)
  orb(ctx, bx + bw + 1, by + (bh >> 1), 3, (bh >> 1) - 1, r)
  // Woven stripes.
  const stripes = 2 + (m.label & 1)
  for (let i = 0; i < stripes; i++) {
    vline(ctx, bx + 2 + i * (big ? 4 : 3), by + 2, bh - 4, m.accent.mid)
    vline(ctx, bx + 3 + i * (big ? 4 : 3), by + 2, bh - 4, m.accent.dark)
  }
  // The loose flap folded over the front.
  shadeRect(ctx, bx - 2, by + bh - (big ? 10 : 8), bw + 2, big ? 8 : 6, m.accent)
  for (let i = 0; i < (big ? 4 : 3); i++) {
    px(ctx, bx - 1 + i * 3, by + bh - (big ? 3 : 3), r.ink)
  }
  glint(ctx, bx + e, by + e, s, r)
}

/* --------------------------------------------------------- timber and mineral */

function boards(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const bw = big ? 26 : 20
  const bh = big ? 7 : 5
  const bx = x + ((s - bw) >> 1)
  const top = y + ((s - bh * 3) >> 1)
  for (let i = 0; i < 3; i++) {
    const by = top + i * bh
    shadeRect(ctx, bx + i, by, bw - i * 2, bh + 1, r)
    // Grain.
    hline(ctx, bx + i + 2, by + 2, bw - i * 2 - 5, r.dark)
    hline(ctx, bx + i + 3, by + 3, bw - i * 2 - 8, r.lit)
    // Nail heads, one per board on the near end.
    if (i <= m.spot) px(ctx, bx + bw - i - 4, by + 2, m.accent.mid)
  }
  glint(ctx, bx + e, top + e, s, r)
}

function charcoal(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  const k = big ? 6 : 5
  orb(ctx, cx - k, cy + (big ? 4 : 3), k, k - 1, r)
  orb(ctx, cx + k - 1, cy + (big ? 5 : 4), k - 1, k - 2, r)
  orb(ctx, cx, cy - (big ? 4 : 3), k + 1, k, r)
  // Fractured facets catching the light, and embers in the accent.
  hline(ctx, cx - 3, cy - (big ? 6 : 5), 6, r.spec)
  hline(ctx, cx - k - 2, cy + (big ? 2 : 1), 4, r.lit)
  for (let i = 0; i <= m.spot; i++) px(ctx, cx - 4 + i * 3, cy + (i & 1), m.accent.mid)
  glint(ctx, cx - 3, cy - (big ? 7 : 6), s, r)
}

function ingot(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 12 : 9
  const top = y + s - 5 - rows
  const bh = big ? 12 : 9
  const half = profileOf(`ingot${s}`, () => buildProfile([[rows, bh - (big ? 4 : 3), bh]]))
  profileBody(ctx, cx, top, half, r, e)
  // The cast top face, lit flat.
  hline(ctx, cx - bh + (big ? 4 : 3), top - 1, (bh - (big ? 4 : 3)) * 2 + 1, r.lit)
  hline(ctx, cx - bh + (big ? 5 : 4), top - 2, (bh - (big ? 5 : 4)) * 2 + 1, r.spec)
  hline(ctx, cx - bh + (big ? 5 : 4), top - 3, (bh - (big ? 5 : 4)) * 2 + 1, r.ink)
  // Stamp.
  for (let i = 0; i <= m.label; i++) {
    hline(ctx, cx - 4, top + 3 + i * 2, 9 - i * 2, r.dark)
  }
  px(ctx, cx + bh - 3, top + rows - 3, m.accent.mid)
  glint(ctx, cx - bh + e + 2, top + 1, s, r)
}

function pane(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const bw = big ? 20 : 15
  const bh = big ? 24 : 18
  const bx = x + ((s - bw) >> 1)
  const by = y + ((s - bh) >> 1)
  shadeRect(ctx, bx, by, bw, bh, r)
  // A sheet of glass is mostly light: a broad diagonal shine across the face.
  for (let i = 0; i < bh - 4; i++) {
    const sx = bx + 2 + Math.floor((i * (bw - 6)) / (bh - 4))
    px(ctx, sx, by + 2 + i, r.spec)
    px(ctx, sx + 1, by + 2 + i, r.lit)
  }
  // Chipped corner, away from the light.
  for (let i = 0; i < (big ? 4 : 3); i++) {
    hline(ctx, bx + bw - 2 - i, by + bh - 2 - (big ? 3 : 2) + i, i + 1, r.ink)
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, bx + 3 + i * 3, by + bh - 4, m.accent.mid)
  glint(ctx, bx + e, by + e, s, r)
}

function ore(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1) + 1
  // Stone matrix.
  orb(ctx, cx - (big ? 5 : 4), cy + (big ? 3 : 2), big ? 8 : 6, big ? 6 : 5, STONE)
  orb(ctx, cx + (big ? 6 : 4), cy + (big ? 4 : 3), big ? 6 : 5, big ? 5 : 4, STONE)
  orb(ctx, cx + 1, cy - (big ? 4 : 3), big ? 9 : 7, big ? 7 : 5, STONE)
  // Veins of the metal itself.
  for (let i = 0; i < 3; i++) {
    const vx = cx - 4 + i * 4
    const vy = cy - (big ? 5 : 4) + (i & 1) * (big ? 6 : 4)
    orb(ctx, vx, vy, 2, 1, r)
    px(ctx, vx - 1, vy - 1, r.spec)
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx + 5 + i * 2, cy + (big ? 5 : 4), r.mid)
  glint(ctx, cx - (big ? 5 : 4), cy - (big ? 8 : 6), s, STONE)
}

function nugget(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  const k = big ? 10 : 8
  orb(ctx, cx, cy, k, k - 2, r)
  orb(ctx, cx - (big ? 5 : 4), cy - (big ? 4 : 3), big ? 5 : 4, big ? 4 : 3, r)
  orb(ctx, cx + (big ? 5 : 4), cy - 1, big ? 5 : 4, big ? 4 : 3, r)
  // A knobbly, earthy surface.
  for (let i = 0; i < (big ? 7 : 5); i++) {
    const ax = cx - 6 + ((i * 13) % 13)
    const ay = cy - 4 + ((i * 7) % 9)
    px(ctx, ax, ay, (i & 1) === 0 ? r.dark : r.lit)
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 3 + i * 3, cy + k - 4, m.accent.dark)
  glint(ctx, cx - (big ? 6 : 5), cy - (big ? 5 : 4), s, r)
}

/* ------------------------------------------------------------------ animal */

function egg(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const rows = big ? 22 : 17
  const top = y + ((s - rows) >> 1)
  const bh = big ? 9 : 7
  const half = profileOf(`egg${s}`, () => ovoid(rows, bh))
  profileBody(ctx, cx, top, half, r, e)
  // Speckles, so a duck egg is not a goose egg with a different wash.
  for (let i = 0; i <= m.spot; i++) {
    px(ctx, cx - 3 + i * 3, top + (big ? 9 : 7) + (i & 1) * 3, r.dark)
    px(ctx, cx + 2 - i * 2, top + (big ? 14 : 11) - (i & 1) * 2, m.accent.dark)
  }
  glint(ctx, cx - bh + e + 2, top + (big ? 6 : 5), s, r)
}

function tuft(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  const k = big ? 5 : 4
  // A ring of lobes rather than one mass: that scalloped outline is the whole read.
  orb(ctx, cx - k * 2 + 1, cy + 2, k, k, r)
  orb(ctx, cx + k * 2 - 1, cy + 3, k, k - 1, r)
  orb(ctx, cx - k + 1, cy + k + 2, k, k - 1, r)
  orb(ctx, cx + k, cy + k + 1, k - 1, k - 1, r)
  orb(ctx, cx - k - 1, cy - k + 1, k + 1, k, r)
  orb(ctx, cx + k + 1, cy - k, k, k, r)
  orb(ctx, cx, cy - 1, k + 2, k + 1, r)
  // Wisps escaping the edge — what makes fleece read as soft and not as stone.
  for (let i = 0; i < (big ? 7 : 5); i++) {
    px(ctx, cx - k * 3 - 1 + (i & 1), cy - k + i * 2, r.lit)
    px(ctx, cx + k * 3 + 1 - (i & 1), cy - k + 1 + i * 2, r.dark)
    px(ctx, cx - k * 2 + i * 3, cy - k * 2 - (i & 1), r.lit)
  }
  hline(ctx, cx - 4, cy - k - 2, 6, r.spec)
  // A tied band on the fleece.
  for (let i = 0; i <= (m.label & 1); i++) {
    hline(ctx, cx - k * 2, cy + k * 2 + i * 2, k * 4, m.accent.mid)
  }
  glint(ctx, cx - 5, cy - k - 3, s, r)
}

function feather(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const top = y + 2
  const rows = s - 5
  // Quill, leaning so the feather is not a vertical bar.
  for (let i = 0; i < rows; i++) {
    const qx = cx + 2 - (i >> (big ? 3 : 2))
    px(ctx, qx, top + i, PAL.ink)
    px(ctx, qx + 1, top + i, r.spec)
  }
  // Barbs: widest in the middle, thinning to the tip.
  for (let i = 1; i < rows - 1; i++) {
    const qx = cx + 2 - (i >> (big ? 3 : 2))
    const spread = i < rows >> 1 ? i : rows - i
    const w = 1 + Math.floor((spread * (big ? 9 : 7)) / (rows >> 1))
    hline(ctx, qx - w, top + i, w, (i & 1) === 0 ? r.lit : r.mid)
    hline(ctx, qx + 2, top + i, w - 1, (i & 1) === 0 ? r.mid : r.dark)
    if ((i & 3) === 0) {
      px(ctx, qx - w, top + i, r.ink)
      px(ctx, qx + w, top + i, r.ink)
    }
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 3 + i * 4, top + (big ? 12 : 9), m.accent.mid)
  glint(ctx, cx - 4, top + (big ? 7 : 5), s, r)
}

function comb(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  const bw = big ? 24 : 18
  const bh = big ? 24 : 18
  const bx = cx - (bw >> 1)
  const by = y + ((s - bh) >> 1)
  shadeRect(ctx, bx, by, bw, bh, r)
  // Hexagonal cells, offset row by row.
  const cw = big ? 7 : 5
  const ch = big ? 6 : 5
  for (let row = 0; row * ch + 3 < bh - 2; row++) {
    for (let col = 0; col * cw + 3 < bw - 2; col++) {
      const hx = bx + 2 + col * cw + (row & 1) * (cw >> 1)
      const hy = by + 2 + row * ch
      if (hx + cw - 2 > bx + bw - 2) continue
      hline(ctx, hx + 1, hy, cw - 3, r.ink)
      hline(ctx, hx, hy + 1, cw - 1, r.dark)
      hline(ctx, hx + 1, hy + 2, cw - 3, r.lit)
      px(ctx, hx + 1, hy + 1, r.spec)
    }
  }
  // Honey welling out of the lower cells.
  for (let i = 0; i <= m.spot; i++) {
    px(ctx, bx + 4 + i * 4, by + bh - 3, m.accent.mid)
    px(ctx, bx + 4 + i * 4, by + bh - 2, m.accent.ink)
  }
  glint(ctx, bx + e, by + e, s, r)
}

function fish(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  const rx = big ? 11 : 8
  const ry = big ? 6 : 5
  // Tail, before the body so the body's outline cuts it.
  for (let i = 0; i < (big ? 7 : 5); i++) {
    const hh = 1 + i
    rect(ctx, cx + rx + i - 1, cy - hh, 1, hh * 2 + 1, i === 0 ? r.mid : r.dark)
    px(ctx, cx + rx + i - 1, cy - hh, r.ink)
    px(ctx, cx + rx + i - 1, cy + hh, r.ink)
  }
  orb(ctx, cx, cy, rx, ry, r)
  // Dorsal fin, gill and eye.
  for (let i = 0; i < (big ? 8 : 6); i++) {
    const fh = i < 3 ? i + 1 : (big ? 8 : 6) - i
    rect(ctx, cx - 3 + i, cy - ry - fh, 1, fh, r.dark)
    px(ctx, cx - 3 + i, cy - ry - fh, r.ink)
  }
  vline(ctx, cx - rx + (big ? 5 : 4), cy - 2, 5, r.dark)
  px(ctx, cx - rx + 3, cy - 1, PAL.ink)
  px(ctx, cx - rx + 3, cy - 2, PAL.cream)
  // Scales.
  for (let i = 0; i <= m.spot; i++) {
    hline(ctx, cx - 2 + i * 3, cy + (i & 1), 3, m.accent.mid)
  }
  glint(ctx, cx - rx + 3, cy - ry + 2, s, r)
}

function roe(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + s - (big ? 10 : 8)
  const rx = big ? 12 : 9
  // A small dish of eggs.
  orb(ctx, cx, cy + (big ? 4 : 3), rx, big ? 4 : 3, CROCK)
  const k = big ? 3 : 2
  for (let row = 0; row < 3; row++) {
    const n = 3 - Math.abs(row - 1)
    for (let i = 0; i < n; i++) {
      const ex = cx - (n - 1) * (k + 1) + i * (k + 1) * 2
      const ey = cy - (big ? 5 : 4) + row * (k + 1)
      orb(ctx, ex, ey, k, k, r)
      px(ctx, ex - 1, ey - 1, r.spec)
    }
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, cx - 4 + i * 8, cy + (big ? 3 : 2), m.accent.mid)
  glint(ctx, cx - rx + 4, cy + (big ? 3 : 2), s, CROCK)
}

function rashers(ctx: Ctx, x: number, y: number, s: number, r: Ramp, m: Mods): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const bw = big ? 26 : 20
  const bh = big ? 7 : 5
  const bx = cx - (bw >> 1)
  const top = y + ((s - bh * 3) >> 1)
  // Three rashers, each wobbling by a pixel so they never look stacked.
  for (let i = 0; i < 3; i++) {
    const by = top + i * bh
    for (let k = 0; k < bw; k++) {
      const wob = ((k + i * 3) >> 2) & 1
      const yy = by + wob
      vline(ctx, bx + k, yy, bh, r.mid)
      px(ctx, bx + k, yy, r.lit)
      px(ctx, bx + k, yy + bh - 1, r.dark)
      px(ctx, bx + k, yy - 1, r.ink)
      px(ctx, bx + k, yy + bh, r.ink)
      // The seam of fat.
      if (((k + i) & 3) !== 3) px(ctx, bx + k, yy + 2, m.accent.spec)
    }
  }
  for (let i = 0; i <= (m.spot & 1); i++) px(ctx, bx + 4 + i * 5, top + 3, r.spec)
  glint(ctx, bx + 1, top + 1, s, r)
}

/* ------------------------------------------------------------------ table */

const FAMILIES: Readonly<Record<Family, Draw>> = {
  bolt: clothBolt,
  boards,
  'bottle-juice': juiceBottle,
  'bottle-milk': milkBottle,
  'bottle-wine': wineBottle,
  'bowl-salad': saladBowl,
  'bowl-soup': soupBowl,
  candle,
  charcoal,
  'choc-bar': chocBar,
  comb,
  cone,
  cruet,
  egg,
  feather,
  fish,
  flask,
  folded,
  grill: grillPlate,
  handbag,
  hat,
  ingot,
  'jar-preserve': preserveJar,
  'jar-sauce': sauceJar,
  loaf,
  lollipop,
  mug,
  nest,
  nugget,
  ore,
  pane,
  'paper-bag': paperBag,
  pie,
  platter,
  rashers,
  roe,
  sack,
  shake,
  shirt,
  skewer,
  soap,
  sweet: wrappedSweet,
  teacup,
  tin,
  tuft,
  wheel: cheeseWheel,
}

/** The default family for each catalogue silhouette. Refined by group and by id below. */
const SHAPE_FAMILY: Readonly<Record<ProductShape, Family>> = {
  bar: 'choc-bar',
  board: 'boards',
  bolt: 'bolt',
  bottle: 'bottle-juice',
  bowl: 'bowl-soup',
  cake: 'soap',
  candle: 'candle',
  candy: 'sweet',
  comb: 'comb',
  cone: 'cone',
  cup: 'mug',
  egg: 'egg',
  fish: 'fish',
  flask: 'flask',
  fluff: 'tuft',
  garment: 'shirt',
  ingot: 'ingot',
  jar: 'jar-sauce',
  loaf: 'loaf',
  nest: 'nest',
  ore: 'ore',
  pie: 'pie',
  roe: 'roe',
  round: 'nugget',
  sack: 'sack',
  skewer: 'skewer',
  slab: 'rashers',
  wheel: 'wheel',
}

/**
 * The goods whose catalogue shape is a rough fit for what they actually are. A
 * `milkshake` is not a cone, `glass` is not an ingot, and a `burger` never saw a
 * skewer — each gets the family that reads true instead.
 */
const FAMILY_BY_ID: Readonly<Record<string, Family>> = {
  // Fermented and brewed: a corked bottle, not a juice bottle.
  wine: 'bottle-wine',
  cider: 'bottle-wine',
  'plum-wine': 'bottle-wine',
  mead: 'bottle-wine',
  ale: 'bottle-wine',
  vinegar: 'bottle-wine',
  'vintage-wine': 'bottle-wine',
  'reserve-wine': 'bottle-wine',
  // Brewed in a cup rather than pulled as a shot.
  'flower-tea': 'teacup',
  'berry-infusion': 'teacup',
  'lemon-tea': 'teacup',
  'iced-tea': 'teacup',
  'chai-tea': 'teacup',
  milkshake: 'shake',
  // Cold, leafy or laid out, rather than ladled.
  'garden-salad': 'bowl-salad',
  coleslaw: 'bowl-salad',
  'fruit-salad': 'bowl-salad',
  'winter-salad': 'bowl-salad',
  'potato-salad': 'bowl-salad',
  'caesar-salad': 'bowl-salad',
  'greek-salad': 'bowl-salad',
  'harvest-feast': 'platter',
  'festival-platter': 'platter',
  // Off the grill and onto a plate.
  roast: 'grill',
  burger: 'grill',
  'farm-breakfast': 'grill',
  'royal-banquet': 'grill',
  'bacon-and-eggs': 'grill',
  // Everything else that wears a borrowed silhouette.
  charcoal: 'charcoal',
  glass: 'pane',
  'wax-polish': 'tin',
  lollipop: 'lollipop',
  feather: 'feather',
  down: 'feather',
  hat: 'hat',
  'sun-hat': 'hat',
  bag: 'handbag',
  quilt: 'folded',
  scarf: 'folded',
  rug: 'folded',
}

function familyOf(p: ProductDef): Family {
  const byId = FAMILY_BY_ID[p.id]
  if (byId !== undefined) return byId
  switch (p.art.shape) {
    case 'bottle':
      if (p.group === 'animal') return 'bottle-milk'
      return p.group === 'pantry' ? 'cruet' : 'bottle-juice'
    case 'jar':
      return p.group === 'preserve' ? 'jar-preserve' : 'jar-sauce'
    case 'sack':
      return p.group === 'feed' || p.group === 'milled' ? 'sack' : 'paper-bag'
    default:
      return SHAPE_FAMILY[p.art.shape]
  }
}

/** Family, ramp and modifiers are pure functions of the good, so each is built once. */
interface Icon {
  readonly draw: Draw
  readonly body: Ramp
  readonly mods: Mods
}

const ICONS = new Map<string, Icon>()

function iconOf(p: ProductDef): Icon {
  const hit = ICONS.get(p.id)
  if (hit !== undefined) return hit
  const h = hashId(p.id)
  const built: Icon = {
    draw: FAMILIES[familyOf(p)],
    body: ramp(p.art.tint),
    mods: {
      accent: ramp(mixHex(GROUP_ACCENT[p.group], PAL.cream, ((h >>> 8) % 3) * 0.16)),
      fill: h % 3,
      label: (h >>> 2) % 4,
      cap: (h >>> 4) % 3,
      spot: (h >>> 6) % 4,
    },
  }
  ICONS.set(p.id, built)
  return built
}

/* ------------------------------------------------------------------ quality */

/** One arm of the grading star: a cross with a lit shoulder and a cream centre. */
function starArm(ctx: Ctx, cx: number, cy: number, rad: number, r: Ramp): void {
  vline(ctx, cx + 1, cy - rad + 1, rad * 2 + 1, r.ink)
  hline(ctx, cx - rad + 1, cy + 1, rad * 2 + 1, r.ink)
  vline(ctx, cx, cy - rad, rad * 2 + 1, r.mid)
  hline(ctx, cx - rad, cy, rad * 2 + 1, r.mid)
  if (rad > 1) {
    px(ctx, cx - 1, cy - 1, r.lit)
    px(ctx, cx, cy - 1, r.lit)
    px(ctx, cx - 1, cy, r.lit)
  }
  px(ctx, cx, cy, r.spec)
}

const SILVER = ramp(mixHex(PAL.dusk, PAL.sky, 0.45))
const GOLD = ramp(PAL.lantern)

/**
 * The grading cluster, in the top-right corner: one big star and two small. Silver is
 * cool grey, gold is lantern — the same language produce wears, so one grade reads
 * across the whole bag.
 */
function qualityStar(ctx: Ctx, quality: Quality, x: number, y: number, s: number): void {
  if (quality === 'normal') return
  const r = quality === 'gold' ? GOLD : SILVER
  const big = s >= 32
  const rad = big ? 3 : 2
  const cx = x + s - rad - (big ? 5 : 4)
  const cy = y + rad
  starArm(ctx, cx, cy, rad, r)
  starArm(ctx, cx + rad + 1, cy + rad + 2, 1, r)
  starArm(ctx, cx - rad - 1, cy + rad + 1, 1, r)
}

/* ------------------------------------------------------------------ exports */

/**
 * A product icon, anchored top-left. `size` is 24 (the default, matching the inventory
 * cell) or 32; anything else is clamped to one of the two, because those are the only
 * sizes the art is built for and a half-size icon would land on fractional pixels.
 */
export function drawProductIcon(
  ctx: Ctx,
  product: ProductDef,
  quality: Quality,
  sx: number,
  sy: number,
  size: number = ICON,
): void {
  const s = size >= ICON_LARGE ? ICON_LARGE : ICON
  const x = Math.round(sx)
  const y = Math.round(sy)
  const icon = iconOf(product)
  icon.draw(ctx, x, y, s, icon.body, icon.mods)
  qualityStar(ctx, quality, x, y, s)
}

/* ------------------------------------------------------------------ materials */

/**
 * Raw stock: timber brown, stone grey, fittings iron, paper cream. Every tone is mixed
 * out of the fourteen palette entries — the materials have no catalogue tint of their
 * own, so this is where their colour is decided.
 */
const MATERIAL_RAMP: Readonly<Record<MaterialId, Ramp>> = {
  wood: ramp(mixHex(PAL.bark, PAL.soil, 0.65)),
  stone: ramp(mixHex(PAL.dusk, PAL.parchment, 0.32)),
  fibre: ramp(mixHex(PAL.grassLit, PAL.parchment, 0.34)),
  plank: ramp(mixHex(PAL.soil, PAL.lantern, 0.34)),
  bolt: ramp(mixHex(PAL.dusk, PAL.sky, 0.3)),
  screw: ramp(mixHex(PAL.dusk, PAL.sky, 0.5)),
  nail: ramp(mixHex(PAL.dusk, PAL.sky, 0.7)),
  tape: ramp(mixHex(PAL.shadow, PAL.sky, 0.28)),
  deed: ramp(PAL.parchment),
  mallet: ramp(mixHex(PAL.bark, PAL.lantern, 0.24)),
  axe: ramp(mixHex(PAL.dusk, PAL.sky, 0.38)),
  saw: ramp(mixHex(PAL.sky, PAL.parchment, 0.34)),
}

function logs(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const len = big ? 24 : 18
  const th = big ? 8 : 6
  for (let i = 0; i < 2; i++) {
    const bx = cx - (len >> 1) + i
    const by = y + (big ? 6 : 5) + i * (th + 1)
    shadeRect(ctx, bx, by, len - i * 2, th, r)
    // The cut end, with its rings.
    orb(ctx, bx + 1, by + (th >> 1), 2, (th >> 1) - 1, WOOD)
    px(ctx, bx + 1, by + (th >> 1), WOOD.ink)
    // Bark texture along the top.
    for (let k = 4; k < len - i * 2 - 2; k += 3) px(ctx, bx + k, by + 2, r.dark)
  }
  glint(ctx, cx - (len >> 1) + 4, y + (big ? 7 : 6), s, r)
}

function rocks(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1)
  orb(ctx, cx - (big ? 6 : 5), cy + (big ? 5 : 4), big ? 6 : 5, big ? 5 : 4, r)
  orb(ctx, cx + (big ? 7 : 5), cy + (big ? 6 : 4), big ? 5 : 4, big ? 4 : 3, r)
  orb(ctx, cx + 1, cy - (big ? 3 : 2), big ? 8 : 6, big ? 7 : 5, r)
  // Flat facets: what stops three ellipses reading as three balls.
  hline(ctx, cx - 3, cy - (big ? 6 : 4), 8, r.spec)
  hline(ctx, cx - 4, cy - (big ? 5 : 3), 6, r.lit)
  hline(ctx, cx + 4, cy + (big ? 4 : 3), 5, r.dark)
  glint(ctx, cx - 4, cy - (big ? 8 : 6), s, r)
}

function stalks(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  const len = s - 7
  for (let i = 0; i < (big ? 7 : 5); i++) {
    const lean = i - (big ? 3 : 2)
    const bx = cx + lean * 2
    vline(ctx, bx, top + Math.abs(lean), len - Math.abs(lean), r.ink)
    vline(ctx, bx + 1, top + Math.abs(lean), len - Math.abs(lean), (i & 1) === 0 ? r.lit : r.mid)
    px(ctx, bx + 1, top + Math.abs(lean), r.spec)
  }
  // The tie.
  const ty = top + (big ? 12 : 9)
  rect(ctx, cx - (big ? 8 : 6), ty, big ? 17 : 13, 3, CLOTH.mid)
  hline(ctx, cx - (big ? 8 : 6), ty, big ? 17 : 13, CLOTH.lit)
  hline(ctx, cx - (big ? 8 : 6), ty + 2, big ? 17 : 13, CLOTH.ink)
}

function board(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const e = edgeOf(s)
  const bw = big ? 14 : 11
  const bh = big ? 26 : 20
  const bx = x + ((s - bw) >> 1)
  const by = y + ((s - bh) >> 1)
  shadeRect(ctx, bx, by, bw, bh, r)
  // Grain running the length, and two nail heads.
  for (let i = 0; i < (big ? 3 : 2); i++) {
    vline(ctx, bx + 3 + i * (big ? 4 : 3), by + 2, bh - 4, r.dark)
    vline(ctx, bx + 4 + i * (big ? 4 : 3), by + 3, bh - 6, r.lit)
  }
  orb(ctx, bx + (bw >> 1), by + 3, 1, 1, STEEL)
  orb(ctx, bx + (bw >> 1), by + bh - 4, 1, 1, STEEL)
  glint(ctx, bx + e, by + e, s, r)
}

function boltIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  // Hex head.
  const hw = big ? 7 : 5
  const hh = big ? 8 : 6
  for (let i = 0; i < hh; i++) {
    const k = i < 2 ? hw - 2 + i : i > hh - 3 ? hw - 2 + (hh - 1 - i) : hw
    hline(ctx, cx - k, top + i, k * 2 + 1, i < 2 ? r.lit : r.mid)
    px(ctx, cx - k - 1, top + i, r.ink)
    px(ctx, cx + k + 1, top + i, r.ink)
    px(ctx, cx + k, top + i, r.dark)
  }
  hline(ctx, cx - hw + 2, top - 1, hw * 2 - 3, r.ink)
  // Threaded shank.
  const sy = top + hh
  const sw = big ? 3 : 2
  shadeRect(ctx, cx - sw, sy, sw * 2 + 1, s - (sy - y) - 3, r)
  for (let i = 2; i < s - (sy - y) - 4; i += 2) hline(ctx, cx - sw + 1, sy + i, sw * 2 - 1, r.ink)
  glint(ctx, cx - hw + 2, top + 1, s, r)
}

function screwIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  const hw = big ? 7 : 5
  orb(ctx, cx, top + 2, hw, 3, r)
  // Slotted head.
  hline(ctx, cx - hw + 2, top + 2, hw * 2 - 3, r.ink)
  hline(ctx, cx - hw + 2, top + 1, hw * 2 - 3, r.spec)
  // Tapered, threaded shank.
  const rows = s - 9
  const half = profileOf(`screw${s}`, () => buildProfile([
    [rows - (big ? 5 : 4), big ? 3 : 2, big ? 3 : 2],
    [big ? 5 : 4, big ? 3 : 2, 0],
  ]))
  profileBody(ctx, cx, top + 5, half, r, edgeOf(s))
  for (let i = 1; i < rows - 1; i += 2) {
    const k = half[i]
    if (k < 1) continue
    hline(ctx, cx - k + 1, top + 5 + i, k * 2 - 1, r.ink)
    px(ctx, cx - k + 1, top + 5 + i, r.spec)
  }
}

function nailIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const top = y + 3
  const hw = big ? 8 : 6
  // Flat head, seen slightly from above.
  shadeRect(ctx, cx - hw, top, hw * 2 + 1, 4, r)
  hline(ctx, cx - hw + 2, top + 1, hw * 2 - 3, r.spec)
  const rows = s - 9
  const half = profileOf(`nail${s}`, () => buildProfile([
    [rows - (big ? 6 : 4), big ? 2 : 1, big ? 2 : 1],
    [big ? 6 : 4, big ? 2 : 1, 0],
  ]))
  profileBody(ctx, cx, top + 4, half, r, edgeOf(s))
  vline(ctx, cx - 1, top + 5, rows - 4, r.spec)
}

function tapeIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1)
  const cy = y + (s >> 1) - 1
  const rr = big ? 12 : 9
  orb(ctx, cx, cy, rr, rr - (big ? 2 : 1), r)
  // The core: dark, so the roll reads as a ring and not a disc.
  ellipse(ctx, cx, cy, big ? 5 : 4, big ? 4 : 3, PAL.ink)
  ellipse(ctx, cx, cy, big ? 4 : 3, big ? 3 : 2, PAL.shadow)
  ellipse(ctx, cx - 1, cy - 1, big ? 3 : 2, big ? 2 : 1, PAL.dusk)
  // The peeled tail hanging off the near side.
  for (let i = 0; i < (big ? 8 : 6); i++) {
    px(ctx, cx + rr - 1 + (i >> 2), cy + rr - (big ? 3 : 2) + i, r.mid)
    px(ctx, cx + rr + (i >> 2), cy + rr - (big ? 3 : 2) + i, r.ink)
  }
  glint(ctx, cx - rr + 3, cy - rr + 3, s, r)
}

function deedIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const e = edgeOf(s)
  const bw = big ? 20 : 15
  const bh = big ? 26 : 20
  const bx = x + ((s - bw) >> 1)
  const by = y + ((s - bh) >> 1)
  shadeRect(ctx, bx, by, bw, bh, r)
  // Ruled lines, the last one short like a signature.
  const lines = big ? 6 : 4
  for (let i = 0; i < lines; i++) {
    const w = i === lines - 1 ? bw - 10 : bw - 6
    hline(ctx, bx + 3, by + 4 + i * (big ? 4 : 3), w, r.dark)
  }
  // The turned-up corner, and a wax seal.
  for (let i = 0; i < (big ? 5 : 4); i++) {
    hline(ctx, bx + bw - 2 - i, by + bh - 2 - (big ? 4 : 3) + i, i + 1, r.dark)
    px(ctx, bx + bw - 2 - i, by + bh - 2 - (big ? 4 : 3) + i, r.ink)
  }
  orb(ctx, bx + 5, by + bh - 5, 3, 2, ramp(PAL.berry))
  glint(ctx, bx + e, by + e, s, r)
}

function malletIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const e = edgeOf(s)
  const cx = x + ((s - 1) >> 1)
  // Handle, running down and right, under the head.
  shadeRect(ctx, cx - 1, y + (big ? 8 : 6), big ? 5 : 4, s - (big ? 11 : 8), WOOD)
  const hw = big ? 18 : 14
  const hh = big ? 10 : 8
  shadeRect(ctx, cx - (hw >> 1) - 1, y + 3, hw, hh, r)
  // Two iron bands.
  for (let i = 0; i < 2; i++) {
    const bx = cx - (hw >> 1) + 1 + i * (hw - 5)
    rect(ctx, bx, y + 4, 2, hh - 2, STEEL.mid)
    vline(ctx, bx, y + 4, hh - 2, STEEL.lit)
    vline(ctx, bx + 1, y + 4, hh - 2, STEEL.dark)
  }
  glint(ctx, cx - (hw >> 1) + e, y + 3 + e, s, r)
}

function axeIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const cx = x + ((s - 1) >> 1) + (big ? 4 : 3)
  // Haft, running the height of the icon.
  shadeRect(ctx, cx - 1, y + 2, big ? 5 : 4, s - 4, WOOD)
  // Head: the bit flares toward the cutting edge, the poll sits behind the haft.
  const rows = big ? 15 : 12
  const top = y + 4
  const reach = big ? 12 : 9
  for (let i = 0; i < rows; i++) {
    const k = i < rows >> 1 ? i : rows - 1 - i
    const w = 3 + Math.floor((k * reach) / (rows >> 1))
    const left = cx - 1 - w
    hline(ctx, left, top + i, w + 4, r.mid)
    px(ctx, left - 1, top + i, r.ink)
    px(ctx, left, top + i, r.lit)
    px(ctx, left + 1, top + i, r.lit)
  }
  // Ink the flare and cap the head.
  for (let i = 0; i < rows; i++) {
    const k = i < rows >> 1 ? i : rows - 1 - i
    const kn = i + 1 < rows ? (i + 1 < rows >> 1 ? i + 1 : rows - 2 - i) : -1
    const kp = i > 0 ? (i - 1 < rows >> 1 ? i - 1 : rows - i) : -1
    const w = 3 + Math.floor((k * reach) / (rows >> 1))
    if (kp < 0 || kp < k) hline(ctx, cx - 1 - w, top + i - 1, w - 2, r.ink)
    if (kn < 0 || kn < k) hline(ctx, cx - 1 - w, top + i + 1, w - 2, r.ink)
  }
  // Poll and the polished cheek behind the edge.
  shadeRect(ctx, cx + 2, top + (rows >> 2), big ? 5 : 4, rows >> 1, r)
  hline(ctx, cx - reach + 1, top + (rows >> 1) - 1, big ? 5 : 4, r.spec)
  glint(ctx, cx - reach + 2, top + 3, s, r)
}

function sawIcon(ctx: Ctx, x: number, y: number, s: number, r: Ramp): void {
  const big = s >= 32
  const bw = big ? 22 : 17
  const bh = big ? 13 : 10
  const bx = x + 2
  const base = y + s - (big ? 8 : 6)
  // A blade that tapers to the tip, which is what tells a saw from a ruler.
  for (let i = 0; i < bw; i++) {
    const h = 3 + Math.floor((i * (bh - 3)) / (bw - 1))
    const cxx = bx + i
    const topY = base - h
    vline(ctx, cxx, topY, h, r.mid)
    px(ctx, cxx, topY, r.lit)
    px(ctx, cxx, topY + 1, r.spec)
    px(ctx, cxx, topY - 1, r.ink)
    px(ctx, cxx, base - 2, r.dark)
    // Teeth on the working edge: a two-pixel point every third column.
    const tooth = i % 3
    px(ctx, cxx, base, tooth === 0 ? r.mid : r.ink)
    px(ctx, cxx, base + 1, tooth === 0 ? r.ink : r.mid)
    if (tooth === 2) px(ctx, cxx, base + 2, r.ink)
  }
  // Handle at the heel, drawn last so it sits in front of the plate.
  const hx = bx + bw - 1
  const hy = base - bh - 1
  shadeRect(ctx, hx, hy, big ? 8 : 6, bh + 4, WOOD)
  ellipse(ctx, hx + (big ? 4 : 3), hy + (bh >> 1) + 2, big ? 2 : 1, big ? 3 : 2, WOOD.ink)
  ellipse(ctx, hx + (big ? 4 : 3), hy + (bh >> 1) + 2, 1, big ? 2 : 1, PAL.shadow)
  for (let i = 0; i < 2; i++) orb(ctx, hx + 1, hy + 3 + i * (big ? 8 : 6), 1, 1, STEEL)
  glint(ctx, bx + 2, base - 4, s, r)
}

const MATERIAL_DRAW: Readonly<Record<MaterialId, (c: Ctx, x: number, y: number, s: number, r: Ramp) => void>> = {
  wood: logs,
  stone: rocks,
  fibre: stalks,
  plank: board,
  bolt: boltIcon,
  screw: screwIcon,
  nail: nailIcon,
  tape: tapeIcon,
  deed: deedIcon,
  mallet: malletIcon,
  axe: axeIcon,
  saw: sawIcon,
}

/**
 * A material icon, anchored top-left, at 24 (default) or 32. Materials never carry a
 * grade, so no star is drawn.
 */
export function drawMaterialIcon(
  ctx: Ctx,
  id: MaterialId,
  sx: number,
  sy: number,
  size: number = ICON,
): void {
  const s = size >= ICON_LARGE ? ICON_LARGE : ICON
  MATERIAL_DRAW[id](ctx, Math.round(sx), Math.round(sy), s, MATERIAL_RAMP[id])
}
