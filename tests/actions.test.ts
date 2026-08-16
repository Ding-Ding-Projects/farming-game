import { describe, expect, it } from 'vitest'
import {
  ACTION_MINUTES,
  DAYS_PER_SEASON,
  DAY_END,
  DAY_START,
  DRY_DAYS_TO_WITHER,
  ENERGY_COST,
  START_GOLD,
} from '../src/game/constants'
import { isRipe, requireCrop, totalGrowDays } from '../src/game/crops'
import { addItem, countItem, createState, tileIndex } from '../src/game/state'
import {
  clearDebris,
  fertilize,
  harvest,
  movePlayer,
  placeSprinkler,
  selectSeed,
  setTool,
  sleep,
  sow,
  till,
  useTool,
  water,
} from '../src/game/actions'
import type { GameState, ItemRef, Plant, Quality } from '../src/game/types'

const QUALITIES: Quality[] = ['normal', 'silver', 'gold']

/** A farm scrubbed back to bare grass, so each test states its own terrain. */
function plainFarm(seed = 7): GameState {
  const state = createState(seed)
  for (const tile of state.tiles) {
    tile.ground = 'grass'
    tile.watered = false
    tile.fertilized = false
    tile.sprinkler = false
    tile.plant = null
  }
  state.player = { x: 5, y: 4, facing: 'down' }
  state.tomorrow = 'clear'
  // An empty bag, so every test says out loud what the farmer is carrying.
  state.inventory = []
  state.selectedSeed = null
  return state
}

const AT = tileIndex(5, 5)
const ELSEWHERE = tileIndex(9, 5)

function seedOf(cropId: string): ItemRef {
  return { kind: 'seed', cropId }
}

function plantAt(state: GameState, index: number): Plant {
  const plant = state.tiles[index].plant
  if (plant === null) throw new Error(`expected a plant at tile ${index}`)
  return plant
}

function produceCount(state: GameState, cropId: string): number {
  return QUALITIES.reduce(
    (sum, quality) => sum + countItem(state, { kind: 'produce', cropId, quality }),
    0,
  )
}

/** Puts a sown plant one action away from picking, without waiting out the calendar. */
function forceRipe(state: GameState, index: number): void {
  const plant = plantAt(state, index)
  plant.stage = requireCrop(plant.cropId).stageDays.length
  plant.progress = 0
  plant.dry = 0
}

function sowAt(state: GameState, index: number, cropId: string): GameState {
  const stocked = addItem(state, seedOf(cropId), 1)
  const tilled = till(stocked, index)
  expect(tilled.ok).toBe(true)
  const sown = sow(tilled.state, index, cropId)
  expect(sown.ok).toBe(true)
  return sown.state
}

/** Optionally waters one tile, then sleeps through a clear night. */
function nextDay(state: GameState, waterIndex: number | null): GameState {
  let next = state
  if (waterIndex !== null) {
    const result = water(next, waterIndex)
    expect(result.ok).toBe(true)
    next = result.state
  }
  return sleep({ ...next, tomorrow: 'clear' }).state
}

describe('movePlayer', () => {
  it('steps onto open ground and faces that way', () => {
    const state = plainFarm()
    const moved = movePlayer(state, 1, 0)
    expect(moved.player).toEqual({ x: 6, y: 4, facing: 'right' })
    expect(state.player.x).toBe(5)
  })

  it('turns on the spot when the way is blocked', () => {
    const state = plainFarm()
    state.tiles[tileIndex(5, 5)].ground = 'rock'
    const turned = movePlayer(state, 0, 1)
    expect(turned.player).toEqual({ x: 5, y: 4, facing: 'down' })
  })

  it('refuses to leave the map', () => {
    const state = plainFarm()
    state.player = { x: 0, y: 0, facing: 'left' }
    expect(movePlayer(state, -1, 0)).toBe(state)
    expect(movePlayer(state, 0, 0)).toBe(state)
  })

  it('prefers the horizontal when handed a diagonal', () => {
    const state = plainFarm()
    expect(movePlayer(state, -1, 1).player.facing).toBe('left')
  })

  it('costs neither time nor energy', () => {
    const state = plainFarm()
    const moved = movePlayer(state, 1, 0)
    expect(moved.minutes).toBe(state.minutes)
    expect(moved.energy).toBe(state.energy)
  })
})

