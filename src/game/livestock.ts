/**
 * Livestock — the animal lifecycle and its overnight pass. `docs/GAMEPLAY.md` §2.
 *
 * Pure, per `docs/ARCHITECTURE.md`: no canvas, no DOM, no clock, no `Math.random`. Every
 * roll goes through `rngFor(seed, salt)` or the generator the overnight pass is handed, so
 * a save always replays identically.
 *
 * The shape of a day, from the animal's side:
 *
 *   morning  the player feeds — hay from the silo, or free grass if the beast is out in a
 *            green season — pets, and collects whatever is ready
 *   day      an animal let out grazes: free food, and a small risk it does not come back in
 *   night    `nightlyLivestock` feeds anything the player did not, docks friendship for what
 *            it could not feed, ticks the produce clocks, and brings the herd in
 *
 * **In winter nothing grazes.** Every animal eats stored hay, which is what makes cutting
 * grass through autumn matter and a first winter tight — see `hayCapacity` and `cutGrass`.
 *
 * Friendship (0..1000) is the spine. It rises with hands-on care, leaks on a day with no
 * fuss at all, and falls hard on hunger or a night in the cold. It drives both how much an
 * animal gives and how good it is, and below `MISERABLE` it gives nothing. Every refusal
 * names the animal and the reason; a shortfall this system cannot explain is a defect.
 *
 * The species table lives in `species.ts` and the housing table in `buildings.ts`. Nothing
 * about either is repeated here — this module only knows what happens to an animal.
 */
import type { ActionResult, Fx, GameState, ItemRef, Quality, Season, SoundId } from './types'
import type { Animal, BuildingKind, SpeciesDef, SpeciesId } from './farm-types'
import { ACTION_MINUTES, DAY_END } from './constants'
import { SILO_HAY_CAPACITY, buildingDef } from './buildings'
import { buildingAt } from './placement'
import { depositItem, grantXp, spaceLeft, storeName, xpFor } from './progression'
import { firstProduceDays, speciesById } from './species'
import { randInt, rngFor } from './rng'
import { tileIndex } from './state'

/* --------------------------------------------------------------------- balance */

/**
 * Friendship a bought animal arrives with: it does not know you yet, and it is a long way
 * from the 1,000 that buys the best yields.
 */
export const START_FRIENDSHIP = 150
export const MAX_FRIENDSHIP = 1000

/** Below this an animal is too miserable to give anything at all. */
export const MISERABLE = 80
/** Below this it still gives, but a unit less of it. */
export const SULKY = 300

/**
 * What a day moves friendship by.
 *
 * Hand-feeding and petting together are +30, so a tended animal climbs from 150 to devoted
 * in about a season. The trough is +2 — being fed by a machine is not the same as being
 * cared for — so a player who only ever fills the silo drifts down at 3 a day and watches
 * the yield fall with it. Hunger at -35 and a night out at -25 are the real punishments,
 * and both are recoverable inside a week of proper care.
 */
const HAND_FEED_GAIN = 12
const AUTO_FEED_GAIN = 8
const TROUGH_GAIN = 2
const GRAZE_GAIN = 4
const PET_GAIN = 18
const COLLECT_GAIN = 2
/** The slow leak: a day that passed without a hand on the animal. */
const NEGLECT_LEAK = 5
const UNFED_LOSS = 35
const OUTSIDE_LOSS = 25
const UNWELL_LOSS = 10
const NURSED_GAIN = 6

/**
 * Hay cut from one tile of sward, before the roll of ±1.
 *
 * Autumn grass is the thick stuff, which is the point: at 3 energy a swing a full day of
 * scything cuts about 33 tiles, so an autumn day yields roughly 165 hay and two of them
 * fill a silo. Four chickens cost 112 hay to winter, four cows 224 — so a herd of any size
 * needs several days given over to hay before the first snow, or a second silo, or both.
 */
const HAY_PER_CUT: Record<Season, number> = {
  spring: 3,
  summer: 3,
  fall: 5,
  winter: 0,
}

