import { describe, expect, it } from 'vitest'
import { DAYS_PER_SEASON, DAY_END } from '../src/game/constants'
import {
  absoluteDay,
  applySale,
  createMarket,
  marketKey,
  priceOf,
  saleProceeds,
} from '../src/game/economy'
import {
  CRATE_LEVEL,
  CRATE_REPUTATION,
  LOAN_CLEARED_REPUTATION,
  LOAN_MINIMUM,
  LOAN_RATE_CEILING,
  LOAN_RATE_MAX,
  LOAN_RATE_MIN,
  MARKET_BONUS,
  MARKET_TRIP_ENERGY,
  MAX_LOANS,
  MISSED_PAYMENT_REPUTATION,
  STALL_NIGHTLY_CAP,
  STALL_PRICE_CEILING,
  STALL_PRICE_FLOOR,
  STALL_SLOTS,
  TAX_RATE,
  absoluteSeason,
  acceptOrder,
  accrueInterest,
  canFulfil,
  channelProceeds,
  clampStallPrice,
  closingPrice,
  creditAvailable,
  creditLimit,
  expectedOutstanding,
  expireOrders,
  fulfilOrder,
  loanRate,
  maxAcceptedOrders,
  nightlyStall,
  offerOrders,
  orderTier,
  producibleGoods,
  repayLoan,
  reputationRank,
  seasonFigures,
  seasonLabel,
  seasonalTax,
  sellAtMarket,
  shipToBin,
  stallPriceCeiling,
  stallPriceFloor,
  stallSellRate,
  stockStall,
  takeLoan,
  tradeReputation,
  unstockStall,
} from '../src/game/market'
import { createProgression, materialCount } from '../src/game/progression'
import { rngFor } from '../src/game/rng'
import { addItem, countItem, createState } from '../src/game/state'
import type { Loan, Order, StallSlot } from '../src/game/farm-types'
import type { GameState, ItemRef } from '../src/game/types'

const WHEAT: ItemRef = { kind: 'produce', cropId: 'wheat', quality: 'normal' }
const PARSNIP: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
const CHEESE: ItemRef = { kind: 'product', productId: 'cheese', quality: 'normal' }

function slots(): StallSlot[] {
  return Array.from({ length: STALL_SLOTS }, () => ({
    item: null,
    count: 0,
    price: 0,
    sold: 0,
  }))
}

function farm(seed = 71): GameState {
  const base = createState(seed)
  const state: GameState = {
    ...base,
    buildings: [],
    animals: [],
    machines: [],
    hay: 0,
    progression: createProgression(),
    market: createMarket(),
    orders: [],
    loans: [],
    stall: slots(),
  }
  state.inventory = []
  state.gold = 1000
  return state
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'd0-1',
    kind: 'delivery',
    lines: [{ item: PARSNIP, count: 5, minQuality: 'normal' }],
    reward: 500,
    xpReward: 40,
    materialReward: { plank: 2 },
    reputationReward: 8,
    reputationPenalty: 22,
    issuedDay: 0,
    dueDay: 5,
    accepted: false,
    ...over,
  }
}

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-0-1',
    principal: 4000,
    outstanding: 4000,
    ratePerSeason: 0.1,
    takenSeason: 0,
    dueSeason: 4,
    missedPayments: 0,
    ...over,
  }
}

