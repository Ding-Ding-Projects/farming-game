/**
 * The market floor: the five selling channels, the order board, reputation, credit and
 * tax. `economy.ts` answers *what a thing is worth right now*; this module answers
 * *where you sell it, to whom, on what terms, and what the assessor takes at the end of
 * the season*.
 *
 * Contract: docs/ECONOMY.md sections 4 to 8.
 *
 * Pure, like the rest of `src/game`: no canvas, no DOM, no clock, no `Math.random`.
 * Every roll arrives as a generator the caller built with `rngFor(seed, salt)`, so a
 * save always replays identically.
 *
 * Two published curves live here and neither is a hidden roll:
 *
 *   the stall    units sell per night at a rate that is a function of the price the
 *                player named, relative to the market price. See `stallSellRate`.
 *   the levy     a flat rate on the season's net trade, itemised. See `seasonalTax`.
 */
import { DAY_END, SEASONS } from './constants'
import { cropsForSeason } from './crops'
import {
  REPUTATION_MAX,
  absoluteDay,
  applySale,
  itemFromKey,
  marketKey,
  priceOf,
  saleProceeds,
  tradedGoods,
} from './economy'
import { addMaterials, depositItem, grantXp } from './progression'
import { pick, randInt } from './rng'
import { cloneState, countItem, itemKey, itemName, removeItem } from './state'
import { nextSeason, seasonIndex } from './time'
import type { Loan, Market, MaterialId, Order, OrderKind, TradeLedger } from './farm-types'
import type { ActionResult, GameState, ItemRef, Quality, SoundId } from './types'

// ---------------------------------------------------------------------------
// published numbers
// ---------------------------------------------------------------------------

/** Slots on the roadside stall. `createState` should size `state.stall` to this. */
export const STALL_SLOTS = 6

/** A player-set price may run from half to double the current market price. */
export const STALL_PRICE_FLOOR = 0.5
export const STALL_PRICE_CEILING = 2

/**
 * The stall curve, written out so the Almanac can print it verbatim:
 *
 *   ratio = yourPrice / marketPrice, clamped to 0.5 .. 2.0
 *   rate  = 0.02 + 0.58 * ((2 - ratio) / 1.5) ^ 2.2      // share of stock sold per night
 *   rate  = rate * (0.85 + 0.30 * reputation / 1000)
 *
 * At half price roughly three fifths of the stock moves in a night. At market price
 * about a quarter. At double, one unit in fifty — it really can sit all season.
 */
export const STALL_BASE_RATE = 0.02
export const STALL_RATE_SPAN = 0.58
export const STALL_RATE_CURVE = 2.2
export const STALL_RATE_MIN = 0.01
export const STALL_RATE_MAX = 0.75

/** A roadside stall only has so many passers-by, however cheap the goods are. */
export const STALL_NIGHTLY_CAP = 12

/** The town market pays over the closing price, and costs a walk to get there. */
export const MARKET_BONUS = 1.1
export const MARKET_TRIP_ENERGY = 6
export const MARKET_TRIP_MINUTES = 60

/**
 * Standing earned by trading, per this much gold in one settlement, capped per
 * settlement. Deliberately a trickle and deliberately *not* concave: a floor of the whole
 * lot means splitting a stack into ten sales earns less than selling it once, never more,
 * so there is nothing to farm. Contracts are the real reputation lever.
 */
export const TRADE_REPUTATION_PER = 2000
export const TRADE_REPUTATION_CAP = 4

/** Offers kept on the board when nothing is stopping them. */
export const DELIVERY_OFFERS = 3
export const CRATE_OFFERS = 1
/** A boat crate will not come near a farm the town has not heard of. */
export const CRATE_REPUTATION = 350
export const CRATE_LEVEL = 8

/** Credit. Interest is charged once, at the end of each season. */
export const LOAN_TERM_SEASONS = 4
export const MAX_LOANS = 3
export const LOAN_MINIMUM = 100
export const LOAN_RATE_MAX = 0.1
export const LOAN_RATE_MIN = 0.05
/** A missed instalment costs standing and puts this much on that loan's rate. */
export const MISSED_PAYMENT_REPUTATION = 20
export const MISSED_PAYMENT_RATE_STEP = 0.015
export const LOAN_RATE_CEILING = 0.2
/** Clearing a loan outright is the cheapest reputation in the game. */
export const LOAN_CLEARED_REPUTATION = 10
/** Unpaid tax is carried as a debt at the kindest rate there is. Nothing is repossessed. */
export const TAX_ARREARS_RATE = 0.05

/** The levy. Flat, published, itemised, and applied to the season's net trade. */
export const TAX_RATE = 0.08

// ---------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

