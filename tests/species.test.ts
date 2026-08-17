import { describe, expect, it } from 'vitest'
import { BUILDINGS, buildingDef } from '../src/game/buildings'
import {
  SPECIES,
  firstProduceDays,
  producesNothing,
  requireSpecies,
  speciesById,
  speciesDataProblems,
  speciesForBuilding,
} from '../src/game/species'
import { productById } from '../src/game/products'
import { requiredLevel } from '../src/game/unlocks'
import type { SpeciesId } from '../src/game/farm-types'

/** docs/CATALOG.md section 3. Twelve animals, and every one of them ships. */
const CATALOGUE: ReadonlyArray<{ id: SpeciesId; housing: string; produces: readonly string[] }> = [
  { id: 'chicken', housing: 'coop', produces: ['egg'] },
  { id: 'duck', housing: 'big-coop', produces: ['duck-egg', 'feather'] },
  { id: 'goose', housing: 'deluxe-coop', produces: ['goose-egg', 'down'] },
  { id: 'turkey', housing: 'big-coop', produces: ['turkey-egg'] },
  { id: 'rabbit', housing: 'deluxe-coop', produces: ['angora-wool'] },
  { id: 'cow', housing: 'barn', produces: ['milk'] },
  { id: 'goat', housing: 'big-barn', produces: ['goat-milk'] },
  { id: 'sheep', housing: 'big-barn', produces: ['wool'] },
  { id: 'pig', housing: 'deluxe-barn', produces: ['truffle', 'bacon'] },
  { id: 'bee', housing: 'apiary', produces: ['honeycomb'] },
  { id: 'fish', housing: 'pond', produces: ['fish', 'roe'] },
  { id: 'horse', housing: 'stable', produces: [] },
]

describe('the livestock table', () => {
  it('carries all twelve animals the catalogue names', () => {
    expect(SPECIES.length).toBe(12)
    for (const row of CATALOGUE) {
      expect(speciesById(row.id), `the catalogue requires a "${row.id}"`).toBeDefined()
    }
  })

  it('gives every species a unique id and a display name', () => {
    const ids = SPECIES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const species of SPECIES) {
      expect(species.name.trim().length, species.id).toBeGreaterThan(0)
    }
  })

  it('houses each animal where the catalogue says it lives', () => {
    for (const row of CATALOGUE) {
      const species = requireSpecies(row.id)
      expect(species.housedIn, row.id).toContain(row.housing)
      for (const kind of species.housedIn) {
        expect(buildingDef(kind), `${row.id} lives in "${kind}"`).toBeDefined()
      }
    }
  })

  it('produces exactly what the catalogue lists, and every product is priced', () => {
    for (const row of CATALOGUE) {
      const species = requireSpecies(row.id)
      const made = species.produces.map((p) => p.productId)
      expect(made.sort(), row.id).toEqual([...row.produces].sort())
      for (const productId of made) {
        const product = productById(productId)
        expect(product, `${row.id} makes an unpriced "${productId}"`).toBeDefined()
        expect(product?.econ.base ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('gives every producing animal a real cadence', () => {
    for (const species of SPECIES) {
      for (const product of species.produces) {
        expect(product.everyDays, `${species.id} -> ${product.productId}`).toBeGreaterThan(0)
      }
    }
  })

  it('prices every animal, and gates it on a level it can be housed at', () => {
    for (const species of SPECIES) {
      expect(species.cost, species.id).toBeGreaterThan(0)
      expect(species.level, species.id).toBeGreaterThanOrEqual(1)
      expect(requiredLevel(`animal:${species.id}`), species.id).toBe(species.level)
    }
  })

  it('agrees with the building table, in both directions', () => {
    expect(speciesDataProblems()).toEqual([])
  })

  it('feeds nothing to the bee or the fish, which forage for themselves', () => {
    expect(requireSpecies('bee').hayPerDay).toBe(0)
    expect(requireSpecies('fish').hayPerDay).toBe(0)
    for (const species of SPECIES) {
      expect(species.hayPerDay, species.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('makes the pig forage outside, and nothing else', () => {
    const outdoors = SPECIES.filter((s) => s.requiresOutside).map((s) => s.id)
    expect(outdoors).toEqual(['pig'])
  })

  it('asks for a tool only from the sheep', () => {
    const tooled = SPECIES.filter((s) => s.requiresTool !== null)
    expect(tooled.map((s) => s.id)).toEqual(['sheep'])
    expect(tooled[0].requiresTool).toBe('shears')
  })

  it('keeps the horse a companion: it produces nothing at all', () => {
    const horse = requireSpecies('horse')
    expect(producesNothing(horse)).toBe(true)
    expect(firstProduceDays(horse)).toBe(0)
    for (const species of SPECIES) {
      if (species.id === 'horse') continue
      expect(producesNothing(species), species.id).toBe(false)
      expect(firstProduceDays(species), species.id).toBeGreaterThan(0)
    }
  })

  it('reads firstProduceDays as the soonest of everything an animal gives', () => {
    for (const species of SPECIES) {
      if (species.produces.length === 0) continue
      const soonest = Math.min(...species.produces.map((p) => p.everyDays))
      expect(firstProduceDays(species), species.id).toBe(soonest)
    }
  })

  it('costs more for an animal that gives more, within a building tier', () => {
    expect(requireSpecies('chicken').cost).toBeLessThan(requireSpecies('duck').cost)
    expect(requireSpecies('cow').cost).toBeLessThan(requireSpecies('goat').cost)
    expect(requireSpecies('goat').cost).toBeLessThan(requireSpecies('sheep').cost)
    expect(requireSpecies('sheep').cost).toBeLessThan(requireSpecies('pig').cost)
  })
})

describe('speciesForBuilding', () => {
  it('lists exactly what each building accepts', () => {
    for (const building of BUILDINGS) {
      const accepted = speciesForBuilding(building.kind).map((s) => s.id)
      expect(accepted.slice().sort(), building.kind).toEqual(building.species.slice().sort())
    }
  })

  it('is empty for a building that houses nothing', () => {
    expect(speciesForBuilding('silo')).toEqual([])
    expect(speciesForBuilding('nowhere-at-all')).toEqual([])
  })

  it('grows with each upgrade tier, so an upgrade never evicts an occupant', () => {
    const coop = speciesForBuilding('coop').map((s) => s.id)
    const big = speciesForBuilding('big-coop').map((s) => s.id)
    const deluxe = speciesForBuilding('deluxe-coop').map((s) => s.id)
    for (const id of coop) expect(big).toContain(id)
    for (const id of big) expect(deluxe).toContain(id)
  })
})

describe('requireSpecies', () => {
  it('throws for an animal nobody in the valley sells', () => {
    expect(() => requireSpecies('dragon')).toThrow(/dragon/)
  })
})
