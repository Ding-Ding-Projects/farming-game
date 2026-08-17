/**
 * Materials — the twelve things gold cannot buy.
 *
 * Per docs/CATALOG.md §6 and docs/PROGRESSION.md §2-3, materials never appear in the shop.
 * They fall out of the work: clearing the valley yields the raw three (wood, stone, fibre)
 * and, now and then, a fitting; delivery orders pay a handful of fittings on top of the
 * gold; boat crates pay in bulk and are the reliable source of land deeds; the level ladder
 * gifts a steady trickle so a player who is producing but not trading still creeps forward.
 *
 * That is the loop the contract asks for: clearing land yields materials, materials expand
 * storage and buy land, and the new land yields more to clear.
 *
 * Pure per docs/ARCHITECTURE.md: no clock, no DOM, and every roll goes through `rngFor`.
 */
import type { MaterialId } from './farm-types'
import type { Ground } from './types'
import { randInt, rngFor } from './rng'

/* --------------------------------------------------------------- sources */

/**
 * Where a material can come from. The three clearing sources are named after the
 * `Ground` they are cleared from, so `actions.ts` can hand a tile's ground straight to
 * `clearingSource`.
 */
export type MaterialSource = 'weeds' | 'rock' | 'log' | 'order' | 'crate' | 'level'

/** Every source except the ladder, whose gifts are fixed rather than rolled. */
export type RolledSource = Exclude<MaterialSource, 'level'>

export const MATERIAL_SOURCES: readonly MaterialSource[] = [
  'weeds',
  'rock',
  'log',
  'order',
  'crate',
  'level',
]

/** The three grounds that yield material when cleared. Anything else yields nothing. */
export function clearingSource(ground: Ground): RolledSource | null {
  if (ground === 'weeds' || ground === 'rock' || ground === 'log') return ground
  return null
}

/* ----------------------------------------------------------- definitions */

export interface MaterialDef {
  id: MaterialId
  /** Display name. The bitmap font is caps-led, so these stay short. */
  name: string
  /** One line for the Almanac: what it is and what it is for. */
  note: string
  /** Every source that can yield it, in the order the player meets them. */
  sources: readonly MaterialSource[]
  /**
   * Notional worth, used to balance order and crate rewards against gold. This is *not*
   * a shop price: no material is ever bought or sold. A deed is priced against the land
   * it buys, a tool against the day of clearing it saves.
   */
  craftValue: number
}

/**
 * Ordered raw -> fittings -> tools -> deed, which is the order the Almanac lists them and
 * roughly the order the player first sees them.
 */
export const MATERIALS: readonly MaterialDef[] = [
  {
    id: 'wood',
    name: 'WOOD',
    note: 'Cut from logs. The sawmill turns three of it into a plank.',
    sources: ['log', 'weeds', 'crate', 'level'],
    craftValue: 8,
  },
  {
    id: 'stone',
    name: 'STONE',
    note: 'Broken from rock. Foundations for every building that is not a shed.',
    sources: ['rock', 'crate', 'level'],
    craftValue: 8,
  },
  {
    id: 'fibre',
    name: 'FIBRE',
    note: 'Pulled from weeds. Rope, thatch and the packing in a crate.',
    sources: ['weeds', 'order', 'level'],
    craftValue: 5,
  },
  {
    id: 'plank',
    name: 'PLANK',
    note: 'Milled timber. The frame of a storage expansion.',
    sources: ['log', 'order', 'crate', 'level'],
    craftValue: 40,
  },
  {
    id: 'nail',
    name: 'NAIL',
    note: 'Found in the rubble, paid out by the town. Nothing is fixed without them.',
    sources: ['rock', 'log', 'order', 'crate', 'level'],
    craftValue: 30,
  },
  {
    id: 'screw',
    name: 'SCREW',
    note: 'Fiddly, scarce, and wanted by every machine housing.',
    sources: ['weeds', 'rock', 'order', 'crate', 'level'],
    craftValue: 45,
  },
  {
    id: 'bolt',
    name: 'BOLT',
    note: 'Heavy fixings for the big spans — barns, silos and the mine head.',
    sources: ['rock', 'order', 'crate', 'level'],
    craftValue: 55,
  },
  {
    id: 'tape',
    name: 'DUCT TAPE',
    note: 'Holds the valley together. Rare, and never quite enough of it.',
    sources: ['weeds', 'order', 'crate', 'level'],
    craftValue: 65,
  },
  {
    id: 'mallet',
    name: 'MALLET',
    note: 'A driving hammer. Wanted whole by the heavier upgrades.',
    sources: ['rock', 'crate', 'level'],
    craftValue: 320,
  },
  {
    id: 'saw',
    name: 'SAW',
    note: 'A proper crosscut. The sawmill yard will not be built without one.',
    sources: ['log', 'crate', 'level'],
    craftValue: 380,
  },
  {
    id: 'axe',
    name: 'AXE',
    note: 'A felling head, kept as stock rather than carried. Barn work needs one.',
    sources: ['log', 'crate', 'level'],
    craftValue: 420,
  },
  {
    id: 'deed',
    name: 'LAND DEED',
    note: 'Signed over by the town. One region of the valley, per deed and per fee.',
    sources: ['crate', 'order', 'level'],
    craftValue: 2500,
  },
]

