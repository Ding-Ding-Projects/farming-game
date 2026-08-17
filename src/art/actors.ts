import type { Facing, GoodId, ToolId } from '../game/types'
import type { Ramp } from '../engine/palette'
import type { Sprite } from '../engine/pixel'
import { PAL, ramp, withAlpha } from '../engine/palette'
import { drawSprite, ellipse, hline, makeSprite, px } from '../engine/pixel'
import { beatOf, mixHex, prefersReducedMotion } from './tiles'

/**
 * The farmer and the tools, at 32x32.
 *
 * This is the sprite the player looks at for the whole game, so it is built the way
 * `docs/GRAPHICS.md` section 5 asks: every mass carries the full five-tone ramp — an
 * `ink` outline, a dark side, a mid body, a lit edge and a `cream` specular — and the
 * light falls from the upper left in every pose, including the two side facings, which
 * are separately toned rather than naively flipped.
 *
 * Section 6 asks for a real animation set and this provides it: four facings, four walk
 * frames, a two-frame idle breathe and a three-frame tool-use pose per tool per facing.
 * Head and torso are authored sheets; arms, legs and every tool are drawn procedurally,
 * because those are the parts that move and a sheet per combination would be 300 sheets.
 */

type Ctx = CanvasRenderingContext2D

/** The farmer occupies exactly one tile and never draws outside it. */
const FARMER_SIZE = 32

/* ------------------------------------------------------------------ *
 * Ramps. Every colour in this module comes from one of these.
 * ------------------------------------------------------------------ */

const HAT = ramp(PAL.lantern)
const BAND = ramp(PAL.bark)
const SKIN = ramp(mixHex(PAL.parchment, PAL.soil, 0.32))
const HAIR = ramp(mixHex(PAL.bark, PAL.ink, 0.2))
const SHIRT = ramp(PAL.sky)
const TROUSER = ramp(PAL.dusk)
const BOOT = ramp(mixHex(PAL.bark, PAL.ink, 0.42))
const WOOD = ramp(PAL.bark)
const STEEL = ramp(mixHex(PAL.sky, PAL.dusk, 0.5))
const BRASS = ramp(PAL.lantern)
const BURLAP = ramp(mixHex(PAL.soil, PAL.parchment, 0.5))
const GLOVE = ramp(mixHex(PAL.parchment, PAL.bark, 0.18))
const GRAIN = ramp(mixHex(PAL.lantern, PAL.parchment, 0.45))
const SPROUT = ramp(PAL.grassLit)
const WATER = ramp(PAL.sky)
const MINERAL = ramp(mixHex(PAL.dusk, PAL.parchment, 0.35))

/**
 * The far side of a limb or a leg: the same family, one step down the ramp. A whole
 * step further than this and the far limb stops being blue trousers in shade and starts
 * being a hole in the sprite, which is exactly what it must not read as.
 */
const TROUSER_FAR_LIT = mixHex(TROUSER.mid, PAL.ink, 0.22)
const TROUSER_FAR_MID = TROUSER.dark
const TROUSER_FAR_DARK = mixHex(TROUSER.dark, PAL.ink, 0.35)
const BOOT_FAR_LIT = mixHex(BOOT.mid, PAL.ink, 0.22)
const BOOT_FAR_MID = BOOT.dark
const BOOT_FAR_DARK = mixHex(BOOT.dark, PAL.ink, 0.35)
const SHIRT_FAR_LIT = mixHex(SHIRT.mid, PAL.ink, 0.24)
const SHIRT_FAR_MID = SHIRT.dark
const SHIRT_FAR_DARK = mixHex(SHIRT.dark, PAL.ink, 0.32)

const SHADOW = withAlpha(PAL.ink, 0.24)

/* ------------------------------------------------------------------ *
 * The character sheets.
 *
 * Head is rows 0..17, torso is rows 18..25, legs are drawn from row 26.
 * `.` is transparent, `o` is ink, and every other key is one step of one
 * of the ramps above.
 *
 *   1 2 3 4  straw hat: dark, mid, lit, specular
 *   5 6 7    hat band and belt leather: dark, mid, lit
 *   a f g w  skin: dark, mid, lit, specular
 *   h j i    hair: dark, mid, lit
 *   d s l c  shirt: dark, mid, lit, specular
 * ------------------------------------------------------------------ */

const BODY_PALETTE: Record<string, string> = {
  o: PAL.ink,
  '1': HAT.dark,
  '2': HAT.mid,
  '3': HAT.lit,
  '4': HAT.spec,
  '5': BAND.dark,
  '6': BAND.mid,
  '7': BAND.lit,
  a: SKIN.dark,
  f: SKIN.mid,
  g: SKIN.lit,
  w: SKIN.spec,
  h: HAIR.dark,
  j: HAIR.mid,
  i: HAIR.lit,
  d: SHIRT.dark,
  s: SHIRT.mid,
  l: SHIRT.lit,
  c: SHIRT.spec,
}

/**
 * Facing the camera. This is the frame the player sees for most of the run, so it
 * carries the most work: a crown with a lit left slope, a band, a brim wide enough to
 * read at a glance, two eyes with a catchlight in the one the light reaches, a nose
 * shadow and a mouth.
 */
const HEAD_DOWN = [
  '................................',
  '............oooooooo............',
  '...........o33222211o...........',
  '...........o43332211o...........',
  '..........o3433222111o..........',
  '..........o7666666555o..........',
  '......o333222222222111111o......',
  '.....o43332222222222111111o.....',
  '.....oooooooooooooooooooooo.....',
  '..........oaaaaaaaaaao..........',
  '..........ogffffffaaao..........',
  '..........ogfwoffoofao..........',
  '..........ogfooffoofao..........',
  '..........ogfffaaffaao..........',
  '..........offfoooffaao..........',
  '..........offfffffaaao..........',
  '...........offfffaaao...........',
  '............ooaaaaoo............',
]

/** Walking away: the same hat, the back of the head, and a collar of neck below it. */
const HEAD_UP = [
  '................................',
  '............oooooooo............',
  '...........o33222211o...........',
  '...........o43332211o...........',
  '..........o3433222111o..........',
  '..........o7666666555o..........',
  '......o333222222222111111o......',
  '.....o43332222222222111111o.....',
  '.....oooooooooooooooooooooo.....',
  '..........ohhhhhhhhhho..........',
  '..........oijjjjjjhhho..........',
  '..........oijjjjjjjhho..........',
  '..........ojjjjjjjjhho..........',
  '..........ojjjjjjjhhho..........',
  '..........ojjjjjhhhhho..........',
  '..........ohhhhhhhhhho..........',
  '...........ogfffffaao...........',
  '............ooaaaaoo............',
]

