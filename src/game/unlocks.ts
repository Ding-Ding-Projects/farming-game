/**
 * The ladder — one hundred levels, every one of which opens something real.
 *
 * docs/PROGRESSION.md §1 sets the curve (roughly `100 x level^1.4` to the next level) and
 * the banding table; docs/CATALOG.md supplies the breadth that makes a hundred rungs
 * possible. Counted here: 33 field crops, 14 trees, 12 species, 30 factories, 20 buildings,
 * 7 regions, the two storage lines, the selling channels, the tool upgrades and 34 marquee
 * recipes — 161 unlocks across 100 levels, so the ladder never pads and never repeats.
 *
 * **The levels are not invented here.** Crops carry their level in `crops.ts`, trees in
 * `trees.ts`, species in `species.ts`, buildings in `buildings.ts`, regions in `regions.ts`;
 * every one of those rows is transcribed, not re-decided, so no two tables can disagree
 * about when a thing becomes real. This file's own choices are the factory and recipe
 * levels, which no other table has claimed, and the shape of the reward.
 *
 * Ordering is a dependency graph, not a shuffle: a building lands at or before the animal
 * that lives in it (coop 8 / chicken 8, barn 15 / cow 15, apiary 30 / bee 30), a factory at
 * or before every recipe that needs it (dairy 15 / butter 21 / cheese 41), and a crop before
 * the chain that eats it (sugarcane 16 / sugar mill 27 / molasses 29).
 *
 * Unlock ids are namespaced `kind:name`. `requiredLevel` also accepts the bare name, and
 * answers 1 for anything it has never heard of — content this file has not met is available
 * rather than permanently locked, because a lane that names its mill `machine:grain-mill`
 * should ship a usable mill, not an unreachable one.
 *
 * Pure per docs/ARCHITECTURE.md: a table, a curve and some arithmetic.
 */
import type { MaterialId, UnlockId } from './farm-types'
import { levelMaterialGift } from './materials'
import { REGIONS, isFreeRegion } from './regions'

/* ------------------------------------------------------------ the curve */

/** The ladder unlocks content up to here. Levels past it still pay gold and materials. */
export const MAX_LADDER_LEVEL = 100

/** A hard stop so a corrupt xp value cannot spin `levelForXp` forever. */
export const LEVEL_CAP = 999

/**
 * Experience from `level` to `level + 1`, rounded to a readable five.
 *
 * 100 at level 1, 2,510 at 10, 23,910 at 50, 63,095 at 100 — the contract's `100 x
 * level^1.4` read as the step to the next level. Against the earning table (2 xp a
 * harvested crop, 5 a collected egg, 8+ a machine job, 40 an order, 150 a crate) the first
 * levels fall in a day or two, the twenties want most of a season, and the last band wants
 * a farm that is genuinely running production lines rather than a plot of parsnips.
 */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level))
  return Math.round((100 * Math.pow(l, 1.4)) / 5) * 5
}

/** Total experience earned to *reach* a level. Level 1 costs nothing; you start there. */
const cumulative: number[] = [0, 0]

export function totalXpForLevel(level: number): number {
  const l = Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)))
  while (cumulative.length <= l) {
    const next = cumulative.length
    cumulative.push(cumulative[next - 1] + xpForLevel(next - 1))
  }
  return cumulative[l]
}

/** The level a lifetime total of experience buys. Never below 1. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  let level = 1
  while (level < LEVEL_CAP && xp >= totalXpForLevel(level + 1)) level++
  return level
}

/** Everything the HUD bar needs: which level, how far into it, how far to the next. */
export function levelProgress(xp: number): {
  level: number
  into: number
  need: number
  total: number
} {
  const level = levelForXp(xp)
  const base = totalXpForLevel(level)
  const need = xpForLevel(level)
  const total = Math.max(0, Number.isFinite(xp) ? Math.floor(xp) : 0)
  return { level, into: Math.max(0, total - base), need, total }
}

/* ------------------------------------------------------------ the table */

