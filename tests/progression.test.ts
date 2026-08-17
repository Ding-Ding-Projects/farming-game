import { describe, expect, it } from 'vitest'
import { BARN_STORE_BONUS } from '../src/game/buildings'
import { createMarket } from '../src/game/economy'
import { materialName } from '../src/game/materials'
import {
  BARN_START_CAP,
  BULK_MATERIALS,
  REGIONS,
  SILO_START_CAP,
  STORE_CAP_STEP,
  STORE_EXPANSIONS,
  XP_RATES,
  addMaterial,
  addMaterials,
  buyRegion,
  createProgression,
  depositItem,
  expandStore,
  expansionCost,
  expansionTier,
  expansionsLeft,
  fitCount,
  formatMaterials,
  grantXp,
  hasMaterials,
  hasSpaceFor,
  isStoreId,
  isTileOwned,
  isUnlocked,
  levelUpNotes,
  lockedNote,
  materialCount,
  missingMaterials,
  ownsRegion,
  regionsForSale,
  spaceCheck,
  spaceLeft,
  spendMaterials,
  storeCapAtTier,
  storeName,
  storeOf,
  storeSpace,
  totalXpForLevel,
  xpFor,
  xpProgress,
} from '../src/game/progression'
import { deserialize, serialize } from '../src/game/save'
import { addItem, countItem, createState } from '../src/game/state'
import type { Building } from '../src/game/farm-types'
import type { GameState, ItemRef } from '../src/game/types'

function farm(): GameState {
  const base = createState(53)
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
  state.gold = 0
  return state
}

function building(id: string, kind: string, x: number, y: number): Building {
  return { id, kind, x, y }
}

const WHEAT: ItemRef = { kind: 'produce', cropId: 'wheat', quality: 'normal' }
const EGG: ItemRef = { kind: 'product', productId: 'egg', quality: 'normal' }

describe('experience', () => {
  it('pays the rates the contract publishes', () => {
    expect(XP_RATES.harvest).toBe(2)
    expect(XP_RATES.collect).toBe(5)
    expect(XP_RATES.order).toBe(40)
    expect(XP_RATES.crate).toBe(150)
    expect(XP_RATES.clear).toBe(3)
    expect(XP_RATES.build).toBe(25)
    expect(xpFor('harvest', 5)).toBe(10)
    expect(xpFor('machine', 3)).toBe(8 + 2 * 3)
    expect(xpFor('machine', 0)).toBe(0)
    expect(xpFor('clear', -2)).toBe(0)
  })

  it('crosses several levels at once on one big award, and names them all', () => {
    const state = farm()
    const result = grantXp(state, 900, 'crate')
    expect(result.leveled).toEqual([2, 3, 4])
    expect(result.state.progression.level).toBe(4)
    expect(result.state.progression.xp).toBe(900)
    expect(totalXpForLevel(4)).toBeLessThanOrEqual(900)
    expect(totalXpForLevel(5)).toBeGreaterThan(900)
  })

  it('pays the gold and the materials of every level it crossed', () => {
    const state = farm()
    const result = grantXp(state, 900, 'crate')
    expect(result.state.gold).toBe(750)
    expect(result.state.stats.earned).toBe(750)
    expect(result.state.progression.materials.plank).toBe(2)
    expect(result.state.progression.materials.nail).toBe(2)
  })

  it('leaves the farm exactly as it was for an award of nothing', () => {
    const state = farm()
    expect(grantXp(state, 0, 'harvest').state).toBe(state)
    expect(grantXp(state, -50, 'harvest').leveled).toEqual([])
    expect(grantXp(state, Number.NaN, 'harvest').leveled).toEqual([])
  })

  it('never pays out for a source the ladder was not balanced for', () => {
    const state = farm()
    const result = grantXp(state, 5000, 'cheating' as 'harvest')
    expect(result.leveled).toEqual([])
    expect(result.state.progression.xp).toBe(0)
  })

  it('reports progress into the current level for the bar', () => {
    const state = grantXp(farm(), 900, 'crate').state
    const bar = xpProgress(state)
    expect(bar.level).toBe(4)
    expect(bar.into).toBe(900 - totalXpForLevel(4))
    expect(bar.pct).toBeGreaterThan(0)
    expect(bar.pct).toBeLessThan(1)
  })

  it('writes a note for each level, saying what it opened', () => {
    const notes = levelUpNotes([8, 15])
    expect(notes.length).toBe(2)
    expect(notes[0]).toContain('LEVEL 8')
    expect(notes[0]).toContain('COOP')
    expect(notes[1]).toContain('LEVEL 15')
  })

  it('answers whether a thing is unlocked, and says what it needs when it is not', () => {
    const state = farm()
    expect(isUnlocked(state, 'crop:wheat')).toBe(true)
    expect(isUnlocked(state, 'building:coop')).toBe(false)
    expect(lockedNote('building:coop')).toBe('NEEDS LEVEL 8')
    state.progression.level = 8
    expect(isUnlocked(state, 'building:coop')).toBe(true)
  })
})

