/**
 * The inside of a building, drawn native at 32 px per tile.
 *
 * `docs/INTERIORS.md` is the contract; this file is only its pixels. Three rules, the
 * same three that govern every other art module:
 *
 * **A room is a place.** Floors are materials, not fills: straw is scattered and drifts
 * against the walls, plank floors have boards that run and joins that do not line up,
 * stone is coursed, mine rock is hewn. The back wall carries what the building is —
 * a window, a tool rack, a hayloft hatch, a seam of ore.
 *
 * **Light falls from the upper left, always.** The left and back walls are lit, the right
 * wall is in shadow, and every piece of furniture carries the five-tone ramp of
 * `docs/GRAPHICS.md` section 5 with its shadow cast down and right. No blur, ever.
 *
 * **Motion is on the beat and never carries state.** A hanging lamp swings, straw drifts,
 * the mine's crystals glint — all on `beatOf`, all frozen under reduced motion. What a
 * station *is* — a full trough, a ready nest, a working bench — is drawn statically,
 * because that is information rather than decoration.
 */
import type { FloorId, Interior, Station, WallId } from '../game/interiors'
import type { Animal, SpeciesDef } from '../game/farm-types'
import type { Facing, ToolId } from '../game/types'
import { FARM_H, FARM_W, TILE, WORLD_Y } from '../game/constants'
import { PAL, ramp, withAlpha } from '../engine/palette'
import { dither, ellipse, hline, outline, px, rect, shadeRect, vline } from '../engine/pixel'
import { artNoise, beatOf, mixHex, prefersReducedMotion } from './tiles'
import { drawFarmerPose } from './actors'
import { drawAnimal } from './livestock'

type Ctx = CanvasRenderingContext2D

/* ------------------------------------------------------------------ materials */

const STRAW = mixHex(PAL.lantern, PAL.parchment, 0.5)
const STRAW_DARK = mixHex(STRAW, PAL.bark, 0.4)
const PLANK = PAL.bark
const PLASTER = mixHex(PAL.parchment, PAL.dusk, 0.22)
const STONE = mixHex(PAL.dusk, PAL.cream, 0.3)
const BRICK = mixHex(PAL.berry, PAL.bark, 0.5)
const IRON = mixHex(PAL.dusk, PAL.cream, 0.38)
const GLASS = mixHex(PAL.sky, PAL.cream, 0.35)
const ROCK = mixHex(PAL.dusk, PAL.ink, 0.35)
const TILE_COLD = mixHex(PAL.sky, PAL.cream, 0.55)
const WATER = mixHex(PAL.sky, PAL.leaf, 0.4)

/** The dark beyond the room. A room is an island in the band, not a full-bleed fill. */
const VOID = mixHex(PAL.ink, PAL.shadow, 0.35)

const FLOOR_BASE: Record<FloorId, string> = {
  plank: PLANK,
  straw: STRAW,
  stone: STONE,
  dirt: PAL.soil,
  tile: TILE_COLD,
  water: WATER,
  soil: PAL.soilWet,
  rock: ROCK,
}

const WALL_BASE: Record<WallId, string> = {
  plank: PLANK,
  plaster: PLASTER,
  stone: STONE,
  brick: BRICK,
  log: mixHex(PAL.bark, PAL.leaf, 0.2),
  glass: GLASS,
  rock: ROCK,
  metal: IRON,
}

/** Deterministic 0..1 for a cell, so a room looks the same every frame and every run. */
function grain(x: number, y: number, salt: number): number {
  return artNoise((x + 1) * 73 + (y + 1) * 131, salt)
}

/* --------------------------------------------------------------------- floors */

/**
 * One floor tile. `x` and `y` are pixels, not cells — the caller has already placed the
 * room in the band, so this never needs to know where the room is.
 */