/**
 * Facing right. The brim throws further forward than back, the hair shows at the nape,
 * and there is a nose. Lit from the upper left, which here is the back of the head —
 * the left-facing sheet is derived from this one with the tones swapped, never flipped
 * flat, so the light stays put when the farmer turns around.
 */
const HEAD_RIGHT = [
  '................................',
  '...........oooooooo.............',
  '..........o33222211o............',
  '..........o43332211o............',
  '.........o3433222111o...........',
  '.........o7666666555o...........',
  '......o3332222222222211111o.....',
  '.....o433322222222222111111o....',
  '.....ooooooooooooooooooooooo....',
  '..........ohhaaaaaaaao..........',
  '..........ojhhaaaaaaao..........',
  '..........ojjhfffoofao..........',
  '..........ojjhfaaoofggo.........',
  '..........ojjhfaffffggo.........',
  '..........ojjhffffoofo..........',
  '..........ohhhfffffffo..........',
  '...........ohfffffffo...........',
  '............ooaaaaoo............',
]

/** Shirt with a soft collar, folds that fall away from the light, and a belt. */
const TORSO_DOWN = [
  '.........ocllloaaossddo.........',
  '..........ollssssssddo..........',
  '..........olsssssdssdo..........',
  '..........olssssssssdo..........',
  '..........olsssdsssddo..........',
  '..........olssssssssdo..........',
  '..........o7666336655o..........',
  '..........o6666226555o..........',
]

const TORSO_UP = [
  '.........ocllllssssdddo.........',
  '..........ollssssssddo..........',
  '..........olssssssssdo..........',
  '..........olsssdssssdo..........',
  '..........olssssssssdo..........',
  '..........olsssssdssdo..........',
  '..........o7666666555o..........',
  '..........o6666665555o..........',
]

/** Turned: no collar V, one shoulder seam, and the belt buckle out of sight. */
const TORSO_RIGHT = [
  '..........ocllssssdddo..........',
  '..........ollssssssddo..........',
  '..........olssssdssddo..........',
  '..........olssssssssdo..........',
  '..........olssdssssddo..........',
  '..........olssssssssdo..........',
  '..........o7666666555o..........',
  '..........o6666665555o..........',
]

/**
 * Swapping a tone for its opposite is what lets a facing be reversed without the light
 * reversing with it: mirror the geometry, then put every lit edge back on the left.
 */
const MIRROR_TONE: Record<string, string> = {
  '1': '3',
  '3': '1',
  '4': '2',
  '5': '7',
  '7': '5',
  a: 'g',
  g: 'a',
  w: 'f',
  h: 'i',
  i: 'h',
  d: 'l',
  l: 'd',
  c: 's',
}

function mirrorRows(rows: string[]): string[] {
  const out: string[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    let flipped = ''
    for (let c = row.length - 1; c >= 0; c--) {
      const ch = row[c]
      const swap = MIRROR_TONE[ch]
      flipped += swap === undefined ? ch : swap
    }
    out.push(flipped)
  }
  return out
}

const HEAD_LEFT = mirrorRows(HEAD_RIGHT)
const TORSO_LEFT = mirrorRows(TORSO_RIGHT)

interface Sheet {
  head: Sprite
  torso: Sprite
}

function sheet(head: string[], torso: string[]): Sheet {
  return { head: makeSprite(head, BODY_PALETTE), torso: makeSprite(torso, BODY_PALETTE) }
}

const SHEETS: Record<Facing, Sheet> = {
  down: sheet(HEAD_DOWN, TORSO_DOWN),
  up: sheet(HEAD_UP, TORSO_UP),
  right: sheet(HEAD_RIGHT, TORSO_RIGHT),
  left: sheet(HEAD_LEFT, TORSO_LEFT),
}

/* ------------------------------------------------------------------ *
 * Drawing primitives shared by the body and the tools.
 * ------------------------------------------------------------------ */

/**
 * A limb: an ink-outlined bar `w` pixels thick swept from one point to another, lit on
 * its left column and shadowed on its right. Two passes — the whole path in ink, then
 * the fill inside it — so the outline stays exactly one pixel however the bar turns.
 */
function limb(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  lit: string,
  mid: string,
  dark: string,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const ax = dx < 0 ? -dx : dx
  const ay = dy < 0 ? -dy : dy
  const n = ax > ay ? ax : ay

  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    const x = x0 + Math.round(dx * t)
    const y = y0 + Math.round(dy * t)
    hline(ctx, x - 1, y - 1, w + 2, PAL.ink)
    hline(ctx, x - 1, y, w + 2, PAL.ink)
    hline(ctx, x - 1, y + 1, w + 2, PAL.ink)
  }
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    const x = x0 + Math.round(dx * t)
    const y = y0 + Math.round(dy * t)
    hline(ctx, x, y, w, mid)
    px(ctx, x, y, lit)
    if (w > 1) px(ctx, x + w - 1, y, dark)
  }
}

/**
 * A solid mass described by a run per row: an ink ring, a mid body, a lit top and left,
 * a dark bottom and right, and a specular where the light lands. Everything in this file
 * that is not a straight bar is built from this, which is what keeps a sack, a can and a
 * boot shaded by the same rule.
 */
function shapedMass(
  ctx: Ctx,
  x: number,
  y: number,
  off: readonly number[],
  w: readonly number[],
  r: Ramp,
): void {
  const n = w.length
  for (let i = 0; i < n; i++) {
    if (w[i] <= 0) continue
    const rx = x + off[i] - 1
    hline(ctx, rx, y + i - 1, w[i] + 2, PAL.ink)
    hline(ctx, rx, y + i, w[i] + 2, PAL.ink)
    hline(ctx, rx, y + i + 1, w[i] + 2, PAL.ink)
  }
  for (let i = 0; i < n; i++) {
    if (w[i] <= 0) continue
    const rx = x + off[i]
    hline(ctx, rx, y + i, w[i], r.mid)
    px(ctx, rx, y + i, r.lit)
    px(ctx, rx + w[i] - 1, y + i, r.dark)
  }
  if (w[0] > 0) hline(ctx, x + off[0], y, w[0], r.lit)
  if (w[n - 1] > 0) hline(ctx, x + off[n - 1], y + n - 1, w[n - 1], r.dark)
  if (w[0] > 2) px(ctx, x + off[0] + 1, y, r.spec)
  if (n > 1 && w[1] > 2) px(ctx, x + off[1] + 1, y + 1, r.spec)
}

