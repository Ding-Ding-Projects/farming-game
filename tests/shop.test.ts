import { describe, expect, it } from 'vitest'
import { SEASONS, START_GOLD } from '../src/game/constants'
import { cropById, cropsForSeason, produceValue } from '../src/game/crops'
import { addItem, countItem, createState, itemKey } from '../src/game/state'
import { buy, sell, sellAllProduce, sellValue, shopStock } from '../src/game/shop'
import type { GameState, ItemRef } from '../src/game/types'

const PARSNIP_SEED: ItemRef = { kind: 'seed', cropId: 'parsnip' }
const SPRINKLER: ItemRef = { kind: 'good', goodId: 'sprinkler' }
const FERTILIZER: ItemRef = { kind: 'good', goodId: 'fertilizer' }

/** A farm with an empty bag, so every count in a test is one the test put there. */
function shopper(gold = START_GOLD): GameState {
  const state = createState(3)
  state.inventory = []
  state.selectedSeed = null
  state.gold = gold
  return state
}

function priceOf(state: GameState, item: ItemRef): number {
  const entry = shopStock(state).find((e) => itemKey(e.item) === itemKey(item))
  if (entry === undefined) throw new Error(`${itemKey(item)} is not stocked`)
  return entry.price
}

describe('shopStock', () => {
  it('lists exactly the seeds of the current season', () => {
    for (const season of SEASONS) {
      const state = { ...shopper(), season }
      const seeds = shopStock(state).filter((entry) => entry.item.kind === 'seed')
      const expected = cropsForSeason(season).map((crop) => crop.id).sort()
      const listed = seeds
        .map((entry) => (entry.item.kind === 'seed' ? entry.item.cropId : ''))
        .sort()
      expect(listed).toEqual(expected)
    }
  })

  it('always carries the permanent goods', () => {
    const keys = shopStock(shopper()).map((entry) => itemKey(entry.item))
    expect(keys).toContain(itemKey(SPRINKLER))
    expect(keys).toContain(itemKey(FERTILIZER))
  })

  it('prices seeds from the crop table and writes a readable note', () => {
    for (const entry of shopStock(shopper())) {
      expect(entry.price).toBeGreaterThan(0)
      expect(entry.note.length).toBeGreaterThan(0)
      expect(entry.stock === null || entry.stock > 0).toBe(true)
      if (entry.item.kind !== 'seed') continue
      const crop = cropById(entry.item.cropId)
      expect(crop).toBeDefined()
      expect(entry.price).toBe(crop?.seedCost)
    }
  })
})

describe('buy', () => {
  it('debits the gold and credits the bag', () => {
    const state = shopper()
    const price = priceOf(state, PARSNIP_SEED)
    const result = buy(state, PARSNIP_SEED, 3)

    expect(result.ok).toBe(true)
    expect(result.sound).toBe('buy')
    expect(result.state.gold).toBe(START_GOLD - price * 3)
    expect(countItem(result.state, PARSNIP_SEED)).toBe(3)
    expect(result.state.stats.spent).toBe(state.stats.spent + price * 3)
  })

  it('stacks onto what is already held', () => {
    const state = addItem(shopper(), PARSNIP_SEED, 2)
    const result = buy(state, PARSNIP_SEED, 1)
    expect(countItem(result.state, PARSNIP_SEED)).toBe(3)
  })

  it('sells the permanent goods too', () => {
    const state = shopper()
    const result = buy(state, SPRINKLER, 1)
    expect(result.ok).toBe(true)
    expect(countItem(result.state, SPRINKLER)).toBe(1)
    expect(result.state.gold).toBe(START_GOLD - priceOf(state, SPRINKLER))
  })

  it('refuses when the purse is short and changes nothing', () => {
    const state = shopper(10)
    const result = buy(state, PARSNIP_SEED, 1)
    expect(result.ok).toBe(false)
    expect(result.sound).toBe('deny')
    expect(result.state).toBe(state)
    expect(result.state.gold).toBe(10)
    expect(countItem(result.state, PARSNIP_SEED)).toBe(0)
  })

  it('refuses a bulk order it cannot cover', () => {
    const state = shopper()
    const affordable = Math.floor(START_GOLD / priceOf(state, PARSNIP_SEED))
    expect(buy(state, PARSNIP_SEED, affordable).ok).toBe(true)
    expect(buy(state, PARSNIP_SEED, affordable + 1).ok).toBe(false)
  })

  it('refuses seeds that are out of season', () => {
    const result = buy(shopper(), { kind: 'seed', cropId: 'tomato' }, 1)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/NOT SOLD/)
  })

  it('refuses a nonsense quantity', () => {
    const state = shopper()
    for (const qty of [0, -2, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = buy(state, PARSNIP_SEED, qty)
      expect(result.ok).toBe(false)
      expect(result.state.gold).toBe(START_GOLD)
    }
  })
})