describe('the shipping bin and the town market', () => {
  it('ships at the closing price and books the trade', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const expected = channelProceeds(state, PARSNIP, 10)
    const result = shipToBin(state, PARSNIP, 10)
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold + expected)
    expect(result.state.stats.earned).toBe(expected)
    expect(countItem(result.state, PARSNIP)).toBe(0)
    expect(result.state.market.supply[marketKey(PARSNIP)]).toBeGreaterThan(1)
  })

  it('refuses to ship what is not in the bag', () => {
    const state = addItem(farm(), PARSNIP, 2)
    expect(shipToBin(state, PARSNIP, 5).ok).toBe(false)
    expect(shipToBin(state, WHEAT, 1).ok).toBe(false)
    expect(shipToBin(state, PARSNIP, 0).ok).toBe(false)
    expect(shipToBin(state, PARSNIP, 2.5).state.gold).toBeGreaterThan(state.gold)
  })

  it('pays a premium in town, for a walk and an hour', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const bin = shipToBin(state, PARSNIP, 10)
    const town = sellAtMarket(state, PARSNIP, 10)
    expect(town.ok).toBe(true)
    expect(town.state.gold).toBeGreaterThan(bin.state.gold)
    expect(town.state.energy).toBe(state.energy - MARKET_TRIP_ENERGY)
    expect(town.state.minutes).toBeGreaterThan(state.minutes)
    expect(MARKET_BONUS).toBeGreaterThan(1)
  })

  it('will not walk to town on an empty tank or after closing', () => {
    const tired = addItem(farm(), PARSNIP, 10)
    tired.energy = 1
    expect(sellAtMarket(tired, PARSNIP, 10).ok).toBe(false)

    const late = addItem(farm(), PARSNIP, 10)
    late.minutes = DAY_END - 30
    expect(sellAtMarket(late, PARSNIP, 10).ok).toBe(false)
  })

  it('prices a lot incrementally, so a dump earns less than the quote', () => {
    const state = addItem(farm(), PARSNIP, 200)
    expect(channelProceeds(state, PARSNIP, 200)).toBe(
      saleProceeds(state, PARSNIP, 'normal', 200),
    )
    expect(channelProceeds(state, PARSNIP, 200)).toBeLessThan(closingPrice(state, PARSNIP) * 200)
  })
})

