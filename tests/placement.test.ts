import { describe, expect, it } from 'vitest'
import { requireBuilding } from '../src/game/buildings'
import { createMarket } from '../src/game/economy'
import { createProgression } from '../src/game/progression'
import {
  FARMHOUSE,
  animalSaleValue,
  buildingAt,
  canPlace,
  demolishBuilding,
  demolishPlan,
  footprintOf,
  moveBuilding,
  moveFee,
  placeBuilding,
  placementMessage,
  tilesOf,
} from '../src/game/placement'
import { requireSpecies } from '../src/game/species'
import { createState, tileIndex } from '../src/game/state'
import type { Animal, Building, PlacementReason } from '../src/game/farm-types'
import type { GameState } from '../src/game/types'

/**
 * A farm scrubbed to bare grass with a purse and a bag of fittings, so every test
 * states its own obstruction rather than inheriting one from world generation.
 */
function farm(seed = 21): GameState {
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
  for (const tile of state.tiles) {
    tile.ground = 'grass'
    tile.watered = false
    tile.fertilized = false
    tile.sprinkler = false
    tile.plant = null
  }
  state.player = { x: 4, y: 2, facing: 'down' }
  state.gold = 60_000
  state.progression.level = 90
  state.progression.materials = {
    wood: 400,
    stone: 400,
    fibre: 200,
    plank: 400,
    nail: 200,
    bolt: 200,
    screw: 200,
    tape: 100,
    mallet: 4,
    axe: 4,
    saw: 4,
  }
  return state
}

function animal(id: string, species: string, buildingId: string): Animal {
  return {
    id,
    species,
    name: id.toUpperCase(),
    buildingId,
    age: 10,
    friendship: 500,
    fedToday: false,
    pettedToday: false,
    daysUntilProduce: 0,
    outside: false,
    unwell: false,
  }
}

function building(id: string, kind: string, x: number, y: number): Building {
  return { id, kind, x, y }
}

/** The reasons the per-tile verdict handed back, deduplicated. */
function reasons(tiles: ReadonlyArray<{ reason: PlacementReason | null }>): PlacementReason[] {
  const out: PlacementReason[] = []
  for (const tile of tiles) {
    if (tile.reason !== null && !out.includes(tile.reason)) out.push(tile.reason)
  }
  return out
}

const WELL = requireBuilding('well')

