import { describe, expect, it } from 'vitest'
import { SILO_HAY_CAPACITY } from '../src/game/buildings'
import { createMarket } from '../src/game/economy'
import {
  MAX_FRIENDSHIP,
  MISERABLE,
  START_FRIENDSHIP,
  ageInDays,
  animalById,
  animalsIn,
  buyAnimal,
  canGraze,
  collectProduce,
  cutGrass,
  feedAnimal,
  friendshipLabel,
  hayCapacity,
  hayRoom,
  housesSpecies,
  isProduceReady,
  letOut,
  nightlyLivestock,
  petAnimal,
} from '../src/game/livestock'
import { createProgression } from '../src/game/progression'
import { requireSpecies } from '../src/game/species'
import { countItem, createState, tileIndex } from '../src/game/state'
import type { Animal, Building, SpeciesId } from '../src/game/farm-types'
import type { GameState, Quality, Season } from '../src/game/types'

const QUALITIES: Quality[] = ['normal', 'silver', 'gold']

/** Every roll comes back the same, so a test states its own luck. */
function fixed(value: number): () => number {
  return () => value
}

function farm(season: Season = 'spring'): GameState {
  const base = createState(31)
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
  for (const tile of state.tiles) {
    tile.ground = 'grass'
    tile.watered = false
    tile.fertilized = false
    tile.sprinkler = false
    tile.plant = null
  }
  state.inventory = []
  state.season = season
  state.weather = 'clear'
  state.player = { x: 4, y: 2, facing: 'down' }
  state.gold = 100_000
  state.progression.level = 90
  return state
}

function building(id: string, kind: string, x = 4, y = 4): Building {
  return { id, kind, x, y }
}

function animal(species: SpeciesId, over: Partial<Animal> = {}): Animal {
  const def = requireSpecies(species)
  return {
    id: 'animal1',
    species,
    name: 'BESS',
    buildingId: 'bld-1',
    age: ageInDays(def.id) + 5,
    friendship: START_FRIENDSHIP,
    fedToday: false,
    pettedToday: false,
    daysUntilProduce: 0,
    outside: false,
    unwell: false,
    ...over,
  }
}

/** One animal in one building, ready to be worked. */
function withAnimal(species: SpeciesId, kind: string, over: Partial<Animal> = {}, season: Season = 'spring'): GameState {
  const state = farm(season)
  state.buildings = [building('bld-1', kind)]
  state.animals = [animal(species, over)]
  return state
}

function heldProduct(state: GameState, productId: string): number {
  let total = 0
  for (const quality of QUALITIES) {
    total += countItem(state, { kind: 'product', productId, quality })
  }
  return total
}

describe('the daily loop', () => {
  it('feeds an animal from the silo and takes the hay', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 10
    const cow = requireSpecies('cow')
    const result = feedAnimal(state, 'animal1')
    expect(result.ok).toBe(true)
    expect(result.state.hay).toBe(10 - cow.hayPerDay)
    expect(result.state.animals[0].fedToday).toBe(true)
    expect(result.state.animals[0].friendship).toBeGreaterThan(START_FRIENDSHIP)
  })

  it('refuses a second helping, naming the animal', () => {
    const state = withAnimal('cow', 'barn', { fedToday: true })
    state.hay = 10
    const result = feedAnimal(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('BESS')
    expect(result.state.hay).toBe(10)
  })

  it('says exactly how much hay is short when the silo is empty', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 0
    const result = feedAnimal(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('2 HAY')
    expect(result.message).toContain('2 SHORT')
  })

  it('pets an animal once a day, and the friendship shows', () => {
    const state = withAnimal('cow', 'barn')
    const first = petAnimal(state, 'animal1')
    expect(first.ok).toBe(true)
    expect(first.state.animals[0].friendship).toBeGreaterThan(START_FRIENDSHIP)
    expect(first.state.animals[0].pettedToday).toBe(true)
    const again = petAnimal(first.state, 'animal1')
    expect(again.ok).toBe(false)
    expect(again.state.animals[0].friendship).toBe(first.state.animals[0].friendship)
  })

  it('reads friendship back as a word the player can act on', () => {
    expect(friendshipLabel(MAX_FRIENDSHIP)).toBe('DEVOTED')
    expect(friendshipLabel(0)).toBe('MISERABLE')
    expect(friendshipLabel(MISERABLE)).toBe('SULKY')
    expect(friendshipLabel(500)).toBe('SETTLED')
  })

  it('never lets friendship run past its bounds', () => {
    const state = withAnimal('cow', 'barn', { friendship: MAX_FRIENDSHIP })
    state.hay = 10
    const result = feedAnimal(petAnimal(state, 'animal1').state, 'animal1')
    expect(result.state.animals[0].friendship).toBe(MAX_FRIENDSHIP)
  })
})