function refuse(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function done(state: GameState, message: string, sound: SoundId): ActionResult {
  return { state, ok: true, message, sound, fx: [] }
}

/** Whole quantities of at least one, or null for a nonsense request. */
function whole(n: number, min: number): number | null {
  if (!Number.isFinite(n)) return null
  const v = Math.floor(n)
  return v >= min ? v : null
}

function cloneItemRef(item: ItemRef): ItemRef {
  switch (item.kind) {
    case 'seed':
      return { kind: 'seed', cropId: item.cropId }
    case 'produce':
      return { kind: 'produce', cropId: item.cropId, quality: item.quality }
    case 'good':
      return { kind: 'good', goodId: item.goodId }
    case 'product':
      return { kind: 'product', productId: item.productId, quality: item.quality }
    case 'material':
      return { kind: 'material', materialId: item.materialId }
  }
}

/**
 * A working copy. `cloneState` deep-copies the land, the bag and every wave-3 collection,
 * so nothing in this module can write through a shared reference into the caller's state.
 * Every mutating verb starts with this.
 */
function prepare(state: GameState): GameState {
  return cloneState(state)
}

/**
 * Absolute season index: spring of year one is 0. Loans and the levy are seasonal, so
 * they count in these; orders are daily and count in `absoluteDay` from `economy.ts`.
 */
export function absoluteSeason(state: GameState): number {
  return (state.year - 1) * SEASONS.length + seasonIndex(state.season)
}

/** "SUMMER YEAR 2", for loan and order copy. */
export function seasonLabel(abs: number): string {
  const idx = ((abs % SEASONS.length) + SEASONS.length) % SEASONS.length
  return `${SEASONS[idx].toUpperCase()} YEAR ${Math.floor(abs / SEASONS.length) + 1}`
}

// ---------------------------------------------------------------------------
// reputation
// ---------------------------------------------------------------------------

const RANKS: ReadonlyArray<{ at: number; name: string }> = [
  { at: 0, name: 'UNKNOWN' },
  { at: 100, name: 'NEWCOMER' },
  { at: 250, name: 'KNOWN' },
  { at: 450, name: 'TRUSTED' },
  { at: 650, name: 'RENOWNED' },
  { at: 850, name: 'BELOVED' },
]

/** The named rank. The exact number is always shown beside it — never a bare rating. */
export function reputationRank(reputation: number): string {
  let name = RANKS[0].name
  for (const rank of RANKS) if (reputation >= rank.at) name = rank.name
  return name
}

/** Mutates in place; only ever called on a state `prepare` has already detached. */
function gainReputation(next: GameState, delta: number): void {
  next.market.reputation = Math.round(clamp(next.market.reputation + delta, 0, REPUTATION_MAX))
}

/** The standing a settlement of this size earns. */
export function tradeReputation(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return clamp(Math.floor(total / TRADE_REPUTATION_PER), 0, TRADE_REPUTATION_CAP)
}

/** Order tier, 0..3. The lucrative work needs standing. */
export function orderTier(reputation: number): number {
  if (reputation >= 700) return 3
  if (reputation >= 450) return 2
  if (reputation >= 200) return 1
  return 0
}

/** How many orders may be accepted at once. Over-committing has to be possible. */
export function maxAcceptedOrders(state: GameState): number {
  return 2 + orderTier(state.market.reputation)
}

// ---------------------------------------------------------------------------
// the season ledger the levy is assessed on
// ---------------------------------------------------------------------------

/**
 * The opening trade figures for the season being taxed — `Market.ledger`, re-exported here
 * because the levy is the only thing that writes it.
 *
 * It stores a *snapshot*, not a running total, so it needs no cooperation from any other
 * module: the season's gross is `stats.earned` now minus `earnedAt`, and the season's
 * expenses are `stats.spent` now minus `spentAt`. Every lane already books trade into
 * those two counters.
 */
export type { TradeLedger } from './farm-types'

function ledgerOf(market: Market): TradeLedger | undefined {
  return market.ledger
}

function setLedger(market: Market, ledger: TradeLedger): void {
  market.ledger = ledger
}

/**
 * This season's trade, and whether it is exact.
 *
 * Exact when the assessor holds an opening figure for this season. Otherwise it averages
 * lifetime trade across the seasons farmed so far — which is exactly right for a first
 * season and a fair, entirely predictable approximation afterwards. Both rules are
 * printed in the seasonal report; neither is a surprise.
 */
export function seasonFigures(state: GameState): {
  gross: number
  expenses: number
  exact: boolean
} {
  const abs = absoluteSeason(state)
  const ledger = ledgerOf(state.market)
  if (ledger !== undefined && ledger.season === abs) {
    return {
      gross: Math.max(0, Math.round(state.stats.earned - ledger.earnedAt)),
      expenses: Math.max(0, Math.round(state.stats.spent - ledger.spentAt)),
      exact: true,
    }
  }
  const seasons = Math.max(1, abs + 1)
  return {
    gross: Math.max(0, Math.round(state.stats.earned / seasons)),
    expenses: Math.max(0, Math.round(state.stats.spent / seasons)),
    exact: false,
  }
}

// ---------------------------------------------------------------------------
// settling a sale
// ---------------------------------------------------------------------------

/** The quality a reference carries, or `normal` for a good that cannot carry one. */
function qualityOf(item: ItemRef): Quality {
  return item.kind === 'produce' || item.kind === 'product' ? item.quality : 'normal'
}

/**
 * Books gold, trade stats, supply pressure and the trickle of standing that steady trade
 * earns. Callers have already proved the goods are in the bag and priced the lot.
 */
function settleSale(state: GameState, item: ItemRef, count: number, total: number): GameState {
  const stripped = removeItem(state, item, count)
  if (stripped === null) return state
  const next = prepare(applySale(stripped, item, count))
  next.gold += total
  next.stats.earned += total
  gainReputation(next, tradeReputation(total))
  return next
}

/** The closing price of one unit, before any channel's premium. */
export function closingPrice(state: GameState, item: ItemRef): number {
  return Math.max(0, Math.round(priceOf(state, item)))
}

/**
 * What a lot actually fetches through a channel that sells it all at once — priced
 * incrementally by `economy.saleProceeds`, so a dump earns less per unit than a trickle.
 */
export function channelProceeds(state: GameState, item: ItemRef, count: number): number {
  return saleProceeds(state, item, qualityOf(item), count)
}

/**
 * Shipping bin. The safe default: no walk, no energy, no decision — the evening's
 * closing price, settled on the spot.
 */
export function shipToBin(state: GameState, item: ItemRef, count: number): ActionResult {
  const n = whole(count, 1)
  if (n === null) return refuse(state, 'SHIP AT LEAST ONE')
  const held = countItem(state, item)
  if (held < n) {
    return refuse(state, held === 0 ? `NO ${itemName(item)} IN THE BAG` : `ONLY ${held} IN THE BAG`)
  }
  const total = channelProceeds(state, item, n)
  if (total <= 0) return refuse(state, `NOBODY WANTS ${itemName(item)}`)
  const next = settleSale(state, item, n, total)
  return done(next, `SHIPPED ${itemName(item)} X${n} - ${total}G AT CLOSING`, 'sell')
}

/**
 * Town market. Ten per cent over the closing price, and it costs an hour and the legs
 * to get there. The price is the live one, so the player can look before committing.
 */
export function sellAtMarket(state: GameState, item: ItemRef, count: number): ActionResult {
  const n = whole(count, 1)
  if (n === null) return refuse(state, 'SELL AT LEAST ONE')
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')
  if (state.energy < MARKET_TRIP_ENERGY) return refuse(state, 'TOO TIRED TO WALK TO TOWN.')
  if (state.minutes + MARKET_TRIP_MINUTES > DAY_END) {
    return refuse(state, 'THE MARKET IS SHUT FOR THE NIGHT.')
  }
  const held = countItem(state, item)
  if (held < n) {
    return refuse(state, held === 0 ? `NO ${itemName(item)} IN THE BAG` : `ONLY ${held} IN THE BAG`)
  }
  const total = Math.round(channelProceeds(state, item, n) * MARKET_BONUS)
  if (total <= 0) return refuse(state, `NOBODY WANTS ${itemName(item)}`)

  const next = settleSale(state, item, n, total)
  next.energy = Math.max(0, next.energy - MARKET_TRIP_ENERGY)
  next.minutes = Math.min(DAY_END, next.minutes + MARKET_TRIP_MINUTES)
  if (next.energy <= 0 || next.minutes >= DAY_END) next.passedOut = true
  return done(next, `SOLD ${itemName(item)} X${n} IN TOWN FOR ${total}G`, 'sell')
}

// ---------------------------------------------------------------------------
// the roadside stall
// ---------------------------------------------------------------------------

/** Half the market price, rounded, and never below one gold. */
export function stallPriceFloor(state: GameState, item: ItemRef): number {
  return Math.max(1, Math.round(closingPrice(state, item) * STALL_PRICE_FLOOR))
}

/** Double the market price, rounded. */
export function stallPriceCeiling(state: GameState, item: ItemRef): number {
  const ceiling = Math.round(closingPrice(state, item) * STALL_PRICE_CEILING)
  return Math.max(stallPriceFloor(state, item), ceiling)
}

/** The player names the price; the town decides how fast that price moves stock. */
export function clampStallPrice(state: GameState, item: ItemRef, price: number): number {
  const lo = stallPriceFloor(state, item)
  const hi = stallPriceCeiling(state, item)
  if (!Number.isFinite(price)) return lo
  return clamp(Math.round(price), lo, hi)
}

/**
 * The share of a slot's remaining stock that sells in one night. Published, not rolled.
 * Before the standing factor:
 *
 * | your price | share per night | a week later | a season later |
 * |---|---|---|---|
 * | half market | 0.60 | sold out | sold out |
 * | market      | 0.26 | 88 % gone | sold out |
 * | 1.25x       | 0.15 | 66 % gone | 99 % gone |
 * | 1.5x        | 0.07 | 41 % gone | 88 % gone |
 * | double      | 0.02 | 13 % gone | 43 % gone |
 *
 * Which makes the honest read: patience is worth about 1.3x list around 1.4x-1.5x, and
 * greed at double is worth *less* than simply shipping the lot. That is the judgement the
 * stall is for, and the player can work it out on paper before they commit a single unit.
 *
 * Reputation scales the whole curve by 0.85 at nothing to 1.15 at a thousand.
 * `nightlyStall` then caps a single night at `STALL_NIGHTLY_CAP` units per slot.
 */
export function stallSellRate(state: GameState, slot: number): number {
  const s = state.stall[slot]
  if (s === undefined || s.item === null || s.count <= 0) return 0
  const market = closingPrice(state, s.item)
  const ratio =
    market <= 0
      ? STALL_PRICE_CEILING
      : clamp(s.price / market, STALL_PRICE_FLOOR, STALL_PRICE_CEILING)
  const span = (STALL_PRICE_CEILING - ratio) / (STALL_PRICE_CEILING - STALL_PRICE_FLOOR)
  const base = STALL_BASE_RATE + STALL_RATE_SPAN * Math.pow(Math.max(0, span), STALL_RATE_CURVE)
  const standing = 0.85 + 0.3 * (clamp(state.market.reputation, 0, REPUTATION_MAX) / REPUTATION_MAX)
  return clamp(base * standing, STALL_RATE_MIN, STALL_RATE_MAX)
}

/**
 * Stock a slot and name a price. `count` of zero reprices a slot that already holds
 * something, which is the whole point of the stall: the player is allowed to change
 * their mind about what a thing is worth.
 */
export function stockStall(
  state: GameState,
  slot: number,
  item: ItemRef,
  count: number,
  price: number,
): ActionResult {
  if (state.stall.length === 0) return refuse(state, 'THERE IS NO ROADSIDE STALL YET')
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.stall.length) {
    return refuse(state, `THE STALL HAS ${state.stall.length} SLOTS`)
  }
  const n = whole(count, 0)
  if (n === null) return refuse(state, 'STOCK A WHOLE NUMBER')

  const current = state.stall[slot]
  const key = itemKey(item)
  const occupied = current.item !== null && current.count > 0
  if (occupied && itemKey(current.item as ItemRef) !== key) {
    return refuse(state, `SLOT ${slot + 1} HOLDS ${itemName(current.item as ItemRef)}`)
  }
  if (n === 0 && !occupied) return refuse(state, 'STOCK THE SLOT BEFORE PRICING IT')
  if (n > 0) {
    const held = countItem(state, item)
    if (held < n) {
      return refuse(
        state,
        held === 0 ? `NO ${itemName(item)} IN THE BAG` : `ONLY ${held} IN THE BAG`,
      )
    }
  }

  const asked = Math.round(Number.isFinite(price) ? price : 0)
  const set = clampStallPrice(state, item, price)
  const stripped = n > 0 ? removeItem(state, item, n) : state
  if (stripped === null) return refuse(state, `NO ${itemName(item)} IN THE BAG`)

  const next = prepare(stripped)
  const target = next.stall[slot]
  if (!occupied) target.sold = 0
  target.item = cloneItemRef(item)
  target.count = (occupied ? target.count : 0) + n
  target.price = set

  const rate = Math.round(stallSellRate(next, slot) * 100)
  const clamped =
    asked === set ? '' : asked > set ? ` (DOWN FROM ${asked}G)` : ` (UP FROM ${asked}G)`
  const label = itemName(item)
  const message =
    n > 0
      ? `STALL SLOT ${slot + 1}: ${label} X${target.count} AT ${set}G${clamped} - ${rate}% A NIGHT`
      : `SLOT ${slot + 1} NOW ${set}G${clamped} - ${rate}% A NIGHT`
  return done(next, message, 'select')
}