describe('the roadside stall', () => {
  function stocked(price: number): GameState {
    const state = addItem(farm(), PARSNIP, 40)
    return stockStall(state, 0, PARSNIP, 40, price).state
  }

  it('clamps a named price to half the market at the bottom', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const market = closingPrice(state, PARSNIP)
    expect(stallPriceFloor(state, PARSNIP)).toBe(Math.round(market * STALL_PRICE_FLOOR))
    expect(clampStallPrice(state, PARSNIP, 1)).toBe(stallPriceFloor(state, PARSNIP))
    expect(clampStallPrice(state, PARSNIP, -50)).toBe(stallPriceFloor(state, PARSNIP))
  })

  it('clamps a named price to double the market at the top', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const market = closingPrice(state, PARSNIP)
    expect(stallPriceCeiling(state, PARSNIP)).toBe(Math.round(market * STALL_PRICE_CEILING))
    expect(clampStallPrice(state, PARSNIP, 99_999)).toBe(stallPriceCeiling(state, PARSNIP))
    expect(clampStallPrice(state, PARSNIP, Number.NaN)).toBe(stallPriceFloor(state, PARSNIP))
  })

  it('leaves a sensible price exactly where the player put it, and says when it did not', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const market = closingPrice(state, PARSNIP)
    expect(clampStallPrice(state, PARSNIP, market)).toBe(market)

    const result = stockStall(state, 0, PARSNIP, 10, 99_999)
    expect(result.ok).toBe(true)
    expect(result.state.stall[0].price).toBe(stallPriceCeiling(state, PARSNIP))
    expect(result.message).toContain('DOWN FROM')
  })

  it('takes the stock out of the bag and holds it on the stall', () => {
    const state = addItem(farm(), PARSNIP, 40)
    const market = closingPrice(state, PARSNIP)
    const result = stockStall(state, 0, PARSNIP, 25, market)
    expect(result.ok).toBe(true)
    expect(countItem(result.state, PARSNIP)).toBe(15)
    expect(result.state.stall[0]).toMatchObject({ count: 25, price: market, sold: 0 })
  })

  it('lets the player change their mind about the price without restocking', () => {
    const state = addItem(farm(), PARSNIP, 40)
    const market = closingPrice(state, PARSNIP)
    const stockedUp = stockStall(state, 0, PARSNIP, 25, market).state
    const repriced = stockStall(stockedUp, 0, PARSNIP, 0, stallPriceFloor(state, PARSNIP))
    expect(repriced.ok).toBe(true)
    expect(repriced.state.stall[0].count).toBe(25)
    expect(repriced.state.stall[0].price).toBe(stallPriceFloor(state, PARSNIP))
  })

  it('refuses a slot that holds something else, and a slot that is not there', () => {
    let state = addItem(addItem(farm(), PARSNIP, 10), WHEAT, 10)
    state = stockStall(state, 0, PARSNIP, 10, closingPrice(state, PARSNIP)).state
    expect(stockStall(state, 0, WHEAT, 5, 10).ok).toBe(false)
    expect(stockStall(state, 99, WHEAT, 5, 10).ok).toBe(false)
    expect(stockStall(state, 1, WHEAT, 50, 10).ok).toBe(false)
  })

  it('has no stall at all until one is built', () => {
    const state = addItem(farm(), PARSNIP, 10)
    state.stall = []
    const result = stockStall(state, 0, PARSNIP, 5, 20)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('NO ROADSIDE STALL')
  })

  it('sells fastest at half price and slowest at double: the curve is published', () => {
    const state = addItem(farm(), PARSNIP, 40)
    const market = closingPrice(state, PARSNIP)
    let last = Number.POSITIVE_INFINITY
    for (let ratio = STALL_PRICE_FLOOR; ratio <= STALL_PRICE_CEILING + 0.001; ratio += 0.05) {
      const priced = stockStall(state, 0, PARSNIP, 40, Math.round(market * ratio)).state
      const rate = stallSellRate(priced, 0)
      expect(rate, `at ${ratio.toFixed(2)}x market`).toBeLessThanOrEqual(last)
      expect(rate).toBeGreaterThan(0)
      last = rate
    }
    expect(stallSellRate(stocked(Math.round(market * 0.5)), 0)).toBeGreaterThan(
      stallSellRate(stocked(Math.round(market * 2)), 0),
    )
  })

  it('sells nothing from an empty slot', () => {
    expect(stallSellRate(farm(), 0)).toBe(0)
    expect(stallSellRate(farm(), 99)).toBe(0)
  })

  it('moves stock overnight and pays the price the player named', () => {
    const state = addItem(farm(), PARSNIP, 40)
    const market = closingPrice(state, PARSNIP)
    const cheap = stockStall(state, 0, PARSNIP, 40, stallPriceFloor(state, PARSNIP)).state
    const night = nightlyStall(cheap, rngFor(1, 'stall'))
    expect(night.sold).toBeGreaterThan(0)
    expect(night.sold).toBeLessThanOrEqual(STALL_NIGHTLY_CAP)
    expect(night.earned).toBe(night.sold * cheap.stall[0].price)
    expect(night.state.gold).toBe(cheap.gold + night.earned)
    expect(night.state.stall[0].count).toBe(40 - night.sold)
    expect(night.state.stall[0].sold).toBe(night.sold)
    expect(market).toBeGreaterThan(cheap.stall[0].price)
  })

  it('sells a keenly priced slot faster than a greedy one', () => {
    const state = addItem(farm(), PARSNIP, 40)
    const market = closingPrice(state, PARSNIP)
    let cheap = stockStall(state, 0, PARSNIP, 40, stallPriceFloor(state, PARSNIP)).state
    let dear = stockStall(state, 0, PARSNIP, 40, stallPriceCeiling(state, PARSNIP)).state
    let cheapSold = 0
    let dearSold = 0
    for (let night = 0; night < 5; night++) {
      const a = nightlyStall(cheap, rngFor(night, 'cheap'))
      const b = nightlyStall(dear, rngFor(night, 'dear'))
      cheap = a.state
      dear = b.state
      cheapSold += a.sold
      dearSold += b.sold
    }
    expect(cheapSold).toBeGreaterThan(dearSold)
    expect(market).toBeGreaterThan(0)
  })

  it('empties a slot cleanly when the last unit goes', () => {
    const state = addItem(farm(), PARSNIP, 3)
    let stall = stockStall(state, 0, PARSNIP, 3, stallPriceFloor(state, PARSNIP)).state
    for (let night = 0; night < 20 && stall.stall[0].count > 0; night++) {
      stall = nightlyStall(stall, rngFor(night, 'clear')).state
    }
    expect(stall.stall[0].count).toBe(0)
    expect(stall.stall[0].item).toBeNull()
  })

  it('takes unsold stock back through the store caps', () => {
    const state = addItem(farm(), PARSNIP, 10)
    const stall = stockStall(state, 0, PARSNIP, 10, closingPrice(state, PARSNIP)).state
    const back = unstockStall(stall, 0)
    expect(back.ok).toBe(true)
    expect(countItem(back.state, PARSNIP)).toBe(10)
    expect(back.state.stall[0].item).toBeNull()
    expect(unstockStall(back.state, 0).ok).toBe(false)
    expect(unstockStall(back.state, 99).ok).toBe(false)
  })

  it('leaves what will not fit on the stall rather than losing it', () => {
    const state = addItem(farm(), PARSNIP, 10)
    let stall = stockStall(state, 0, PARSNIP, 10, closingPrice(state, PARSNIP)).state
    stall.progression.siloCap = 4
    const back = unstockStall(stall, 0)
    expect(back.ok).toBe(true)
    expect(countItem(back.state, PARSNIP)).toBe(4)
    expect(back.state.stall[0].count).toBe(6)
  })
})