const SKIN_FAR_LIT = mixHex(SKIN.mid, PAL.ink, 0.22)
const SKIN_FAR_MID = SKIN.dark
const SKIN_FAR_DARK = mixHex(SKIN.dark, PAL.ink, 0.32)

/** A rectangular mass in its ramp, with the same ink ring and the same light. */
function bar(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp): void {
  if (w <= 0 || h <= 0) return
  hline(ctx, x - 1, y - 1, w + 2, PAL.ink)
  hline(ctx, x - 1, y + h, w + 2, PAL.ink)
  for (let i = 0; i < h; i++) {
    const yy = y + i
    px(ctx, x - 1, yy, PAL.ink)
    hline(ctx, x, yy, w, r.mid)
    px(ctx, x, yy, r.lit)
    px(ctx, x + w - 1, yy, r.dark)
    px(ctx, x + w, yy, PAL.ink)
  }
  hline(ctx, x, y, w, r.lit)
  hline(ctx, x, y + h - 1, w, r.dark)
  if (w > 2) px(ctx, x + 1, y, r.spec)
}

/** A three-pixel fist with an ink ring, five pixels square once outlined. */
function fist(ctx: Ctx, x: number, y: number, far: boolean): void {
  hline(ctx, x - 1, y - 1, 5, PAL.ink)
  hline(ctx, x - 1, y + 3, 5, PAL.ink)
  for (let r = 0; r < 3; r++) {
    const yy = y + r
    px(ctx, x - 1, yy, PAL.ink)
    px(ctx, x, yy, far ? SKIN_FAR_LIT : SKIN.lit)
    px(ctx, x + 1, yy, far ? SKIN_FAR_MID : SKIN.mid)
    px(ctx, x + 2, yy, far ? SKIN_FAR_DARK : SKIN.dark)
    px(ctx, x + 3, yy, PAL.ink)
  }
  if (!far) px(ctx, x, y, SKIN.spec)
}

/** The same fist opened out, for the bare-hands tool: three fingers and a thumb. */
function openHand(ctx: Ctx, x: number, y: number, dir: number): void {
  shapedMass(ctx, x, y + 1, [0, 0, 0], [3, 3, 3], SKIN)
  for (let f = 0; f < 3; f++) {
    const fx = x + f
    px(ctx, fx, y - 1, PAL.ink)
    px(ctx, fx, y, f === 0 ? SKIN.lit : SKIN.mid)
  }
  const tx = dir < 0 ? x - 2 : x + 3
  px(ctx, tx, y + 2, SKIN.mid)
  px(ctx, tx, y + 3, SKIN.dark)
}

/* ------------------------------------------------------------------ *
 * Legs
 * ------------------------------------------------------------------ */

const LEG_TOP = 26

/**
 * One leg and its boot, planted on row 31. `x` is the leftmost trouser column, `toe`
 * points the boot outward, and a leg on the far side of the body is shaded down a whole
 * step so a side-on walk reads as depth rather than as two legs in the same place.
 */
function drawLeg(ctx: Ctx, ox: number, oy: number, x: number, toe: number, far: boolean): void {
  const tl = far ? TROUSER_FAR_LIT : TROUSER.lit
  const tm = far ? TROUSER_FAR_MID : TROUSER.mid
  const td = far ? TROUSER_FAR_DARK : TROUSER.dark
  const bl = far ? BOOT_FAR_LIT : BOOT.lit
  const bm = far ? BOOT_FAR_MID : BOOT.mid
  const bd = far ? BOOT_FAR_DARK : BOOT.dark

  // Four rows of trouser, then the boot. The split matters: give the boot three of the
  // six rows and the whole lower half of the sprite goes black, which is most of what
  // makes a 32 px character read as bottom-heavy.
  const lx = ox + x
  for (let r = 0; r < 4; r++) {
    const y = oy + LEG_TOP + r
    px(ctx, lx - 1, y, PAL.ink)
    px(ctx, lx, y, tl)
    px(ctx, lx + 1, y, tm)
    px(ctx, lx + 2, y, tm)
    px(ctx, lx + 3, y, td)
    px(ctx, lx + 4, y, PAL.ink)
  }
  // Cuff: two pixels, not a whole row.
  px(ctx, lx + 1, oy + LEG_TOP + 3, td)
  px(ctx, lx + 2, oy + LEG_TOP + 3, td)

  // The foot, which steps one pixel toward the toe, and a hard sole under it.
  const bx = toe < 0 ? lx - 1 : lx
  const fy = oy + LEG_TOP + 4
  px(ctx, bx - 1, fy, PAL.ink)
  px(ctx, bx, fy, bl)
  hline(ctx, bx + 1, fy, 3, bm)
  px(ctx, bx + 4, fy, bd)
  px(ctx, bx + 5, fy, PAL.ink)
  hline(ctx, bx - 1, fy + 1, 7, PAL.ink)
}

interface LegSpec {
  x: number
  toe: number
  far: boolean
}

/** Facing the camera or away from it. Far first, so a spread stance layers correctly. */
const FRONT_LEGS: Record<string, readonly LegSpec[]> = {
  stand: [
    { x: 10, toe: -1, far: false },
    { x: 18, toe: 1, far: false },
  ],
  walk0: [
    { x: 9, toe: -1, far: false },
    { x: 18, toe: 1, far: false },
  ],
  walk1: [
    { x: 11, toe: -1, far: false },
    { x: 17, toe: 1, far: false },
  ],
  walk2: [
    { x: 10, toe: -1, far: false },
    { x: 19, toe: 1, far: false },
  ],
  walk3: [
    { x: 11, toe: -1, far: false },
    { x: 17, toe: 1, far: false },
  ],
  brace: [
    { x: 9, toe: -1, far: false },
    { x: 19, toe: 1, far: false },
  ],
}

