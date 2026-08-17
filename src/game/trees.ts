import { QUALITY_MULTIPLIER } from './constants'
import { randInt } from './rng'
import type { CropDef, Plant, Quality, Season } from './types'

/**
 * Trees and bushes — the 14 perennials of `docs/CATALOG.md` section 2.
 *
 * A tree is bought as a sapling, planted once, and then **never replanted**. It takes
 * most of a season to mature, after which it bears fruit on a repeating cycle for the
 * rest of the save. The trade is the tile: that ground is gone for good, and cleared
 * ground is the thing everything else on the farm is competing for
 * (`docs/PROGRESSION.md` section 3). A crop tile can be four different things in a
 * year; a tree tile is one thing forever.
 *
 * The three rules that make a tree a tree rather than a slow crop:
 *
 * 1. **It does not need watering.** `stageDays` here counts calendar days, not watered
 *    days, and a tree never withers. Nothing about a tree is a daily chore.
 * 2. **Saplings sleep through winter.** Growth stops in winter and resumes in spring,
 *    so a sapling planted in autumn costs the player a whole dead season. Plant in
 *    spring.
 * 3. **It only fruits in its seasons.** Out of season a mature tree simply stands
 *    there — its cycle does not tick. A two-season tree therefore earns roughly twice
 *    what a one-season tree of the same price earns, which is why it costs more and
 *    sits further up the level ladder.
 *
 * `TreeDef` extends `CropDef` so a tree can be handed straight to anything that
 * already understands a crop — the plant renderer, the almanac table, the item
 * naming — with `seedCost` reading as the sapling price and `regrowDays` as the
 * fruiting cycle. It is never a member of `CROPS`, so `cropById` will not find one:
 * a caller holding a `Plant` looks it up with `cropById` first and `treeById` second.
 *
 * Balance intent: a mature tree grosses roughly `sapling / 0.8` per year, so it pays
 * for itself in its first full fruiting season and is free money after that. That
 * gross is a little under what an attentively farmed crop tile makes across four
 * seasons — a tree trades ceiling for zero labour and zero recurring seed cost.
 * No two entries share a fruit colour, here or with `CROPS`.
 */
export interface TreeDef extends CropDef {
  /** Farming level required before the shop will sell the sapling. */
  level: number
  /**
   * Days between one crop of fruit and the next, counting only days in a season the
   * tree fruits in. Never null — a tree that stops bearing is a dead tree.
   */
  regrowDays: number
  /** Wood recovered when the tree is felled, so a bad placement is recoverable. */
  wood: number
}

