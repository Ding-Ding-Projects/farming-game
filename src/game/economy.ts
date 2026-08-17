/**
 * The market: what a thing is worth today, and why.
 *
 * Implements `docs/ECONOMY.md` sections 1-3 exactly:
 *
 *   price        = round(base x qualityMultiplier x supplyFactor x seasonalDemand x reputationBonus)
 *   supplyFactor = clamp(1 / supplyIndex ^ elasticity, 0.4, 1.8)
 *
 * The two clamps are hard. A price can never reach zero and never runs away, whatever the
 * player does to the supply index.
 *
 * `elasticity` is per good. Staples barely move; luxuries swing hard. Because the
 * high-margin goods are also the volatile ones, "make the most valuable thing and dump it"
 * is never simply correct — that tension is the whole system.
 *
 * ## Who owns which number
 *
 * `products.ts` owns **what a manufactured or animal good is worth**: it derives a base
 * price and a full `GoodEconomics` for each of its two hundred products from the real
 * recipes in `factories.ts`. Where it answers, this file uses its numbers verbatim. There
 * is one product price table in this repository, not two that drift apart.
 *
 * `crops.ts` and `trees.ts` own what a raw plant is worth. They carry a `basePrice` but no
 * market behaviour, so the elasticity, recovery and seasonal curve for produce are set
 * here, from the price and the growing season.
 *
 * This file owns **what any of it fetches today**: supply, seasonal demand, weekly events,
 * reputation, price history, and the arithmetic that ties them together.
 *
 * ## Purity
 *
 * Nothing here reads a clock, touches the DOM or calls `Math.random`. Every roll goes
 * through `rngFor(seed, salt)`, so a save always replays identically. Every function that
 * takes a `GameState` returns a new one and never mutates its input.
 *
 * Intended overnight order for the caller:
 *   dailyRecovery(state) -> refreshEvent(state) -> recordPrices(state)
 */

import { DAYS_PER_SEASON, QUALITY_MULTIPLIER, SEASONS } from './constants'
import { CROPS, cropById } from './crops'
import { MATERIAL_VALUE, PRODUCTS, productById } from './products'
import { rngFor } from './rng'
import { seasonIndex } from './time'
import { TREES, treeById } from './trees'
import type { GoodEconomics, Market, MarketEvent, MaterialId, PricePoint } from './farm-types'
import type { CropDef, GameState, GoodId, ItemRef, Quality, Season } from './types'

/* ------------------------------------------------------------------ constants */

/** The hard clamps on `supplyFactor`, straight from the contract. */
export const SUPPLY_FACTOR_MIN = 0.4
export const SUPPLY_FACTOR_MAX = 1.8

/** Nothing is ever free, however flooded the market. */
export const MIN_PRICE = 1

/**
 * A supply index is stored clamped. The price clamp already limits its effect long before
 * this bites, so the cap exists only to keep a save file sane after a long dumping spree.
 */
export const MIN_SUPPLY_INDEX = 0.25
export const MAX_SUPPLY_INDEX = 8

/** An index this close to neutral snaps to exactly 1.0, so recovery terminates. */
const SUPPLY_EPSILON = 0.001

/** Days of price history kept for the ledger chart. Two seasons. Oldest points drop. */
export const HISTORY_DAYS = 56

/** Days in a market week. Four whole weeks to a season, sixteen to a year. */
export const DAYS_PER_WEEK = 7

/** Reputation runs 0..1000 and starts at 250, which is exactly neutral on price. */
export const REPUTATION_MIN = 0
export const REPUTATION_MAX = 1000
export const REPUTATION_START = 250
const REPUTATION_FLOOR_BONUS = 0.95
const REPUTATION_CEIL_BONUS = 1.08

/**
 * What an unrecognised product id is worth. Reaching this is a bug in whichever lane
 * invented the id, not a balance decision — but a mid-market number keeps the game playable
 * while somebody fixes it, and `isPriced()` exists so a test can refuse to let it ship.
 */
const UNKNOWN_PRODUCT_BASE = 200

/* ---------------------------------------------------------------------- tiers */

