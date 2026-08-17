/**
 * Renders real game frames to PNG without a browser.
 *
 * Electron cannot be photographed in this environment: Win32 `PrintWindow` returns
 * solid black for Chromium, and on a GPU-less off-screen desktop the renderer never
 * reaches `dom-ready` at all. But the art layer only ever touches nine 2D-context
 * calls, so the honest way out is to implement those nine calls, drive the *real*
 * drawing code, and rasterise the result ourselves. The pixels are the game's own.
 *
 * The framebuffer is 640 x 448 with a 32 px tile, which is exactly twice the original,
 * so the 20 x 11 farm still fits on screen whole and there is no camera to model here.
 * The output is upscaled 2x rather than the old 3x: the source frame doubled, and a
 * 3840 px wide PNG helps nobody.
 *
 * Skipped unless SHOTS=1, so `npm test` is unaffected:
 *
 *   SHOTS=1 npx vitest run tests/shots.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  LOGICAL_W,
  LOGICAL_H,
  TILE,
  FARM_W,
  FARM_H,
  WORLD_Y,
  WORLD_H,
} from '../src/game/constants'
import { createState, tileIndex } from '../src/game/state'
import { requireCrop, cropsForSeason } from '../src/game/crops'
import { requireTree } from '../src/game/trees'
import { requireBuilding } from '../src/game/buildings'
import { requireSpecies } from '../src/game/species'
import { requireMachine } from '../src/game/factories'
import { ageInDays } from '../src/game/livestock'
import { FARMHOUSE, canPlace } from '../src/game/placement'
import { REGIONS } from '../src/game/regions'
import { isNight } from '../src/game/time'
import { drawGround, drawGroundEdges, drawTileOverlay } from '../src/art/tiles'
import { drawPlant, drawTree as drawFruitTree } from '../src/art/plants'
import { drawFarmer } from '../src/art/actors'
import {
  drawFarmhouse,
  drawFencePost,
  drawLightLayer,
  drawTree as drawWildTree,
  drawWeatherLayer,
  setAmbientFrame,
} from '../src/art/scenery'
import { drawAnimal } from '../src/art/livestock'
import { drawBuilding, drawBuildingGhost, drawMachine } from '../src/art/structures'
import { drawRoom } from '../src/art/interiors'
import { Raster, encodePng, survey } from './raster'
import type { Region } from './raster'
import { interiorFor } from '../src/game/interiors'
import { animalsIn, isProduceReady } from '../src/game/livestock'
import { machineStatus } from '../src/game/production'
import type { Interior, Station } from '../src/game/interiors'
import type { StationState } from '../src/art/interiors'
import type { GameState, Ground, Plant, Season, Tile } from '../src/game/types'
import type { Animal, Building, Machine } from '../src/game/farm-types'

const OUT = process.env.SHOTS_OUT ?? path.join(process.cwd(), 'docs', 'shots')

/* ------------------------------------------------------------ compositing */

type Ctx = CanvasRenderingContext2D
type Painter = (ctx: Ctx) => void

/**
 * The parts of a scene the rules layer does not model but the art layer draws: fences
 * have no tile flag, wild trees are scenery, an animal knows its building and not its
 * square of grass, and a placement ghost is a thing the player is only thinking about.
 */
interface Decor {
  /** Fence posts by tile. A run of adjacent posts reads as one unbroken fence. */
  fence: Array<{ x: number; y: number }>
  /** Wild trees: tile, plus the variant that picks the silhouette. */
  wild: Array<{ x: number; y: number; variant: number }>
  /** Planted fruit trees. `grown` means mature and carrying a ripe crop. */
  orchard: Array<{ x: number; y: number; tree: string; grown: boolean }>
  /** Where each animal is standing. The objects are the ones in `state.animals`. */
  herd: Array<{ animal: Animal; x: number; y: number }>
  /** The building the player is holding, and the tile its top-left corner is over. */
  ghost: { kind: string; x: number; y: number } | null
}

function noDecor(): Decor {
  return { fence: [], wild: [], orchard: [], herd: [], ghost: null }
}