describe('canPlace', () => {
  it('accepts clear, reachable, owned ground', () => {
    const check = canPlace(farm(), WELL.footprint, 4, 4)
    expect(check.ok).toBe(true)
    expect(check.reason).toBeNull()
    expect(check.tiles.every((tile) => tile.ok)).toBe(true)
  })

  it('returns a verdict per tile, in row-major order', () => {
    const check = canPlace(farm(), { w: 3, h: 2 }, 3, 4)
    expect(check.tiles.length).toBe(6)
    expect(check.tiles.map((tile) => [tile.x, tile.y])).toEqual([
      [3, 4],
      [4, 4],
      [5, 4],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
  })

  it('refuses a footprint that runs off the map', () => {
    const state = farm()
    const check = canPlace(state, { w: 3, h: 2 }, 18, 4)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('out-of-bounds')
    expect(check.tiles.filter((tile) => tile.reason === 'out-of-bounds').length).toBe(2)

    const north = canPlace(state, { w: 2, h: 2 }, 4, -1)
    expect(north.reason).toBe('out-of-bounds')
  })

  it('refuses water, and names the one corner that is wet', () => {
    const state = farm()
    state.tiles[tileIndex(5, 5)].ground = 'water'
    const check = canPlace(state, { w: 2, h: 2 }, 4, 4)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('terrain')
    const blocked = check.tiles.filter((tile) => !tile.ok)
    expect(blocked.length).toBe(1)
    expect(blocked[0]).toMatchObject({ x: 5, y: 5, reason: 'terrain' })
  })

  it('refuses rock, log and weeds - the ground is cleared first', () => {
    for (const ground of ['rock', 'log', 'weeds'] as const) {
      const state = farm()
      state.tiles[tileIndex(4, 4)].ground = ground
      const check = canPlace(state, { w: 2, h: 2 }, 4, 4)
      expect(check.ok, ground).toBe(false)
      expect(check.reason, ground).toBe('terrain')
    }
  })

  it('refuses a tile with a crop growing on it', () => {
    const state = farm()
    state.tiles[tileIndex(5, 4)].ground = 'soil'
    state.tiles[tileIndex(5, 4)].plant = {
      cropId: 'parsnip',
      stage: 1,
      progress: 0,
      dry: 0,
      dead: false,
      fertilized: false,
      regrown: 0,
    }
    const check = canPlace(state, { w: 2, h: 2 }, 4, 4)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('occupied-plant')
    expect(reasons(check.tiles)).toEqual(['occupied-plant'])
  })

  it('refuses a sprinkler and a machine, each by its own name', () => {
    const sprinkled = farm()
    sprinkled.tiles[tileIndex(4, 4)].sprinkler = true
    expect(canPlace(sprinkled, { w: 2, h: 2 }, 4, 4).reason).toBe('occupied-sprinkler')

    const built = farm()
    built.machines = [{ id: 'mch-1', kind: 'mill', index: tileIndex(5, 5), queue: [], ready: [] }]
    expect(canPlace(built, { w: 2, h: 2 }, 4, 4).reason).toBe('occupied-machine')
  })

  it('refuses a footprint that overlaps a standing building', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'well', 4, 4)]
    const check = canPlace(state, WELL.footprint, 5, 5)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('occupied-building')
    const blocked = check.tiles.filter((tile) => !tile.ok)
    expect(blocked.map((tile) => [tile.x, tile.y])).toEqual([[5, 5]])
  })

  it('refuses a footprint that would swallow the farmhouse', () => {
    const state = farm()
    const check = canPlace(state, { w: 2, h: 2 }, FARMHOUSE.x, FARMHOUSE.y)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('occupied-building')
  })

  it('refuses land the player has not bought yet', () => {
    const state = farm()
    const check = canPlace(state, { w: 2, h: 2 }, 9, 5)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('locked-region')
    expect(reasons(check.tiles)).toEqual(['locked-region'])
  })

  it('accepts that same land once the region is bought', () => {
    const state = farm()
    state.progression.unlockedRegions = [...state.progression.unlockedRegions, 'willow-hollow']
    expect(canPlace(state, { w: 2, h: 2 }, 9, 5).ok).toBe(true)
  })

  it('refuses a footprint nobody could walk up to, and blames the bottom edge', () => {
    const state = farm()
    state.tiles[tileIndex(4, 6)].ground = 'water'
    state.tiles[tileIndex(5, 6)].ground = 'water'
    const check = canPlace(state, { w: 2, h: 2 }, 4, 4)
    expect(check.ok).toBe(false)
    expect(check.reason).toBe('unreachable')
    const blocked = check.tiles.filter((tile) => !tile.ok)
    expect(blocked.map((tile) => tile.y)).toEqual([5, 5])
  })

  it('reports the worst reason when a footprint straddles two problems', () => {
    const state = farm()
    state.tiles[tileIndex(4, 4)].ground = 'water'
    state.tiles[tileIndex(5, 4)].sprinkler = true
    const check = canPlace(state, { w: 2, h: 2 }, 4, 4)
    expect(check.reason).toBe('terrain')
    expect(reasons(check.tiles).sort()).toEqual(['occupied-sprinkler', 'terrain'])
  })

  it('gives every reason an English sentence, including the one that fits', () => {
    const named: PlacementReason[] = [
      'out-of-bounds',
      'locked-region',
      'terrain',
      'occupied-plant',
      'occupied-sprinkler',
      'occupied-machine',
      'occupied-building',
      'unreachable',
    ]
    for (const reason of named) {
      expect(placementMessage(reason, 'WELL').length, reason).toBeGreaterThan(0)
    }
    expect(placementMessage(null, 'WELL')).toContain('WELL')
  })
})