/**
 * Five price tiers, used for the goods this module prices itself — crops, tree fruit,
 * seeds, shop goods and materials.
 *
 * - `elasticity` — the exponent in `supplyFactor`. Higher swings harder.
 * - `recovery`   — the fraction of the way back to 1.0 the index travels each day.
 *
 * A staple is stiff and heals in a week (0.7^7 leaves 8 % of the shock); a prestige good is
 * violent and takes a fortnight (0.88^7 leaves 41 %). Slow to heal *and* violent to move is
 * what makes a luxury a judgement call rather than a printer.
 */
export type PriceTier = 'staple' | 'common' | 'quality' | 'luxury' | 'prestige'

const TIERS: Record<PriceTier, { elasticity: number; recovery: number }> = {
  staple: { elasticity: 0.35, recovery: 0.3 },
  common: { elasticity: 0.55, recovery: 0.24 },
  quality: { elasticity: 0.8, recovery: 0.19 },
  luxury: { elasticity: 1.1, recovery: 0.15 },
  prestige: { elasticity: 1.35, recovery: 0.12 },
}

/**
 * Market depth: units the market absorbs before the supply index has climbed by a full 1.0.
 *
 * Derived from elasticity rather than tabulated, so it holds for `products.ts`'s numbers as
 * well as for this file's own, and so the two properties can never be set inconsistently. A
 * staple's 0.35 gives 150 units; a luxury's 1.1 gives 27; a prestige good's 1.35 gives 20.
 * Stiff goods are also deep goods, which is the same statement twice and should stay that
 * way.
 */
const BASE_DEPTH = 150
const DEPTH_REFERENCE_ELASTICITY = 0.35
const DEPTH_EXPONENT = 1.5
const MIN_DEPTH = 10
const MAX_DEPTH = 200

/** Tier ladder from a base price alone. Only used where nothing else states one. */
function tierForPrice(base: number): PriceTier {
  if (base < 60) return 'staple'
  if (base < 180) return 'common'
  if (base < 500) return 'quality'
  if (base < 1600) return 'luxury'
  return 'prestige'
}

/**
 * Raw plants use the same ladder but stop at `quality`. A melon is expensive; it is still a
 * vegetable, and vegetables do not behave like wine.
 */
function cropTier(base: number): PriceTier {
  const tier = tierForPrice(base)
  return tier === 'luxury' || tier === 'prestige' ? 'quality' : tier
}

/* ---------------------------------------------------------------- seasonality */

/** Flat demand. Materials, seeds and shop goods have no season to them. */
const FLAT_SEASONAL: Record<Season, number> = { spring: 1, summer: 1, fall: 1, winter: 1 }

/** Harvest premium. "Fresh produce sells high at harvest", per the contract. */
const CROP_IN_SEASON = 1.25
/** Everything is a little scarcer in winter, even out of its own season. */
const CROP_WINTER = 1.05
/** Ordinary off-season slack. */
const CROP_OFF_SEASON = 0.9

/**
 * The per-season demand curve for a plant, inside the 0.8..1.3 band the contract names.
 * Published in the Almanac — this is a system the player plans around, not a hidden hand.
 */
function cropSeasonal(seasons: readonly Season[]): Record<Season, number> {
  const out: Record<Season, number> = { spring: 1, summer: 1, fall: 1, winter: 1 }
  for (const season of SEASONS) {
    out[season] = seasons.includes(season)
      ? CROP_IN_SEASON
      : season === 'winter'
        ? CROP_WINTER
        : CROP_OFF_SEASON
  }
  return out
}

/* ------------------------------------------------------------------ raw goods */

/** Which bucket a festival lifts, plus the two a festival never touches. */
export type GoodCategory = 'produce' | 'artisan' | 'animal' | 'material' | 'supply'

/**
 * Anything that grows in the ground or on a branch, by id. `crops.ts` and `trees.ts` are
 * the single source of truth for what a raw plant is worth — nothing is retyped here, so a
 * balance pass on a crop moves its market in the same edit.
 */