describe('setTool and selectSeed', () => {
  it('swaps the held tool', () => {
    const state = plainFarm()
    expect(setTool(state, 'can').tool).toBe('can')
    expect(setTool(state, state.tool)).toBe(state)
  })

  it('only selects a seed that names a real crop', () => {
    const state = plainFarm()
    expect(selectSeed(state, 'tulip').selectedSeed).toBe('tulip')
    expect(selectSeed(state, 'moonfruit')).toBe(state)
    expect(selectSeed(state, null).selectedSeed).toBeNull()
  })
})

describe('till', () => {
  it('turns grass into soil and spends the cost', () => {
    const state = plainFarm()
    const result = till(state, AT)
    expect(result.ok).toBe(true)
    expect(result.sound).toBe('till')
    expect(result.state.tiles[AT].ground).toBe('soil')
    expect(result.state.energy).toBe(state.energy - ENERGY_COST.till)
    expect(result.state.minutes).toBe(state.minutes + ACTION_MINUTES)
    expect(result.fx.some((fx) => fx.kind === 'dirt')).toBe(true)
  })

  it('refuses anything that is not grass', () => {
    for (const ground of ['soil', 'weeds', 'rock', 'log', 'water', 'path'] as const) {
      const state = plainFarm()
      state.tiles[AT].ground = ground
      const result = till(state, AT)
      expect(result.ok).toBe(false)
      expect(result.sound).toBe('deny')
      expect(result.state).toBe(state)
    }
  })

  it('refuses an index off the map', () => {
    const state = plainFarm()
    expect(till(state, -1).ok).toBe(false)
    expect(till(state, state.tiles.length).ok).toBe(false)
  })

  it('refuses when the farmer lacks the energy', () => {
    const state = plainFarm()
    state.energy = ENERGY_COST.till - 1
    const result = till(state, AT)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/TIRED/)
    expect(result.state).toBe(state)
  })
})

describe('sow', () => {
  it('plants a seed from the bag into tilled soil', () => {
    const state = addItem(plainFarm(), seedOf('parsnip'), 2)
    const tilled = till(state, AT).state
    const result = sow(tilled, AT, 'parsnip')
    expect(result.ok).toBe(true)
    expect(plantAt(result.state, AT)).toMatchObject({ cropId: 'parsnip', stage: 0, dead: false })
    expect(countItem(result.state, seedOf('parsnip'))).toBe(
      countItem(tilled, seedOf('parsnip')) - 1,
    )
    expect(result.state.stats.cropsPlanted).toBe(tilled.stats.cropsPlanted + 1)
  })

  it('refuses a seed that is out of season', () => {
    const state = addItem(plainFarm(), seedOf('tomato'), 1)
    const tilled = till(state, AT).state
    const result = sow(tilled, AT, 'tomato')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/SPRING/)
    expect(result.state).toBe(tilled)
    expect(countItem(tilled, seedOf('tomato'))).toBe(1)
  })

  it('refuses untilled ground and refuses to double up', () => {
    const state = addItem(plainFarm(), seedOf('parsnip'), 2)
    expect(sow(state, AT, 'parsnip').ok).toBe(false)
    const sown = sowAt(state, AT, 'parsnip')
    const second = sow(sown, AT, 'parsnip')
    expect(second.ok).toBe(false)
    expect(second.message).toMatch(/ALREADY GROWING/)
  })

  it('refuses when the bag is empty or the crop is unknown', () => {
    const state = plainFarm()
    const tilled = till(state, AT).state
    expect(sow(tilled, AT, 'parsnip').ok).toBe(false)
    expect(sow(tilled, AT, 'moonfruit').ok).toBe(false)
  })

  it('inherits the fertilizer already worked into the soil', () => {
    let state = addItem(plainFarm(), seedOf('parsnip'), 1)
    state = addItem(state, { kind: 'good', goodId: 'fertilizer' }, 1)
    const tilled = till(state, AT).state
    const fed = fertilize(tilled, AT)
    expect(fed.ok).toBe(true)
    const sown = sow(fed.state, AT, 'parsnip')
    expect(plantAt(sown.state, AT).fertilized).toBe(true)
  })
})

