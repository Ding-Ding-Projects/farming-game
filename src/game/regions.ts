/**
 * The valley, divided.
 *
 * docs/PROGRESSION.md §3: the farm starts largely unusable. The home meadow around the
 * farmhouse is yours on day one; everything past the fence belongs to the town until a
 * deed and a fee say otherwise. Buying a region reveals it and makes its tiles clearable,
 * which is what turns "I need more room" into a plan rather than a wish.
 *
 * The eight regions tile the whole 20x11 farm exactly once, with no gaps and no overlap —
 * a tile in no region could never be unlocked, which would be a silent dead zone. Each is
 * a rectangle bordering ground the player already owns, so a purchase opens one meaningful
 * contiguous field rather than a scatter of tiles.
 *
 *      x 0        7 8       13 14      19
 *   y0  +----------+----------+----------+
 *       | HOME     | MILL     | EAST     |
 *       | MEADOW   | FLATS    | ORCHARD  |
 *   y3  |          +----------+----------+
 *       |          | WILLOW   | SUNSET   |
 *   y6  |          | HOLLOW   | RIDGE    |
 *   y7  +----------+----------+----------+
 *       | SOUTH    | REED     | STONY    |
 *  y10  | PADDOCK  | BOTTOM   | END      |
 *       +----------+----------+----------+
 *
 * Pure per docs/ARCHITECTURE.md: data and geometry only.
 */
import { FARM_H, FARM_W } from './constants'
import type { Progression, RegionDef } from './farm-types'

/**
 * The eight regions, in the order they become available.
 *
 * Costs climb far faster than area — 94 gold a tile for the south paddock against 7,200
 * for the stony end — because late land competes with a barn full of machines for the
 * same gold, and land the player cannot yet fill should not be the obvious buy. The gold
 * bill totals 332,000 against the 363,450 the ladder gifts by level 100, and the deed bill
 * 18 against 21: land is affordable on levels alone and on nothing else, so gold, materials
 * and level all pull on it at once, which is the three-axis pressure
 * docs/PROGRESSION.md §6 asks for.
 */
export const REGIONS: readonly RegionDef[] = [
  {
    id: 'home-meadow',
    name: 'HOME MEADOW',
    x0: 0,
    y0: 0,
    x1: 7,
    y1: 6,
    cost: 0,
    deeds: 0,
    level: 1,
  },
  {
    id: 'south-paddock',
    name: 'SOUTH PADDOCK',
    x0: 0,
    y0: 7,
    x1: 7,
    y1: 10,
    cost: 3000,
    deeds: 1,
    level: 8,
  },
  {
    id: 'mill-flats',
    name: 'MILL FLATS',
    x0: 8,
    y0: 0,
    x1: 13,
    y1: 3,
    cost: 9000,
    deeds: 1,
    level: 16,
  },
  {
    id: 'willow-hollow',
    name: 'WILLOW HOLLOW',
    x0: 8,
    y0: 4,
    x1: 13,
    y1: 7,
    cost: 18000,
    deeds: 2,
    level: 26,
  },
  {
    id: 'reed-bottom',
    name: 'REED BOTTOM',
    x0: 8,
    y0: 8,
    x1: 13,
    y1: 10,
    cost: 32000,
    deeds: 2,
    level: 40,
  },
  {
    id: 'east-orchard',
    name: 'EAST ORCHARD',
    x0: 14,
    y0: 0,
    x1: 19,
    y1: 3,
    cost: 55000,
    deeds: 3,
    level: 54,
  },
  {
    id: 'sunset-ridge',
    name: 'SUNSET RIDGE',
    x0: 14,
    y0: 4,
    x1: 19,
    y1: 7,
    cost: 85000,
    deeds: 4,
    level: 70,
  },
  {
    id: 'stony-end',
    name: 'STONY END',
    x0: 14,
    y0: 8,
    x1: 19,
    y1: 10,
    cost: 130000,
    deeds: 5,
    level: 88,
  },
]

/** The region the farmhouse stands in. Free, and never absent from a save. */
export const STARTING_REGION = 'home-meadow'

const BY_ID: ReadonlyMap<string, RegionDef> = new Map(REGIONS.map((r) => [r.id, r]))

/** True for a region that costs nothing — owned from the first morning. */
export function isFreeRegion(region: RegionDef): boolean {
  return region.cost <= 0 && region.deeds <= 0
}

export function regionById(id: string): RegionDef | undefined {
  return BY_ID.get(id)
}

