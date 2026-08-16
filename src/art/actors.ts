import type { Facing, GoodId, ToolId } from '../game/types'
import type { Sprite } from '../engine/pixel'
import { PAL, shade } from '../engine/palette'
import { drawSprite, makeSprite, px } from '../engine/pixel'

type Ctx = CanvasRenderingContext2D
type Put = (x: number, y: number, color: string) => void

const TILE_PX = 16

const shadeCache = new Map<string, string>()
function tone(hex: string, amount: number): string {
  const key = `${hex}|${amount}`
  const hit = shadeCache.get(key)
  if (hit !== undefined) return hit
  const value = shade(hex, amount)
  shadeCache.set(key, value)
  return value
}

const WOOD = PAL.bark
const WOOD_LIT = tone(PAL.bark, 0.28)
const METAL = tone(PAL.sky, -0.18)
const METAL_LIT = tone(PAL.sky, 0.25)
const METAL_DARK = tone(PAL.sky, -0.45)
const BURLAP = tone(PAL.soil, 0.3)
const BURLAP_LIT = tone(PAL.soil, 0.5)
const BURLAP_DARK = tone(PAL.soil, -0.25)
const SKIN = PAL.parchment
const SKIN_LIT = PAL.cream
const SKIN_DARK = tone(PAL.parchment, -0.28)

/**
 * Character sheet. `.` is transparent; every other letter is a palette family member.
 * o ink, h/H hat, b bark (band and belt), f/F/k face, r/R hair,
 * S/L/D shirt, T/t trousers, B boot.
 */
const BODY_PALETTE: Record<string, string> = {
  o: PAL.ink,
  h: PAL.lantern,
  H: tone(PAL.lantern, -0.28),
  b: PAL.bark,
  f: SKIN,
  F: SKIN_LIT,
  k: SKIN_DARK,
  r: tone(PAL.bark, -0.18),
  R: PAL.bark,
  S: PAL.sky,
  L: tone(PAL.sky, 0.3),
  D: tone(PAL.sky, -0.38),
  T: PAL.dusk,
  t: tone(PAL.dusk, -0.3),
  B: tone(PAL.bark, -0.22),
}

const EMPTY_ROW = '................'

// Twelve body rows, drawn one pixel lower on the second walk frame.
const BODY_DOWN = [
  '.....oooooo.....',
  '....ohhHHHHo....',
  '....obbbbbbo....',
  '...ohhHHHHHHo...',
  '...obbbbbbbbo...',
  '....oFFffffo....',
  '....ofoffofo....',
  '....okkkkkko....',
  '...oLLSSSSSSo...',
  '...oSDSSSSDSo...',
  '...okSSSSSSko...',
  '...obbbbbbbbo...',
]

const BODY_UP = [
  '.....oooooo.....',
  '....ohhHHHHo....',
  '....obbbbbbo....',
  '...ohhHHHHHHo...',
  '...obbbbbbbbo...',
  '....oRRrrrro....',
  '....orrrrrro....',
  '.....okkko......',
  '...oLLSSSSSSo...',
  '...oSDSSSSDSo...',
  '...okSSSSSSko...',
  '...obbbbbbbbo...',
]

// The side view is lit from directly above so it survives the horizontal flip.
const BODY_SIDE = [
  '.....oooooo.....',
  '....ohhhhhho....',
  '....oHHHHHHo....',
  '...ohhhhhhhho...',
  '...obbbbbbbbo...',
  '....oFFFFFo.....',
  '....offofffo....',
  '....okkkkko.....',
  '....oLLLLLo.....',
  '....oSSSSSo.....',
  '....oSSSSSko....',
  '....obbbbbo.....',
]

const LEGS_DOWN_A = ['....oTTooTTo....', '....oTtootTo....', '....oBBooBBo....']
const LEGS_DOWN_B = ['....oTToTTo.....', '....oBBoBBo.....']
const LEGS_SIDE_A = ['....oTTTTTo.....', '....oTToTTo.....', '....oBBoBBo.....']
const LEGS_SIDE_B = ['....oTTTTTo.....', '....oBBBBBo.....']

