import type { BuildingDef, BuildingKind, SpeciesId } from './farm-types'

/**
 * The building table — the twenty structures of `docs/CATALOG.md` §7.
 *
 * Costs and footprints for the Coop, Barn, Silo and Well are the published numbers in
 * `docs/GAMEPLAY.md` §1 and are not free to move. Everything else is balanced around them.
 *
 * Three rules are encoded in the data rather than enforced in code, because an upgrade that
 * evicts an animal is a bug the player pays for:
 *
 *   1. Every tier of an upgrade chain shares one footprint, so the upgrade lands in place.
 *   2. Capacity strictly increases along a chain that houses animals, so no occupant is
 *      ever left without a stall.
 *   3. Each tier's `species` list is a superset of the tier below it, so no occupant is
 *      ever left in a building that no longer accepts it.
 *
 * `upgradeChainProblems()` re-derives all three from the table so a test can prove them.
 *
 * Level gates follow the ladder bands in `docs/PROGRESSION.md` §1: the Well, Silo, Coop and
 * stall land in 1-10; the Barn, Barn store, Sawmill yard and Bakery in 11-25; the tier-2
 * animal buildings, Apiary, Stable and Workshop in 26-45; the Pond and Greenhouse in 46-65;
 * the Mine and the tier-3 animal buildings in 66-85; the Farmhouse upgrade at 90 as a
 * prestige capstone.
 *
 * Material costs step from raw (wood, stone, fibre — dropped by clearing) through worked
 * (plank, nail) to fitted (bolt, screw, tape) and finally to the one-off tools (mallet, axe,
 * saw) that only orders and boat crates supply. A late building therefore cannot be rushed
 * with gold alone, which is the point of `docs/PROGRESSION.md` §6.
 */