describe('water', () => {
  function soilPatch(): GameState {
    const state = plainFarm()
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) state.tiles[tileIndex(5 + dx, 5 + dy)].ground = 'soil'
    }
    return state
  }

  const wetCount = (state: GameState): number => state.tiles.filter((t) => t.watered).length

  it('wets one tile at the base can range', () => {
    const state = soilPatch()
    state.upgrades.canRange = 0
    const result = water(state, AT)
    expect(result.ok).toBe(true)
    expect(wetCount(result.state)).toBe(1)
    expect(result.state.tiles[AT].watered).toBe(true)
  })

  it('wets three across the facing at range one', () => {
    const state = soilPatch()
    state.upgrades.canRange = 1
    state.player.facing = 'down'
    const result = water(state, AT)
    expect(result.ok).toBe(true)
    expect(wetCount(result.state)).toBe(3)
    expect(result.state.tiles[tileIndex(4, 5)].watered).toBe(true)
    expect(result.state.tiles[tileIndex(6, 5)].watered).toBe(true)
    expect(result.state.tiles[tileIndex(5, 4)].watered).toBe(false)
  })

  it('wets a full three by three at range two', () => {
    const state = soilPatch()
    state.upgrades.canRange = 2
    const result = water(state, AT)
    expect(result.ok).toBe(true)
    expect(wetCount(result.state)).toBe(9)
  })

  it('never spills onto ground that is not tilled', () => {
    const state = plainFarm()
    state.tiles[AT].ground = 'soil'
    state.upgrades.canRange = 2
    const result = water(state, AT)
    expect(result.ok).toBe(true)
    expect(wetCount(result.state)).toBe(1)
  })

  it('refuses when there is nothing tilled in reach', () => {
    const state = plainFarm()
    const result = water(state, AT)
    expect(result.ok).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses to water the same soil twice', () => {
    const state = soilPatch()
    state.upgrades.canRange = 0
    const once = water(state, AT).state
    const twice = water(once, AT)
    expect(twice.ok).toBe(false)
    expect(twice.state).toBe(once)
    expect(twice.state.energy).toBe(once.energy)
  })

  it('costs one action however many tiles it covers', () => {
    const state = soilPatch()
    state.upgrades.canRange = 2
    const result = water(state, AT)
    expect(result.state.energy).toBe(state.energy - ENERGY_COST.water)
    expect(result.state.minutes).toBe(state.minutes + ACTION_MINUTES)
  })
})