function farmerSprite(body: string[], legs: string[], drop: number): Sprite {
  const rows: string[] = []
  for (let i = 0; i < drop; i++) rows.push(EMPTY_ROW)
  rows.push(...body, ...legs)
  while (rows.length < TILE_PX) rows.push(EMPTY_ROW)
  return makeSprite(rows.slice(0, TILE_PX), BODY_PALETTE)
}

const FARMER: Record<'down' | 'up' | 'side', readonly [Sprite, Sprite]> = {
  down: [farmerSprite(BODY_DOWN, LEGS_DOWN_A, 1), farmerSprite(BODY_DOWN, LEGS_DOWN_B, 2)],
  up: [farmerSprite(BODY_UP, LEGS_DOWN_A, 1), farmerSprite(BODY_UP, LEGS_DOWN_B, 2)],
  side: [farmerSprite(BODY_SIDE, LEGS_SIDE_A, 1), farmerSprite(BODY_SIDE, LEGS_SIDE_B, 2)],
}

function tilePut(ctx: Ctx, sx: number, sy: number): Put {
  return (x, y, color) => {
    if (x < 0 || x >= TILE_PX || y < 0 || y >= TILE_PX) return
    px(ctx, sx + x, sy + y, color)
  }
}

function column(put: Put, x: number, y0: number, y1: number, color: string): void {
  for (let y = y0; y <= y1; y++) put(x, y, color)
}

/**
 * The tool in the farmer's hand. `ax` is the hand column and `dir` points away from the
 * body, so one silhouette serves both sides. The farmer is ten pixels wide, which leaves
 * the tool exactly three columns clear of the hat brim. Every tool reads differently:
 * hoe blade low, axe head high, can spouting, sack bulging, and so on.
 */
