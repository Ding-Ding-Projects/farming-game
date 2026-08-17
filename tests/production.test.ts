import { describe, expect, it } from 'vitest'
import { createMarket } from '../src/game/economy'
import { requireMachine, requireRecipe } from '../src/game/factories'
import { createProgression } from '../src/game/progression'
import {
  HOURS_PER_NIGHT,
  canRun,
  collectMachine,
  insertIntoMachine,
  machineAt,
  machineById,
  machineDefFor,
  machineLevel,
  machineStatus,
  nightlyProduction,
  outputItem,
  placeMachine,
  recipeFor,
  recipeLevel,
  recipesAvailable,
} from '../src/game/production'
import { addItem, countItem, createState, tileIndex } from '../src/game/state'
import type { Machine } from '../src/game/farm-types'
import type { GameState, ItemRef, Quality } from '../src/game/types'

const MILL_TILE = tileIndex(6, 5)
const OVEN_TILE = tileIndex(7, 5)

function farm(): GameState {
  const base = createState(41)
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
  state.player = { x: 4, y: 2, facing: 'down' }
  state.gold = 200_000
  state.progression.level = 100
  // No materials by default: bulk materials share the barn store's cap, and a test about
  // production should not be quietly fighting a shelf full of stone.
  return state
}

/** The fittings a build needs, for the tests that actually buy a machine. */
function stocked(state: GameState): GameState {
  state.progression.materials = {
    wood: 100,
    stone: 100,
    fibre: 50,
    plank: 100,
    nail: 50,
    bolt: 50,
    screw: 50,
    tape: 20,
    mallet: 2,
    axe: 2,
    saw: 2,
  }
  return state
}

function machine(id: string, kind: string, index: number): Machine {
  return { id, kind, index, queue: [], ready: [] }
}

function produce(cropId: string, quality: Quality = 'normal'): ItemRef {
  return { kind: 'produce', cropId, quality }
}

function product(productId: string, quality: Quality = 'normal'): ItemRef {
  return { kind: 'product', productId, quality }
}

/** A farm with a mill standing on it and `wheat` in the bag. */
function withMill(wheat = 6, quality: Quality = 'normal'): GameState {
  const state = farm()
  state.machines = [machine('mch-1', 'mill', MILL_TILE)]
  return wheat > 0 ? addItem(state, produce('wheat', quality), wheat) : state
}

function heldProduct(state: GameState, productId: string): Record<Quality, number> {
  return {
    normal: countItem(state, product(productId, 'normal')),
    silver: countItem(state, product(productId, 'silver')),
    gold: countItem(state, product(productId, 'gold')),
  }
}

describe('placing a machine', () => {
  it('buys and sets down in one move, spending gold and materials', () => {
    const state = stocked(farm())
    const def = requireMachine('mill')
    const wood = state.progression.materials.wood ?? 0
    const result = placeMachine(state, 'mill', MILL_TILE)
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold - def.cost)
    expect(result.state.progression.materials.wood).toBe(wood - (def.materials.wood ?? 0))
    expect(result.state.machines.length).toBe(1)
    expect(result.state.machines[0]).toMatchObject({ kind: 'mill', index: MILL_TILE })
    expect(machineAt(result.state, MILL_TILE)?.kind).toBe('mill')
  })

  it('commits nothing when the tile refuses it', () => {
    const state = stocked(farm())
    state.tiles[MILL_TILE].ground = 'water'
    const result = placeMachine(state, 'mill', MILL_TILE)
    expect(result.ok).toBe(false)
    expect(result.state.gold).toBe(state.gold)
    expect(result.state.machines).toEqual([])
  })

  it('refuses to stack two machines on one tile', () => {
    let state = stocked(farm())
    state = placeMachine(state, 'mill', MILL_TILE).state
    const second = placeMachine(state, 'bakery', MILL_TILE)
    expect(second.ok).toBe(false)
    expect(second.state.machines.length).toBe(1)
  })

  it('refuses a machine the level has not reached, and one nobody builds', () => {
    const state = stocked(farm())
    state.progression.level = 1
    const early = placeMachine(state, 'keg', MILL_TILE)
    expect(early.ok).toBe(false)
    expect(early.message).toContain(`LEVEL ${machineLevel(requireMachine('keg'))}`)
    expect(placeMachine(stocked(farm()), 'antimatter-press', MILL_TILE).ok).toBe(false)
  })

  it('refuses a tile that is not on the farm', () => {
    const state = stocked(farm())
    expect(placeMachine(state, 'mill', -1).ok).toBe(false)
    expect(placeMachine(state, 'mill', state.tiles.length).ok).toBe(false)
  })

  it('gives every machine its own id', () => {
    let state = stocked(farm())
    state = placeMachine(state, 'mill', MILL_TILE).state
    state = placeMachine(state, 'bakery', OVEN_TILE).state
    expect(new Set(state.machines.map((m) => m.id)).size).toBe(2)
    expect(machineById(state, state.machines[1].id)?.kind).toBe('bakery')
    expect(machineById(state, 'mch-99')).toBeNull()
  })
})

