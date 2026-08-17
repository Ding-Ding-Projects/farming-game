/**
 * Progression — the verbs that spend against the ladder.
 *
 * `docs/PROGRESSION.md` describes three things that pace the farm, and they live in three
 * files rather than one:
 *
 *   - `unlocks.ts` owns the **ladder**: the curve, the hundred rungs and the level rewards.
 *     It is a table and some arithmetic.
 *   - `regions.ts` owns the **map**: which rectangle of the valley is which region.
 *   - `storage.ts` owns the **stores**: which shelf a thing lives on, how full it is and what
 *     the next extension costs. It sits below `state.ts` so that `addItem` itself can consult
 *     the cap; this file sits above both.
 *   - this file owns the **verbs**: awarding experience and applying the levels it crosses,
 *     depositing against a cap, extending a store, buying land.
 *
 * Everything a caller needs is re-exported from here, so "how far along is this farm" is one
 * import rather than three. Pure per `docs/ARCHITECTURE.md`: no clock, no `Math.random` —
 * the ladder, the rewards and the prices are all closed-form functions of the level or the
 * tier, so a save replays identically without a single roll.
 */
import { FARM_W } from './constants'
import type { MaterialId, Progression, RegionDef, StoreId, UnlockId, XpSource } from './farm-types'
import { materialName, mergeMaterials } from './materials'
import { REGIONS, isRegionUnlocked, regionAt, regionById } from './regions'
import { addItem, cloneState } from './state'
import {
  STORE_CAP_STEP,
  cloneProgression,
  expansionCost,
  expansionUnlockId,
  isStoreId,
  materialCount,
  spaceCheck,
  storeName,
  storeSpace,
} from './storage'
import type { ActionResult, Fx, GameState, ItemRef, SoundId } from './types'
import {
  LEVEL_CAP,
  levelForXp,
  levelProgress,
  levelReward,
  requiredLevel,
  totalXpForLevel,
  unlockName,
  unlocksAt,
} from './unlocks'

/** The map, the stores and the ladder, forwarded so a caller asks one module about progress. */
export { REGIONS, regionAt, regionById } from './regions'
export {
  BARN_START_CAP,
  BULK_MATERIALS,
  SILO_START_CAP,
  STORE_BASE_CAP,
  STORE_CAP_STEP,
  STORE_EXPANSIONS,
  cloneProgression,
  createProgression,
  expansionCost,
  expansionTier,
  expansionUnlockId,
  expansionsLeft,
  fitCount,
  hasSpaceFor,
  isStoreId,
  materialCount,
  spaceCheck,
  spaceLeft,
  storeCapAtTier,
  storeName,
  storeOf,
  storeSpace,
} from './storage'
export type { SpaceCheck } from './storage'
export {
  LEVEL_CAP,
  MAX_LADDER_LEVEL,
  allUnlocks,
  isKnownUnlock,
  levelForXp,
  levelProgress,
  levelReward,
  requiredLevel,
  totalXpForLevel,
  unlockKind,
  unlockName,
  unlocksAt,
  unlocksOfKind,
  xpForLevel,
} from './unlocks'

/* ==================================================================== experience */

/**
 * XP per unit of doing, straight from `docs/PROGRESSION.md` §1.
 *
 * `machine` is the base of the "8 + 2 per ingredient" rule; the per-ingredient half is
 * `MACHINE_XP_PER_INGREDIENT`. Callers should go through `xpFor()` rather than reading these
 * directly, so the whole game agrees on what a thing is worth.
 */
export const XP_RATES: Record<XpSource, number> = {
  /** Per unit harvested. */
  harvest: 2,
  /** Per lot of animal produce collected. */
  collect: 5,
  /** Base for a finished machine job. */
  machine: 8,
  /** Per fulfilled delivery order. */
  order: 40,
  /** Per fulfilled boat crate. */
  crate: 150,
  /** Per rock, log or weed cleared. */
  clear: 3,
  /** Per building placed. */
  build: 25,
}

/** The "+2 per ingredient" half of the machine-job award. */
export const MACHINE_XP_PER_INGREDIENT = 2

/**
 * XP for `units` of `source`.
 *
 * For every source but `machine`, `units` is a plain count: five harvested wheat is
 * `xpFor('harvest', 5)`. For `machine`, `units` is the *ingredient count* of the recipe that
 * finished, because that award is `8 + 2 per ingredient` rather than a flat multiple.
 */