export const BUILDINGS: readonly BuildingDef[] = [
  // ---- the home you start with ------------------------------------------------
  {
    // Already standing on day one, which is why it costs nothing and is never offered by
    // `buildingsForLevel`. It exists as a def so the farmhouse occupies tiles like any other
    // building, and so the upgrade chain has a root.
    kind: 'farmhouse',
    name: 'FARMHOUSE',
    // 4x4 to match `big-farmhouse`, because `tests/buildings.test.ts` requires an upgrade
    // to keep its footprint so it can land in place. This is deliberately NOT the geometry
    // the valley uses: `placement.FARMHOUSE` reserves 3x3 at (1,0) and `art/scenery.ts`
    // draws 3x3. Entering the house therefore takes its door from the placement constant,
    // never from here -- see tests/farmhouse.test.ts, which records the disagreement.
    footprint: { w: 4, h: 4 },
    cost: 0,
    materials: {},
    level: 1,
    capacity: 0,
    species: [],
    upgradesTo: 'big-farmhouse',
    autoFeeds: false,
  },

  // ---- utility ----------------------------------------------------------------
  {
    // Refills the watering can without the walk to the pond. The cheapest thing worth
    // owning, and deliberately the first build the player can afford.
    kind: 'well',
    name: 'WELL',
    footprint: { w: 2, h: 2 },
    cost: 1000,
    materials: { stone: 20, wood: 8 },
    level: 3,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Stores `SILO_HAY_CAPACITY` hay. Winter is the tax this pays; a second silo is a
    // legitimate answer to a second barn.
    kind: 'silo',
    name: 'SILO',
    footprint: { w: 3, h: 3 },
    cost: 1500,
    materials: { wood: 25, stone: 15, nail: 6 },
    level: 6,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Opens the roadside stall's `STALL_SLOTS` price-it-yourself slots.
    kind: 'stall',
    name: 'ROADSIDE STALL',
    footprint: { w: 3, h: 2 },
    cost: 2500,
    materials: { wood: 20, plank: 8, nail: 6, fibre: 10 },
    level: 10,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Raises `progression.barnCap` by `BARN_STORE_BONUS` per store built, on top of whatever
    // the player has paid to expand it.
    kind: 'barn-store',
    name: 'BARN STORE',
    footprint: { w: 3, h: 3 },
    cost: 3500,
    materials: { wood: 35, plank: 18, nail: 14, stone: 10 },
    level: 14,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },

  // ---- birds ------------------------------------------------------------------
  {
    kind: 'coop',
    name: 'COOP',
    footprint: { w: 4, h: 3 },
    cost: 4000,
    materials: { wood: 40, stone: 10, plank: 12, nail: 10 },
    level: 8,
    capacity: 4,
    species: ['chicken'],
    upgradesTo: 'big-coop',
    autoFeeds: false,
  },
  {
    kind: 'big-coop',
    name: 'BIG COOP',
    footprint: { w: 4, h: 3 },
    cost: 10000,
    materials: { plank: 40, nail: 30, bolt: 12, stone: 20, mallet: 1 },
    level: 26,
    capacity: 8,
    species: ['chicken', 'duck', 'turkey'],
    upgradesTo: 'deluxe-coop',
    autoFeeds: false,
  },
  {
    kind: 'deluxe-coop',
    name: 'DELUXE COOP',
    footprint: { w: 4, h: 3 },
    cost: 20000,
    materials: { plank: 70, nail: 40, bolt: 30, screw: 30, tape: 12, saw: 1 },
    level: 72,
    capacity: 12,
    species: ['chicken', 'duck', 'turkey', 'goose', 'rabbit'],
    upgradesTo: null,
    autoFeeds: true,
  },

  // ---- large animals ----------------------------------------------------------
  {
    kind: 'barn',
    name: 'BARN',
    footprint: { w: 5, h: 4 },
    cost: 6000,
    materials: { wood: 60, stone: 30, plank: 20, nail: 18 },
    level: 15,
    capacity: 4,
    species: ['cow'],
    upgradesTo: 'big-barn',
    autoFeeds: false,
  },
  {
    kind: 'big-barn',
    name: 'BIG BARN',
    footprint: { w: 5, h: 4 },
    cost: 12000,
    materials: { plank: 50, nail: 36, bolt: 16, stone: 30, mallet: 1 },
    level: 34,
    capacity: 8,
    species: ['cow', 'goat', 'sheep'],
    upgradesTo: 'deluxe-barn',
    autoFeeds: false,
  },
  {
    kind: 'deluxe-barn',
    name: 'DELUXE BARN',
    footprint: { w: 5, h: 4 },
    cost: 25000,
    materials: { plank: 85, nail: 48, bolt: 36, screw: 36, tape: 16, mallet: 1 },
    level: 78,
    capacity: 12,
    species: ['cow', 'goat', 'sheep', 'pig'],
    upgradesTo: null,
    autoFeeds: true,
  },

  // ---- the specialist animal houses -------------------------------------------
  {
    // Six hives. Bees eat nothing and need no tending beyond collection, which is why the
    // apiary is cheap to run and expensive to reach.
    kind: 'apiary',
    name: 'APIARY',
    footprint: { w: 2, h: 2 },
    cost: 8000,
    materials: { wood: 30, plank: 16, fibre: 30, nail: 10 },
    level: 30,
    capacity: 6,
    species: ['bee'],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Two stalls. A horse produces nothing and cannot be sold; the stable is bought for the
    // movement speed alone, so it is priced against the time it gives back.
    kind: 'stable',
    name: 'STABLE',
    footprint: { w: 4, h: 3 },
    cost: 11000,
    materials: { wood: 55, plank: 30, nail: 24, fibre: 20, bolt: 8 },
    level: 32,
    capacity: 2,
    species: ['horse'],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // A stocked pond, distinct from the natural water the map starts with. Fish eat nothing.
    kind: 'pond',
    name: 'POND',
    footprint: { w: 4, h: 4 },
    cost: 16000,
    materials: { stone: 80, wood: 30, plank: 20, tape: 6 },
    level: 48,
    capacity: 8,
    species: ['fish'],
    upgradesTo: null,
    autoFeeds: false,
  },

  // ---- production and materials ------------------------------------------------
  {
    // Yields wood and the occasional plank every morning without swinging an axe.
    kind: 'sawmill-yard',
    name: 'SAWMILL YARD',
    footprint: { w: 3, h: 3 },
    cost: 7500,
    materials: { wood: 50, stone: 25, plank: 15, bolt: 6, saw: 1 },
    level: 20,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // The shopfront that the Bakery machine feeds. Baked goods left here sell at a standing
    // premium, which is what stops the deep baking chain from being throughput-capped by the
    // shipping bin.
    kind: 'bakery',
    name: 'BAKERY',
    footprint: { w: 4, h: 3 },
    cost: 9000,
    materials: { stone: 60, wood: 30, plank: 24, nail: 20, bolt: 8 },
    level: 22,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Turns planks into the fitted materials — bolts, screws, nails and tape — that clearing
    // alone never supplies fast enough for a tier-3 building.
    kind: 'workshop',
    name: 'WORKSHOP',
    footprint: { w: 3, h: 3 },
    cost: 14000,
    materials: { plank: 45, stone: 40, bolt: 20, screw: 20, nail: 24, saw: 1 },
    level: 40,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Grows any crop in any season, at a lower yield than open ground. The answer to winter
    // for a player who reaches it.
    kind: 'greenhouse',
    name: 'GREENHOUSE',
    footprint: { w: 5, h: 4 },
    cost: 30000,
    materials: { plank: 60, stone: 50, bolt: 24, screw: 24, tape: 10, nail: 30 },
    level: 55,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
  {
    // Stone and ore, and the only route to the Smelter's inputs.
    kind: 'mine',
    name: 'MINE',
    footprint: { w: 3, h: 3 },
    cost: 22000,
    materials: { stone: 120, plank: 40, bolt: 30, screw: 20, axe: 1 },
    level: 68,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },

  // ---- the capstone -------------------------------------------------------------
  {
    // Raises max energy and adds a kitchen. Costs one of every hand tool, so it can only be
    // built by a player who has run the order and crate systems for a full year.
    kind: 'big-farmhouse',
    name: 'BIG FARMHOUSE',
    footprint: { w: 4, h: 4 },
    cost: 40000,
    materials: {
      plank: 120,
      stone: 90,
      bolt: 50,
      screw: 50,
      nail: 60,
      tape: 24,
      mallet: 1,
      axe: 1,
      saw: 1,
    },
    level: 90,
    capacity: 0,
    species: [],
    upgradesTo: null,
    autoFeeds: false,
  },
]

/** Hay one silo holds, per `docs/GAMEPLAY.md` §1. Build a second silo to hold more. */
export const SILO_HAY_CAPACITY = 240

/** Price-it-yourself slots the roadside stall opens. */
export const STALL_SLOTS = 6

/** Capacity each barn store adds to `progression.barnCap`. */
export const BARN_STORE_BONUS = 100

const BY_KIND: ReadonlyMap<BuildingKind, BuildingDef> = new Map(BUILDINGS.map((b) => [b.kind, b]))

const UPGRADE_TARGETS: ReadonlySet<BuildingKind> = new Set(
  BUILDINGS.map((b) => b.upgradesTo).filter((k): k is BuildingKind => k !== null),
)

export function buildingDef(kind: BuildingKind): BuildingDef | undefined {
  return BY_KIND.get(kind)
}

/** Throws if the kind is unknown. Use where a missing building is a programming error. */
export function requireBuilding(kind: BuildingKind): BuildingDef {
  const def = BY_KIND.get(kind)
  if (!def) throw new Error(`requireBuilding: unknown building "${kind}"`)
  return def
}

/**
 * Everything the shop may offer at this level, cheapest first within a level band.
 *
 * Buildings the player already owns from day one — the farmhouse, the only zero-cost def —
 * are never offered. Upgrade tiers *are* included: the shop shows a Big Coop with its level
 * and price whether or not a Coop is standing yet, and refuses the purchase at the point of
 * placement, per `docs/PROGRESSION.md` §1: "anything the player has not reached shows greyed
 * with its required level stated plainly, never hidden".
 */
export function buildingsForLevel(level: number): BuildingDef[] {
  return BUILDINGS.filter((b) => b.cost > 0 && b.level <= level).sort(
    (a, b) => a.level - b.level || a.cost - b.cost || a.kind.localeCompare(b.kind),
  )
}

/**
 * The chain from `kind` upward: the def itself, then each tier it can become, in order.
 * A building with nowhere to go returns a single-entry array; an unknown kind returns none.
 */
export function upgradePath(kind: BuildingKind): BuildingDef[] {
  const path: BuildingDef[] = []
  const seen = new Set<BuildingKind>()
  let cursor: BuildingKind | null = kind
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    const def: BuildingDef | undefined = BY_KIND.get(cursor)
    if (!def) break
    path.push(def)
    cursor = def.upgradesTo
  }
  return path
}