const CUT_ENERGY = 3
const FEED_ENERGY = 1
const COLLECT_ENERGY = 1

/**
 * Days a young animal needs before it gives anything, per species.
 *
 * Not a field on the frozen `SpeciesDef`, so it lives here, beside the lifecycle that is
 * the only thing that reads it. A bird ages in fast, a large animal slowly, and the pig
 * slowest of all — the same order as the price, so the expensive animal is also the one
 * that takes longest to earn back.
 */
const AGE_IN: Record<SpeciesId, number> = {
  chicken: 2,
  duck: 3,
  turkey: 4,
  goose: 4,
  rabbit: 4,
  cow: 5,
  goat: 5,
  sheep: 5,
  pig: 6,
  bee: 2,
  fish: 3,
  horse: 0,
}

/** Product ids that read wrong with an S on the end. */
const UNCOUNTABLE: ReadonlySet<string> = new Set([
  'wool',
  'angora-wool',
  'milk',
  'goat-milk',
  'down',
  'bacon',
  'fish',
  'roe',
  'honeycomb',
])

/* --------------------------------------------------------------------- lookups */

/** Days this species needs before it produces anything. Three for an unknown id. */
export function ageInDays(species: SpeciesId): number {
  return AGE_IN[species] ?? 3
}

export function animalById(state: GameState, id: string): Animal | undefined {
  return state.animals.find((a) => a.id === id)
}

/** Everyone living in one building, in the order they were bought. */
export function animalsIn(state: GameState, buildingId: string): Animal[] {
  return state.animals.filter((a) => a.buildingId === buildingId)
}

/** True when this building kind will take this species in. */
export function housesSpecies(kind: BuildingKind, species: SpeciesId): boolean {
  const def = buildingDef(kind)
  return def !== undefined && def.capacity > 0 && def.species.includes(species)
}

/** Fodder the farm can physically hold: one silo, one silo's worth. */
export function hayCapacity(state: GameState): number {
  return state.buildings.filter((b) => b.kind === 'silo').length * SILO_HAY_CAPACITY
}

/**
 * Room for more hay, and which limit binds.
 *
 * Two things cap fodder and both are real: the silos standing on the farm, and the silo
 * *store* of `docs/PROGRESSION.md` §2, which hay shares with crops and seed. Whichever is
 * tighter is the one the refusal has to name, or the player is left guessing which wall
 * they hit.
 */
export function hayRoom(state: GameState): { room: number; limit: 'none' | 'silo' | 'store' } {
  const built = hayCapacity(state)
  if (built <= 0) return { room: 0, limit: 'none' }
  const inSilos = Math.max(0, built - Math.max(0, Math.floor(state.hay)))
  const inStore = spaceLeft(state, 'silo')
  if (inStore < inSilos) return { room: inStore, limit: 'store' }
  return { room: inSilos, limit: 'silo' }
}

/** Nothing grazes in winter. That is the whole reason a silo exists. */
export function canGraze(season: Season): boolean {
  return season !== 'winter'
}

/** A one-word read on how an animal feels, for the shell to show beside its name. */
export function friendshipLabel(friendship: number): string {
  if (friendship >= 900) return 'DEVOTED'
  if (friendship >= 700) return 'FOND'
  if (friendship >= 450) return 'SETTLED'
  if (friendship >= SULKY) return 'WARY'
  if (friendship >= MISERABLE) return 'SULKY'
  return 'MISERABLE'
}

/** True when `collectProduce` would hand something over right now. */
export function isProduceReady(state: GameState, animal: Animal): boolean {
  const def = speciesById(animal.species)
  if (!def || def.produces.length === 0) return false
  if (animal.daysUntilProduce > 0) return false
  if (animal.unwell || animal.friendship < MISERABLE) return false
  if (def.requiresOutside && (!animal.outside || !canGraze(state.season))) return false
  return true
}

/* --------------------------------------------------------------------- helpers */