describe('orders', () => {
  it('never asks for something the farm could not make', () => {
    const state = farm()
    const pool = new Set(producibleGoods(state).map(marketKey))
    const offered = offerOrders(state, rngFor(3, 'orders'))
    expect(offered.orders.length).toBeGreaterThan(0)
    for (const order of offered.orders) {
      for (const line of order.lines) {
        expect(pool, `${order.id} asks for ${marketKey(line.item)}`).toContain(marketKey(line.item))
      }
    }
  })

  it('asks a bare farm for crops it could actually be growing, and nothing artisan', () => {
    const state = farm()
    const offered = offerOrders(state, rngFor(4, 'orders'))
    for (const order of offered.orders) {
      for (const line of order.lines) {
        expect(line.item.kind, `${order.id} wants a ${line.item.kind}`).toBe('produce')
      }
    }
    expect(producibleGoods(state).some((item) => marketKey(item) === marketKey(CHEESE))).toBe(false)
  })

  it('asks for cheese only once the farm has handled cheese', () => {
    const state = addItem(farm(), CHEESE, 4)
    expect(producibleGoods(state).some((item) => marketKey(item) === marketKey(CHEESE))).toBe(true)
    const traded = applySale(farm(), CHEESE, 1)
    expect(producibleGoods(traded).some((item) => marketKey(item) === marketKey(CHEESE))).toBe(true)
  })

  it('keeps the board topped up, and only counts offers nobody took', () => {
    let state = offerOrders(farm(), rngFor(5, 'orders'))
    const board = state.orders.length
    state = acceptOrder(state, state.orders[0].id).state
    state = offerOrders(state, rngFor(6, 'orders'))
    expect(state.orders.length).toBe(board + 1)
    expect(state.orders.filter((o) => o.accepted).length).toBe(1)
  })

  it('keeps boat crates away from a farm the town has not heard of', () => {
    const unknown = offerOrders(farm(), rngFor(7, 'orders'))
    expect(unknown.orders.every((o) => o.kind === 'delivery')).toBe(true)

    const known = farm()
    known.market.reputation = CRATE_REPUTATION
    known.progression.level = CRATE_LEVEL
    known.inventory = []
    const crated = offerOrders(known, rngFor(8, 'orders'))
    expect(crated.orders.some((o) => o.kind === 'crate')).toBe(true)
    const crate = crated.orders.find((o) => o.kind === 'crate')
    expect(crate?.lines.length).toBeGreaterThanOrEqual(3)
    expect(crate?.reward ?? 0).toBeGreaterThan(0)
    expect((crate?.dueDay ?? 0) - (crate?.issuedDay ?? 0)).toBeGreaterThanOrEqual(10)
  })

  it('pays a premium over what the goods would fetch loose', () => {
    const state = offerOrders(farm(), rngFor(9, 'orders'))
    for (const offer of state.orders) {
      let loose = 0
      for (const line of offer.lines) loose += closingPrice(state, line.item) * line.count
      expect(offer.reward, offer.id).toBeGreaterThan(loose)
      expect(offer.dueDay).toBeGreaterThan(offer.issuedDay)
      expect(offer.reputationPenalty).toBeGreaterThan(0)
    }
  })

  it('is a commitment: only so many may be carried at once', () => {
    let state = offerOrders(farm(), rngFor(10, 'orders'))
    const cap = maxAcceptedOrders(state)
    expect(cap).toBe(2 + orderTier(state.market.reputation))
    let accepted = 0
    for (const offer of [...state.orders]) {
      const result = acceptOrder(state, offer.id)
      if (result.ok) accepted++
      state = result.state
    }
    expect(accepted).toBe(Math.min(cap, state.orders.length))
    expect(state.orders.filter((o) => o.accepted).length).toBe(cap)
  })

  it('refuses to accept an order twice, or one that is gone', () => {
    const state = offerOrders(farm(), rngFor(11, 'orders'))
    const first = acceptOrder(state, state.orders[0].id)
    expect(first.ok).toBe(true)
    expect(acceptOrder(first.state, state.orders[0].id).ok).toBe(false)
    expect(acceptOrder(first.state, 'nothing').ok).toBe(false)
  })

  it('pays gold, materials, experience and standing when it is filled', () => {
    let state = addItem(farm(), PARSNIP, 5)
    state.orders = [order({ accepted: true })]
    expect(canFulfil(state, state.orders[0])).toBe(true)

    const before = state.market.reputation
    const result = fulfilOrder(state, 'd0-1')
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold + 500)
    expect(result.state.stats.earned).toBe(500)
    expect(result.state.market.reputation).toBe(before + 8)
    expect(materialCount(result.state, 'plank')).toBe(2)
    expect(result.state.progression.xp).toBe(40)
    expect(countItem(result.state, PARSNIP)).toBe(0)
    expect(result.state.orders).toEqual([])
  })

  it('refuses to fill an order that was never accepted, or one short of goods', () => {
    const offered = farm()
    offered.orders = [order()]
    expect(fulfilOrder(offered, 'd0-1').ok).toBe(false)

    const short = addItem(farm(), PARSNIP, 2)
    short.orders = [order({ accepted: true })]
    const result = fulfilOrder(short, 'd0-1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('3 MORE')
    expect(canFulfil(short, short.orders[0])).toBe(false)
  })

  it('takes the worst acceptable grade first, keeping the gold back', () => {
    let state = addItem(farm(), PARSNIP, 3)
    state = addItem(state, { ...PARSNIP, quality: 'gold' }, 5)
    state.orders = [order({ accepted: true })]
    const result = fulfilOrder(state, 'd0-1')
    expect(result.ok).toBe(true)
    expect(countItem(result.state, PARSNIP)).toBe(0)
    expect(countItem(result.state, { ...PARSNIP, quality: 'gold' })).toBe(3)
  })

  it('will not fill a silver line out of ordinary stock', () => {
    const state = addItem(farm(), PARSNIP, 9)
    state.orders = [
      order({ accepted: true, lines: [{ item: { ...PARSNIP, quality: 'silver' }, count: 5, minQuality: 'silver' }] }),
    ]
    expect(canFulfil(state, state.orders[0])).toBe(false)
    expect(fulfilOrder(state, 'd0-1').ok).toBe(false)
  })

  it('costs standing when an accepted order runs out of days', () => {
    const state = farm()
    state.day = 4
    state.orders = [order({ accepted: true, dueDay: 1 })]
    const before = state.market.reputation
    const expired = expireOrders(state)
    expect(expired.failed).toBe(1)
    expect(expired.state.market.reputation).toBe(before - 22)
    expect(expired.state.orders).toEqual([])
  })

  it('costs nothing when an offer nobody took simply lapses', () => {
    const state = farm()
    state.day = 4
    state.orders = [order({ dueDay: 1 })]
    const before = state.market.reputation
    const expired = expireOrders(state)
    expect(expired.failed).toBe(0)
    expect(expired.state.market.reputation).toBe(before)
    expect(expired.state.orders).toEqual([])
  })

  it('leaves a live order alone', () => {
    const state = farm()
    state.orders = [order({ accepted: true, dueDay: 5 })]
    expect(expireOrders(state).state).toBe(state)
    expect(absoluteDay(state)).toBe(0)
  })
})