function plantById(id: string): CropDef | undefined {
  return cropById(id) ?? treeById(id)
}

const MATERIAL_IDS: readonly MaterialId[] = [
  'wood',
  'stone',
  'fibre',
  'plank',
  'bolt',
  'screw',
  'nail',
  'tape',
  'deed',
  'mallet',
  'axe',
  'saw',
]

/**
 * Buy-back on the two shop goods, at half list, so the shop cannot be farmed for gold.
 * `shop.ts` charges 400 and 100.
 */
const GOOD_BASE: Record<GoodId, number> = {
  sprinkler: 200,
  fertilizer: 50,
}

/** Seeds resell at half what they cost, and the market for them barely moves. */
const SEED_RESALE = 0.5

/**
 * What the market pays to take a material off the player's hands.
 *
 * `products.ts` calls these shadow values, because materials are not purchasable — but a
 * player who wants to dump a stack of stone should be able to, and be quietly sorry. They
 * are deliberately poor against what a material is *worth* to the farm: selling a land deed
 * for gold should always feel like a mistake, because it is one.
 *
 * The sawmill's `plank` is both a product and a `MaterialId`, so a plank is priced as the
 * product wherever the catalogue knows it, and a plank is worth a plank either way.
 */
function materialBase(id: MaterialId): number {
  return productById(id)?.econ.base ?? MATERIAL_VALUE[id]
}

/* ------------------------------------------------------------ self-priced goods */

/**
 * How this module prices something `products.ts` does not own: crops and tree fruit, seeds,
 * shop goods, materials, and any product id the catalogue has never heard of.
 */
interface GoodSpec {
  base: number
  tier: PriceTier
  seasonal: Record<Season, number>
}

function specFor(item: ItemRef): GoodSpec {
  switch (item.kind) {
    case 'produce': {
      const plant = plantById(item.cropId)
      const base = plant ? plant.basePrice : UNKNOWN_PRODUCT_BASE
      return {
        base,
        tier: cropTier(base),
        seasonal: plant ? cropSeasonal(plant.seasons) : FLAT_SEASONAL,
      }
    }
    case 'seed': {
      const plant = plantById(item.cropId)
      const cost = plant ? plant.seedCost : 40
      return {
        base: Math.round(cost * SEED_RESALE),
        tier: 'staple',
        seasonal: FLAT_SEASONAL,
      }
    }
    case 'good':
      return { base: GOOD_BASE[item.goodId], tier: 'staple', seasonal: FLAT_SEASONAL }
    case 'material':
      return { base: materialBase(item.materialId), tier: 'staple', seasonal: FLAT_SEASONAL }
    case 'product':
      return { base: UNKNOWN_PRODUCT_BASE, tier: 'common', seasonal: FLAT_SEASONAL }
  }
}

/* ------------------------------------------------------------------- helpers */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

/** Whole days since spring 1 of year 1. Day 0 is the first morning of the run. */
export function absoluteDay(state: GameState): number {
  const year = Math.max(1, Math.floor(state.year))
  const day = Math.max(1, Math.floor(state.day))
  const seasons = (year - 1) * SEASONS.length + seasonIndex(state.season)
  return seasons * DAYS_PER_SEASON + (day - 1)
}

/** The market week an absolute day falls in. Four whole weeks to a season. */
export function weekOf(day: number): number {
  return Math.floor(day / DAYS_PER_WEEK)
}

/** The season an absolute day falls in, without needing the rest of the state. */
export function seasonOfDay(day: number): Season {
  const perYear = DAYS_PER_SEASON * SEASONS.length
  const wrapped = ((Math.floor(day) % perYear) + perYear) % perYear
  return SEASONS[Math.floor(wrapped / DAYS_PER_SEASON)]
}

/**
 * The market's key for an item — **quality-insensitive on purpose**. Gold and normal melons
 * trade in the same melon market, so dumping gold ones depresses the price of both.
 *
 * This is deliberately *not* `itemKey` from `state.ts`, which does separate the qualities,
 * because the bag has to hold them apart and the market must not.
 */
