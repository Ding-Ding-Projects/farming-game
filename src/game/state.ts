import {
  DAY_START,
  FARM_H,
  FARM_W,
  SAVE_VERSION,
  START_ENERGY,
  START_GOLD,
} from './constants'
import { CROPS } from './crops'
import { createMarket } from './economy'
import { cloneItem, itemKey } from './items'
import { rngFor } from './rng'
import { createProgression, fitCount } from './storage'
import type {
  Animal,
  Building,
  Loan,
  Machine,
  MachineJob,
  Market,
  Order,
  Progression,
  StallSlot,
} from './farm-types'
import type {
  CropDef,
  Facing,
  GameState,
  Ground,
  InventoryEntry,
  ItemRef,
  Plant,
  Tile,
  Weather,
} from './types'

/** The `ItemRef` vocabulary lives in `items.ts`; every caller still reaches it through here. */
export { cloneItem, itemKey, itemName } from './items'

/**
 * The farmhouse footprint, in tiles: two rows of building plus the doorstep row its
 * stone base sits on. Those tiles are ground 'path' and are never planted on; the
 * renderer draws the house over exactly this rectangle, so nothing under it may be
 * tilled or sown — a crop there would be invisible behind the walls.
 */
const HOUSE_X = 1
const HOUSE_Y = 0
const HOUSE_W = 3
const HOUSE_H = 3

/** The doorstep tile, directly below the door and clear of the house art. */
const DOOR_X = HOUSE_X + 1
const DOOR_Y = HOUSE_Y + HOUSE_H

/** The cleared starting plot, so day one is workable without swinging an axe. */
const PLOT_X0 = 1
const PLOT_Y0 = 2
const PLOT_X1 = 7
const PLOT_Y1 = 6

/** Where the farmer wakes up: beside the house, on cleared ground. */
const START_X = 4
const START_Y = 2
const START_FACING: Facing = 'down'

const FACING_DELTA: Record<Facing, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

const BLOCKING: ReadonlySet<Ground> = new Set<Ground>(['water', 'rock', 'log'])

/** Inclusive on both ends. Kept local so world gen owns its own distribution. */
function rint(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

function blankTile(variant: number): Tile {
  return {
    ground: 'grass',
    watered: false,
    fertilized: false,
    sprinkler: false,
    plant: null,
    variant,
    buildingId: null,
    machineId: null,
  }
}

export function tileIndex(x: number, y: number): number {
  return y * FARM_W + x
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < FARM_W && y < FARM_H
}

export function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (!inBounds(x, y)) return undefined
  return state.tiles[tileIndex(x, y)]
}

/** The tile the farmer is facing; where every tool acts. */
export function facingIndex(state: GameState): number {
  const [dx, dy] = FACING_DELTA[state.player.facing]
  const tx = state.player.x + dx
  const ty = state.player.y + dy
  if (!inBounds(tx, ty)) return tileIndex(state.player.x, state.player.y)
  return tileIndex(tx, ty)
}

export function isWalkable(tile: Tile): boolean {
  return !BLOCKING.has(tile.ground)
}

function clonePlant(plant: Plant | null): Plant | null {
  if (plant === null) return null
  return {
    cropId: plant.cropId,
    stage: plant.stage,
    progress: plant.progress,
    dry: plant.dry,
    dead: plant.dead,
    fertilized: plant.fertilized,
    regrown: plant.regrown,
  }
}

function cloneTile(tile: Tile): Tile {
  return {
    ground: tile.ground,
    watered: tile.watered,
    fertilized: tile.fertilized,
    sprinkler: tile.sprinkler,
    plant: clonePlant(tile.plant),
    variant: tile.variant,
    buildingId: tile.buildingId,
    machineId: tile.machineId,
  }
}

/* ------------------------------------------------- the wave-three collections */

function cloneBuilding(building: Building): Building {
  return { id: building.id, kind: building.kind, x: building.x, y: building.y }
}