/** A sapling, or a mature tree with fruit hanging on it. */
function treePlant(id: string, grown: boolean): Plant {
  const tree = requireTree(id)
  return {
    cropId: tree.id,
    stage: grown ? tree.stageDays.length : 1,
    progress: grown ? tree.regrowDays : 1,
    dry: 0,
    dead: false,
    fertilized: false,
    regrown: grown ? 2 : 0,
  }
}

/**
 * Draws the farm exactly as the world scene layers it: ground, then the transitions
 * between grounds, then the overlays, then everything that stands on top sorted by the
 * row it touches, then weather and light.
 */
function drawWorld(r: Raster, state: GameState, frame: number, decor: Decor): void {
  const ctx = r as unknown as Ctx
  // Sprites that take no frame argument read the beat from here, so every ambient
  // animation in the shot is on the same tick rather than on wall time.
  setAmbientFrame(frame)

  for (let y = 0; y < FARM_H; y += 1) {
    for (let x = 0; x < FARM_W; x += 1) {
      const tile = state.tiles[y * FARM_W + x]
      const sx = x * TILE
      const sy = WORLD_Y + y * TILE
      drawGround(ctx, tile, sx, sy, state.season, frame)
      // Every pixel of a transition lands inside the tile that owns it, so this is
      // safe in the same pass: no later tile can paint over it.
      drawGroundEdges(ctx, state.tiles, x, y, sx, sy, state.season, frame)
      drawTileOverlay(ctx, tile, sx, sy, frame)
    }
  }

  // Everything standing on the ground is bucketed by the row it touches, so a near
  // sprite overlaps a far one. Order inside a row is the order collected below.
  const rows: Painter[][] = Array.from({ length: FARM_H }, () => [])
  const at = (row: number, paint: Painter): void => {
    rows[row < 0 ? 0 : row >= FARM_H ? FARM_H - 1 : row].push(paint)
  }

  for (const post of decor.fence) {
    at(post.y, (c) => drawFencePost(c, post.x * TILE, WORLD_Y + post.y * TILE))
  }

  // The farmhouse is not in `state.buildings`: it is the fixed footprint that
  // `game/placement.ts` reserves, and it has a sprite of its own.
  at(FARMHOUSE.y + FARMHOUSE.h - 1, (c) => {
    drawFarmhouse(
      c,
      FARMHOUSE.x * TILE,
      WORLD_Y + FARMHOUSE.y * TILE,
      state.season,
      isNight(state.minutes),
    )
  })

  for (const building of state.buildings) {
    const def = requireBuilding(building.kind)
    at(building.y + def.footprint.h - 1, (c) => {
      drawBuilding(c, def, building.x * TILE, WORLD_Y + building.y * TILE, state.season, frame)
    })
  }

  for (const tree of decor.wild) {
    at(tree.y, (c) => {
      drawWildTree(c, tree.x * TILE, WORLD_Y + tree.y * TILE, state.season, tree.variant)
    })
  }

  for (const spot of decor.orchard) {
    const tree = requireTree(spot.tree)
    const plant = treePlant(spot.tree, spot.grown)
    at(spot.y, (c) => {
      drawFruitTree(c, tree, plant, spot.x * TILE, WORLD_Y + spot.y * TILE, state.season, frame)
    })
  }

  for (let y = 0; y < FARM_H; y += 1) {
    for (let x = 0; x < FARM_W; x += 1) {
      const plant = state.tiles[y * FARM_W + x].plant
      if (plant === null) continue
      at(y, (c) => {
        drawPlant(c, requireCrop(plant.cropId), plant, x * TILE, WORLD_Y + y * TILE, frame)
      })
    }
  }

  for (const machine of state.machines) {
    const def = requireMachine(machine.kind)
    const mx = machine.index % FARM_W
    const my = Math.floor(machine.index / FARM_W)
    at(my, (c) => drawMachine(c, def, machine, mx * TILE, WORLD_Y + my * TILE, frame))
  }

  for (const placed of decor.herd) {
    const species = requireSpecies(placed.animal.species)
    at(placed.y, (c) => {
      drawAnimal(c, species, placed.animal, placed.x * TILE, WORLD_Y + placed.y * TILE, frame)
    })
  }

  const player = state.player
  at(player.y, (c) => {
    drawFarmer(c, player.facing, player.x * TILE, WORLD_Y + player.y * TILE, frame, state.tool)
  })

  for (const row of rows) for (const paint of row) paint(ctx)

  drawWeatherLayer(ctx, state.weather, frame)
  drawLightLayer(ctx, state.minutes, state.weather)

  // The placement preview is interface, not scenery, so it goes on after the light
  // layer for the same reason the HUD does: a preview you cannot read at dusk is no
  // preview. `canPlace` is the real rules call, so the blocked tiles are truly blocked.
  const ghost = decor.ghost
  if (ghost !== null) {
    const def = requireBuilding(ghost.kind)
    const check = canPlace(state, def.footprint, ghost.x, ghost.y)
    drawBuildingGhost(ctx, def, ghost.x * TILE, WORLD_Y + ghost.y * TILE, check)
  }
}