const BY_ID: ReadonlyMap<MaterialId, MaterialDef> = new Map(MATERIALS.map((m) => [m.id, m]))

/** Display name for a material. Never throws — an unknown id renders as its own key. */
export function materialName(id: MaterialId): string {
  const def = BY_ID.get(id)
  return def ? def.name : String(id).toUpperCase()
}

export function materialById(id: MaterialId): MaterialDef | undefined {
  return BY_ID.get(id)
}

/** Notional worth of a bundle, for pricing order and crate rewards. */
export function materialsValue(bundle: Partial<Record<MaterialId, number>>): number {
  let total = 0
  for (const def of MATERIALS) {
    const count = bundle[def.id]
    if (count) total += def.craftValue * count
  }
  return total
}

/* ---------------------------------------------------------- level gifts */

/**
 * Levels that hand over a land deed — one below level 40, two from there up.
 *
 * The ladder alone has to carry the land, because boat crates (the other source) only open
 * at level 82 and the fourth region gates at 40. Cumulatively this pays 1 deed by level 4,
 * 4 by 24, 7 by 40, 9 by 48, 13 by 64 and 21 by 100, against the 18 the seven regions cost
 * at levels 8, 16, 26, 40, 54, 70 and 88 — every region is affordable within a level or two
 * of its gate, and the surplus is what a player who wants the land *early* spends crates on.
 */
const DEED_LEVELS: ReadonlySet<number> = new Set([
  4, 10, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,
])

/** One mallet, saw or axe at these levels — the tool the next tier of building wants. */
const MALLET_LEVELS: ReadonlySet<number> = new Set([10, 40, 70])
const AXE_LEVELS: ReadonlySet<number> = new Set([25, 55, 85])
const SAW_LEVELS: ReadonlySet<number> = new Set([20, 50, 80, 100])

function bump(bundle: Partial<Record<MaterialId, number>>, id: MaterialId, count: number): void {
  if (count <= 0) return
  bundle[id] = (bundle[id] ?? 0) + count
}

/**
 * The materials half of a level reward. Deterministic — the ladder is a promise, not a
 * roll, so the shop can state plainly what level 42 will hand over.
 *
 * The cadence is deliberately staggered: planks every other level, nails every third,
 * screws every fourth, bolts every fifth, tape every eighth. A player levelling steadily
 * accumulates a usable mix rather than a pile of one thing, and the counts step up with
 * the level so a late expansion is not paid for at early-game rates.
 *
 * Defined past 100, because the curve continues after the unlocks stop.
 */