describe('reputation', () => {
  it('reads back as a named rank beside the number', () => {
    expect(reputationRank(0)).toBe('UNKNOWN')
    expect(reputationRank(250)).toBe('KNOWN')
    expect(reputationRank(1000)).toBe('BELOVED')
  })

  it('trickles in from steady trade, and never from splitting a sale up', () => {
    expect(tradeReputation(0)).toBe(0)
    expect(tradeReputation(1999)).toBe(0)
    expect(tradeReputation(2000)).toBe(1)
    expect(tradeReputation(100_000)).toBe(4)
    expect(tradeReputation(6000)).toBeGreaterThanOrEqual(
      tradeReputation(3000) + tradeReputation(3000),
    )
  })

  it('gates the lucrative work behind standing', () => {
    expect(orderTier(0)).toBe(0)
    expect(orderTier(250)).toBe(1)
    expect(orderTier(500)).toBe(2)
    expect(orderTier(800)).toBe(3)
  })
})

describe('credit', () => {
  it('lends against standing, level and the farm itself', () => {
    const state = farm()
    const bare = creditLimit(state)
    state.progression.level = 20
    expect(creditLimit(state)).toBeGreaterThan(bare)
    state.buildings = [{ id: 'bld-1', kind: 'coop', x: 4, y: 4 }]
    expect(creditLimit(state)).toBeGreaterThan(bare)
    expect(creditAvailable(state)).toBe(creditLimit(state))
  })

  it('charges less to a farm the town trusts', () => {
    const unknown = farm()
    const trusted = farm()
    trusted.market.reputation = 1000
    expect(loanRate(unknown)).toBeGreaterThan(loanRate(trusted))
    expect(loanRate(trusted)).toBeCloseTo(LOAN_RATE_MIN, 3)
    const nobody = farm()
    nobody.market.reputation = 0
    expect(loanRate(nobody)).toBeCloseTo(LOAN_RATE_MAX, 3)
  })

  it('hands over the gold and books the debt', () => {
    const state = farm()
    const result = takeLoan(state, 2000)
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold + 2000)
    expect(result.state.loans.length).toBe(1)
    expect(result.state.loans[0]).toMatchObject({ principal: 2000, outstanding: 2000 })
    expect(result.state.stats.earned).toBe(0)
  })

  it('refuses a token loan, an oversized one and a fourth one', () => {
    let state = farm()
    expect(takeLoan(state, LOAN_MINIMUM - 1).ok).toBe(false)
    expect(takeLoan(state, creditLimit(state) + 1).ok).toBe(false)
    for (let i = 0; i < MAX_LOANS; i++) state = takeLoan(state, 100).state
    expect(state.loans.length).toBe(MAX_LOANS)
    expect(takeLoan(state, 100).ok).toBe(false)
  })

  it('accrues interest at the end of the season, on the balance outstanding', () => {
    const state = farm()
    state.loans = [loan()]
    const after = accrueInterest(state)
    expect(after.loans[0].outstanding).toBe(4000 + Math.round(4000 * 0.1))
    expect(after.loans[0].missedPayments).toBe(0)
  })

  it('costs standing and dearer credit when a loan falls behind its schedule', () => {
    const state = farm()
    state.year = 1
    state.season = 'summer'
    state.loans = [loan()]
    expect(absoluteSeason(state)).toBe(1)
    expect(expectedOutstanding(state.loans[0], 1)).toBeLessThan(4400)

    const before = state.market.reputation
    const after = accrueInterest(state)
    expect(after.loans[0].missedPayments).toBe(1)
    expect(after.loans[0].ratePerSeason).toBeGreaterThan(0.1)
    expect(after.loans[0].ratePerSeason).toBeLessThanOrEqual(LOAN_RATE_CEILING)
    expect(after.market.reputation).toBe(before - MISSED_PAYMENT_REPUTATION)
  })

  it('leaves a farm with no debt entirely alone', () => {
    const state = farm()
    expect(accrueInterest(state)).toBe(state)
  })

  it('repays any amount at any time, and clears the loan when it is done', () => {
    const state = farm()
    state.gold = 5000
    state.loans = [loan()]
    const part = repayLoan(state, 'loan-0-1', 1000)
    expect(part.ok).toBe(true)
    expect(part.state.gold).toBe(4000)
    expect(part.state.loans[0].outstanding).toBe(3000)

    const rest = repayLoan(part.state, 'loan-0-1', 99_999)
    expect(rest.ok).toBe(true)
    expect(rest.state.loans).toEqual([])
    expect(rest.state.gold).toBe(1000)
    expect(rest.state.market.reputation).toBe(state.market.reputation + LOAN_CLEARED_REPUTATION)
  })

  it('refuses to repay with no gold, and refuses a loan that is not there', () => {
    const state = farm()
    state.gold = 0
    state.loans = [loan()]
    expect(repayLoan(state, 'loan-0-1', 100).ok).toBe(false)
    expect(repayLoan(state, 'nothing', 100).ok).toBe(false)
  })

  it('names the season a loan falls due', () => {
    expect(seasonLabel(0)).toBe('SPRING YEAR 1')
    expect(seasonLabel(5)).toBe('SUMMER YEAR 2')
  })
})

