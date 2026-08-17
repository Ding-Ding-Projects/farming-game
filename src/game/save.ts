import {
  DAYS_PER_SEASON,
  DAY_END,
  DAY_START,
  ENERGY_CAP,
  FARM_H,
  FARM_W,
  SAVE_VERSION,
  SEASONS,
} from './constants'
import type {
  Animal,
  Building,
  Loan,
  Machine,
  MachineJob,
  Market,
  MarketEvent,
  MaterialId,
  Order,
  OrderKind,
  PricePoint,
  Progression,
  StallSlot,
  TradeLedger,
} from './farm-types'
import { MATERIALS } from './materials'
import { REGIONS, startingRegions } from './regions'
import { BARN_START_CAP, SILO_START_CAP } from './storage'
import { REPUTATION_MAX, REPUTATION_START } from './economy'
import type {
  Facing,
  GameState,
  GoodId,
  Ground,
  InventoryEntry,
  ItemRef,
  Plant,
  Player,
  Quality,
  Stats,
  Tile,
  ToolId,
  Upgrades,
  Weather,
} from './types'

const TOOLS: readonly ToolId[] = ['hoe', 'can', 'seeds', 'hand', 'axe', 'sprinkler', 'fertilizer']
const GROUNDS: readonly Ground[] = ['grass', 'soil', 'weeds', 'rock', 'log', 'water', 'path']
const WEATHERS: readonly Weather[] = ['clear', 'rain', 'storm', 'snow']
const QUALITIES: readonly Quality[] = ['normal', 'silver', 'gold']
const FACINGS: readonly Facing[] = ['up', 'down', 'left', 'right']
const GOODS: readonly GoodId[] = ['sprinkler', 'fertilizer']
const MATERIAL_IDS: readonly MaterialId[] = MATERIALS.map((m) => m.id)
const ORDER_KINDS: readonly OrderKind[] = ['delivery', 'crate']
const EVENT_KINDS: ReadonlyArray<MarketEvent['kind']> = [
  'bumper',
  'shortage',
  'festival',
  'caravan',
  'quiet',
]
const REGION_IDS: readonly string[] = REGIONS.map((r) => r.id)

/** Generous ceilings: they exist to reject corruption, not to cap real play. */
const MAX_YEAR = 9999
const MAX_GOLD = 999_999_999
const MAX_STAGE = 16
const MAX_PROGRESS = 999
const MAX_STACK = 9999
const MAX_STAT = Number.MAX_SAFE_INTEGER
const MAX_HAY = 999_999
const MAX_CAP = 999_999
const MAX_ID = 64
const MAX_LIST = 4096
const MAX_FRIENDSHIP = 1000

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, version: SAVE_VERSION })
}