/* ------------------------------------------------------------ scene making */

/** The seed every shot is built from, so a rerun produces the same valley. */
const SEED = 20260817

interface Shot {
  name: string
  state: GameState
  decor: Decor
  frame: number
}

function copyTiles(state: GameState): Tile[] {
  return state.tiles.map((t) => ({ ...t }))
}

/**
 * A mid-game save. On day one the player owns only the home meadow, so `canPlace`
 * answers `locked-region` for two thirds of the farm and a placement ghost would be
 * uniformly red — true, but a picture of nothing. These shots are of a farm someone
 * has been living on, so the valley is bought and the ladder climbed.
 */
function established(state: GameState): GameState {
  return {
    ...state,
    gold: 24000,
    progression: {
      ...state.progression,
      level: 45,
      unlockedRegions: REGIONS.map((region) => region.id),
    },
  }
}

function clearArea(
  tiles: Tile[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  ground: Ground,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= FARM_W || y >= FARM_H) continue
      const tile = tiles[tileIndex(x, y)]
      tile.ground = ground
      tile.plant = null
      tile.watered = false
    }
  }
}

/** Clears the footprint, marks the tiles as occupied and returns the record. */
function raise(tiles: Tile[], buildings: Building[], kind: string, x: number, y: number): Building {
  const def = requireBuilding(kind)
  const building: Building = { id: `bld-${buildings.length + 1}`, kind, x, y }
  clearArea(tiles, x, y, def.footprint.w, def.footprint.h, 'grass')
  for (let dy = 0; dy < def.footprint.h; dy += 1) {
    for (let dx = 0; dx < def.footprint.w; dx += 1) {
      tiles[tileIndex(x + dx, y + dy)].buildingId = building.id
    }
  }
  buildings.push(building)
  return building
}

type MachineMode = 'idle' | 'working' | 'ready'

/** Drops a machine on one tile in one of the three states section 6 gives it. */
function install(
  tiles: Tile[],
  machines: Machine[],
  kind: string,
  x: number,
  y: number,
  mode: MachineMode,
): void {
  const def = requireMachine(kind)
  const recipe = def.recipes[0]
  const id = `mch-${machines.length + 1}`
  const index = tileIndex(x, y)
  const tile = tiles[index]
  // The ground under a machine is left alone: a machine stands on whatever the player
  // laid, and a yard path running under a whole row is the point of laying one.
  tile.plant = null
  tile.machineId = id
  machines.push({
    id,
    kind,
    index,
    queue: mode === 'working' ? [{ recipeId: recipe.id, quality: 'silver', hoursLeft: 5 }] : [],
    ready:
      mode === 'ready'
        ? [
            {
              item: { kind: 'product', productId: recipe.outputProductId, quality: 'gold' },
              count: recipe.outputCount,
            },
          ]
        : [],
  })
}