/**
 * Level N unlocks `LADDER[N - 1]`.
 *
 * 1-10   the staples, the well, the silo, the coop, the feed mill, the roadside stall
 * 11-25  the barn and dairy, the mill, the bakery, the first trees, both storage lines
 * 26-45  the loom and sewing machine, juice press, sugar mill, jam maker, tier-2 housing,
 *        the apiary and the stable
 * 46-65  pies, soup, salad, sauce, pasta, the bbq, the pond, the greenhouse, the mid trees
 * 66-85  ice cream, candy, chocolate, coffee, tea, the mine and smelter, tier-3 housing
 * 86-100 the keg, the four-step chains, the last region, the farmhouse upgrade
 */
const LADDER: readonly (readonly UnlockId[])[] = [
  /*   1 */ [
    'crop:wheat',
    'crop:carrot',
    'crop:parsnip',
    'building:farmhouse',
    'system:shipping-bin',
  ],
  /*   2 */ ['crop:lettuce', 'crop:corn'],
  /*   3 */ ['crop:potato', 'crop:barley', 'building:well'],
  /*   4 */ ['crop:radish'],
  /*   5 */ ['crop:tulip', 'crop:spinach', 'system:town-market'],
  /*   6 */ ['crop:onion', 'crop:snowdrop', 'building:silo', 'factory:feed-mill'],
  /*   7 */ ['crop:peas', 'crop:cucumber', 'crop:beet'],
  /*   8 */ ['crop:cabbage', 'building:coop', 'animal:chicken', 'region:south-paddock'],
  /*   9 */ ['crop:pepper', 'crop:winterroot'],
  /*  10 */ ['crop:tomato', 'building:stall', 'tool:can-range-1'],
  /*  11 */ ['crop:garlic'],
  /*  12 */ ['crop:strawberry', 'factory:mill', 'storage:silo-expansion'],
  /*  13 */ ['crop:grape', 'tree:raspberry'],
  /*  14 */ ['crop:chilli', 'building:barn-store', 'storage:barn-expansion'],
  /*  15 */ [
    'crop:squash',
    'tree:cherry',
    'building:barn',
    'animal:cow',
    'factory:dairy',
    'tool:milk-pail',
  ],
  /*  16 */ ['crop:sugarcane', 'region:mill-flats'],
  /*  17 */ ['tree:blackberry'],
  /*  18 */ ['crop:cotton', 'crop:frostcap', 'factory:preserves-jar'],
  /*  19 */ ['tree:apple'],
  /*  20 */ ['crop:melon', 'building:sawmill-yard', 'factory:sawmill'],
  /*  21 */ ['recipe:butter'],
  /*  22 */ ['crop:soybean', 'tree:peach', 'building:bakery', 'factory:bakery'],
  /*  23 */ ['system:delivery-orders'],
  /*  24 */ ['crop:pumpkin', 'factory:jam-maker'],
  /*  25 */ ['tree:plum'],
  /*  26 */ ['crop:rice', 'building:big-coop', 'animal:duck', 'region:willow-hollow'],
  /*  27 */ ['animal:turkey', 'factory:sugar-mill'],
  /*  28 */ ['crop:indigo'],
  /*  29 */ ['recipe:molasses'],
  /*  30 */ ['tree:lemon', 'building:apiary', 'animal:bee', 'factory:honey-extractor'],
  /*  31 */ ['factory:loom'],
  /*  32 */ ['building:stable', 'animal:horse'],
  /*  33 */ ['tree:orange'],
  /*  34 */ ['crop:snowcabbage', 'building:big-barn', 'animal:goat'],
  /*  35 */ ['factory:juice-press'],
  /*  36 */ ['animal:sheep', 'tool:shears'],
  /*  37 */ ['tree:olive'],
  /*  38 */ ['recipe:cloth'],
  /*  39 */ ['recipe:smoothie'],
  /*  40 */ ['building:workshop', 'factory:sewing-machine', 'region:reed-bottom'],
  /*  41 */ ['recipe:cheese'],
  /*  42 */ ['tree:coconut'],
  /*  43 */ ['factory:oil-press'],
  /*  44 */ ['recipe:cooking-oil'],
  /*  45 */ ['factory:dye-vat'],
  /*  46 */ ['recipe:indigo-dye'],
  /*  47 */ ['factory:pie-oven'],
  /*  48 */ ['tree:mango', 'building:pond', 'animal:fish'],
  /*  49 */ ['recipe:fruit-pie'],
  /*  50 */ ['factory:soup-kitchen'],
  /*  51 */ ['recipe:vegetable-stew'],
  /*  52 */ ['factory:salad-bar'],
  /*  53 */ ['recipe:garden-salad'],
  /*  54 */ ['tree:banana', 'factory:sauce-maker', 'region:east-orchard'],
  /*  55 */ ['building:greenhouse'],
  /*  56 */ ['factory:pasta-maker'],
  /*  57 */ ['recipe:pasta'],
  /*  58 */ ['factory:bbq-grill'],
  /*  59 */ ['recipe:ketchup'],
  /*  60 */ ['tree:cacao'],
  /*  61 */ ['factory:popcorn-pot'],
  /*  62 */ ['recipe:kettle-corn'],
  /*  63 */ ['recipe:skewer'],
  /*  64 */ ['recipe:sandwich'],
  /*  65 */ ['factory:ice-cream-maker'],
  /*  66 */ ['tree:coffee'],
  /*  67 */ ['factory:candy-machine'],
  /*  68 */ ['building:mine'],
  /*  69 */ ['recipe:sorbet'],
  /*  70 */ ['factory:smelter', 'region:sunset-ridge'],
  /*  71 */ ['factory:soap-maker'],
  /*  72 */ ['animal:goose', 'building:deluxe-coop'],
  /*  73 */ ['recipe:metal-bar'],
  /*  74 */ ['animal:rabbit', 'factory:candle-maker'],
  /*  75 */ ['recipe:scented-candle'],
  /*  76 */ ['factory:chocolate-works'],
  /*  77 */ ['recipe:chocolate-truffle'],
  /*  78 */ ['animal:pig', 'building:deluxe-barn'],
  /*  79 */ ['factory:coffee-kiosk'],
  /*  80 */ ['factory:tea-house'],
  /*  81 */ ['recipe:cake'],
  /*  82 */ ['system:boat-crates'],
  /*  83 */ ['system:credit'],
  /*  84 */ ['recipe:fabric'],
  /*  85 */ ['recipe:aged-cheese'],
  /*  86 */ ['recipe:truffle-bar'],
  /*  87 */ ['recipe:gourmet-pizza'],
  /*  88 */ ['factory:keg', 'region:stony-end'],
  /*  89 */ ['recipe:luxury-soap'],
  /*  90 */ ['building:big-farmhouse'],
  /*  91 */ ['recipe:spiced-chocolate'],
  /*  92 */ ['tool:can-range-2'],
  /*  93 */ ['recipe:vintage-wine'],
  /*  94 */ ['recipe:harvest-feast'],
  /*  95 */ ['recipe:festival-platter'],
  /*  96 */ ['recipe:silk-gown'],
  /*  97 */ ['recipe:candied-citrus'],
  /*  98 */ ['recipe:royal-banquet'],
  /*  99 */ ['recipe:golden-preserve'],
  /* 100 */ ['recipe:reserve-wine'],
]