describe('storage', () => {
  it('starts tight, exactly as the contract sets it', () => {
    const state = farm()
    expect(storeSpace(state, 'silo')).toEqual({ used: 0, cap: SILO_START_CAP })
    expect(storeSpace(state, 'barn')).toEqual({ used: 0, cap: BARN_START_CAP })
    expect(SILO_START_CAP).toBe(150)
    expect(BARN_START_CAP).toBe(200)
  })

  it('sends crops and seed to the silo, everything else to the barn', () => {
    expect(storeOf(WHEAT)).toBe('silo')
    expect(storeOf({ kind: 'seed', cropId: 'wheat' })).toBe('silo')
    expect(storeOf(EGG)).toBe('barn')
    expect(storeOf({ kind: 'material', materialId: 'plank' })).toBe('barn')
    expect(storeOf({ kind: 'good', goodId: 'fertilizer' })).toBe('barn')
    expect(isStoreId('silo')).toBe(true)
    expect(isStoreId('cellar')).toBe(false)
    expect(storeName('barn')).toBe('BARN STORE')
  })

  it('counts what is on the shelf, bulk materials included', () => {
    let state = addItem(farm(), WHEAT, 40)
    state = addMaterial(state, 'stone', 12)
    expect(storeSpace(state, 'silo').used).toBe(40)
    expect(storeSpace(state, 'barn').used).toBe(12)
    expect(spaceLeft(state, 'silo')).toBe(SILO_START_CAP - 40)
    for (const id of BULK_MATERIALS) expect(storeOf({ kind: 'material', materialId: id })).toBe('barn')
  })

  it('refuses an overflowing deposit, naming the store and the shortfall', () => {
    const state = addItem(farm(), WHEAT, SILO_START_CAP - 5)
    const check = spaceCheck(state, WHEAT, 20)
    expect(check.ok).toBe(false)
    expect(check.store).toBe('silo')
    expect(check.fits).toBe(5)
    expect(check.shortfall).toBe(15)
    expect(check.message).toContain('SILO')
    expect(check.message).toContain(`${SILO_START_CAP}`)
    expect(hasSpaceFor(state, WHEAT, 20)).toBe(false)
    expect(fitCount(state, WHEAT, 20)).toBe(5)
  })

  it('stores what fits and reports the rest, never dropping it silently', () => {
    const state = addItem(farm(), WHEAT, SILO_START_CAP - 5)
    const deposit = depositItem(state, WHEAT, 20)
    expect(deposit.stored).toBe(5)
    expect(deposit.refused).toBe(15)
    expect(deposit.message).toContain('SILO')
    expect(countItem(deposit.state, WHEAT)).toBe(SILO_START_CAP)
  })

  it('names the barn store when it is the barn that is full', () => {
    const state = farm()
    state.progression.barnCap = 1
    const deposit = depositItem(state, EGG, 4)
    expect(deposit.stored).toBe(1)
    expect(deposit.refused).toBe(3)
    expect(deposit.message).toContain('BARN STORE')
  })

  it('takes a whole deposit that fits, and says nothing about it', () => {
    const deposit = depositItem(farm(), WHEAT, 10)
    expect(deposit.stored).toBe(10)
    expect(deposit.refused).toBe(0)
    expect(deposit.message).toBe('')
  })
})