/**
 * Take unsold stock back off the stall. Goes through the store caps like any other
 * deposit, and whatever will not fit simply stays on the stall rather than evaporating.
 */
export function unstockStall(state: GameState, slot: number): ActionResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.stall.length) {
    return refuse(state, 'NO SUCH STALL SLOT')
  }
  const current = state.stall[slot]
  if (current.item === null || current.count <= 0) return refuse(state, 'THAT SLOT IS EMPTY')

  const item = cloneItemRef(current.item)
  const deposit = depositItem(state, item, current.count)
  if (deposit.stored <= 0) return refuse(state, deposit.message)

  const next = prepare(deposit.state)
  const target = next.stall[slot]
  target.count -= deposit.stored
  if (target.count <= 0) {
    target.count = 0
    target.item = null
    target.price = 0
    target.sold = 0
  }
  const left = target.count > 0 ? ` - ${target.count} LEFT ON THE STALL` : ''
  return done(next, `TOOK BACK ${itemName(item)} X${deposit.stored}${left}`, 'select')
}

/**
 * The overnight pass for the stall. One shared generator, so the whole night is one
 * deterministic stream. Fractional demand is honoured rather than dropped: a slot owed
 * 0.4 of a sale sells one unit two nights in five.
 */
export function nightlyStall(
  state: GameState,
  rand: () => number,
): { state: GameState; sold: number; earned: number } {
  let next = state
  let sold = 0
  let earned = 0

  for (let i = 0; i < state.stall.length; i++) {
    const slot = next.stall[i]
    if (slot === undefined || slot.item === null || slot.count <= 0) continue
    const rate = stallSellRate(next, i)
    const exact = rate * slot.count
    let units = Math.floor(exact)
    if (rand() < exact - units) units += 1
    units = Math.min(units, slot.count, STALL_NIGHTLY_CAP)
    if (units <= 0) continue

    const item = slot.item
    const price = slot.price
    const take = units
    const total = price * take

    next = prepare(applySale(next, item, take))
    const after = next.stall[i]
    after.count -= take
    after.sold += take
    if (after.count <= 0) {
      after.count = 0
      after.item = null
    }
    next.gold += total
    next.stats.earned += total
    sold += take
    earned += total
  }

  // One night, one settlement: six busy slots are still one evening's trade.
  if (earned > 0) gainReputation(next, tradeReputation(earned))
  return { state: next, sold, earned }
}