function drawFloorTile(ctx: Ctx, floor: FloorId, x: number, y: number, cx: number, cy: number): void {
  const base = FLOOR_BASE[floor]
  const r = ramp(base)
  rect(ctx, x, y, TILE, TILE, r.mid)

  switch (floor) {
    case 'plank': {
      // Boards run left to right, four to a tile, and the end joins step by row so the
      // floor never reads as a grid of identical squares.
      const offset = (cy & 1) === 0 ? 0 : TILE >> 1
      for (let i = 0; i < 4; i++) {
        const by = y + i * 8
        hline(ctx, x, by, TILE, r.dark)
        hline(ctx, x, by + 1, TILE, r.lit)
        const join = ((cx * 4 + i) * 11) % TILE
        vline(ctx, x + ((join + offset) % TILE), by + 2, 6, r.dark)
      }
      break
    }

    case 'straw': {
      // Loose straw scattered over boards. The boards are laid first and are meant to
      // show through: a floor of nothing but straw at full brightness is a wash, not a
      // material, and it takes the whole room's contrast with it.
      const board = ramp(PLANK)
      rect(ctx, x, y, TILE, TILE, board.dark)
      for (let i = 0; i < 4; i++) {
        hline(ctx, x, y + i * 8, TILE, board.ink)
        hline(ctx, x, y + i * 8 + 1, TILE, board.mid)
      }
      // Then the straw itself, thinning where the floor is walked. Scattered strands and
      // a few loose drifts — never a full-tile dither, which at this density reads as a
      // chequer and swallows everything standing on it.
      const worn = grain(cx, cy, 1279) > 0.55
      if (!worn) {
        // Drifts of trodden straw. Dithered rather than solid, so they lie *on* the
        // boards instead of reading as slabs floating above them.
        for (let i = 0; i < 3; i++) {
          const dx0 = Math.floor(grain(cx + i, cy, 1301) * (TILE - 12))
          const dy0 = Math.floor(grain(i, cx - cy, 1327) * (TILE - 8))
          const dw = 10 + (i & 1) * 3
          dither(ctx, x + dx0, y + dy0, dw, 5, r.dark, i, 1)
          dither(ctx, x + dx0 + 2, y + dy0 + 1, dw - 4, 3, r.mid, i + 1, 1)
        }
      }
      for (let i = 0; i < (worn ? 8 : 16); i++) {
        const g = grain(cx * 32 + i, cy, 811)
        const sx = x + Math.floor(g * (TILE - 6))
        const sy = y + Math.floor(grain(i, cx * 32 + cy, 913) * (TILE - 2))
        const len = 3 + Math.floor(grain(i, cy, 1031) * 4)
        const tone = g > 0.78 ? r.spec : g > 0.36 ? r.mid : STRAW_DARK
        if (grain(i, cx + cy, 1187) > 0.5) hline(ctx, sx, sy, len, tone)
        else vline(ctx, sx, sy, Math.max(2, len - 1), tone)
      }
      break
    }

    case 'stone': {
      // Coursed flags, offset row to row, each with a lit top edge.
      const offset = (cy & 1) === 0 ? 0 : 8
      for (let ry = 0; ry < TILE; ry += 8) {
        for (let rx = -8; rx < TILE; rx += 16) {
          const fx = x + rx + offset
          rect(ctx, fx + 1, y + ry + 1, 14, 6, grain(cx + rx, cy + ry, 401) > 0.5 ? r.mid : r.lit)
          hline(ctx, fx + 1, y + ry, 15, r.dark)
          vline(ctx, fx, y + ry, 8, r.dark)
        }
      }
      break
    }

    case 'dirt': {
      dither(ctx, x, y, TILE, TILE, r.dark, cx + cy)
      for (let i = 0; i < 8; i++) {
        const g = grain(cx * 16 + i, cy, 577)
        px(ctx, x + Math.floor(g * TILE), y + Math.floor(grain(i, cy, 641) * TILE), r.lit)
      }
      break
    }

    case 'tile': {
      // A baker's floor: chequered, but two neighbouring tones rather than the ends of
      // the ramp — a full-contrast chequer reads as a chessboard and pulls the eye off
      // everything standing on it.
      const pale = r.lit
      const dark = mixHex(r.mid, r.dark, 0.5)
      for (let ry = 0; ry < TILE; ry += 16) {
        for (let rx = 0; rx < TILE; rx += 16) {
          const odd = (((rx >> 4) + (ry >> 4) + cx + cy) & 1) === 0
          rect(ctx, x + rx, y + ry, 16, 16, odd ? dark : pale)
          hline(ctx, x + rx, y + ry, 16, withAlpha(r.ink, 0.35))
          vline(ctx, x + rx, y + ry, 16, withAlpha(r.ink, 0.35))
          // One scuff per tile, so a worked floor is not a printed pattern.
          if (grain(cx + rx, cy + ry, 967) > 0.7) {
            hline(ctx, x + rx + 4, y + ry + 9, 7, withAlpha(r.dark, 0.5))
          }
        }
      }
      break
    }

    case 'water': {
      rect(ctx, x, y, TILE, TILE, r.mid)
      dither(ctx, x, y, TILE, TILE, r.dark, cx + cy, 2)
      // Two still bands of surface light, placed by grain rather than by animation, so a
      // stocked pond reads as water without anything moving in a room you stand in.
      hline(ctx, x + 4, y + 8 + Math.floor(grain(cx, cy, 233) * 6), 12, withAlpha(r.spec, 0.7))
      hline(ctx, x + 14, y + 20 + Math.floor(grain(cy, cx, 307) * 6), 10, withAlpha(r.lit, 0.6))
      break
    }

    case 'soil': {
      rect(ctx, x, y, TILE, TILE, r.mid)
      // Furrows, because a greenhouse floor is worked ground.
      for (let ry = 2; ry < TILE; ry += 6) {
        hline(ctx, x, y + ry, TILE, r.dark)
        hline(ctx, x, y + ry + 1, TILE, r.lit)
      }
      break
    }

    case 'rock': {
      rect(ctx, x, y, TILE, TILE, r.mid)
      dither(ctx, x, y, TILE, TILE, r.dark, cx * 3 + cy, 2)
      for (let i = 0; i < 5; i++) {
        const g = grain(cx * 8 + i, cy, 719)
        const sx = x + Math.floor(g * (TILE - 8))
        const sy = y + Math.floor(grain(i, cx - cy, 743) * (TILE - 6))
        outline(ctx, sx, sy, 6 + Math.floor(g * 4), 5, r.ink)
        rect(ctx, sx + 1, sy + 1, 4 + Math.floor(g * 4), 3, r.lit)
      }
      break
    }
  }
}

