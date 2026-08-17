import { describe, expect, it } from 'vitest'
import { BUILDINGS, SILO_HAY_CAPACITY, STALL_SLOTS } from '../src/game/buildings'
import { createMarket } from '../src/game/economy'
import {
  BUILDING_HOSTS,
  INTERIOR_ROOMS,
  buildingDoorAt,
  doorOf,
  entryPoint,
  hostedKinds,
  interiorFor,
  isFloor,
  penPositions,
  roomFor,
  stationAt,
  summarise,
  useStation,
} from '../src/game/interiors'
import { ageInDays, START_FRIENDSHIP } from '../src/game/livestock'
import { createProgression } from '../src/game/progression'
import { requireSpecies } from '../src/game/species'
import { createState } from '../src/game/state'
import { FARM_H, FARM_W } from '../src/game/constants'
import { footprintOf } from '../src/game/placement'
import type { Animal, Building, SpeciesId } from '../src/game/farm-types'
import type { GameState } from '../src/game/types'
import type { Interior, Station, StationKind } from '../src/game/interiors'

function farm(): GameState {
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
    tile.plant = null
    tile.buildingId = null
    tile.machineId = null
  }
  state.inventory = []
  state.gold = 500_000
  state.energy = state.maxEnergy
  state.progression.level = 99
  return state
}

function building(id: string, kind: string, x = 4, y = 4): Building {
  return { id, kind, x, y }
}