/** Turned right. The far leg is listed first and shaded a step down. */
const SIDE_LEGS: Record<string, readonly LegSpec[]> = {
  stand: [
    { x: 11, toe: 1, far: true },
    { x: 14, toe: 1, far: false },
  ],
  walk0: [
    { x: 9, toe: 1, far: true },
    { x: 16, toe: 1, far: false },
  ],
  walk1: [
    { x: 12, toe: 1, far: true },
    { x: 13, toe: 1, far: false },
  ],
  walk2: [
    { x: 16, toe: 1, far: true },
    { x: 10, toe: 1, far: false },
  ],
  walk3: [
    { x: 13, toe: 1, far: true },
    { x: 12, toe: 1, far: false },
  ],
  brace: [
    { x: 10, toe: 1, far: true },
    { x: 16, toe: 1, far: false },
  ],
}

/* ------------------------------------------------------------------ *
 * Posture: one table per stance, read by facing and animation frame.
 * ------------------------------------------------------------------ */

interface Arm {
  /** Shoulder, as the left column of the three-pixel bar. */
  sx: number
  sy: number
  /** Hand, same measure. The fist is drawn centred on `hx + 1, hy + 1`. */
  hx: number
  hy: number
}

interface Posture {
  /** Whole-body lift on the passing frames of the walk. */
  bob: number
  /** The idle breathe: the head settles one pixel into the shoulders. */
  headBob: number
  legs: readonly LegSpec[]
  /** The arm on the far side of the body, drawn under the torso. */
  back: Arm
  /** The arm that holds the tool, drawn over the torso. */
  front: Arm
  /** Top of a shafted tool. */
  bx: number
  by: number
  /** The working end of a shafted tool: where the blade lands. */
  hx: number
  hy: number
  /**
   * Where water, seed and fertilizer fall. A shaft swings across the body, but a can
   * pours from wherever it is being held, so the two cannot share a point.
   */
  spx: number
  spy: number
  /** Which way the tool faces: +1 to the right of the sprite, -1 to the left. */
  dir: number
  /** -1 carried, 0 wind up, 1 strike, 2 follow through. */
  phase: number
}

type Stance = 'front' | 'back' | 'side'

const ARM_W = 3

/** Rest and walk. Index 0 is the idle stand; 1..4 are the four walk frames. */
const FRONT_ARMS: readonly Arm[] = [
  { sx: 7, sy: 19, hx: 7, hy: 25 },
  { sx: 7, sy: 19, hx: 7, hy: 23 },
  { sx: 7, sy: 19, hx: 7, hy: 25 },
  { sx: 7, sy: 19, hx: 7, hy: 26 },
  { sx: 7, sy: 19, hx: 7, hy: 25 },
]
const FRONT_TOOL_ARMS: readonly Arm[] = [
  { sx: 22, sy: 19, hx: 22, hy: 25 },
  { sx: 22, sy: 19, hx: 22, hy: 26 },
  { sx: 22, sy: 19, hx: 22, hy: 25 },
  { sx: 22, sy: 19, hx: 22, hy: 23 },
  { sx: 22, sy: 19, hx: 22, hy: 25 },
]
const SIDE_ARMS: readonly Arm[] = [
  { sx: 9, sy: 20, hx: 9, hy: 25 },
  { sx: 9, sy: 20, hx: 7, hy: 25 },
  { sx: 9, sy: 20, hx: 9, hy: 25 },
  { sx: 9, sy: 20, hx: 12, hy: 24 },
  { sx: 9, sy: 20, hx: 9, hy: 25 },
]
const SIDE_TOOL_ARMS: readonly Arm[] = [
  { sx: 18, sy: 20, hx: 18, hy: 25 },
  { sx: 18, sy: 20, hx: 21, hy: 24 },
  { sx: 18, sy: 20, hx: 18, hy: 25 },
  { sx: 18, sy: 20, hx: 15, hy: 26 },
  { sx: 18, sy: 20, hx: 18, hy: 25 },
]

/** Where a shafted tool lies when it is merely being carried. */
interface Shaft {
  bx: number
  by: number
  hx: number
  hy: number
}

const CARRY_SHAFT: Record<Stance, Shaft> = {
  front: { bx: 27, by: 15, hx: 25, hy: 28 },
  back: { bx: 27, by: 15, hx: 25, hy: 28 },
  side: { bx: 22, by: 18, hx: 18, hy: 28 },
}

/** The three-frame swing: up and back, down through the tile, then the recovery. */
const USE_SHAFT: Record<Stance, readonly Shaft[]> = {
  front: [
    { bx: 18, by: 24, hx: 25, hy: 10 },
    { bx: 27, by: 16, hx: 17, hy: 28 },
    { bx: 26, by: 14, hx: 20, hy: 27 },
  ],
  back: [
    { bx: 18, by: 24, hx: 25, hy: 10 },
    { bx: 24, by: 26, hx: 16, hy: 9 },
    { bx: 25, by: 24, hx: 19, hy: 11 },
  ],
  side: [
    { bx: 11, by: 24, hx: 25, hy: 8 },
    { bx: 17, by: 16, hx: 25, hy: 28 },
    { bx: 16, by: 14, hx: 25, hy: 27 },
  ],
}

const USE_ARMS: Record<Stance, readonly Arm[]> = {
  front: [
    { sx: 22, sy: 19, hx: 21, hy: 15 },
    { sx: 22, sy: 19, hx: 18, hy: 25 },
    { sx: 22, sy: 19, hx: 21, hy: 23 },
  ],
  back: [
    { sx: 22, sy: 19, hx: 21, hy: 15 },
    { sx: 22, sy: 19, hx: 20, hy: 19 },
    { sx: 22, sy: 19, hx: 21, hy: 17 },
  ],
  side: [
    { sx: 18, sy: 20, hx: 18, hy: 14 },
    { sx: 18, sy: 20, hx: 23, hy: 24 },
    { sx: 18, sy: 20, hx: 21, hy: 21 },
  ],
}

/**
 * A can, a pouch and a bare hand are not swung, they are reached with. Sharing one arm
 * path between a hoe and a watering can is what makes a tool look like a re-skin, so the
 * five reaching tools get their own three frames: draw back, extend, settle.
 */
const REACH_ARMS: Record<Stance, readonly Arm[]> = {
  front: [
    { sx: 22, sy: 19, hx: 22, hy: 22 },
    { sx: 22, sy: 19, hx: 21, hy: 26 },
    { sx: 22, sy: 19, hx: 22, hy: 24 },
  ],
  back: [
    { sx: 22, sy: 19, hx: 22, hy: 22 },
    { sx: 22, sy: 19, hx: 22, hy: 19 },
    { sx: 22, sy: 19, hx: 22, hy: 21 },
  ],
  side: [
    { sx: 18, sy: 20, hx: 17, hy: 23 },
    { sx: 18, sy: 20, hx: 22, hy: 26 },
    { sx: 18, sy: 20, hx: 20, hy: 24 },
  ],
}