/* ---------------------------------------------------------------------- walls */

type WallEdge = 'back' | 'left' | 'right' | 'front' | 'corner'

/**
 * One wall tile. The back wall is the tall one and carries the room's character; the side
 * walls are read as thickness and are lit on the left, shadowed on the right.
 */
function drawWallTile(
  ctx: Ctx,
  wall: WallId,
  edge: WallEdge,
  x: number,
  y: number,
  cx: number,
  cy: number,
): void {
  const base = WALL_BASE[wall]
  const r = ramp(base)

  // Away from the light on the right, into it on the left — but a half-step each way,
  // not the ends of the ramp. Two walls of the same room at `dark` and `lit` read as two
  // different materials, and the shadowed one reads as a hole rather than a wall.
  const body =
    edge === 'right'
      ? mixHex(r.mid, r.dark, 0.55)
      : edge === 'left'
        ? mixHex(r.mid, r.lit, 0.5)
        : r.mid
  rect(ctx, x, y, TILE, TILE, body)

  switch (wall) {
    case 'plank':
    case 'log': {
      // Vertical boarding, with a rail across the back wall at head height.
      for (let bx = 0; bx < TILE; bx += 6) {
        vline(ctx, x + bx, y, TILE, r.dark)
        vline(ctx, x + bx + 1, y, TILE, edge === 'right' ? r.mid : r.spec)
      }
      if (edge === 'back') {
        rect(ctx, x, y + TILE - 12, TILE, 3, r.dark)
        hline(ctx, x, y + TILE - 12, TILE, r.spec)
      }
      break
    }

    case 'plaster': {
      dither(ctx, x, y, TILE, TILE, withAlpha(r.lit, 0.4), cx + cy, 2)
      if (edge === 'back') {
        // A picture rail and the skirting, so a room reads as a home.
        rect(ctx, x, y + 6, TILE, 2, r.dark)
        rect(ctx, x, y + TILE - 5, TILE, 5, ramp(PLANK).mid)
        hline(ctx, x, y + TILE - 5, TILE, ramp(PLANK).lit)
      }
      break
    }

    case 'stone':
    case 'rock': {
      const offset = (cy & 1) === 0 ? 0 : 8
      for (let ry = 0; ry < TILE; ry += 8) {
        for (let rx = -8; rx < TILE; rx += 16) {
          const fx = x + rx + offset
          rect(ctx, fx + 1, y + ry + 1, 14, 6, grain(cx + rx, cy + ry, 463) > 0.5 ? body : r.lit)
          hline(ctx, fx + 1, y + ry, 15, r.ink)
          vline(ctx, fx, y + ry, 8, r.ink)
        }
      }
      break
    }

    case 'brick': {
      const offset = (cy & 1) === 0 ? 0 : 6
      for (let ry = 0; ry < TILE; ry += 6) {
        hline(ctx, x, y + ry, TILE, r.ink)
        for (let rx = -12; rx < TILE; rx += 12) {
          vline(ctx, x + rx + offset, y + ry, 6, r.ink)
        }
      }
      break
    }

    case 'glass': {
      // Glazing bars, and one diagonal highlight per pane. A greenhouse is mostly sky.
      rect(ctx, x, y, TILE, TILE, withAlpha(r.spec, 0.55))
      for (let bx = 0; bx < TILE; bx += 16) {
        vline(ctx, x + bx, y, TILE, ramp(IRON).dark)
        for (let i = 0; i < 10; i++) {
          px(ctx, x + bx + 3 + i, y + 20 - i, withAlpha(PAL.cream, 0.5))
        }
      }
      hline(ctx, x, y + 16, TILE, ramp(IRON).dark)
      break
    }

    case 'metal': {
      // Corrugation. Two tones, and a bolt line down the back wall's seams.
      for (let bx = 0; bx < TILE; bx += 4) {
        vline(ctx, x + bx, y, TILE, r.dark)
        vline(ctx, x + bx + 1, y, TILE, r.spec)
      }
      if (edge === 'back') {
        for (let by = 4; by < TILE; by += 10) px(ctx, x + 2, y + by, r.ink)
      }
      break
    }
  }

  // Every wall gets one hard inner edge so the room has a lip, per DESIGN section 6.
  if (edge === 'back') hline(ctx, x, y + TILE - 1, TILE, r.ink)
  if (edge === 'front') hline(ctx, x, y, TILE, r.ink)
  if (edge === 'left') vline(ctx, x + TILE - 1, y, TILE, r.ink)
  if (edge === 'right') vline(ctx, x, y, TILE, r.ink)
}

/** The gap in the front wall, drawn as a lit threshold with the outside showing through. */
function drawDoorway(ctx: Ctx, wall: WallId, x: number, y: number): void {
  const r = ramp(WALL_BASE[wall])
  rect(ctx, x, y, TILE, TILE, VOID)
  // The jambs, and the daylight falling in across the threshold.
  rect(ctx, x, y, 4, TILE, r.dark)
  rect(ctx, x + TILE - 4, y, 4, TILE, r.dark)
  vline(ctx, x + 4, y, TILE, r.ink)
  vline(ctx, x + TILE - 5, y, TILE, r.ink)
  rect(ctx, x + 5, y, TILE - 10, 6, withAlpha(PAL.lantern, 0.35))
  hline(ctx, x + 5, y, TILE - 10, withAlpha(PAL.cream, 0.5))
}

