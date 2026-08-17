import type { ActionResult, GameState, GoodId, ItemRef, SoundId } from './types'
import { cropById, cropsForSeason, produceValue, totalGrowDays } from './crops'
import { productById, productValue } from './products'
import { spaceCheck } from './storage'
import { addItem, cloneState, countItem, itemKey, itemName, removeItem } from './state'

export interface ShopEntry {
  item: ItemRef
  price: number
  /** null means the shop never runs out. */
  stock: number | null
  note: string
}

/** Permanent goods. Seeds are priced from their CropDef. */
const GOOD_PRICE: Record<GoodId, number> = {
  sprinkler: 400,
  fertilizer: 100,
}

const GOOD_NOTE: Record<GoodId, string> = {
  sprinkler: 'WATERS 4 TILES EACH NIGHT',
  fertilizer: 'FASTER GROWTH, BETTER CROP',
}

const GOOD_ORDER: readonly GoodId[] = ['sprinkler', 'fertilizer']

/** Buy-back rate on anything that is not produce, so the shop cannot be farmed for gold. */
function buyBack(price: number): number {
  return Math.floor(price / 2)
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function succeed(state: GameState, message: string, sound: SoundId): ActionResult {
  return { state, ok: true, message, sound, fx: [] }
}

/** Whole quantities of at least one, or null for a nonsense request. */
function normalizeQty(qty: number): number | null {
  if (!Number.isFinite(qty)) return null
  const n = Math.floor(qty)
  return n >= 1 ? n : null
}

/** Seeds for the current season plus the permanent goods. */
export function shopStock(state: GameState): ShopEntry[] {
  const entries: ShopEntry[] = []

  for (const crop of cropsForSeason(state.season)) {
    const days = totalGrowDays(crop)
    const note =
      crop.regrowDays === null
        ? `GROWS ${days}D - SELLS ${crop.basePrice}G`
        : `GROWS ${days}D - REGROWS ${crop.regrowDays}D - ${crop.basePrice}G`
    entries.push({
      item: { kind: 'seed', cropId: crop.id },
      price: crop.seedCost,
      stock: null,
      note,
    })
  }

  for (const goodId of GOOD_ORDER) {
    entries.push({
      item: { kind: 'good', goodId },
      price: GOOD_PRICE[goodId],
      stock: null,
      note: GOOD_NOTE[goodId],
    })
  }

  return entries
}

export function sellValue(item: ItemRef): number {
  switch (item.kind) {
    case 'seed': {
      const crop = cropById(item.cropId)
      return crop ? buyBack(crop.seedCost) : 0
    }
    case 'produce': {
      const crop = cropById(item.cropId)
      return crop ? produceValue(crop, item.quality) : 0
    }
    case 'good': {
      const price = GOOD_PRICE[item.goodId]
      return typeof price === 'number' ? buyBack(price) : 0
    }
    case 'product': {
      // The general store buys artisan goods over the counter at the catalogue's own base
      // price, quality included. It is the plain, unmoving alternative to the five channels
      // in `market.ts` — the shopkeeper never haggles and never floods.
      const product = productById(item.productId)
      return product === undefined ? 0 : productValue(product, item.quality)
    }
    case 'material':
      // Wood, planks, deeds. Materials are never bought and never sold, per
      // `docs/PROGRESSION.md` §2 — they are earned by clearing and spent on building.
      return 0
  }
}

export function buy(state: GameState, item: ItemRef, qty: number): ActionResult {
  const n = normalizeQty(qty)
  if (n === null) return fail(state, 'BUY AT LEAST ONE')

  const key = itemKey(item)
  const entry = shopStock(state).find((e) => itemKey(e.item) === key)
  if (entry === undefined) {
    return fail(state, `${itemName(item)} IS NOT SOLD THIS SEASON`)
  }
  if (entry.stock !== null && entry.stock < n) {
    return fail(state, `ONLY ${entry.stock} LEFT IN STOCK`)
  }

  const cost = entry.price * n
  if (state.gold < cost) {
    return fail(state, `NEEDS ${cost}G, YOU HAVE ${state.gold}G`)
  }

  // The shelf is checked before the purse, so the player is never charged for goods that
  // would have nowhere to go. `addItem` clamps to the cap; this is what makes it say so.
  const room = spaceCheck(state, entry.item, n)
  if (!room.ok) return fail(state, room.message)

  const next = addItem(cloneState(state), entry.item, n)
  next.gold = state.gold - cost
  next.stats = { ...next.stats, spent: next.stats.spent + cost }
  return succeed(next, `BOUGHT ${itemName(item)} X${n} FOR ${cost}G`, 'buy')
}

export function sell(state: GameState, item: ItemRef, qty: number): ActionResult {
  const n = normalizeQty(qty)
  if (n === null) return fail(state, 'SELL AT LEAST ONE')

  const held = countItem(state, item)
  if (held < n) {
    return fail(state, held === 0 ? `NO ${itemName(item)} IN THE BAG` : `ONLY ${held} IN THE BAG`)
  }

  const unit = sellValue(item)
  if (unit <= 0) return fail(state, `NOBODY WANTS ${itemName(item)}`)

  const next = removeItem(cloneState(state), item, n)
  if (next === null) return fail(state, `NO ${itemName(item)} IN THE BAG`)

  const total = unit * n
  next.gold += total
  next.stats = { ...next.stats, earned: next.stats.earned + total }
  return succeed(next, `SOLD ${itemName(item)} X${n} FOR ${total}G`, 'sell')
}

export function sellAllProduce(state: GameState): ActionResult {
  const lots = state.inventory.filter((entry) => entry.item.kind === 'produce' && entry.count > 0)
  if (lots.length === 0) return fail(state, 'NO PRODUCE IN THE BAG')

  let next = cloneState(state)
  let total = 0
  let sold = 0

  for (const lot of lots) {
    const unit = sellValue(lot.item)
    if (unit <= 0) continue
    const stripped = removeItem(next, lot.item, lot.count)
    if (stripped === null) continue
    next = stripped
    total += unit * lot.count
    sold += lot.count
  }

  if (sold === 0) return fail(state, 'NO PRODUCE IN THE BAG')

  next.gold += total
  next.stats = { ...next.stats, earned: next.stats.earned + total }
  return succeed(next, `SOLD ${sold} PRODUCE FOR ${total}G`, 'sell')
}