describe('expanding a store', () => {
  function ready(store: 'silo' | 'barn'): GameState {
    const state = farm()
    state.progression.level = store === 'silo' ? 12 : 14
    state.gold = 50_000
    return state
  }

  it('prices the next extension in gold and in materials that cannot be bought', () => {
    const cost = expansionCost(farm(), 'silo')
    expect(cost).not.toBeNull()
    expect(cost?.tier).toBe(1)
    expect(cost?.gold).toBeGreaterThan(0)
    expect(cost?.materials).toEqual({ plank: 6, bolt: 3, screw: 3 })
  })

  it('refuses before the ladder opens extensions for that store', () => {
    const state = ready('silo')
    state.progression.level = 11
    state.progression.materials = { plank: 6, bolt: 3, screw: 3 }
    const result = expandStore(state, 'silo')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('NEEDS LEVEL 12')
    expect(result.state.progression.siloCap).toBe(SILO_START_CAP)
  })

  it('refuses with gold alone, and names exactly what is short', () => {
    const state = ready('silo')
    state.progression.materials = { plank: 6 }
    const result = expandStore(state, 'silo')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('BOLT')
    expect(result.message).toContain('SCREW')
    expect(result.state.progression.siloCap).toBe(SILO_START_CAP)
    expect(result.state.gold).toBe(state.gold)
  })

  it('refuses with materials alone when the purse is short', () => {
    const state = ready('silo')
    state.gold = 1
    state.progression.materials = { plank: 6, bolt: 3, screw: 3 }
    const result = expandStore(state, 'silo')
    expect(result.ok).toBe(false)
    expect(result.state.progression.siloCap).toBe(SILO_START_CAP)
    expect(result.state.progression.materials.plank).toBe(6)
  })

  it('adds a shelf when both are paid, and takes both', () => {
    const state = ready('silo')
    const cost = expansionCost(state, 'silo')
    expect(cost).not.toBeNull()
    if (cost === null) return
    state.progression.materials = { plank: 10, bolt: 5, screw: 5 }
    const result = expandStore(state, 'silo')
    expect(result.ok).toBe(true)
    expect(result.state.progression.siloCap).toBe(SILO_START_CAP + STORE_CAP_STEP)
    expect(result.state.gold).toBe(state.gold - cost.gold)
    expect(result.state.progression.materials.plank).toBe(4)
    expect(expansionTier(result.state, 'silo')).toBe(1)
    expect(expansionsLeft(result.state, 'silo')).toBe(STORE_EXPANSIONS.silo - 1)
  })

  it('charges more for every tier after the first', () => {
    let state = ready('silo')
    state.progression.materials = { plank: 200, bolt: 100, screw: 100 }
    const first = expansionCost(state, 'silo')?.gold ?? 0
    state = expandStore(state, 'silo').state
    const second = expansionCost(state, 'silo')?.gold ?? 0
    expect(second).toBeGreaterThan(first)
    expect(storeCapAtTier('silo', 2)).toBe(SILO_START_CAP + 2 * STORE_CAP_STEP)
  })

  it('counts a barn store building as capacity, not as a paid tier', () => {
    const state = ready('barn')
    state.buildings = [building('bld-1', 'barn-store', 4, 4)]
    state.progression.barnCap = BARN_START_CAP + BARN_STORE_BONUS
    expect(expansionTier(state, 'barn')).toBe(0)
    expect(expansionCost(state, 'barn')?.tier).toBe(1)
    expect(storeSpace(state, 'barn').cap).toBe(BARN_START_CAP + BARN_STORE_BONUS)
  })

  it('stops at the largest the store will ever be', () => {
    const state = ready('silo')
    state.progression.siloCap = storeCapAtTier('silo', STORE_EXPANSIONS.silo)
    expect(expansionCost(state, 'silo')).toBeNull()
    const result = expandStore(state, 'silo')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('ALREADY AT ITS LARGEST')
  })

  it('refuses a store that does not exist', () => {
    expect(expandStore(farm(), 'cellar' as 'silo').ok).toBe(false)
  })
})

describe('materials', () => {
  it('adds, counts and spends a whole cost or none of it', () => {
    let state = addMaterials(farm(), { plank: 4, bolt: 2 })
    expect(materialCount(state, 'plank')).toBe(4)
    expect(hasMaterials(state, { plank: 4, bolt: 2 })).toBe(true)
    expect(hasMaterials(state, { plank: 5 })).toBe(false)
    expect(missingMaterials(state, { plank: 5, screw: 1 })).toEqual({ plank: 1, screw: 1 })
    expect(spendMaterials(state, { plank: 5 })).toBeNull()
    const spent = spendMaterials(state, { plank: 4, bolt: 1 })
    expect(spent).not.toBeNull()
    state = spent as GameState
    expect(materialCount(state, 'plank')).toBe(0)
    expect(materialCount(state, 'bolt')).toBe(1)
  })

  it('reads a cost back as a sentence', () => {
    expect(formatMaterials({ plank: 6, bolt: 3 })).toBe('6 PLANK, 3 BOLT')
    expect(formatMaterials({})).toBe('NOTHING')
  })

  it('never mutates the state it was handed', () => {
    const state = addMaterials(farm(), { plank: 4 })
    const next = addMaterials(state, { plank: 4 })
    expect(materialCount(state, 'plank')).toBe(4)
    expect(materialCount(next, 'plank')).toBe(8)
  })
})