function beast(
  animals: Animal[],
  species: string,
  buildingId: string,
  tweak: Partial<Animal> = {},
): Animal {
  const animal: Animal = {
    id: `ani-${animals.length + 1}`,
    species,
    name: species.toUpperCase(),
    buildingId,
    age: ageInDays(species) + 9,
    friendship: 720,
    fedToday: true,
    pettedToday: true,
    daysUntilProduce: 0,
    outside: true,
    unwell: false,
    ...tweak,
  }
  animals.push(animal)
  return animal
}

/**
 * Tills, sows and waters a patch, at a spread of growth stages, so a shot shows a farm
 * being worked rather than the untouched field a fresh save starts as.
 *
 * Only crops the season actually grows are sown. The season turn clears everything out
 * of season, so a field of the wrong sprouts is a picture of a state the rules cannot
 * produce, and a screenshot that lies is worse than no screenshot.
 */
function plantPatch(
  tiles: Tile[],
  season: Season,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const list = cropsForSeason(season)
  if (list.length === 0) return

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const tile = tiles[tileIndex(x, y)]
      if (tile.ground !== 'grass' || tile.buildingId !== null || tile.machineId !== null) continue

      const crop = list[(x * 3 + y) % list.length]
      tile.ground = 'soil'
      tile.watered = (x + y) % 4 !== 0
      tile.plant = {
        cropId: crop.id,
        stage: (x + y * 2) % (crop.stageDays.length + 1),
        progress: 0,
        dry: 0,
        dead: false,
        fertilized: (x + y) % 7 === 0,
        regrown: 0,
      }
      tile.fertilized = tile.plant.fertilized
    }
  }
}

/** The five-scene field: the original crop shots, one per light and weather condition. */
function field(name: string, patch: Partial<GameState>, frame = 12): Shot {
  const base = { ...established(createState(SEED)), ...patch }
  const tiles = copyTiles(base)
  plantPatch(tiles, base.season, 4, 3, 13, 9)
  const decor = noDecor()
  decor.wild = [
    { x: 17, y: 8, variant: 3 },
    { x: 18, y: 6, variant: 7 },
  ]
  return {
    name,
    state: { ...base, tiles, player: { x: 6, y: 9, facing: 'up' }, tool: 'can' },
    decor,
    frame,
  }
}

/**
 * Winter: the four cold-season crops still in the ground, and the two buildings that
 * carry a farm through it, so the shot shows snow settling on glass and on a shingle
 * roof as well as on the field.
 */
function wintering(): Shot {
  const shot = field('farm-winter', { minutes: 12 * 60, season: 'winter', weather: 'snow' })
  const buildings: Building[] = []
  raise(shot.state.tiles, buildings, 'greenhouse', 5, 3)
  raise(shot.state.tiles, buildings, 'barn-store', 12, 3)
  return { ...shot, state: { ...shot.state, buildings, player: { x: 8, y: 8, facing: 'down' } } }
}

/** A farm with a coop, a barn, a fenced yard and the animals out on the grass. */
function ranch(): Shot {
  const base = established(createState(SEED))
  const tiles = copyTiles(base)
  const buildings: Building[] = []
  const animals: Animal[] = []

  const coop = raise(tiles, buildings, 'big-coop', 5, 0)
  const barn = raise(tiles, buildings, 'big-barn', 11, 0)
  raise(tiles, buildings, 'silo', 16, 5)

  // The yard the animals graze in, and the fence that keeps them in it.
  clearArea(tiles, 4, 4, 12, 2, 'grass')
  const decor = noDecor()
  for (let x = 4; x <= 15; x += 1) decor.fence.push({ x, y: 5 })
  decor.wild = [
    { x: 18, y: 4, variant: 5 },
    { x: 0, y: 6, variant: 2 },
  ]
  decor.orchard = [
    { x: 17, y: 2, tree: 'apple', grown: true },
    { x: 9, y: 7, tree: 'raspberry', grown: true },
  ]

  decor.herd = [
    { animal: beast(animals, 'chicken', coop.id), x: 5, y: 4 },
    { animal: beast(animals, 'chicken', coop.id, { age: 1 }), x: 6, y: 4 },
    { animal: beast(animals, 'duck', coop.id), x: 7, y: 4 },
    { animal: beast(animals, 'turkey', coop.id, { unwell: true }), x: 8, y: 4 },
    { animal: beast(animals, 'cow', barn.id), x: 11, y: 4 },
    { animal: beast(animals, 'goat', barn.id), x: 13, y: 4 },
    { animal: beast(animals, 'sheep', barn.id), x: 15, y: 4 },
  ]

  plantPatch(tiles, base.season, 2, 7, 9, 10)

  return {
    name: 'farm-coop-and-animals',
    state: {
      ...base,
      minutes: 10 * 60,
      tiles,
      buildings,
      animals,
      hay: 180,
      player: { x: 10, y: 6, facing: 'right' },
      tool: 'hand',
    },
    decor,
    frame: 18,
  }
}

