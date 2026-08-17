/**
 * Factories: the queue, the three player verbs and the overnight production pass.
 * `docs/GAMEPLAY.md` §3, `docs/PROGRESSION.md` §§1, 2 and 5.
 *
 * A machine holds a queue of jobs and works the head of it first. Inserting a recipe takes
 * its ingredients at once — the job is paid for the moment it is queued — so every refusal
 * has to happen *before* anything moves, and a refusal for want of ingredients has to name
 * exactly what is short and by how many. That is what `canRun` is for, and the insert verb
 * renders its list rather than inventing a second, vaguer one.
 *
 * Hours tick down through the overnight pass, `HOURS_PER_NIGHT` a night, and the hours a
 * finished job does not need pass straight to the job behind it. That is what makes a queue
 * worth filling: four four-hour jobs all come out of one night, while the keg sits on one
 * job for several. A queue is therefore visible time, and the machine panel shows it.
 *
 * **Quality carries through the chain.** The grade of the output follows the best ingredient
 * the machine was fed, so a gold melon makes gold jam makes a gold pie. The machine takes
 * exactly one unit of that best grade to set the mark and fills the rest of the recipe from
 * the cheapest stock it can — one gold fruit grades a whole batch and the player keeps the
 * rest of theirs to sell. That is strictly the better deal for the player every time, since
 * a product's base price is always above the sum of its ingredients: half again on the
 * bigger number beats half again on the smaller one.
 *
 * Nothing here rolls. What a machine produces is fully determined by what went into it, so
 * `rngFor` is never needed and a save replays a night of production exactly.
 *
 * A finished job that will not fit in the barn is held in the machine and reported blocked.
 * Destroying a player's output to keep the arithmetic tidy is never acceptable.
 */
import { FARM_W } from './constants'
import { MACHINES } from './factories'
import { canPlace, placementMessage } from './placement'
import {
  depositItem,
  formatMaterials,
  grantXp,
  missingMaterials,
  requiredLevel,
  spendMaterials,
  xpFor,
} from './progression'
import { cloneState, countItem, itemKey, itemName, removeItem } from './state'
import type {
  Footprint,
  Machine,
  MachineDef,
  MachineJob,
  MachineKind,
  Recipe,
} from './farm-types'
import type { ActionResult, Fx, GameState, ItemRef, Quality, SoundId } from './types'

/** In-game hours a machine works while the farmer sleeps. One night is one working day. */
export const HOURS_PER_NIGHT = 24

/** A machine stands on exactly one tile, so its placement footprint is a single square. */
const MACHINE_FOOTPRINT: Footprint = { w: 1, h: 1 }

/** Cheapest grade first: a recipe is filled from the bottom of the stack up. */
const FILL_ORDER: readonly Quality[] = ['normal', 'silver', 'gold']

const QUALITY_RANK: Record<Quality, number> = { normal: 0, silver: 1, gold: 2 }

/* ------------------------------------------------------------- result helpers */