// ---------------------------------------------------------------------------
// orders and boat crates
// ---------------------------------------------------------------------------

const QUALITY_RANK: Record<Quality, number> = { normal: 0, silver: 1, gold: 2 }
const QUALITIES: readonly Quality[] = ['normal', 'silver', 'gold']

const ORDER_MATERIALS: readonly MaterialId[] = ['plank', 'nail', 'screw', 'bolt', 'tape']
const CRATE_TOOLS: readonly MaterialId[] = ['mallet', 'saw', 'axe']

/** How much bigger the work gets as the town learns your name. */
const TIER_VALUE: readonly number[] = [0.7, 1, 1.45, 1.95]

function round10(value: number): number {
  return Math.max(10, Math.round(value / 10) * 10)
}

function atQuality(item: ItemRef, quality: Quality): ItemRef {
  if (item.kind === 'produce') return { kind: 'produce', cropId: item.cropId, quality }
  if (item.kind === 'product') return { kind: 'product', productId: item.productId, quality }
  return cloneItemRef(item)
}

/**
 * What the town may reasonably ask for: what is in the bag, what this farm has already
 * traded, and the crops of the season now and the season next. Nothing else — which is
 * why no crate asks for cheese before the player owns a dairy, and no order asks for a
 * winter root in spring of year one.
 */