describe('placeBuilding', () => {
  it('spends gold and materials, and raises the building, on success', () => {
    const state = farm()
    const stone = state.progression.materials.stone ?? 0
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(state.gold - WELL.cost)
    expect(result.state.progression.materials.stone).toBe(stone - (WELL.materials.stone ?? 0))
    expect(result.state.buildings.length).toBe(1)
    expect(result.state.buildings[0]).toMatchObject({ kind: 'well', x: 4, y: 4 })
    expect(result.state.stats.spent).toBe(state.stats.spent + WELL.cost)
  })

  it('commits nothing at all when the ground refuses it', () => {
    const state = farm()
    state.tiles[tileIndex(5, 5)].ground = 'water'
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.ok).toBe(false)
    expect(result.state.gold).toBe(state.gold)
    expect(result.state.progression.materials.stone).toBe(state.progression.materials.stone)
    expect(result.state.buildings).toEqual([])
    expect(result.message).toBe(placementMessage('terrain', 'WELL'))
  })

  it('commits nothing when the purse is short, and says what it costs', () => {
    const state = farm()
    state.gold = 10
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.ok).toBe(false)
    expect(result.state.gold).toBe(10)
    expect(result.state.buildings).toEqual([])
    expect(result.message).toContain(`${WELL.cost}G`)
  })

  it('commits nothing when the materials are short, and names them', () => {
    const state = farm()
    state.progression.materials = { stone: 1 }
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.ok).toBe(false)
    expect(result.state.buildings).toEqual([])
    expect(result.message).toContain('STONE')
  })

  it('refuses a building the level has not reached, stating the level', () => {
    const state = farm()
    state.progression.level = 1
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.ok).toBe(false)
    expect(result.message).toContain(`LEVEL ${WELL.level}`)
  })

  it('refuses to sell the farmhouse, and refuses a kind nobody builds', () => {
    const state = farm()
    expect(placeBuilding(state, 'farmhouse', 4, 4).ok).toBe(false)
    expect(placeBuilding(state, 'observatory', 4, 4).ok).toBe(false)
  })

  it('pays experience for the work', () => {
    const state = farm()
    const result = placeBuilding(state, 'well', 4, 4)
    expect(result.state.progression.xp).toBeGreaterThan(state.progression.xp)
  })

  it('gives each building its own id, and answers which tile is whose', () => {
    let state = farm()
    state = placeBuilding(state, 'well', 4, 4).state
    state = placeBuilding(state, 'well', 6, 4).state
    expect(state.buildings.length).toBe(2)
    expect(new Set(state.buildings.map((b) => b.id)).size).toBe(2)
    expect(buildingAt(state, tileIndex(5, 5))?.id).toBe(state.buildings[0].id)
    expect(buildingAt(state, tileIndex(6, 4))?.id).toBe(state.buildings[1].id)
    expect(buildingAt(state, tileIndex(0, 10))).toBeNull()
  })

  it('covers exactly the tiles of its own footprint', () => {
    const raised = placeBuilding(farm(), 'well', 4, 4).state.buildings[0]
    expect(footprintOf(raised)).toEqual({ w: 2, h: 2 })
    expect(tilesOf(raised).sort((a, b) => a - b)).toEqual(
      [tileIndex(4, 4), tileIndex(5, 4), tileIndex(4, 5), tileIndex(5, 5)].sort((a, b) => a - b),
    )
  })
})

describe('moveBuilding', () => {
  it('lifts a building for a fee and sets it down elsewhere', () => {
    let state = farm()
    state = placeBuilding(state, 'well', 4, 4).state
    const id = state.buildings[0].id
    const purse = state.gold
    const result = moveBuilding(state, id, 6, 4)
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(purse - moveFee('well'))
    expect(result.state.buildings[0]).toMatchObject({ id, x: 6, y: 4 })
    expect(result.state.buildings.length).toBe(1)
  })

  it('is not blocked by its own walls when nudged one tile', () => {
    let state = farm()
    state = placeBuilding(state, 'well', 4, 4).state
    const result = moveBuilding(state, state.buildings[0].id, 5, 4)
    expect(result.ok).toBe(true)
  })

  it('refuses a spot the rules refuse, and charges nothing for asking', () => {
    let state = farm()
    state = placeBuilding(state, 'well', 4, 4).state
    state.tiles[tileIndex(8, 4)].ground = 'water'
    const purse = state.gold
    const result = moveBuilding(state, state.buildings[0].id, 8, 4)
    expect(result.ok).toBe(false)
    expect(result.state.gold).toBe(purse)
    expect(result.state.buildings[0]).toMatchObject({ x: 4, y: 4 })
  })

  it('refuses to move a building nowhere, or one that is not there', () => {
    let state = farm()
    state = placeBuilding(state, 'well', 4, 4).state
    expect(moveBuilding(state, state.buildings[0].id, 4, 4).ok).toBe(false)
    expect(moveBuilding(state, 'bld-99', 6, 4).ok).toBe(false)
  })

  it('carries the animals inside along with the walls', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop', 4, 4)]
    state.animals = [animal('animal1', 'chicken', 'bld-1')]
    const result = moveBuilding(state, 'bld-1', 9, 4)
    expect(result.ok).toBe(false) // that land is not bought
    const moved = moveBuilding(state, 'bld-1', 3, 4)
    expect(moved.ok).toBe(true)
    expect(moved.state.animals[0].buildingId).toBe('bld-1')
    expect(moved.state.animals.length).toBe(1)
  })
})

