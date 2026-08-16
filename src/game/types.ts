import type { SEASONS } from './constants'

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
}