export function xpFor(source: XpSource, units = 1): number {
  const n = Math.max(0, Math.floor(units))
  if (source === 'machine') {
    return n === 0 ? 0 : XP_RATES.machine + MACHINE_XP_PER_INGREDIENT * n
  }
  return XP_RATES[source] * n
}

/**
 * A state carrying a new progression block.
 *
 * Never mutates the caller's progression and never assumes `cloneState` deep-copies it, so
 * two states can not end up quietly sharing one materials bag.
 */
function withProgression(state: GameState, progression: Progression): GameState {
  const next = cloneState(state)
  next.progression = progression
  return next
}

/**
 * Awards experience and applies every level it crosses.
 *
 * `amount` is experience, not a unit count — use `xpFor(source, units)` to turn "five wheat"
 * into ten. `source` is checked against the rate table, so a corrupt save or an invented
 * source cannot award experience the ladder was never balanced for.
 *
 * Returns **every** level crossed, in order, because a 150-XP boat crate genuinely spans more
 * than one level in the opening band and the caller has to be able to show them all rather
 * than only the last. The gold and materials of each crossed level are applied here too, so a
 * caller can neither forget the reward nor pay it twice.
 *
 * `xp` on the progression block is a lifetime total, not a per-level remainder; a level
 * recorded below what that total buys is corrected upward rather than trusted.
 */
export function grantXp(
  state: GameState,
  amount: number,
  source: XpSource,
): { state: GameState; leveled: number[] } {
  const known = Object.prototype.hasOwnProperty.call(XP_RATES, source)
  const gain = known && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
  if (gain === 0) return { state, leveled: [] }

  const progression = cloneProgression(state.progression)
  progression.xp = Math.min(totalXpForLevel(LEVEL_CAP), Math.max(0, progression.xp) + gain)

  const from = Math.max(1, Math.floor(progression.level))
  const to = Math.max(from, levelForXp(progression.xp))

  const leveled: number[] = []
  let gold = 0
  for (let level = from + 1; level <= to; level++) {
    leveled.push(level)
    const reward = levelReward(level)
    gold += reward.gold
    progression.materials = mergeMaterials(progression.materials, reward.materials)
  }
  progression.level = to

  const next = withProgression(state, progression)
  if (gold > 0) {
    next.gold += gold
    next.stats = { ...next.stats, earned: next.stats.earned + gold }
  }
  return { state: next, leveled }
}

/** Whether the farm has reached whatever `thing` needs. Unknown ids are free — see `unlocks.ts`. */
export function isUnlocked(state: GameState, thing: UnlockId): boolean {
  return state.progression.level >= requiredLevel(thing)
}

/** The line a greyed shop row prints beside the padlock: plain, never hidden. */
export function lockedNote(thing: UnlockId): string {
  return `NEEDS LEVEL ${requiredLevel(thing)}`
}

/** Everything the HUD bar needs for the current farm. `pct` is 0..1. */
export function xpProgress(state: GameState): {
  level: number
  total: number
  into: number
  need: number
  pct: number
} {
  const bar = levelProgress(state.progression.xp)
  return {
    level: Math.max(bar.level, state.progression.level),
    total: bar.total,
    into: bar.into,
    need: bar.need,
    pct: bar.need <= 0 ? 1 : Math.min(1, bar.into / bar.need),
  }
}

/** The named rungs a level-up opened, ready to print on the morning panel. */
export function levelUpNotes(levels: readonly number[]): string[] {
  const notes: string[] = []
  for (const level of levels) {
    const opened = unlocksAt(level).map(unlockName)
    const reward = levelReward(level)
    const gift = opened.length === 0 ? 'NOTHING NEW' : opened.join(', ')
    notes.push(`LEVEL ${level} - ${reward.gold}G AND ${gift}`)
  }
  return notes
}

/* ===================================================================== materials */

/** A readable "6 PLANK, 3 BOLT, 3 SCREW" for a cost or a shortfall. */
export function formatMaterials(costs: Partial<Record<MaterialId, number>>): string {
  const parts: string[] = []
  for (const id of Object.keys(costs) as MaterialId[]) {
    const n = costs[id] ?? 0
    if (n > 0) parts.push(`${n} ${materialName(id)}`)
  }
  return parts.length === 0 ? 'NOTHING' : parts.join(', ')
}