export function marketKey(item: ItemRef): string {
  switch (item.kind) {
    case 'seed':
      return `seed:${item.cropId}`
    case 'produce':
      return `produce:${item.cropId}`
    case 'good':
      return `good:${item.goodId}`
    case 'product':
      return `product:${item.productId}`
    case 'material':
      return `material:${item.materialId}`
  }
}

/** The inverse of `marketKey`. Returns null for a key that names nothing real. */
export function itemFromKey(key: string): ItemRef | null {
  const cut = key.indexOf(':')
  if (cut <= 0) return null
  const kind = key.slice(0, cut)
  const id = key.slice(cut + 1)
  if (id.length === 0) return null
  switch (kind) {
    case 'seed':
      return { kind: 'seed', cropId: id }
    case 'produce':
      return { kind: 'produce', cropId: id, quality: 'normal' }
    case 'product':
      return { kind: 'product', productId: id, quality: 'normal' }
    case 'good':
      return id === 'sprinkler' || id === 'fertilizer' ? { kind: 'good', goodId: id } : null
    case 'material': {
      const material = MATERIAL_IDS.find((m) => m === id)
      return material ? { kind: 'material', materialId: material } : null
    }
    default:
      return null
  }
}

/**
 * Which bucket a festival lifts. `products.ts` sorts its goods into animal, artisan and
 * mineral; the contract's festival categories are produce, artisan and animal, so a metal
 * bar counts as artisan — it came out of a machine like everything else there.
 */
export function goodCategory(item: ItemRef): GoodCategory {
  switch (item.kind) {
    case 'produce':
      return 'produce'
    case 'seed':
    case 'good':
      return 'supply'
    case 'material':
      return 'material'
    case 'product':
      return productById(item.productId)?.category === 'animal' ? 'animal' : 'artisan'
  }
}

/** Only produce and products carry a quality through the chain. */
function qualityOf(item: ItemRef, quality: Quality): Quality {
  return item.kind === 'produce' || item.kind === 'product' ? quality : 'normal'
}

/**
 * False when the item is a product `products.ts` has never heard of, and is therefore
 * falling back to a placeholder price. Meant to be asserted in a test: an unpriced product
 * is a defect in whichever lane invented the id, and should never reach a player.
 */
export function isPriced(item: ItemRef): boolean {
  switch (item.kind) {
    case 'product':
      return productById(item.productId) !== undefined
    case 'produce':
    case 'seed':
      return plantById(item.cropId) !== undefined
    default:
      return true
  }
}

/* ------------------------------------------------------------------ economics */

/**
 * Everything the market knows about one good: its base price, how hard it swings, how fast
 * it heals, and what each season thinks of it. The Almanac renders this directly.
 *
 * For a product this is `products.ts`'s own `GoodEconomics`, copied so a caller cannot
 * reach through and edit the catalogue. For everything else it is built from the tier.
 */
export function economicsFor(item: ItemRef): GoodEconomics {
  if (item.kind === 'product') {
    const known = productById(item.productId)
    if (known) {
      return {
        base: Math.max(MIN_PRICE, Math.round(known.econ.base)),
        elasticity: known.econ.elasticity,
        recovery: known.econ.recovery,
        seasonal: { ...known.econ.seasonal },
      }
    }
  }
  const spec = specFor(item)
  const tier = TIERS[spec.tier]
  return {
    base: Math.max(MIN_PRICE, Math.round(spec.base)),
    elasticity: tier.elasticity,
    recovery: tier.recovery,
    seasonal: { ...spec.seasonal },
  }
}

/**
 * How many units the market absorbs before this good's supply index climbs by a full 1.0.
 * Falls straight out of elasticity, so a good that swings hard is also a good the market
 * saturates quickly — one property, stated once.
 */
export function marketDepth(item: ItemRef): number {
  const elasticity = clamp(economicsFor(item).elasticity, 0.05, 4)
  const scale = Math.pow(DEPTH_REFERENCE_ELASTICITY / elasticity, DEPTH_EXPONENT)
  return clamp(Math.round(BASE_DEPTH * scale), MIN_DEPTH, MAX_DEPTH)
}