describe('winter', () => {
  it('grazes nothing at all', () => {
    expect(canGraze('spring')).toBe(true)
    expect(canGraze('summer')).toBe(true)
    expect(canGraze('fall')).toBe(true)
    expect(canGraze('winter')).toBe(false)
  })

  it('keeps the herd in, however much the player asks', () => {
    const state = withAnimal('cow', 'barn', {}, 'winter')
    const result = letOut(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('WINTER')
    expect(result.state.animals[0].outside).toBe(false)
  })

  it('forces every mouth onto stored hay', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'winter')
    state.hay = 0
    const refused = feedAnimal(state, 'animal1')
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('NOTHING GRAZES IN WINTER')

    state.hay = 6
    const fed = feedAnimal(state, 'animal1')
    expect(fed.ok).toBe(true)
    expect(fed.state.hay).toBe(4)
  })

  it('leaves an animal outside in winter unfed overnight, hay or no grass', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'winter')
    state.hay = 0
    const night = nightlyLivestock(state, fixed(0.99))
    expect(night.unfed).toBe(1)
    expect(night.fed).toBe(0)
    expect(night.state.animals[0].friendship).toBeLessThan(START_FRIENDSHIP)
  })

  it('feeds that same animal from the silo when there is hay in it', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'winter')
    state.hay = 10
    const night = nightlyLivestock(state, fixed(0.99))
    expect(night.fed).toBe(1)
    expect(night.unfed).toBe(0)
    expect(night.state.hay).toBe(8)
  })

  it('grazes for free in a green season, and the silo is untouched', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'fall')
    state.hay = 10
    const night = nightlyLivestock(state, fixed(0.99))
    expect(night.fed).toBe(1)
    expect(night.state.hay).toBe(10)
  })

  it('cuts no hay under snow, and cuts real hay before it', () => {
    const winter = withAnimal('cow', 'barn', {}, 'winter')
    winter.buildings = [...winter.buildings, building('bld-2', 'silo', 8, 0)]
    const refused = cutGrass(winter, tileIndex(1, 5))
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('WINTER')
    expect(refused.state.hay).toBe(0)

    const autumn = withAnimal('cow', 'barn', {}, 'fall')
    autumn.buildings = [...autumn.buildings, building('bld-2', 'silo', 8, 0)]
    const cut = cutGrass(autumn, tileIndex(1, 5))
    expect(cut.ok).toBe(true)
    expect(cut.state.hay).toBeGreaterThanOrEqual(4)
    expect(cut.state.hay).toBeLessThanOrEqual(6)
  })

  it('has nowhere to put hay without a silo', () => {
    const state = withAnimal('cow', 'barn', {}, 'fall')
    expect(hayCapacity(state)).toBe(0)
    expect(hayRoom(state)).toEqual({ room: 0, limit: 'none' })
    const result = cutGrass(state, tileIndex(1, 5))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('SILO')
  })

  it('counts one silo as one silo of fodder', () => {
    const state = withAnimal('cow', 'barn', {}, 'fall')
    state.buildings = [...state.buildings, building('bld-2', 'silo', 8, 0)]
    expect(hayCapacity(state)).toBe(SILO_HAY_CAPACITY)
    state.buildings = [...state.buildings, building('bld-3', 'silo', 8, 4)]
    expect(hayCapacity(state)).toBe(SILO_HAY_CAPACITY * 2)
  })
})

describe('the unfed animal', () => {
  it('loses friendship overnight and is counted as hungry', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 0
    const night = nightlyLivestock(state, fixed(0.99))
    expect(night.unfed).toBe(1)
    expect(night.state.animals[0].friendship).toBe(START_FRIENDSHIP - 35 - 5)
  })

  it('loses more the longer it goes, and eventually gives nothing at all', () => {
    let state = withAnimal('cow', 'barn')
    state.hay = 0
    for (let night = 0; night < 4; night++) state = nightlyLivestock(state, fixed(0.99)).state
    const cow = state.animals[0]
    expect(cow.friendship).toBeLessThan(MISERABLE)
    expect(isProduceReady(state, cow)).toBe(false)
    const result = collectProduce(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('MISERABLE')
  })

  it('may fall ill on an empty stomach, and mends on a day of proper care', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 0
    const ill = nightlyLivestock(state, fixed(0)).state
    expect(ill.animals[0].unwell).toBe(true)
    expect(collectProduce(ill, 'animal1').ok).toBe(false)

    ill.hay = 10
    const cared = petAnimal(feedAnimal(ill, 'animal1').state, 'animal1').state
    const mended = nightlyLivestock(cared, fixed(0.99)).state
    expect(mended.animals[0].unwell).toBe(false)
  })

  it('keeps friendship steady on a day of feeding and fussing', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 10
    const cared = petAnimal(feedAnimal(state, 'animal1').state, 'animal1').state
    const before = cared.animals[0].friendship
    const night = nightlyLivestock(cared, fixed(0.99))
    expect(night.fed).toBe(1)
    expect(night.state.animals[0].friendship).toBe(before)
  })

  it('leaks slowly for an animal fed by the trough and never touched', () => {
    const state = withAnimal('cow', 'barn')
    state.hay = 40
    const night = nightlyLivestock(state, fixed(0.99))
    expect(night.fed).toBe(1)
    expect(night.state.animals[0].friendship).toBeLessThan(START_FRIENDSHIP)
  })
})