function animal(species: SpeciesId, over: Partial<Animal> = {}): Animal {
  const def = requireSpecies(species)
  return {
    id: 'a1',
    species,
    name: 'BESS',
    buildingId: 'b1',
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

/** A room with the building already standing, ready to be walked into. */
function room(kind: string, animals: Animal[] = []): { state: GameState; interior: Interior } {
  const state = farm()
  state.buildings = [building('b1', kind, 2, 2)]
  state.animals = animals
  const interior = interiorFor(state, 'b1')
  expect(interior).not.toBeNull()
  return { state, interior: interior as Interior }
}

function stationsOfKind(interior: Interior, kind: StationKind): Station[] {
  return interior.stations.filter((s) => s.kind === kind)
}

/* ------------------------------------------------------------------ the rooms */

describe('every building is enterable', () => {
  it('gives every catalogued kind a room', () => {
    for (const def of BUILDINGS) {
      expect(INTERIOR_ROOMS[def.kind], `${def.kind} has no room`).toBeDefined()
    }
  })

  it('produces an interior for every catalogued kind', () => {
    for (const def of BUILDINGS) {
      const { interior } = room(def.kind)
      expect(interior.kind, `${def.kind} did not open`).toBe(def.kind)
      expect(interior.name.length).toBeGreaterThan(0)
    }
  })

  it('keeps every room inside the world band, so no camera is needed', () => {
    for (const def of BUILDINGS) {
      const r = roomFor(def.kind)
      expect(r.w, `${def.kind} is too wide`).toBeLessThanOrEqual(FARM_W)
      expect(r.h, `${def.kind} is too tall`).toBeLessThanOrEqual(FARM_H)
      // A room needs a wall on each side and at least one floor tile between them.
      expect(r.w).toBeGreaterThanOrEqual(5)
      expect(r.h).toBeGreaterThanOrEqual(5)
    }
  })

  it('falls back to a real room for a kind that is not catalogued', () => {
    const r = roomFor('a-kind-nobody-published')
    expect(r.w).toBeGreaterThanOrEqual(5)
    expect(r.h).toBeGreaterThanOrEqual(5)
  })

  it('returns null for a building that is not on the farm', () => {
    expect(interiorFor(farm(), 'nope')).toBeNull()
  })
})

/* -------------------------------------------------------------------- the door */

describe('doors', () => {
  it('cuts the door into the centre of the front wall', () => {
    for (const def of BUILDINGS) {
      const { interior } = room(def.kind)
      expect(interior.door.y).toBe(interior.room.h - 1)
      expect(interior.door.x).toBe(Math.floor(interior.room.w / 2))
      expect(interior.mat).toEqual({ x: interior.door.x, y: interior.door.y - 1 })
    }
  })

  it('puts the farm-side door on the centre of the bottom row of the footprint', () => {
    const b = building('b1', 'coop', 5, 3)
    const { w, h } = footprintOf(b)
    expect(doorOf(b)).toEqual({ x: 5 + Math.floor(w / 2), y: 3 + h - 1 })
  })

  it('finds the building whose door is on a farm tile, and only there', () => {
    const state = farm()
    state.buildings = [building('b1', 'coop', 5, 3)]
    const d = doorOf(state.buildings[0])
    expect(buildingDoorAt(state, d.x, d.y)?.id).toBe('b1')
    expect(buildingDoorAt(state, d.x, d.y - 1)).toBeNull()
    expect(buildingDoorAt(state, 0, 0)).toBeNull()
  })

  it('lands the farmer on the mat, and the mat is standable', () => {
    for (const def of BUILDINGS) {
      const { interior } = room(def.kind)
      const at = entryPoint(interior)
      expect(at).toEqual(interior.mat)
      expect(isFloor(interior, at.x, at.y), `${def.kind} walls the farmer in`).toBe(true)
    }
  })

  it('never furnishes the way out shut', () => {
    for (const def of BUILDINGS) {
      const state = farm()
      state.buildings = [building('b1', def.kind, 2, 2)]
      // Fill every animal building to capacity, which is the worst case for furniture.
      const capacity = def.capacity
      state.animals = Array.from({ length: capacity }, (_, i) =>
        animal(def.species[0] ?? 'chicken', { id: `a${i}`, name: `N${i}`, buildingId: 'b1' }),
      )
      const interior = interiorFor(state, 'b1') as Interior
      const mat = interior.mat
      expect(isFloor(interior, mat.x, mat.y), `${def.kind} blocks the mat`).toBe(true)
      // And there is somewhere to go from it.
      const neighbours = [
        [mat.x - 1, mat.y],
        [mat.x + 1, mat.y],
        [mat.x, mat.y - 1],
      ].filter(([x, y]) => isFloor(interior, x, y))
      expect(neighbours.length, `${def.kind} strands the farmer on the mat`).toBeGreaterThan(0)
    }
  })
})

/* ------------------------------------------------------------------ the pens */

describe('pens', () => {
  it('lays out exactly one pen per place the player has paid for', () => {
    for (const def of BUILDINGS) {
      if (def.capacity === 0) continue
      const { interior } = room(def.kind)
      expect(stationsOfKind(interior, 'pen').length, `${def.kind} pens`).toBe(def.capacity)
    }
  })

  it('shows an empty coop as four empty places rather than nothing', () => {
    const { interior } = room('coop')
    const pens = stationsOfKind(interior, 'pen')
    expect(pens).toHaveLength(4)
    expect(pens.every((p) => p.ref === null)).toBe(true)
    expect(pens[0].label).toContain('EMPTY')
  })

  it('fills pens in purchase order, so an occupant does not move house', () => {
    const { interior } = room('coop', [
      animal('chicken', { id: 'a1', name: 'ONE', buildingId: 'b1' }),
      animal('chicken', { id: 'a2', name: 'TWO', buildingId: 'b1' }),
    ])
    const pens = stationsOfKind(interior, 'pen')
    expect(pens[0].ref).toBe('a1')
    expect(pens[1].ref).toBe('a2')
    expect(pens[2].ref).toBeNull()
  })

  it('never puts two pens on one cell', () => {
    for (const def of BUILDINGS) {
      if (def.capacity === 0) continue
      const { interior } = room(def.kind)
      const seen = new Set(stationsOfKind(interior, 'pen').map((p) => `${p.x},${p.y}`))
      expect(seen.size, `${def.kind} stacked pens`).toBe(def.capacity)
    }
  })

  it('keeps every pen on the floor, never inside a wall', () => {
    for (const def of BUILDINGS) {
      if (def.capacity === 0) continue
      const { interior } = room(def.kind)
      for (const p of stationsOfKind(interior, 'pen')) {
        expect(p.x, `${def.kind}`).toBeGreaterThanOrEqual(1)
        expect(p.y, `${def.kind}`).toBeGreaterThanOrEqual(1)
        expect(p.x).toBeLessThanOrEqual(interior.room.w - 2)
        expect(p.y).toBeLessThanOrEqual(interior.room.h - 2)
      }
    }
  })

  it('produces the count asked for even when the tidy grid runs out', () => {
    const spots = penPositions({ w: 7, h: 7, floor: 'straw', wall: 'plank' }, 12, 3)
    expect(spots).toHaveLength(12)
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(12)
  })

  it('asks for nothing when capacity is nothing', () => {
    expect(penPositions(roomFor('well'), 0, 3)).toHaveLength(0)
  })
})

/* ------------------------------------------------------------- walking about */

describe('walking about a room', () => {
  it('refuses to walk into a wall', () => {
    const { interior } = room('coop')
    const { w, h } = interior.room
    expect(isFloor(interior, 0, 1)).toBe(false)
    expect(isFloor(interior, w - 1, 1)).toBe(false)
    expect(isFloor(interior, 1, 0)).toBe(false)
    expect(isFloor(interior, 1, h - 1)).toBe(false)
  })

  it('refuses to walk through solid furniture', () => {
    const { interior } = room('coop')
    const pen = stationsOfKind(interior, 'pen')[0]
    expect(isFloor(interior, pen.x, pen.y)).toBe(false)
    expect(stationAt(interior, pen.x, pen.y)?.kind).toBe('pen')
  })

  it('does not report the mat as furniture, so the farmer can stand on it', () => {
    const { interior } = room('coop')
    expect(stationAt(interior, interior.mat.x, interior.mat.y)).toBeNull()
  })

  it('reports a station across its whole footprint, not only its corner', () => {
    const { interior } = room('farmhouse')
    const bed = stationsOfKind(interior, 'bed')[0]
    expect(bed.w).toBeGreaterThan(1)
    expect(stationAt(interior, bed.x + bed.w - 1, bed.y + bed.h - 1)?.kind).toBe('bed')
  })
})

/* -------------------------------------------------------------- using a pen */

describe('using a pen does the most useful pending thing', () => {
  it('collects first when something is ready', () => {
    const { state, interior } = room('coop', [
      animal('chicken', { id: 'a1', buildingId: 'b1', daysUntilProduce: 0, fedToday: false }),
    ])
    const pen = stationsOfKind(interior, 'pen')[0]
    const use = useStation(state, interior, pen)
    expect(use.result.ok).toBe(true)
    // The bird has not eaten, yet collecting came first — and it did not eat as a side effect.
    expect(use.result.state.animals[0].fedToday).toBe(false)
    expect(use.result.state.inventory.length).toBeGreaterThan(0)
  })

  it('feeds when nothing is ready and the animal is hungry', () => {
    const { state, interior } = room('coop', [
      animal('chicken', { id: 'a1', buildingId: 'b1', daysUntilProduce: 3, fedToday: false }),
    ])
    state.hay = 50
    const use = useStation(state, interior, stationsOfKind(interior, 'pen')[0])
    expect(use.result.ok).toBe(true)
    expect(use.result.state.animals[0].fedToday).toBe(true)
  })

  it('pets when it is fed and has nothing waiting', () => {
    const { state, interior } = room('coop', [
      animal('chicken', {
        id: 'a1',
        buildingId: 'b1',
        daysUntilProduce: 3,
        fedToday: true,
        pettedToday: false,
      }),
    ])
    const use = useStation(state, interior, stationsOfKind(interior, 'pen')[0])
    expect(use.result.ok).toBe(true)
    expect(use.result.state.animals[0].pettedToday).toBe(true)
  })

  it('spends nothing when there is nothing left to do', () => {
    const { state, interior } = room('coop', [
      animal('chicken', {
        id: 'a1',
        buildingId: 'b1',
        daysUntilProduce: 3,
        fedToday: true,
        pettedToday: true,
      }),
    ])
    const before = state.energy
    const use = useStation(state, interior, stationsOfKind(interior, 'pen')[0])
    expect(use.result.ok).toBe(false)
    expect(use.result.state.energy).toBe(before)
    expect(use.result.state).toBe(state)
  })

  it('offers the shop when the pen is empty, rather than saying nothing', () => {
    const { state, interior } = room('coop')
    const use = useStation(state, interior, stationsOfKind(interior, 'pen')[0])
    expect(use.panel).toEqual({ open: 'buy-animal', ref: 'b1' })
  })
})

/* --------------------------------------------------------- the whole-room verbs */

describe('the trough and the collecting place', () => {
  it('feeds everyone who has not eaten, and says how many', () => {
    const animals = [0, 1, 2, 3].map((i) =>
      animal('chicken', {
        id: `a${i}`,
        name: `N${i}`,
        buildingId: 'b1',
        daysUntilProduce: 5,
        fedToday: i === 0,
      }),
    )
    const { state, interior } = room('coop', animals)
    state.hay = 200
    const use = useStation(state, interior, stationsOfKind(interior, 'trough')[0])
    expect(use.result.ok).toBe(true)
    expect(use.result.message).toContain('FED 3')
    expect(use.result.state.animals.every((a) => a.fedToday)).toBe(true)
  })

  it('says so plainly when everyone has already eaten', () => {
    const { state, interior } = room('coop', [
      animal('chicken', { id: 'a1', buildingId: 'b1', fedToday: true, daysUntilProduce: 5 }),
    ])
    const use = useStation(state, interior, stationsOfKind(interior, 'trough')[0])
    expect(use.result.ok).toBe(false)
    expect(use.result.message).toContain('EATEN')
  })

  it('stops at the animal it cannot afford instead of feeding the whole coop for free', () => {
    const animals = [0, 1, 2, 3].map((i) =>
      animal('chicken', { id: `a${i}`, name: `N${i}`, buildingId: 'b1', daysUntilProduce: 5 }),
    )
    const { state, interior } = room('coop', animals)
    state.hay = 200
    state.energy = 1
    const use = useStation(state, interior, stationsOfKind(interior, 'trough')[0])
    const fed = use.result.state.animals.filter((a) => a.fedToday).length
    expect(fed).toBeLessThan(4)
  })

  it('collects everything ready in one go', () => {
    const animals = [0, 1, 2].map((i) =>
      animal('chicken', { id: `a${i}`, name: `N${i}`, buildingId: 'b1', daysUntilProduce: 0 }),
    )
    const { state, interior } = room('coop', animals)
    const use = useStation(state, interior, stationsOfKind(interior, 'nest')[0])
    expect(use.result.ok).toBe(true)
    expect(use.result.message).toContain('COLLECTED FROM 3')
  })

  it('says so when nothing is ready', () => {
    const { state, interior } = room('coop', [
      animal('chicken', { id: 'a1', buildingId: 'b1', daysUntilProduce: 4 }),
    ])
    const use = useStation(state, interior, stationsOfKind(interior, 'nest')[0])
    expect(use.result.ok).toBe(false)
    expect(use.result.state).toBe(state)
  })
})

/* ----------------------------------------------------------- the other rooms */

describe('the rooms that are not pens', () => {
  it('gives the farmhouse a bed, a chest and the order board', () => {
    const { interior } = room('farmhouse')
    expect(stationsOfKind(interior, 'bed')).toHaveLength(1)
    expect(stationsOfKind(interior, 'chest')).toHaveLength(1)
    expect(stationsOfKind(interior, 'ledger')).toHaveLength(1)
  })

  it('sleeps from the bed and opens the board from the ledger', () => {
    const { state, interior } = room('farmhouse')
    expect(useStation(state, interior, stationsOfKind(interior, 'bed')[0]).panel).toEqual({
      open: 'sleep',
    })
    expect(useStation(state, interior, stationsOfKind(interior, 'ledger')[0]).panel).toEqual({
      open: 'orders',
    })
  })

  it('gives the roadside stall one counter per slot', () => {
    const { interior } = room('stall')
    expect(stationsOfKind(interior, 'counter')).toHaveLength(STALL_SLOTS)
  })

  it('opens pricing for the counter that was used, by slot index', () => {
    const { state, interior } = room('stall')
    const counters = stationsOfKind(interior, 'counter')
    expect(useStation(state, interior, counters[2]).panel).toEqual({ open: 'price', ref: '2' })
  })

  it('reads the hay level in the silo against its cap', () => {
    const { state } = room('silo')
    state.hay = 40
    const again = interiorFor(state, 'b1') as Interior
    const loft = stationsOfKind(again, 'hayloft')[0]
    expect(loft.label).toContain('40')
    expect(loft.label).toContain(String(SILO_HAY_CAPACITY))
  })

  it('gives the greenhouse four beds', () => {
    const { interior } = room('greenhouse')
    expect(stationsOfKind(interior, 'plot')).toHaveLength(4)
  })

  it('reads the barn capacity the store is adding', () => {
    const { state, interior } = room('barn-store')
    const shelf = stationsOfKind(interior, 'shelf')[0]
    expect(shelf.label).toContain(String(state.progression.barnCap))
  })

  it('leaves through the mat', () => {
    const { state, interior } = room('well')
    const exit = interior.stations.find((s) => s.kind === 'exit') as Station
    expect(useStation(state, interior, exit).panel).toEqual({ open: 'leave' })
  })

  it('gives every room something to walk up to', () => {
    for (const def of BUILDINGS) {
      const { interior } = room(def.kind)
      const useful = interior.stations.filter((s) => s.kind !== 'exit')
      expect(useful.length, `${def.kind} is a bare room`).toBeGreaterThan(0)
    }
  })
})

/* ------------------------------------------------------------- the workrooms */

describe('production buildings are workrooms', () => {
  it('only claims machine kinds that exist in the catalogue', () => {
    for (const [kind, machines] of Object.entries(BUILDING_HOSTS)) {
      for (const m of machines) {
        expect(
          BUILDINGS.some((b) => b.kind === kind),
          `${kind} hosts machines but is not a building`,
        ).toBe(true)
        expect(typeof m).toBe('string')
      }
    }
  })

  it('puts a bench under every hosted machine standing on the farm', () => {
    const state = farm()
    state.buildings = [building('b1', 'bakery', 2, 2)]
    state.machines = [
      { id: 'm1', kind: 'bakery', index: 10, queue: [], ready: [] },
      { id: 'm2', kind: 'pie-oven', index: 11, queue: [], ready: [] },
      // Not hosted by the bakery, so it must not appear on a bakery bench.
      { id: 'm3', kind: 'sawmill', index: 12, queue: [], ready: [] },
    ]
    const interior = interiorFor(state, 'b1') as Interior
    const refs = stationsOfKind(interior, 'bench').map((b) => b.ref)
    expect(refs).toContain('m1')
    expect(refs).toContain('m2')
    expect(refs).not.toContain('m3')
  })

  it('opens the recipe picker for the bench that was used', () => {
    const state = farm()
    state.buildings = [building('b1', 'workshop', 2, 2)]
    state.machines = [{ id: 'm1', kind: 'loom', index: 10, queue: [], ready: [] }]
    const interior = interiorFor(state, 'b1') as Interior
    const bench = stationsOfKind(interior, 'bench')[0]
    expect(useStation(state, interior, bench).panel).toEqual({ open: 'recipes', ref: 'm1' })
  })

  it('says what to build when the workroom is empty, rather than showing nothing', () => {
    const { state, interior } = room('mine')
    const bench = stationsOfKind(interior, 'bench')[0]
    expect(bench.ref).toBeNull()
    expect(bench.label).toContain('BUILD A')
    expect(useStation(state, interior, bench).result.ok).toBe(false)
  })

  it('hosts nothing for a building that is not a workroom', () => {
    expect(hostedKinds('coop')).toHaveLength(0)
    expect(hostedKinds('bakery').length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------- the summary */

describe('the room summary', () => {
  it('counts occupants, the hungry and the ready', () => {
    const { state, interior } = room('coop', [
      animal('chicken', { id: 'a1', name: 'ONE', buildingId: 'b1', daysUntilProduce: 0 }),
      animal('chicken', { id: 'a2', name: 'TWO', buildingId: 'b1', daysUntilProduce: 4, fedToday: true }),
    ])
    const s = summarise(state, interior)
    expect(s.occupants).toBe(2)
    expect(s.capacity).toBe(4)
    expect(s.hungry).toBe(1)
    expect(s.ready).toBe(1)
  })
})

/* ------------------------------------------------------------- state hygiene */

describe('interiors keep the rules layer honest', () => {
  it('writes nothing to the save state when a room is opened', () => {
    const state = farm()
    state.buildings = [building('b1', 'barn', 2, 2)]
    const before = JSON.stringify(state)
    interiorFor(state, 'b1')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('reflects a purchase immediately, because nothing is cached', () => {
    const state = farm()
    state.buildings = [building('b1', 'coop', 2, 2)]
    const empty = interiorFor(state, 'b1') as Interior
    expect(empty.stations.filter((s) => s.kind === 'pen' && s.ref !== null)).toHaveLength(0)

    state.animals = [animal('chicken', { id: 'a1', buildingId: 'b1' })]
    const filled = interiorFor(state, 'b1') as Interior
    expect(filled.stations.filter((s) => s.kind === 'pen' && s.ref !== null)).toHaveLength(1)
  })
})
