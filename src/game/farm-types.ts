/**
 * Types for the livestock, production, economy and progression systems.
 *
 * Kept beside `types.ts` rather than inside it because these describe the farm as a
 * business, while `types.ts` describes the farm as a plot of land. The two reference
 * each other by type only, so the cycle is erased at compile time.
 *
 * Contracts: docs/GAMEPLAY.md, docs/ECONOMY.md, docs/PROGRESSION.md, docs/CATALOG.md
 */
import type { ItemRef, Quality, Season } from './types'

/* ------------------------------------------------------------------ materials */

export type MaterialId =
  | 'wood'
  | 'stone'
  | 'fibre'
  | 'plank'
  | 'bolt'
  | 'screw'
  | 'nail'
  | 'tape'
  | 'deed'
  | 'mallet'
  | 'axe'
  | 'saw'

/* ------------------------------------------------------------------ buildings */

export type BuildingKind = string

export interface Footprint {
  w: number
  h: number
}

export interface BuildingDef {
  kind: BuildingKind
  name: string
  footprint: Footprint
  cost: number
  /** Materials required on top of the gold cost. */
  materials: Partial<Record<MaterialId, number>>
  level: number
  /** Animal capacity, or 0 for a building that houses nothing. */
  capacity: number
  /** Species this building accepts. Empty for non-animal buildings. */
  species: SpeciesId[]
  /** The kind this upgrades into, if any. Upgrading never evicts the animals inside. */
  upgradesTo: BuildingKind | null
  /** Feeds its occupants automatically each morning. */
  autoFeeds: boolean
}

export interface Building {
  id: string
  kind: BuildingKind
  /** Top-left tile of the footprint. */
  x: number
  y: number
}

/** Per-tile verdict, so the placement ghost can show *which* corner is blocked. */
export interface PlacementCheck {
  ok: boolean
  /** One entry per footprint tile, row-major. */
  tiles: Array<{ x: number; y: number; ok: boolean; reason: PlacementReason | null }>
  /** Why the placement as a whole fails. Null when ok. */
  reason: PlacementReason | null
}

export type PlacementReason =
  | 'out-of-bounds'
  | 'terrain'
  | 'occupied-plant'
  | 'occupied-building'
  | 'occupied-machine'
  | 'occupied-sprinkler'
  | 'unreachable'
  | 'locked-region'

/* -------------------------------------------------------------------- animals */

export type SpeciesId = string

export interface SpeciesDef {
  id: SpeciesId
  name: string
  /** Building kinds that can house this species. */
  housedIn: BuildingKind[]
  cost: number
  level: number
  /** What it makes, and how often in days. */
  produces: Array<{ productId: string; everyDays: number }>
  /** Needs a tool to collect (shears for wool). Null collects by hand. */
  requiresTool: string | null
  /** Must be let outside to produce at all — pigs foraging for truffles. */
  requiresOutside: boolean
  /** Hay eaten per day when it cannot graze. */
  hayPerDay: number
}

export interface Animal {
  id: string
  species: SpeciesId
  name: string
  buildingId: string
  /** Days since purchase. Young animals do not produce yet. */
  age: number
  /** 0..1000. Drives yield and quality odds. */
  friendship: number
  fedToday: boolean
  pettedToday: boolean
  daysUntilProduce: number
  /** Let out to graze. Returns home at nightfall on its own. */
  outside: boolean
  /** Left out overnight or unfed too long. */
  unwell: boolean
}

/* ------------------------------------------------------------------- machines */

export type MachineKind = string

export interface Recipe {
  id: string
  /** What the recipe consumes. Quality of the output follows the best input. */
  inputs: Array<{ item: ItemRef; count: number }>
  outputProductId: string
  outputCount: number
  /** In-game hours, not real minutes. 24 hours is one overnight. */
  hours: number
  level: number
}

export interface MachineDef {
  kind: MachineKind
  name: string
  cost: number
  materials: Partial<Record<MaterialId, number>>
  level: number
  recipes: Recipe[]
  /** How many jobs may be queued behind the one in progress. */
  queueSize: number
}