describe('sellValue', () => {
  it('pays the produce price for produce', () => {
    const crop = cropById('parsnip')
    expect(crop).toBeDefined()
    if (!crop) return
    expect(sellValue({ kind: 'produce', cropId: 'parsnip', quality: 'gold' })).toBe(
      produceValue(crop, 'gold'),
    )
    expect(sellValue({ kind: 'produce', cropId: 'parsnip', quality: 'normal' })).toBe(
      crop.basePrice,
    )
  })

  it('buys seeds and goods back at half price, so the shop cannot be farmed', () => {
    const state = shopper()
    expect(sellValue(PARSNIP_SEED)).toBe(Math.floor(priceOf(state, PARSNIP_SEED) / 2))
    expect(sellValue(SPRINKLER)).toBe(Math.floor(priceOf(state, SPRINKLER) / 2))
    expect(sellValue(PARSNIP_SEED)).toBeLessThan(priceOf(state, PARSNIP_SEED))
  })

  it('values an unknown item at nothing', () => {
    expect(sellValue({ kind: 'seed', cropId: 'moonfruit' })).toBe(0)
    expect(sellValue({ kind: 'produce', cropId: 'moonfruit', quality: 'gold' })).toBe(0)
  })
})

describe('sell', () => {
  const goldParsnip: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'gold' }

  it('credits the right amount and takes the goods away', () => {
    const state = addItem(shopper(0), goldParsnip, 3)
    const result = sell(state, goldParsnip, 2)
    expect(result.ok).toBe(true)
    expect(result.sound).toBe('sell')
    expect(result.state.gold).toBe(sellValue(goldParsnip) * 2)
    expect(countItem(result.state, goldParsnip)).toBe(1)
    expect(result.state.stats.earned).toBe(sellValue(goldParsnip) * 2)
  })

  it('refuses to sell more than is held', () => {
    const state = addItem(shopper(0), goldParsnip, 1)
    const result = sell(state, goldParsnip, 2)
    expect(result.ok).toBe(false)
    expect(result.state).toBe(state)
    expect(countItem(result.state, goldParsnip)).toBe(1)
  })

  it('refuses an empty bag and a nonsense quantity', () => {
    const state = shopper(0)
    expect(sell(state, goldParsnip, 1).ok).toBe(false)
    expect(sell(addItem(state, goldParsnip, 1), goldParsnip, 0).ok).toBe(false)
  })

  it('refuses worthless junk from a stale save', () => {
    const junk: ItemRef = { kind: 'produce', cropId: 'moonfruit', quality: 'normal' }
    const state = addItem(shopper(0), junk, 1)
    const result = sell(state, junk, 1)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/NOBODY WANTS/)
  })
})

describe('sellAllProduce', () => {
  it('empties the produce and leaves everything else alone', () => {
    const normal: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
    const silver: ItemRef = { kind: 'produce', cropId: 'cabbage', quality: 'silver' }

    let state = shopper(0)
    state = addItem(state, normal, 4)
    state = addItem(state, silver, 2)
    state = addItem(state, PARSNIP_SEED, 5)
    state = addItem(state, SPRINKLER, 1)

    const expected = sellValue(normal) * 4 + sellValue(silver) * 2
    const result = sellAllProduce(state)

    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(expected)
    expect(result.state.stats.earned).toBe(expected)
    expect(result.state.inventory.some((entry) => entry.item.kind === 'produce')).toBe(false)
    expect(countItem(result.state, PARSNIP_SEED)).toBe(5)
    expect(countItem(result.state, SPRINKLER)).toBe(1)
  })

  it('refuses when there is no produce in the bag', () => {
    const state = addItem(shopper(0), PARSNIP_SEED, 3)
    const result = sellAllProduce(state)
    expect(result.ok).toBe(false)
    expect(result.state).toBe(state)
    expect(countItem(result.state, PARSNIP_SEED)).toBe(3)
  })

  it('refuses a bag of nothing but worthless produce', () => {
    const junk: ItemRef = { kind: 'produce', cropId: 'moonfruit', quality: 'normal' }
    const result = sellAllProduce(addItem(shopper(0), junk, 2))
    expect(result.ok).toBe(false)
  })
})