describe('tax', () => {
  it('is assessed on the season net, at the published flat rate', () => {
    const state = farm()
    state.gold = 5000
    state.stats = { ...state.stats, earned: 10_000, spent: 4000 }
    const levy = seasonalTax(state)
    expect(levy.gross).toBe(10_000)
    expect(levy.expenses).toBe(4000)
    expect(levy.taxable).toBe(6000)
    expect(levy.rate).toBe(TAX_RATE)
    expect(levy.due).toBe(Math.round(6000 * TAX_RATE))
    expect(levy.state.gold).toBe(5000 - levy.due)
  })

  it('takes nothing from a season that made nothing', () => {
    const state = farm()
    state.stats = { ...state.stats, earned: 1000, spent: 4000 }
    const levy = seasonalTax(state)
    expect(levy.taxable).toBe(0)
    expect(levy.due).toBe(0)
    expect(levy.state.gold).toBe(state.gold)
  })

  it('carries what the purse cannot cover as a debt, and seizes nothing', () => {
    const state = farm()
    state.gold = 100
    state.stats = { ...state.stats, earned: 20_000, spent: 0 }
    const levy = seasonalTax(state)
    expect(levy.due).toBe(1600)
    expect(levy.state.gold).toBe(0)
    expect(levy.state.loans.length).toBe(1)
    expect(levy.state.loans[0].outstanding).toBe(1500)
    expect(levy.state.loans[0].ratePerSeason).toBeLessThanOrEqual(LOAN_RATE_MIN)
  })

  it('opens the next season books, so the next assessment is exact', () => {
    const state = farm()
    state.gold = 5000
    state.stats = { ...state.stats, earned: 10_000, spent: 4000 }
    const settled = seasonalTax(state).state

    const summer: GameState = { ...settled, season: 'summer', day: DAYS_PER_SEASON }
    const opening = seasonFigures(summer)
    expect(opening.exact).toBe(true)
    expect(opening.gross).toBe(0)
    expect(opening.expenses).toBe(0)

    const traded: GameState = {
      ...summer,
      stats: { ...summer.stats, earned: summer.stats.earned + 2500 },
    }
    expect(seasonFigures(traded).gross).toBe(2500)
    expect(seasonalTax(traded).due).toBe(Math.round(2500 * TAX_RATE))
  })

  it('averages lifetime trade before it has any books to read', () => {
    const state = farm()
    state.year = 2
    state.stats = { ...state.stats, earned: 8000, spent: 4000 }
    const figures = seasonFigures(state)
    expect(figures.exact).toBe(false)
    expect(figures.gross).toBe(Math.round(8000 / (absoluteSeason(state) + 1)))
  })

  it('never sees a loan as income or a repayment as an expense', () => {
    let state = farm()
    state.gold = 5000
    state = takeLoan(state, 2000).state
    expect(state.stats.earned).toBe(0)
    state = repayLoan(state, state.loans[0].id, 500).state
    expect(state.stats.spent).toBe(0)
    expect(seasonalTax(state).taxable).toBe(0)
  })
})

describe('prices the ledger quotes', () => {
  it('quotes the closing price as a whole number of gold', () => {
    const state = farm()
    expect(closingPrice(state, PARSNIP)).toBe(Math.round(priceOf(state, PARSNIP)))
    expect(Number.isInteger(closingPrice(state, CHEESE))).toBe(true)
  })
})