/** The free arm during a swing: braced, and it counter-swings a little. */
const USE_BACK_ARMS: Record<Stance, readonly Arm[]> = {
  front: [
    { sx: 7, sy: 19, hx: 6, hy: 24 },
    { sx: 7, sy: 19, hx: 6, hy: 26 },
    { sx: 7, sy: 19, hx: 6, hy: 25 },
  ],
  back: [
    { sx: 7, sy: 19, hx: 6, hy: 24 },
    { sx: 7, sy: 19, hx: 6, hy: 26 },
    { sx: 7, sy: 19, hx: 6, hy: 25 },
  ],
  side: [
    { sx: 9, sy: 20, hx: 8, hy: 26 },
    { sx: 9, sy: 20, hx: 12, hy: 25 },
    { sx: 9, sy: 20, hx: 10, hy: 25 },
  ],
}

/** Where a poured or scattered thing lands, per stance. Away from the camera it is a
 *  short throw over the shoulder line; toward it, a fall to the tile the farmer faces. */
const SPILL: Record<Stance, { x: number; y: number }> = {
  front: { x: 23, y: 29 },
  back: { x: 25, y: 20 },
  side: { x: 27, y: 30 },
}

const WALK_KEYS = ['walk0', 'walk1', 'walk2', 'walk3'] as const

/**
 * Everything an animation frame needs, before the left-facing mirror is applied.
 * `step` is the walk frame 0..3 or -1 for a standing pose; `use` is the tool frame
 * 0..2 or -1; `breathe` is the idle sub-frame.
 */
function posture(
  stance: Stance,
  step: number,
  use: number,
  breathe: number,
  swung: boolean,
): Posture {
  const legTable = stance === 'side' ? SIDE_LEGS : FRONT_LEGS
  const arms = stance === 'side' ? SIDE_ARMS : FRONT_ARMS
  const toolArms = stance === 'side' ? SIDE_TOOL_ARMS : FRONT_TOOL_ARMS
  const spill = SPILL[stance]

  if (use >= 0) {
    const shaft = USE_SHAFT[stance][use]
    return {
      bob: 0,
      headBob: swung && use === 1 ? 1 : 0,
      legs: swung ? legTable.brace : legTable.stand,
      back: USE_BACK_ARMS[stance][use],
      front: swung ? USE_ARMS[stance][use] : REACH_ARMS[stance][use],
      bx: shaft.bx,
      by: shaft.by,
      hx: shaft.hx,
      hy: shaft.hy,
      spx: spill.x,
      spy: spill.y,
      dir: 1,
      phase: use,
    }
  }

  const carry = CARRY_SHAFT[stance]
  const idle = step < 0
  return {
    bob: !idle && (step === 1 || step === 3) ? -1 : 0,
    headBob: idle ? breathe : 0,
    legs: idle ? legTable.stand : legTable[WALK_KEYS[step]],
    back: arms[idle ? 0 : step + 1],
    front: toolArms[idle ? 0 : step + 1],
    bx: carry.bx,
    by: carry.by,
    hx: carry.hx,
    hy: carry.hy,
    spx: spill.x,
    spy: spill.y,
    dir: 1,
    phase: -1,
  }
}

/** Reflect a run of width `w` across the 32-pixel sprite box. */
function mirrorRun(x: number, w: number): number {
  return FARMER_SIZE - w - x
}

function mirrorArm(a: Arm): Arm {
  return {
    sx: mirrorRun(a.sx, ARM_W),
    sy: a.sy,
    hx: mirrorRun(a.hx, ARM_W),
    hy: a.hy,
  }
}

function mirrorPosture(p: Posture): Posture {
  const legs: LegSpec[] = []
  for (let i = 0; i < p.legs.length; i++) {
    const leg = p.legs[i]
    legs.push({ x: mirrorRun(leg.x, 4), toe: -leg.toe, far: leg.far })
  }
  return {
    bob: p.bob,
    headBob: p.headBob,
    legs,
    back: mirrorArm(p.back),
    front: mirrorArm(p.front),
    bx: FARMER_SIZE - 1 - p.bx,
    by: p.by,
    hx: FARMER_SIZE - 1 - p.hx,
    hy: p.hy,
    spx: FARMER_SIZE - 1 - p.spx,
    spy: p.spy,
    dir: -p.dir,
    phase: p.phase,
  }
}

/* ------------------------------------------------------------------ *
 * The tools, in hand
 * ------------------------------------------------------------------ */

/** A steel hoe blade, hung square across the end of its shaft. */
function hoeBlade(ctx: Ctx, x: number, y: number): void {
  shapedMass(ctx, x - 3, y, [0, 0, 1], [8, 8, 6], STEEL)
  px(ctx, x - 3, y, STEEL.spec)
}

/** An axe head: a wedge whose edge takes the light. */
function axeHead(ctx: Ctx, x: number, y: number, dir: number): void {
  const bx = dir < 0 ? x - 5 : x - 2
  shapedMass(ctx, bx, y - 3, [2, 1, 0, 0, 1, 2], [4, 6, 7, 7, 6, 4], STEEL)
  const edge = dir < 0 ? bx : bx + 6
  for (let i = 1; i < 5; i++) px(ctx, edge, y - 3 + i, STEEL.spec)
}

/**
 * The watering can, held: a seven-pixel barrel, a strap handle and a spout that drops
 * from carried to pouring. Deliberately small — anything wider than a quarter of the
 * tile stops being a held object and starts being a second sprite.
 */
function wateringCan(
  ctx: Ctx,
  x: number,
  y: number,
  dir: number,
  tip: number,
): { x: number; y: number } {
  shapedMass(ctx, x, y, [1, 0, 0, 0, 1], [5, 7, 7, 7, 5], STEEL)
  hline(ctx, x + 2, y - 2, 3, PAL.ink)
  hline(ctx, x + 2, y - 1, 3, STEEL.lit)
  hline(ctx, x + 1, y + 2, 5, STEEL.dark)

  const nx = dir > 0 ? x + 7 : x - 1
  const ny = y + (tip > 0 ? 2 : 0)
  limb(ctx, nx, ny + 1, nx + dir * 2, ny + 3, 2, STEEL.lit, STEEL.mid, STEEL.dark)
  const rx = nx + dir * 2 + (dir < 0 ? -1 : 0)
  shapedMass(ctx, rx, ny + 3, [0, 0], [2, 2], STEEL)
  return { x: rx, y: ny + 4 }
}

