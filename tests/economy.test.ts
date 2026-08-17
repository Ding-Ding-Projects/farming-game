import { describe, expect, it } from 'vitest'
import { DAYS_PER_SEASON, SEASONS } from '../src/game/constants'
import {
  DAYS_PER_WEEK,
  HISTORY_DAYS,
  MIN_PRICE,
  REPUTATION_MAX,
  REPUTATION_START,
  SUPPLY_FACTOR_MAX,
  SUPPLY_FACTOR_MIN,
  absoluteDay,
  applySale,
  caravanSeed,
  createMarket,
  dailyRecovery,
  economicsFor,
  eventBeginsToday,
  eventIsActive,
  eventMultiplier,
  goodCategory,
  isPriced,
  itemFromKey,
  marketDepth,
  marketKey,
  priceOf,
  recordPrices,
  refreshEvent,
  reputationBonus,
  rollWeeklyEvent,
  saleProceeds,
  seasonOfDay,
  seasonalDemand,
  sellPrice,
  supplyFactor,
  supplyIndexOf,
  tradedGoods,
  weekOf,
} from '../src/game/economy'
import { createProgression } from '../src/game/progression'
import { createState } from '../src/game/state'
import type { MarketEvent } from '../src/game/farm-types'
import type { GameState, ItemRef } from '../src/game/types'

const PARSNIP: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
const WHEAT: ItemRef = { kind: 'produce', cropId: 'wheat', quality: 'normal' }
const CHEESE: ItemRef = { kind: 'product', productId: 'cheese', quality: 'normal' }
const EGG: ItemRef = { kind: 'product', productId: 'egg', quality: 'normal' }

function farm(seed = 67): GameState {
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
    stall: [],
  }
  state.inventory = []
  return state
}

/** Moves the calendar to an absolute day, so a test can walk weeks and seasons. */
function atDay(state: GameState, abs: number): GameState {
  const perYear = DAYS_PER_SEASON * SEASONS.length
  const year = Math.floor(abs / perYear) + 1
  const within = abs % perYear
  return {
    ...state,
    year,
    season: SEASONS[Math.floor(within / DAYS_PER_SEASON)],
    day: (within % DAYS_PER_SEASON) + 1,
  }
}

describe('the calendar the market runs on', () => {
  it('counts the first morning as day zero', () => {
    expect(absoluteDay(farm())).toBe(0)
  })

  it('walks whole days through seasons and years', () => {
    const state = farm()
    expect(absoluteDay({ ...state, day: 15 })).toBe(14)
    expect(absoluteDay({ ...state, season: 'summer', day: 1 })).toBe(DAYS_PER_SEASON)
    expect(absoluteDay({ ...state, year: 2, day: 1 })).toBe(DAYS_PER_SEASON * SEASONS.length)
  })

  it('agrees with itself about which season a day falls in', () => {
    for (let abs = 0; abs < DAYS_PER_SEASON * SEASONS.length * 2; abs += 5) {
      expect(seasonOfDay(abs)).toBe(atDay(farm(), abs).season)
    }
  })

  it('cuts four whole weeks to a season', () => {
    expect(DAYS_PER_WEEK).toBe(7)
    expect(weekOf(0)).toBe(0)
    expect(weekOf(6)).toBe(0)
    expect(weekOf(7)).toBe(1)
    expect(DAYS_PER_SEASON % DAYS_PER_WEEK).toBe(0)
  })
})