function heldTool(put: Put, tool: ToolId, ax: number, dir: number, bob: number): void {
  const c = (i: number): number => ax + dir * i
  const y = (v: number): number => v + bob
  switch (tool) {
    case 'hoe':
      put(c(0), y(3), PAL.ink)
      put(c(1), y(3), PAL.ink)
      column(put, c(0), y(4), y(12), WOOD_LIT)
      column(put, c(1), y(4), y(12), WOOD)
      put(c(0), y(13), METAL_LIT)
      put(c(1), y(13), METAL)
      put(c(2), y(13), METAL)
      put(c(0), y(14), METAL_DARK)
      put(c(1), y(14), PAL.ink)
      put(c(2), y(14), PAL.ink)
      break
    case 'axe':
      put(c(0), y(2), PAL.ink)
      put(c(1), y(2), PAL.ink)
      put(c(2), y(2), PAL.ink)
      put(c(0), y(3), METAL)
      put(c(1), y(3), METAL_LIT)
      put(c(2), y(3), METAL_LIT)
      put(c(0), y(4), METAL)
      put(c(1), y(4), METAL)
      put(c(2), y(4), METAL_DARK)
      column(put, c(0), y(5), y(14), WOOD_LIT)
      column(put, c(1), y(5), y(14), WOOD)
      break
    case 'can':
      put(c(2), y(7), METAL_LIT)
      put(c(2), y(8), METAL)
      put(c(0), y(8), METAL)
      put(c(1), y(8), METAL_LIT)
      column(put, c(0), y(9), y(13), METAL_LIT)
      column(put, c(1), y(9), y(13), METAL)
      put(c(0), y(14), PAL.ink)
      put(c(1), y(14), PAL.ink)
      put(c(2), y(10), PAL.sky)
      put(c(2), y(12), PAL.sky)
      break
    case 'seeds':
      put(c(0), y(8), PAL.ink)
      put(c(1), y(8), PAL.ink)
      put(c(2), y(8), PAL.ink)
      column(put, c(0), y(9), y(13), PAL.cream)
      column(put, c(1), y(9), y(13), PAL.parchment)
      column(put, c(2), y(9), y(13), PAL.parchment)
      put(c(0), y(10), tone(PAL.soil, 0.3))
      put(c(1), y(10), tone(PAL.soil, 0.3))
      put(c(2), y(10), tone(PAL.soil, 0.3))
      put(c(1), y(12), PAL.leaf)
      break
    case 'hand':
      put(c(0), y(8), SKIN)
      put(c(2), y(8), SKIN)
      put(c(0), y(9), SKIN)
      put(c(1), y(9), SKIN_DARK)
      put(c(2), y(9), SKIN)
      put(c(0), y(10), SKIN_LIT)
      put(c(1), y(10), SKIN)
      put(c(2), y(10), SKIN)
      put(c(0), y(11), SKIN)
      put(c(1), y(11), SKIN)
      put(c(2), y(11), SKIN_DARK)
      put(c(0), y(12), PAL.ink)
      put(c(1), y(12), PAL.ink)
      put(c(2), y(12), PAL.ink)
      break
    case 'sprinkler':
      put(c(0), y(8), PAL.sky)
      put(c(2), y(8), PAL.sky)
      put(c(0), y(9), METAL)
      put(c(1), y(9), METAL_LIT)
      put(c(2), y(9), METAL)
      put(c(0), y(10), METAL)
      put(c(1), y(10), METAL)
      put(c(2), y(10), METAL_DARK)
      put(c(1), y(11), METAL)
      put(c(1), y(12), METAL_DARK)
      put(c(0), y(13), METAL)
      put(c(1), y(13), METAL)
      put(c(2), y(13), METAL_DARK)
      break
    case 'fertilizer':
      put(c(1), y(8), PAL.lantern)
      column(put, c(0), y(9), y(13), BURLAP_LIT)
      column(put, c(1), y(9), y(13), BURLAP)
      column(put, c(2), y(9), y(13), BURLAP)
      put(c(1), y(11), BURLAP_DARK)
      put(c(2), y(12), BURLAP_DARK)
      put(c(0), y(14), PAL.ink)
      put(c(1), y(14), PAL.ink)
      put(c(2), y(14), PAL.ink)
      break
  }
}

export function drawFarmer(
  ctx: Ctx,
  facing: Facing,
  sx: number,
  sy: number,
  walkFrame: number,
  tool: ToolId,
): void {
  const step = ((Math.round(walkFrame) % 2) + 2) % 2
  const flip = facing === 'left'
  const sheet = facing === 'up' ? 'up' : facing === 'down' ? 'down' : 'side'
  const put = tilePut(ctx, sx, sy)
  // Facing away, the tool hangs behind the farmer.
  const behind = facing === 'up'
  const nearSide = facing === 'left' || facing === 'up'
  const ax = nearSide ? 2 : 13
  const dir = nearSide ? -1 : 1
  if (behind) heldTool(put, tool, ax, dir, step)
  drawSprite(ctx, FARMER[sheet][step], sx, sy, flip)
  if (!behind) heldTool(put, tool, ax, dir, step)
}

/**
 * Belt icons. `.` transparent; o ink, w/W wood, m/M/d metal, p/P paper,
 * g/G leaf, a water, U/n/N burlap, y lantern.
 */
const ICON_PALETTE: Record<string, string> = {
  o: PAL.ink,
  w: WOOD,
  W: WOOD_LIT,
  m: METAL,
  M: METAL_LIT,
  d: METAL_DARK,
  p: PAL.parchment,
  P: PAL.cream,
  k: SKIN_DARK,
  g: PAL.leaf,
  G: PAL.grassLit,
  a: PAL.sky,
  U: BURLAP_LIT,
  n: BURLAP,
  N: BURLAP_DARK,
  y: PAL.lantern,
}