export function producibleGoods(state: GameState): ItemRef[] {
  const seen = new Set<string>()
  const pool: ItemRef[] = []
  const add = (item: ItemRef): void => {
    if (item.kind !== 'produce' && item.kind !== 'product') return
    const key = marketKey(item)
    if (seen.has(key)) return
    seen.add(key)
    pool.push(item)
  }

  for (const entry of state.inventory) {
    if (entry.count <= 0) continue
    add(atQuality(entry.item, 'normal'))
  }
  for (const key of tradedGoods(state)) {
    const item = itemFromKey(key)
    if (item !== null) add(item)
  }
  for (const season of [state.season, nextSeason(state.season)]) {
    for (const crop of cropsForSeason(season)) {
      add({ kind: 'produce', cropId: crop.id, quality: 'normal' })
    }
  }

  return pool
}

function freshId(state: GameState, prefix: string, day: number): string {
  let n = 1
  let id = `${prefix}${day}-${n}`
  while (state.orders.some((order) => order.id === id)) {
    n += 1
    id = `${prefix}${day}-${n}`
  }
  return id
}

function rollLine(
  state: GameState,
  rand: () => number,
  item: ItemRef,
  value: number,
  silverChance: number,
): { item: ItemRef; count: number; minQuality: Quality; worth: number } {
  const minQuality: Quality = rand() < silverChance ? 'silver' : 'normal'
  const asked = atQuality(item, minQuality)
  const unit = Math.max(1, closingPrice(state, asked))
  const count = clamp(Math.round(value / unit), 3, 60)
  return { item: asked, count, minQuality, worth: unit * count }
}

function rollDelivery(state: GameState, rand: () => number, pool: ItemRef[]): Order {
  const day = absoluteDay(state)
  const tier = orderTier(state.market.reputation)
  const scale = TIER_VALUE[tier]
  const line = rollLine(state, rand, pick(rand, pool), randInt(rand, 180, 520) * scale, 0.18)
  const premium = 1.22 + rand() * 0.18 + (line.minQuality === 'silver' ? 0.12 : 0)

  const materials: Partial<Record<MaterialId, number>> = {}
  if (rand() < 0.45) materials[pick(rand, ORDER_MATERIALS)] = randInt(rand, 1, 3)

  return {
    id: freshId(state, 'd', day),
    kind: 'delivery',
    lines: [{ item: line.item, count: line.count, minQuality: line.minQuality }],
    reward: round10(line.worth * premium),
    xpReward: 40,
    materialReward: materials,
    reputationReward: 8 + tier * 4 + (line.minQuality === 'silver' ? 4 : 0),
    reputationPenalty: 22 + tier * 8,
    issuedDay: day,
    dueDay: day + randInt(rand, 3, 6),
    accepted: false,
  }
}

