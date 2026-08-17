/**
 * The farm itself, at 640x448.
 *
 * Layers, in the order they are painted and for the reasons `docs/GRAPHICS.md` gives:
 *
 *   1. ground, its edge transitions and its overlays, one tile at a time
 *   2. plants and fruit trees, in row order, so a canopy hangs over the row above it
 *   3. everything that stands up — the farmhouse, buildings, machines, animals, the
 *      farmer and any placement preview — sorted by the row it stands on
 *   4. particles
 *   5. weather, then the light tint, both clipped to the world band
 *   6. the tile cursor and the placement ghost, above the tint so position is never
 *      lost at night
 *   7. the HUD and the tool belt, unlit, over all of it
 *
 * The world is the whole 20x11 grid at 32 px and there is no camera: the farm still
 * fits on one screen, so every tile is on it and the framebuffer doubling went into
 * detail rather than into scrolling.
 */
import type { ActionResult, Fx, GameState, Season, Tile, ToolId } from '../../game/types'
import type {
  Building,
  BuildingDef,
  Footprint,
  MachineDef,
  PlacementCheck,
} from '../../game/farm-types'
import type { Input } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import type { FarmerPose } from '../../art/actors'
import {
  BELT_H,
  BELT_Y,
  FARM_H,
  FARM_W,
  HUD_H,
  LOGICAL_W,
  TILE,
  WORLD_H,
  WORLD_Y,
} from '../../game/constants'
import { countItem, facingIndex, tileIndex } from '../../game/state'
import { movePlayer, selectSeed, setTool, useTool } from '../../game/actions'
import { cropById, isRipe } from '../../game/crops'
import { treeById } from '../../game/trees'
import { formatClock, formatDate, isNight } from '../../game/time'
import { buildingDef } from '../../game/buildings'
import { speciesById } from '../../game/species'
import { formatMaterials, missingMaterials, xpProgress } from '../../game/progression'
import { canPlace, moveBuilding, placeBuilding, placementMessage } from '../../game/placement'
import { machineAt, machineDefFor, machineLevel, placeMachine } from '../../game/production'
import { buildingDoorAt, doorOf } from '../../game/interiors'
import { canGraze } from '../../game/livestock'
import { PAL, withAlpha } from '../../engine/palette'
import { drawText, textWidth } from '../../engine/font'
import { dither, ellipse, hline, outline, px, rect, vline, woodPanel } from '../../engine/pixel'
import { isMuted, playSound, setMuted, unlockAudio } from '../../engine/audio'
import {
  artNoise,
  drawGround,
  drawGroundEdges,
  drawTileOverlay,
  mixHex,
  prefersReducedMotion,
} from '../../art/tiles'
import { drawPlant, drawSeedIcon, drawTree as drawFruitTree } from '../../art/plants'
import { drawFarmerPose, drawToolIcon } from '../../art/actors'
import {
  drawFarmhouse,
  drawLightLayer,
  drawWeatherLayer,
  setAmbientFrame,
} from '../../art/scenery'
import { drawAnimal } from '../../art/livestock'
import { drawBuilding, drawBuildingGhost, drawMachine, drawMachineIcon } from '../../art/structures'
import { describeTile } from '../announce'
import { createShopScene, takeBuildRequest } from './shop'
import { createInventoryScene } from './inventory'
import { createSleepScene } from './sleep'
import { createHelpScene } from './help'
import { createInteriorScene } from './interior'
import { createMachineScene } from './machine'

/** One tile every 180 ms, the tween length from DESIGN section 5. */
const MOVE_MS = 180

/** A tool swing runs three frames over this long. State, so reduced motion keeps it. */
const SWING_MS = 240

const TOOLS: readonly ToolId[] = ['hoe', 'can', 'seeds', 'hand', 'axe', 'sprinkler', 'fertilizer']

const TOOL_NAME: Record<ToolId, string> = {
  hoe: 'HOE',
  can: 'WATERING CAN',
  seeds: 'SEED BAG',
  hand: 'HANDS',
  axe: 'AXE',
  sprinkler: 'SPRINKLER',
  fertilizer: 'FERTILIZER',
}

/** Mirrors the farmhouse footprint laid down in game/state.ts. */
const HOUSE_TX = 1
const HOUSE_TY = 0
const HOUSE_TILES_H = 3

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.42)
const RECESS = mixHex(PAL.parchment, PAL.soil, 0.5)
const SLOT_EDGE = mixHex(PAL.parchment, PAL.ink, 0.3)

/** Specks must read against the ground they came off, so they are not that ground's colour. */
const SPECK_LIGHT = mixHex(PAL.soil, PAL.cream, 0.45)
const SPECK_DARK = PAL.soilWet
const CHAFF = mixHex(PAL.grassLit, PAL.cream, 0.4)
const WATER_LIT = mixHex(PAL.sky, PAL.cream, 0.5)
const STEAM = mixHex(PAL.parchment, PAL.cream, 0.5)
const LEAF_FALL = mixHex(PAL.lantern, PAL.berry, 0.35)

/* ------------------------------------------------------------------ *
 * HUD and belt geometry. Every number here is the 16 px-era layout
 * doubled, and nothing is a bare literal twice.
 * ------------------------------------------------------------------ */

const HUD_ROW1 = 6
const HUD_ROW2 = 24
const HUD_LEFT = 8
const HUD_RIGHT = LOGICAL_W - 12
const CLOCK_X = 176
const WEATHER_X = 252
const WEATHER_TEXT_X = 276
const MUTE_X = 344
const ENERGY_BAR_X = 64
const ENERGY_BAR_W = 168
const ENERGY_TEXT_X = 240
const LEVEL_X = 320
const XP_BAR_X = 392
const XP_BAR_W = 136
const BAR_Y = 22
const BAR_H = 14

const SLOT_X = [12, 46, 80, 152, 186, 220, 254] as const
const SEED_CHIP_X = 116
const SLOT_Y = BELT_Y
const SLOT_W = 32
const SLOT_H = 30
/** The selected tool sits higher than its neighbours — DESIGN.md section 6. */
const SLOT_LIFT = 4
const SLOT_ICON_OFF = 4
const DIGIT_Y = BELT_Y + 32
const INFO_X = 304
const INFO_W = LOGICAL_W - 12 - INFO_X
const INFO_LINES = [BELT_Y, BELT_Y + 14, BELT_Y + 28] as const

/** Where a harvest pop flies to: the gold readout in the top right of the HUD. */
const HUD_GOLD_X = LOGICAL_W - 56
const HUD_GOLD_Y = 12

/* ------------------------------------------------------------------ particles */

type PKind = 'clod' | 'drop' | 'ring' | 'arc' | 'spark' | 'leaf' | 'steam'