/** The seed pouch: burlap, open at the neck, with grain heaped in it. */
function seedPouch(ctx: Ctx, x: number, y: number): void {
  shapedMass(ctx, x, y, [1, 0, 0, 0, 1], [5, 7, 7, 7, 5], BURLAP)
  hline(ctx, x + 1, y - 1, 5, PAL.ink)
  hline(ctx, x + 2, y - 1, 3, GRAIN.mid)
  px(ctx, x + 2, y - 1, GRAIN.spec)
  hline(ctx, x, y + 2, 7, BAND.dark)
  px(ctx, x + 1, y + 2, BAND.lit)
}

/** The fertilizer sack: fatter than the pouch, tied shut, with a gold band. */
function fertilizerSack(ctx: Ctx, x: number, y: number): void {
  shapedMass(ctx, x, y, [2, 1, 0, 0, 1], [4, 6, 8, 8, 6], BURLAP)
  hline(ctx, x + 3, y - 2, 2, PAL.ink)
  hline(ctx, x + 3, y - 1, 2, BAND.mid)
  hline(ctx, x, y + 2, 8, BRASS.mid)
  px(ctx, x, y + 2, BRASS.lit)
  px(ctx, x + 7, y + 2, BRASS.dark)
  px(ctx, x + 2, y + 2, PAL.ink)
  px(ctx, x + 5, y + 2, PAL.ink)
}

/** The sprinkler as an object: a crossed head, a post and a foot plate. Eight rows. */
function sprinklerBody(ctx: Ctx, x: number, y: number): void {
  shapedMass(ctx, x, y, [1, 0], [5, 7], STEEL)
  limb(ctx, x + 2, y + 2, x + 2, y + 4, 3, STEEL.lit, STEEL.mid, STEEL.dark)
  shapedMass(ctx, x + 1, y + 5, [0], [5], STEEL)
  px(ctx, x + 3, y - 1, PAL.ink)
  px(ctx, x + 3, y, STEEL.spec)
}

/**
 * Loose grain, in the arc between the hand and where it lands. This is not gated on
 * reduced motion, for the same reason the tool swing is not: without it, sowing and
 * reaching for a crop are the same three frames. `beat` is already zero when motion is
 * reduced, so the arc holds still — it stops animating, it does not stop existing.
 */
function scatter(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  count: number,
  beat: number,
  r: Ramp,
): void {
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const wob = ((i + beat) % 3) - 1
    const x = Math.round(x0 + (x1 - x0) * t) + wob
    const y = Math.round(y0 + (y1 - y0) * t) - Math.round(Math.sin(t * Math.PI) * 2)
    px(ctx, x, y, i % 2 === 0 ? r.lit : r.mid)
  }
}

/** A stream from the rose, and the ring it makes where it lands. */
function pour(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, beat: number): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const ay = dy < 0 ? -dy : dy
  const ax = dx < 0 ? -dx : dx
  const n = ax > ay ? ax : ay
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    const x = x0 + Math.round(dx * t)
    const y = y0 + Math.round(dy * t)
    px(ctx, x, y, WATER.lit)
    px(ctx, x + 1, y, WATER.mid)
  }
  if (prefersReducedMotion()) return
  const spread = 2 + (beat % 2)
  for (let i = -spread; i <= spread; i += 2) {
    px(ctx, x1 + i, y1 + (i === 0 ? 1 : 0), WATER.spec)
  }
}

/**
 * The tool as the farmer holds it, in the pose the posture asked for. Every one of the
 * seven reads differently in silhouette and every one moves through the swing: the hoe
 * and axe travel on their shafts, the can tips and pours, the pouch and the sack throw,
 * the sprinkler goes down onto the tile and the bare hand reaches and closes.
 */
function drawHeldTool(
  ctx: Ctx,
  ox: number,
  oy: number,
  tool: ToolId,
  p: Posture,
  beat: number,
): void {
  const gx = ox + p.front.hx + 1
  const gy = oy + p.front.hy + 1
  const hx = ox + p.hx
  const hy = oy + p.hy
  const spx = ox + p.spx
  const spy = oy + p.spy
  const dir = p.dir
  const working = p.phase >= 1

  switch (tool) {
    case 'hoe':
      limb(ctx, ox + p.bx, oy + p.by, hx, hy, 2, WOOD.lit, WOOD.mid, WOOD.dark)
      hoeBlade(ctx, hx, hy)
      break

    case 'axe':
      limb(ctx, ox + p.bx, oy + p.by, hx, hy, 2, WOOD.lit, WOOD.mid, WOOD.dark)
      axeHead(ctx, hx, hy, dir)
      break

    case 'can': {
      const tip = working ? 1 : 0
      const rose = wateringCan(ctx, gx - (dir > 0 ? 4 : 2), gy - 4 + tip, dir, tip)
      if (working) pour(ctx, rose.x, rose.y, spx, spy, beat)
      break
    }

    case 'seeds':
      seedPouch(ctx, gx - 3, gy - 2)
      if (working) {
        scatter(ctx, gx, gy + 2, spx, spy, 5, beat, GRAIN)
        px(ctx, spx, spy, SPROUT.mid)
        px(ctx, spx + dir, spy - 1, SPROUT.lit)
      }
      break

    case 'fertilizer':
      fertilizerSack(ctx, gx - 3, gy - 2)
      if (working) scatter(ctx, gx, gy + 2, spx, spy, 6, beat, MINERAL)
      break

    case 'sprinkler':
      if (p.phase === 2) sprinklerBody(ctx, spx - 3, spy - 7)
      else sprinklerBody(ctx, gx - 3, gy - 4)
      break

    case 'hand':
      if (working) {
        px(ctx, spx, spy - 1, PAL.cream)
        px(ctx, spx + dir, spy - 2, PAL.lantern)
        px(ctx, spx - dir, spy, PAL.lantern)
      }
      break
  }
}

/* ------------------------------------------------------------------ *
 * The farmer
 * ------------------------------------------------------------------ */

/** What the farmer is doing. `walk` and `use` are state, so they survive reduced motion. */
type FarmerAction = 'idle' | 'walk' | 'use'