const ICON_ROWS: Record<ToolId, string[]> = {
  hoe: [
    '........oo..',
    '.......oWWo.',
    '......oWWo..',
    '.....oWWo...',
    '....oWWo....',
    '...oWWo.....',
    '..oWWo......',
    '.oWwo.......',
    '.oMmo.......',
    'oMmmmo......',
    'odddo.......',
    '.ooo........',
  ],
  can: [
    '............',
    '......oo....',
    '....ooMMo...',
    '..ooMoooMo..',
    '.omMMMMMMo..',
    'omMMMMMMMo..',
    '.odmmmmmMo..',
    'a.omMMMMMo..',
    '...ommmmmo..',
    'a..odmmmmo..',
    '...ooooooo..',
    '............',
  ],
  seeds: [
    '............',
    '..oooooooo..',
    '..oPPPPPPo..',
    '..oPppppPo..',
    '..oNNNNNNo..',
    '..oppppppo..',
    '..oppGpppo..',
    '..opgGgppo..',
    '..oppGpppo..',
    '..opNppNpo..',
    '..oooooooo..',
    '............',
  ],
  hand: [
    '............',
    '............',
    '..oPoPoPoPo.',
    '..opopopopo.',
    '..opppppppo.',
    '..opppppppo.',
    'okkpppppppo.',
    '.okpppppppo.',
    '..opppppppo.',
    '..opppppppo.',
    '..ooooooooo.',
    '............',
  ],
  axe: [
    '.......oo...',
    '......oMMoo.',
    '.....oMMMMdo',
    '....ooMMMMdo',
    '...oWWoMMMdo',
    '..oWWo.oMdo.',
    '..oWWo.ooo..',
    '.oWWo.......',
    '.oWWo.......',
    'oWWo........',
    'oWWo........',
    '.oo.........',
  ],
  sprinkler: [
    '............',
    '.....oo.....',
    '....oMMo....',
    'a..oMMMMo..a',
    '..oMMMMMMo..',
    '..odmmmmdo..',
    'a...oMMo...a',
    '....ommo....',
    '...oMMMMo...',
    '..oMMMMMMo..',
    '..ommmmmmo..',
    '..oooooooo..',
  ],
  fertilizer: [
    '............',
    '....oUUo....',
    '...oyyyyo...',
    '..oUUnnnUo..',
    '.oUUnnnnnUo.',
    '.oUnnnnnnno.',
    'oUUnnnnnnnno',
    'oUnnNnnnNnno',
    'oUnnnnnnnnno',
    '.onnnnnnnno.',
    '.oooooooooo.',
    '............',
  ],
}

const ICONS: Record<ToolId, Sprite> = {
  hoe: makeSprite(ICON_ROWS.hoe, ICON_PALETTE),
  can: makeSprite(ICON_ROWS.can, ICON_PALETTE),
  seeds: makeSprite(ICON_ROWS.seeds, ICON_PALETTE),
  hand: makeSprite(ICON_ROWS.hand, ICON_PALETTE),
  axe: makeSprite(ICON_ROWS.axe, ICON_PALETTE),
  sprinkler: makeSprite(ICON_ROWS.sprinkler, ICON_PALETTE),
  fertilizer: makeSprite(ICON_ROWS.fertilizer, ICON_PALETTE),
}

/** 12x12, anchored at the top-left. */
export function drawToolIcon(ctx: Ctx, tool: ToolId, sx: number, sy: number): void {
  drawSprite(ctx, ICONS[tool], sx, sy)
}

/** The same objects as loose stock, seated on a 1px contact shadow. 12x12. */
export function drawGoodIcon(ctx: Ctx, good: GoodId, sx: number, sy: number): void {
  if (good === 'sprinkler') {
    drawSprite(ctx, ICONS.sprinkler, sx, sy - 1)
    for (let x = 3; x <= 8; x++) px(ctx, sx + x, sy + 11, PAL.ink)
    return
  }
  drawSprite(ctx, ICONS.fertilizer, sx, sy - 1)
  for (let x = 2; x <= 9; x++) px(ctx, sx + x, sy + 10, PAL.ink)
}