/* ------------------------------------------------------------------- stations */

/** How full or busy a station is, so the art can carry state without a label. */
export interface StationState {
  /** A pen with somebody in it, a bench with a job, a counter with stock. */
  occupied: boolean
  /** Something is waiting to be taken: an egg in the nest, output on the bench. */
  ready: boolean
  /** The occupant has not eaten, or the trough is empty. */
  wanting: boolean
  /**
   * Who is standing in this pen, drawn with the farm's own livestock art so a cow inside
   * the barn is the same cow that grazes outside it. Null leaves the pen empty, which is
   * how an unfilled place reads.
   */
  occupant?: { species: SpeciesDef; animal: Animal } | null
}

const IDLE: StationState = { occupied: false, ready: false, wanting: false }

/**
 * One station, drawn into the tile at `x,y`. Furniture wider than a tile is drawn once,
 * from its top-left, across its whole size — the caller does not tile it.
 */
function drawStation(
  ctx: Ctx,
  station: Station,
  x: number,
  y: number,
  frame: number,
  state: StationState = IDLE,
): void {
  const w = station.w * TILE
  const h = station.h * TILE
  const beat = beatOf(frame)
  const still = prefersReducedMotion()

  // Every piece of furniture casts the same hard two-pixel shadow, down and right.
  rect(ctx, x + 2, y + h - 2, w, 2, withAlpha(PAL.ink, 0.45))
  rect(ctx, x + w - 2, y + 2, 2, h - 2, withAlpha(PAL.ink, 0.45))

  switch (station.kind) {
    case 'exit':
      return

    case 'pen':
      drawPen(ctx, x, y, frame, beat, still, state)
      return

    case 'trough':
      drawTrough(ctx, x, y, state)
      return

    case 'nest':
      drawNest(ctx, x, y, state)
      return

    case 'hayloft':
      drawHay(ctx, x, y, w, h)
      return

    case 'bench':
      drawBench(ctx, x, y, beat, still, state)
      return

    case 'counter':
      drawCounter(ctx, x, y, state)
      return

    case 'ledger':
      drawLedger(ctx, x, y)
      return

    case 'bed':
      drawBed(ctx, x, y, w, h)
      return

    case 'chest':
    case 'crate':
      drawChest(ctx, x, y, station.kind === 'chest')
      return

    case 'shelf':
      drawShelf(ctx, x, y, w)
      return

    case 'basin':
      drawBasin(ctx, x, y, beat, still)
      return

    case 'plot':
      drawPlot(ctx, x, y, w, h)
      return
  }
}

/* --- the individual pieces ------------------------------------------------- */

/**
 * A stall, and whoever is standing in it.
 *
 * The pen itself is deliberately low and set back — a rail behind and a bed of straw
 * underfoot — because the occupant is the thing the player came in to look at, and a
 * fence drawn in front of a chicken hides the chicken.
 */
function drawPen(
  ctx: Ctx,
  x: number,
  y: number,
  frame: number,
  beat: number,
  still: boolean,
  s: StationState,
): void {
  const wood = ramp(PLANK)
  const straw = ramp(STRAW)

  // The rail across the back, at the top of the tile, and one post each side of it.
  rect(ctx, x + 2, y + 3, 4, 13, wood.mid)
  rect(ctx, x + TILE - 6, y + 3, 4, 13, wood.dark)
  rect(ctx, x + 5, y + 5, TILE - 10, 3, wood.lit)
  hline(ctx, x + 5, y + 5, TILE - 10, wood.spec)
  rect(ctx, x + 5, y + 11, TILE - 10, 3, wood.mid)

  // The bed of straw the occupant stands on, banked deeper at the back. Kept a shade
  // under the occupant: a bright slab under a chicken reads as the slab, not the chicken.
  rect(ctx, x + 2, y + 16, TILE - 4, 13, mixHex(straw.dark, PAL.ink, 0.35))
  dither(ctx, x + 3, y + 17, TILE - 6, 11, straw.dark, 0)
  dither(ctx, x + 5, y + 19, TILE - 10, 7, straw.mid, 1)
  hline(ctx, x + 4, y + 16, TILE - 8, straw.dark)

  // The name plate on the front rail. An empty pen gets a bare one, which is what makes
  // an unfilled coop read as four places waiting rather than as nothing at all.
  rect(ctx, x + 10, y + 28, 12, 4, s.occupied ? ramp(PAL.parchment).lit : wood.dark)
  outline(ctx, x + 10, y + 28, 12, 4, PAL.ink)

  const who = s.occupant
  if (who !== undefined && who !== null) {
    // The farm's own livestock art, so a cow in the barn is the cow from the meadow.
    drawAnimal(ctx, who.species, who.animal, x + (TILE >> 1), y + 26, frame)
  }

  if (s.ready) {
    // The thing waiting to be taken, sitting in the straw at the occupant's feet.
    ellipse(ctx, x + 7, y + 25, 4, 3, PAL.ink)
    ellipse(ctx, x + 7, y + 25, 3, 2, PAL.cream)
    px(ctx, x + 6, y + 24, PAL.parchment)
  }
  if (s.wanting) {
    // An empty bowl, tipped, so hunger is legible from across the room.
    const b = ramp(IRON)
    ellipse(ctx, x + 25, y + 27, 4, 2, b.dark)
    hline(ctx, x + 22, y + 26, 7, b.spec)
  }
  if (!still && !s.occupied) {
    // An empty pen gets the room's one idle flicker: a straw settling.
    const lift = (beat & 3) === 0 ? 1 : 0
    hline(ctx, x + 12, y + 16 - lift, 5, straw.spec)
  }
}