export const TREES: readonly TreeDef[] = [
  // ---- bushes: cheap, quick to mature, small fruit on a short cycle -------
  {
    id: 'raspberry',
    name: 'RASPBERRY',
    seasons: ['summer'],
    level: 13,
    seedCost: 450,
    basePrice: 22,
    stageDays: [4, 4, 4],
    yieldMin: 2,
    yieldMax: 4,
    regrowDays: 3,
    wood: 3,
    art: { stem: '#6f5a3a', leaf: '#5f8f42', fruit: '#d4738f', shape: 'cluster', fruits: 7, height: 9 },
  },
  {
    id: 'blackberry',
    name: 'BLACKBERRY',
    seasons: ['fall'],
    level: 17,
    seedCost: 520,
    basePrice: 26,
    stageDays: [4, 4, 4],
    yieldMin: 2,
    yieldMax: 4,
    regrowDays: 3,
    wood: 3,
    art: { stem: '#5a4a3c', leaf: '#4a7238', fruit: '#35304f', shape: 'cluster', fruits: 7, height: 9 },
  },

  // ---- orchard: one season each, the backbone of the pie and jam chains ---
  {
    id: 'cherry',
    name: 'CHERRY',
    seasons: ['spring'],
    level: 15,
    seedCost: 520,
    basePrice: 40,
    stageDays: [5, 5, 5, 5],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: 4,
    wood: 8,
    art: { stem: '#6b4a35', leaf: '#4f7a3a', fruit: '#8e2b3e', shape: 'cluster', fruits: 6, height: 13 },
  },
  {
    id: 'apple',
    name: 'APPLE',
    seasons: ['fall'],
    level: 19,
    seedCost: 760,
    basePrice: 58,
    stageDays: [6, 6, 6, 6],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: 4,
    wood: 10,
    art: { stem: '#6a4a34', leaf: '#52803c', fruit: '#e05a4e', shape: 'round', fruits: 4, height: 14 },
  },
  {
    id: 'peach',
    name: 'PEACH',
    seasons: ['summer'],
    level: 22,
    seedCost: 700,
    basePrice: 88,
    stageDays: [6, 6, 6, 6],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    wood: 9,
    art: { stem: '#7a5540', leaf: '#689647', fruit: '#f0a37a', shape: 'round', fruits: 3, height: 13 },
  },
  {
    id: 'plum',
    name: 'PLUM',
    seasons: ['fall'],
    level: 25,
    seedCost: 850,
    basePrice: 46,
    stageDays: [6, 6, 6, 6],
    yieldMin: 3,
    yieldMax: 4,
    regrowDays: 4,
    wood: 9,
    art: { stem: '#5f4436', leaf: '#46703a', fruit: '#6b3f6e', shape: 'round', fruits: 5, height: 13 },
  },

  // ---- citrus: the only things that fruit in winter, and priced for it ----
  {
    id: 'lemon',
    name: 'LEMON',
    seasons: ['spring', 'winter'],
    level: 30,
    seedCost: 800,
    basePrice: 44,
    stageDays: [7, 7, 7, 7],
    yieldMin: 1,
    yieldMax: 3,
    regrowDays: 5,
    wood: 8,
    art: { stem: '#6b5238', leaf: '#5c8a3f', fruit: '#f7e04e', shape: 'round', fruits: 4, height: 12 },
  },
  {
    id: 'orange',
    name: 'ORANGE',
    seasons: ['winter'],
    level: 33,
    seedCost: 750,
    basePrice: 78,
    stageDays: [7, 7, 7, 7],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    wood: 8,
    art: { stem: '#74553c', leaf: '#4f7a3a', fruit: '#f0951f', shape: 'round', fruits: 3, height: 13 },
  },

  // ---- the industrial perennials: oil, chocolate, coffee -------------------
  {
    id: 'olive',
    name: 'OLIVE',
    seasons: ['fall'],
    level: 37,
    seedCost: 800,
    basePrice: 34,
    stageDays: [8, 8, 8, 8],
    yieldMin: 3,
    yieldMax: 5,
    regrowDays: 4,
    wood: 10,
    art: { stem: '#6f6250', leaf: '#8a9a6a', fruit: '#6d7a3a', shape: 'leafy', fruits: 6, height: 12 },
  },
  {
    id: 'coconut',
    name: 'COCONUT',
    seasons: ['summer'],
    level: 42,
    seedCost: 900,
    basePrice: 95,
    stageDays: [8, 8, 8, 8],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    wood: 12,
    art: { stem: '#7a6046', leaf: '#6d9c46', fruit: '#8a6a4a', shape: 'round', fruits: 3, height: 14 },
  },
  {
    id: 'mango',
    name: 'MANGO',
    seasons: ['summer'],
    level: 48,
    seedCost: 950,
    basePrice: 105,
    stageDays: [8, 8, 8, 8],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    wood: 10,
    art: { stem: '#6b4a3a', leaf: '#4f8a45', fruit: '#f2703a', shape: 'round', fruits: 3, height: 13 },
  },
  {
    id: 'banana',
    name: 'BANANA',
    seasons: ['summer', 'fall'],
    level: 54,
    seedCost: 1800,
    basePrice: 66,
    stageDays: [9, 9, 9, 9],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: 4,
    wood: 6,
    art: { stem: '#7a6a3f', leaf: '#6f9a3f', fruit: '#e3bd3c', shape: 'long', fruits: 3, height: 14 },
  },
  {
    id: 'cacao',
    name: 'CACAO',
    seasons: ['spring', 'fall'],
    level: 60,
    seedCost: 1500,
    basePrice: 88,
    stageDays: [9, 9, 9, 9],
    yieldMin: 1,
    yieldMax: 3,
    regrowDays: 5,
    wood: 10,
    art: { stem: '#5f4632', leaf: '#3f7a44', fruit: '#6b4326', shape: 'long', fruits: 3, height: 13 },
  },
  {
    id: 'coffee',
    name: 'COFFEE',
    seasons: ['fall', 'winter'],
    level: 66,
    seedCost: 2400,
    basePrice: 74,
    stageDays: [10, 10, 10, 10],
    yieldMin: 2,
    yieldMax: 4,
    regrowDays: 4,
    wood: 7,
    art: { stem: '#5a4436', leaf: '#4a7a44', fruit: '#a83a2c', shape: 'cluster', fruits: 7, height: 12 },
  },
]