export interface FarmerPose {
  action: FarmerAction
  /**
   * `idle` — the 60 fps frame counter; the breathe runs off `beatOf`.
   * `walk` — any integer; the four-frame cycle is taken modulo 4.
   * `use`  — 0, 1 or 2: wind up, strike, follow through.
   */
  frame: number
}

function wrap(n: number, m: number): number {
  const r = Math.round(n) % m
  return r < 0 ? r + m : r
}

/**
 * The farmer, in any pose of the set `docs/GRAPHICS.md` section 6 asks for. Anchored at
 * the top-left of a 32 x 32 box and never a pixel outside it, so the world layer can
 * hand it a tile origin and sort by row.
 */
export function drawFarmerPose(
  ctx: Ctx,
  facing: Facing,
  sx: number,
  sy: number,
  tool: ToolId,
  pose: FarmerPose,
): void {
  const ox = Math.round(sx)
  const oy = Math.round(sy)

  const stance: Stance = facing === 'up' ? 'back' : facing === 'down' ? 'front' : 'side'
  const beat = beatOf(pose.frame)

  let step = -1
  let use = -1
  let breathe = 0
  if (pose.action === 'walk') step = wrap(pose.frame, 4)
  else if (pose.action === 'use') use = wrap(pose.frame, 3)
  else breathe = (beat >> 1) & 1

  const base = posture(stance, step, use, breathe, tool === 'hoe' || tool === 'axe')
  const p = facing === 'left' ? mirrorPosture(base) : base
  const sheet = SHEETS[facing]
  const body = oy + p.bob

  // The shadow stays on the ground while the body lifts. That one pixel of separation is
  // most of what makes the passing frame read as a step rather than as a jitter.
  ellipse(ctx, ox + 15, oy + 30, 8, 1, SHADOW)

  if (stance === 'back') drawHeldTool(ctx, ox, body, tool, p, beat)

  // Only a turned farmer has an arm genuinely behind the body. Face on, the free arm is
  // the one the light reaches first, so shading it down would put the light on the wrong
  // side of the sprite.
  const away = stance === 'side'
  limb(
    ctx,
    ox + p.back.sx,
    body + p.back.sy,
    ox + p.back.hx,
    body + p.back.hy,
    ARM_W,
    away ? SHIRT_FAR_LIT : SHIRT.lit,
    away ? SHIRT_FAR_MID : SHIRT.mid,
    away ? SHIRT_FAR_DARK : SHIRT.dark,
  )
  fist(ctx, ox + p.back.hx, body + p.back.hy, away)

  for (let i = 0; i < p.legs.length; i++) {
    const leg = p.legs[i]
    drawLeg(ctx, ox, body, leg.x, leg.toe, leg.far)
  }

  drawSprite(ctx, sheet.torso, ox, body + 18)
  drawSprite(ctx, sheet.head, ox, body + p.headBob)

  if (facing === 'left') {
    // The mirror swaps every tone but cannot move a specular, so the three that carry
    // the light on this facing are put back by hand.
    px(ctx, ox + 13, body + 3 + p.headBob, HAT.spec)
    px(ctx, ox + 13, body + 4 + p.headBob, HAT.spec)
    px(ctx, ox + 6, body + 7 + p.headBob, HAT.spec)
    px(ctx, ox + 11, body + 18, SHIRT.spec)
  }

  limb(
    ctx,
    ox + p.front.sx,
    body + p.front.sy,
    ox + p.front.hx,
    body + p.front.hy,
    ARM_W,
    SHIRT.lit,
    SHIRT.mid,
    SHIRT.dark,
  )

  if (stance !== 'back') drawHeldTool(ctx, ox, body, tool, p, beat)

  if (tool === 'hand') {
    openHand(ctx, ox + p.front.hx, body + p.front.hy, p.hx >= p.bx ? 1 : -1)
  } else {
    fist(ctx, ox + p.front.hx, body + p.front.hy, false)
  }
}

/**
 * The farmer as the world scene draws them. `walkFrame` is the caller's step counter:
 * zero means standing, anything else advances the four-frame cycle. Kept exactly as it
 * was so the world scene is free to move to `drawFarmerPose` when it wants the idle
 * breathe and the tool swing as well.
 */
export function drawFarmer(
  ctx: Ctx,
  facing: Facing,
  sx: number,
  sy: number,
  walkFrame: number,
  tool: ToolId,
): void {
  const w = Math.round(walkFrame)
  if (w === 0 || Number.isNaN(w)) {
    drawFarmerPose(ctx, facing, sx, sy, tool, { action: 'idle', frame: 0 })
    return
  }
  drawFarmerPose(ctx, facing, sx, sy, tool, { action: 'walk', frame: w })
}

/* ------------------------------------------------------------------ *
 * Belt icons — 24 x 24, anchored top-left
 *
 * The belt only labels the slot the player has selected, so each of the seven has to be
 * recognisable on its own: no two share a silhouette, an angle or a dominant colour.
 * ------------------------------------------------------------------ */

function iconHoe(ctx: Ctx, x: number, y: number): void {
  // Long shaft down to the left, blade square across the bottom of it. Read against the
  // axe, the tells are the head's position — low, not high — and its flatness.
  limb(ctx, x + 17, y + 2, x + 9, y + 12, 3, WOOD.lit, WOOD.mid, WOOD.dark)
  px(ctx, x + 18, y + 1, WOOD.spec)
  hline(ctx, x + 8, y + 13, 4, STEEL.mid)
  shapedMass(ctx, x + 3, y + 15, [1, 0, 0, 1], [9, 11, 11, 9], STEEL)
}

function iconAxe(ctx: Ctx, x: number, y: number): void {
  // Handle falls to the lower right, head fans out to the upper left, and the cutting
  // edge is the brightest thing on the belt.
  limb(ctx, x + 11, y + 8, x + 16, y + 19, 3, WOOD.lit, WOOD.mid, WOOD.dark)
  px(ctx, x + 17, y + 20, WOOD.dark)
  shapedMass(
    ctx,
    x + 2,
    y + 2,
    [4, 2, 1, 0, 0, 1, 2, 4],
    [8, 10, 11, 12, 12, 11, 10, 8],
    STEEL,
  )
  px(ctx, x + 2, y + 5, STEEL.spec)
  px(ctx, x + 2, y + 6, STEEL.spec)
  px(ctx, x + 3, y + 4, STEEL.spec)
  px(ctx, x + 3, y + 7, STEEL.spec)
  hline(ctx, x + 9, y + 5, 4, STEEL.dark)
}