/** What the player is short of. Empty when the cost is affordable. */
export function missingMaterials(
  state: GameState,
  costs: Partial<Record<MaterialId, number>>,
): Partial<Record<MaterialId, number>> {
  const short: Partial<Record<MaterialId, number>> = {}
  for (const id of Object.keys(costs) as MaterialId[]) {
    const need = costs[id] ?? 0
    const have = materialCount(state, id)
    if (need > have) short[id] = need - have
  }
  return short
}

export function hasMaterials(state: GameState, costs: Partial<Record<MaterialId, number>>): boolean {
  return Object.keys(missingMaterials(state, costs)).length === 0
}

/**
 * Adds materials.
 *
 * Uncapped by design — clearing, orders, crates and level gifts all land here, and a caller
 * that must respect the barn's cap asks `spaceCheck` first. A gift that pushes the barn past
 * its cap simply means nothing more goes in until the player sells or extends; a reward that
 * evaporated on arrival would be far worse.
 */
export function addMaterials(
  state: GameState,
  gift: Partial<Record<MaterialId, number>>,
): GameState {
  const progression = cloneProgression(state.progression)
  progression.materials = mergeMaterials(progression.materials, gift)
  return withProgression(state, progression)
}

export function addMaterial(state: GameState, id: MaterialId, count: number): GameState {
  const n = Math.floor(count)
  if (n <= 0) return cloneState(state)
  return addMaterials(state, { [id]: n })
}

/** Spends a whole cost, or returns null and spends nothing. */
export function spendMaterials(
  state: GameState,
  costs: Partial<Record<MaterialId, number>>,
): GameState | null {
  if (!hasMaterials(state, costs)) return null
  const progression = cloneProgression(state.progression)
  for (const id of Object.keys(costs) as MaterialId[]) {
    const need = costs[id] ?? 0
    if (need <= 0) continue
    const left = (progression.materials[id] ?? 0) - need
    if (left > 0) progression.materials[id] = left
    else delete progression.materials[id]
  }
  return withProgression(state, progression)
}

/**
 * A capped deposit.
 *
 * Stores what fits and reports what did not, so the overnight pass can leave a machine's
 * output in the machine and say so in the morning rather than destroying it. Never a silent
 * drop, per `docs/PROGRESSION.md` §5.
 */