/** A long feed trough on legs, full or scraped bare. */
function drawTrough(ctx: Ctx, x: number, y: number, s: StationState): void {
  const wood = ramp(PLANK)
  const feed = ramp(mixHex(PAL.lantern, PAL.bark, 0.35))

  shadeRect(ctx, x + 2, y + 12, TILE - 4, 14, wood)
  rect(ctx, x + 5, y + 26, 4, 5, wood.dark)
  rect(ctx, x + TILE - 9, y + 26, 4, 5, wood.dark)

  if (!s.wanting) {
    // Heaped feed, mounded in the middle where it was poured.
    rect(ctx, x + 5, y + 16, TILE - 10, 7, feed.mid)
    hline(ctx, x + 7, y + 15, TILE - 14, feed.lit)
    hline(ctx, x + 11, y + 14, TILE - 22, feed.spec)
    dither(ctx, x + 5, y + 16, TILE - 10, 7, feed.dark, 1)
  } else {
    rect(ctx, x + 5, y + 18, TILE - 10, 5, wood.ink)
  }
}

/** A nest box: a hooded shelf with straw and, when there is something, an egg in it. */
function drawNest(ctx: Ctx, x: number, y: number, s: StationState): void {
  const wood = ramp(PLANK)
  const straw = ramp(STRAW)

  shadeRect(ctx, x + 3, y + 8, TILE - 6, 22, wood)
  // The hood, cast forward and shading the opening.
  rect(ctx, x + 1, y + 6, TILE - 2, 4, wood.lit)
  hline(ctx, x + 1, y + 6, TILE - 2, wood.spec)
  rect(ctx, x + 6, y + 14, TILE - 12, 12, wood.ink)
  rect(ctx, x + 7, y + 20, TILE - 14, 6, straw.mid)
  dither(ctx, x + 7, y + 20, TILE - 14, 6, straw.lit, 0)

  if (s.ready) {
    ellipse(ctx, x + 13, y + 22, 3, 4, PAL.ink)
    ellipse(ctx, x + 13, y + 22, 2, 3, PAL.cream)
    ellipse(ctx, x + 19, y + 23, 3, 3, PAL.ink)
    ellipse(ctx, x + 19, y + 23, 2, 2, PAL.parchment)
  }
}

/** Bales, stacked and banded, filling whatever the station's footprint is. */
function drawHay(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const straw = ramp(STRAW)
  const cord = ramp(mixHex(PAL.bark, PAL.ink, 0.2))

  for (let by = h - 16; by >= 0; by -= 16) {
    for (let bx = 0; bx + 20 <= w; bx += 20) {
      const ox = x + bx + ((by / 16) & 1 ? 4 : 0)
      if (ox + 20 > x + w) continue
      shadeRect(ctx, ox, y + by, 20, 16, straw)
      // Two bands, and the cut ends showing along the top.
      vline(ctx, ox + 6, y + by, 16, cord.mid)
      vline(ctx, ox + 13, y + by, 16, cord.mid)
      for (let i = 2; i < 18; i += 3) px(ctx, ox + i, y + by + 1, straw.spec)
    }
  }
}

/** A workbench: a top, a vice, a rack of tools, and the job on it when there is one. */
function drawBench(ctx: Ctx, x: number, y: number, beat: number, still: boolean, s: StationState): void {
  const wood = ramp(PLANK)
  const iron = ramp(IRON)

  // The rack against the wall, then the bench top in front of it.
  rect(ctx, x + 3, y + 2, TILE - 6, 10, wood.dark)
  hline(ctx, x + 3, y + 2, TILE - 6, wood.lit)
  for (let i = 0; i < 4; i++) {
    vline(ctx, x + 6 + i * 6, y + 3, 7, i % 2 === 0 ? iron.spec : wood.mid)
    px(ctx, x + 6 + i * 6, y + 10, iron.ink)
  }

  shadeRect(ctx, x + 1, y + 14, TILE - 2, 8, wood)
  rect(ctx, x + 4, y + 22, 4, 9, wood.dark)
  rect(ctx, x + TILE - 8, y + 22, 4, 9, wood.dark)

  // The vice, always, so an idle bench is still a bench.
  shadeRect(ctx, x + TILE - 12, y + 10, 9, 6, iron)

  if (s.occupied) {
    // Stock clamped in it, and a shaving curling off when something is being worked.
    rect(ctx, x + 8, y + 10, 12, 5, ramp(PAL.parchment).mid)
    outline(ctx, x + 8, y + 10, 12, 5, PAL.ink)
    if (!still) {
      const k = beat & 3
      px(ctx, x + 20 + k, y + 9 - (k & 1), PAL.parchment)
    }
  }
  if (s.ready) {
    // The finished thing, sitting on the near edge under a struck highlight.
    ellipse(ctx, x + 22, y + 18, 5, 4, PAL.ink)
    ellipse(ctx, x + 22, y + 18, 4, 3, PAL.lantern)
    px(ctx, x + 20, y + 16, PAL.cream)
  }
}