function refuse(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function done(state: GameState, message: string, sound: SoundId, fx: Fx[]): ActionResult {
  return { state, ok: true, message, sound, fx }
}

/* --------------------------------------------------------- catalogue lookups */

/** The definition behind a machine kind, or null when the catalogue does not carry it. */
export function machineDefFor(kind: MachineKind): MachineDef | null {
  for (const def of MACHINES) {
    if (def.kind === kind) return def
  }
  return null
}

/** One recipe of one machine kind. A recipe id is only meaningful against its machine. */
export function recipeFor(kind: MachineKind, recipeId: string): Recipe | null {
  const def = machineDefFor(kind)
  if (def === null) return null
  for (const recipe of def.recipes) {
    if (recipe.id === recipeId) return recipe
  }
  return null
}

/**
 * The level a machine really needs: the catalogue's own number, and the ladder's, whichever
 * is later. The two are meant to agree — `requiredLevel` answers 1 for an id the ladder has
 * never heard of, so a catalogue kind the ladder does not gate falls back to its own level
 * rather than becoming free.
 */
export function machineLevel(def: MachineDef): number {
  return Math.max(def.level, requiredLevel(`factory:${def.kind}`))
}

/** As `machineLevel`, for one recipe. Deep recipes are rungs on the ladder in their own right. */
export function recipeLevel(recipe: Recipe): number {
  return Math.max(
    recipe.level,
    requiredLevel(`recipe:${recipe.id}`),
    requiredLevel(`recipe:${recipe.outputProductId}`),
  )
}

/** Every recipe a machine can run at the player's current level. */
export function recipesAvailable(state: GameState, kind: MachineKind): Recipe[] {
  const def = machineDefFor(kind)
  if (def === null) return []
  return def.recipes.filter((recipe) => state.progression.level >= recipeLevel(recipe))
}

/* ----------------------------------------------------------- machine lookups */

/**
 * The machine standing on a tile, or null.
 *
 * `state.machines` is the single source of truth for occupancy and this is the reader
 * everything else uses; `Tile.machineId` mirrors it for the renderer.
 */
export function machineAt(state: GameState, index: number): Machine | null {
  // `state.machines` is the source of truth; `tile.machineId` is the mirror it writes.
  for (const machine of state.machines) {
    if (machine.index === index) return machine
  }
  return null
}

/** The machine with an id, or null. */
export function machineById(state: GameState, id: string): Machine | null {
  for (const machine of state.machines) {
    if (machine.id === id) return machine
  }
  return null
}

/** What the machine panel shows: what is cooking, what waits behind it, and how long. */
export interface MachineStatus {
  kind: MachineKind
  name: string
  /** The job in progress, or null when the machine is idle. */
  active: MachineJob | null
  /** What the job in progress will come out as, at the grade it will come out. */
  output: ItemRef | null
  /** Jobs waiting behind the one in progress. */
  queued: number
  /** Free places left in the queue. */
  free: number
  /** In-game hours until the whole queue is done. */
  hoursLeft: number
  /** Nights the player must sleep before the whole queue is done. */
  nightsLeft: number
  /** Units sitting in the machine waiting to be collected — the ready glow. */
  readyCount: number
}

export function machineStatus(state: GameState, id: string): MachineStatus | null {
  const machine = machineById(state, id)
  if (machine === null) return null

  const def = machineDefFor(machine.kind)
  const head = machine.queue.length > 0 ? machine.queue[0] : null
  const recipe = head === null ? null : recipeFor(machine.kind, head.recipeId)

  let hoursLeft = 0
  for (const job of machine.queue) hoursLeft += Math.max(0, job.hoursLeft)
  let readyCount = 0
  for (const held of machine.ready) readyCount += held.count

  const capacity = def === null ? machine.queue.length : def.queueSize + 1
  return {
    kind: machine.kind,
    name: def === null ? machine.kind.toUpperCase() : def.name.toUpperCase(),
    active: head === null ? null : { ...head },
    output: recipe === null || head === null ? null : outputItem(recipe, head.quality),
    queued: Math.max(0, machine.queue.length - 1),
    free: Math.max(0, capacity - machine.queue.length),
    hoursLeft,
    nightsLeft: Math.ceil(hoursLeft / HOURS_PER_NIGHT),
    readyCount,
  }
}

/* ------------------------------------------------------- items and the grade */

function carriesQuality(item: ItemRef): boolean {
  return item.kind === 'produce' || item.kind === 'product'
}

/** The same item at a given grade. Only produce and factory products carry one. */
function atQuality(item: ItemRef, quality: Quality): ItemRef {
  if (item.kind === 'produce') return { kind: 'produce', cropId: item.cropId, quality }
  if (item.kind === 'product') return { kind: 'product', productId: item.productId, quality }
  return item
}

/** The plain form of an ingredient, for counting it and for naming it in a message. */
function baseRef(item: ItemRef): ItemRef {
  return carriesQuality(item) ? atQuality(item, 'normal') : item
}

/** How many of an ingredient the player holds, at any grade. */
function heldTotal(state: GameState, item: ItemRef): number {
  if (!carriesQuality(item)) return countItem(state, item)
  let total = 0
  for (const quality of FILL_ORDER) total += countItem(state, atQuality(item, quality))
  return total
}

/** What one run of a recipe produces, carrying the grade it was fed. */
export function outputItem(recipe: Recipe, quality: Quality): ItemRef {
  return { kind: 'product', productId: recipe.outputProductId, quality }
}

function shortfallText(missing: ReadonlyArray<{ item: ItemRef; short: number }>): string {
  return missing.map((entry) => `${entry.short} MORE ${itemName(baseRef(entry.item))}`).join(', ')
}

/** Hours as the player thinks of them: inside tonight, or in nights of sleeping on it. */
function formatWait(hours: number): string {
  if (hours <= 0) return 'NO TIME AT ALL'
  if (hours <= HOURS_PER_NIGHT) return `${hours}H`
  return `${Math.ceil(hours / HOURS_PER_NIGHT)} NIGHTS`
}

/* ------------------------------------------------------------------ ingredients */

/**
 * Whether the player can run a recipe right now and, when they cannot, exactly what is
 * short and by how many. Grades are ignored in the counting — any melon feeds a recipe
 * that asks for melon, and the grade of the ones that go in decides the grade that comes
 * out. Ingredients only: a full queue is a different refusal with a different message.
 */
export function canRun(
  state: GameState,
  recipe: Recipe,
): { ok: boolean; missing: Array<{ item: ItemRef; short: number }> } {
  // Fold repeated lines together, so a recipe that asks twice for the same thing is
  // measured against one requirement rather than against two half-met ones.
  const order: string[] = []
  const needed = new Map<string, { item: ItemRef; count: number }>()
  for (const input of recipe.inputs) {
    if (input.count <= 0) continue
    const key = itemKey(baseRef(input.item))
    const entry = needed.get(key)
    if (entry === undefined) {
      order.push(key)
      needed.set(key, { item: input.item, count: input.count })
    } else {
      entry.count += input.count
    }
  }

  const missing: Array<{ item: ItemRef; short: number }> = []
  for (const key of order) {
    const entry = needed.get(key)
    if (entry === undefined) continue
    const held = heldTotal(state, entry.item)
    if (held < entry.count) missing.push({ item: entry.item, short: entry.count - held })
  }
  return { ok: missing.length === 0, missing }
}

/**
 * Takes the ingredients out of the bag and reports the grade the batch came to.
 *
 * The batch is graded by the best ingredient standing in stock for any line of the recipe.
 * Exactly one unit of that grade is taken to set the mark and every other unit is drawn
 * from the cheapest stock available, so one gold fruit grades a whole batch and the rest of
 * the player's gold fruit stays theirs to sell.
 *
 * Returns null only if the bag moved underneath it, which `canRun` has already ruled out.
 */
function consumeInputs(
  state: GameState,
  recipe: Recipe,
): { state: GameState; quality: Quality } | null {
  let grade: Quality = 'normal'
  for (const input of recipe.inputs) {
    if (input.count <= 0 || !carriesQuality(input.item)) continue
    for (const quality of FILL_ORDER) {
      if (QUALITY_RANK[quality] <= QUALITY_RANK[grade]) continue
      if (countItem(state, atQuality(input.item, quality)) > 0) grade = quality
    }
  }

  let next = state
  // Nothing to hold back when the batch grades normal: every line fills from the bottom.
  let marked = grade === 'normal'

  for (const input of recipe.inputs) {
    let remaining = input.count
    if (remaining <= 0) continue

    if (!carriesQuality(input.item)) {
      const after = removeItem(next, input.item, remaining)
      if (after === null) return null
      next = after
      continue
    }

    if (!marked && countItem(next, atQuality(input.item, grade)) > 0) {
      const after = removeItem(next, atQuality(input.item, grade), 1)
      if (after === null) return null
      next = after
      remaining -= 1
      marked = true
    }

    for (const quality of FILL_ORDER) {
      if (remaining <= 0) break
      const ref = atQuality(input.item, quality)
      const take = Math.min(remaining, countItem(next, ref))
      if (take <= 0) continue
      const after = removeItem(next, ref, take)
      if (after === null) return null
      next = after
      remaining -= take
    }

    if (remaining > 0) return null
  }

  return { state: next, quality: grade }
}

/** Units of ingredient one run eats. The machine XP award is 8 plus 2 of these. */
function ingredientUnits(recipe: Recipe): number {
  let units = 0
  for (const input of recipe.inputs) units += Math.max(0, input.count)
  return units
}

/** Merges goods into a machine's holding pen, stacking by item and grade. */
function hold(ready: Array<{ item: ItemRef; count: number }>, item: ItemRef, count: number): void {
  if (count <= 0) return
  const key = itemKey(item)
  for (const entry of ready) {
    if (itemKey(entry.item) === key) {
      entry.count += count
      return
    }
  }
  ready.push({ item, count })
}

/* ------------------------------------------------------------ placing a machine */

/** Machine ids follow the building convention, and a freed number is reused. */
function nextMachineId(state: GameState): string {
  const taken = new Set(state.machines.map((machine) => machine.id))
  let n = state.machines.length + 1
  while (taken.has(`mch-${n}`)) n += 1
  return `mch-${n}`
}

/**
 * Buys a machine and sets it down in one move. The gold and the materials commit here and
 * nowhere earlier, so a ghost the player cancels costs nothing, and the tile is judged by
 * the same `canPlace` a building is judged by — a machine and a barn cannot disagree about
 * who is standing on a tile.
 */
export function placeMachine(state: GameState, kind: MachineKind, index: number): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const def = machineDefFor(kind)
  if (def === null) return refuse(state, 'NOBODY BUILDS THOSE.')
  const name = def.name.toUpperCase()

  const level = machineLevel(def)
  if (state.progression.level < level) return refuse(state, `THE ${name} NEEDS LEVEL ${level}.`)
  if (!Number.isInteger(index) || index < 0 || index >= state.tiles.length) {
    return refuse(state, 'THERE IS NOTHING OVER THERE.')
  }
  if (state.gold < def.cost) {
    return refuse(state, `THE ${name} COSTS ${def.cost}G, YOU HAVE ${state.gold}G.`)
  }
  const missing = missingMaterials(state, def.materials)
  if (Object.keys(missing).length > 0) {
    return refuse(state, `THE ${name} STILL NEEDS ${formatMaterials(missing)}.`)
  }

  const check = canPlace(state, MACHINE_FOOTPRINT, index % FARM_W, Math.floor(index / FARM_W))
  if (!check.ok) return refuse(state, placementMessage(check.reason, name))

  const next = spendMaterials(state, def.materials)
  if (next === null) return refuse(state, `THE ${name} STILL NEEDS MATERIALS.`)
  next.gold -= def.cost
  next.stats = { ...next.stats, spent: next.stats.spent + def.cost }

  const machine: Machine = { id: nextMachineId(next), kind: def.kind, index, queue: [], ready: [] }
  next.machines = [...next.machines, machine]
  // The tile mirror `docs/GAMEPLAY.md` §4 asks for. `state.machines` stays authoritative;
  // this is what lets the renderer answer "what is on this tile" without a scan.
  next.tiles[index].machineId = machine.id

  const awarded = grantXp(next, xpFor('build'), 'build')
  const levelled =
    awarded.leveled.length > 0 ? ` LEVEL ${awarded.leveled[awarded.leveled.length - 1]}!` : ''
  return done(awarded.state, `THE ${name} IS READY FOR WORK. -${def.cost}G.${levelled}`, 'buy', [
    { kind: 'dirt', index },
  ])
}