describe('growth overnight', () => {
  it('ripens a watered crop in exactly its total grow days', () => {
    for (const cropId of ['parsnip', 'tulip', 'cabbage', 'strawberry']) {
      const crop = requireCrop(cropId)
      const days = totalGrowDays(crop)
      let state = sowAt(plainFarm(), AT, cropId)

      for (let day = 1; day < days; day++) {
        state = nextDay(state, AT)
        expect(isRipe(plantAt(state, AT), crop)).toBe(false)
      }
      state = nextDay(state, AT)
      expect(isRipe(plantAt(state, AT), crop)).toBe(true)
      expect(plantAt(state, AT).stage).toBe(crop.stageDays.length)
    }
  })

  it('does not advance a crop that went to bed dry', () => {
    let state = sowAt(plainFarm(), AT, 'parsnip')
    state = nextDay(state, AT)
    const grown = plantAt(state, AT).stage
    state = nextDay(state, null)
    expect(plantAt(state, AT).stage).toBe(grown)
    expect(plantAt(state, AT).dry).toBe(1)
  })

  it('withers a sprout after the dry days run out, and not before', () => {
    let state = sowAt(plainFarm(), AT, 'parsnip')
    state = nextDay(state, AT)
    expect(plantAt(state, AT).stage).toBeGreaterThan(0)

    for (let dry = 1; dry < DRY_DAYS_TO_WITHER; dry++) {
      state = nextDay(state, null)
      expect(plantAt(state, AT).dead).toBe(false)
      expect(plantAt(state, AT).dry).toBe(dry)
    }

    const before = state.stats.withered
    const withered = sleep({ ...state, tomorrow: 'clear' })
    expect(plantAt(withered.state, AT).dead).toBe(true)
    expect(withered.report.withered).toBe(1)
    expect(withered.state.stats.withered).toBe(before + 1)
  })

  it('spares a seed that has not sprouted yet', () => {
    let state = sowAt(plainFarm(), AT, 'parsnip')
    for (let day = 0; day < DRY_DAYS_TO_WITHER + 2; day++) state = nextDay(state, null)
    expect(plantAt(state, AT).dead).toBe(false)
    expect(plantAt(state, AT).stage).toBe(0)
  })

  it('lets watering resume growth after a dry spell', () => {
    let state = sowAt(plainFarm(), AT, 'cabbage')
    state = nextDay(state, AT)
    state = nextDay(state, null)
    expect(plantAt(state, AT).dry).toBe(1)
    state = nextDay(state, AT)
    expect(plantAt(state, AT).dry).toBe(0)
  })

  it('rain waters the whole farm and snow waters none of it', () => {
    const sown = sowAt(plainFarm(), AT, 'parsnip')

    const rained = sleep({ ...sown, tomorrow: 'rain' })
    expect(plantAt(rained.state, AT).stage).toBe(1)
    expect(rained.state.weather).toBe('rain')
    expect(rained.report.watered).toBeGreaterThan(0)

    const snowed = sleep({ ...sown, tomorrow: 'snow' })
    expect(plantAt(snowed.state, AT).stage).toBe(0)
    expect(plantAt(snowed.state, AT).dry).toBe(1)
    expect(snowed.report.watered).toBe(0)
  })

  it('a sprinkler waters its four neighbours and nothing further', () => {
    let state = plainFarm()
    state = addItem(state, { kind: 'good', goodId: 'sprinkler' }, 1)
    state = sowAt(state, tileIndex(5, 6), 'parsnip')
    state = sowAt(state, ELSEWHERE, 'parsnip')
    const placed = placeSprinkler(state, AT)
    expect(placed.ok).toBe(true)
    expect(placed.state.tiles[AT].sprinkler).toBe(true)

    const morning = sleep({ ...placed.state, tomorrow: 'clear' }).state
    expect(plantAt(morning, tileIndex(5, 6)).stage).toBe(1)
    expect(plantAt(morning, ELSEWHERE).stage).toBe(0)
    expect(plantAt(morning, ELSEWHERE).dry).toBe(1)
  })

  it('dries every tile out again by morning', () => {
    const state = till(plainFarm(), AT).state
    const watered = water(state, AT).state
    const morning = sleep({ ...watered, tomorrow: 'clear' }).state
    expect(morning.tiles.some((t) => t.watered)).toBe(false)
  })

  it('feeds a fertilized crop an extra day of progress every other day', () => {
    const summerFarm = (): GameState => {
      const state = plainFarm()
      state.season = 'summer'
      return state
    }
    let plain = sowAt(summerFarm(), AT, 'melon')
    let fed = sowAt(summerFarm(), AT, 'melon')
    plantAt(fed, AT).fertilized = true

    for (let day = 0; day < 4; day++) {
      plain = nextDay(plain, AT)
      fed = nextDay(fed, AT)
    }
    const plainProgress = plantAt(plain, AT)
    const fedProgress = plantAt(fed, AT)
    expect(fedProgress.stage * 100 + fedProgress.progress).toBeGreaterThan(
      plainProgress.stage * 100 + plainProgress.progress,
    )
  })
})