/** The production yard: machines idle, working and holding finished output. */
function works(): Shot {
  const base = established(createState(SEED))
  const tiles = copyTiles(base)
  const buildings: Building[] = []
  const machines: Machine[] = []

  raise(tiles, buildings, 'workshop', 5, 0)
  raise(tiles, buildings, 'sawmill-yard', 9, 0)
  raise(tiles, buildings, 'bakery', 13, 0)
  raise(tiles, buildings, 'well', 17, 5)

  clearArea(tiles, 3, 4, 8, 1, 'path')
  const line: Array<[string, MachineMode]> = [
    ['mill', 'working'],
    ['dairy', 'working'],
    ['keg', 'ready'],
    ['loom', 'idle'],
    ['smelter', 'working'],
    ['jam-maker', 'ready'],
    ['bbq-grill', 'working'],
    ['candle-maker', 'idle'],
  ]
  line.forEach(([kind, mode], i) => {
    install(tiles, machines, kind, 3 + i, 4, mode)
  })

  plantPatch(tiles, base.season, 3, 6, 13, 10)

  const decor = noDecor()
  decor.wild = [{ x: 0, y: 8, variant: 1 }]
  decor.orchard = [
    { x: 18, y: 2, tree: 'plum', grown: true },
    { x: 18, y: 7, tree: 'olive', grown: false },
  ]

  return {
    name: 'farm-machines-working',
    state: {
      ...base,
      minutes: 16 * 60,
      tiles,
      buildings,
      machines,
      player: { x: 3, y: 5, facing: 'up' },
      tool: 'hand',
    },
    decor,
    frame: 24,
  }
}

/** A barn held over the crop rows, so the ghost shows both verdicts at once. */
function placing(): Shot {
  const shot = field('farm-placement-ghost', { minutes: 13 * 60 })
  shot.decor.ghost = { kind: 'barn', x: 10, y: 5 }
  return {
    ...shot,
    state: { ...shot.state, player: { x: 15, y: 9, facing: 'left' }, tool: 'hand' },
    frame: 30,
  }
}

/** Autumn, with a mature orchard: the fruit-tree renderer gets a shot of its own. */
function orchard(): Shot {
  const base = { ...established(createState(SEED)), season: 'fall' as Season, minutes: 15 * 60 }
  const tiles = copyTiles(base)
  const decor = noDecor()

  const rowOf = (y: number, ids: string[], grown: boolean): void => {
    ids.forEach((tree, i) => {
      const x = 3 + i * 3
      clearArea(tiles, x, y, 1, 1, 'grass')
      decor.orchard.push({ x, y, tree, grown })
    })
  }
  rowOf(3, ['apple', 'cherry', 'plum', 'olive', 'peach'], true)
  rowOf(6, ['raspberry', 'blackberry', 'lemon', 'orange', 'coconut'], false)

  decor.wild = [
    { x: 18, y: 5, variant: 4 },
    { x: 0, y: 8, variant: 6 },
  ]
  plantPatch(tiles, 'fall', 2, 8, 16, 11)

  return {
    name: 'farm-fall-orchard',
    state: { ...base, tiles, player: { x: 9, y: 9, facing: 'down' }, tool: 'axe' },
    decor,
    frame: 36,
  }
}