describe('a night outside', () => {
  it('penalises an animal that did not find the door', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'fall')
    const night = nightlyLivestock(state, fixed(0))
    const cow = night.state.animals[0]
    expect(cow.friendship).toBeLessThan(START_FRIENDSHIP)
    expect(cow.unwell).toBe(true)
    expect(cow.outside).toBe(false)
    expect(night.unwell).toBe(1)
  })

  it('leaves an animal that came home on its own no worse off', () => {
    const state = withAnimal('cow', 'barn', { outside: true, pettedToday: true }, 'fall')
    const night = nightlyLivestock(state, fixed(0.99))
    const cow = night.state.animals[0]
    expect(cow.unwell).toBe(false)
    expect(cow.outside).toBe(false)
    expect(cow.friendship).toBeGreaterThanOrEqual(START_FRIENDSHIP)
  })

  it('brings the whole herd in either way', () => {
    const state = withAnimal('cow', 'barn', { outside: true }, 'fall')
    state.animals = [
      ...state.animals,
      animal('cow', { id: 'animal2', name: 'DAISY', outside: true }),
    ]
    const night = nightlyLivestock(state, fixed(0.5))
    for (const cow of night.state.animals) expect(cow.outside).toBe(false)
  })

  it('refuses to let an unwell animal out at all', () => {
    const state = withAnimal('cow', 'barn', { unwell: true }, 'fall')
    const result = letOut(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.state.animals[0].outside).toBe(false)
  })

  it('refuses to let anything out into a storm', () => {
    const state = withAnimal('cow', 'barn', {}, 'fall')
    state.weather = 'storm'
    expect(letOut(state, 'animal1').ok).toBe(false)
  })
})