/** A market counter with a scale on it and produce stacked when the slot is stocked. */
function drawCounter(ctx: Ctx, x: number, y: number, s: StationState): void {
  const wood = ramp(PLANK)
  const iron = ramp(IRON)

  shadeRect(ctx, x + 1, y + 12, TILE - 2, 10, wood)
  rect(ctx, x + 3, y + 22, TILE - 6, 9, wood.dark)
  // The board front, where the price is chalked.
  rect(ctx, x + 5, y + 24, TILE - 10, 5, ramp(PAL.ink).lit)

  // The scale: a post, a beam and two pans. Always there, stocked or not.
  vline(ctx, x + 8, y + 4, 8, iron.mid)
  hline(ctx, x + 4, y + 4, 9, iron.spec)
  ellipse(ctx, x + 4, y + 7, 3, 2, iron.dark)
  ellipse(ctx, x + 12, y + 7, 3, 2, iron.dark)

  if (s.occupied) {
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, x + 19 + i * 4, y + 9 - (i & 1) * 2, 3, 3, PAL.ink)
      ellipse(ctx, x + 19 + i * 4, y + 9 - (i & 1) * 2, 2, 2, i === 1 ? PAL.berry : PAL.grassLit)
    }
  }
}

/** A standing desk with the order book open on it and a quill in the well. */
function drawLedger(ctx: Ctx, x: number, y: number): void {
  const wood = ramp(PLANK)
  shadeRect(ctx, x + 2, y + 10, TILE - 4, 8, wood)
  rect(ctx, x + 5, y + 18, 4, 13, wood.dark)
  rect(ctx, x + TILE - 9, y + 18, 4, 13, wood.dark)

  // The book: two leaves with a gutter, ruled.
  const paper = ramp(PAL.parchment)
  rect(ctx, x + 4, y + 4, 12, 8, paper.lit)
  rect(ctx, x + 17, y + 4, 12, 8, paper.mid)
  outline(ctx, x + 4, y + 4, 25, 8, PAL.ink)
  vline(ctx, x + 16, y + 4, 8, PAL.ink)
  for (let i = 6; i < 12; i += 2) {
    hline(ctx, x + 6, y + i, 8, withAlpha(PAL.ink, 0.4))
    hline(ctx, x + 19, y + i, 8, withAlpha(PAL.ink, 0.4))
  }
  // The quill, standing.
  vline(ctx, x + 27, y + 1, 5, PAL.cream)
  px(ctx, x + 27, y + 6, PAL.ink)
}

/** A bed: frame, mattress, a folded quilt at the foot and a pillow at the head. */
function drawBed(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const wood = ramp(PLANK)
  const cloth = ramp(mixHex(PAL.berry, PAL.parchment, 0.35))

  // The headboard is at the top, because the light is, and the foot comes toward us.
  shadeRect(ctx, x + 2, y + 2, w - 4, 8, wood)
  shadeRect(ctx, x + 2, y + h - 10, w - 4, 8, wood)
  rect(ctx, x + 4, y + 10, w - 8, h - 20, cloth.mid)
  hline(ctx, x + 4, y + 10, w - 8, cloth.lit)
  dither(ctx, x + 4, y + 10, w - 8, h - 20, cloth.dark, 0, 2)

  // The pillow.
  const paper = ramp(PAL.cream)
  rect(ctx, x + 7, y + 12, w - 14, 9, paper.mid)
  outline(ctx, x + 7, y + 12, w - 14, 9, PAL.ink)
  hline(ctx, x + 9, y + 13, w - 18, paper.spec)
}

/** A chest with iron straps, or a plain slatted crate. */
function drawChest(ctx: Ctx, x: number, y: number, banded: boolean): void {
  const wood = ramp(PLANK)
  const iron = ramp(IRON)

  shadeRect(ctx, x + 3, y + 12, TILE - 6, 18, wood)
  // The domed lid on a chest; a flat one on a crate.
  if (banded) {
    rect(ctx, x + 3, y + 8, TILE - 6, 6, wood.lit)
    hline(ctx, x + 5, y + 7, TILE - 10, wood.spec)
    vline(ctx, x + 8, y + 8, 22, iron.mid)
    vline(ctx, x + TILE - 9, y + 8, 22, iron.mid)
    rect(ctx, x + 14, y + 17, 5, 6, iron.spec)
    px(ctx, x + 16, y + 20, PAL.ink)
  } else {
    rect(ctx, x + 3, y + 10, TILE - 6, 4, wood.lit)
    for (let i = 6; i < TILE - 6; i += 6) vline(ctx, x + i, y + 14, 16, wood.dark)
    hline(ctx, x + 3, y + 21, TILE - 6, wood.spec)
  }
}