/* ------------------------------------------------------------- assertions */

/* ------------------------------------------------------- inside a building */

/**
 * An interior shot is the same trick as a farm shot, one layer up: it drives the real
 * `drawRoom` from `src/art/interiors.ts` — the identical call `src/renderer/scenes/
 * interior.ts` makes every frame — against a real `interiorFor` derived from a real
 * `GameState`. Nothing about the room is mocked, so a picture here that looks wrong is
 * the game looking wrong.
 */
interface RoomShot {
  name: string
  state: GameState
  interior: Interior
  farmer: { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right' } | null
  frame: number
}

/** The same read of live state the scene layer makes, so the art cannot flatter itself. */
function roomStationState(
  state: GameState,
  interior: Interior,
  station: Station,
): StationState {
  switch (station.kind) {
    case 'pen': {
      const animal = state.animals.find((a) => a.id === station.ref)
      if (animal === undefined) return { occupied: false, ready: false, wanting: false }
      return {
        occupied: true,
        ready: isProduceReady(state, animal),
        wanting: !animal.fedToday,
        occupant: animal.outside ? null : { species: requireSpecies(animal.species), animal },
      }
    }
    case 'trough':
      return {
        occupied: true,
        ready: false,
        wanting: animalsIn(state, interior.buildingId).some((a) => !a.fedToday),
      }
    case 'nest':
      return {
        occupied: true,
        ready: animalsIn(state, interior.buildingId).some((a) => isProduceReady(state, a)),
        wanting: false,
      }
    case 'bench': {
      const status = station.ref === null ? null : machineStatus(state, station.ref)
      return {
        occupied: status !== null && status.active !== null,
        ready: status !== null && status.readyCount > 0,
        wanting: false,
      }
    }
    case 'counter': {
      const slot = station.ref === null ? undefined : state.stall[Number(station.ref)]
      return {
        occupied: slot !== undefined && slot.item !== null && slot.count > 0,
        ready: false,
        wanting: false,
      }
    }
    default:
      return { occupied: true, ready: false, wanting: false }
  }
}

function inside(
  name: string,
  kind: string,
  build: (state: GameState, building: Building) => void,
  farmer: RoomShot['farmer'] = null,
  frame = 14,
): RoomShot {
  const base = established(createState(SEED))
  const tiles = copyTiles(base)
  const buildings: Building[] = []
  const building = raise(tiles, buildings, kind, 2, 2)

  const state: GameState = { ...base, tiles, buildings, animals: [], machines: [] }
  build(state, building)

  const interior = interiorFor(state, building.id)
  if (interior === null) throw new Error(`no interior for ${kind}`)
  return { name, state, interior, farmer, frame }
}

/** The rooms worth a picture: one of each kind of thing a room can be. */
function rooms(): RoomShot[] {
  return [
    // A working coop: four nests, one with an egg in it, one bird still hungry.
    inside(
      'inside-coop',
      'big-coop',
      (state, b) => {
        // `beast` puts an animal out to graze by default. Inside a coop they are, by
        // definition, in it — an animal that is outside shows an empty pen, correctly.
        beast(state.animals, 'chicken', b.id, { outside: false, daysUntilProduce: 0 })
        beast(state.animals, 'chicken', b.id, { outside: false, fedToday: false, daysUntilProduce: 2 })
        beast(state.animals, 'duck', b.id, { outside: false, daysUntilProduce: 0 })
        beast(state.animals, 'turkey', b.id, { outside: false, daysUntilProduce: 3 })
        state.hay = 140
      },
      { x: 5, y: 4, facing: 'up' },
    ),

    // A full barn, so the pen grid is shown at the size it actually wraps at.
    inside(
      'inside-barn',
      'big-barn',
      (state, b) => {
        beast(state.animals, 'cow', b.id, { outside: false, daysUntilProduce: 0 })
        beast(state.animals, 'cow', b.id, { outside: false, fedToday: false })
        beast(state.animals, 'goat', b.id, { outside: false, daysUntilProduce: 0 })
        beast(state.animals, 'sheep', b.id, { outside: false })
        beast(state.animals, 'sheep', b.id, { outside: false, fedToday: false })
        state.hay = 220
      },
      { x: 7, y: 5, facing: 'left' },
    ),

    // Home: the bed, the chest and the order board.
    inside('inside-farmhouse', 'farmhouse', () => {}, { x: 5, y: 4, facing: 'up' }),

    // A workroom with a bench per hosted machine, one working and one holding output.
    inside(
      'inside-bakery',
      'bakery',
      (state) => {
        install(state.tiles, state.machines, 'bakery', 14, 8, 'working')
        install(state.tiles, state.machines, 'pie-oven', 15, 8, 'ready')
        install(state.tiles, state.machines, 'ice-cream-maker', 16, 8, 'idle')
      },
      { x: 6, y: 5, facing: 'up' },
    ),

    // The roadside stall from behind the counters, some slots stocked and some bare.
    inside(
      'inside-stall',
      'stall',
      (state) => {
        state.stall = [0, 1, 2, 3, 4, 5].map((i) => ({
          item: i % 2 === 0 ? { kind: 'produce' as const, cropId: 'potato', quality: 'normal' as const } : null,
          count: i % 2 === 0 ? 12 : 0,
          price: i % 2 === 0 ? 40 + i * 3 : 0,
          sold: 0,
        }))
      },
      { x: 6, y: 2, facing: 'up' },
    ),

    // The extremes of the material set: a hewn rock room, and a glasshouse.
    inside('inside-mine', 'mine', () => {}, { x: 7, y: 5, facing: 'right' }),
    inside('inside-greenhouse', 'greenhouse', () => {}, { x: 7, y: 5, facing: 'up' }),

    // The silo: one big stack of bales and nothing else, which is the point of it.
    inside(
      'inside-silo',
      'silo',
      (state) => {
        state.hay = 200
      },
      { x: 3, y: 4, facing: 'right' },
    ),
  ]
}

/**
 * Measured inside the cropped region only. The HUD and belt bands sit outside it and
 * are never painted here, so counting them would let a blank world hide behind a
 * black bar and still pass.
 */
/* ------------------------------------------------------------------ tests */

/** Every world capture, rebuilt fresh on each call so a second render is independent. */
function worldShots(): Shot[] {
  return [
    field('farm-spring-midday', { minutes: 12 * 60 }),
    field('farm-evening', { minutes: 19 * 60 }),
    field('farm-night', { minutes: 23 * 60 }),
    field('farm-rain', { minutes: 11 * 60, weather: 'rain' }),
    wintering(),
    orchard(),
    ranch(),
    works(),
    placing(),
  ]
}

/**
 * The world band only — the HUD and belt are drawn by the scene layer, which needs a live
 * Input and UI, so cropping is honest where faking them would not be. The band is the full
 * 640 wide because the 20 x 11 farm still fits on screen whole.
 */
const BAND: Region = { x: 0, y: WORLD_Y, w: FARM_W * TILE, h: WORLD_H }

/** One world capture, drawn into a fresh raster and encoded. */
function drawWorldPng(shot: Shot): Buffer {
  const raster = new Raster(LOGICAL_W, LOGICAL_H)
  drawWorld(raster, shot.state, shot.frame, shot.decor)
  return encodePng(raster, 2, BAND)
}

/** One room capture, drawn into a fresh raster and encoded. */
function drawRoomPng(shot: RoomShot): Buffer {
  const raster = new Raster(LOGICAL_W, LOGICAL_H)
  drawRoom(
    raster as unknown as CanvasRenderingContext2D,
    shot.interior,
    shot.frame,
    (station) => roomStationState(shot.state, shot.interior, station),
    shot.farmer === null ? null : { ...shot.farmer, tool: shot.state.tool, walkFrame: null },
  )
  return encodePng(raster, 2, BAND)
}

describe.skipIf(process.env.SHOTS !== '1')('screenshot renderer', () => {
  it('renders real game frames to PNG', () => {
    fs.mkdirSync(OUT, { recursive: true })

    const shots = worldShots()
    const region = BAND
    expect(region.w).toBe(LOGICAL_W)
    expect(WORLD_Y + WORLD_H).toBeLessThanOrEqual(LOGICAL_H)

    for (const shot of shots) {
      const raster = new Raster(LOGICAL_W, LOGICAL_H)
      drawWorld(raster, shot.state, shot.frame, shot.decor)

      const png = encodePng(raster, 2, region)
      fs.writeFileSync(path.join(OUT, `${shot.name}.png`), png)

      const s = survey(raster, region)
      // eslint-disable-next-line no-console
      console.log(
        `${shot.name}: ${png.length}b spread ${s.spread} colours ${s.colors} holes ${s.holes}`,
      )

      // A frame of one flat colour is a failed render wearing a filename, and a frame
      // with a hole in it is a tile that never drew.
      expect(s.spread).toBeGreaterThan(30)
      expect(s.colors).toBeGreaterThan(64)
      expect(s.holes).toBe(0)
      expect(png.length).toBeGreaterThan(4000)
    }
  })

  it('renders the inside of a building to PNG', () => {
    fs.mkdirSync(OUT, { recursive: true })

    const region: Region = { x: 0, y: WORLD_Y, w: FARM_W * TILE, h: WORLD_H }

    for (const shot of rooms()) {
      const raster = new Raster(LOGICAL_W, LOGICAL_H)
      drawRoom(
        raster as unknown as CanvasRenderingContext2D,
        shot.interior,
        shot.frame,
        (station) => roomStationState(shot.state, shot.interior, station),
        shot.farmer === null
          ? null
          : { ...shot.farmer, tool: shot.state.tool, walkFrame: null },
      )

      const png = encodePng(raster, 2, region)
      fs.writeFileSync(path.join(OUT, `${shot.name}.png`), png)

      const s = survey(raster, region)
      // eslint-disable-next-line no-console
      console.log(
        `${shot.name}: ${png.length}b spread ${s.spread} colours ${s.colors} holes ${s.holes}`,
      )

      // A room is honestly flatter than a farm: two materials, one lamp and no weather,
      // against fifteen crops under four seasons. Holding it to the farm's 64-colour bar
      // would fail a correct render, so the bar here is 40 — still far above the dozen a
      // single ramp can produce, which is what a genuinely failed room would show.
      expect(s.spread).toBeGreaterThan(30)
      expect(s.colors).toBeGreaterThan(40)
      expect(s.holes).toBe(0)
      expect(png.length).toBeGreaterThan(4000)
    }
  })

  /**
   * Every capture must be a function of the code alone.
   *
   * A frame that differs between two runs of the same commit is not evidence of anything:
   * it makes every future review a diff full of noise, and a real regression hides in the
   * churn. The panel captures had exactly this fault — one frame took its ambient beat
   * from wall time — so the world and the rooms are held to the same bar rather than
   * trusted because `drawWorld` happens to pin the beat today.
   *
   * Both sides are built from a fresh call, because a shot's `GameState` is handed to the
   * draw code directly; re-drawing the same object would prove less than it appears to.
   */
  it('draws the same bytes twice, so a capture is never noise', () => {
    const worldA = worldShots()
    const worldB = worldShots()
    expect(worldB).toHaveLength(worldA.length)

    for (let i = 0; i < worldA.length; i += 1) {
      const a = worldA[i] as Shot
      const b = worldB[i] as Shot
      expect(b.name).toBe(a.name)
      expect(drawWorldPng(b), `${a.name} is not reproducible`).toEqual(drawWorldPng(a))
    }

    const roomsA = rooms()
    const roomsB = rooms()
    expect(roomsB).toHaveLength(roomsA.length)

    for (let i = 0; i < roomsA.length; i += 1) {
      const a = roomsA[i]
      const b = roomsB[i]
      if (a === undefined || b === undefined) throw new Error('room shot list changed length')
      expect(b.name).toBe(a.name)
      expect(drawRoomPng(b), `${a.name} is not reproducible`).toEqual(drawRoomPng(a))
    }
  })
})