/** The region containing a tile, or null outside the farm. */
export function regionAt(x: number, y: number): RegionDef | null {
  if (x < 0 || y < 0 || x >= FARM_W || y >= FARM_H) return null
  for (const region of REGIONS) {
    if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1) return region
  }
  return null
}

/** Tiles in a region. The whole farm is 220, and the free start is 56 of them. */
export function regionTileCount(region: RegionDef): number {
  return (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1)
}

/**
 * Anything that knows which regions are owned: the progression block, a whole game state,
 * or the bare list. Callers in three different layers hold three different shapes of it
 * and none of them should have to unwrap by hand.
 */
export type RegionOwner = Progression | { progression: Progression } | readonly string[]

function ownedIds(owner: RegionOwner): readonly string[] {
  if (Array.isArray(owner)) return owner as readonly string[]
  // `Array.isArray` does not narrow a readonly array out of the union, so name the rest.
  const held = owner as Progression | { progression: Progression }
  return 'unlockedRegions' in held ? held.unlockedRegions : held.progression.unlockedRegions
}

/**
 * Is this region the player's? Free regions always are, whatever the save says, so a
 * corrupted or hand-edited `unlockedRegions` can never lock a farmer out of their own
 * front garden.
 */
export function isRegionUnlocked(owner: RegionOwner, regionId: string): boolean {
  const region = BY_ID.get(regionId)
  if (region && isFreeRegion(region)) return true
  for (const id of ownedIds(owner)) {
    if (id === regionId) return true
  }
  return false
}

/**
 * Is this tile workable ground? Out of bounds and unowned both answer false, which is
 * exactly what the `locked-region` placement reason needs.
 */
export function isTileUnlocked(owner: RegionOwner, x: number, y: number): boolean {
  const region = regionAt(x, y)
  if (region === null) return false
  return isRegionUnlocked(owner, region.id)
}

/** The regions a save starts with. */
export function startingRegions(): string[] {
  return REGIONS.filter(isFreeRegion).map((r) => r.id)
}

/** Regions still for sale, cheapest first. Drives the land page of the shop. */
export function lockedRegions(owner: RegionOwner): RegionDef[] {
  return REGIONS.filter((r) => !isRegionUnlocked(owner, r.id))
}

/** How much of the valley the player holds, in tiles. */
export function unlockedTileCount(owner: RegionOwner): number {
  let tiles = 0
  for (const region of REGIONS) {
    if (isRegionUnlocked(owner, region.id)) tiles += regionTileCount(region)
  }
  return tiles
}

/**
 * Every way the map could be wrong, as plain sentences. Empty means the valley tiles
 * exactly once with no gap, no overlap and no duplicate id — the property the rest of the
 * module quietly assumes.
 */
export function regionProblems(): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const region of REGIONS) {
    if (seen.has(region.id)) problems.push(`duplicate region id "${region.id}"`)
    seen.add(region.id)
    if (region.x0 > region.x1 || region.y0 > region.y1) {
      problems.push(`region "${region.id}" has inverted bounds`)
    }
    if (region.x0 < 0 || region.y0 < 0 || region.x1 >= FARM_W || region.y1 >= FARM_H) {
      problems.push(`region "${region.id}" runs outside the farm`)
    }
  }

  const owners = new Array<string | null>(FARM_W * FARM_H).fill(null)
  for (const region of REGIONS) {
    for (let y = Math.max(0, region.y0); y <= Math.min(FARM_H - 1, region.y1); y++) {
      for (let x = Math.max(0, region.x0); x <= Math.min(FARM_W - 1, region.x1); x++) {
        const at = y * FARM_W + x
        const held = owners[at]
        if (held !== null) problems.push(`tile ${x},${y} is in both "${held}" and "${region.id}"`)
        owners[at] = region.id
      }
    }
  }
  for (let y = 0; y < FARM_H; y++) {
    for (let x = 0; x < FARM_W; x++) {
      if (owners[y * FARM_W + x] === null) problems.push(`tile ${x},${y} is in no region`)
    }
  }

  const free = REGIONS.filter(isFreeRegion)
  if (free.length !== 1) problems.push(`expected exactly one free region, found ${free.length}`)
  else if (free[0].id !== STARTING_REGION) {
    problems.push(`the free region is "${free[0].id}", not "${STARTING_REGION}"`)
  }

  return problems
}

/** Throws if the valley does not tile cleanly. Used by the tests. */
export function assertRegionsCoverFarm(): void {
  const problems = regionProblems()
  if (problems.length > 0) throw new Error(`region map is broken:\n  ${problems.join('\n  ')}`)
}