/* -------------------------------------------------------------- lookups */

export type UnlockKind =
  | 'crop'
  | 'tree'
  | 'animal'
  | 'factory'
  | 'building'
  | 'storage'
  | 'region'
  | 'recipe'
  | 'tool'
  | 'system'

const KINDS: ReadonlySet<string> = new Set<UnlockKind>([
  'crop',
  'tree',
  'animal',
  'factory',
  'building',
  'storage',
  'region',
  'recipe',
  'tool',
  'system',
])

function bareName(id: UnlockId): string {
  const at = id.indexOf(':')
  return at < 0 ? id : id.slice(at + 1)
}

const LEVEL_BY_ID = new Map<UnlockId, number>()
/**
 * Bare name to level. A name two kinds both claim — `bakery` is a building and a factory —
 * resolves to the earliest of them, which is the answer that cannot lock content the player
 * already has. Where the two disagree about the level, `ladderProblems` says so.
 */
const LEVEL_BY_NAME = new Map<string, number>()
const NAME_CLASHES = new Map<string, number[]>()

for (let i = 0; i < LADDER.length; i++) {
  const level = i + 1
  for (const id of LADDER[i]) {
    if (!LEVEL_BY_ID.has(id)) LEVEL_BY_ID.set(id, level)
    const bare = bareName(id)
    const held = LEVEL_BY_NAME.get(bare)
    if (held === undefined) LEVEL_BY_NAME.set(bare, level)
    else {
      LEVEL_BY_NAME.set(bare, Math.min(held, level))
      const seen = NAME_CLASHES.get(bare)
      if (seen) seen.push(level)
      else NAME_CLASHES.set(bare, [held, level])
    }
  }
}

