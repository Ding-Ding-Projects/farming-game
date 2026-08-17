import { describe, expect, it } from 'vitest'
import {
  BARN_STORE_BONUS,
  BUILDINGS,
  SILO_HAY_CAPACITY,
  STALL_SLOTS,
  buildingDef,
  buildingsForLevel,
  isUpgradeTier,
  requireBuilding,
  upgradeChainProblems,
  upgradePath,
} from '../src/game/buildings'
import { SPECIES } from '../src/game/species'
import { requiredLevel } from '../src/game/unlocks'
import type { BuildingKind, MaterialId } from '../src/game/farm-types'

/** docs/CATALOG.md section 7: twenty structures, named. */
const CATALOGUE: readonly BuildingKind[] = [
  'coop',
  'big-coop',
  'deluxe-coop',
  'barn',
  'big-barn',
  'deluxe-barn',
  'silo',
  'barn-store',
  'apiary',
  'pond',
  'stable',
  'stall',
  'well',
  'greenhouse',
  'mine',
  'sawmill-yard',
  'bakery',
  'workshop',
  'big-farmhouse',
  'farmhouse',
]

/** docs/GAMEPLAY.md section 1, the published numbers a lane may not move. */
const PUBLISHED: ReadonlyArray<{ kind: BuildingKind; w: number; h: number; cost: number }> = [
  { kind: 'coop', w: 4, h: 3, cost: 4000 },
  { kind: 'big-coop', w: 4, h: 3, cost: 10000 },
  { kind: 'deluxe-coop', w: 4, h: 3, cost: 20000 },
  { kind: 'barn', w: 5, h: 4, cost: 6000 },
  { kind: 'big-barn', w: 5, h: 4, cost: 12000 },
  { kind: 'deluxe-barn', w: 5, h: 4, cost: 25000 },
  { kind: 'silo', w: 3, h: 3, cost: 1500 },
  { kind: 'well', w: 2, h: 2, cost: 1000 },
]

const MATERIAL_IDS: readonly MaterialId[] = [
  'wood',
  'stone',
  'fibre',
  'plank',
  'bolt',
  'screw',
  'nail',
  'tape',
  'deed',
  'mallet',
  'axe',
  'saw',
]

describe('the building table', () => {
  it('carries all twenty structures the catalogue names', () => {
    expect(BUILDINGS.length).toBe(20)
    for (const kind of CATALOGUE) {
      expect(buildingDef(kind), `the catalogue requires a "${kind}"`).toBeDefined()
    }
  })

  it('gives every building a unique kind and a display name', () => {
    const kinds = BUILDINGS.map((b) => b.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const building of BUILDINGS) {
      expect(building.name.trim().length, building.kind).toBeGreaterThan(0)
    }
  })

  it('holds the published footprints and costs of the contract', () => {
    for (const row of PUBLISHED) {
      const def = requireBuilding(row.kind)
      expect(def.footprint.w, row.kind).toBe(row.w)
      expect(def.footprint.h, row.kind).toBe(row.h)
      expect(def.cost, row.kind).toBe(row.cost)
    }
  })

  it('gives every footprint a positive whole span', () => {
    for (const building of BUILDINGS) {
      expect(Number.isInteger(building.footprint.w), building.kind).toBe(true)
      expect(Number.isInteger(building.footprint.h), building.kind).toBe(true)
      expect(building.footprint.w, building.kind).toBeGreaterThan(0)
      expect(building.footprint.h, building.kind).toBeGreaterThan(0)
    }
  })

  it('gates every building on the same level the ladder publishes', () => {
    for (const building of BUILDINGS) {
      expect(requiredLevel(`building:${building.kind}`), building.kind).toBe(building.level)
    }
  })

  it('asks only for materials that exist, in whole positive counts', () => {
    for (const building of BUILDINGS) {
      for (const id of Object.keys(building.materials) as MaterialId[]) {
        expect(MATERIAL_IDS, `${building.kind} wants "${id}"`).toContain(id)
        const count = building.materials[id] ?? 0
        expect(Number.isInteger(count), `${building.kind}.${id}`).toBe(true)
        expect(count, `${building.kind}.${id}`).toBeGreaterThan(0)
      }
    }
  })

  it('sells everything but the farmhouse the player already lives in', () => {
    const free = BUILDINGS.filter((b) => b.cost <= 0).map((b) => b.kind)
    expect(free).toEqual(['farmhouse'])
  })

  it('gives capacity only to buildings that accept a species, and the other way about', () => {
    for (const building of BUILDINGS) {
      if (building.capacity > 0) expect(building.species.length, building.kind).toBeGreaterThan(0)
      if (building.species.length > 0) expect(building.capacity, building.kind).toBeGreaterThan(0)
      for (const id of building.species) {
        expect(SPECIES.map((s) => s.id), `${building.kind} accepts "${id}"`).toContain(id)
      }
    }
  })

  it('auto-feeds only at the deluxe tier, per the contract', () => {
    const auto = BUILDINGS.filter((b) => b.autoFeeds).map((b) => b.kind).sort()
    expect(auto).toEqual(['deluxe-barn', 'deluxe-coop'])
  })

  it('publishes the storage numbers the rest of the farm depends on', () => {
    expect(SILO_HAY_CAPACITY).toBe(240)
    expect(STALL_SLOTS).toBeGreaterThan(0)
    expect(BARN_STORE_BONUS).toBeGreaterThan(0)
  })

  it('houses every species somewhere, so nothing is unbuyable', () => {
    for (const species of SPECIES) {
      const homes = BUILDINGS.filter((b) => b.species.includes(species.id))
      expect(homes.length, `${species.id} has nowhere to live`).toBeGreaterThan(0)
    }
  })
})