function iconCan(ctx: Ctx, x: number, y: number): void {
  shapedMass(ctx, x + 6, y + 9, [1, 0, 0, 0, 0, 1], [11, 13, 13, 13, 13, 11], STEEL)
  // Strap handle.
  hline(ctx, x + 9, y + 7, 8, PAL.ink)
  hline(ctx, x + 10, y + 6, 6, PAL.ink)
  hline(ctx, x + 10, y + 7, 6, STEEL.lit)
  // Spout rising to the left, with the rose on the end.
  limb(ctx, x + 6, y + 11, x + 2, y + 6, 2, STEEL.lit, STEEL.mid, STEEL.dark)
  shapedMass(ctx, x + 1, y + 4, [0, 0], [4, 4], STEEL)
  hline(ctx, x + 7, y + 12, 11, STEEL.dark)
  // Three drops leaving the rose. Water is the one blue thing on the belt.
  px(ctx, x + 2, y + 9, WATER.lit)
  px(ctx, x + 4, y + 12, WATER.mid)
  px(ctx, x + 1, y + 15, WATER.mid)
}

function iconSeeds(ctx: Ctx, x: number, y: number): void {
  // A tall drawstring pouch. Against the fertilizer sack the tells are the shape — narrow
  // and round rather than wide and boxy — the open neck, and the sprout.
  shapedMass(ctx, x + 8, y + 4, [1, 0, 0], [5, 7, 7], BURLAP)
  hline(ctx, x + 8, y + 3, 7, PAL.ink)
  hline(ctx, x + 9, y + 3, 5, GRAIN.mid)
  px(ctx, x + 9, y + 3, GRAIN.spec)
  shapedMass(
    ctx,
    x + 4,
    y + 8,
    [4, 2, 1, 0, 0, 0, 0, 1, 2],
    [7, 11, 13, 15, 15, 15, 15, 13, 11],
    BURLAP,
  )
  hline(ctx, x + 7, y + 7, 9, BAND.dark)
  px(ctx, x + 7, y + 7, BAND.lit)
  px(ctx, x + 6, y + 2, GRAIN.mid)
  px(ctx, x + 17, y + 6, GRAIN.mid)
  px(ctx, x + 18, y + 9, GRAIN.lit)
  px(ctx, x + 13, y + 1, SPROUT.lit)
  px(ctx, x + 14, y + 0, SPROUT.mid)
  px(ctx, x + 12, y + 2, SPROUT.dark)
}

function iconHand(ctx: Ctx, x: number, y: number): void {
  // Four fingers of uneven length, then the palm laid over their roots and a thumb out
  // on the light side. Drawn as separate bars so the ink between them reads as knuckles.
  shapedMass(
    ctx,
    x + 4,
    y + 10,
    [0, 0, 0, 0, 0, 0, 1, 2],
    [17, 17, 17, 17, 17, 16, 14, 12],
    GLOVE,
  )
  bar(ctx, x + 1, y + 12, 3, 4, GLOVE)
  // Fingers last, running three rows down into the palm: what would otherwise be their
  // bottom outline lands inside it and reads as the knuckle line.
  const tops = [9, 6, 5, 8]
  for (let f = 0; f < 4; f++) bar(ctx, x + 5 + f * 4, y + tops[f], 3, 13 - tops[f], GLOVE)
  hline(ctx, x + 5, y + 15, 12, GLOVE.dark)
}

function iconSprinkler(ctx: Ctx, x: number, y: number): void {
  limb(ctx, x + 10, y + 11, x + 10, y + 17, 3, STEEL.lit, STEEL.mid, STEEL.dark)
  shapedMass(ctx, x + 6, y + 18, [0, 0], [12, 12], STEEL)
  shapedMass(ctx, x + 4, y + 6, [1, 0, 0, 1], [13, 15, 15, 13], STEEL)
  shapedMass(ctx, x + 10, y + 3, [0, 0], [4, 4], STEEL)
  // Spray, the detail that separates it from the watering can at a glance.
  px(ctx, x + 2, y + 4, WATER.lit)
  px(ctx, x + 1, y + 7, WATER.mid)
  px(ctx, x + 20, y + 4, WATER.lit)
  px(ctx, x + 21, y + 7, WATER.mid)
  px(ctx, x + 11, y + 1, WATER.spec)
}

function iconFertilizer(ctx: Ctx, x: number, y: number): void {
  // A feed sack: rolled shut at the top, squat and square-sided, with a gold label band.
  bar(ctx, x + 4, y + 4, 16, 3, BAND)
  shapedMass(
    ctx,
    x + 3,
    y + 8,
    [1, 0, 0, 0, 0, 0, 0, 1],
    [16, 18, 18, 18, 18, 18, 18, 16],
    BURLAP,
  )
  hline(ctx, x + 4, y + 11, 16, BRASS.lit)
  hline(ctx, x + 4, y + 12, 16, BRASS.mid)
  hline(ctx, x + 4, y + 13, 16, BRASS.dark)
  px(ctx, x + 4, y + 11, BRASS.spec)
  px(ctx, x + 8, y + 12, PAL.ink)
  px(ctx, x + 12, y + 12, PAL.ink)
  px(ctx, x + 16, y + 12, PAL.ink)
}

const ICON_DRAW: Record<ToolId, (ctx: Ctx, x: number, y: number) => void> = {
  hoe: iconHoe,
  can: iconCan,
  seeds: iconSeeds,
  hand: iconHand,
  axe: iconAxe,
  sprinkler: iconSprinkler,
  fertilizer: iconFertilizer,
}

/** 24 x 24, anchored at the top-left. */
export function drawToolIcon(ctx: Ctx, tool: ToolId, sx: number, sy: number): void {
  ICON_DRAW[tool](ctx, Math.round(sx), Math.round(sy))
}

/** The same objects as loose stock, seated on a contact shadow. 24 x 24. */
export function drawGoodIcon(ctx: Ctx, good: GoodId, sx: number, sy: number): void {
  const x = Math.round(sx)
  const y = Math.round(sy)
  if (good === 'sprinkler') {
    ellipse(ctx, x + 11, y + 20, 7, 1, SHADOW)
    iconSprinkler(ctx, x, y - 1)
    return
  }
  ellipse(ctx, x + 11, y + 16, 10, 1, SHADOW)
  iconFertilizer(ctx, x, y - 1)
}