interface Particle {
  kind: PKind
  x: number
  y: number
  vx: number
  vy: number
  grav: number
  /** Milliseconds left, and the span it started with, for the fade. */
  life: number
  max: number
  color: string
  size: number
  /** `arc`: the homing target. `leaf`: sway phase and amplitude. `ring`: final radius. */
  ax: number
  ay: number
}

/**
 * Four times the pixels means four times the room for debris, and section 6 asks for a
 * real budget rather than four specks. This is the ceiling across every emitter at once.
 */
const MAX_PARTICLES = 240

/**
 * A splash ring is stepped round its circumference, never `ctx.arc`. Twenty-four steps
 * because eight divides it: the sun's rays on the weather badge borrow the same table.
 */
const RING_STEPS = 24
const RING_COS: number[] = []
const RING_SIN: number[] = []
for (let i = 0; i < RING_STEPS; i++) {
  RING_COS.push(Math.cos((i / RING_STEPS) * Math.PI * 2))
  RING_SIN.push(Math.sin((i / RING_STEPS) * Math.PI * 2))
}

/* ------------------------------------------------------------------ helpers */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** FNV-1a. Deterministic per animal, so a pen is not a row of clones. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function tileLabel(tile: Tile): string {
  const plant = tile.plant
  if (plant !== null) {
    const crop = cropById(plant.cropId) ?? treeById(plant.cropId)
    const name = crop === undefined ? 'PLANT' : crop.name
    if (plant.dead) return `WITHERED ${name}`
    if (crop !== undefined && isRipe(plant, crop)) return `${name} - RIPE`
    if (plant.stage === 0) return `${name} - SOWN`
    return `${name} - GROWING`
  }
  if (tile.machineId !== null) return 'A MACHINE'
  if (tile.buildingId !== null) return 'A BUILDING'
  if (tile.sprinkler) return 'SPRINKLER'
  switch (tile.ground) {
    case 'soil':
      if (tile.watered) return tile.fertilized ? 'RICH SOIL, WATERED' : 'SOIL, WATERED'
      return tile.fertilized ? 'RICH SOIL, DRY' : 'TILLED SOIL'
    case 'grass':
      return 'GRASS'
    case 'weeds':
      return 'WEEDS'
    case 'rock':
      return 'ROCK'
    case 'log':
      return 'FALLEN LOG'
    case 'water':
      return 'THE POND'
    case 'path':
      return 'THE PATH'
  }
}

/** Seed crop ids actually in the bag, in bag order. */
function heldSeeds(state: GameState): string[] {
  const out: string[] = []
  for (const entry of state.inventory) {
    if (entry.item.kind === 'seed' && entry.count > 0) out.push(entry.item.cropId)
  }
  return out
}

/** A struck coin: ink rim, a shaded lower right, a lit upper left and one cream glint. */
function coin(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = x + 7
  const cy = y + 7
  ellipse(ctx, cx, cy, 7, 7, PAL.ink)
  ellipse(ctx, cx, cy, 6, 6, mixHex(PAL.lantern, PAL.bark, 0.45))
  ellipse(ctx, cx - 1, cy - 1, 5, 5, PAL.lantern)
  ellipse(ctx, cx - 2, cy - 2, 3, 3, mixHex(PAL.lantern, PAL.cream, 0.5))
  rect(ctx, cx - 4, cy - 5, 2, 2, PAL.cream)
  // The die mark, so it reads as struck metal rather than a dot.
  vline(ctx, cx, cy - 3, 7, withAlpha(PAL.bark, 0.7))
  hline(ctx, cx - 2, cy, 5, withAlpha(PAL.bark, 0.5))
}

/**
 * A meter with a real ramp: ink rim, a sunken shadow trough, the fill lit along its top
 * edge and quartered by tick marks so a glance reads the fraction, not just the colour.
 */
function meter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  color: string,
  alarm: boolean,
): void {
  const t = clamp(fill, 0, 1)
  outline(ctx, x, y, w, h, PAL.ink)
  rect(ctx, x + 1, y + 1, w - 2, h - 2, PAL.shadow)
  hline(ctx, x + 1, y + 1, w - 2, mixHex(PAL.shadow, PAL.ink, 0.5))
  const fw = Math.round((w - 2) * t)
  if (fw > 0) {
    rect(ctx, x + 1, y + 1, fw, h - 2, color)
    rect(ctx, x + 1, y + 1, fw, 2, mixHex(color, PAL.cream, 0.45))
    rect(ctx, x + 1, y + h - 3, fw, 2, mixHex(color, PAL.ink, 0.3))
    rect(ctx, x + 1, y + 1, 2, 2, PAL.cream)
  }
  for (let q = 1; q < 4; q++) {
    vline(ctx, x + 1 + Math.round(((w - 2) * q) / 4), y + 1, h - 2, withAlpha(PAL.ink, 0.35))
  }
  if (alarm) outline(ctx, x - 2, y - 2, w + 4, h + 4, PAL.berry)
}

/** A 20x20 weather badge. Drawn, never a glyph — DESIGN.md section 8 forbids icon fonts. */
function weatherBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  weather: GameState['weather'],
): void {
  const cx = x + 10
  const cy = y + 9

  if (weather === 'clear') {
    for (let i = 0; i < 8; i++) {
      const dx = Math.round(RING_COS[(i * RING_STEPS) / 8] * 9)
      const dy = Math.round(RING_SIN[(i * RING_STEPS) / 8] * 9)
      rect(ctx, cx + dx - 1, cy + dy - 1, 2, 2, withAlpha(PAL.lantern, 0.85))
    }
    ellipse(ctx, cx, cy, 6, 6, PAL.ink)
    ellipse(ctx, cx, cy, 5, 5, mixHex(PAL.lantern, PAL.berry, 0.2))
    ellipse(ctx, cx - 1, cy - 1, 3, 3, PAL.lantern)
    rect(ctx, cx - 3, cy - 4, 2, 2, PAL.cream)
    return
  }

  const storm = weather === 'storm'
  const body = storm ? mixHex(PAL.dusk, PAL.ink, 0.3) : mixHex(PAL.dusk, PAL.parchment, 0.4)
  ellipse(ctx, cx - 4, cy - 3, 5, 4, PAL.ink)
  ellipse(ctx, cx + 3, cy - 4, 6, 5, PAL.ink)
  ellipse(ctx, cx, cy - 1, 9, 4, PAL.ink)
  ellipse(ctx, cx - 4, cy - 4, 4, 3, body)
  ellipse(ctx, cx + 3, cy - 5, 5, 4, body)
  ellipse(ctx, cx, cy - 2, 8, 3, body)
  ellipse(ctx, cx - 3, cy - 6, 3, 1, mixHex(body, PAL.cream, 0.65))
  ellipse(ctx, cx + 2, cy - 7, 3, 1, mixHex(body, PAL.cream, 0.4))

  if (weather === 'snow') {
    for (let i = 0; i < 3; i++) {
      const fx = cx - 6 + i * 6
      const fy = cy + 4 + (i & 1) * 3
      px(ctx, fx, fy, PAL.cream)
      hline(ctx, fx - 1, fy, 3, withAlpha(PAL.cream, 0.7))
      vline(ctx, fx, fy - 1, 3, withAlpha(PAL.cream, 0.7))
    }
    return
  }
  if (storm) {
    rect(ctx, cx, cy + 2, 3, 4, PAL.lantern)
    rect(ctx, cx - 2, cy + 5, 4, 3, PAL.lantern)
    rect(ctx, cx - 1, cy + 7, 2, 3, PAL.cream)
  }
  for (let i = 0; i < 4; i++) {
    const rx = cx - 7 + i * 5
    const ry = cy + 3 + (i & 1) * 2
    vline(ctx, rx, ry, 4, withAlpha(PAL.sky, 0.9))
    px(ctx, rx, ry, WATER_LIT)
  }
}