describe('supplyFactor', () => {
  it('is exactly neutral at a neutral index', () => {
    expect(supplyFactor(1, 0.35)).toBe(1)
    expect(supplyFactor(1, 1.35)).toBe(1)
  })

  it('honours the floor, however flooded the market gets', () => {
    expect(supplyFactor(1000, 1.35)).toBe(SUPPLY_FACTOR_MIN)
    expect(supplyFactor(8, 4)).toBe(SUPPLY_FACTOR_MIN)
    expect(supplyFactor(Number.MAX_VALUE, 1)).toBe(SUPPLY_FACTOR_MIN)
  })

  it('honours the ceiling, however starved it gets', () => {
    expect(supplyFactor(0.0001, 4)).toBe(SUPPLY_FACTOR_MAX)
    expect(supplyFactor(0, 2)).toBe(SUPPLY_FACTOR_MAX)
    expect(supplyFactor(-5, 2)).toBe(SUPPLY_FACTOR_MAX)
  })

  it('never answers NaN, whatever it is handed', () => {
    // A non-finite index cannot arise from `applySale`, which clamps; if a corrupt save
    // carries one it is treated as the scarce end rather than poisoning every price.
    for (const index of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const factor = supplyFactor(index, 1)
      expect(Number.isFinite(factor), `index ${index}`).toBe(true)
      expect(factor).toBeGreaterThanOrEqual(SUPPLY_FACTOR_MIN)
      expect(factor).toBeLessThanOrEqual(SUPPLY_FACTOR_MAX)
    }
    expect(Number.isFinite(supplyFactor(1, Number.NaN))).toBe(true)
  })

  it('falls as supply rises, and stays inside both clamps throughout', () => {
    let last = Number.POSITIVE_INFINITY
    for (let index = 0.25; index <= 8; index += 0.25) {
      const factor = supplyFactor(index, 0.8)
      expect(factor).toBeLessThanOrEqual(last)
      expect(factor).toBeGreaterThanOrEqual(SUPPLY_FACTOR_MIN)
      expect(factor).toBeLessThanOrEqual(SUPPLY_FACTOR_MAX)
      last = factor
    }
  })

  it('swings harder for a luxury than for a staple', () => {
    const staple = economicsFor(PARSNIP).elasticity
    const luxury = economicsFor(CHEESE).elasticity
    expect(luxury).toBeGreaterThan(staple)
    expect(supplyFactor(2, luxury)).toBeLessThan(supplyFactor(2, staple))
  })

  it('saturates a volatile market sooner than a stiff one', () => {
    expect(marketDepth(CHEESE)).toBeLessThan(marketDepth(PARSNIP))
  })
})

describe('dumping and recovery', () => {
  it('drops the price of the thing that was dumped', () => {
    const state = farm()
    const before = sellPrice(state, PARSNIP, 'normal')
    const after = sellPrice(applySale(state, PARSNIP, 200), PARSNIP, 'normal')
    expect(after).toBeLessThan(before)
    expect(supplyIndexOf(applySale(state, PARSNIP, 200), PARSNIP)).toBeGreaterThan(1)
  })

  it('leaves every other good exactly where it was', () => {
    const state = farm()
    const before = sellPrice(state, WHEAT, 'normal')
    const flooded = applySale(state, PARSNIP, 200)
    expect(sellPrice(flooded, WHEAT, 'normal')).toBe(before)
  })

  it('heals back toward neutral over about a week', () => {
    const state = farm()
    const before = sellPrice(state, PARSNIP, 'normal')
    let flooded = applySale(state, PARSNIP, 200)
    const crashed = sellPrice(flooded, PARSNIP, 'normal')

    let last = supplyIndexOf(flooded, PARSNIP)
    for (let day = 0; day < 7; day++) {
      flooded = dailyRecovery(flooded)
      const index = supplyIndexOf(flooded, PARSNIP)
      expect(index).toBeLessThan(last)
      expect(index).toBeGreaterThanOrEqual(1)
      last = index
    }

    const healed = sellPrice(flooded, PARSNIP, 'normal')
    expect(healed).toBeGreaterThan(crashed)
    expect(healed).toBeLessThanOrEqual(before)
    expect(healed).toBeGreaterThanOrEqual(Math.round(before * 0.9))
  })

  it('heals a luxury more slowly than a staple', () => {
    const state = farm()
    const staple = dailyRecovery(applySale(state, PARSNIP, 100))
    const luxury = dailyRecovery(applySale(state, CHEESE, 100))
    const stapleLeft = supplyIndexOf(staple, PARSNIP) - 1
    const luxuryLeft = supplyIndexOf(luxury, CHEESE) - 1
    expect(economicsFor(CHEESE).recovery).toBeLessThan(economicsFor(PARSNIP).recovery)
    expect(luxuryLeft / (supplyIndexOf(applySale(state, CHEESE, 100), CHEESE) - 1)).toBeGreaterThan(
      stapleLeft / (supplyIndexOf(applySale(state, PARSNIP, 100), PARSNIP) - 1),
    )
  })

  it('keeps the record of a good even once its price has healed', () => {
    let state = applySale(farm(), PARSNIP, 10)
    for (let day = 0; day < 60; day++) state = dailyRecovery(state)
    expect(supplyIndexOf(state, PARSNIP)).toBe(1)
    expect(tradedGoods(state)).toEqual([marketKey(PARSNIP)])
  })

  it('trades every grade of a good in the same market', () => {
    const state = applySale(farm(), { ...PARSNIP, quality: 'gold' }, 200)
    expect(sellPrice(state, PARSNIP, 'normal')).toBeLessThan(
      sellPrice(farm(), PARSNIP, 'normal'),
    )
    expect(marketKey({ ...PARSNIP, quality: 'gold' })).toBe(marketKey(PARSNIP))
  })

  it('never lets a price reach zero, however hard it is dumped', () => {
    let state = farm()
    for (let i = 0; i < 40; i++) state = applySale(state, PARSNIP, 200)
    expect(sellPrice(state, PARSNIP, 'normal')).toBeGreaterThanOrEqual(MIN_PRICE)
  })

  it('ignores a sale of nothing', () => {
    const state = farm()
    expect(applySale(state, PARSNIP, 0)).toBe(state)
    expect(applySale(state, PARSNIP, -3)).toBe(state)
  })
})