describe('harvest', () => {
  it('refuses a crop that is not ready', () => {
    const state = sowAt(plainFarm(), AT, 'parsnip')
    const result = harvest(state, AT)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/NOT READY/)
    expect(result.state).toBe(state)
  })

  it('refuses bare ground', () => {
    const state = plainFarm()
    expect(harvest(state, AT).ok).toBe(false)
  })

  it('yields between the crop minimum and maximum', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const state = sowAt(plainFarm(seed), AT, 'strawberry')
      forceRipe(state, AT)
      const result = harvest(state, AT)
      expect(result.ok).toBe(true)
      const picked = produceCount(result.state, 'strawberry')
      expect(picked).toBeGreaterThanOrEqual(1)
      expect(picked).toBeLessThanOrEqual(2)
      expect(result.state.stats.harvested).toBe(state.stats.harvested + picked)
      seen.add(picked)
    }
    expect(seen.size).toBe(2)
  })

  it('rolls every quality across enough harvests', () => {
    const qualities = new Set<Quality>()
    for (let seed = 1; seed <= 60; seed++) {
      const state = sowAt(plainFarm(seed), AT, 'parsnip')
      forceRipe(state, AT)
      const picked = harvest(state, AT).state
      for (const quality of QUALITIES) {
        if (countItem(picked, { kind: 'produce', cropId: 'parsnip', quality }) > 0) {
          qualities.add(quality)
        }
      }
    }
    expect([...qualities].sort()).toEqual(['gold', 'normal', 'silver'])
  })

  it('clears the tile for a one-shot crop', () => {
    const state = sowAt(plainFarm(), AT, 'parsnip')
    forceRipe(state, AT)
    const result = harvest(state, AT)
    expect(result.ok).toBe(true)
    expect(result.state.tiles[AT].plant).toBeNull()
    expect(result.state.tiles[AT].ground).toBe('soil')
  })

  it('sends a regrowing crop back down the ladder instead of clearing it', () => {
    const crop = requireCrop('strawberry')
    const state = sowAt(plainFarm(), AT, 'strawberry')
    forceRipe(state, AT)
    const result = harvest(state, AT)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/BEAR AGAIN/)

    const plant = plantAt(result.state, AT)
    expect(plant.regrown).toBe(1)
    expect(plant.dead).toBe(false)
    expect(plant.stage).toBeGreaterThan(0)
    expect(plant.stage).toBeLessThan(crop.stageDays.length)
    expect(isRipe(plant, crop)).toBe(false)

    let regrowing = result.state
    for (let day = 0; day < totalGrowDays(crop); day++) regrowing = nextDay(regrowing, AT)
    expect(isRipe(plantAt(regrowing, AT), crop)).toBe(true)
    const second = harvest(regrowing, AT)
    expect(second.ok).toBe(true)
    expect(plantAt(second.state, AT).regrown).toBe(2)
  })

  it('pulls up a withered plant without paying out', () => {
    const state = sowAt(plainFarm(), AT, 'parsnip')
    plantAt(state, AT).dead = true
    const result = harvest(state, AT)
    expect(result.ok).toBe(true)
    expect(result.state.tiles[AT].plant).toBeNull()
    expect(produceCount(result.state, 'parsnip')).toBe(0)
    expect(result.sound).toBe('wither')
  })
})

describe('clearDebris, sprinklers and fertilizer', () => {
  it('clears each kind of debris at its own price', () => {
    const costs = {
      weeds: ENERGY_COST.clearWeeds,
      rock: ENERGY_COST.clearRock,
      log: ENERGY_COST.clearLog,
    } as const
    for (const ground of ['weeds', 'rock', 'log'] as const) {
      const state = plainFarm()
      state.tiles[AT].ground = ground
      const result = clearDebris(state, AT)
      expect(result.ok).toBe(true)
      expect(result.state.tiles[AT].ground).toBe('grass')
      expect(result.state.energy).toBe(state.energy - costs[ground])
    }
  })

  it('refuses clear ground and refuses when too tired', () => {
    const state = plainFarm()
    expect(clearDebris(state, AT).ok).toBe(false)
    state.tiles[AT].ground = 'log'
    state.energy = ENERGY_COST.clearLog - 1
    expect(clearDebris(state, AT).ok).toBe(false)
  })

  it('spends a sprinkler from the bag and refuses without one', () => {
    const empty = plainFarm()
    expect(placeSprinkler(empty, AT).ok).toBe(false)

    const stocked = addItem(empty, { kind: 'good', goodId: 'sprinkler' }, 1)
    const placed = placeSprinkler(stocked, AT)
    expect(placed.ok).toBe(true)
    expect(countItem(placed.state, { kind: 'good', goodId: 'sprinkler' })).toBe(0)
    expect(placeSprinkler(placed.state, AT).ok).toBe(false)
  })

  it('only feeds bare tilled soil', () => {
    let state = addItem(plainFarm(), { kind: 'good', goodId: 'fertilizer' }, 2)
    expect(fertilize(state, AT).ok).toBe(false)

    state = till(state, AT).state
    const fed = fertilize(state, AT)
    expect(fed.ok).toBe(true)
    expect(fed.state.tiles[AT].fertilized).toBe(true)
    expect(fertilize(fed.state, AT).ok).toBe(false)
  })
})