/* ------------------------------------------------------ filling and emptying */

/**
 * Queues one run of a recipe. The ingredients leave the bag at once, which is why every
 * refusal is settled before a single item moves, and why the refusal for want of them
 * names the shortfall to the unit.
 */
export function insertIntoMachine(state: GameState, id: string, recipeId: string): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const machine = machineById(state, id)
  if (machine === null) return refuse(state, 'THERE IS NO MACHINE THERE.')

  const def = machineDefFor(machine.kind)
  if (def === null) return refuse(state, 'THAT MACHINE HAS NO RECIPES.')
  const name = def.name.toUpperCase()

  const recipe = recipeFor(machine.kind, recipeId)
  if (recipe === null) return refuse(state, `THE ${name} CANNOT MAKE THAT.`)

  const level = recipeLevel(recipe)
  if (state.progression.level < level) return refuse(state, `THAT RECIPE NEEDS LEVEL ${level}.`)

  const capacity = def.queueSize + 1
  if (machine.queue.length >= capacity) {
    return refuse(state, `THE ${name} IS FULL AT ${capacity} JOBS. COLLECT OR WAIT.`)
  }

  const check = canRun(state, recipe)
  if (!check.ok) return refuse(state, `YOU NEED ${shortfallText(check.missing)}.`)

  const taken = consumeInputs(state, recipe)
  if (taken === null) return refuse(state, `YOU NEED ${shortfallText(check.missing)}.`)

  const job: MachineJob = {
    recipeId: recipe.id,
    quality: taken.quality,
    hoursLeft: Math.max(0, recipe.hours),
  }

  let waitHours = job.hoursLeft
  for (const queued of machine.queue) waitHours += Math.max(0, queued.hoursLeft)

  // A recipe with no ingredients takes nothing out of the bag, so nothing was copied yet.
  const next = taken.state === state ? cloneState(state) : taken.state
  next.machines = next.machines.map((entry) =>
    entry.id === machine.id ? { ...entry, queue: [...entry.queue, job] } : entry,
  )

  const out = outputItem(recipe, taken.quality)
  const label = recipe.outputCount > 1 ? `${recipe.outputCount} ${itemName(out)}` : itemName(out)
  const behind = machine.queue.length
  const tail = behind === 0 ? '' : behind === 1 ? ' - ONE JOB AHEAD OF IT' : ` - ${behind} JOBS AHEAD OF IT`
  return done(next, `${label} IN ${formatWait(waitHours)}${tail}.`, 'plant', [
    { kind: 'pop', index: machine.index },
  ])
}