describe('selling a lot', () => {
  it('pays less per unit for a dump than the quoted price', () => {
    const state = farm()
    const quoted = sellPrice(state, PARSNIP, 'normal')
    const lot = saleProceeds(state, PARSNIP, 'normal', 200)
    expect(lot).toBeLessThan(quoted * 200)
    expect(lot).toBeGreaterThan(quoted * 200 * 0.7)
  })

  it('pays the quoted price for a single unit', () => {
    const state = farm()
    expect(saleProceeds(state, PARSNIP, 'normal', 1)).toBe(sellPrice(state, PARSNIP, 'normal'))
  })

  it('rewards spreading a crop out over dumping it in one evening', () => {
    const state = farm()
    const dumped = saleProceeds(state, PARSNIP, 'normal', 200)

    let spread = 0
    let walking = state
    for (let week = 0; week < 2; week++) {
      spread += saleProceeds(walking, PARSNIP, 'normal', 100)
      walking = applySale(walking, PARSNIP, 100)
      for (let day = 0; day < 7; day++) walking = dailyRecovery(walking)
    }
    expect(spread).toBeGreaterThan(dumped)
  })

  it('pays nothing for nothing', () => {
    expect(saleProceeds(farm(), PARSNIP, 'normal', 0)).toBe(0)
  })

  it('pays more for a better grade', () => {
    const state = farm()
    expect(sellPrice(state, PARSNIP, 'gold')).toBeGreaterThan(sellPrice(state, PARSNIP, 'silver'))
    expect(sellPrice(state, PARSNIP, 'silver')).toBeGreaterThan(sellPrice(state, PARSNIP, 'normal'))
  })

  it('prices the reference at whatever grade it happens to carry', () => {
    const state = farm()
    expect(priceOf(state, { ...PARSNIP, quality: 'gold' })).toBe(sellPrice(state, PARSNIP, 'gold'))
  })
})

describe('seasonal demand', () => {
  it('pays a premium at harvest and a discount out of season', () => {
    const spring = farm()
    const summer = { ...spring, season: 'summer' as const }
    expect(seasonalDemand(spring, WHEAT)).toBeGreaterThan(1)
    expect(seasonalDemand(summer, WHEAT)).toBeLessThan(1)
    expect(sellPrice(spring, WHEAT, 'normal')).toBeGreaterThan(sellPrice(summer, WHEAT, 'normal'))
  })

  it('keeps every published multiplier inside the band the contract names', () => {
    for (const item of [WHEAT, PARSNIP, CHEESE, EGG]) {
      for (const season of SEASONS) {
        const demand = economicsFor(item).seasonal[season]
        expect(demand, `${marketKey(item)} in ${season}`).toBeGreaterThanOrEqual(0.8)
        expect(demand, `${marketKey(item)} in ${season}`).toBeLessThanOrEqual(1.3)
      }
    }
  })

  it('sells cheese high in winter, as the contract says it should', () => {
    const winter = economicsFor(CHEESE).seasonal.winter
    const summer = economicsFor(CHEESE).seasonal.summer
    expect(winter).toBeGreaterThan(summer)
  })

  it('has no season at all for seed, materials and shop goods', () => {
    for (const item of [
      { kind: 'seed', cropId: 'wheat' } as ItemRef,
      { kind: 'material', materialId: 'stone' } as ItemRef,
      { kind: 'good', goodId: 'fertilizer' } as ItemRef,
    ]) {
      for (const season of SEASONS) expect(economicsFor(item).seasonal[season]).toBe(1)
    }
  })
})