export function depositItem(
  state: GameState,
  item: ItemRef,
  count: number,
): { state: GameState; stored: number; refused: number; message: string } {
  const check = spaceCheck(state, item, count)
  const next = check.fits > 0 ? addItem(state, item, check.fits) : cloneState(state)
  return { state: next, stored: check.fits, refused: check.shortfall, message: check.message }
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function succeed(state: GameState, message: string, sound: SoundId, fx: Fx[] = []): ActionResult {
  return { state, ok: true, message, sound, fx }
}

/**
 * Buys one more shelf, with gold **and** materials that are not purchasable.
 *
 * Refusals name the store and exactly what is short, because "storage full" with no way to
 * find out what to do about it is the failure `docs/PROGRESSION.md` §2 calls out by name.
 */
export function expandStore(state: GameState, store: StoreId): ActionResult {
  if (!isStoreId(store)) return fail(state, 'THERE IS NO SUCH STORE.')

  const label = storeName(store)
  const cost = expansionCost(state, store)
  if (cost === null) {
    const cap = storeSpace(state, store).cap
    return fail(state, `THE ${label} IS ALREADY AT ITS LARGEST, ${cap}.`)
  }

  const unlock = expansionUnlockId(store)
  if (!isUnlocked(state, unlock)) {
    return fail(state, `THE ${label} CANNOT BE EXTENDED AGAIN YET - ${lockedNote(unlock)}.`)
  }

  if (state.gold < cost.gold) {
    return fail(
      state,
      `EXTENSION ${cost.tier} OF THE ${label} COSTS ${cost.gold}G AND ${formatMaterials(cost.materials)}. YOU HAVE ${state.gold}G.`,
    )
  }

  const short = missingMaterials(state, cost.materials)
  if (Object.keys(short).length > 0) {
    return fail(
      state,
      `EXTENSION ${cost.tier} OF THE ${label} NEEDS ${formatMaterials(cost.materials)}. YOU ARE SHORT ${formatMaterials(short)} - CLEAR LAND OR RUN AN ORDER.`,
    )
  }

  const spent = spendMaterials(state, cost.materials)
  if (spent === null) {
    return fail(state, `EXTENSION ${cost.tier} OF THE ${label} NEEDS ${formatMaterials(cost.materials)}.`)
  }

  const progression = cloneProgression(spent.progression)
  if (store === 'silo') progression.siloCap += STORE_CAP_STEP
  else progression.barnCap += STORE_CAP_STEP

  const next = withProgression(spent, progression)
  next.gold -= cost.gold
  next.stats = { ...next.stats, spent: next.stats.spent + cost.gold }

  const grown = store === 'silo' ? progression.siloCap : progression.barnCap
  return succeed(next, `THE ${label} NOW HOLDS ${grown}.`, 'buy')
}

/* ========================================================================== land */

export function ownsRegion(state: GameState, regionId: string): boolean {
  return isRegionUnlocked(state.progression, regionId)
}

/**
 * Whether the player may work this tile at all. Placement, clearing and sowing gate on this;
 * a tile in a region that has not been bought is the `locked-region` placement reason.
 */
export function isTileOwned(state: GameState, x: number, y: number): boolean {
  const region = regionAt(x, y)
  return region !== null && ownsRegion(state, region.id)
}

/** Regions still to buy, nearest on the ladder first. Shown with their level, never hidden. */
export function regionsForSale(state: GameState): RegionDef[] {
  return REGIONS.filter((r) => !ownsRegion(state, r.id)).sort(
    (a, b) => a.level - b.level || a.cost - b.cost || a.id.localeCompare(b.id),
  )
}

/** A few sparkles across the new ground, so buying land lands as an event. */
function regionFx(region: RegionDef): Fx[] {
  const spots: ReadonlyArray<readonly [number, number]> = [
    [region.x0, region.y0],
    [region.x1, region.y0],
    [region.x0, region.y1],
    [region.x1, region.y1],
    [Math.floor((region.x0 + region.x1) / 2), Math.floor((region.y0 + region.y1) / 2)],
  ]
  return spots.map(([x, y]) => ({ kind: 'sparkle', index: y * FARM_W + x }))
}

/**
 * Buys a region: a level, gold **and** land deeds, all three.
 *
 * Deeds are the binding constraint by design. The ladder gifts sixteen across a hundred
 * levels against the eighteen the seven bought regions cost, so the last of the valley needs
 * boat crates as well as a good season. Land is the one thing gold alone can never finish,
 * which is what keeps it a plan rather than a purchase.
 */
export function buyRegion(state: GameState, regionId: string): ActionResult {
  const region = regionById(regionId)
  if (region === undefined) return fail(state, 'THERE IS NO SUCH PLOT.')
  if (ownsRegion(state, region.id)) return fail(state, `${region.name} IS ALREADY YOURS.`)

  if (state.progression.level < region.level) {
    return fail(state, `THE TOWN WILL NOT SELL ${region.name} YET - NEEDS LEVEL ${region.level}.`)
  }
  if (state.gold < region.cost) {
    return fail(state, `${region.name} COSTS ${region.cost}G. YOU HAVE ${state.gold}G.`)
  }

  const held = materialCount(state, 'deed')
  if (held < region.deeds) {
    return fail(
      state,
      `${region.name} NEEDS ${region.deeds} ${materialName('deed')}, YOU HAVE ${held} - LEVELS AND BOAT CRATES BRING THEM.`,
    )
  }

  const spent = spendMaterials(state, { deed: region.deeds })
  if (spent === null) {
    return fail(state, `${region.name} NEEDS ${region.deeds} ${materialName('deed')}.`)
  }

  const progression = cloneProgression(spent.progression)
  progression.unlockedRegions = [...progression.unlockedRegions, region.id]

  const next = withProgression(spent, progression)
  next.gold -= region.cost
  next.stats = { ...next.stats, spent: next.stats.spent + region.cost }

  return succeed(next, `${region.name} IS YOURS. CLEAR IT AND WORK IT.`, 'buy', regionFx(region))
}