describe('useTool', () => {
  it('dispatches to the verb for the held tool on the faced tile', () => {
    const state = plainFarm()
    const hoed = useTool(setTool(state, 'hoe'))
    expect(hoed.ok).toBe(true)
    expect(hoed.state.tiles[AT].ground).toBe('soil')

    const canned = useTool(setTool(hoed.state, 'can'))
    expect(canned.ok).toBe(true)
    expect(canned.state.tiles[AT].watered).toBe(true)

    const seeded = selectSeed(setTool(addItem(canned.state, seedOf('parsnip'), 1), 'seeds'), 'parsnip')
    const sown = useTool(seeded)
    expect(sown.ok).toBe(true)
    expect(plantAt(sown.state, AT).cropId).toBe('parsnip')

    forceRipe(sown.state, AT)
    const picked = useTool(setTool(sown.state, 'hand'))
    expect(picked.ok).toBe(true)
    expect(produceCount(picked.state, 'parsnip')).toBeGreaterThan(0)
  })

  it('asks for a seed before sowing with an empty selection', () => {
    const state = selectSeed(setTool(plainFarm(), 'seeds'), null)
    const result = useTool(state)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/PICK A SEED/)
  })

  it('routes the axe at debris and the sprinkler and fertilizer at their tiles', () => {
    const state = plainFarm()
    state.tiles[AT].ground = 'weeds'
    expect(useTool(setTool(state, 'axe')).ok).toBe(true)
    expect(useTool(setTool(state, 'sprinkler')).ok).toBe(false)
    expect(useTool(setTool(state, 'fertilizer')).ok).toBe(false)
  })
})

describe('energy and the clock', () => {
  it('a refused action spends neither', () => {
    const state = plainFarm()
    state.tiles[AT].ground = 'water'
    const result = till(state, AT)
    expect(result.ok).toBe(false)
    expect(result.state.energy).toBe(state.energy)
    expect(result.state.minutes).toBe(state.minutes)
    expect(result.state.passedOut).toBe(false)
  })

  it('passes out when the last of the energy goes', () => {
    const state = plainFarm()
    state.energy = ENERGY_COST.till
    const result = till(state, AT)
    expect(result.ok).toBe(true)
    expect(result.state.energy).toBe(0)
    expect(result.state.passedOut).toBe(true)

    const after = till(result.state, ELSEWHERE)
    expect(after.ok).toBe(false)
    expect(after.message).toMatch(/BED/)
    expect(after.state).toBe(result.state)
  })

  it('passes out at 2:00 AM however much energy is left', () => {
    const state = plainFarm()
    state.minutes = DAY_END - ACTION_MINUTES
    const result = till(state, AT)
    expect(result.ok).toBe(true)
    expect(result.state.minutes).toBe(DAY_END)
    expect(result.state.passedOut).toBe(true)
    expect(result.state.energy).toBeGreaterThan(0)
  })

  it('carries the farmer home for a fee and a short night', () => {
    const state = plainFarm()
    state.energy = ENERGY_COST.till
    const collapsed = till(state, AT).state
    const { state: morning, report } = sleep({ ...collapsed, tomorrow: 'clear' })

    expect(report.passedOut).toBe(true)
    expect(report.medicalFee).toBeGreaterThan(0)
    expect(morning.gold).toBe(START_GOLD - report.medicalFee)
    expect(morning.stats.spent).toBe(collapsed.stats.spent + report.medicalFee)
    expect(morning.passedOut).toBe(false)
    expect(morning.energy).toBeGreaterThan(0)
    expect(morning.energy).toBeLessThan(morning.maxEnergy)
    expect(morning.minutes).toBe(DAY_START)
  })

  it('never docks more gold than the farmer has', () => {
    const state = plainFarm()
    state.gold = 10
    state.energy = ENERGY_COST.till
    const collapsed = till(state, AT).state
    const { state: morning, report } = sleep({ ...collapsed, tomorrow: 'clear' })
    expect(report.medicalFee).toBe(10)
    expect(morning.gold).toBe(0)
  })
})