export interface MachineJob {
  recipeId: string
  quality: Quality
  /** In-game hours left. Ticks down through the overnight pass. */
  hoursLeft: number
}

export interface Machine {
  id: string
  kind: MachineKind
  /** Tile index. Machines occupy exactly one tile. */
  index: number
  /** Head of the queue is the job in progress. */
  queue: MachineJob[]
  /** Finished output waiting to be collected, held here when the barn is full. */
  ready: Array<{ item: ItemRef; count: number }>
}

/* ---------------------------------------------------------------- progression */

export type StoreId = 'silo' | 'barn'
export type UnlockId = string

export type XpSource =
  | 'harvest'
  | 'collect'
  | 'machine'
  | 'order'
  | 'crate'
  | 'clear'
  | 'build'

export interface Progression {
  level: number
  xp: number
  /** Regions of the valley the player has bought and may now clear. */
  unlockedRegions: string[]
  materials: Partial<Record<MaterialId, number>>
  siloCap: number
  barnCap: number
}

export interface RegionDef {
  id: string
  name: string
  /** Inclusive tile bounds. */
  x0: number
  y0: number
  x1: number
  y1: number
  cost: number
  deeds: number
  level: number
}

/* -------------------------------------------------------------------- economy */

export interface GoodEconomics {
  /** Sale price before every multiplier. */
  base: number
  /** How hard the price moves when supply shifts. Staples stiff, luxuries volatile. */
  elasticity: number
  /** Fraction of the way the supply index returns to 1.0 each day. */
  recovery: number
  /** Per-season demand multiplier, roughly 0.8..1.3. */
  seasonal: Record<Season, number>
}

/**
 * The assessor's opening figures for the season being taxed.
 *
 * A *snapshot*, not a running total: the season's gross is `stats.earned` now minus
 * `earnedAt`, and its expenses are `stats.spent` now minus `spentAt`. Absent until the first
 * season closes, which is why `seasonFigures` also carries an approximation.
 */
export interface TradeLedger {
  /** Absolute season index these opening figures belong to. */
  season: number
  earnedAt: number
  spentAt: number
}

export interface Market {
  /** Supply index per item key. 1.0 is neutral; above 1.0 depresses the price. */
  supply: Record<string, number>
  /** Opening trade figures for the current season, set by the end-of-season levy. */
  ledger?: TradeLedger
  /** The event running this week, if any. */
  event: MarketEvent | null
  /** Week number the current event was rolled for. */
  eventWeek: number
  /** 0..1000. Gates order tiers and applies a standing price bonus. */
  reputation: number
  /** Rolling record for the ledger chart, newest last, bounded. */
  history: PricePoint[]
}

export interface PricePoint {
  day: number
  /** Item key to price on that day. Only goods the player has traded are tracked. */
  prices: Record<string, number>
}

export interface MarketEvent {
  kind: 'bumper' | 'shortage' | 'festival' | 'caravan' | 'quiet'
  /** Item key or category the event applies to. Null for caravan and quiet. */
  target: string | null
  multiplier: number
  startDay: number
  endDay: number
}

export type OrderKind = 'delivery' | 'crate'

export interface Order {
  id: string
  kind: OrderKind
  lines: Array<{ item: ItemRef; count: number; minQuality: Quality }>
  /** Total gold on completion, fixed at issue and immune to price swings. */
  reward: number
  xpReward: number
  materialReward: Partial<Record<MaterialId, number>>
  reputationReward: number
  reputationPenalty: number
  issuedDay: number
  dueDay: number
  accepted: boolean
}

export interface StallSlot {
  item: ItemRef | null
  count: number
  /** Player-set, clamped to half..double the current market price. */
  price: number
  /** Units sold so far, ticked through the overnight pass. */
  sold: number
}

export interface Loan {
  id: string
  principal: number
  outstanding: number
  /** Added to the outstanding balance at the end of each season. */
  ratePerSeason: number
  takenSeason: number
  dueSeason: number
  missedPayments: number
}
