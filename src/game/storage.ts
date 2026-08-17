/**
 * The two stores, and the progression block they live on.
 *
 * Split out of `progression.ts` so that `state.ts` can ask "does this fit?" before it puts
 * anything in the bag. `progression.ts` needs `addItem`, `addItem` needs the caps, and a
 * module cannot need itself — this file holds the half of the answer that does not touch the
 * bag, and `progression.ts` re-exports every name here so callers still ask one module about
 * progress.
 *
 * Pure per `docs/ARCHITECTURE.md`: closed-form arithmetic over the state it is handed.
 */
import { BARN_STORE_BONUS } from './buildings'
import type { MaterialId, Progression, StoreId, UnlockId } from './farm-types'
import { itemName } from './items'
import { startingRegions } from './regions'
import type { GameState, ItemRef } from './types'

/* ===================================================================== materials */

/**
 * Materials that take up room in the barn store.
 *
 * Deeds, mallets, axe heads and saws are papers and hand tools kept in the farmhouse: a
 * single land deed occupying a barn slot is pedantry, not tension. Everything bulky counts,
 * which is what makes clearing a region a storage decision as well as a land one.
 */
export const BULK_MATERIALS: readonly MaterialId[] = [
  'wood',
  'stone',
  'fibre',
  'plank',
  'bolt',
  'screw',
  'nail',
  'tape',
]

export function materialCount(state: GameState, id: MaterialId): number {
  return state.progression.materials[id] ?? 0
}

/* ======================================================================= storage */

/** Silo: crops and seeds. Tight on purpose — the first wall lands in the first season. */
export const SILO_START_CAP = 150

/** Barn store: animal produce, artisan goods, purchased supplies and the bulk materials. */
export const BARN_START_CAP = 200

export const STORE_BASE_CAP: Record<StoreId, number> = {
  silo: SILO_START_CAP,
  barn: BARN_START_CAP,
}

/** Capacity one extension adds, per `docs/PROGRESSION.md` §2. */
export const STORE_CAP_STEP = 25

/**
 * Extensions a player may buy per store: the silo runs 150 to 650, the barn 200 to 700, and
 * a Barn store building adds its own 100 on top of the barn's ceiling.
 */
export const STORE_EXPANSIONS: Record<StoreId, number> = { silo: 20, barn: 20 }

/** The rung on `unlocks.ts`'s ladder that opens extensions for a store. */
export function expansionUnlockId(store: StoreId): UnlockId {
  return `storage:${store}-expansion`
}

/** Capacity a store holds once `tier` extensions are built, before any building bonus. */
export function storeCapAtTier(store: StoreId, tier: number): number {
  const t = Math.max(0, Math.min(STORE_EXPANSIONS[store], Math.floor(tier)))
  return STORE_BASE_CAP[store] + t * STORE_CAP_STEP
}

const STORE_NAME: Record<StoreId, string> = {
  silo: 'SILO',
  barn: 'BARN STORE',
}

export function storeName(store: StoreId): string {
  return STORE_NAME[store]
}

export function isStoreId(store: string): store is StoreId {
  return store === 'silo' || store === 'barn'
}

/**
 * Which store an item lives in.
 *
 * Crops and seeds go to the silo. Animal produce, every factory product, the purchased goods
 * and the bulk materials go to the barn store. `docs/PROGRESSION.md` §2.
 */
export function storeOf(item: ItemRef): StoreId {
  switch (item.kind) {
    case 'seed':
    case 'produce':
      return 'silo'
    case 'product':
    case 'material':
    case 'good':
      return 'barn'
  }
}

/** Capacity the standing buildings contribute on top of whatever the player has paid for. */
function buildingBonus(state: GameState, store: StoreId): number {
  if (store !== 'barn') return 0
  let stores = 0
  for (const building of state.buildings) {
    if (building.kind.toLowerCase() === 'barn-store') stores++
  }
  return stores * BARN_STORE_BONUS
}

/**
 * How many expansions have been paid for.
 *
 * Derived from the cap with the building bonus taken back out, because a Barn store raises
 * `barnCap` too and counting its 100 as four purchased tiers would mis-price and mis-gate
 * every later extension.
 */
export function expansionTier(state: GameState, store: StoreId): number {
  const cap = store === 'silo' ? state.progression.siloCap : state.progression.barnCap
  const paid = cap - buildingBonus(state, store) - STORE_BASE_CAP[store]
  return Math.max(0, Math.min(STORE_EXPANSIONS[store], Math.round(paid / STORE_CAP_STEP)))
}

/** Extensions still available for a store. */
export function expansionsLeft(state: GameState, store: StoreId): number {
  return STORE_EXPANSIONS[store] - expansionTier(state, store)
}

