import { BUILDINGS } from './buildings'
import type { BuildingKind, SpeciesDef, SpeciesId } from './farm-types'

/**
 * The livestock table — the twelve animals of `docs/CATALOG.md` §3.
 *
 * Costs, housing and production cadences for the chicken, duck, rabbit, cow, goat, sheep and
 * pig are the published numbers in `docs/GAMEPLAY.md` §2. The goose, turkey, bee, fish and
 * horse are the catalogue's extensions and are balanced into the same curve.
 *
 * Balance, per `docs/GAMEPLAY.md` §6 — "a coop of four chickens should roughly match one good
 * crop plot for daily income, with far less daily effort and a much higher up-front cost":
 * four chickens lay four eggs a day for 3,200 gold of birds plus a 4,000 gold coop, which
 * pays back over roughly six weeks against a mid crop's tile-for-tile yield. Every later
 * species pays back more slowly in raw gold and earns its keep by feeding a deeper chain
 * instead — the sheep's wool and the pig's truffle are worth far more processed than sold.
 *
 * `level` is never lower than the level of the cheapest building that can house the species,
 * so no animal is purchasable before it has somewhere to live. `speciesDataProblems()`
 * re-derives that from the building table.
 *
 * `hayPerDay` is what the animal eats on a day it cannot graze — which in winter is every
 * day, per `docs/GAMEPLAY.md` §2. A silo holds 240. Four chickens cost 112 hay to carry
 * through a 28-day winter and fit inside one silo comfortably; add four cows and the winter
 * bill is 336, which does not, and that gap is the whole reason to cut grass through autumn
 * or build a second silo. Bees and fish eat nothing.
 */