function cloneAnimal(animal: Animal): Animal {
  return { ...animal }
}

function cloneJob(job: MachineJob): MachineJob {
  return { recipeId: job.recipeId, quality: job.quality, hoursLeft: job.hoursLeft }
}

function cloneMachine(machine: Machine): Machine {
  return {
    id: machine.id,
    kind: machine.kind,
    index: machine.index,
    queue: machine.queue.map(cloneJob),
    ready: machine.ready.map((held) => ({ item: cloneItem(held.item), count: held.count })),
  }
}

export function cloneProgressionBlock(progression: Progression): Progression {
  return {
    level: progression.level,
    xp: progression.xp,
    unlockedRegions: progression.unlockedRegions.slice(),
    materials: { ...progression.materials },
    siloCap: progression.siloCap,
    barnCap: progression.barnCap,
  }
}

/**
 * The market, including the assessor's opening figures for the season being taxed. Those
 * figures are optional on `Market` — a save written before the first season closed has none —
 * so they are copied only when they are there.
 */
function cloneMarket(market: Market): Market {
  const copy: Market = {
    supply: { ...market.supply },
    event: market.event === null ? null : { ...market.event },
    eventWeek: market.eventWeek,
    reputation: market.reputation,
    history: market.history.map((point) => ({ day: point.day, prices: { ...point.prices } })),
  }
  if (market.ledger !== undefined) copy.ledger = { ...market.ledger }
  return copy
}

function cloneOrder(order: Order): Order {
  return {
    ...order,
    lines: order.lines.map((line) => ({
      item: cloneItem(line.item),
      count: line.count,
      minQuality: line.minQuality,
    })),
    materialReward: { ...order.materialReward },
  }
}

function cloneSlot(slot: StallSlot): StallSlot {
  return {
    item: slot.item === null ? null : cloneItem(slot.item),
    count: slot.count,
    price: slot.price,
    sold: slot.sold,
  }
}

function cloneLoan(loan: Loan): Loan {
  return { ...loan }
}

export function cloneState(state: GameState): GameState {
  return {
    version: state.version,
    seed: state.seed,
    year: state.year,
    season: state.season,
    day: state.day,
    minutes: state.minutes,
    weather: state.weather,
    tomorrow: state.tomorrow,
    gold: state.gold,
    energy: state.energy,
    maxEnergy: state.maxEnergy,
    tiles: state.tiles.map(cloneTile),
    player: { x: state.player.x, y: state.player.y, facing: state.player.facing },
    inventory: state.inventory.map((entry) => ({
      item: cloneItem(entry.item),
      count: entry.count,
    })),
    tool: state.tool,
    selectedSeed: state.selectedSeed,
    upgrades: { canRange: state.upgrades.canRange, clearPower: state.upgrades.clearPower },
    stats: {
      daysPlayed: state.stats.daysPlayed,
      cropsPlanted: state.stats.cropsPlanted,
      harvested: state.stats.harvested,
      earned: state.stats.earned,
      spent: state.stats.spent,
      withered: state.stats.withered,
    },
    passedOut: state.passedOut,
    buildings: state.buildings.map(cloneBuilding),
    animals: state.animals.map(cloneAnimal),
    machines: state.machines.map(cloneMachine),
    hay: state.hay,
    progression: cloneProgressionBlock(state.progression),
    market: cloneMarket(state.market),
    orders: state.orders.map(cloneOrder),
    loans: state.loans.map(cloneLoan),
    stall: state.stall.map(cloneSlot),
  }
}

export function countItem(state: GameState, item: ItemRef): number {
  const key = itemKey(item)
  for (const entry of state.inventory) {
    if (itemKey(entry.item) === key) return entry.count
  }
  return 0
}