/**
 * Empties a machine's holding pen into the bag. Whatever the barn has no room for stays in
 * the machine: output waiting on shelf space is not output to throw away.
 */
export function collectMachine(state: GameState, id: string): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const machine = machineById(state, id)
  if (machine === null) return refuse(state, 'THERE IS NO MACHINE THERE.')

  let waiting = 0
  for (const entry of machine.ready) waiting += Math.max(0, entry.count)
  if (waiting === 0) {
    if (machine.queue.length > 0) {
      return refuse(
        state,
        `STILL WORKING - ${formatWait(Math.max(0, machine.queue[0].hoursLeft))} TO GO.`,
      )
    }
    return refuse(state, 'THERE IS NOTHING TO COLLECT.')
  }

  const def = machineDefFor(machine.kind)
  const name = def === null ? machine.kind.toUpperCase() : def.name.toUpperCase()

  let next = cloneState(state)
  const kept: Array<{ item: ItemRef; count: number }> = []
  const took: string[] = []
  let left = 0
  let refusal = ''

  for (const entry of machine.ready) {
    const deposited = depositItem(next, entry.item, entry.count)
    next = deposited.state
    if (deposited.stored > 0) took.push(`${deposited.stored} ${itemName(entry.item)}`)
    if (deposited.refused > 0) {
      kept.push({ item: entry.item, count: deposited.refused })
      left += deposited.refused
      if (refusal === '') refusal = deposited.message
    }
  }

  // Nothing moved: the store is the whole problem, so hand back its own full account of it.
  if (took.length === 0) return refuse(state, refusal === '' ? 'THERE IS NO ROOM FOR IT.' : refusal)

  next.machines = next.machines.map((entry) =>
    entry.id === machine.id ? { ...entry, ready: kept } : entry,
  )

  const tail = left > 0 ? ` ${left} STAYS IN THE ${name} - NO ROOM.` : ''
  return done(next, `COLLECTED ${took.join(', ')}.${tail}`, 'harvest', [
    { kind: 'sparkle', index: machine.index },
  ])
}