/** Returns null on malformed or unmigratable input. Never throws. */
export function deserialize(json: string): GameState | null {
  const raw = parseJson(json)
  if (!isRecord(raw)) return null
  if (raw['version'] !== SAVE_VERSION) return null

  const seed = finite(raw['seed'])
  const season = oneOf(raw['season'], SEASONS)
  const weather = oneOf(raw['weather'], WEATHERS)
  const tomorrow = oneOf(raw['tomorrow'], WEATHERS)
  const tool = oneOf(raw['tool'], TOOLS)
  if (seed === null || season === null || weather === null || tomorrow === null || tool === null) {
    return null
  }

  const year = intOrNull(raw['year'], 1, MAX_YEAR)
  const day = intOrNull(raw['day'], 1, DAYS_PER_SEASON)
  const minutes = intOrNull(raw['minutes'], DAY_START, DAY_END)
  const gold = intOrNull(raw['gold'], 0, MAX_GOLD)
  const maxEnergy = intOrNull(raw['maxEnergy'], 1, ENERGY_CAP)
  if (year === null || day === null || minutes === null || gold === null || maxEnergy === null) {
    return null
  }
  const energy = intOrNull(raw['energy'], 0, maxEnergy)
  if (energy === null) return null

  const tiles = readTiles(raw['tiles'])
  const player = readPlayer(raw['player'])
  const inventory = readInventory(raw['inventory'])
  const upgrades = readUpgrades(raw['upgrades'])
  const stats = readStats(raw['stats'])
  if (
    tiles === null ||
    player === null ||
    inventory === null ||
    upgrades === null ||
    stats === null
  ) {
    return null
  }

  return {
    version: SAVE_VERSION,
    seed: Math.floor(seed),
    year,
    season,
    day,
    minutes,
    weather,
    tomorrow,
    gold,
    energy,
    maxEnergy,
    tiles,
    player,
    inventory,
    tool,
    selectedSeed: nonEmptyString(raw['selectedSeed']),
    upgrades,
    stats,
    passedOut: raw['passedOut'] === true,

    // The wave-3 collections. Every one of these readers is *total*: a save written before
    // the farm was a business simply has none of these keys, and a junk row inside one of
    // them is dropped rather than failing a load that is otherwise perfectly good. Losing a
    // whole farm because one order went bad is a worse outcome than losing the order.
    buildings: readBuildings(raw['buildings']),
    animals: readAnimals(raw['animals']),
    machines: readMachines(raw['machines']),
    hay: intOr(raw['hay'], 0, MAX_HAY, 0),
    progression: readProgression(raw['progression']),
    market: readMarket(raw['market']),
    orders: readOrders(raw['orders']),
    loans: readLoans(raw['loans']),
    stall: readStall(raw['stall']),
  }
}

/** Strips `__proto__` so a hand-edited save cannot reach the object prototype. */
function parseJson(text: string): unknown {
  if (typeof text !== 'string' || text.length === 0) return null
  try {
    return JSON.parse(text, (key: string, value: unknown) =>
      key === '__proto__' ? undefined : value,
    )
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  return n > max ? max : n
}

/** A whole number clamped into range, or null when the field is not a usable number. */
function intOrNull(value: unknown, min: number, max: number): number | null {
  const n = finite(value)
  return n === null ? null : clamp(Math.floor(n), min, max)
}

/** As above, but a missing or broken field falls back rather than failing the load. */
function intOr(value: unknown, min: number, max: number, fallback: number): number {
  const n = intOrNull(value, min, max)
  return n === null ? fallback : n
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readTiles(value: unknown): Tile[] | null {
  if (!Array.isArray(value) || value.length !== FARM_W * FARM_H) return null
  const tiles: Tile[] = []
  for (const entry of value) {
    const tile = readTile(entry)
    if (tile === null) return null
    tiles.push(tile)
  }
  return tiles
}

function readTile(value: unknown): Tile | null {
  if (!isRecord(value)) return null
  const ground = oneOf(value['ground'], GROUNDS)
  if (ground === null) return null
  const plant = readPlant(value['plant'])
  if (plant === undefined) return null
  return {
    ground,
    watered: value['watered'] === true,
    fertilized: value['fertilized'] === true,
    sprinkler: value['sprinkler'] === true,
    plant,
    variant: intOr(value['variant'], 0, 255, 0),
    buildingId: idOrNull(value['buildingId']),
    machineId: idOrNull(value['machineId']),
  }
}

/** A short identifier, or null. Bounded so a hand-edited save cannot carry a novel. */
function idOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID ? value : null
}

/** null means the tile is bare; undefined means the data is broken and the save is unusable. */
function readPlant(value: unknown): Plant | null | undefined {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return undefined

  const cropId = nonEmptyString(value['cropId'])
  const stage = intOrNull(value['stage'], 0, MAX_STAGE)
  const progress = intOrNull(value['progress'], 0, MAX_PROGRESS)
  if (cropId === null || stage === null || progress === null) return undefined

  return {
    cropId,
    stage,
    progress,
    dry: intOr(value['dry'], 0, MAX_PROGRESS, 0),
    dead: value['dead'] === true,
    fertilized: value['fertilized'] === true,
    regrown: intOr(value['regrown'], 0, MAX_PROGRESS, 0),
  }
}

function readPlayer(value: unknown): Player | null {
  if (!isRecord(value)) return null
  const x = intOrNull(value['x'], 0, FARM_W - 1)
  const y = intOrNull(value['y'], 0, FARM_H - 1)
  const facing = oneOf(value['facing'], FACINGS)
  if (x === null || y === null || facing === null) return null
  return { x, y, facing }
}

function readInventory(value: unknown): InventoryEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries: InventoryEntry[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const item = readItem(raw['item'])
    const count = finite(raw['count'])
    if (item === null || count === null) continue
    const whole = Math.floor(count)
    if (whole < 1) continue
    entries.push({ item, count: Math.min(whole, MAX_STACK) })
  }
  return entries
}

