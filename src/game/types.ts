import type { SEASONS } from './constants'
import type {
  Animal,
  Building,
  Loan,
  Machine,
  Market,
  MarketEvent,
  MaterialId,
  Order,
  Progression,
  StallSlot,
} from './farm-types'

export type Season = (typeof SEASONS)[number]
export type Weather = 'clear' | 'rain' | 'storm' | 'snow'
export type Quality = 'normal' | 'silver' | 'gold'
export type Facing = 'up' | 'down' | 'left' | 'right'

/** The seven things the farmer can be holding. */
export type ToolId = 'hoe' | 'can' | 'seeds' | 'hand' | 'axe' | 'sprinkler' | 'fertilizer'

/** What a tile is made of. `soil` is the only ground a seed accepts. */
export type Ground = 'grass' | 'soil' | 'weeds' | 'rock' | 'log' | 'water' | 'path'

/** Non-seed, non-produce purchasables. */
export type GoodId = 'sprinkler' | 'fertilizer'

/** How the parametric plant renderer should shape a crop. */
export interface PlantArt {
  stem: string
  leaf: string
  fruit: string
  shape: 'round' | 'long' | 'cluster' | 'leafy' | 'root'
  /** How many fruit bodies to scatter on a ripe plant. */
  fruits: number
  /** Pixel height of the ripe plant, 4..14. */
  height: number
}

export interface CropDef {
  id: string
  /** Display name. The bitmap font is caps-led, so keep it short. */
  name: string
  seasons: Season[]
  seedCost: number
  basePrice: number
  /** Watered days required to leave each growth stage. Length === number of growing stages. */
  stageDays: number[]
  yieldMin: number
  yieldMax: number
  /** Days to re-ripen after harvest, or null for a one-shot crop. */
  regrowDays: number | null
  art: PlantArt
}

export interface Plant {
  cropId: string
  /** 0..stageDays.length. Equal to stageDays.length means ripe and harvestable. */
  stage: number
  /** Watered days accumulated inside the current stage. */
  progress: number
  /** Consecutive days ending unwatered. */
  dry: number
  dead: boolean
  /** Planted into fertilized soil: faster growth and better quality odds. */
  fertilized: boolean
  /** How many times this plant has regrown after a harvest. */
  regrown: number
}

export interface Tile {
  ground: Ground
  watered: boolean
  fertilized: boolean
  sprinkler: boolean
  plant: Plant | null
  /** Deterministic 0..255 used by the art layer for texture variation. Never gameplay. */
  variant: number
  /**
   * The building standing on this tile, or null. A mirror of `state.buildings`, rebuilt
   * wholesale by `placement.ts` after every verb, so occupancy is answerable per tile without
   * scanning every footprint. `docs/GAMEPLAY.md` §4.
   */
  buildingId: string | null
  /** The machine standing on this tile, or null. Machines occupy exactly one tile. */
  machineId: string | null
}

export interface Player {
  x: number
  y: number
  facing: Facing
}

export interface Upgrades {
  /** Watering can reach: 0 = single tile, 1 = 3 wide, 2 = 3x3. */
  canRange: number
  /** Tiles the farmer can clear per swing. Reserved for a later axe upgrade. */
  clearPower: number
}

export interface Stats {
  daysPlayed: number
  cropsPlanted: number
  harvested: number
  earned: number
  spent: number
  withered: number
}

export type ItemRef =
  | { kind: 'seed'; cropId: string }
  | { kind: 'produce'; cropId: string; quality: Quality }
  | { kind: 'good'; goodId: GoodId }
  /** Raw animal output and every factory product. Carries quality through the chain. */
  | { kind: 'product'; productId: string; quality: Quality }
  /** Wood, stone, planks, deeds. Not purchasable; never has a quality. */
  | { kind: 'material'; materialId: MaterialId }

export interface InventoryEntry {
  item: ItemRef
  count: number
}

export interface GameState {
  version: number
  /** Seeds every deterministic roll in the run. */
  seed: number
  year: number
  season: Season
  /** 1..DAYS_PER_SEASON. */
  day: number
  /** Minutes from midnight. DAY_START..DAY_END. */
  minutes: number
  weather: Weather
  /** Rolled at the end of each day so the sleep report can forecast. */
  tomorrow: Weather
  gold: number
  energy: number
  maxEnergy: number
  /** FARM_W * FARM_H entries, row-major: index = y * FARM_W + x. */
  tiles: Tile[]
  player: Player
  inventory: InventoryEntry[]
  tool: ToolId
  /** Which seed the `seeds` tool will sow. */
  selectedSeed: string | null
  upgrades: Upgrades
  stats: Stats
  /** True if the farmer ran out of energy or hit 2:00 AM and was carried home. */
  passedOut: boolean

  // ---- wave 3: livestock, production, economy and progression ----
  buildings: Building[]
  animals: Animal[]
  machines: Machine[]
  /** Fodder held in the silo. Winter feeding draws on this. */
  hay: number
  progression: Progression
  market: Market
  /** Orders and crates currently offered or accepted. */
  orders: Order[]
  loans: Loan[]
  /** Slots on the roadside stall, each with a player-set price. */
  stall: StallSlot[]
}

/** Identifier for a runtime-synthesised sound effect. */
export type SoundId =
  | 'till'
  | 'water'
  | 'plant'
  | 'harvest'
  | 'chop'
  | 'sell'
  | 'buy'
  | 'deny'
  | 'select'
  | 'newday'
  | 'wither'

/** A transient world particle burst requested by a game action. */
export interface Fx {
  kind: 'dirt' | 'splash' | 'pop' | 'sparkle' | 'leaf'
  /** Tile index the effect originates from. */
  index: number
  /** Optional colour override; otherwise the effect uses its default. */
  color?: string
}

/**
 * Every gameplay mutation returns this. `state` is always a usable state — on a
 * refused action it is the unchanged input, `ok` is false and `message` explains why.
 */
export interface ActionResult {
  state: GameState
  ok: boolean
  message: string
  sound: SoundId
  fx: Fx[]
}

/** What happened overnight, shown on the morning panel. */
export interface DayReport {
  grew: number
  withered: number
  watered: number
  ripened: number
  weather: Weather
  seasonChanged: boolean
  /** Crops cleared because the season turned over. */
  outOfSeason: number
  passedOut: boolean
  /** Gold docked for passing out, if any. */
  medicalFee: number

  // ---- wave 3. Every number here is counted by the pass that caused it, never estimated.
  /** Animals that ate, by any route. */
  fed: number
  /** Animals that went hungry. */
  unfed: number
  /** Animals with something newly waiting to be collected. */
  produced: number
  /** Machine jobs that finished and reached the barn. */
  machinesFinished: number
  /** Machine jobs that finished into a full barn and are being held in the machine. */
  machinesBlocked: number
  /** Animals that are unwell this morning. */
  animalsUnwell: number
  /** Units the roadside stall sold overnight, and what they fetched. */
  stallSold: number
  stallEarned: number
  /** Accepted orders that went past their date and cost standing. */
  ordersFailed: number
  /** The event that begins today, or null. Announced the morning it starts. */
  eventBegan: MarketEvent | null
  /** Interest added to every outstanding loan at the turn of the season. */
  interestAccrued: number
  /** The end-of-season levy, itemised. Null on any morning that is not a season boundary. */
  tax: {
    gross: number
    expenses: number
    taxable: number
    rate: number
    due: number
  } | null
  /** Levels crossed overnight, in order. */
  leveled: number[]
}