/** True for a kind that is reached by upgrading something else, like the Deluxe Barn. */
export function isUpgradeTier(kind: BuildingKind): boolean {
  return UPGRADE_TARGETS.has(kind)
}

/**
 * Re-derives the three upgrade invariants from the table and names every violation. Empty
 * means the data is sound. Exported so a test can assert it rather than trusting a comment.
 */
export function upgradeChainProblems(): string[] {
  const problems: string[] = []
  for (const from of BUILDINGS) {
    if (from.upgradesTo === null) continue
    const to = BY_KIND.get(from.upgradesTo)
    if (!to) {
      problems.push(`${from.kind} upgrades to unknown kind "${from.upgradesTo}"`)
      continue
    }
    if (to.footprint.w !== from.footprint.w || to.footprint.h !== from.footprint.h) {
      problems.push(`${from.kind} -> ${to.kind}: footprint changes, so the upgrade cannot land in place`)
    }
    if (from.species.length > 0 && to.capacity <= from.capacity) {
      problems.push(`${from.kind} -> ${to.kind}: capacity ${from.capacity} -> ${to.capacity} would evict animals`)
    } else if (to.capacity < from.capacity) {
      problems.push(`${from.kind} -> ${to.kind}: capacity shrinks`)
    }
    const accepted: ReadonlySet<SpeciesId> = new Set(to.species)
    for (const id of from.species) {
      if (!accepted.has(id)) {
        problems.push(`${from.kind} -> ${to.kind}: no longer accepts "${id}"`)
      }
    }
    if (to.level < from.level) problems.push(`${from.kind} -> ${to.kind}: level gate goes backwards`)
    if (to.cost <= from.cost) problems.push(`${from.kind} -> ${to.kind}: upgrade is not dearer than the tier below`)
  }
  return problems
}