describe('canRun', () => {
  it('says what is short, and by exactly how many', () => {
    const state = withMill(1)
    const check = canRun(state, requireRecipe('mill.flour'))
    expect(check.ok).toBe(false)
    expect(check.missing.length).toBe(1)
    expect(check.missing[0].short).toBe(2)
  })

  it('counts every grade toward the same requirement', () => {
    let state = withMill(1)
    state = addItem(state, produce('wheat', 'gold'), 2)
    expect(canRun(state, requireRecipe('mill.flour')).ok).toBe(true)
  })

  it('folds a repeated ingredient into one requirement', () => {
    const recipe = requireRecipe('bakery.bread')
    let state = farm()
    state = addItem(state, product('flour'), 1)
    state = addItem(state, product('egg'), 1)
    const short = canRun(state, recipe)
    expect(short.ok).toBe(false)
    expect(short.missing.map((entry) => entry.short)).toEqual([1])
  })
})

describe('inserting a job', () => {
  it('takes the ingredients out of the bag at once', () => {
    const state = withMill(6)
    const result = insertIntoMachine(state, 'mch-1', 'mill.flour')
    expect(result.ok).toBe(true)
    expect(countItem(result.state, produce('wheat'))).toBe(3)
    expect(result.state.machines[0].queue.length).toBe(1)
    expect(result.state.machines[0].queue[0]).toMatchObject({
      recipeId: 'mill.flour',
      hoursLeft: requireRecipe('mill.flour').hours,
      quality: 'normal',
    })
  })

  it('refuses a short recipe, naming what is missing and how many', () => {
    const state = withMill(1)
    const result = insertIntoMachine(state, 'mch-1', 'mill.flour')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('2 MORE')
    expect(result.message).toContain('WHEAT')
    expect(countItem(result.state, produce('wheat'))).toBe(1)
    expect(result.state.machines[0].queue).toEqual([])
  })

  it('works the queue in the order it was filled', () => {
    let state = withMill(3)
    state = addItem(state, produce('corn'), 3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state = insertIntoMachine(state, 'mch-1', 'mill.cornmeal').state
    expect(state.machines[0].queue.map((job) => job.recipeId)).toEqual([
      'mill.flour',
      'mill.cornmeal',
    ])
    const status = machineStatus(state, 'mch-1')
    expect(status?.active?.recipeId).toBe('mill.flour')
    expect(status?.queued).toBe(1)
    expect(status?.hoursLeft).toBe(
      requireRecipe('mill.flour').hours + requireRecipe('mill.cornmeal').hours,
    )
  })

  it('refuses once the queue is full, and says how many it holds', () => {
    const def = requireMachine('mill')
    const capacity = def.queueSize + 1
    let state = withMill(3 * (capacity + 1))
    for (let i = 0; i < capacity; i++) {
      const result = insertIntoMachine(state, 'mch-1', 'mill.flour')
      expect(result.ok, `job ${i + 1}`).toBe(true)
      state = result.state
    }
    const overfull = insertIntoMachine(state, 'mch-1', 'mill.flour')
    expect(overfull.ok).toBe(false)
    expect(overfull.message).toContain(`${capacity} JOBS`)
    expect(machineStatus(state, 'mch-1')?.free).toBe(0)
  })

  it('refuses a recipe the machine cannot make, and a machine that is not there', () => {
    const state = withMill(6)
    expect(insertIntoMachine(state, 'mch-1', 'bakery.bread').ok).toBe(false)
    expect(insertIntoMachine(state, 'mch-9', 'mill.flour').ok).toBe(false)
  })

  it('refuses a recipe the level has not reached', () => {
    const state = withMill(6)
    state.progression.level = 12
    const late = insertIntoMachine(addItem(state, produce('barley'), 3), 'mch-1', 'mill.malt')
    expect(late.ok).toBe(false)
    expect(late.message).toContain('LEVEL')
    expect(recipesAvailable(state, 'mill').map((r) => r.id)).toEqual(['mill.flour', 'mill.cornmeal'])
  })

  it('spends the cheapest stock and keeps the rest of the good grades back', () => {
    let state = withMill(2)
    state = addItem(state, produce('wheat', 'gold'), 3)
    const result = insertIntoMachine(state, 'mch-1', 'mill.flour')
    expect(result.ok).toBe(true)
    expect(result.state.machines[0].queue[0].quality).toBe('gold')
    expect(countItem(result.state, produce('wheat', 'gold'))).toBe(2)
    expect(countItem(result.state, produce('wheat', 'normal'))).toBe(0)
  })
})

describe('the overnight pass', () => {
  it('finishes a short job and banks its output', () => {
    let state = withMill(3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    const night = nightlyProduction(state)
    expect(night.finished).toBe(1)
    expect(night.blocked).toBe(0)
    expect(countItem(night.state, product('flour'))).toBe(requireRecipe('mill.flour').outputCount)
    expect(night.state.machines[0].queue).toEqual([])
  })

  it('passes the hours a finished job did not need to the one behind it', () => {
    let state = withMill(3)
    state = addItem(state, produce('corn'), 3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state = insertIntoMachine(state, 'mch-1', 'mill.cornmeal').state
    const night = nightlyProduction(state)
    expect(night.finished).toBe(2)
    expect(countItem(night.state, product('flour'))).toBe(2)
    expect(countItem(night.state, product('cornmeal'))).toBe(2)
  })

  it('leaves a long job part-done, night after night, until it is not', () => {
    let state = farm()
    state.machines = [machine('mch-1', 'keg', MILL_TILE)]
    state = addItem(state, produce('grape'), 12)
    const recipe = requireMachine('keg').recipes[0]
    state = insertIntoMachine(state, 'mch-1', recipe.id).state
    expect(recipe.hours).toBeGreaterThan(HOURS_PER_NIGHT)

    let nights = 0
    while (state.machines[0].queue.length > 0 && nights < 10) {
      const night = nightlyProduction(state)
      state = night.state
      nights++
    }
    expect(nights).toBe(Math.ceil(recipe.hours / HOURS_PER_NIGHT))
    expect(countItem(state, product(recipe.outputProductId))).toBe(recipe.outputCount)
  })

  it('pays experience for the work, once', () => {
    let state = withMill(3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    const before = state.progression.xp
    const night = nightlyProduction(state)
    expect(night.state.progression.xp).toBe(before + 8 + 2 * 3)
  })

  it('does nothing at all to an idle machine', () => {
    const state = withMill(0)
    const night = nightlyProduction(state)
    expect(night.finished).toBe(0)
    expect(night.blocked).toBe(0)
    expect(night.state.machines[0].queue).toEqual([])
  })

  it('holds a finished job in the machine when the barn will not take it', () => {
    let state = withMill(3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state.progression.barnCap = 0

    const night = nightlyProduction(state)
    expect(night.blocked).toBe(1)
    expect(night.finished).toBe(0)
    expect(countItem(night.state, product('flour'))).toBe(0)
    expect(night.state.machines[0].ready).toEqual([
      { item: product('flour'), count: requireRecipe('mill.flour').outputCount },
    ])
    expect(night.state.machines[0].queue).toEqual([])
    expect(machineStatus(night.state, 'mch-1')?.readyCount).toBe(2)
  })
})

describe('collecting from a machine', () => {
  it('empties the holding pen into the bag', () => {
    let state = withMill(3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state.progression.barnCap = 0
    state = nightlyProduction(state).state
    state.progression.barnCap = 200

    const result = collectMachine(state, 'mch-1')
    expect(result.ok).toBe(true)
    expect(countItem(result.state, product('flour'))).toBe(2)
    expect(result.state.machines[0].ready).toEqual([])
  })

  it('leaves what still will not fit in the machine rather than destroying it', () => {
    let state = withMill(6)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state.progression.barnCap = 0
    state = nightlyProduction(state).state
    expect(state.machines[0].ready[0].count).toBe(4)

    state.progression.barnCap = 3
    const result = collectMachine(state, 'mch-1')
    expect(result.ok).toBe(true)
    expect(countItem(result.state, product('flour'))).toBe(3)
    expect(result.state.machines[0].ready).toEqual([{ item: product('flour'), count: 1 }])
    expect(result.message).toContain('NO ROOM')
  })

  it('refuses when there is no room at all, and says which store', () => {
    let state = withMill(3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state.progression.barnCap = 0
    state = nightlyProduction(state).state
    const result = collectMachine(state, 'mch-1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('BARN STORE')
    expect(result.state.machines[0].ready[0].count).toBe(2)
  })

  it('says how long is left rather than pretending to be empty', () => {
    let state = farm()
    state.machines = [machine('mch-1', 'keg', MILL_TILE)]
    state = addItem(state, produce('grape'), 4)
    state = insertIntoMachine(state, 'mch-1', requireMachine('keg').recipes[0].id).state
    const result = collectMachine(state, 'mch-1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('STILL WORKING')
  })

  it('refuses an empty machine and a machine that is not there', () => {
    const state = withMill(0)
    expect(collectMachine(state, 'mch-1').ok).toBe(false)
    expect(collectMachine(state, 'mch-9').ok).toBe(false)
  })
})

describe('quality carries through the chain', () => {
  it('takes the grade of the best ingredient it was fed', () => {
    let state = withMill(2)
    state = addItem(state, produce('wheat', 'silver'), 1)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    expect(state.machines[0].queue[0].quality).toBe('silver')
    const night = nightlyProduction(state)
    expect(heldProduct(night.state, 'flour')).toMatchObject({ normal: 0, silver: 2, gold: 0 })
  })

  it('carries a gold wheat all the way to a gold sandwich, three machines deep', () => {
    let state = farm()
    state.machines = [machine('mch-1', 'mill', MILL_TILE), machine('mch-2', 'bakery', OVEN_TILE)]
    state = addItem(state, produce('wheat', 'gold'), 3)
    state = addItem(state, product('egg'), 1)
    state = addItem(state, product('cheese'), 1)
    state = addItem(state, produce('lettuce'), 1)

    // wheat -> flour
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state = nightlyProduction(state).state
    expect(heldProduct(state, 'flour').gold).toBe(2)

    // flour -> bread
    state = insertIntoMachine(state, 'mch-2', 'bakery.bread').state
    state = nightlyProduction(state).state
    expect(heldProduct(state, 'bread').gold).toBe(1)

    // bread -> sandwich
    state = insertIntoMachine(state, 'mch-2', 'bakery.sandwich').state
    state = nightlyProduction(state).state
    expect(heldProduct(state, 'sandwich')).toMatchObject({ normal: 0, silver: 0, gold: 2 })
  })

  it('names the output at the grade it will come out', () => {
    const recipe = requireRecipe('mill.flour')
    expect(outputItem(recipe, 'gold')).toEqual({
      kind: 'product',
      productId: 'flour',
      quality: 'gold',
    })
  })
})

describe('catalogue lookups', () => {
  it('finds a machine and a recipe, and answers null for neither', () => {
    expect(machineDefFor('mill')?.kind).toBe('mill')
    expect(machineDefFor('nothing-at-all')).toBeNull()
    expect(recipeFor('mill', 'mill.flour')?.outputProductId).toBe('flour')
    expect(recipeFor('mill', 'bakery.bread')).toBeNull()
    expect(recipeFor('nothing-at-all', 'mill.flour')).toBeNull()
  })

  it('never lets a recipe be reachable before its own machine', () => {
    for (const def of [requireMachine('mill'), requireMachine('bakery'), requireMachine('keg')]) {
      for (const recipe of def.recipes) {
        expect(recipeLevel(recipe), recipe.id).toBeGreaterThanOrEqual(machineLevel(def))
      }
    }
  })

  it('shows only what the player could run at their level', () => {
    const state = farm()
    state.progression.level = 22
    for (const recipe of recipesAvailable(state, 'bakery')) {
      expect(recipeLevel(recipe)).toBeLessThanOrEqual(22)
    }
    expect(recipesAvailable(state, 'nothing-at-all')).toEqual([])
  })

  it('reports nothing for a machine that is not standing', () => {
    expect(machineStatus(farm(), 'mch-1')).toBeNull()
  })
})