export const SPECIES: readonly SpeciesDef[] = [
  // ---- birds ------------------------------------------------------------------
  {
    id: 'chicken',
    name: 'CHICKEN',
    housedIn: ['coop', 'big-coop', 'deluxe-coop'],
    cost: 800,
    level: 8,
    produces: [{ productId: 'egg', everyDays: 1 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 1,
  },
  {
    id: 'duck',
    name: 'DUCK',
    housedIn: ['big-coop', 'deluxe-coop'],
    cost: 1200,
    level: 26,
    produces: [
      { productId: 'duck-egg', everyDays: 2 },
      { productId: 'feather', everyDays: 4 },
    ],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 1,
  },
  {
    id: 'turkey',
    name: 'TURKEY',
    housedIn: ['big-coop', 'deluxe-coop'],
    cost: 2600,
    level: 27,
    produces: [{ productId: 'turkey-egg', everyDays: 3 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 1,
  },
  {
    id: 'goose',
    name: 'GOOSE',
    housedIn: ['deluxe-coop'],
    cost: 9000,
    level: 72,
    produces: [
      { productId: 'goose-egg', everyDays: 3 },
      { productId: 'down', everyDays: 6 },
    ],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 2,
  },
  {
    id: 'rabbit',
    name: 'RABBIT',
    housedIn: ['deluxe-coop'],
    cost: 4000,
    level: 74,
    produces: [{ productId: 'angora-wool', everyDays: 4 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 1,
  },

  // ---- large animals ----------------------------------------------------------
  {
    id: 'cow',
    name: 'COW',
    housedIn: ['barn', 'big-barn', 'deluxe-barn'],
    cost: 1500,
    level: 15,
    produces: [{ productId: 'milk', everyDays: 1 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 2,
  },
  {
    id: 'goat',
    name: 'GOAT',
    housedIn: ['big-barn', 'deluxe-barn'],
    cost: 4000,
    level: 34,
    produces: [{ productId: 'goat-milk', everyDays: 2 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 2,
  },
  {
    // The only species that needs a tool in hand to collect from, per `docs/GAMEPLAY.md` §2.
    id: 'sheep',
    name: 'SHEEP',
    housedIn: ['big-barn', 'deluxe-barn'],
    cost: 8000,
    level: 36,
    produces: [{ productId: 'wool', everyDays: 3 }],
    requiresTool: 'shears',
    requiresOutside: false,
    hayPerDay: 2,
  },
  {
    // Forages for truffles, so it produces nothing at all while shut in — and nothing in
    // winter, when the caller refuses to let it out. Bacon accrues on its own slow clock.
    id: 'pig',
    name: 'PIG',
    housedIn: ['deluxe-barn'],
    cost: 16000,
    level: 78,
    produces: [
      { productId: 'truffle', everyDays: 1 },
      { productId: 'bacon', everyDays: 6 },
    ],
    requiresTool: null,
    requiresOutside: true,
    hayPerDay: 3,
  },

  // ---- the specialists ---------------------------------------------------------
  {
    // A hive, not a single bee. Eats nothing, needs no feeding, and the apiary holds six.
    id: 'bee',
    name: 'BEE',
    housedIn: ['apiary'],
    cost: 1000,
    level: 30,
    produces: [{ productId: 'honeycomb', everyDays: 2 }],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 0,
  },
  {
    id: 'fish',
    name: 'FISH',
    housedIn: ['pond'],
    cost: 2000,
    level: 48,
    produces: [
      { productId: 'fish', everyDays: 2 },
      { productId: 'roe', everyDays: 5 },
    ],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 0,
  },
  {
    // Produces nothing and cannot be sold. It is bought for the movement speed alone, which
    // is why it is the dearest thing in the stable and eats more hay than anything else:
    // the horse is a running cost the player chooses to carry.
    id: 'horse',
    name: 'HORSE',
    housedIn: ['stable'],
    cost: 12000,
    level: 32,
    produces: [],
    requiresTool: null,
    requiresOutside: false,
    hayPerDay: 2,
  },
]

const BY_ID: ReadonlyMap<SpeciesId, SpeciesDef> = new Map(SPECIES.map((s) => [s.id, s]))

export function speciesById(id: SpeciesId): SpeciesDef | undefined {
  return BY_ID.get(id)
}

/** Throws if the id is unknown. Use where a missing species is a programming error. */
export function requireSpecies(id: SpeciesId): SpeciesDef {
  const def = BY_ID.get(id)
  if (!def) throw new Error(`requireSpecies: unknown species "${id}"`)
  return def
}

/** Everything this building kind will take in, in table order. */
export function speciesForBuilding(kind: BuildingKind): SpeciesDef[] {
  return SPECIES.filter((s) => s.housedIn.includes(kind))
}

/** True for the horse: it makes nothing, so `collectProduce` has nothing to offer. */
export function producesNothing(species: SpeciesDef): boolean {
  return species.produces.length === 0
}

/** The soonest a newly bought animal can hand over its first item, in days. */
export function firstProduceDays(species: SpeciesDef): number {
  let soonest = 0
  for (const p of species.produces) {
    if (soonest === 0 || p.everyDays < soonest) soonest = p.everyDays
  }
  return soonest
}

/**
 * Cross-checks the livestock table against the building table and names every mismatch.
 * Empty means the two agree. Exported so a test can assert it rather than trusting a comment.
 */
export function speciesDataProblems(): string[] {
  const problems: string[] = []
  const byKind = new Map(BUILDINGS.map((b) => [b.kind, b]))

  for (const species of SPECIES) {
    if (species.housedIn.length === 0) {
      problems.push(`${species.id}: has nowhere to live`)
      continue
    }
    let earliest = Number.POSITIVE_INFINITY
    for (const kind of species.housedIn) {
      const building = byKind.get(kind)
      if (!building) {
        problems.push(`${species.id}: housed in unknown building "${kind}"`)
        continue
      }
      if (!building.species.includes(species.id)) {
        problems.push(`${species.id}: claims "${kind}", but that building does not accept it`)
      }
      if (building.level < earliest) earliest = building.level
    }
    if (earliest !== Number.POSITIVE_INFINITY && species.level < earliest) {
      problems.push(`${species.id}: level ${species.level} is reachable before its housing at ${earliest}`)
    }
  }

  for (const building of BUILDINGS) {
    for (const id of building.species) {
      const species = BY_ID.get(id)
      if (!species) {
        problems.push(`${building.kind}: accepts unknown species "${id}"`)
      } else if (!species.housedIn.includes(building.kind)) {
        problems.push(`${building.kind}: accepts "${id}", but that species does not list it`)
      }
    }
    if (building.capacity > 0 && building.species.length === 0) {
      problems.push(`${building.kind}: has capacity ${building.capacity} but accepts no species`)
    }
    if (building.species.length > 0 && building.capacity === 0) {
      problems.push(`${building.kind}: accepts species but has no capacity`)
    }
  }

  return problems
}