/* --------------------------------------------------------------- supply index */

/**
 * `clamp(1 / supplyIndex ^ elasticity, 0.4, 1.8)`, exactly as the contract states it.
 * Above 1.0 the index depresses the price. The clamps are hard at both ends, and they hold
 * for a negative, zero, infinite or NaN input too.
 */
export function supplyFactor(index: number, elasticity: number): number {
  const safeIndex = clamp(index, MIN_SUPPLY_INDEX, MAX_SUPPLY_INDEX)
  const safeElasticity = clamp(elasticity, 0, 4)
  return clamp(1 / Math.pow(safeIndex, safeElasticity), SUPPLY_FACTOR_MIN, SUPPLY_FACTOR_MAX)
}

/** The live supply index for a good. 1.0 for anything the player has never traded. */
export function supplyIndexOf(state: GameState, item: ItemRef): number {
  const stored = state.market.supply[marketKey(item)]
  return stored === undefined ? 1 : clamp(stored, MIN_SUPPLY_INDEX, MAX_SUPPLY_INDEX)
}

/** Every good the player has actually traded, sorted so the ledger is stable. */
export function tradedGoods(state: GameState): string[] {
  return Object.keys(state.market.supply).sort()
}

/* --------------------------------------------------------------------- events */

interface EventShape {
  weight: number
  /** Days the event runs, counted inclusively from its start day. */
  days: number
  multiplier: number
}

/**
 * `docs/ECONOMY.md` section 3. Roughly a third of weeks are quiet, so an event stays an
 * event: 34 quiet against 66 spread across the four real ones.
 */
const EVENT_SHAPES: Record<MarketEvent['kind'], EventShape> = {
  quiet: { weight: 34, days: DAYS_PER_WEEK, multiplier: 1 },
  bumper: { weight: 17, days: 5, multiplier: 0.5 },
  shortage: { weight: 17, days: 4, multiplier: 1.6 },
  festival: { weight: 17, days: 3, multiplier: 1.3 },
  caravan: { weight: 15, days: 2, multiplier: 1.1 },
}

const EVENT_KINDS: readonly MarketEvent['kind'][] = [
  'quiet',
  'bumper',
  'shortage',
  'festival',
  'caravan',
]

const FESTIVAL_TARGETS: readonly GoodCategory[] = ['produce', 'artisan', 'animal']

/**
 * The level below which a product is common enough that a shortage in it is an opportunity
 * rather than a notice about something the player cannot make yet.
 */
const SHORTAGE_MAX_LEVEL = 40

/**
 * Every crop and tree the game knows, sorted, so a deterministic pick is stable however
 * either table happens to be ordered.
 */
const ALL_PLANT_IDS: readonly string[] = (() => {
  const ids = new Set<string>()
  for (const crop of CROPS) ids.add(crop.id)
  for (const tree of TREES) ids.add(tree.id)
  return Array.from(ids).sort()
})()

/** Goods common enough to be worth a shortage, as market keys. Sorted and stable. */
const SHORTAGE_PRODUCT_KEYS: readonly string[] = (() => {
  const keys = PRODUCTS.filter((p) => p.level <= SHORTAGE_MAX_LEVEL).map((p) => `product:${p.id}`)
  return keys.length > 0 ? keys.sort() : PRODUCTS.map((p) => `product:${p.id}`).sort()
})()

/** Everything that can be coming off the land in a season, as market keys. */
function seasonalProduceKeys(season: Season): string[] {
  const keys: string[] = []
  for (const id of ALL_PLANT_IDS) {
    if (plantById(id)?.seasons.includes(season)) keys.push(`produce:${id}`)
  }
  return keys
}

function weightedKind(rand: () => number): MarketEvent['kind'] {
  let total = 0
  for (const kind of EVENT_KINDS) total += EVENT_SHAPES[kind].weight
  let roll = rand() * total
  for (const kind of EVENT_KINDS) {
    roll -= EVENT_SHAPES[kind].weight
    if (roll < 0) return kind
  }
  return 'quiet'
}