describe('demolition', () => {
  it('states plainly that nobody lived there', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'well', 4, 4)]
    const plan = demolishPlan(state, 'bld-1')
    expect(plan.ok).toBe(true)
    expect(plan.sold).toEqual([])
    expect(plan.moved).toEqual([])
    expect(plan.message).toContain('NOBODY LIVED THERE')
  })

  it('says the animals are sold at half price before it happens, then does it', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'coop', 4, 4)]
    state.animals = [animal('animal1', 'chicken', 'bld-1'), animal('animal2', 'chicken', 'bld-1')]
    const half = Math.floor(requireSpecies('chicken').cost / 2)

    const plan = demolishPlan(state, 'bld-1')
    expect(plan.ok).toBe(true)
    expect(plan.gold).toBe(half * 2)
    expect(plan.sold.map((sale) => sale.gold)).toEqual([half, half])
    expect(plan.message).toContain(`${half * 2}G`)

    const purse = state.gold
    const result = demolishBuilding(state, 'bld-1')
    expect(result.ok).toBe(true)
    expect(result.state.buildings).toEqual([])
    expect(result.state.animals).toEqual([])
    expect(result.state.gold).toBe(purse + half * 2)
  })

  it('refuses outright when an animal would be left homeless', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'stable', 4, 4)]
    state.animals = [animal('animal1', 'horse', 'bld-1')]
    expect(animalSaleValue('horse')).toBe(0)

    const plan = demolishPlan(state, 'bld-1')
    expect(plan.ok).toBe(false)
    expect(plan.message).toContain('NOWHERE FOR')
    expect(plan.message).toContain('ANIMAL1')

    const result = demolishBuilding(state, 'bld-1')
    expect(result.ok).toBe(false)
    expect(result.state.buildings.length).toBe(1)
    expect(result.state.animals.length).toBe(1)
  })

  it('rehouses that animal when somewhere else will take it', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'stable', 3, 4), building('bld-2', 'stable', 3, 7)]
    state.animals = [animal('animal1', 'horse', 'bld-1')]

    const plan = demolishPlan(state, 'bld-1')
    expect(plan.ok).toBe(true)
    expect(plan.moved).toEqual([
      { animalId: 'animal1', animal: 'ANIMAL1', toBuildingId: 'bld-2', toBuilding: 'STABLE' },
    ])

    const result = demolishBuilding(state, 'bld-1')
    expect(result.ok).toBe(true)
    expect(result.state.animals[0].buildingId).toBe('bld-2')
    expect(result.state.buildings.map((b) => b.id)).toEqual(['bld-2'])
  })

  it('refuses when the only other home is already full', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'stable', 3, 4), building('bld-2', 'stable', 3, 7)]
    state.animals = [
      animal('animal1', 'horse', 'bld-1'),
      animal('animal2', 'horse', 'bld-2'),
      animal('animal3', 'horse', 'bld-2'),
    ]
    expect(requireBuilding('stable').capacity).toBe(2)
    expect(demolishPlan(state, 'bld-1').ok).toBe(false)
  })

  it('refunds nothing for the structure itself', () => {
    const state = farm()
    state.buildings = [building('bld-1', 'well', 4, 4)]
    const purse = state.gold
    const result = demolishBuilding(state, 'bld-1')
    expect(result.ok).toBe(true)
    expect(result.state.gold).toBe(purse)
  })

  it('refuses a building that is not there', () => {
    const state = farm()
    expect(demolishPlan(state, 'bld-9').ok).toBe(false)
    expect(demolishBuilding(state, 'bld-9').ok).toBe(false)
  })
})
