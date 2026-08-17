/**
 * Hay is the one resource with a single source, so the route to it is worth its own file.
 *
 * `cutGrass` had a complete set of rules and refusals and nothing in the game could reach
 * it: no tool routed to it, so a silo could never fill, and an animal could not be fed
 * through a winter in which nothing grazes. These tests hold that route open.
 */
import { describe, expect, it } from 'vitest'
import { createMarket } from '../src/game/economy'
import { setTool, useTool } from '../src/game/actions'
import { SILO_HAY_CAPACITY } from '../src/game/buildings'
import { cutGrass, hayCapacity } from '../src/game/livestock'
import { createProgression } from '../src/game/progression'
import { createState, tileIndex } from '../src/game/state'
import type { Building } from '../src/game/farm-types'
import type { GameState, Season } from '../src/game/types'

/** The farmer at 4,4 facing the tile at 4,3, on a farm with a silo and nothing else. */
function meadow(season: Season = 'fall', withSilo = true): GameState {
  const base = createState(77)
  const buildings: Building[] = withSilo ? [{ id: 'silo-1', kind: 'silo', x: 16, y: 8 }] : []
  const state: GameState = {
    ...base,
    buildings,
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
    tile.plant = null
    tile.sprinkler = false
    tile.buildingId = null
    tile.machineId = null
  }
  for (const b of buildings) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) state.tiles[tileIndex(b.x + dx, b.y + dy)].buildingId = b.id
    }
  }
  state.season = season
  state.weather = 'clear'
  state.energy = state.maxEnergy
  state.player = { x: 4, y: 4, facing: 'up' }
  state.progression.level = 40
  return state
}

const FACED = tileIndex(4, 3)

describe('the axe reaches the hay', () => {
  it('cuts standing grass into the silo', () => {
    const state = setTool(meadow(), 'axe')
    const result = useTool(state)
    expect(result.ok, result.message).toBe(true)
    expect(result.state.hay).toBeGreaterThan(0)
    expect(result.message).toContain('HAY')
  })

  it('still clears debris, so the axe did not stop being the axe', () => {
    const state = setTool(meadow(), 'axe')
    state.tiles[FACED].ground = 'log'
    const result = useTool(state)
    expect(result.ok, result.message).toBe(true)
    expect(result.state.tiles[FACED].ground).toBe('grass')
    expect(result.state.hay).toBe(0)
  })

  it('clears weeds rather than baling them', () => {
    const state = setTool(meadow(), 'axe')
    state.tiles[FACED].ground = 'weeds'
    const result = useTool(state)
    expect(result.ok, result.message).toBe(true)
    expect(result.state.hay).toBe(0)
  })

  it('leaves the sward standing, because grass is pasture as well as fodder', () => {
    const result = useTool(setTool(meadow(), 'axe'))
    expect(result.state.tiles[FACED].ground).toBe('grass')
  })

  it('spends energy, so a day of hay is bounded', () => {
    const state = setTool(meadow(), 'axe')
    const result = useTool(state)
    expect(result.state.energy).toBeLessThan(state.energy)
  })

  it('refuses under snow, and says why', () => {
    const result = useTool(setTool(meadow('winter'), 'axe'))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('SNOW')
    expect(result.state.hay).toBe(0)
  })

  it('refuses with nowhere to put it, and names the silo', () => {
    const result = useTool(setTool(meadow('fall', false), 'axe'))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('SILO')
  })

  it('never overfills the silo, whatever the roll', () => {
    let state = meadow()
    state.hay = hayCapacity(state) - 1
    state = setTool(state, 'axe')
    const result = useTool(state)
    expect(result.state.hay).toBeLessThanOrEqual(hayCapacity(result.state))
    expect(result.state.hay).toBeLessThanOrEqual(SILO_HAY_CAPACITY)
  })

  it('is the same verb whether reached by the tool or called directly', () => {
    const viaTool = useTool(setTool(meadow(), 'axe'))
    const direct = cutGrass(meadow(), FACED)
    expect(viaTool.state.hay).toBe(direct.state.hay)
    expect(viaTool.message).toBe(direct.message)
  })

  it('is deterministic: the same farm on the same day cuts the same hay', () => {
    const a = useTool(setTool(meadow(), 'axe'))
    const b = useTool(setTool(meadow(), 'axe'))
    expect(a.state.hay).toBe(b.state.hay)
  })

  it('will not scythe a crop', () => {
    const state = setTool(meadow(), 'axe')
    state.tiles[FACED].ground = 'soil'
    const result = useTool(state)
    expect(result.ok).toBe(false)
    expect(result.state.hay).toBe(0)
  })

  it('fills a silo over a run of cuts, which is what winter needs', () => {
    let state = setTool(meadow(), 'axe')
    state.maxEnergy = 9999
    state.energy = 9999
    let cuts = 0
    while (state.hay < 40 && cuts < 60) {
      const result = useTool(state)
      if (!result.ok) break
      state = result.state
      // Walk on, so each cut is a different tile and a different roll.
      state.player = { x: 4 + (cuts % 8), y: 4, facing: 'up' }
      cuts += 1
    }
    expect(state.hay).toBeGreaterThanOrEqual(40)
  })
})