function choose<T>(rand: () => number, items: readonly T[], fallback: T): T {
  if (items.length === 0) return fallback
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))]
}

/**
 * One roll per week, deterministic from the seed and the week number alone — call it on any
 * day of that week and it answers the same thing, which is what lets the overnight pass ask
 * every morning without ever re-rolling.
 *
 * A real event starts 0-2 days into the week rather than always on the first morning, so
 * weeks do not all feel identical, and every duration still finishes inside its own week.
 */
export function rollWeeklyEvent(state: GameState): MarketEvent {
  const week = weekOf(absoluteDay(state))
  const rand = rngFor(state.seed, `market:event:${week}`)
  const kind = weightedKind(rand)
  const shape = EVENT_SHAPES[kind]
  const weekStart = week * DAYS_PER_WEEK

  if (kind === 'quiet') {
    return {
      kind,
      target: null,
      multiplier: 1,
      startDay: weekStart,
      endDay: weekStart + DAYS_PER_WEEK - 1,
    }
  }

  const offset = Math.min(2, Math.floor(rand() * 3))
  const startDay = weekStart + offset
  const season = seasonOfDay(startDay)

  let target: string | null = null
  if (kind === 'bumper') {
    // A glut in something nobody is growing is not an event, so bumpers pick in season.
    target = choose(rand, seasonalProduceKeys(season), 'produce:wheat')
  } else if (kind === 'shortage') {
    const pool = seasonalProduceKeys(season).concat(SHORTAGE_PRODUCT_KEYS)
    target = choose(rand, pool, 'product:egg')
  } else if (kind === 'festival') {
    target = choose(rand, FESTIVAL_TARGETS, 'produce')
  }

  return {
    kind,
    target,
    multiplier: shape.multiplier,
    startDay,
    endDay: startDay + shape.days - 1,
  }
}

/** True on any day the event is running. `endDay` is inclusive. */
export function eventIsActive(event: MarketEvent | null, day: number): boolean {
  if (!event || event.kind === 'quiet') return false
  return day >= event.startDay && day <= event.endDay
}

/** True on the single morning the event should be announced in the day report. */
export function eventBeginsToday(event: MarketEvent | null, day: number): boolean {
  return !!event && event.kind !== 'quiet' && event.startDay === day
}

/** What today's event does to this item's price. 1.0 when nothing applies. */
export function eventMultiplier(event: MarketEvent | null, day: number, item: ItemRef): number {
  if (!event || !eventIsActive(event, day)) return 1
  switch (event.kind) {
    case 'caravan':
      return event.multiplier
    case 'festival':
      return event.target === goodCategory(item) ? event.multiplier : 1
    case 'bumper':
    case 'shortage':
      return event.target === marketKey(item) ? event.multiplier : 1
    default:
      return 1
  }
}

/**
 * The rare seed a trade caravan brings, or null when no caravan is in town. Picked from
 * crops that are *not* in season, which is exactly what makes it worth stopping for.
 */
export function caravanSeed(state: GameState): string | null {
  const day = absoluteDay(state)
  const event = state.market.event
  if (!event || event.kind !== 'caravan' || !eventIsActive(event, day)) return null
  const season = seasonOfDay(day)
  const sowable = CROPS.map((crop) => crop.id)
  const offSeason = sowable.filter((id) => !cropById(id)?.seasons.includes(season))
  const rand = rngFor(state.seed, `market:caravan:${weekOf(day)}`)
  const fallback: string | null = sowable.length > 0 ? sowable[0] : null
  return choose(rand, offSeason, fallback)
}

/**
 * The `seasonalDemand` term of the price formula: the published per-season multiplier for
 * this good, times whatever the week's event is doing to it. Both are demand shocks, so
 * both belong in the same term, and the Ledger can show them apart via `eventMultiplier`.
 */
export function seasonalDemand(state: GameState, item: ItemRef): number {
  const econ = economicsFor(item)
  const seasonal = econ.seasonal[state.season] ?? 1
  return seasonal * eventMultiplier(state.market.event, absoluteDay(state), item)
}

/* ----------------------------------------------------------------- reputation */