/** The kind an unlock id declares, or null if it is not namespaced with a known one. */
export function unlockKind(id: UnlockId): UnlockKind | null {
  const at = id.indexOf(':')
  if (at < 0) return null
  const kind = id.slice(0, at)
  return KINDS.has(kind) ? (kind as UnlockKind) : null
}

/** Everything level `level` opens. Empty outside 1..100. */
export function unlocksAt(level: number): UnlockId[] {
  const l = Math.floor(level)
  if (l < 1 || l > LADDER.length) return []
  return LADDER[l - 1].slice()
}

/**
 * The level something needs. Accepts the canonical `kind:name`, a bare `name` as the
 * content tables carry it (`cropById('wheat').id`), or a differently namespaced id whose
 * name the ladder knows (`machine:mill` answers for `factory:mill`). Anything genuinely
 * unknown answers 1 — see the header.
 */
export function requiredLevel(thing: UnlockId): number {
  const exact = LEVEL_BY_ID.get(thing)
  if (exact !== undefined) return exact
  return LEVEL_BY_NAME.get(bareName(thing)) ?? 1
}

/** False for anything the ladder has never heard of, which `requiredLevel` treats as free. */
export function isKnownUnlock(thing: UnlockId): boolean {
  return LEVEL_BY_ID.has(thing) || LEVEL_BY_NAME.has(bareName(thing))
}

/** Every unlock on the ladder, in level order. */
export function allUnlocks(): UnlockId[] {
  const out: UnlockId[] = []
  for (const row of LADDER) out.push(...row)
  return out
}

/** Everything of one kind, in level order — the Almanac's per-page list. */
export function unlocksOfKind(kind: UnlockKind): UnlockId[] {
  return allUnlocks().filter((id) => unlockKind(id) === kind)
}

/* ---------------------------------------------------------------- names */

const NAMES: Readonly<Record<string, string>> = {
  'crop:snowcabbage': 'SNOW CABBAGE',
  'crop:winterroot': 'WINTERROOT',
  'tree:blackberry': 'BLACKBERRY BUSH',
  'tree:raspberry': 'RASPBERRY BUSH',
  'tree:coconut': 'COCONUT PALM',
  'animal:bee': 'BEES',
  'building:stall': 'ROADSIDE STALL',
  'building:barn-store': 'BARN STORE',
  'building:big-farmhouse': 'FARMHOUSE UPGRADE',
  'factory:bakery': 'BAKERY OVEN',
  'storage:silo-expansion': 'SILO EXPANSIONS',
  'storage:barn-expansion': 'BARN EXPANSIONS',
  'tool:can-range-1': 'WIDE WATERING CAN',
  'tool:can-range-2': 'RAIN BARREL CAN',
  'tool:milk-pail': 'MILK PAIL',
  'tool:shears': 'SHEARS',
  'system:shipping-bin': 'SHIPPING BIN',
  'system:town-market': 'TOWN MARKET',
  'system:delivery-orders': 'DELIVERY ORDERS',
  'system:boat-crates': 'BOAT CRATES',
  'system:credit': 'FARM CREDIT',
}

const REGION_NAMES: ReadonlyMap<string, string> = new Map(REGIONS.map((r) => [r.id, r.name]))

function words(text: string): string {
  return text.split('-').join(' ').toUpperCase()
}

/**
 * What the shop prints beside the padlock. Derived from the id so a new rung never ships
 * nameless, with an override wherever the derivation would read badly.
 */
export function unlockName(id: UnlockId): string {
  const override = NAMES[id]
  if (override) return override
  const kind = unlockKind(id)
  const bare = bareName(id)
  switch (kind) {
    case 'tree':
      return `${words(bare)} TREE`
    case 'recipe':
      return `${words(bare)} RECIPE`
    case 'region':
      return REGION_NAMES.get(bare) ?? words(bare)
    default:
      return words(bare)
  }
}