/* ------------------------------------------------------------ the overnight pass */

/**
 * Works every machine through one night.
 *
 * Each machine gets `HOURS_PER_NIGHT` of work. The head job spends it first and the hours it
 * does not need pass to the job behind it, so a queue of short jobs can clear in a single
 * night while the keg sits on one job for several.
 *
 * A finished job goes into the barn. When the barn will not take it — wholly or in part —
 * the rest is held in the machine and counted as blocked, so the morning report can say
 * plainly that the farm has run out of shelf space. `finished` and `blocked` together are
 * the jobs that came off the queue tonight; nothing is ever destroyed to balance them.
 *
 * A finished job pays its experience here rather than in the caller, because this is the
 * only place that knows how many ingredients each job ate. Callers must not award it twice.
 */
export function nightlyProduction(state: GameState): {
  state: GameState
  finished: number
  blocked: number
} {
  let next = cloneState(state)
  let finished = 0
  let blocked = 0
  let xp = 0

  // Held before the loop because depositing swaps `next` for a fresh clone each time; the
  // machines are rebuilt here and written back at the end, so those clones are discarded.
  const standing = next.machines
  const worked: Machine[] = []
  for (const machine of standing) {
    const queue = machine.queue.map((job) => ({ ...job }))
    const ready = machine.ready.map((entry) => ({ item: entry.item, count: entry.count }))
    const def = machineDefFor(machine.kind)

    if (def !== null) {
      let budget = HOURS_PER_NIGHT
      while (budget > 0 && queue.length > 0) {
        const head = queue[0]
        const hours = Math.max(0, head.hoursLeft)
        if (hours > budget) {
          head.hoursLeft = hours - budget
          budget = 0
          break
        }

        budget -= hours
        queue.shift()

        const recipe = recipeFor(machine.kind, head.recipeId)
        // A job whose recipe the catalogue no longer carries keeps its slot rather than
        // inventing an output: it comes off the queue and pays nothing.
        if (recipe === null) continue

        const item = outputItem(recipe, head.quality)
        const deposited = depositItem(next, item, Math.max(0, recipe.outputCount))
        next = deposited.state
        if (deposited.refused > 0) {
          hold(ready, item, deposited.refused)
          blocked += 1
        } else {
          finished += 1
        }
        xp += xpFor('machine', ingredientUnits(recipe))
      }
    }

    worked.push({ ...machine, queue, ready })
  }

  next.machines = worked
  if (xp > 0) next = grantXp(next, xp, 'machine').state

  return { state: next, finished, blocked }
}