function rollCrate(state: GameState, rand: () => number, pool: ItemRef[]): Order | null {
  const wanted = randInt(rand, 3, 4)
  if (pool.length < 3) return null

  const day = absoluteDay(state)
  const tier = orderTier(state.market.reputation)
  const scale = TIER_VALUE[tier]
  const chosen: ItemRef[] = []
  const taken = new Set<string>()
  let guard = wanted * 8 + 8
  while (chosen.length < Math.min(wanted, pool.length) && guard-- > 0) {
    const item = pick(rand, pool)
    const key = marketKey(item)
    if (taken.has(key)) continue
    taken.add(key)
    chosen.push(item)
  }
  if (chosen.length < 3) return null

  const lines: Array<{ item: ItemRef; count: number; minQuality: Quality }> = []
  let worth = 0
  for (const item of chosen) {
    const line = rollLine(state, rand, item, randInt(rand, 350, 900) * scale, 0.25)
    lines.push({ item: line.item, count: line.count, minQuality: line.minQuality })
    worth += line.worth
  }
  const premium = 1.55 + rand() * 0.35

  const materials: Partial<Record<MaterialId, number>> = {
    plank: randInt(rand, 2, 6),
    bolt: randInt(rand, 1, 4),
    screw: randInt(rand, 1, 4),
  }
  if (rand() < 0.3) materials.deed = 1
  if (rand() < 0.12) materials[pick(rand, CRATE_TOOLS)] = 1

  return {
    id: freshId(state, 'c', day),
    kind: 'crate',
    lines,
    reward: round10(worth * premium),
    xpReward: 150,
    materialReward: materials,
    reputationReward: 40 + tier * 10,
    reputationPenalty: 55 + tier * 12,
    issuedDay: day,
    dueDay: day + randInt(rand, 10, 18),
    accepted: false,
  }
}

function countOffers(state: GameState, kind: OrderKind): number {
  return state.orders.filter((order) => order.kind === kind && !order.accepted).length
}

/**
 * Tops the board back up. Only unaccepted offers count toward the target, so taking work
 * is what makes new work appear. Boat crates need standing and a farm big enough to fill
 * them, which is why they are gated on reputation and level rather than on luck.
 */
export function offerOrders(state: GameState, rand: () => number): GameState {
  const pool = producibleGoods(state)
  if (pool.length === 0) return state

  const next = prepare(state)
  for (let i = countOffers(next, 'delivery'); i < DELIVERY_OFFERS; i++) {
    next.orders.push(rollDelivery(next, rand, pool))
  }

  const crateReady =
    next.market.reputation >= CRATE_REPUTATION && next.progression.level >= CRATE_LEVEL
  if (crateReady) {
    const target = orderTier(next.market.reputation) >= 3 ? CRATE_OFFERS + 1 : CRATE_OFFERS
    for (let i = countOffers(next, 'crate'); i < target; i++) {
      const crate = rollCrate(next, rand, pool)
      if (crate === null) break
      next.orders.push(crate)
    }
  }

  return next
}

function acceptableRefs(line: { item: ItemRef; minQuality: Quality }): ItemRef[] {
  if (line.item.kind !== 'produce' && line.item.kind !== 'product') return [line.item]
  const floor = QUALITY_RANK[line.minQuality]
  return QUALITIES.filter((q) => QUALITY_RANK[q] >= floor).map((q) => atQuality(line.item, q))
}

function heldForLine(state: GameState, line: { item: ItemRef; minQuality: Quality }): number {
  let total = 0
  for (const ref of acceptableRefs(line)) total += countItem(state, ref)
  return total
}

/** Whether every line of an order can be filled out of the bag right now. */
export function canFulfil(state: GameState, order: Order): boolean {
  return order.lines.every((line) => heldForLine(state, line) >= line.count)
}

/** Consumes the worst acceptable quality first, so gold is kept back for a better price. */
function consumeLine(
  state: GameState,
  line: { item: ItemRef; count: number; minQuality: Quality },
): GameState | null {
  let next = state
  let left = line.count
  for (const ref of acceptableRefs(line)) {
    if (left <= 0) break
    const have = countItem(next, ref)
    if (have <= 0) continue
    const take = Math.min(have, left)
    const stripped = removeItem(next, ref, take)
    if (stripped === null) return null
    next = stripped
    left -= take
  }
  return left === 0 ? next : null
}

function findOrder(state: GameState, id: string): Order | undefined {
  return state.orders.find((order) => order.id === id)
}

export function acceptOrder(state: GameState, id: string): ActionResult {
  const order = findOrder(state, id)
  if (order === undefined) return refuse(state, 'THAT ORDER IS GONE')
  if (order.accepted) return refuse(state, 'ALREADY ACCEPTED')
  if (order.dueDay < absoluteDay(state)) return refuse(state, 'THAT ORDER HAS EXPIRED')

  const cap = maxAcceptedOrders(state)
  const open = state.orders.filter((o) => o.accepted).length
  if (open >= cap) return refuse(state, `${cap} ORDERS IS ALL YOU CAN CARRY`)

  const next = prepare(state)
  const target = findOrder(next, id)
  if (target === undefined) return refuse(state, 'THAT ORDER IS GONE')
  target.accepted = true
  const days = target.dueDay - absoluteDay(next)
  return done(next, `ACCEPTED - ${target.reward}G, ${days} DAYS`, 'select')
}