/**
 * Puts goods in the bag, **against the store's cap**.
 *
 * `docs/PROGRESSION.md` §5 makes the cap `addItem`'s business rather than each caller's, so
 * that no route into the bag can quietly overflow a store. What will not fit is *not* added
 * and is *not* destroyed: it stays wherever it was — on the plant, in the machine, on the
 * stall — because the caller has to ask first.
 *
 * Callers that need to tell the player what happened use `progression.depositItem`, which
 * wraps this with the count that fit, the count refused and the sentence naming the store.
 * Anything that adds without asking gets the same clamp and simply adds less.
 */
export function addItem(state: GameState, item: ItemRef, count: number): GameState {
  const next = cloneState(state)
  if (count <= 0) return next
  const room = fitCount(state, item, count)
  if (room <= 0) return next
  const key = itemKey(item)
  const existing = next.inventory.find((entry) => itemKey(entry.item) === key)
  if (existing) existing.count += room
  else next.inventory.push({ item: cloneItem(item), count: room })
  return next
}

/** Removes `count`; returns null when the player holds fewer than that. */
export function removeItem(state: GameState, item: ItemRef, count: number): GameState | null {
  if (count <= 0) return cloneState(state)
  if (countItem(state, item) < count) return null
  const key = itemKey(item)
  const next = cloneState(state)
  const kept: InventoryEntry[] = []
  for (const entry of next.inventory) {
    if (itemKey(entry.item) === key) {
      const left = entry.count - count
      if (left > 0) kept.push({ item: entry.item, count: left })
    } else {
      kept.push(entry)
    }
  }
  next.inventory = kept
  return next
}

/** The two cheapest spring crops, so the bag always starts sowable. */
function openingCrops(): CropDef[] {
  return CROPS.filter((crop) => crop.seasons.includes('spring'))
    .slice()
    .sort((a, b) => (a.seedCost === b.seedCost ? a.id.localeCompare(b.id) : a.seedCost - b.seedCost))
    .slice(0, 2)
}

function isReserved(x: number, y: number): boolean {
  const inHouse =
    x >= HOUSE_X && x < HOUSE_X + HOUSE_W && y >= HOUSE_Y && y < HOUSE_Y + HOUSE_H
  const inPlot = x >= PLOT_X0 && x <= PLOT_X1 && y >= PLOT_Y0 && y <= PLOT_Y1
  return inHouse || inPlot
}

/**
 * Grows a contiguous blob outward from `start`, taking only tiles `free` accepts.
 * Returns the indices it claimed. Growth is a random walk over the blob's own
 * members, which produces ragged organic shapes rather than discs.
 */
function growBlob(
  rand: () => number,
  start: number,
  size: number,
  free: (index: number) => boolean,
  claim: (index: number) => void,
): number[] {
  if (!free(start)) return []
  const blob = [start]
  claim(start)
  let guard = size * 12 + 12
  while (blob.length < size && guard-- > 0) {
    const from = blob[rint(rand, 0, blob.length - 1)]
    const fx = from % FARM_W
    const fy = Math.floor(from / FARM_W)
    const dir = rint(rand, 0, 3)
    const nx = fx + (dir === 2 ? -1 : dir === 3 ? 1 : 0)
    const ny = fy + (dir === 0 ? -1 : dir === 1 ? 1 : 0)
    if (!inBounds(nx, ny)) continue
    const index = tileIndex(nx, ny)
    if (!free(index)) continue
    claim(index)
    blob.push(index)
  }
  return blob
}