/** The tile an animal stands on. Deterministic from its id, never from the clock. */
function animalSpot(
  state: GameState,
  building: Building,
  footprint: Footprint,
  hash: number,
  outside: boolean,
): { x: number; y: number } {
  let x: number
  let y: number
  if (outside) {
    const reach = 1 + (hash % 3)
    x = building.x - reach + ((hash >> 4) % (footprint.w + reach * 2))
    y = building.y - reach + ((hash >> 9) % (footprint.h + reach * 2))
    const onWalls =
      x >= building.x &&
      x < building.x + footprint.w &&
      y >= building.y &&
      y < building.y + footprint.h
    if (onWalls) y = building.y + footprint.h
  } else {
    // Home: the apron in front of its own door, which is where a pen would be.
    x = building.x + (hash % footprint.w)
    y = building.y + footprint.h
  }
  x = clamp(x, 0, FARM_W - 1)
  y = clamp(y, 0, FARM_H - 1)
  // Nothing stands in the pond. Fall back to the apron, and to the bottom row if that
  // is off the farm as well.
  if (state.tiles[y * FARM_W + x]?.ground === 'water') {
    y = clamp(building.y + footprint.h, 0, FARM_H - 1)
    x = clamp(building.x, 0, FARM_W - 1)
  }
  return { x, y }
}

/* ------------------------------------------------------------------ placing */

/** A footprint following the cursor, before anything has been spent on it. */
interface Placing {
  kind: string
  machine: boolean
  /** Set when this is a relocation of a standing building rather than a new one. */
  moveId?: string
  name: string
  /** Real for a building; for a machine, the one-tile stand-in the ghost is drawn from. */
  def: BuildingDef
  x: number
  y: number
  preview(ctx: CanvasRenderingContext2D, sx: number, sy: number, season: Season, frame: number): void
}

/**
 * What the player is still short of, or null when they can afford it. The rules layer
 * re-checks all of this at the moment of the build; this is only so the belt can say so
 * while the ghost is still movable.
 */
function shortfall(state: GameState, plan: Placing): string | null {
  if (state.progression.level < plan.def.level) return `NEEDS LEVEL ${plan.def.level}`
  if (state.gold < plan.def.cost) {
    return `COSTS ${plan.def.cost}G, YOU HAVE ${state.gold}G`
  }
  const missing = missingMaterials(state, plan.def.materials)
  if (Object.keys(missing).length === 0) return null
  return `STILL NEEDS ${formatMaterials(missing)}`
}

/**
 * The one-tile `BuildingDef` a machine borrows so the ghost can draw its footprint and
 * the belt can price it. Cost, materials and level are the machine's own, so the two
 * kinds of placement answer "can I afford this?" identically.
 */
function machineGhostDef(def: MachineDef, level: number): BuildingDef {
  return {
    kind: def.kind,
    name: def.name,
    footprint: { w: 1, h: 1 },
    cost: def.cost,
    materials: def.materials,
    level,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  }
}

/* ------------------------------------------------------------------ the scene */

/**
 * What using the faced tile opens, or null when it is ordinary ground and the held tool
 * should swing instead. A door and a machine answer to the same button as a crop row:
 * `docs/INTERIORS.md` section 2 is the whole argument for why there is no separate key.
 */
function enter(ctx: SceneContext, index: number): SceneCommand | null {
  const state = ctx.state
  const machine = machineAt(state, index)
  if (machine !== null) {
    playSound('select')
    return { kind: 'push', scene: createMachineScene(machine.id) }
  }

  const x = index % FARM_W
  const y = Math.floor(index / FARM_W)
  const building = buildingDoorAt(state, x, y)
  if (building !== null) {
    playSound('select')
    return { kind: 'push', scene: createInteriorScene(building.id) }
  }
  return null
}

/**
 * The AHEAD line. A building tile is not `A BUILDING` — it is the coop, and if the farmer
 * is standing at its door it says so, because that is the difference between a wall and a
 * way in.
 */
function facedLabel(state: GameState): string {
  const index = facingIndex(state)
  const x = index % FARM_W
  const y = Math.floor(index / FARM_W)

  const machine = machineAt(state, index)
  if (machine !== null) {
    const def = machineDefFor(machine.kind)
    return `${def === null ? machine.kind.toUpperCase() : def.name.toUpperCase()} - USE TO OPEN`
  }

  const door = buildingDoorAt(state, x, y)
  if (door !== null) {
    const def = buildingDef(door.kind)
    return `${def === undefined ? door.kind.toUpperCase() : def.name} DOOR - USE TO GO IN`
  }

  // Holding the axe over standing sward is the only route to hay in the game, and a
  // player who never tries the axe on grass would never find it. So the line says so at
  // the moment it is true, rather than leaving it to the help page.
  const grass = state.tiles[index]
  if (state.tool === 'axe' && grass !== undefined && grass.ground === 'grass') {
    return canGraze(state.season) ? 'GRASS - CUT IT FOR HAY' : 'GRASS - UNDER SNOW, NO HAY NOW'
  }

  const tile = state.tiles[index]
  if (tile !== undefined && tile.buildingId !== null) {
    const owner = state.buildings.find((b) => b.id === tile.buildingId)
    const def = owner === undefined ? undefined : buildingDef(owner.kind)
    if (owner !== undefined) {
      const at = doorOf(owner)
      return `${def === null || def === undefined ? owner.kind.toUpperCase() : def.name} - DOOR IS AT ${at.x + 1},${at.y + 1}`
    }
  }

  return tileLabel(state.tiles[index])
}

interface Actor {
  /** The bottom row of the thing, in framebuffer pixels. Sorted ascending. */
  key: number
  draw(): void
}