function refuse(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function done(state: GameState, message: string, sound: SoundId, fx: Fx[]): ActionResult {
  return { state, ok: true, message, sound, fx }
}

/**
 * A working copy. Only the fields this module writes are cloned; everything else rides
 * across on the spread, so a field another lane adds to `GameState` survives a livestock
 * action untouched.
 */
function edit(state: GameState): GameState {
  return {
    ...state,
    animals: state.animals.map((a) => ({ ...a })),
    stats: { ...state.stats },
  }
}

function spend(s: GameState, energy: number): void {
  s.energy = Math.max(0, s.energy - energy)
  s.minutes = Math.min(DAY_END, s.minutes + ACTION_MINUTES)
  if (s.energy <= 0 || s.minutes >= DAY_END) s.passedOut = true
}

function guard(state: GameState, energy: number): string | null {
  if (state.passedOut) return 'YOU CAN BARELY STAND. GET TO BED.'
  if (state.energy < energy) return 'YOU ARE TOO TIRED FOR THAT.'
  return null
}

function clampFriendship(value: number): number {
  return Math.max(0, Math.min(MAX_FRIENDSHIP, Math.round(value)))
}

function nudge(animal: Animal, delta: number): void {
  animal.friendship = clampFriendship(animal.friendship + delta)
}

/** `duck-egg` -> `DUCK EGG`. */
function label(id: string): string {
  return id.replace(/[-_]/g, ' ').toUpperCase()
}

function plural(productId: string, count: number): string {
  const name = label(productId)
  if (count === 1 || UNCOUNTABLE.has(productId)) return name
  return `${name}S`
}

function animalName(animal: Animal): string {
  const trimmed = animal.name.trim().toUpperCase()
  return trimmed.length > 0 ? trimmed : 'THAT ANIMAL'
}

function buildingName(kind: BuildingKind): string {
  const def = buildingDef(kind)
  return def ? def.name : label(kind)
}

/** The tile a building sits on, for particle effects. Null when the building is gone. */
function homeTile(state: GameState, buildingId: string): number | null {
  const building = state.buildings.find((b) => b.id === buildingId)
  if (!building) return null
  return tileIndex(building.x, building.y)
}

function fxAt(state: GameState, animal: Animal, kind: Fx['kind']): Fx[] {
  const index = homeTile(state, animal.buildingId)
  return index === null ? [] : [{ kind, index }]
}

/** The primary product's cadence: what `daysUntilProduce` is reset to after a collection. */
function cadence(def: SpeciesDef): number {
  return Math.max(1, firstProduceDays(def))
}

/* ----------------------------------------------------------------------- yield */

/** Units of one product per collection, before friendship's bonus. Capped so nothing floods. */
function baseYield(everyDays: number): number {
  return Math.max(1, Math.min(3, Math.round(everyDays / 2)))
}

/**
 * Yield rides on friendship: a sulky animal drops a unit, a devoted one has a coin-flip at
 * an extra. Four devoted chickens therefore lay six eggs on a good morning and four on a
 * bad one, which is the "roughly one good crop plot" of `docs/GAMEPLAY.md` §6.
 */
function rollYield(rand: () => number, everyDays: number, friendship: number): number {
  const base = friendship < SULKY ? Math.max(1, baseYield(everyDays) - 1) : baseYield(everyDays)
  return base + (rand() < (friendship / MAX_FRIENDSHIP) * 0.5 ? 1 : 0)
}

/**
 * Quality rides on the same number. At zero friendship gold is impossible and silver is a
 * tenth; at 1,000 it is 30 % gold and 45 % silver, which is better than fertilized soil
 * manages and is the reward for a year of petting the same cow.
 */
function rollQuality(rand: () => number, friendship: number): Quality {
  const f = friendship / MAX_FRIENDSHIP
  const gold = 0.3 * f * f
  const silver = 0.1 + 0.35 * f
  const r = rand()
  if (r < gold) return 'gold'
  if (r < gold + silver) return 'silver'
  return 'normal'
}

/* ---------------------------------------------------------------------- buying */

/** A stable, collision-proof id: one past the highest number already in use. */
function nextAnimalId(state: GameState): string {
  let highest = 0
  for (const a of state.animals) {
    const match = /^animal(\d+)$/.exec(a.id)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `animal${highest + 1}`
}

export function buyAnimal(
  state: GameState,
  species: SpeciesId,
  buildingId: string,
  name: string,
): ActionResult {
  const stop = guard(state, 0)
  if (stop) return refuse(state, stop)

  const def = speciesById(species)
  if (!def) return refuse(state, 'NOBODY IN THE VALLEY SELLS THAT.')

  const kind = def.name.toUpperCase()
  const wanted = name.trim()
  if (wanted.length === 0) return refuse(state, `GIVE THE ${kind} A NAME FIRST.`)
  if (wanted.length > 12) {
    return refuse(state, `${wanted.toUpperCase()} IS TOO LONG A NAME - TWELVE LETTERS AT MOST.`)
  }
  if (state.animals.some((a) => a.name.trim().toUpperCase() === wanted.toUpperCase())) {
    return refuse(state, `YOU ALREADY HAVE AN ANIMAL CALLED ${wanted.toUpperCase()}.`)
  }

  if (state.progression.level < def.level) {
    return refuse(
      state,
      `${kind} COMES AT LEVEL ${def.level}. YOU ARE LEVEL ${state.progression.level}.`,
    )
  }

  const building = state.buildings.find((b) => b.id === buildingId)
  if (!building) return refuse(state, `THERE IS NO HOME READY FOR ${wanted.toUpperCase()}.`)

  const home = buildingName(building.kind)
  if (!housesSpecies(building.kind, def.id)) {
    const proper = def.housedIn.length > 0 ? buildingName(def.housedIn[0]) : 'NOWHERE'
    return refuse(state, `THE ${home} WILL NOT HOUSE A ${kind} - IT NEEDS A ${proper}.`)
  }

  const capacity = buildingDef(building.kind)?.capacity ?? 0
  const living = animalsIn(state, building.id).length
  if (living >= capacity) {
    return refuse(state, `THE ${home} IS FULL - ${living} OF ${capacity}.`)
  }

  if (state.gold < def.cost) {
    return refuse(state, `A ${kind} COSTS ${def.cost}G. YOU HAVE ${state.gold}G.`)
  }

  const s = edit(state)
  s.gold -= def.cost
  s.stats.spent += def.cost
  s.animals = [
    ...s.animals,
    {
      id: nextAnimalId(state),
      species: def.id,
      name: wanted,
      buildingId: building.id,
      age: 0,
      friendship: START_FRIENDSHIP,
      fedToday: false,
      pettedToday: false,
      // Young animals do not produce until they have aged in; the clock starts there.
      daysUntilProduce: def.produces.length === 0 ? 0 : ageInDays(def.id),
      outside: false,
      unwell: false,
    },
  ]
  spend(s, 0)

  const wait = ageInDays(def.id)
  const tail =
    def.produces.length === 0
      ? ' NOTHING TO COLLECT - BOUGHT FOR THE RIDE.'
      : wait > 0
        ? ` ${wait} DAYS BEFORE ANYTHING COMES OF IT.`
        : ''
  const index = homeTile(s, building.id)
  return done(
    s,
    `${wanted.toUpperCase()} THE ${kind} MOVES INTO THE ${home}.${tail}`,
    'buy',
    index === null ? [] : [{ kind: 'sparkle', index }],
  )
}

/* --------------------------------------------------------------------- feeding */

export function feedAnimal(state: GameState, id: string): ActionResult {
  const stop = guard(state, FEED_ENERGY)
  if (stop) return refuse(state, stop)

  const animal = animalById(state, id)
  if (!animal) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  const who = animalName(animal)
  const def = speciesById(animal.species)
  if (!def) return refuse(state, `NOBODY KNOWS WHAT ${who} EATS.`)
  if (animal.fedToday) return refuse(state, `${who} HAS ALREADY EATEN TODAY.`)

  const grazing = animal.outside && canGraze(state.season)
  const needsHay = def.hayPerDay > 0 && !grazing

  if (needsHay && state.hay < def.hayPerDay) {
    const short = def.hayPerDay - Math.max(0, Math.floor(state.hay))
    const advice = canGraze(state.season)
      ? 'CUT GRASS, OR LET HER OUT TO GRAZE.'
      : 'NOTHING GRAZES IN WINTER - THE SILO IS ALL THERE IS.'
    return refuse(state, `${who} NEEDS ${def.hayPerDay} HAY AND IS ${short} SHORT. ${advice}`)
  }

  const s = edit(state)
  const fed = s.animals.find((a) => a.id === id)
  if (!fed) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  if (needsHay) s.hay = Math.max(0, s.hay - def.hayPerDay)
  fed.fedToday = true
  nudge(fed, HAND_FEED_GAIN)
  spend(s, FEED_ENERGY)

  const message = grazing
    ? `${who} GRAZES HER FILL. NO HAY NEEDED IN ${state.season.toUpperCase()}.`
    : def.hayPerDay > 0
      ? `${who} EATS ${def.hayPerDay} HAY. ${s.hay} LEFT IN THE SILO.`
      : `${who} FORAGES FOR HERSELF, AND IS CONTENT.`
  return done(s, message, 'plant', fxAt(s, fed, 'leaf'))
}

export function petAnimal(state: GameState, id: string): ActionResult {
  const stop = guard(state, 0)
  if (stop) return refuse(state, stop)

  const animal = animalById(state, id)
  if (!animal) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  const who = animalName(animal)
  if (animal.pettedToday) return refuse(state, `${who} HAS HAD HER FUSS TODAY ALREADY.`)

  const s = edit(state)
  const pet = s.animals.find((a) => a.id === id)
  if (!pet) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  pet.pettedToday = true
  nudge(pet, PET_GAIN)
  spend(s, 0)

  const message = pet.unwell
    ? `${who} IS OFF COLOUR BUT LEANS INTO IT. FEED HER TODAY TOO AND SHE WILL MEND.`
    : `${who} LEANS INTO YOUR HAND. ${friendshipLabel(pet.friendship)}, ${pet.friendship}/1000.`
  return done(s, message, 'select', fxAt(s, pet, 'sparkle'))
}

/**
 * Out to pasture: free food in a green season, and the reason to keep a field of grass.
 * An animal out at nightfall usually finds its own way in — but a wary one may not, which
 * is `nightlyLivestock`'s business.
 */
export function letOut(state: GameState, id: string): ActionResult {
  const stop = guard(state, 0)
  if (stop) return refuse(state, stop)

  const animal = animalById(state, id)
  if (!animal) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  const who = animalName(animal)
  if (animal.outside) return refuse(state, `${who} IS ALREADY OUT IN THE FIELD.`)
  if (animal.unwell) return refuse(state, `${who} IS UNWELL AND STAYS IN THE WARM TODAY.`)
  if (!canGraze(state.season)) {
    return refuse(state, `THE FIELD IS UNDER SNOW. ${who} STAYS IN - NOTHING GRAZES IN WINTER.`)
  }
  if (state.weather === 'storm') return refuse(state, `THE STORM WOULD FRIGHTEN ${who}.`)
  if (!state.tiles.some((t) => t.ground === 'grass')) {
    return refuse(state, `THERE IS NO GRASS LEFT FOR ${who} TO EAT.`)
  }

  const s = edit(state)
  const out = s.animals.find((a) => a.id === id)
  if (!out) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  out.outside = true
  spend(s, 0)

  const def = speciesById(out.species)
  const tail =
    def && def.requiresOutside
      ? ' SHE ONLY FINDS ANYTHING OUT HERE.'
      : ' SHE WILL EAT HER FILL FOR NOTHING.'
  return done(s, `${who} TROTS OUT TO THE FIELD.${tail}`, 'select', fxAt(s, out, 'leaf'))
}

/* ------------------------------------------------------------------ collecting */

/**
 * `ToolId` is frozen and has no `shears`, so the shears live in the hand slot — the one
 * tool the player already switches to for picking things up. If a real shears tool is ever
 * added to `ToolId`, this function is the only line that has to change.
 */
function toolReady(state: GameState, requires: string): boolean {
  if (requires === 'shears') return state.tool === 'hand'
  return state.tool === requires
}

export function collectProduce(state: GameState, id: string): ActionResult {
  const stop = guard(state, COLLECT_ENERGY)
  if (stop) return refuse(state, stop)

  const animal = animalById(state, id)
  if (!animal) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  const who = animalName(animal)
  const def = speciesById(animal.species)
  if (!def) return refuse(state, `NOBODY KNOWS WHAT ${who} GIVES.`)

  if (def.produces.length === 0) return refuse(state, `${who} GIVES RIDES, NOT PRODUCE.`)
  if (def.requiresTool !== null && !toolReady(state, def.requiresTool)) {
    return refuse(state, `TAKE THE ${label(def.requiresTool)} IN HAND TO WORK ${who}.`)
  }
  if (animal.unwell) {
    return refuse(state, `${who} IS UNWELL AND GIVES NOTHING. FEED AND PET HER TO MEND HER.`)
  }
  if (animal.friendship < MISERABLE) {
    return refuse(
      state,
      `${who} IS MISERABLE AT ${animal.friendship}/1000 AND GIVES NOTHING. FEED AND PET HER.`,
    )
  }
  if (def.requiresOutside && !canGraze(state.season)) {
    return refuse(state, `${who} FINDS NOTHING IN FROZEN GROUND. WAIT FOR SPRING.`)
  }
  if (def.requiresOutside && !animal.outside) {
    return refuse(state, `${who} ONLY FINDS ANYTHING WHILE SHE IS OUT FORAGING. LET HER OUT.`)
  }
  if (animal.daysUntilProduce > 0) {
    const days = animal.daysUntilProduce
    const unit = days === 1 ? 'DAY' : 'DAYS'
    return refuse(
      state,
      animal.age < ageInDays(def.id)
        ? `${who} IS STILL YOUNG - ${days} ${unit} BEFORE SHE GIVES ANYTHING.`
        : `NOTHING FROM ${who} YET - ${days} ${unit} TO GO.`,
    )
  }

  const rand = rngFor(state.seed, `collect:${state.year}:${state.season}:${state.day}:${animal.id}`)

  let working: GameState = state
  const taken: string[] = []
  let refusedMessage = ''
  let gold = false
  let stored = 0

  def.produces.forEach((product, i) => {
    // The first product is the animal's daily work. The rest come round on their own
    // cycle, counted off its age, so a feather never depends on when the eggs were taken.
    const every = Math.max(1, product.everyDays)
    if (i > 0 && (animal.age <= 0 || animal.age % every !== 0)) return

    const count = rollYield(rand, every, animal.friendship)
    const quality = rollQuality(rand, animal.friendship)
    if (quality === 'gold') gold = true

    const item: ItemRef = { kind: 'product', productId: product.productId, quality }
    const put = depositItem(working, item, count)
    working = put.state
    stored += put.stored

    const prefix = quality === 'normal' ? '' : `${quality.toUpperCase()} `
    if (put.stored > 0) {
      taken.push(`${put.stored} ${prefix}${plural(product.productId, put.stored)}`)
    }
    if (put.refused > 0 && refusedMessage === '') refusedMessage = put.message
  })

  if (stored === 0 && refusedMessage !== '') {
    // Nothing fit. Nothing is taken from the animal either, so it can be collected again
    // once there is room — the produce is not destroyed and the store is named.
    return refuse(state, `${who} HAS PRODUCE WAITING. ${refusedMessage}`)
  }
  if (stored === 0) return refuse(state, `NOTHING FROM ${who} TODAY.`)

  const awarded = grantXp(working, xpFor('collect'), 'collect')
  const s = edit(awarded.state)
  const collected = s.animals.find((a) => a.id === id)
  if (!collected) return refuse(state, 'THAT ANIMAL IS NOT ON THIS FARM.')

  collected.daysUntilProduce = cadence(def)
  nudge(collected, COLLECT_GAIN)
  spend(s, COLLECT_ENERGY)

  const head = `${taken.join(' AND ')} FROM ${who}.`
  const short = refusedMessage === '' ? '' : ` ${refusedMessage}`
  const levels =
    awarded.leveled.length > 0 ? ` LEVEL ${awarded.leveled[awarded.leveled.length - 1]}!` : ''
  const fx = fxAt(s, collected, 'pop')
  if (gold && fx.length > 0) fx.push({ kind: 'sparkle', index: fx[0].index })
  return done(s, `${head}${short}${levels}`, 'harvest', fx)
}

/* ----------------------------------------------------------------------- hay */

/**
 * Scythe a tile of sward into the silo.
 *
 * Autumn grass is the thick stuff, winter grass is under snow, and with nowhere to store it
 * there is no point cutting at all. The tile is left standing — grass is pasture as well as
 * fodder, and mowing the farm bald would take the free summer feeding with it. Energy is
 * the limit on a day's hay, and the silo is the limit on a season's.
 */
export function cutGrass(state: GameState, index: number): ActionResult {
  const stop = guard(state, CUT_ENERGY)
  if (stop) return refuse(state, stop)
  if (index < 0 || index >= state.tiles.length) return refuse(state, 'THERE IS NOTHING OVER THERE.')

  if (!canGraze(state.season)) {
    return refuse(state, 'THE GRASS IS UNDER SNOW. HAY IS CUT BEFORE WINTER, NOT DURING IT.')
  }

  const tile = state.tiles[index]
  switch (tile.ground) {
    case 'grass':
      break
    case 'soil':
      return refuse(state, 'THERE IS NO GRASS ON TILLED SOIL.')
    case 'path':
      return refuse(state, 'NOTHING GROWS ON THE PATH.')
    case 'water':
      return refuse(state, 'THAT IS THE POND.')
    case 'weeds':
      return refuse(state, 'WEEDS MAKE POOR HAY. CLEAR THEM WITH THE AXE.')
    default:
      return refuse(state, 'THERE IS ONLY ROCK AND TIMBER THERE.')
  }

  if (tile.plant) return refuse(state, 'SOMETHING IS GROWING HERE, AND IT IS NOT HAY.')
  if (tile.sprinkler) return refuse(state, 'THE SPRINKLER IS IN THE WAY.')

  const covering = buildingAt(state, index)
  if (covering) return refuse(state, `THAT GRASS IS UNDER THE ${buildingName(covering.kind)}.`)

  const { room, limit } = hayRoom(state)
  if (limit === 'none') return refuse(state, 'YOU HAVE NOWHERE TO PUT HAY. BUILD A SILO FIRST.')
  if (room <= 0) {
    return limit === 'store'
      ? refuse(state, `THE ${storeName('silo')} IS FULL. SELL OR SOW SOME OF IT BEFORE YOU CUT MORE.`)
      : refuse(state, `THE SILO IS FULL AT ${hayCapacity(state)} HAY. BUILD ANOTHER ONE.`)
  }

  const rand = rngFor(state.seed, `hay:${state.year}:${state.season}:${state.day}:${index}`)
  const base = HAY_PER_CUT[state.season]
  const cut = Math.max(1, randInt(rand, base - 1, base + 1))
  const kept = Math.min(cut, room)

  const s = edit(state)
  s.hay += kept
  spend(s, CUT_ENERGY)

  const full = limit === 'store' ? `THE ${storeName('silo')} IS FULL` : 'THE SILO IS FULL'
  const message =
    kept < cut
      ? `CUT ${cut} HAY BUT ONLY ${kept} FIT - ${full}.`
      : `${kept} HAY INTO THE SILO. ${s.hay} STORED.`
  return done(s, message, 'chop', [{ kind: 'leaf', index }])
}

/* ------------------------------------------------------------------- the night */

export interface LivestockNight {
  state: GameState
  /** Animals that ate, by any route. */
  fed: number
  /** Animals that went hungry. Each is losing friendship and may have fallen ill. */
  unfed: number
  /** Animals with something newly waiting to be collected this morning. */
  produced: number
  /** Animals that are unwell this morning. */
  unwell: number
}

/**
 * The overnight pass, in the order `docs/GAMEPLAY.md` §5 sets out: animals eat, the unfed
 * lose friendship, produce clocks tick, and anything left outside is resolved.
 *
 * One deliberate departure from the letter of §5, which says silo first and then grazing:
 * grazing is tried first. Burning stored hay on an animal standing in a spring meadow would
 * empty the silo long before the winter it exists for, and the winter squeeze is the point
 * of the whole system.
 *
 * `rand` is the caller's night generator, so the entire overnight pass stays a single
 * deterministic stream off `state.seed`.
 */
export function nightlyLivestock(state: GameState, rand: () => number): LivestockNight {
  const s = edit(state)
  const green = canGraze(s.season)
  // Storms, snow and winter nights are all rough on an animal that misses the door.
  const rough = s.weather === 'storm' || s.weather === 'snow' || s.season === 'winter'

  let fed = 0
  let unfed = 0
  let produced = 0
  let unwell = 0

  for (const a of s.animals) {
    const def = speciesById(a.species)
    if (!def) continue

    // Hands-on care as it stood at the end of the day. The trough is not affection.
    const caredFor = a.fedToday && a.pettedToday
    const building = s.buildings.find((b) => b.id === a.buildingId)
    const auto = building ? (buildingDef(building.kind)?.autoFeeds ?? false) : false

    // ---- eat: grazing where the season allows it, then the silo
    let ate = false
    if (a.fedToday) {
      ate = true
    } else if (def.hayPerDay <= 0) {
      // Bees and fish feed themselves.
      ate = true
    } else if (a.outside && green) {
      ate = true
      nudge(a, GRAZE_GAIN)
    } else if (s.hay >= def.hayPerDay) {
      s.hay -= def.hayPerDay
      ate = true
      nudge(a, auto ? AUTO_FEED_GAIN : TROUGH_GAIN)
    }

    if (ate) {
      fed += 1
      a.fedToday = true
    } else {
      unfed += 1
      nudge(a, -UNFED_LOSS)
      if (rand() < 0.25 + 0.5 * (1 - a.friendship / MAX_FRIENDSHIP)) a.unwell = true
    }

    // ---- the slow leak: a day that passed with no hand on the animal
    if (!a.pettedToday) nudge(a, -NEGLECT_LEAK)

    // ---- produce clocks. A hungry, ill or miserable animal advances nothing.
    a.age += 1
    const grown = a.age >= ageInDays(def.id)
    const working = !def.requiresOutside || !grown || (a.outside && green)
    const able = ate && !a.unwell && a.friendship >= MISERABLE && working
    if (able && def.produces.length > 0 && a.daysUntilProduce > 0) {
      a.daysUntilProduce -= 1
      if (a.daysUntilProduce === 0 && grown) produced += 1
    }

    // ---- the herd comes in, or does not
    if (a.outside) {
      const f = a.friendship / MAX_FRIENDSHIP
      if (rand() < 0.06 + 0.3 * (1 - f) + (rough ? 0.15 : 0)) {
        nudge(a, -OUTSIDE_LOSS)
        if (rand() < 0.25 + 0.3 * (1 - f) + (rough ? 0.25 : 0)) a.unwell = true
      }
      a.outside = false
    }

    // ---- illness wears them down, and a day of proper care mends it
    if (a.unwell) {
      if (caredFor) {
        a.unwell = false
        nudge(a, NURSED_GAIN)
      } else {
        nudge(a, -UNWELL_LOSS)
      }
    }
    if (a.unwell) unwell += 1

    a.fedToday = false
    a.pettedToday = false
  }

  s.hay = Math.max(0, s.hay)
  return { state: s, fed, unfed, produced, unwell }
}