export function levelMaterialGift(level: number): Partial<Record<MaterialId, number>> {
  const l = Math.max(1, Math.floor(level))
  const gift: Partial<Record<MaterialId, number>> = {}

  if (l % 2 === 0) bump(gift, 'plank', 1 + Math.floor(l / 20))
  if (l % 3 === 0) bump(gift, 'nail', 2 + Math.floor(l / 25))
  if (l % 4 === 0) bump(gift, 'screw', 1 + Math.floor(l / 30))
  if (l % 5 === 0) bump(gift, 'bolt', 1 + Math.floor(l / 30))
  if (l % 8 === 0) bump(gift, 'tape', 1)
  if (l % 10 === 0) {
    const bundle = 5 + Math.floor(l / 10)
    bump(gift, 'wood', bundle)
    bump(gift, 'stone', bundle)
    bump(gift, 'fibre', 5)
  }

  if (DEED_LEVELS.has(l)) bump(gift, 'deed', l >= 40 ? 2 : 1)
  if (MALLET_LEVELS.has(l)) bump(gift, 'mallet', 1)
  if (AXE_LEVELS.has(l)) bump(gift, 'axe', 1)
  if (SAW_LEVELS.has(l)) bump(gift, 'saw', 1)

  // Past the ladder the milestones keep their shape so a long farm still restocks.
  if (l > 100) {
    if (l % 25 === 0) bump(gift, 'deed', 2)
    if (l % 50 === 0) {
      bump(gift, 'mallet', 1)
      bump(gift, 'saw', 1)
      bump(gift, 'axe', 1)
    }
  }

  return gift
}

/* --------------------------------------------------------- drop tables */

export interface MaterialDrop {
  material: MaterialId
  /** Probability this entry fires at all, 0..1. */
  chance: number
  /** Count when it fires, inclusive. */
  min: number
  max: number
}

/**
 * Clearing yields its own material every time — a swing is never wasted — and the
 * fittings ride along as the occasional bonus the contract asks for. Rock and log cost
 * more energy than weeds (4 and 5 against 2), so they carry the better bonus odds.
 *
 * Expected per swing: weeds 1.5 fibre, rock 1.5 stone, log 2 wood, plus a fitting roughly
 * every fourth swing on rock and every fifth on logs — 12, 27 and 35 gold of material a
 * swing respectively. The tools are genuinely rare: a saw turns up about once in fifty
 * logs, an axe head about once in eighty.
 */
const CLEAR_WEEDS: readonly MaterialDrop[] = [
  { material: 'fibre', chance: 1, min: 1, max: 2 },
  { material: 'wood', chance: 0.1, min: 1, max: 1 },
  { material: 'screw', chance: 0.04, min: 1, max: 1 },
  { material: 'tape', chance: 0.03, min: 1, max: 1 },
]

const CLEAR_ROCK: readonly MaterialDrop[] = [
  { material: 'stone', chance: 1, min: 1, max: 2 },
  { material: 'nail', chance: 0.1, min: 1, max: 2 },
  { material: 'bolt', chance: 0.07, min: 1, max: 1 },
  { material: 'screw', chance: 0.05, min: 1, max: 1 },
  { material: 'mallet', chance: 0.015, min: 1, max: 1 },
]

const CLEAR_LOG: readonly MaterialDrop[] = [
  { material: 'wood', chance: 1, min: 1, max: 3 },
  { material: 'plank', chance: 0.12, min: 1, max: 1 },
  { material: 'nail', chance: 0.06, min: 1, max: 1 },
  { material: 'saw', chance: 0.02, min: 1, max: 1 },
  { material: 'axe', chance: 0.012, min: 1, max: 1 },
]

/**
 * A delivery order pays a modest handful on top of its gold — enough that running orders
 * is a real alternative to swinging an axe all morning, not enough to replace it.
 * Expected worth is roughly 130 gold of material, and a deed appears about once in fifty.
 */
const ORDER_DROPS: readonly MaterialDrop[] = [
  { material: 'nail', chance: 0.3, min: 1, max: 3 },
  { material: 'plank', chance: 0.35, min: 1, max: 2 },
  { material: 'screw', chance: 0.25, min: 1, max: 2 },
  { material: 'bolt', chance: 0.2, min: 1, max: 2 },
  { material: 'fibre', chance: 0.2, min: 2, max: 4 },
  { material: 'tape', chance: 0.12, min: 1, max: 1 },
  { material: 'deed', chance: 0.02, min: 1, max: 1 },
]