function readItem(value: unknown): ItemRef | null {
  if (!isRecord(value)) return null
  switch (value['kind']) {
    case 'seed': {
      const cropId = nonEmptyString(value['cropId'])
      return cropId === null ? null : { kind: 'seed', cropId }
    }
    case 'produce': {
      const cropId = nonEmptyString(value['cropId'])
      const quality = oneOf(value['quality'], QUALITIES)
      return cropId === null || quality === null ? null : { kind: 'produce', cropId, quality }
    }
    case 'good': {
      const goodId = oneOf(value['goodId'], GOODS)
      return goodId === null ? null : { kind: 'good', goodId }
    }
    case 'product': {
      const productId = nonEmptyString(value['productId'])
      const quality = oneOf(value['quality'], QUALITIES)
      return productId === null || quality === null
        ? null
        : { kind: 'product', productId, quality }
    }
    case 'material': {
      const materialId = oneOf(value['materialId'], MATERIAL_IDS)
      return materialId === null ? null : { kind: 'material', materialId }
    }
    default:
      return null
  }
}

function readUpgrades(value: unknown): Upgrades | null {
  if (!isRecord(value)) return null
  return {
    canRange: intOr(value['canRange'], 0, 2, 0),
    clearPower: intOr(value['clearPower'], 1, 8, 1),
  }
}

function readStats(value: unknown): Stats | null {
  if (!isRecord(value)) return null
  return {
    daysPlayed: intOr(value['daysPlayed'], 0, MAX_STAT, 0),
    cropsPlanted: intOr(value['cropsPlanted'], 0, MAX_STAT, 0),
    harvested: intOr(value['harvested'], 0, MAX_STAT, 0),
    earned: intOr(value['earned'], 0, MAX_STAT, 0),
    spent: intOr(value['spent'], 0, MAX_STAT, 0),
    withered: intOr(value['withered'], 0, MAX_STAT, 0),
  }
}

/* ==================================================================== wave three */

/**
 * Livestock, production, the economy and the ladder.
 *
 * Every reader below is total: it takes whatever the file holds and answers with a usable
 * value. A save from before the farm was a business has none of these keys at all and loads
 * cleanly at the opening defaults — level one, the free regions, a neutral market, no debt.
 * A save that has them but with one bad row inside keeps the good rows, because losing a
 * whole farm to one broken order is a worse outcome than losing the order.
 *
 * The version is deliberately **not** bumped for this. The old shape is a strict subset of
 * the new one and every added field has a defined default, so a version-one file is a
 * version-one file whether or not it was written before the barn existed.
 */

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const n = finite(value)
  return n === null ? fallback : clamp(n, min, max)
}

/** An array, capped in length so a corrupt file cannot make the loader chew forever. */
function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_LIST) : []
}

function readMaterialBag(value: unknown): Partial<Record<MaterialId, number>> {
  const bag: Partial<Record<MaterialId, number>> = {}
  if (!isRecord(value)) return bag
  for (const id of MATERIAL_IDS) {
    const n = intOrNull(value[id], 0, MAX_STAT)
    if (n !== null && n > 0) bag[id] = n
  }
  return bag
}

function readBuildings(value: unknown): Building[] {
  const out: Building[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const id = idOrNull(raw['id'])
    const kind = idOrNull(raw['kind'])
    const x = intOrNull(raw['x'], 0, FARM_W - 1)
    const y = intOrNull(raw['y'], 0, FARM_H - 1)
    if (id === null || kind === null || x === null || y === null) continue
    out.push({ id, kind, x, y })
  }
  return out
}