describe('land', () => {
  it('starts with the home meadow and nothing else', () => {
    const state = farm()
    expect(ownsRegion(state, 'home-meadow')).toBe(true)
    expect(ownsRegion(state, 'south-paddock')).toBe(false)
    expect(isTileOwned(state, 2, 2)).toBe(true)
    expect(isTileOwned(state, 9, 9)).toBe(false)
    expect(isTileOwned(state, -1, 0)).toBe(false)
    expect(regionsForSale(state).length).toBe(REGIONS.length - 1)
  })

  it('refuses a region the level has not reached', () => {
    const state = farm()
    state.gold = 100_000
    state.progression.materials = { deed: 4 }
    const result = buyRegion(state, 'south-paddock')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('LEVEL 8')
    expect(ownsRegion(result.state, 'south-paddock')).toBe(false)
  })

  it('refuses a region the purse cannot cover', () => {
    const state = farm()
    state.progression.level = 8
    state.gold = 10
    state.progression.materials = { deed: 4 }
    const result = buyRegion(state, 'south-paddock')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('3000G')
  })

  it('refuses a region without the deeds, however much gold there is', () => {
    const state = farm()
    state.progression.level = 8
    state.gold = 100_000
    const result = buyRegion(state, 'south-paddock')
    expect(result.ok).toBe(false)
    expect(result.message).toContain(materialName('deed'))
    expect(result.state.gold).toBe(100_000)
    expect(ownsRegion(result.state, 'south-paddock')).toBe(false)
  })

  it('sells the land for a level, gold and a deed, all three', () => {
    const state = farm()
    state.progression.level = 8
    state.gold = 100_000
    state.progression.materials = { deed: 2 }
    const result = buyRegion(state, 'south-paddock')
    expect(result.ok).toBe(true)
    expect(ownsRegion(result.state, 'south-paddock')).toBe(true)
    expect(result.state.gold).toBe(97_000)
    expect(materialCount(result.state, 'deed')).toBe(1)
    expect(isTileOwned(result.state, 2, 9)).toBe(true)
    expect(result.state.stats.spent).toBe(3000)
  })

  it('refuses to sell the same field twice, or a field nobody owns', () => {
    const state = farm()
    state.progression.level = 90
    state.gold = 1_000_000
    state.progression.materials = { deed: 20 }
    const bought = buyRegion(state, 'south-paddock').state
    expect(buyRegion(bought, 'south-paddock').ok).toBe(false)
    expect(buyRegion(bought, 'atlantis').ok).toBe(false)
    expect(buyRegion(bought, 'home-meadow').ok).toBe(false)
  })

  it('sorts what is for sale by the level that opens it', () => {
    const forSale = regionsForSale(farm())
    for (let i = 1; i < forSale.length; i++) {
      expect(forSale[i].level).toBeGreaterThanOrEqual(forSale[i - 1].level)
    }
  })
})

describe('a save from before the farm was a business', () => {
  /** A version 1 payload: the old shape, with none of the wave-three fields. */
  function legacySave(): string {
    const raw = JSON.parse(serialize(farm())) as Record<string, unknown>
    for (const key of [
      'buildings',
      'animals',
      'machines',
      'hay',
      'progression',
      'market',
      'orders',
      'loans',
      'stall',
    ]) {
      delete raw[key]
    }
    raw['version'] = 1
    raw['gold'] = 4321
    return JSON.stringify(raw)
  }

  it('loads, rather than being thrown away', () => {
    const loaded = deserialize(legacySave())
    expect(loaded).not.toBeNull()
    expect(loaded?.gold).toBe(4321)
  })

  it('gains every new field at a sane default', () => {
    const loaded = deserialize(legacySave())
    expect(loaded).not.toBeNull()
    if (loaded === null) return
    expect(loaded.buildings).toEqual([])
    expect(loaded.animals).toEqual([])
    expect(loaded.machines).toEqual([])
    expect(loaded.hay).toBe(0)
    expect(loaded.orders).toEqual([])
    expect(loaded.loans).toEqual([])
    expect(loaded.progression.level).toBe(1)
    expect(loaded.progression.xp).toBe(0)
    expect(loaded.progression.siloCap).toBe(SILO_START_CAP)
    expect(loaded.progression.barnCap).toBe(BARN_START_CAP)
    expect(loaded.progression.unlockedRegions).toContain('home-meadow')
    expect(loaded.market.reputation).toBeGreaterThan(0)
    expect(loaded.market.supply).toEqual({})
    expect(loaded.market.history).toEqual([])
  })

  it('comes back playable: the migrated farm still owns its own front garden', () => {
    const loaded = deserialize(legacySave())
    expect(loaded).not.toBeNull()
    if (loaded === null) return
    expect(ownsRegion(loaded, 'home-meadow')).toBe(true)
    expect(storeSpace(loaded, 'silo').cap).toBe(SILO_START_CAP)
    expect(grantXp(loaded, 900, 'crate').leveled).toEqual([2, 3, 4])
  })
})