/** A run of shelving, filled with what a barn store holds. */
function drawShelf(ctx: Ctx, x: number, y: number, w: number): void {
  const wood = ramp(PLANK)
  for (let sy = 6; sy < TILE - 4; sy += 10) {
    rect(ctx, x + 1, y + sy, w - 2, 3, wood.mid)
    hline(ctx, x + 1, y + sy, w - 2, wood.lit)
    // Sacks and jars along it, placed by grain so the run is not a repeat.
    for (let i = 0; i + 10 < w; i += 10) {
      const g = artNoise(i + sy, 1493)
      if (g < 0.25) continue
      const jar = g > 0.6
      const cx0 = x + i + 5
      if (jar) {
        rect(ctx, cx0, y + sy - 7, 6, 7, ramp(GLASS).mid)
        outline(ctx, cx0, y + sy - 7, 6, 7, PAL.ink)
        rect(ctx, cx0 + 1, y + sy - 4, 4, 3, g > 0.8 ? PAL.berry : PAL.lantern)
      } else {
        rect(ctx, cx0, y + sy - 6, 7, 6, ramp(PAL.parchment).mid)
        outline(ctx, cx0, y + sy - 6, 7, 6, PAL.ink)
        hline(ctx, cx0 + 1, y + sy - 6, 5, PAL.cream)
      }
    }
  }
  // The uprights, last, so they read in front of the shelves.
  for (let i = 0; i < w; i += 40) vline(ctx, x + i, y + 2, TILE - 4, wood.dark)
}

/** The well head: a stone ring, a windlass and a bucket on the rope. */
function drawBasin(ctx: Ctx, x: number, y: number, beat: number, still: boolean): void {
  const stone = ramp(STONE)
  const wood = ramp(PLANK)
  const water = ramp(WATER)

  ellipse(ctx, x + 16, y + 22, 13, 8, stone.ink)
  ellipse(ctx, x + 16, y + 22, 12, 7, stone.mid)
  ellipse(ctx, x + 15, y + 21, 10, 5, stone.lit)
  ellipse(ctx, x + 16, y + 22, 8, 4, water.dark)
  ellipse(ctx, x + 15, y + 21, 6, 3, water.mid)
  // One still glint, and a second that moves only when motion is allowed.
  hline(ctx, x + 12, y + 21, 4, withAlpha(PAL.cream, 0.6))
  if (!still) hline(ctx, x + 17 + (beat & 1), y + 23, 3, withAlpha(PAL.cream, 0.4))

  // The frame and the windlass over it.
  rect(ctx, x + 4, y + 4, 3, 16, wood.dark)
  rect(ctx, x + TILE - 7, y + 4, 3, 16, wood.mid)
  rect(ctx, x + 4, y + 2, TILE - 8, 3, wood.lit)
  vline(ctx, x + 16, y + 5, 8, ramp(IRON).spec)
  rect(ctx, x + 13, y + 13, 7, 5, wood.mid)
  outline(ctx, x + 13, y + 13, 7, 5, PAL.ink)
}

/** A raised greenhouse bed with seedlings in it. */
function drawPlot(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const wood = ramp(PLANK)
  const soil = ramp(PAL.soilWet)
  const leaf = ramp(PAL.leaf)

  shadeRect(ctx, x + 1, y + 4, w - 2, h - 8, wood)
  rect(ctx, x + 4, y + 7, w - 8, h - 14, soil.mid)
  dither(ctx, x + 4, y + 7, w - 8, h - 14, soil.dark, 1)

  for (let i = 0; i * 10 + 8 < w; i++) {
    for (let j = 0; j * 12 + 10 < h; j++) {
      const sx = x + 8 + i * 10
      const sy = y + 14 + j * 12
      vline(ctx, sx, sy - 5, 6, leaf.mid)
      hline(ctx, sx - 3, sy - 5, 3, leaf.lit)
      hline(ctx, sx + 1, sy - 3, 3, leaf.spec)
    }
  }
}

/* ---------------------------------------------------------------- the room */

/** Where a room sits inside the world band: centred on the tile grid, never half a tile. */
export function roomOrigin(interior: Interior): { x: number; y: number } {
  const w = interior.room.w * TILE
  const h = interior.room.h * TILE
  return {
    x: Math.floor((FARM_W * TILE - w) / 2 / TILE) * TILE,
    y: WORLD_Y + Math.floor((FARM_H * TILE - h) / 2 / TILE) * TILE,
  }
}

/** The farmer, as the room needs to know them. Null draws an empty room. */
interface RoomOccupant {
  /** Room coordinates, fractional while a step is tweening. */
  x: number
  y: number
  facing: Facing
  tool: ToolId
  /** Non-null while walking, so the walk cycle runs; null stands still. */
  walkFrame: number | null
}

/**
 * A whole room: floor, walls, the doorway, the lamp and its pool, then the furniture and
 * the farmer interleaved in row order so depth reads correctly.
 *
 * The scene and the screenshot renderer both call this, which is the only reason the
 * shots in `docs/shots/` are of the real game rather than of a second drawing of it.
 */