function readAnimals(value: unknown): Animal[] {
  const out: Animal[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const id = idOrNull(raw['id'])
    const species = idOrNull(raw['species'])
    const buildingId = idOrNull(raw['buildingId'])
    if (id === null || species === null || buildingId === null) continue
    out.push({
      id,
      species,
      name: typeof raw['name'] === 'string' ? raw['name'].slice(0, MAX_ID) : '',
      buildingId,
      age: intOr(raw['age'], 0, MAX_STAT, 0),
      friendship: intOr(raw['friendship'], 0, MAX_FRIENDSHIP, 0),
      fedToday: raw['fedToday'] === true,
      pettedToday: raw['pettedToday'] === true,
      daysUntilProduce: intOr(raw['daysUntilProduce'], 0, MAX_PROGRESS, 0),
      outside: raw['outside'] === true,
      unwell: raw['unwell'] === true,
    })
  }
  return out
}

function readJobs(value: unknown): MachineJob[] {
  const out: MachineJob[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const recipeId = idOrNull(raw['recipeId'])
    const quality = oneOf(raw['quality'], QUALITIES)
    if (recipeId === null || quality === null) continue
    out.push({ recipeId, quality, hoursLeft: intOr(raw['hoursLeft'], 0, MAX_STAT, 0) })
  }
  return out
}

function readLots(value: unknown): Array<{ item: ItemRef; count: number }> {
  const out: Array<{ item: ItemRef; count: number }> = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const item = readItem(raw['item'])
    const count = intOrNull(raw['count'], 1, MAX_STACK)
    if (item === null || count === null) continue
    out.push({ item, count })
  }
  return out
}

function readMachines(value: unknown): Machine[] {
  const out: Machine[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const id = idOrNull(raw['id'])
    const kind = idOrNull(raw['kind'])
    const index = intOrNull(raw['index'], 0, FARM_W * FARM_H - 1)
    if (id === null || kind === null || index === null) continue
    out.push({ id, kind, index, queue: readJobs(raw['queue']), ready: readLots(raw['ready']) })
  }
  return out
}

function readProgression(value: unknown): Progression {
  const record = isRecord(value) ? value : {}
  const regions: string[] = []
  for (const raw of rows(record['unlockedRegions'])) {
    if (typeof raw !== 'string') continue
    if (!REGION_IDS.includes(raw) || regions.includes(raw)) continue
    regions.push(raw)
  }
  // A farm that owns nothing cannot be walked on, so the free regions are restored rather
  // than trusted: a save that lost them still comes back playable.
  for (const id of startingRegions()) {
    if (!regions.includes(id)) regions.push(id)
  }
  return {
    level: intOr(record['level'], 1, MAX_STAT, 1),
    xp: intOr(record['xp'], 0, MAX_STAT, 0),
    unlockedRegions: regions,
    materials: readMaterialBag(record['materials']),
    siloCap: intOr(record['siloCap'], 0, MAX_CAP, SILO_START_CAP),
    barnCap: intOr(record['barnCap'], 0, MAX_CAP, BARN_START_CAP),
  }
}

function readEvent(value: unknown): MarketEvent | null {
  if (!isRecord(value)) return null
  const kind = oneOf(value['kind'], EVENT_KINDS)
  if (kind === null) return null
  const target = value['target']
  return {
    kind,
    target: typeof target === 'string' && target.length > 0 ? target.slice(0, MAX_ID) : null,
    multiplier: bounded(value['multiplier'], 0, 10, 1),
    startDay: intOr(value['startDay'], 0, MAX_STAT, 0),
    endDay: intOr(value['endDay'], 0, MAX_STAT, 0),
  }
}

/** A bag of numbers keyed by market key: the supply record, and one day of prices. */
function readNumberBag(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(value)) return out
  for (const key of Object.keys(value)) {
    const n = finite(value[key])
    if (n !== null) out[key] = n
  }
  return out
}