export function createWorldScene(): Scene {
  const particles: Particle[] = []
  const actors: Actor[] = []
  let noiseTick = 0
  /** Milliseconds since the last ambient emission, so smoke and leaves are paced. */
  let ambientT = 0

  let toX = -1
  let toY = -1
  let drawX = 0
  let drawY = 0
  let fromX = 0
  let fromY = 0
  let moveT = 0
  let steps = 0
  let moveCooldown = 0
  let swingT = 0

  let prevGold = -1
  let goldFlash = 0

  let placing: Placing | null = null
  let placeCooldown = 0
  let lastPointerX = -1
  let lastPointerY = -1

  /** The tile last spoken to the live region, so a screen reader is told once per move. */
  let spokenFaced = -1
  /** The footprint position last spoken, so the ghost is narrated once per nudge. */
  let spokenPlace = ''

  const rnd = (): number => {
    noiseTick = (noiseTick + 1) & 0xffff
    return artNoise(noiseTick, 4271)
  }
  const spread = (n: number): number => (rnd() - 0.5) * 2 * n

  const push = (p: Particle): void => {
    if (particles.length >= MAX_PARTICLES) particles.shift()
    particles.push(p)
  }

  const spawn = (
    kind: PKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    grav: number,
    life: number,
    color: string,
    size: number,
    ax = 0,
    ay = 0,
  ): void => {
    push({ kind, x, y, vx, vy, grav, life, max: life, color, size, ax, ay })
  }

  /**
   * The section 6 budget, emitter by emitter. Every one of these is decoration, so
   * every one of them is skipped outright under reduced motion.
   */
  const emit = (kind: Fx['kind'], index: number, color: string | undefined): void => {
    if (prefersReducedMotion()) return
    const cx = (index % FARM_W) * TILE + (TILE >> 1)
    const cy = WORLD_Y + Math.floor(index / FARM_W) * TILE + (TILE >> 1)

    switch (kind) {
      case 'dirt':
        // Clods with real weight: they arc up and come back down onto the row. Twelve
        // of them, graded three deep, because one size of speck reads as static.
        for (let i = 0; i < 12; i++) {
          const size = i < 4 ? 3 : i < 9 ? 2 : 1
          spawn(
            'clod',
            cx + spread(8),
            cy - 5 - rnd() * 5,
            spread(100),
            -110 - rnd() * 90,
            620,
            380 + rnd() * 220,
            color ?? (rnd() > 0.4 ? SPECK_LIGHT : SPECK_DARK),
            size,
          )
        }
        break
      case 'splash': {
        // A ring on the ground, then the droplets that threw it.
        spawn('ring', cx, cy + 6, 0, 0, 0, 420, color ?? WATER_LIT, 1, 18, 7)
        for (let i = 0; i < 12; i++) {
          spawn(
            'drop',
            cx + spread(10),
            cy - rnd() * 6,
            spread(72),
            -54 - rnd() * 66,
            460,
            340 + rnd() * 180,
            color ?? (rnd() > 0.55 ? PAL.sky : WATER_LIT),
            i < 5 ? 3 : 2,
          )
        }
        break
      }
      case 'pop':
        // The crop hops, then flies to the gold readout it is on its way to becoming.
        spawn(
          'arc',
          cx - 1,
          cy - 6,
          spread(18),
          -120,
          210,
          760,
          color ?? PAL.cream,
          3,
          HUD_GOLD_X,
          HUD_GOLD_Y,
        )
        for (let i = 0; i < 4; i++) {
          spawn(
            'drop',
            cx + spread(8),
            cy - 4 - rnd() * 6,
            spread(34),
            -50 - rnd() * 30,
            300,
            300,
            color ?? CHAFF,
            1,
          )
        }
        break
      case 'sparkle':
        for (let i = 0; i < 12; i++) {
          spawn(
            'spark',
            cx + spread(13),
            cy - 6 + spread(11),
            spread(16),
            -20 - rnd() * 22,
            -10,
            520 + rnd() * 280,
            color ?? (rnd() > 0.4 ? PAL.lantern : PAL.cream),
            1,
          )
        }
        break
      case 'leaf':
        for (let i = 0; i < 7; i++) {
          spawn(
            'leaf',
            cx + spread(10),
            cy - 6 - rnd() * 8,
            spread(30),
            -34 - rnd() * 26,
            120,
            700 + rnd() * 400,
            color ?? (rnd() > 0.5 ? PAL.leaf : CHAFF),
            2,
            rnd() * 6,
            0.8 + rnd(),
          )
        }
        break
    }
  }

  /** Steam off a working machine and the autumn leaf fall, both on their own slow clock. */
  const ambient = (state: GameState, dt: number): void => {
    if (prefersReducedMotion()) return
    ambientT += dt
    if (ambientT < 200) return
    ambientT = 0

    for (const machine of state.machines) {
      if (machine.queue.length === 0) continue
      const mx = (machine.index % FARM_W) * TILE
      const my = WORLD_Y + Math.floor(machine.index / FARM_W) * TILE
      spawn(
        'steam',
        mx + 18 + spread(4),
        my + 4,
        spread(7),
        -20 - rnd() * 10,
        -3,
        900 + rnd() * 400,
        STEAM,
        2,
      )
    }

    // Autumn: a leaf every third beat somewhere along the top of the valley, drifting
    // the whole depth of the band. Twelve or so are alive at any moment.
    if (state.season === 'fall' && rnd() > 0.66) {
      spawn(
        'leaf',
        rnd() * LOGICAL_W,
        WORLD_Y - 4,
        spread(14),
        34 + rnd() * 30,
        6,
        6200,
        rnd() > 0.5 ? LEAF_FALL : mixHex(PAL.lantern, PAL.bark, 0.4),
        2,
        rnd() * 6,
        1.1,
      )
    }
  }

  const stepParticles = (dt: number): void => {
    const s = dt / 1000
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      if (p.kind === 'ring') continue

      if (p.kind === 'arc') {
        // Wound up first, then reeled in: the hop reads before the flight starts.
        const t = 1 - p.life / p.max
        if (t > 0.22) {
          const dx = p.ax - p.x
          const dy = p.ay - p.y
          const d = Math.max(1, Math.hypot(dx, dy))
          const pull = 2200 * s
          p.vx += (dx / d) * pull
          p.vy += (dy / d) * pull
          if (d < 10) {
            particles.splice(i, 1)
            continue
          }
        }
      }

      p.x += p.vx * s
      p.y += p.vy * s
      p.vy += p.grav * s
      if (p.kind === 'leaf') {
        // A leaf does not fall straight; it scissors from side to side as it goes.
        p.ax += s * 5
        p.x += Math.sin(p.ax) * p.ay
      }
      if (p.kind === 'steam') p.size = p.life / p.max > 0.5 ? 2 : 3
      if (p.y > WORLD_Y + WORLD_H + 8) particles.splice(i, 1)
    }
  }

  const drawParticles = (g: CanvasRenderingContext2D, beat: number): void => {
    for (const p of particles) {
      const t = p.life / p.max
      const x = Math.round(p.x)
      const y = Math.round(p.y)

      switch (p.kind) {
        case 'ring': {
          // An expanding ring stepped round its circumference, one pixel per step.
          const r = (1 - t) * p.ax
          const ry = Math.max(1, Math.round((1 - t) * p.ay))
          const color = withAlpha(p.color, Math.max(0.15, t))
          for (let k = 0; k < RING_STEPS; k++) {
            px(g, x + Math.round(RING_COS[k] * r), y + Math.round(RING_SIN[k] * ry), color)
          }
          break
        }
        case 'spark': {
          // A four-armed glint that blinks on the 6 fps beat instead of fading.
          if (beat % 2 === 1) break
          const arm = t > 0.5 ? 2 : 1
          hline(g, x - arm, y, arm * 2 + 1, p.color)
          vline(g, x, y - arm, arm * 2 + 1, p.color)
          px(g, x, y, PAL.cream)
          if (arm > 1) {
            px(g, x - 1, y - 1, withAlpha(PAL.cream, 0.55))
            px(g, x + 1, y + 1, withAlpha(p.color, 0.55))
          }
          break
        }
        case 'steam': {
          const a = t * 0.55
          if (a <= 0.02) break
          ellipse(g, x, y, p.size, p.size - 1, withAlpha(p.color, a))
          px(g, x - 1, y - 1, withAlpha(PAL.cream, a))
          break
        }
        case 'arc': {
          // The produce itself, in flight: ink under it, the crop's colour over that,
          // one cream glint on the upper left where the light is.
          rect(g, x - 2, y - 2, 5, 5, withAlpha(PAL.ink, 0.5))
          rect(g, x - 2, y - 2, 4, 4, PAL.ink)
          rect(g, x - 1, y - 1, 3, 3, p.color)
          rect(g, x - 1, y - 1, 2, 1, mixHex(p.color, PAL.cream, 0.5))
          px(g, x - 1, y - 1, PAL.cream)
          break
        }
        case 'leaf': {
          // A blade, not a dot: lit along its top edge and shadowed underneath.
          const a = t < 0.2 ? t / 0.2 : 1
          const body = a < 1 ? withAlpha(p.color, a) : p.color
          rect(g, x, y + 1, 4, 2, withAlpha(PAL.ink, 0.4 * a))
          rect(g, x, y, 4, 2, body)
          hline(g, x, y, 3, withAlpha(mixHex(p.color, PAL.cream, 0.55), a))
          break
        }
        default: {
          // Clods and droplets. Every one carries a down-right shadow and an
          // upper-left highlight, so it reads on soil as well as on grass.
          if (y < WORLD_Y || y >= WORLD_Y + WORLD_H) break
          const a = t < 0.35 ? t / 0.35 : 1
          const s = p.size
          rect(g, x + 1, y + 1, s, s, withAlpha(PAL.ink, 0.45 * a))
          rect(g, x, y, s, s, a < 1 ? withAlpha(p.color, a) : p.color)
          if (s > 1) px(g, x, y, withAlpha(mixHex(p.color, PAL.cream, 0.55), a))
          break
        }
      }
    }
  }

  /* ---------------------------------------------------------------- verbs */

  const applyResult = (ctx: SceneContext, result: ActionResult): void => {
    const before = ctx.state
    ctx.state = result.state
    playSound(result.sound)
    for (const fx of result.fx) {
      // A harvest pop is the crop leaving the ground, so it flies in the crop's colour.
      let tint = fx.color
      if (tint === undefined && fx.kind === 'pop') {
        const plant = before.tiles[fx.index]?.plant ?? null
        if (plant !== null) {
          tint = (cropById(plant.cropId) ?? treeById(plant.cropId))?.art.fruit
        }
      }
      emit(fx.kind, fx.index, tint)
    }
    ctx.announce(result.message)
    if (!result.ok) ctx.toast(result.message, 'bad')
    else if (result.sound === 'harvest' || result.sound === 'sell' || result.sound === 'buy') {
      ctx.toast(result.message, 'good')
    }
  }

  const cycleSeed = (ctx: SceneContext, dir: number): void => {
    const seeds = heldSeeds(ctx.state)
    if (seeds.length === 0) {
      playSound('deny')
      ctx.say('NO SEEDS IN THE BAG. THE SHOP IS ON B.', 'bad')
      return
    }
    const at = ctx.state.selectedSeed === null ? -1 : seeds.indexOf(ctx.state.selectedSeed)
    const next = at < 0 ? (dir > 0 ? 0 : seeds.length - 1) : (at + dir + seeds.length) % seeds.length
    ctx.state = selectSeed(ctx.state, seeds[next])
    playSound('select')
    const crop = cropById(seeds[next]) ?? treeById(seeds[next])
    ctx.announce(`SEED BAG LOADED WITH ${crop === undefined ? '' : crop.name}.`)
  }

  /** Takes whatever the shop armed and puts a ghost on the farm under the farmer. */
  const startPlacing = (ctx: SceneContext): void => {
    const request = takeBuildRequest()
    if (request === null) return

    let next: Placing | null = null
    if (request.machine) {
      const def = machineDefFor(request.kind)
      if (def !== null) {
        next = {
          kind: def.kind,
          machine: true,
          name: def.name.toUpperCase(),
          def: machineGhostDef(def, machineLevel(def)),
          x: 0,
          y: 0,
          preview: (g, sx, sy) => {
            drawMachineIcon(g, def, sx, sy)
          },
        }
      }
    } else {
      const def = buildingDef(request.kind)
      if (def !== undefined) {
        next = {
          kind: def.kind,
          machine: false,
          moveId: request.moveId,
          name: def.name.toUpperCase(),
          def,
          x: 0,
          y: 0,
          preview: (g, sx, sy, season, frame) => {
            drawBuilding(g, def, sx, sy, season, frame)
          },
        }
      }
    }
    if (next === null) {
      ctx.say('NOBODY BUILDS THOSE.', 'bad')
      return
    }

    const player = ctx.state.player
    next.x = clamp(player.x - (next.def.footprint.w >> 1), 0, FARM_W - next.def.footprint.w)
    next.y = clamp(player.y, 0, FARM_H - next.def.footprint.h)
    placing = next
    placeCooldown = 0
    lastPointerX = -1
    lastPointerY = -1
    playSound('select')
    ctx.say(`PLACING THE ${next.name}. ARROWS MOVE, ENTER BUILDS, ESC CANCELS.`, 'info')
  }

  const cancelPlacing = (ctx: SceneContext): void => {
    if (placing === null) return
    const name = placing.name
    placing = null
    playSound('deny')
    ctx.say(`LEFT THE ${name} WHERE IT WAS. NOTHING SPENT.`, 'info')
  }

  /** Arrows, mouse, confirm and cancel, for the frames the ghost is on the farm. */
  const runPlacing = (ctx: SceneContext, input: Input, dt: number, plan: Placing): void => {
    const fw = plan.def.footprint.w
    const fh = plan.def.footprint.h

    const held = (a: string, b: string): boolean => input.down(a) || input.down(b)
    let dx = 0
    let dy = 0
    if (held('ArrowLeft', 'KeyA')) dx -= 1
    if (held('ArrowRight', 'KeyD')) dx += 1
    if (held('ArrowUp', 'KeyW')) dy -= 1
    if (held('ArrowDown', 'KeyS')) dy += 1

    placeCooldown -= dt
    if (dx === 0 && dy === 0) {
      placeCooldown = 0
    } else if (placeCooldown <= 0) {
      plan.x = clamp(plan.x + dx, 0, FARM_W - fw)
      plan.y = clamp(plan.y + dy, 0, FARM_H - fh)
      placeCooldown = MOVE_MS
    }

    // The mouse only takes over on the frames it actually moved, so it never fights
    // the arrows for the ghost.
    const p = input.pointer
    const moved = p.x !== lastPointerX || p.y !== lastPointerY
    lastPointerX = p.x
    lastPointerY = p.y
    const overWorld = p.x >= 0 && p.x < LOGICAL_W && p.y >= WORLD_Y && p.y < WORLD_Y + WORLD_H
    if (moved && overWorld) {
      plan.x = clamp(Math.floor(p.x / TILE) - (fw >> 1), 0, FARM_W - fw)
      plan.y = clamp(Math.floor((p.y - WORLD_Y) / TILE) - (fh - 1), 0, FARM_H - fh)
    }

    const confirm =
      input.pressed('Enter') ||
      input.pressed('NumpadEnter') ||
      input.pressed('Space') ||
      (overWorld && p.released)
    if (!confirm) return

    const result = plan.machine
      ? placeMachine(ctx.state, plan.kind, tileIndex(plan.x, plan.y))
      : plan.moveId !== undefined
        ? moveBuilding(ctx.state, plan.moveId, plan.x, plan.y)
        : placeBuilding(ctx.state, plan.kind, plan.x, plan.y)
    applyResult(ctx, result)
    if (result.ok) placing = null
  }

  const handleKeys = (ctx: SceneContext, input: Input): SceneCommand | null => {
    for (let i = 0; i < TOOLS.length; i++) {
      if (!input.pressed(`Digit${i + 1}`)) continue
      const next = setTool(ctx.state, TOOLS[i])
      if (next !== ctx.state) {
        ctx.state = next
        playSound('select')
        ctx.announce(`HOLDING THE ${TOOL_NAME[TOOLS[i]]}.`)
      }
    }
    if (input.pressed('KeyQ')) cycleSeed(ctx, -1)
    if (input.pressed('KeyE')) cycleSeed(ctx, 1)

    if (input.pressed('KeyM')) {
      const next = !isMuted()
      setMuted(next)
      if (!next) playSound('select')
      ctx.say(next ? 'SOUND OFF.' : 'SOUND ON.', 'info')
    }

    if (input.pressed('KeyB')) return { kind: 'push', scene: createShopScene() }
    if (input.pressed('KeyI')) return { kind: 'push', scene: createInventoryScene() }
    if (input.pressed('KeyN')) return { kind: 'push', scene: createSleepScene() }
    if (input.pressed('KeyH') || input.pressed('F1')) {
      return { kind: 'push', scene: createHelpScene() }
    }
    return null
  }

  /* ------------------------------------------------------------- HUD, belt */

  const drawHud = (ctx: SceneContext, beat: number): void => {
    const g = ctx.g
    const state = ctx.state
    woodPanel(g, -8, -16, LOGICAL_W + 16, HUD_H + 16, { thin: true })

    // ---- row one: when it is, what the sky is doing, and what is in the tin ----
    drawText(g, formatDate(state), HUD_LEFT, HUD_ROW1, PAL.ink, { maxWidth: 160 })
    drawText(g, formatClock(state.minutes), CLOCK_X, HUD_ROW1, PAL.ink)

    weatherBadge(g, WEATHER_X, 1, state.weather)
    drawText(g, state.weather.toUpperCase(), WEATHER_TEXT_X, HUD_ROW1, QUIET, { maxWidth: 56 })
    if (isMuted()) drawText(g, 'MUTED', MUTE_X, HUD_ROW1, PAL.berry)

    const gold = `${state.gold}G`
    const gx = HUD_RIGHT - textWidth(gold)
    if (goldFlash > 0) {
      rect(g, gx - 24, 2, textWidth(gold) + 30, 20, withAlpha(PAL.lantern, 0.5))
      outline(g, gx - 24, 2, textWidth(gold) + 30, 20, PAL.lantern)
    }
    coin(g, gx - 20, 4)
    drawText(g, gold, gx, HUD_ROW1, PAL.ink)

    // ---- row two: what it costs to keep going, and how far along the year is ----
    const cap = Math.max(1, state.maxEnergy)
    const fill = state.energy / cap
    const low = fill <= 0.2
    drawText(g, 'ENERGY', HUD_LEFT, HUD_ROW2, PAL.ink)
    meter(
      g,
      ENERGY_BAR_X,
      BAR_Y,
      ENERGY_BAR_W,
      BAR_H,
      fill,
      mixHex(PAL.berry, PAL.lantern, fill),
      low && beat % 2 === 0,
    )
    drawText(g, `${state.energy}/${state.maxEnergy}`, ENERGY_TEXT_X, HUD_ROW2, low ? PAL.berry : PAL.ink)

    const xp = xpProgress(state)
    drawText(g, `LEVEL ${xp.level}`, LEVEL_X, HUD_ROW2, PAL.ink)
    meter(g, XP_BAR_X, BAR_Y, XP_BAR_W, BAR_H, xp.pct, PAL.sky, false)
    const xpTag = xp.need <= 0 ? 'MAX' : `${xp.into}/${xp.need} XP`
    drawText(g, xpTag, HUD_RIGHT - textWidth(xpTag, 1, true), HUD_ROW2 + 1, QUIET, { small: true })
  }

  /** One belt pocket: raised and lantern-faced when it holds the selected tool. */
  const slot = (g: CanvasRenderingContext2D, x: number, chosen: boolean): number => {
    const y = chosen ? SLOT_Y - SLOT_LIFT : SLOT_Y
    const h = chosen ? SLOT_H + SLOT_LIFT : SLOT_H
    if (chosen) {
      rect(g, x, y, SLOT_W, h, PAL.lantern)
      rect(g, x + 1, y + 1, SLOT_W - 2, 2, mixHex(PAL.lantern, PAL.cream, 0.55))
      rect(g, x + 1, y + 1, 2, h - 2, mixHex(PAL.lantern, PAL.cream, 0.3))
      rect(g, x + 1, y + h - 3, SLOT_W - 2, 2, mixHex(PAL.lantern, PAL.bark, 0.4))
      outline(g, x, y, SLOT_W, h, PAL.ink)
    } else {
      dither(g, x + 2, y + 2, SLOT_W - 4, h - 4, RECESS, 0, 2)
      outline(g, x, y, SLOT_W, h, SLOT_EDGE)
      hline(g, x + 1, y + 1, SLOT_W - 2, mixHex(PAL.parchment, PAL.cream, 0.6))
    }
    return y
  }

  const drawBelt = (ctx: SceneContext, plan: Placing | null, check: PlacementCheck | null): void => {
    const g = ctx.g
    const state = ctx.state
    woodPanel(g, -8, BELT_Y - 8, LOGICAL_W + 16, BELT_H + 8, { thin: true })

    for (let i = 0; i < TOOLS.length; i++) {
      const tool = TOOLS[i]
      const chosen = state.tool === tool
      const y = slot(g, SLOT_X[i], chosen)
      drawToolIcon(g, tool, SLOT_X[i] + SLOT_ICON_OFF, y + 3)
      drawText(g, `${i + 1}`, SLOT_X[i] + 14, DIGIT_Y, chosen ? PAL.ink : QUIET, { small: true })
    }

    // The loaded seed, tied by a rail to the seed bag slot it feeds. Fruit trees share
    // the seed catalogue with the crops, so both are asked.
    const crop =
      state.selectedSeed === null
        ? undefined
        : (cropById(state.selectedSeed) ?? treeById(state.selectedSeed))
    hline(g, SLOT_X[2] + SLOT_W, SLOT_Y + 14, SEED_CHIP_X - SLOT_X[2] - SLOT_W, PAL.bark)
    const chipY = slot(g, SEED_CHIP_X, false)
    if (crop === undefined) {
      outline(g, SEED_CHIP_X + 10, chipY + 10, 12, 12, PAL.dusk)
      dither(g, SEED_CHIP_X + 11, chipY + 11, 10, 10, PAL.dusk, 0, 2)
    } else {
      drawSeedIcon(g, crop, SEED_CHIP_X + SLOT_ICON_OFF, chipY + 3)
    }

    vline(g, INFO_X - 12, BELT_Y - 2, 40, mixHex(PAL.parchment, PAL.bark, 0.55))

    if (plan !== null) {
      // The ghost only knows about ground. The purse and the store are checked here so
      // the refusal is on screen before the player commits, not after.
      const short = shortfall(state, plan)
      const bad = short !== null || (check !== null && !check.ok)
      const verdict =
        check !== null && !check.ok
          ? placementMessage(check.reason, plan.name)
          : (short ?? 'ENTER SETS IT DOWN')
      drawText(g, `PLACING: ${plan.name}`, INFO_X, INFO_LINES[0], PAL.ink, { maxWidth: INFO_W })
      drawText(g, verdict, INFO_X, INFO_LINES[1], bad ? PAL.berry : PAL.ink, {
        maxWidth: INFO_W,
      })
      drawText(g, 'ARROWS OR MOUSE MOVE IT - ESC CANCELS', INFO_X, INFO_LINES[2], QUIET, {
        maxWidth: INFO_W,
      })
      return
    }

    drawText(g, `HOLDING: ${TOOL_NAME[state.tool]}`, INFO_X, INFO_LINES[0], PAL.ink, {
      maxWidth: INFO_W,
    })
    const seedLine =
      crop === undefined
        ? 'SEED: NONE - Q OR E PICKS ONE'
        : `SEED: ${crop.name} X${countItem(state, { kind: 'seed', cropId: crop.id })}`
    drawText(g, seedLine, INFO_X, INFO_LINES[1], PAL.ink, { maxWidth: INFO_W })
    drawText(g, `AHEAD: ${facedLabel(state)}`, INFO_X, INFO_LINES[2], PAL.ink, { maxWidth: INFO_W })
  }

  /* ------------------------------------------------------------------ frame */

  return {
    id: 'world',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      setAmbientFrame(frame)
      const g = ctx.g
      if (input.anyPressed()) unlockAudio()

      // ---- input -------------------------------------------------------
      // Unconditional, so a request armed by the shop is never left sitting in the slot.
      startPlacing(ctx)
      let command: SceneCommand | null = null

      if (placing !== null) {
        if (input.pressed('Escape') || input.pressed('KeyB')) cancelPlacing(ctx)
        else runPlacing(ctx, input, dt, placing)
        if (input.pressed('KeyH') || input.pressed('F1')) {
          command = { kind: 'push', scene: createHelpScene() }
        }
      } else {
        const held = (a: string, b: string): boolean => input.down(a) || input.down(b)
        let dx = 0
        let dy = 0
        if (held('ArrowLeft', 'KeyA')) dx -= 1
        if (held('ArrowRight', 'KeyD')) dx += 1
        if (held('ArrowUp', 'KeyW')) dy -= 1
        if (held('ArrowDown', 'KeyS')) dy += 1

        moveCooldown -= dt
        if (dx === 0 && dy === 0) {
          moveCooldown = 0
        } else if (moveCooldown <= 0) {
          ctx.state = movePlayer(ctx.state, dx, dy)
          moveCooldown = MOVE_MS
        }

        // Walking or turning is a state change, so the live region hears the new tile
        // before anything is done to it. Actions speak for themselves in applyResult.
        const faced = facingIndex(ctx.state)
        if (faced !== spokenFaced) {
          spokenFaced = faced
          ctx.announce(describeTile(ctx.state, faced))
        }

        if (input.pressed('Space') || input.pressed('Enter') || input.pressed('NumpadEnter')) {
          // A door and a machine are used with the same button as a crop row, because
          // that is the one verb this game has. `docs/INTERIORS.md` section 2.
          const entered = enter(ctx, faced)
          if (entered !== null) {
            command = entered
          } else {
            swingT = SWING_MS
            applyResult(ctx, useTool(ctx.state))
          }
        }
        if (command === null) command = handleKeys(ctx, input)
      }

      swingT = Math.max(0, swingT - dt)
      // Read once the verbs have run: a build that succeeded clears the plan, and the
      // ghost must not survive its own building by a frame.
      const plan = placing

      // ---- the farmer's tween -------------------------------------------
      const player = ctx.state.player
      if (toX < 0) {
        toX = player.x
        toY = player.y
        fromX = player.x
        fromY = player.y
        drawX = player.x
        drawY = player.y
        moveT = MOVE_MS
      }
      if (player.x !== toX || player.y !== toY) {
        fromX = drawX
        fromY = drawY
        toX = player.x
        toY = player.y
        moveT = 0
        steps += 1
      }
      moveT += dt
      const k = Math.min(1, moveT / MOVE_MS)
      drawX = fromX + (toX - fromX) * k
      drawY = fromY + (toY - fromY) * k

      // ---- 1: ground, its transitions and its overlays --------------------
      const state = ctx.state
      const season = state.season
      const tiles = state.tiles

      for (let ty = 0; ty < FARM_H; ty++) {
        const sy = WORLD_Y + ty * TILE
        for (let tx = 0; tx < FARM_W; tx++) {
          const tile = tiles[ty * FARM_W + tx]
          const sx = tx * TILE
          drawGround(g, tile, sx, sy, season, frame)
          drawGroundEdges(g, tiles, tx, ty, sx, sy, season, frame)
          drawTileOverlay(g, tile, sx, sy, frame)
        }
      }

      // ---- 2: plants and fruit trees, in row order ------------------------
      for (let i = 0; i < tiles.length; i++) {
        const plant = tiles[i].plant
        if (plant === null) continue
        const sx = (i % FARM_W) * TILE
        const sy = WORLD_Y + Math.floor(i / FARM_W) * TILE
        const crop = cropById(plant.cropId)
        if (crop !== undefined) {
          drawPlant(g, crop, plant, sx, sy, frame)
          continue
        }
        const tree = treeById(plant.cropId)
        if (tree !== undefined) drawFruitTree(g, tree, plant, sx, sy, season, frame)
      }

      // ---- 3: everything that stands up, sorted by the row it stands on ----
      actors.length = 0
      const farmerX = Math.round(drawX * TILE)
      const farmerY = WORLD_Y + Math.round(drawY * TILE)

      actors.push({
        key: WORLD_Y + (HOUSE_TY + HOUSE_TILES_H) * TILE,
        draw: () => {
          drawFarmhouse(g, HOUSE_TX * TILE, WORLD_Y + HOUSE_TY * TILE, season, isNight(state.minutes))
        },
      })

      for (const building of state.buildings) {
        const def = buildingDef(building.kind)
        if (def === undefined) continue
        const sx = building.x * TILE
        const sy = WORLD_Y + building.y * TILE
        actors.push({
          key: WORLD_Y + (building.y + def.footprint.h) * TILE,
          draw: () => {
            drawBuilding(g, def, sx, sy, season, frame)
          },
        })
      }

      for (const machine of state.machines) {
        const def = machineDefFor(machine.kind)
        if (def === null) continue
        const mx = (machine.index % FARM_W) * TILE
        const my = WORLD_Y + Math.floor(machine.index / FARM_W) * TILE
        actors.push({
          key: my + TILE,
          draw: () => {
            drawMachine(g, def, machine, mx, my, frame)
          },
        })
      }

      for (const animal of state.animals) {
        const species = speciesById(animal.species)
        if (species === undefined) continue
        const home = state.buildings.find((b) => b.id === animal.buildingId)
        if (home === undefined) continue
        const def = buildingDef(home.kind)
        const spot = animalSpot(
          state,
          home,
          def === undefined ? { w: 1, h: 1 } : def.footprint,
          hashId(animal.id),
          animal.outside,
        )
        const ax = spot.x * TILE
        const ay = WORLD_Y + spot.y * TILE
        actors.push({
          key: ay + TILE,
          draw: () => {
            drawAnimal(g, species, animal, ax, ay, frame)
          },
        })
      }

      let check: PlacementCheck | null = null
      if (plan !== null) {
        check = canPlace(state, plan.def.footprint, plan.x, plan.y)
        // The ghost is not a colour the live region can read, so the verdict is spoken
        // every time the footprint lands somewhere new.
        const spot = `${plan.kind}:${plan.x}:${plan.y}:${check.ok}`
        if (spot !== spokenPlace) {
          spokenPlace = spot
          ctx.announce(
            check.ok
              ? `${plan.name} AT COLUMN ${plan.x + 1}, ROW ${plan.y + 1}. READY TO BUILD.`
              : `${plan.name} AT COLUMN ${plan.x + 1}, ROW ${plan.y + 1}. ${placementMessage(check.reason, plan.name)}`,
          )
        }
        const gx = plan.x * TILE
        const gy = WORLD_Y + plan.y * TILE
        actors.push({
          key: gy + plan.def.footprint.h * TILE,
          draw: () => {
            plan.preview(g, gx, gy, season, frame)
          },
        })
      }

      const pose: FarmerPose =
        swingT > 0
          ? { action: 'use', frame: Math.min(2, Math.floor((SWING_MS - swingT) / (SWING_MS / 3))) }
          : k < 1
            ? { action: 'walk', frame: steps }
            : { action: 'idle', frame }
      actors.push({
        key: farmerY + TILE,
        draw: () => {
          drawFarmerPose(g, player.facing, farmerX, farmerY, state.tool, pose)
        },
      })

      actors.sort((a, b) => a.key - b.key)
      for (const actor of actors) actor.draw()

      // ---- 4: particles ---------------------------------------------------
      ambient(state, dt)
      stepParticles(dt)
      drawParticles(g, ctx.beat)

      // ---- 5: weather and light, world band only --------------------------
      drawWeatherLayer(g, state.weather, frame)
      drawLightLayer(g, state.minutes, state.weather)

      // ---- 6: cursor and ghost, above the light so neither is lost at night --
      if (plan !== null && check !== null) {
        drawBuildingGhost(g, plan.def, plan.x * TILE, WORLD_Y + plan.y * TILE, check)
      } else {
        const index = facingIndex(state)
        const cx = (index % FARM_W) * TILE
        const cy = WORLD_Y + Math.floor(index / FARM_W) * TILE
        const pulse = ctx.beat % 2 === 0 ? PAL.cream : withAlpha(PAL.cream, 0.55)
        outline(g, cx - 1, cy - 1, TILE + 2, TILE + 2, withAlpha(PAL.ink, 0.45))
        outline(g, cx, cy, TILE, TILE, pulse)
        outline(g, cx + 1, cy + 1, TILE - 2, TILE - 2, pulse)
        // Corner studs, so the cursor is a bracket and not only a brighter square —
        // position is never carried by fill colour alone (DESIGN.md section 9).
        rect(g, cx - 3, cy - 3, 4, 4, pulse)
        rect(g, cx + TILE - 1, cy - 3, 4, 4, pulse)
        rect(g, cx - 3, cy + TILE - 1, 4, 4, pulse)
        rect(g, cx + TILE - 1, cy + TILE - 1, 4, 4, pulse)
      }

      // ---- 7: HUD and belt, unlit -----------------------------------------
      goldFlash = Math.max(0, goldFlash - dt)
      if (prevGold >= 0 && state.gold > prevGold) goldFlash = 300
      prevGold = state.gold

      ui.begin(g, input)
      drawHud(ctx, ctx.beat)
      drawBelt(ctx, plan, check)
      ui.end()

      ctx.toastY = BELT_Y - 12

      if (command !== null) return command
      if (state.passedOut) {
        placing = null
        return { kind: 'push', scene: createSleepScene() }
      }
      return null
    },
  }
}