describe('sleep', () => {
  it('wakes at 6:00 on the next day with full energy', () => {
    const state = plainFarm()
    const worked = till(state, AT).state
    const { state: morning, report } = sleep({ ...worked, tomorrow: 'rain' })

    expect(morning.minutes).toBe(DAY_START)
    expect(morning.day).toBe(state.day + 1)
    expect(morning.energy).toBe(morning.maxEnergy)
    expect(morning.gold).toBe(state.gold)
    expect(morning.stats.daysPlayed).toBe(state.stats.daysPlayed + 1)
    expect(report.passedOut).toBe(false)
    expect(report.medicalFee).toBe(0)
    expect(morning.weather).toBe('rain')
  })

  it('makes the forecast the player went to bed on come true', () => {
    for (const weather of ['clear', 'rain', 'storm', 'snow'] as const) {
      const { state: morning, report } = sleep({ ...plainFarm(), tomorrow: weather })
      expect(morning.weather).toBe(weather)
      expect(report.weather).toBe(weather)
      expect(['clear', 'rain', 'storm', 'snow']).toContain(morning.tomorrow)
    }
  })

  it('is deterministic for the same night', () => {
    const state = plainFarm(31)
    expect(JSON.stringify(sleep(state))).toBe(JSON.stringify(sleep(state)))
  })

  it('rolls the calendar over into the next season', () => {
    const state = plainFarm()
    state.day = DAYS_PER_SEASON
    const { state: morning, report } = sleep(state)
    expect(report.seasonChanged).toBe(true)
    expect(morning.season).toBe('summer')
    expect(morning.day).toBe(1)
    expect(morning.year).toBe(1)
  })

  it('turns the year over after winter', () => {
    const state = plainFarm()
    state.season = 'winter'
    state.day = DAYS_PER_SEASON
    const { state: morning } = sleep(state)
    expect(morning.season).toBe('spring')
    expect(morning.year).toBe(2)
  })

  it('clears crops that cannot live in the new season', () => {
    const state = sowAt(plainFarm(), AT, 'parsnip')
    state.day = DAYS_PER_SEASON
    const { state: morning, report } = sleep(state)
    expect(morning.season).toBe('summer')
    expect(report.outOfSeason).toBe(1)
    expect(morning.tiles[AT].plant).toBeNull()
    expect(morning.tiles[AT].ground).toBe('soil')
  })

  it('spares a crop that grows in both seasons', () => {
    const state = plainFarm()
    state.season = 'summer'
    const sown = sowAt(state, AT, 'corn')
    sown.day = DAYS_PER_SEASON
    const { state: morning, report } = sleep(sown)
    expect(morning.season).toBe('fall')
    expect(report.outOfSeason).toBe(0)
    expect(plantAt(morning, AT).cropId).toBe('corn')
  })

  it('counts what happened in the report', () => {
    let state = plainFarm()
    state = sowAt(state, AT, 'parsnip')
    state = sowAt(state, tileIndex(6, 5), 'parsnip')
    state = water(state, AT).state
    state = water(state, tileIndex(6, 5)).state
    const { report } = sleep({ ...state, tomorrow: 'clear' })
    expect(report.watered).toBe(2)
    expect(report.grew).toBe(2)
    expect(report.ripened).toBe(0)
    expect(report.withered).toBe(0)
    expect(report.outOfSeason).toBe(0)
    expect(report.seasonChanged).toBe(false)
  })

  it('reports the crops that came ripe overnight', () => {
    let state = sowAt(plainFarm(), AT, 'parsnip')
    const days = totalGrowDays(requireCrop('parsnip'))
    for (let day = 1; day < days; day++) state = nextDay(state, AT)
    const { report } = sleep({ ...water(state, AT).state, tomorrow: 'clear' })
    expect(report.ripened).toBe(1)
  })
})