describe('upgrade chains', () => {
  it('keeps every invariant the table encodes', () => {
    expect(upgradeChainProblems()).toEqual([])
  })

  it('walks the coop from tier one to tier three', () => {
    expect(upgradePath('coop').map((b) => b.kind)).toEqual(['coop', 'big-coop', 'deluxe-coop'])
    expect(upgradePath('barn').map((b) => b.kind)).toEqual(['barn', 'big-barn', 'deluxe-barn'])
  })

  it('returns a single entry for a building with nowhere to go', () => {
    expect(upgradePath('well').map((b) => b.kind)).toEqual(['well'])
  })

  it('returns nothing for a kind nobody builds', () => {
    expect(upgradePath('space-elevator')).toEqual([])
  })

  it('names the tiers that are only reached by upgrading', () => {
    expect(isUpgradeTier('big-coop')).toBe(true)
    expect(isUpgradeTier('deluxe-barn')).toBe(true)
    expect(isUpgradeTier('coop')).toBe(false)
    expect(isUpgradeTier('well')).toBe(false)
  })

  it('never shrinks capacity along a chain', () => {
    for (const building of BUILDINGS) {
      const path = upgradePath(building.kind)
      for (let i = 1; i < path.length; i++) {
        expect(path[i].capacity, `${path[i - 1].kind} -> ${path[i].kind}`).toBeGreaterThanOrEqual(
          path[i - 1].capacity,
        )
      }
    }
  })
})

describe('buildingsForLevel', () => {
  it('offers nothing that is not yet reached', () => {
    for (const level of [1, 8, 20, 55, 100]) {
      for (const def of buildingsForLevel(level)) {
        expect(def.level, def.kind).toBeLessThanOrEqual(level)
      }
    }
  })

  it('never offers the farmhouse the player already owns', () => {
    expect(buildingsForLevel(100).map((b) => b.kind)).not.toContain('farmhouse')
  })

  it('offers everything purchasable by level one hundred', () => {
    expect(buildingsForLevel(100).length).toBe(BUILDINGS.length - 1)
  })

  it('sorts by level, then by price, so the shop reads as a ladder', () => {
    const offered = buildingsForLevel(100)
    for (let i = 1; i < offered.length; i++) {
      const before = offered[i - 1]
      const here = offered[i]
      expect(before.level).toBeLessThanOrEqual(here.level)
      if (before.level === here.level) expect(before.cost).toBeLessThanOrEqual(here.cost)
    }
  })

  it('opens with something a first-week farmer can save for', () => {
    const early = buildingsForLevel(10)
    expect(early.length).toBeGreaterThan(0)
    expect(Math.min(...early.map((b) => b.cost))).toBeLessThanOrEqual(2000)
  })
})

describe('requireBuilding', () => {
  it('throws for a kind nobody builds', () => {
    expect(() => requireBuilding('treehouse')).toThrow(/treehouse/)
  })
})