export function fulfilOrder(state: GameState, id: string): ActionResult {
  const order = findOrder(state, id)
  if (order === undefined) return refuse(state, 'THAT ORDER IS GONE')
  if (!order.accepted) return refuse(state, 'ACCEPT THE ORDER FIRST')

  for (const line of order.lines) {
    const have = heldForLine(state, line)
    if (have < line.count) {
      return refuse(state, `NEEDS ${line.count - have} MORE ${itemName(line.item)}`)
    }
  }

  let carried: GameState = state
  for (const line of order.lines) {
    const stripped = consumeLine(carried, line)
    if (stripped === null) return refuse(state, 'THE BAG CAME UP SHORT')
    carried = stripped
    carried = applySale(carried, line.item, line.count)
  }

  let next = prepare(addMaterials(carried, order.materialReward))
  next.gold += order.reward
  next.stats.earned += order.reward
  gainReputation(next, order.reputationReward)
  next.orders = next.orders.filter((o) => o.id !== id)
  const awarded = grantXp(next, order.xpReward, order.kind === 'crate' ? 'crate' : 'order')
  next = awarded.state

  // A 150-XP crate genuinely crosses a level in the early bands, so say so here rather
  // than letting the level quietly change under the player.
  const top = awarded.leveled[awarded.leveled.length - 1]
  const levelled = top === undefined ? '' : `, LEVEL ${top}`
  const what = order.kind === 'crate' ? 'CRATE SHIPPED' : 'ORDER FILLED'
  return done(
    next,
    `${what} - ${order.reward}G, +${order.reputationReward} STANDING${levelled}`,
    'sell',
  )
}

/**
 * Clears the board of everything past its date. An offer nobody took simply goes away;
 * an accepted order that went unfilled costs standing, because accepting was a promise.
 */
export function expireOrders(state: GameState): { state: GameState; failed: number } {
  const today = absoluteDay(state)
  const stale = state.orders.filter((order) => order.dueDay < today)
  if (stale.length === 0) return { state, failed: 0 }

  const next = prepare(state)
  let failed = 0
  for (const order of stale) {
    if (!order.accepted) continue
    failed += 1
    gainReputation(next, -order.reputationPenalty)
  }
  next.orders = next.orders.filter((order) => order.dueDay >= today)
  return { state: next, failed }
}

// ---------------------------------------------------------------------------
// credit
// ---------------------------------------------------------------------------

/** Everything still owed, across every loan. */
export function totalDebt(state: GameState): number {
  let total = 0
  for (const loan of state.loans) total += loan.outstanding
  return total
}

/**
 * What the bank will lend in total. Standing is the biggest lever, then the farm itself:
 * a level-one farmer with a clean name can borrow about 4,300, which is a Coop; a
 * mid-game farm with a few buildings and a name reaches five figures.
 */
export function creditLimit(state: GameState): number {
  const rep = clamp(state.market.reputation, 0, REPUTATION_MAX)
  return Math.round(
    1500 +
      state.progression.level * 300 +
      rep * 10 +
      state.buildings.length * 900 +
      state.machines.length * 500,
  )
}

/** What is left to draw on. */
export function creditAvailable(state: GameState): number {
  return Math.max(0, creditLimit(state) - totalDebt(state))
}

/** Ten per cent a season with no name, five with a great one. */
export function loanRate(state: GameState): number {
  const rep = clamp(state.market.reputation, 0, REPUTATION_MAX) / REPUTATION_MAX
  const rate = LOAN_RATE_MAX - (LOAN_RATE_MAX - LOAN_RATE_MIN) * rep
  return Math.round(rate * 1000) / 1000
}

export function takeLoan(state: GameState, amount: number): ActionResult {
  const n = whole(amount, LOAN_MINIMUM)
  if (n === null) return refuse(state, `BORROW AT LEAST ${LOAN_MINIMUM}G`)
  if (state.loans.length >= MAX_LOANS) return refuse(state, `${MAX_LOANS} LOANS IS THE LIMIT`)
  const room = creditAvailable(state)
  if (n > room) return refuse(state, `CREDIT LEFT IS ${room}G`)

  const abs = absoluteSeason(state)
  const next = prepare(state)
  const rate = loanRate(next)
  let id = `loan-${abs}-1`
  let k = 1
  while (next.loans.some((loan) => loan.id === id)) {
    k += 1
    id = `loan-${abs}-${k}`
  }
  const due = abs + LOAN_TERM_SEASONS
  next.loans.push({
    id,
    principal: n,
    outstanding: n,
    ratePerSeason: rate,
    takenSeason: abs,
    dueSeason: due,
    missedPayments: 0,
  })
  next.gold += n
  return done(
    next,
    `BORROWED ${n}G AT ${(rate * 100).toFixed(1)}% A SEASON - CLEAR BY ${seasonLabel(due)}`,
    'buy',
  )
}