function readHistory(value: unknown): PricePoint[] {
  const out: PricePoint[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const day = intOrNull(raw['day'], 0, MAX_STAT)
    if (day === null) continue
    out.push({ day, prices: readNumberBag(raw['prices']) })
  }
  return out
}

function readLedger(value: unknown): TradeLedger | undefined {
  if (!isRecord(value)) return undefined
  const season = intOrNull(value['season'], 0, MAX_STAT)
  const earnedAt = intOrNull(value['earnedAt'], 0, MAX_STAT)
  const spentAt = intOrNull(value['spentAt'], 0, MAX_STAT)
  if (season === null || earnedAt === null || spentAt === null) return undefined
  return { season, earnedAt, spentAt }
}

function readMarket(value: unknown): Market {
  const record = isRecord(value) ? value : {}
  const market: Market = {
    supply: readNumberBag(record['supply']),
    event: readEvent(record['event']),
    eventWeek: intOr(record['eventWeek'], -1, MAX_STAT, -1),
    reputation: intOr(record['reputation'], 0, REPUTATION_MAX, REPUTATION_START),
    history: readHistory(record['history']),
  }
  const ledger = readLedger(record['ledger'])
  if (ledger !== undefined) market.ledger = ledger
  return market
}

function readOrders(value: unknown): Order[] {
  const out: Order[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const id = idOrNull(raw['id'])
    const kind = oneOf(raw['kind'], ORDER_KINDS)
    if (id === null || kind === null) continue

    const lines: Order['lines'] = []
    for (const line of rows(raw['lines'])) {
      if (!isRecord(line)) continue
      const item = readItem(line['item'])
      const count = intOrNull(line['count'], 1, MAX_STACK)
      const minQuality = oneOf(line['minQuality'], QUALITIES)
      if (item === null || count === null || minQuality === null) continue
      lines.push({ item, count, minQuality })
    }
    // An order with no line left is one nobody could fill, so it goes rather than sits.
    if (lines.length === 0) continue

    out.push({
      id,
      kind,
      lines,
      reward: intOr(raw['reward'], 0, MAX_GOLD, 0),
      xpReward: intOr(raw['xpReward'], 0, MAX_STAT, 0),
      materialReward: readMaterialBag(raw['materialReward']),
      reputationReward: intOr(raw['reputationReward'], 0, REPUTATION_MAX, 0),
      reputationPenalty: intOr(raw['reputationPenalty'], 0, REPUTATION_MAX, 0),
      issuedDay: intOr(raw['issuedDay'], 0, MAX_STAT, 0),
      dueDay: intOr(raw['dueDay'], 0, MAX_STAT, 0),
      accepted: raw['accepted'] === true,
    })
  }
  return out
}

function readLoans(value: unknown): Loan[] {
  const out: Loan[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) continue
    const id = idOrNull(raw['id'])
    if (id === null) continue
    out.push({
      id,
      principal: intOr(raw['principal'], 0, MAX_GOLD, 0),
      outstanding: intOr(raw['outstanding'], 0, MAX_GOLD, 0),
      ratePerSeason: bounded(raw['ratePerSeason'], 0, 1, 0),
      takenSeason: intOr(raw['takenSeason'], 0, MAX_STAT, 0),
      dueSeason: intOr(raw['dueSeason'], 0, MAX_STAT, 0),
      missedPayments: intOr(raw['missedPayments'], 0, MAX_STAT, 0),
    })
  }
  return out
}

function readStall(value: unknown): StallSlot[] {
  const out: StallSlot[] = []
  for (const raw of rows(value)) {
    if (!isRecord(raw)) {
      out.push({ item: null, count: 0, price: 0, sold: 0 })
      continue
    }
    const item = readItem(raw['item'])
    const count = intOr(raw['count'], 0, MAX_STACK, 0)
    // A slot cannot hold a quantity of nothing, nor nothing in a quantity.
    const stocked = item !== null && count > 0
    out.push({
      item: stocked ? item : null,
      count: stocked ? count : 0,
      price: intOr(raw['price'], 0, MAX_GOLD, 0),
      sold: intOr(raw['sold'], 0, MAX_STAT, 0),
    })
  }
  return out
}