function buildTiles(seed: number): Tile[] {
  const variantRand = rngFor(seed, 'tile-variant')
  const tiles: Tile[] = []
  for (let i = 0; i < FARM_W * FARM_H; i++) tiles.push(blankTile(rint(variantRand, 0, 255)))

  for (let y = HOUSE_Y; y < HOUSE_Y + HOUSE_H; y++) {
    for (let x = HOUSE_X; x < HOUSE_X + HOUSE_W; x++) tiles[tileIndex(x, y)].ground = 'path'
  }
  tiles[tileIndex(DOOR_X, DOOR_Y)].ground = 'path'

  // A pond in a corner the farmhouse does not occupy, kept inside that corner's 3x3.
  const pondRand = rngFor(seed, 'pond')
  const corners: ReadonlyArray<readonly [number, number]> = [
    [FARM_W - 1, 0],
    [0, FARM_H - 1],
    [FARM_W - 1, FARM_H - 1],
  ]
  const [cx, cy] = corners[rint(pondRand, 0, corners.length - 1)]
  const nearCorner = (index: number): boolean => {
    const x = index % FARM_W
    const y = Math.floor(index / FARM_W)
    return Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2
  }
  const pondFree = (index: number): boolean => {
    const x = index % FARM_W
    const y = Math.floor(index / FARM_W)
    return !isReserved(x, y) && nearCorner(index) && tiles[index].ground === 'grass'
  }
  const pond = growBlob(
    pondRand,
    tileIndex(cx, cy),
    rint(pondRand, 3, 6),
    pondFree,
    (index) => {
      tiles[index].ground = 'water'
    },
  )

  // Debris, grown in clumps so the valley floor reads as overgrowth rather than noise.
  const debrisRand = rngFor(seed, 'debris')
  const debrisFree = (index: number): boolean => {
    const x = index % FARM_W
    const y = Math.floor(index / FARM_W)
    return !isReserved(x, y) && tiles[index].ground === 'grass'
  }
  const target = rint(debrisRand, 68, 84) - pond.length
  let placed = 0
  let guard = 4000
  while (placed < target && guard-- > 0) {
    const start = tileIndex(rint(debrisRand, 0, FARM_W - 1), rint(debrisRand, 0, FARM_H - 1))
    if (!debrisFree(start)) continue
    const roll = rint(debrisRand, 0, 9)
    const kind: Ground = roll < 5 ? 'weeds' : roll < 8 ? 'rock' : 'log'
    const size =
      kind === 'weeds'
        ? rint(debrisRand, 3, 7)
        : kind === 'rock'
          ? rint(debrisRand, 1, 4)
          : rint(debrisRand, 1, 3)
    placed += growBlob(debrisRand, start, Math.min(size, target - placed), debrisFree, (index) => {
      tiles[index].ground = kind
    }).length
  }

  return tiles
}

export function createState(seed: number): GameState {
  const weatherRand = rngFor(seed, 'weather-1')
  const tomorrow: Weather = weatherRand() < 0.3 ? 'rain' : 'clear'

  const inventory: InventoryEntry[] = []
  const starters = openingCrops()
  const counts = [6, 4]
  starters.forEach((crop, i) => {
    inventory.push({ item: { kind: 'seed', cropId: crop.id }, count: counts[i] ?? 4 })
  })
  inventory.push({ item: { kind: 'good', goodId: 'fertilizer' }, count: 1 })

  return {
    version: SAVE_VERSION,
    seed,
    year: 1,
    season: 'spring',
    day: 1,
    minutes: DAY_START,
    weather: 'clear',
    tomorrow,
    gold: START_GOLD,
    energy: START_ENERGY,
    maxEnergy: START_ENERGY,
    tiles: buildTiles(seed),
    player: { x: START_X, y: START_Y, facing: START_FACING },
    inventory,
    tool: 'hoe',
    selectedSeed: starters.length > 0 ? starters[0].id : null,
    upgrades: { canRange: 0, clearPower: 1 },
    stats: {
      daysPlayed: 0,
      cropsPlanted: 0,
      harvested: 0,
      earned: 0,
      spent: 0,
      withered: 0,
    },
    passedOut: false,

    // ---- wave 3. A farm on day one owns nothing but its front garden: no buildings, no
    // animals, no machines, no debt, and a stall with no slots until one is raised.
    buildings: [],
    animals: [],
    machines: [],
    hay: 0,
    progression: createProgression(),
    market: createMarket(),
    orders: [],
    loans: [],
    stall: [],
  }
}