/**
 * 0.95x at nothing, 1.00x at the starting 250, 1.08x at a spotless 1000 — the band
 * `docs/ECONOMY.md` section 6 names. Two straight segments rather than one, so the opening
 * state is exactly neutral and *losing* standing has a real, visible cost instead of merely
 * being a smaller gain.
 */
export function reputationBonus(reputation: number): number {
  const rep = clamp(reputation, REPUTATION_MIN, REPUTATION_MAX)
  if (rep <= REPUTATION_START) {
    return REPUTATION_FLOOR_BONUS + (rep / REPUTATION_START) * (1 - REPUTATION_FLOOR_BONUS)
  }
  const above = (rep - REPUTATION_START) / (REPUTATION_MAX - REPUTATION_START)
  return 1 + above * (REPUTATION_CEIL_BONUS - 1)
}

/* --------------------------------------------------------------------- prices */

/**
 * The formula itself, unrounded, against a supplied supply index. `econ` is passed in so a
 * batch can price two hundred units without rebuilding the same table two hundred times.
 */
function rawPrice(
  state: GameState,
  item: ItemRef,
  quality: Quality,
  index: number,
  econ: GoodEconomics,
): number {
  const q = QUALITY_MULTIPLIER[qualityOf(item, quality)]
  const supply = supplyFactor(index, econ.elasticity)
  const event = eventMultiplier(state.market.event, absoluteDay(state), item)
  const demand = (econ.seasonal[state.season] ?? 1) * event
  return econ.base * q * supply * demand * reputationBonus(state.market.reputation)
}

/**
 * Today's price for an item as it stands, using whatever quality the reference carries.
 *
 * `round(base x quality x supply x seasonalDemand x reputation)`, floored at 1 gold.
 */
export function priceOf(state: GameState, item: ItemRef): number {
  const quality = item.kind === 'produce' || item.kind === 'product' ? item.quality : 'normal'
  return sellPrice(state, item, quality)
}

/** Today's price at an explicit quality. Quality is ignored where a good cannot carry one. */
export function sellPrice(state: GameState, item: ItemRef, quality: Quality): number {
  const value = rawPrice(state, item, quality, supplyIndexOf(state, item), economicsFor(item))
  return Math.max(MIN_PRICE, Math.round(value))
}

/**
 * What `count` units actually fetch if they are all sold now.
 *
 * Priced **incrementally**: the supply index climbs as the lot goes out, so later units in
 * the same batch fetch less than the first. This is what makes "harvest and dump" visibly
 * worse than spreading a crop out — spreading earns a day of recovery between sales and a
 * batch earns none — without ever being punishing, because the 0.4 floor still applies.
 *
 * Selling two hundred parsnips in one evening averages about 85 % of list. Selling the same
 * two hundred over three weeks earns about 13 % more, and two dozen cheeses about 23 %.
 * Visibly worse, never ruinous, exactly as `docs/ECONOMY.md` section 10 asks.
 */
export function saleProceeds(
  state: GameState,
  item: ItemRef,
  quality: Quality,
  count: number,
): number {
  const units = Math.floor(count)
  if (units <= 0) return 0
  const econ = economicsFor(item)
  const depth = marketDepth(item)
  const start = supplyIndexOf(state, item)
  // Each unit is priced at the index the one before it left behind, so the very first unit
  // fetches exactly the `sellPrice` the player was quoted and only the rest of the lot pays
  // for the flood. Exact for a lot of 256 or fewer, a close approximation above that.
  const steps = Math.min(units, 256)
  const per = units / steps
  let total = 0
  for (let i = 0; i < steps; i++) {
    total += per * rawPrice(state, item, quality, start + (i * per) / depth, econ)
  }
  return Math.max(units * MIN_PRICE, Math.round(total))
}

/* ------------------------------------------------------------------ mutations */