export function drawRoom(
  ctx: Ctx,
  interior: Interior,
  frame: number,
  stateOf: (station: Station) => StationState,
  occupant: RoomOccupant | null,
): void {
  const room = interior.room
  const origin = roomOrigin(interior)

  // Outside the room is dark. A room is a place you are in, not a fill of the band.
  rect(ctx, 0, WORLD_Y, FARM_W * TILE, FARM_H * TILE, VOID)

  for (let cy = 0; cy < room.h; cy++) {
    for (let cx = 0; cx < room.w; cx++) {
      const x = origin.x + cx * TILE
      const y = origin.y + cy * TILE

      if (cx === interior.door.x && cy === interior.door.y) {
        drawDoorway(ctx, room.wall, x, y)
        continue
      }

      const onEdge = cx === 0 || cy === 0 || cx === room.w - 1 || cy === room.h - 1
      if (!onEdge) {
        drawFloorTile(ctx, room.floor, x, y, cx, cy)
        continue
      }

      const edge: WallEdge =
        cy === 0 ? 'back' : cy === room.h - 1 ? 'front' : cx === 0 ? 'left' : 'right'
      drawWallTile(ctx, room.wall, edge, x, y, cx, cy)
    }
  }

  const lampX = origin.x + interior.door.x * TILE
  drawLamp(ctx, lampX, origin.y + TILE - 8, frame)
  // Static dither, so reduced motion keeps it: a lit room reading as lit is information.
  drawLampPool(ctx, lampX + TILE / 2, origin.y + Math.floor(room.h / 2) * TILE, 3 * TILE)

  const rows: Array<{ y: number; paint: () => void }> = []
  for (const s of interior.stations) {
    if (s.kind === 'exit') continue
    rows.push({
      y: s.y + s.h - 1,
      paint: () =>
        drawStation(ctx, s, origin.x + s.x * TILE, origin.y + s.y * TILE, frame, stateOf(s)),
    })
  }
  if (occupant !== null) {
    const who = occupant
    rows.push({
      y: Math.round(who.y),
      paint: () =>
        drawFarmerPose(
          ctx,
          who.facing,
          origin.x + who.x * TILE,
          origin.y + who.y * TILE - 8,
          who.tool,
          who.walkFrame === null
            ? { action: 'idle', frame }
            : { action: 'walk', frame: who.walkFrame },
        ),
    })
  }
  // A stable sort, so two things on one row keep the order they were added in.
  rows.sort((a, b) => a.y - b.y)
  for (const row of rows) row.paint()
}

/* ------------------------------------------------------------------- lighting */

/**
 * The one lamp a room hangs from its back wall, over the door. It is the only light
 * source inside, which is why the corners of a big room are allowed to go dark.
 */
function drawLamp(ctx: Ctx, x: number, y: number, frame: number): void {
  const iron = ramp(IRON)
  const swing = prefersReducedMotion() ? 0 : ((beatOf(frame) >> 1) & 3) === 1 ? 1 : 0
  const cx = x + 16 + swing

  // The chain it hangs on.
  vline(ctx, x + 16, y, 7, iron.dark)
  for (let i = 0; i < 7; i += 2) px(ctx, x + 17, y + i, iron.spec)

  // A conical shade, hard-edged, wide enough to read as the thing lighting the room.
  for (let i = 0; i < 6; i++) {
    const w = 6 + i * 3
    rect(ctx, cx - (w >> 1), y + 7 + i, w, 1, i < 2 ? iron.lit : i < 4 ? iron.mid : iron.dark)
  }
  hline(ctx, cx - 11, y + 13, 22, iron.ink)

  // The glass and the flame inside it.
  rect(ctx, cx - 6, y + 14, 12, 9, withAlpha(PAL.lantern, 0.55))
  outline(ctx, cx - 6, y + 14, 12, 9, iron.ink)
  ellipse(ctx, cx, y + 19, 4, 4, PAL.lantern)
  ellipse(ctx, cx - 1, y + 18, 2, 2, PAL.cream)
  hline(ctx, cx - 5, y + 23, 11, iron.mid)
}

/**
 * A soft pool of lamplight on the floor beneath it. Dithered, never blurred — the game
 * has no gradients, so falloff is two rings of dither at different densities.
 */
function drawLampPool(ctx: Ctx, cx: number, cy: number, radius: number): void {
  const ry = Math.max(4, radius >> 1)
  const inner = withAlpha(PAL.lantern, 0.13)
  const outer = withAlpha(PAL.lantern, 0.1)

  // Row by row against an ellipse, so the pool has no corners. A rectangle of dither is
  // a visible box on the floor, which is worse than no light at all.
  for (let dy = -ry; dy <= ry; dy++) {
    const t = dy / ry
    const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - t * t)))
    if (half <= 0) continue
    const y = cy + dy
    // Denser in the middle of the pool, thinner at its edge — falloff without a gradient.
    const near = Math.abs(t) < 0.55
    dither(ctx, cx - half, y, half * 2, 1, near ? inner : outer, y, near ? 1 : 2)
  }
}