describe('reputation', () => {
  it('is exactly neutral at the standing a farm starts with', () => {
    expect(reputationBonus(REPUTATION_START)).toBe(1)
  })

  it('runs the band the contract publishes, and clamps outside it', () => {
    expect(reputationBonus(0)).toBeCloseTo(0.95, 5)
    expect(reputationBonus(REPUTATION_MAX)).toBeCloseTo(1.08, 5)
    expect(reputationBonus(-100)).toBeCloseTo(0.95, 5)
    expect(reputationBonus(5000)).toBeCloseTo(1.08, 5)
  })

  it('never goes backwards as standing climbs', () => {
    let last = 0
    for (let rep = 0; rep <= REPUTATION_MAX; rep += 25) {
      const bonus = reputationBonus(rep)
      expect(bonus).toBeGreaterThanOrEqual(last)
      last = bonus
    }
  })

  it('moves the price on every sale', () => {
    const poor = farm()
    poor.market.reputation = 0
    const grand = farm()
    grand.market.reputation = REPUTATION_MAX
    expect(sellPrice(grand, CHEESE, 'normal')).toBeGreaterThan(sellPrice(poor, CHEESE, 'normal'))
  })
})

describe('weekly events', () => {
  it('is one roll a week, deterministic from the seed alone', () => {
    const state = farm()
    expect(rollWeeklyEvent(state)).toEqual(rollWeeklyEvent(state))
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      expect(rollWeeklyEvent(atDay(state, day))).toEqual(rollWeeklyEvent(state))
    }
  })

  it('rolls a different week to a different event, and a different seed to a different year', () => {
    const one = farm(11)
    const two = farm(12)
    const weeksOne: string[] = []
    const weeksTwo: string[] = []
    for (let week = 0; week < 40; week++) {
      weeksOne.push(rollWeeklyEvent(atDay(one, week * DAYS_PER_WEEK)).kind)
      weeksTwo.push(rollWeeklyEvent(atDay(two, week * DAYS_PER_WEEK)).kind)
    }
    expect(weeksOne.join()).not.toBe(weeksTwo.join())
    expect(new Set(weeksOne).size).toBeGreaterThan(1)
  })

  it('keeps roughly a third of weeks quiet, so an event stays an event', () => {
    const state = farm(5)
    const kinds: string[] = []
    for (let week = 0; week < 400; week++) {
      kinds.push(rollWeeklyEvent(atDay(state, week * DAYS_PER_WEEK)).kind)
    }
    const quiet = kinds.filter((kind) => kind === 'quiet').length / kinds.length
    expect(quiet).toBeGreaterThan(0.2)
    expect(quiet).toBeLessThan(0.5)
    for (const kind of ['quiet', 'bumper', 'shortage', 'festival', 'caravan']) {
      expect(kinds, `no week ever rolled a ${kind}`).toContain(kind)
    }
  })

  it('finishes every event inside its own week', () => {
    const state = farm(9)
    for (let week = 0; week < 200; week++) {
      const event = rollWeeklyEvent(atDay(state, week * DAYS_PER_WEEK))
      const start = week * DAYS_PER_WEEK
      expect(event.startDay, event.kind).toBeGreaterThanOrEqual(start)
      expect(event.endDay, event.kind).toBeLessThanOrEqual(start + DAYS_PER_WEEK - 1)
    }
  })

  it('targets something real, or nothing at all', () => {
    const state = farm(3)
    for (let week = 0; week < 200; week++) {
      const event = rollWeeklyEvent(atDay(state, week * DAYS_PER_WEEK))
      if (event.kind === 'bumper' || event.kind === 'shortage') {
        expect(event.target, event.kind).not.toBeNull()
        expect(itemFromKey(event.target as string), `${event.kind} ${event.target}`).not.toBeNull()
      }
      if (event.kind === 'festival') {
        expect(['produce', 'artisan', 'animal']).toContain(event.target)
      }
      if (event.kind === 'quiet' || event.kind === 'caravan') expect(event.target).toBeNull()
    }
  })

  it('applies a bumper to one good and a caravan to everything', () => {
    const state = farm()
    const bumper: MarketEvent = {
      kind: 'bumper',
      target: marketKey(PARSNIP),
      multiplier: 0.5,
      startDay: 0,
      endDay: 4,
    }
    expect(eventMultiplier(bumper, 0, PARSNIP)).toBe(0.5)
    expect(eventMultiplier(bumper, 0, WHEAT)).toBe(1)
    expect(eventMultiplier(bumper, 9, PARSNIP)).toBe(1)

    const caravan: MarketEvent = {
      kind: 'caravan',
      target: null,
      multiplier: 1.1,
      startDay: 0,
      endDay: 1,
    }
    expect(eventMultiplier(caravan, 0, PARSNIP)).toBe(1.1)
    expect(eventMultiplier(caravan, 0, CHEESE)).toBe(1.1)

    const priced = { ...state, market: { ...state.market, event: bumper } }
    expect(sellPrice(priced, PARSNIP, 'normal')).toBeLessThan(sellPrice(state, PARSNIP, 'normal'))
  })

  it('lifts a whole category on a festival, and nothing else', () => {
    const festival: MarketEvent = {
      kind: 'festival',
      target: 'animal',
      multiplier: 1.3,
      startDay: 0,
      endDay: 2,
    }
    expect(goodCategory(EGG)).toBe('animal')
    expect(eventMultiplier(festival, 1, EGG)).toBe(1.3)
    expect(eventMultiplier(festival, 1, PARSNIP)).toBe(1)
    expect(goodCategory(PARSNIP)).toBe('produce')
    expect(goodCategory(CHEESE)).toBe('artisan')
  })

  it('is announced on the morning it begins, and only then', () => {
    const shortage: MarketEvent = {
      kind: 'shortage',
      target: marketKey(EGG),
      multiplier: 1.6,
      startDay: 3,
      endDay: 6,
    }
    expect(eventBeginsToday(shortage, 3)).toBe(true)
    expect(eventBeginsToday(shortage, 4)).toBe(false)
    expect(eventIsActive(shortage, 4)).toBe(true)
    expect(eventIsActive(shortage, 7)).toBe(false)
    expect(eventIsActive(null, 3)).toBe(false)
  })

  it('rolls once and then leaves the week alone', () => {
    const state = farm()
    const first = refreshEvent(state)
    expect(first.market.eventWeek).toBe(0)
    expect(first.market.event).not.toBeNull()
    expect(refreshEvent(first)).toBe(first)

    const later = refreshEvent(atDay(first, DAYS_PER_WEEK))
    expect(later.market.eventWeek).toBe(1)
  })

  it('brings a rare, out-of-season seed with the caravan and nothing without one', () => {
    const state = farm()
    expect(caravanSeed(state)).toBeNull()
    const caravan: MarketEvent = {
      kind: 'caravan',
      target: null,
      multiplier: 1.1,
      startDay: 0,
      endDay: 1,
    }
    const visiting = { ...state, market: { ...state.market, event: caravan } }
    const rare = caravanSeed(visiting)
    expect(rare).not.toBeNull()
    expect(caravanSeed(visiting)).toBe(rare)
  })
})