const BY_ID: ReadonlyMap<string, TreeDef> = new Map(TREES.map((t) => [t.id, t]))

/** Extra fruit an old tree bears, one per this many harvests, capped by MATURITY_CAP. */
const MATURITY_STEP = 6
const MATURITY_CAP = 2

export function treeById(id: string): TreeDef | undefined {
  return BY_ID.get(id)
}

/** Throws if the id is unknown. Use where a missing tree is a programming error. */
export function requireTree(id: string): TreeDef {
  const tree = BY_ID.get(id)
  if (!tree) throw new Error(`requireTree: unknown tree "${id}"`)
  return tree
}

/** Trees that bear fruit in this season. Out of season they still stand on the tile. */
export function treesForSeason(season: Season): TreeDef[] {
  return TREES.filter((t) => t.seasons.includes(season))
}

export function treeFruitsIn(tree: TreeDef, season: Season): boolean {
  return tree.seasons.includes(season)
}

/** Calendar days from sapling to first fruiting, winters excluded. */
export function totalMatureDays(tree: TreeDef): number {
  let days = 0
  for (const d of tree.stageDays) days += d
  return days
}

/**
 * A freshly planted sapling. Shares the `Plant` shape with crops so a tile needs no
 * new field: `stage` climbs to maturity, then `progress` counts the fruiting cycle
 * and `regrown` counts the harvests this tree has given.
 */
export function plantTree(treeId: string): Plant {
  const tree = requireTree(treeId)
  return {
    cropId: tree.id,
    stage: 0,
    progress: 0,
    dry: 0,
    dead: false,
    fertilized: false,
    regrown: 0,
  }
}

/** Grown to full height. A mature tree has finished with `stageDays` forever. */
export function isTreeMature(plant: Plant, tree: TreeDef): boolean {
  return !plant.dead && plant.cropId === tree.id && plant.stage >= tree.stageDays.length
}

/** Mature and carrying a ripe crop of fruit. Mirrors `isRipe` for a crop. */
export function isTreeRipe(plant: Plant, tree: TreeDef): boolean {
  return isTreeMature(plant, tree) && plant.progress >= tree.regrowDays
}

/**
 * One overnight tick for one tree, returning a new `Plant`. Pure: no clock, no roll.
 *
 * A sapling grows a day per day except in winter. A mature tree advances its fruiting
 * cycle only on days in a season it fruits in, and holds ripe fruit indefinitely once
 * the cycle completes — the season turning over never destroys fruit that is already
 * hanging, because a harvest quietly evaporating is worse than no harvest.
 */
export function growTree(plant: Plant, tree: TreeDef, season: Season): Plant {
  if (plant.dead || plant.cropId !== tree.id) return plant

  if (plant.stage < tree.stageDays.length) {
    if (season === 'winter') return plant
    const need = tree.stageDays[plant.stage]
    const progress = plant.progress + 1
    return progress >= need
      ? { ...plant, stage: plant.stage + 1, progress: 0 }
      : { ...plant, progress }
  }

  if (!treeFruitsIn(tree, season) || plant.progress >= tree.regrowDays) return plant
  return { ...plant, progress: plant.progress + 1 }
}

/**
 * How much fruit one harvest gives. `rand` comes from `rngFor(seed, salt)`, so the
 * same tree on the same day always gives the same number. An established tree bears
 * a little more: one extra fruit per `MATURITY_STEP` harvests, up to `MATURITY_CAP`.
 */
export function treeYield(tree: TreeDef, plant: Plant, rand: () => number): number {
  const bonus = Math.min(MATURITY_CAP, Math.floor(Math.max(0, plant.regrown) / MATURITY_STEP))
  return randInt(rand, tree.yieldMin, tree.yieldMax) + bonus
}

/**
 * The tree after its fruit has been picked: cycle reset, harvest counted, tile kept.
 * A tree that is not ripe is returned untouched, so a stray call cannot rob it.
 */
export function pickTree(plant: Plant, tree: TreeDef): Plant {
  if (!isTreeRipe(plant, tree)) return plant
  return { ...plant, progress: 0, regrown: plant.regrown + 1 }
}

/** Sale value of one fruit at a quality, rounded down. Mirrors `produceValue`. */
export function treeValue(tree: TreeDef, quality: Quality): number {
  return Math.floor(tree.basePrice * QUALITY_MULTIPLIER[quality])
}