export function repayLoan(state: GameState, id: string, amount: number): ActionResult {
  const loan = state.loans.find((l) => l.id === id)
  if (loan === undefined) return refuse(state, 'NO SUCH LOAN')
  const asked = whole(amount, 1)
  if (asked === null) return refuse(state, 'REPAY AT LEAST ONE GOLD')
  if (state.gold <= 0) return refuse(state, 'NO GOLD TO PAY WITH')

  const pay = Math.min(asked, loan.outstanding, state.gold)
  if (pay <= 0) return refuse(state, 'NOTHING LEFT TO PAY ON THAT LOAN')

  const next = prepare(state)
  const target = next.loans.find((l) => l.id === id)
  if (target === undefined) return refuse(state, 'NO SUCH LOAN')
  target.outstanding -= pay
  next.gold -= pay

  if (target.outstanding <= 0) {
    next.loans = next.loans.filter((l) => l.id !== id)
    gainReputation(next, LOAN_CLEARED_REPUTATION)
    return done(next, `LOAN CLEARED - ${pay}G, +${LOAN_CLEARED_REPUTATION} STANDING`, 'buy')
  }
  return done(next, `PAID ${pay}G - ${target.outstanding}G STILL OWING`, 'buy')
}

/**
 * The balance the schedule expects at the end of a given season. The first season is a
 * grace season; after that the balance must fall by an even share of the principal each
 * season until the due date. It is arithmetic the player can do on paper, which is the
 * point.
 */
export function expectedOutstanding(loan: Loan, season: number): number {
  const term = Math.max(1, loan.dueSeason - loan.takenSeason)
  if (term <= 1) return 0
  const left = clamp((loan.dueSeason - season) / (term - 1), 0, 1)
  return Math.round(loan.principal * left)
}

/**
 * End of season: interest is added to the balance, and a loan that is behind its
 * schedule costs standing and picks up a point and a half on its rate. Nothing is
 * repossessed, nothing ends the game — the debt simply follows you, and it gets dearer.
 */
export function accrueInterest(state: GameState): GameState {
  if (state.loans.length === 0) return state
  const abs = absoluteSeason(state)
  const next = prepare(state)

  for (const loan of next.loans) {
    const interest = Math.max(0, Math.round(loan.outstanding * loan.ratePerSeason))
    loan.outstanding += interest
    if (abs <= loan.takenSeason) continue

    if (loan.outstanding > expectedOutstanding(loan, abs)) {
      loan.missedPayments += 1
      loan.ratePerSeason = Math.min(
        LOAN_RATE_CEILING,
        Math.round((loan.ratePerSeason + MISSED_PAYMENT_RATE_STEP) * 1000) / 1000,
      )
      gainReputation(next, -MISSED_PAYMENT_REPUTATION)
    }
    if (abs >= loan.dueSeason && loan.outstanding > 0) loan.dueSeason = abs + 2
  }

  return next
}

// ---------------------------------------------------------------------------
// tax
// ---------------------------------------------------------------------------

/**
 * The end-of-season levy, itemised exactly as the seasonal report prints it: gross
 * trade, expenses, the taxable remainder, the flat rate and the amount due.
 *
 * Credit is not trade — money borrowed is not income and money repaid is not an expense,
 * so neither the levy nor the trade stats ever see a loan. That also closes the obvious
 * hole where a player borrows in autumn and repays in winter to wipe out a tax bill.
 *
 * If the purse cannot cover the bill the remainder is carried as a debt at the kindest
 * rate in the game. Nothing is seized. Call this after `accrueInterest`, on the last
 * night of the season.
 */
export function seasonalTax(state: GameState): {
  state: GameState
  gross: number
  expenses: number
  taxable: number
  rate: number
  due: number
} {
  const figures = seasonFigures(state)
  const gross = figures.gross
  const expenses = figures.expenses
  const taxable = Math.max(0, gross - expenses)
  const rate = TAX_RATE
  const due = Math.round(taxable * rate)

  const abs = absoluteSeason(state)
  const next = prepare(state)
  const paid = Math.min(due, Math.max(0, next.gold))
  next.gold -= paid

  const arrears = due - paid
  if (arrears > 0) {
    let id = `tax-${abs}`
    let k = 1
    while (next.loans.some((loan) => loan.id === id)) {
      k += 1
      id = `tax-${abs}-${k}`
    }
    next.loans.push({
      id,
      principal: arrears,
      outstanding: arrears,
      ratePerSeason: TAX_ARREARS_RATE,
      takenSeason: abs,
      dueSeason: abs + LOAN_TERM_SEASONS,
      missedPayments: 0,
    })
  }

  // Open the next season's books at today's totals, so the next assessment is exact.
  setLedger(next.market, {
    season: abs + 1,
    earnedAt: next.stats.earned,
    spentAt: next.stats.spent,
  })

  return { state: next, gross, expenses, taxable, rate, due }
}