describe('the market key', () => {
  it('round-trips every kind of good', () => {
    const items: ItemRef[] = [
      PARSNIP,
      CHEESE,
      { kind: 'seed', cropId: 'wheat' },
      { kind: 'good', goodId: 'sprinkler' },
      { kind: 'material', materialId: 'plank' },
    ]
    for (const item of items) {
      const key = marketKey(item)
      const back = itemFromKey(key)
      expect(back, key).not.toBeNull()
      expect(marketKey(back as ItemRef)).toBe(key)
    }
  })

  it('answers null for a key that names nothing real', () => {
    expect(itemFromKey('')).toBeNull()
    expect(itemFromKey('nonsense')).toBeNull()
    expect(itemFromKey('produce:')).toBeNull()
    expect(itemFromKey('good:teleporter')).toBeNull()
    expect(itemFromKey('material:unobtainium')).toBeNull()
  })

  it('knows a priced good from an invented one', () => {
    expect(isPriced(CHEESE)).toBe(true)
    expect(isPriced(PARSNIP)).toBe(true)
    expect(isPriced({ kind: 'product', productId: 'moonbeam', quality: 'normal' })).toBe(false)
    expect(isPriced({ kind: 'produce', cropId: 'moonfruit', quality: 'normal' })).toBe(false)
    expect(isPriced({ kind: 'material', materialId: 'plank' })).toBe(true)
  })
})

describe('the ledger history', () => {
  it('records only goods the player has actually traded', () => {
    const state = recordPrices(applySale(farm(), PARSNIP, 5))
    expect(state.market.history.length).toBe(1)
    expect(Object.keys(state.market.history[0].prices)).toEqual([marketKey(PARSNIP)])
    expect(state.market.history[0].day).toBe(0)
  })

  it('replaces today rather than writing it twice', () => {
    const traded = applySale(farm(), PARSNIP, 5)
    const twice = recordPrices(recordPrices(traded))
    expect(twice.market.history.length).toBe(1)
  })

  it('keeps two seasons of history and drops the oldest', () => {
    let state = applySale(farm(), PARSNIP, 5)
    for (let day = 0; day < HISTORY_DAYS + 10; day++) {
      state = recordPrices(atDay(state, day))
    }
    expect(state.market.history.length).toBe(HISTORY_DAYS)
    expect(state.market.history[0].day).toBe(10)
  })
})