describe('collecting', () => {
  it('gives nothing from an animal too young to produce', () => {
    const state = withAnimal('turkey', 'big-coop', {
      age: 0,
      daysUntilProduce: ageInDays('turkey'),
    })
    expect(isProduceReady(state, state.animals[0])).toBe(false)
    const result = collectProduce(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('STILL YOUNG')
    expect(heldProduct(result.state, 'turkey-egg')).toBe(0)
  })

  it('gives more from a devoted animal than from a sulky one', () => {
    const devoted = withAnimal('turkey', 'big-coop', { friendship: 900 })
    const sulky = withAnimal('turkey', 'big-coop', { friendship: 150 })
    const rich = collectProduce(devoted, 'animal1')
    const poor = collectProduce(sulky, 'animal1')
    expect(rich.ok).toBe(true)
    expect(poor.ok).toBe(true)
    expect(heldProduct(rich.state, 'turkey-egg')).toBeGreaterThan(
      heldProduct(poor.state, 'turkey-egg'),
    )
  })

  it('resets the clock and pays experience', () => {
    const state = withAnimal('turkey', 'big-coop', { friendship: 700 })
    const result = collectProduce(state, 'animal1')
    expect(result.ok).toBe(true)
    expect(result.state.animals[0].daysUntilProduce).toBe(3)
    expect(result.state.progression.xp).toBeGreaterThan(0)
    expect(collectProduce(result.state, 'animal1').ok).toBe(false)
  })

  it('is deterministic: the same day on the same seed gives the same eggs', () => {
    const state = withAnimal('turkey', 'big-coop', { friendship: 700 })
    const first = collectProduce(state, 'animal1')
    const second = collectProduce(state, 'animal1')
    expect(heldProduct(first.state, 'turkey-egg')).toBe(heldProduct(second.state, 'turkey-egg'))
  })

  it('needs the shears in hand for a sheep, and says so', () => {
    const state = withAnimal('sheep', 'big-barn', { friendship: 700 })
    state.tool = 'hoe'
    const refused = collectProduce(state, 'animal1')
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('SHEARS')

    state.tool = 'hand'
    expect(collectProduce(state, 'animal1').ok).toBe(true)
  })

  it('gives nothing from a horse, which was bought for the ride', () => {
    const state = withAnimal('horse', 'stable', { friendship: 700 })
    const result = collectProduce(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('RIDES')
  })

  it('finds a pig nothing while it is shut in, and nothing at all in winter', () => {
    const inside = withAnimal('pig', 'deluxe-barn', { friendship: 700 }, 'fall')
    const shut = collectProduce(inside, 'animal1')
    expect(shut.ok).toBe(false)
    expect(shut.message).toContain('LET HER OUT')

    const outside = withAnimal('pig', 'deluxe-barn', { friendship: 700, outside: true }, 'fall')
    expect(collectProduce(outside, 'animal1').ok).toBe(true)

    const frozen = withAnimal('pig', 'deluxe-barn', { friendship: 700, outside: true }, 'winter')
    const cold = collectProduce(frozen, 'animal1')
    expect(cold.ok).toBe(false)
    expect(cold.message).toContain('SPRING')
  })

  it('holds the produce back rather than destroying it when the barn is full', () => {
    const state = withAnimal('turkey', 'big-coop', { friendship: 700 })
    state.progression.barnCap = 0
    const result = collectProduce(state, 'animal1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('BARN STORE')
    expect(result.state.animals[0].daysUntilProduce).toBe(0)
  })
})

describe('buying an animal', () => {
  it('moves a chicken into a coop and takes the gold', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop')]
    const chicken = requireSpecies('chicken')
    const result = buyAnimal(state, 'chicken', 'bld-1', 'HENRIETTA')
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold - chicken.cost)
    expect(result.state.animals.length).toBe(1)
    expect(result.state.animals[0]).toMatchObject({
      species: 'chicken',
      buildingId: 'bld-1',
      age: 0,
      friendship: START_FRIENDSHIP,
    })
    expect(result.state.animals[0].daysUntilProduce).toBe(ageInDays('chicken'))
  })

  it('will not put a cow in a coop', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop')]
    expect(housesSpecies('coop', 'cow')).toBe(false)
    const result = buyAnimal(state, 'cow', 'bld-1', 'BESS')
    expect(result.ok).toBe(false)
    expect(result.state.animals).toEqual([])
  })

  it('will not overfill a coop', () => {
    let state = farm()
    state.buildings = [building('bld-1', 'coop')]
    for (const name of ['ONE', 'TWO', 'THREE', 'FOUR']) {
      state = buyAnimal(state, 'chicken', 'bld-1', name).state
    }
    expect(animalsIn(state, 'bld-1').length).toBe(4)
    const overfull = buyAnimal(state, 'chicken', 'bld-1', 'FIVE')
    expect(overfull.ok).toBe(false)
    expect(overfull.message).toContain('FULL')
  })

  it('refuses an animal the level has not reached', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop')]
    state.progression.level = 1
    const result = buyAnimal(state, 'chicken', 'bld-1', 'HENRIETTA')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('LEVEL 8')
  })

  it('refuses a nameless animal, a very long name and a name already taken', () => {
    let state = farm()
    state.buildings = [building('bld-1', 'coop')]
    expect(buyAnimal(state, 'chicken', 'bld-1', '   ').ok).toBe(false)
    expect(buyAnimal(state, 'chicken', 'bld-1', 'A VERY LONG NAME INDEED').ok).toBe(false)
    state = buyAnimal(state, 'chicken', 'bld-1', 'HENRIETTA').state
    expect(buyAnimal(state, 'chicken', 'bld-1', 'henrietta').ok).toBe(false)
  })

  it('refuses when the purse is short and when there is no home', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop')]
    state.gold = 1
    expect(buyAnimal(state, 'chicken', 'bld-1', 'HENRIETTA').ok).toBe(false)
    state.gold = 100_000
    expect(buyAnimal(state, 'chicken', 'bld-9', 'HENRIETTA').ok).toBe(false)
  })

  it('gives every animal its own id', () => {
    let state = farm()
    state.buildings = [building('bld-1', 'coop')]
    state = buyAnimal(state, 'chicken', 'bld-1', 'ONE').state
    state = buyAnimal(state, 'chicken', 'bld-1', 'TWO').state
    expect(new Set(state.animals.map((a) => a.id)).size).toBe(2)
    expect(animalById(state, state.animals[1].id)?.name).toBe('TWO')
  })
})
