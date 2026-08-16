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

/** Generous ceilings: they exist to reject corruption, not to cap real play. */
const MAX_YEAR = 9999
const MAX_GOLD = 999_999_999
const MAX_STAGE = 16
const MAX_PROGRESS = 999
const MAX_STACK = 9999
const MAX_STAT = Number.MAX_SAFE_INTEGER

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
  }
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