function cloneMarket(market: Market): Market {
  const copy: Market = {
    supply: { ...market.supply },
    event: market.event ? { ...market.event } : null,
    eventWeek: market.eventWeek,
    reputation: market.reputation,
    history: market.history.map((point) => ({ day: point.day, prices: { ...point.prices } })),
  }
  // The assessor's opening figures ride along: dropping them here would reset the season's
  // books every time a price decayed, and the levy would then be charged on the wrong number.
  if (market.ledger !== undefined) copy.ledger = { ...market.ledger }
  return copy
}

function withMarket(state: GameState, market: Market): GameState {
  return { ...state, market }
}

/** A fresh, neutral market. `createState` should use this rather than build one by hand. */
export function createMarket(): Market {
  return {
    supply: {},
    event: null,
    eventWeek: -1,
    reputation: REPUTATION_START,
    history: [],
  }
}

/**
 * Record that `count` units of a good went to market, pushing its supply index up by
 * `count / marketDepth`.
 *
 * The key is created on the first sale and then **kept forever, even once it has healed
 * back to exactly 1.0**: the supply record doubles as the register of what this farm has
 * ever traded, which is what bounds the ledger's price history to goods the player has an
 * actual interest in.
 */
export function applySale(state: GameState, item: ItemRef, count: number): GameState {
  const units = Math.floor(count)
  if (units <= 0) return state
  const key = marketKey(item)
  const market = cloneMarket(state.market)
  const current = market.supply[key] === undefined ? 1 : market.supply[key]
  market.supply[key] = clamp(
    current + units / marketDepth(item),
    MIN_SUPPLY_INDEX,
    MAX_SUPPLY_INDEX,
  )
  return withMarket(state, market)
}

/**
 * Decay every supply index a `recovery` fraction of the way back toward 1.0.
 *
 * At a staple's 0.30 a flooded market is 92 % healed in a week; at a luxury's 0.15 it takes
 * about a fortnight. Being slow to heal *and* violent to move is what stops the expensive
 * goods from being a strictly dominant strategy.
 */
export function dailyRecovery(state: GameState): GameState {
  const market = cloneMarket(state.market)
  for (const key of Object.keys(market.supply)) {
    const item = itemFromKey(key)
    if (!item) {
      // A key from a corrupt or future save. Neutralise it rather than throw.
      market.supply[key] = 1
      continue
    }
    const recovery = clamp(economicsFor(item).recovery, 0, 1)
    const next = 1 + (market.supply[key] - 1) * (1 - recovery)
    market.supply[key] =
      Math.abs(next - 1) < SUPPLY_EPSILON ? 1 : clamp(next, MIN_SUPPLY_INDEX, MAX_SUPPLY_INDEX)
  }
  return withMarket(state, market)
}

/**
 * Roll this week's event if the stored one is stale. Idempotent within a week — it returns
 * the very same state object — so the overnight pass can call it every morning.
 */
export function refreshEvent(state: GameState): GameState {
  const week = weekOf(absoluteDay(state))
  if (state.market.eventWeek === week && state.market.event) return state
  const market = cloneMarket(state.market)
  market.event = rollWeeklyEvent(state)
  market.eventWeek = week
  return withMarket(state, market)
}

/**
 * Append today's closing prices to the ledger's history.
 *
 * Only goods in the supply record are tracked — that is, goods the player has actually
 * traded — and prices are recorded at `normal` quality, because the chart is about the
 * market rather than about what happened to be in the bag. The list is bounded to
 * `HISTORY_DAYS`, oldest dropped. Calling it twice in one day replaces that day's point
 * rather than duplicating it.
 */
export function recordPrices(state: GameState): GameState {
  const day = absoluteDay(state)
  const prices: Record<string, number> = {}
  for (const key of tradedGoods(state)) {
    const item = itemFromKey(key)
    if (item) prices[key] = sellPrice(state, item, 'normal')
  }
  const point: PricePoint = { day, prices }

  const market = cloneMarket(state.market)
  const existing = market.history.findIndex((p) => p.day === day)
  if (existing >= 0) market.history[existing] = point
  else market.history.push(point)
  if (market.history.length > HISTORY_DAYS) {
    market.history = market.history.slice(market.history.length - HISTORY_DAYS)
  }
  return withMarket(state, market)
}