/**
 * A boat crate is the material engine of the late game and the reliable deed: better than
 * even odds of one, and the only place a player short of land can go looking. Expected
 * worth is roughly 1,900 gold of material, which is why a crate is worth planning a week
 * around.
 */
const CRATE_DROPS: readonly MaterialDrop[] = [
  { material: 'deed', chance: 0.55, min: 1, max: 1 },
  { material: 'plank', chance: 0.7, min: 2, max: 5 },
  { material: 'nail', chance: 0.5, min: 3, max: 6 },
  { material: 'bolt', chance: 0.6, min: 2, max: 4 },
  { material: 'screw', chance: 0.55, min: 2, max: 4 },
  { material: 'tape', chance: 0.35, min: 1, max: 2 },
  { material: 'wood', chance: 0.4, min: 3, max: 8 },
  { material: 'stone', chance: 0.4, min: 3, max: 8 },
  { material: 'mallet', chance: 0.1, min: 1, max: 1 },
  { material: 'saw', chance: 0.08, min: 1, max: 1 },
  { material: 'axe', chance: 0.06, min: 1, max: 1 },
]

/**
 * The ladder's table is *measured* from `levelMaterialGift` over levels 1..100 rather than
 * typed out beside it, so the Almanac can never quote a rate the ladder does not pay.
 * `chance` here is the fraction of those levels that grant the material at all.
 */
function levelDropTable(): readonly MaterialDrop[] {
  const seen = new Map<MaterialId, { levels: number; min: number; max: number }>()
  for (let level = 1; level <= 100; level++) {
    const gift = levelMaterialGift(level)
    for (const def of MATERIALS) {
      const count = gift[def.id]
      if (count === undefined || count <= 0) continue
      const row = seen.get(def.id)
      if (row) {
        row.levels += 1
        row.min = Math.min(row.min, count)
        row.max = Math.max(row.max, count)
      } else {
        seen.set(def.id, { levels: 1, min: count, max: count })
      }
    }
  }
  const table: MaterialDrop[] = []
  for (const def of MATERIALS) {
    const row = seen.get(def.id)
    if (!row) continue
    table.push({
      material: def.id,
      chance: Math.round((row.levels / 100) * 100) / 100,
      min: row.min,
      max: row.max,
    })
  }
  return table
}

const DROP_TABLES: Record<MaterialSource, readonly MaterialDrop[]> = {
  weeds: CLEAR_WEEDS,
  rock: CLEAR_ROCK,
  log: CLEAR_LOG,
  order: ORDER_DROPS,
  crate: CRATE_DROPS,
  level: levelDropTable(),
}

/** Everything a source can yield, with its odds. Published in the Almanac verbatim. */
export function dropTableFor(source: MaterialSource): readonly MaterialDrop[] {
  return DROP_TABLES[source]
}

/** Average worth in gold of one roll of a source. Used to sanity-check reward balance. */
export function expectedValue(source: MaterialSource): number {
  let total = 0
  for (const drop of dropTableFor(source)) {
    const def = BY_ID.get(drop.material)
    if (!def) continue
    total += drop.chance * ((drop.min + drop.max) / 2) * def.craftValue
  }
  return Math.round(total)
}

/**
 * Rolls one source. `salt` must be unique per event — a tile index and day for clearing,
 * an order id for a reward — so the same save always drops the same material.
 */
export function rollMaterials(
  source: RolledSource,
  seed: number,
  salt: string,
): Partial<Record<MaterialId, number>> {
  const rand = rngFor(seed, `material:${source}:${salt}`)
  const out: Partial<Record<MaterialId, number>> = {}
  for (const drop of dropTableFor(source)) {
    if (rand() >= drop.chance) continue
    bump(out, drop.material, randInt(rand, drop.min, drop.max))
  }
  return out
}

/** Merges `add` into `into` and returns a new bundle. Neither input is mutated. */
export function mergeMaterials(
  into: Partial<Record<MaterialId, number>>,
  add: Partial<Record<MaterialId, number>>,
): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = { ...into }
  for (const def of MATERIALS) {
    const count = add[def.id]
    if (count) bump(out, def.id, count)
  }
  return out
}