/* --------------------------------------------------------------- reward */

/**
 * The gold half of a level reward: `100 + 50 x level`, doubled on every fifth level,
 * tripled on every tenth and quadrupled on every twenty-fifth, and nothing at all for
 * level 1 because nobody earned it. Level 5 pays 700, level 50 pays 10,400, level 100 pays
 * 20,400, and the ladder pays 363,450 across the hundred — a shade over the 332,000 the
 * seven regions cost, so the gifts could buy the valley and nothing else. Buildings, stock
 * and seed still have to come out of the farm.
 */
function goldGift(level: number): number {
  const l = Math.floor(level)
  if (l <= 1) return 0
  const base = 100 + 50 * l
  if (l % 25 === 0) return base * 4
  if (l % 10 === 0) return base * 3
  if (l % 5 === 0) return base * 2
  return base
}

/**
 * What reaching a level hands over. Defined past 100 as well: the curve continues, the
 * gifts continue, and only the unlocks run out.
 */
export function levelReward(level: number): {
  gold: number
  materials: Partial<Record<MaterialId, number>>
} {
  if (Math.floor(level) <= 1) return { gold: 0, materials: {} }
  return { gold: goldGift(level), materials: levelMaterialGift(level) }
}

/* ------------------------------------------------------------ assertion */

/**
 * Every way the ladder could be wrong, as plain sentences. The tests assert this is empty.
 *
 * An empty level is the defect docs/PROGRESSION.md §1 names outright, but a duplicated
 * unlock is just as bad — it means one of the two rungs is silently doing nothing — and so
 * is a region whose deed office and whose ladder row quote different levels.
 */
export function ladderProblems(): string[] {
  const problems: string[] = []

  if (LADDER.length !== MAX_LADDER_LEVEL) {
    problems.push(`ladder has ${LADDER.length} levels, expected ${MAX_LADDER_LEVEL}`)
  }

  const seen = new Set<UnlockId>()
  for (let level = 1; level <= LADDER.length; level++) {
    const row = LADDER[level - 1]
    if (row.length === 0) problems.push(`level ${level} unlocks nothing`)
    for (const id of row) {
      if (seen.has(id)) problems.push(`"${id}" is unlocked twice, the second time at level ${level}`)
      seen.add(id)
      if (unlockKind(id) === null) problems.push(`"${id}" at level ${level} has no known kind`)
      if (unlockName(id).trim().length === 0) problems.push(`"${id}" has no name`)
    }
  }

  for (const [bare, levels] of NAME_CLASHES) {
    const first = levels[0]
    if (levels.some((l) => l !== first)) {
      problems.push(`bare name "${bare}" is claimed at levels ${levels.join(' and ')}`)
    }
  }

  // Land: every purchasable region appears once, at exactly the level its deed office quotes.
  for (const region of REGIONS) {
    const id = `region:${region.id}`
    if (isFreeRegion(region)) {
      if (LEVEL_BY_ID.has(id)) problems.push(`free region "${region.id}" should not be on the ladder`)
      continue
    }
    const level = LEVEL_BY_ID.get(id)
    if (level === undefined) problems.push(`region "${region.id}" is never unlocked`)
    else if (level !== region.level) {
      problems.push(`region "${region.id}" gates at level ${region.level} but unlocks at ${level}`)
    }
  }

  // Both stores must be expandable, or one of them is a wall with no door.
  for (const store of ['silo', 'barn']) {
    if (!LEVEL_BY_ID.has(`storage:${store}-expansion`)) {
      problems.push(`the ${store} can never be expanded`)
    }
  }

  // Rewards must be real at every rung past the first, or a level up is a message with
  // nothing behind it.
  for (let level = 2; level <= MAX_LADDER_LEVEL; level++) {
    if (levelReward(level).gold <= 0) problems.push(`level ${level} pays no gold`)
  }

  return problems
}

/** Throws with the full list if any level is empty or any unlock is doubled up. */
export function assertLadderComplete(): void {
  const problems = ladderProblems()
  if (problems.length > 0) throw new Error(`unlock ladder is broken:\n  ${problems.join('\n  ')}`)
}