/**
 * How full a store is, and how full it may get.
 *
 * Bulk materials count against the barn: a barn stacked with logs is a barn that cannot take
 * the milk, and that is exactly the pressure that makes clearing a region a decision rather
 * than a formality.
 *
 * **Hay does not count against the silo cap.** `docs/PROGRESSION.md` §2 lists hay under the
 * silo, but `docs/GAMEPLAY.md` §1 gives the Silo *building* a hard 240-hay capacity, and
 * `livestock.ts` already enforces that on every cut. Counting it in both places would mean a
 * full hayloft silently ate the crop shelf and `cutGrass` refused for a reason the player
 * could not see. Hay is capped by silos; this cap governs the crop-and-seed shelf.
 *
 * `used` may exceed `cap` after a level gift or a demolition refund. That is not a broken
 * state: it means nothing more goes in until the player sells or extends.
 */
export function storeSpace(state: GameState, store: StoreId): { used: number; cap: number } {
  let used = 0
  for (const entry of state.inventory) {
    if (entry.count > 0 && storeOf(entry.item) === store) used += entry.count
  }
  if (store === 'barn') {
    for (const id of BULK_MATERIALS) used += materialCount(state, id)
  }
  const raw = store === 'silo' ? state.progression.siloCap : state.progression.barnCap
  return { used, cap: Math.max(0, Math.floor(raw)) }
}

/** Room left in a store. Never negative. */
export function spaceLeft(state: GameState, store: StoreId): number {
  const { used, cap } = storeSpace(state, store)
  return Math.max(0, cap - used)
}

/** The full verdict on a deposit, so a refusal can name the store and the shortfall. */
export interface SpaceCheck {
  ok: boolean
  store: StoreId
  used: number
  cap: number
  /** Units that fit. Equal to the requested count when `ok`. */
  fits: number
  /** Units over the cap. Zero when `ok`. */
  shortfall: number
  /** Empty when `ok`; otherwise names the store, the item and what to do about it. */
  message: string
}

export function spaceCheck(state: GameState, item: ItemRef, count: number): SpaceCheck {
  const store = storeOf(item)
  const { used, cap } = storeSpace(state, store)
  const want = Math.max(0, Math.floor(count))
  const free = Math.max(0, cap - used)
  const fits = Math.min(want, free)
  const shortfall = want - fits
  if (shortfall === 0) {
    return { ok: true, store, used, cap, fits, shortfall: 0, message: '' }
  }
  const label = storeName(store)
  const room = free === 0 ? 'IS FULL' : `HAS ROOM FOR ONLY ${free}`
  return {
    ok: false,
    store,
    used,
    cap,
    fits,
    shortfall,
    message: `THE ${label} ${room} AT ${used} OF ${cap} - ${itemName(item)} X${want} IS ${shortfall} OVER. SELL SOME OR EXTEND THE ${label}.`,
  }
}

/** Ask before you add. Every caller that deposits an item must call this first. */
export function hasSpaceFor(state: GameState, item: ItemRef, count: number): boolean {
  return spaceCheck(state, item, count).ok
}

/** How many of `count` would actually fit. For a partial deposit the machine holds the rest. */
export function fitCount(state: GameState, item: ItemRef, count: number): number {
  return spaceCheck(state, item, count).fits
}

/**
 * Gold and materials for a store's next extension, or null when every tier is built.
 *
 * Priced on the **tier** rather than on the cap, so the Barn store building's bonus capacity
 * can never distort it. The first extension is 500g, 6 planks, 3 bolts and 3 screws; the
 * twentieth is 44,721g, 63 planks and 22 of each fitting.
 *
 * Planks come from the Sawmill, but bolts and screws are never bought and never milled — they
 * come only from clearing, orders and crates. The ladder's own gifts land one bolt short of
 * the first extension at the level that unlocks it, which is deliberate: the first storage
 * wall arrives in the opening season, on a starting plot that out-yields 150 units well
 * before summer, and it cannot be extended away on the spot. Selling is the answer that day.
 * Extending is the answer a fortnight later. That is `docs/PROGRESSION.md` §6.
 */
export function expansionCost(
  state: GameState,
  store: StoreId,
): { tier: number; gold: number; materials: Partial<Record<MaterialId, number>> } | null {
  const tier = expansionTier(state, store)
  if (tier >= STORE_EXPANSIONS[store]) return null
  return {
    tier: tier + 1,
    gold: Math.round(500 * Math.pow(tier + 1, 1.5)),
    materials: { plank: 6 + 3 * tier, bolt: 3 + tier, screw: 3 + tier },
  }
}

/* ======================================================================= opening */

/** The progression a new farm starts with: level 1, no materials, the free regions only. */
export function createProgression(): Progression {
  return {
    level: 1,
    xp: 0,
    unlockedRegions: startingRegions(),
    materials: {},
    siloCap: STORE_BASE_CAP.silo,
    barnCap: STORE_BASE_CAP.barn,
  }
}

/** A detached copy of the progression block. */
export function cloneProgression(progression: Progression): Progression {
  return {
    level: progression.level,
    xp: progression.xp,
    unlockedRegions: progression.unlockedRegions.slice(),
    materials: { ...progression.materials },
    siloCap: progression.siloCap,
    barnCap: progression.barnCap,
  }
}
