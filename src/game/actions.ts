import type {
  ActionResult,
  CropDef,
  DayReport,
  Facing,
  Fx,
  GameState,
  Ground,
  ItemRef,
  Quality,
  Season,
  SoundId,
  Tile,
  ToolId,
  Weather,
} from './types'
import {
  ACTION_MINUTES,
  DAY_END,
  DAY_START,
  DAYS_PER_SEASON,
  DRY_DAYS_TO_WITHER,
  ENERGY_CAP,
  ENERGY_COST,
  FARM_W,
} from './constants'
import {
  cloneState,
  countItem,
  facingIndex,
  inBounds,
  isWalkable,
  removeItem,
  tileIndex,
} from './state'
import { cropById, isRipe } from './crops'
import { randInt, rngFor } from './rng'
import { nextSeason } from './time'
import { absoluteDay, dailyRecovery, eventBeginsToday, recordPrices, refreshEvent } from './economy'
import { cutGrass, nightlyLivestock } from './livestock'
import { accrueInterest, expireOrders, nightlyStall, offerOrders, seasonalTax, totalDebt } from './market'
import { clearingSource, rollMaterials } from './materials'
import { isFarmhouseTile } from './placement'
import { nightlyProduction } from './production'
import {
  addMaterials,
  depositItem,
  formatMaterials,
  grantXp,
  isTileOwned,
  spaceCheck,
  xpFor,
} from './progression'
import { regionAt } from './regions'

/** Gold docked when the farmer is carried home unconscious. */
const MEDICAL_FEE = 50

/** Fraction of maxEnergy recovered after passing out instead of sleeping properly. */
const PASSED_OUT_RECOVERY = 0.6

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

// ---------------------------------------------------------------------------
// result helpers
// ---------------------------------------------------------------------------

function refuse(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function done(state: GameState, message: string, sound: SoundId, fx: Fx[]): ActionResult {
  return { state, ok: true, message, sound, fx }
}

/**
 * Spends the cost of one action. Hitting 2:00 AM or zero energy leaves the farmer
 * passed out; the renderer turns that into a forced sleep.
 */
function spend(s: GameState, energy: number): void {
  s.energy = Math.max(0, s.energy - energy)
  s.minutes = Math.min(DAY_END, s.minutes + ACTION_MINUTES)
  if (s.energy <= 0 || s.minutes >= DAY_END) s.passedOut = true
}

/** Shared refusals: unconscious, off the map, or too tired. Returns a message or null. */
function guard(state: GameState, index: number, energy: number): string | null {
  if (state.passedOut) return 'YOU CAN BARELY STAND. GET TO BED.'
  if (index < 0 || index >= state.tiles.length) return 'THERE IS NOTHING OVER THERE.'
  if (state.energy < energy) return 'YOU ARE TOO TIRED FOR THAT.'
  return null
}

function debrisName(ground: Ground): string {
  if (ground === 'weeds') return 'WEEDS'
  if (ground === 'rock') return 'ROCK'
  if (ground === 'log') return 'LOG'
  return 'DEBRIS'
}

function debrisCleared(ground: Ground): string {
  if (ground === 'weeds') return 'THE WEEDS COME UP EASILY.'
  if (ground === 'rock') return 'THE ROCK BREAKS APART.'
  return 'THE LOG SPLITS AND IS HAULED OFF.'
}

function debrisCost(ground: Ground): number {
  if (ground === 'weeds') return ENERGY_COST.clearWeeds
  if (ground === 'rock') return ENERGY_COST.clearRock
  return ENERGY_COST.clearLog
}

// ---------------------------------------------------------------------------
// movement and selection
// ---------------------------------------------------------------------------

/**
 * Facing always updates, even when the step is blocked, so the farmer can turn on
 * the spot to work an adjacent tile. Free in both energy and time.
 */
/**
 * A tile the farmer may stand on.
 *
 * Clear ground is not enough: a building is solid. `isWalkable` answers only about the
 * ground — it is also what `placement.ts` asks when deciding whether a tile could host a
 * building, so it must stay a question about the ground alone — and movement never asked
 * anything else. The farmer therefore walked straight through every coop, barn and
 * bakery on the farm, and through the farmhouse, which is what made a door decorative:
 * you never had to stand at one, so you never pressed use at one.
 *
 * The farmhouse is checked by position rather than by `buildingId`, because it is drawn
 * as part of the valley and owns no tiles.
 */
function canWalkTo(state: GameState, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false
  const tile = state.tiles[tileIndex(x, y)]
  if (tile === undefined || !isWalkable(tile)) return false
  if (tile.buildingId !== null) return false
  return !isFarmhouseTile(x, y)
}

export function movePlayer(state: GameState, dx: number, dy: number): GameState {
  const sx = Math.sign(dx)
  const sy = sx !== 0 ? 0 : Math.sign(dy)
  if (sx === 0 && sy === 0) return state

  const facing: Facing = sx !== 0 ? (sx < 0 ? 'left' : 'right') : sy < 0 ? 'up' : 'down'
  const tx = state.player.x + sx
  const ty = state.player.y + sy
  const walkable = canWalkTo(state, tx, ty)

  if (!walkable && state.player.facing === facing) return state

  const s = cloneState(state)
  s.player.facing = facing
  if (walkable) {
    s.player.x = tx
    s.player.y = ty
  }
  return s
}

export function setTool(state: GameState, tool: ToolId): GameState {
  if (state.tool === tool) return state
  const s = cloneState(state)
  s.tool = tool
  return s
}

export function selectSeed(state: GameState, cropId: string | null): GameState {
  if (state.selectedSeed === cropId) return state
  if (cropId !== null && !cropById(cropId)) return state
  const s = cloneState(state)
  s.selectedSeed = cropId
  return s
}

// ---------------------------------------------------------------------------
// verbs
// ---------------------------------------------------------------------------

export function till(state: GameState, index: number): ActionResult {
  const stop = guard(state, index, ENERGY_COST.till)
  if (stop) return refuse(state, stop)

  const tile = state.tiles[index]
  switch (tile.ground) {
    case 'soil':
      return refuse(state, 'THIS SOIL IS ALREADY TURNED.')
    case 'weeds':
    case 'rock':
    case 'log':
      return refuse(state, `CLEAR THE ${debrisName(tile.ground)} FIRST.`)
    case 'water':
      return refuse(state, 'YOU CANNOT TILL THE POND.')
    case 'path':
      return refuse(state, 'THE PATH IS PACKED TOO HARD.')
    default:
      break
  }

  const s = cloneState(state)
  const t = s.tiles[index]
  t.ground = 'soil'
  t.watered = false
  t.fertilized = false
  t.plant = null
  spend(s, ENERGY_COST.till)
  return done(s, 'THE EARTH TURNS OVER.', 'till', [{ kind: 'dirt', index }])
}

/** Every tilled tile the can reaches, given `upgrades.canRange` and the facing. */
function canTargets(state: GameState, index: number): number[] {
  const range = Math.max(0, Math.min(2, state.upgrades.canRange))
  const cx = index % FARM_W
  const cy = Math.floor(index / FARM_W)

  const offsets: Array<[number, number]> = [[0, 0]]
  if (range === 1) {
    // "Across" the facing: perpendicular to the way the farmer is looking.
    const acrossX = state.player.facing === 'up' || state.player.facing === 'down'
    if (acrossX) offsets.push([-1, 0], [1, 0])
    else offsets.push([0, -1], [0, 1])
  } else if (range >= 2) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox !== 0 || oy !== 0) offsets.push([ox, oy])
      }
    }
  }

  const out: number[] = []
  for (const [ox, oy] of offsets) {
    const x = cx + ox
    const y = cy + oy
    if (inBounds(x, y)) out.push(tileIndex(x, y))
  }
  return out
}

export function water(state: GameState, index: number): ActionResult {
  const stop = guard(state, index, ENERGY_COST.water)
  if (stop) return refuse(state, stop)

  const targets = canTargets(state, index)
  const soil = targets.filter((i) => state.tiles[i].ground === 'soil')
  if (soil.length === 0) return refuse(state, 'THERE IS NO TILLED SOIL TO WATER.')

  const dry = soil.filter((i) => !state.tiles[i].watered)
  if (dry.length === 0) return refuse(state, 'THIS SOIL IS ALREADY WATERED.')

  const s = cloneState(state)
  const fx: Fx[] = []
  for (const i of dry) {
    s.tiles[i].watered = true
    fx.push({ kind: 'splash', index: i })
  }
  spend(s, ENERGY_COST.water)

  const message = dry.length === 1 ? 'THE SOIL DRINKS IT UP.' : `WATERED ${dry.length} TILES.`
  return done(s, message, 'water', fx)
}

export function sow(state: GameState, index: number, cropId: string): ActionResult {
  const stop = guard(state, index, ENERGY_COST.plant)
  if (stop) return refuse(state, stop)

  const crop = cropById(cropId)
  if (!crop) return refuse(state, 'YOU HAVE NO SUCH SEED.')

  const name = crop.name.toUpperCase()
  const tile = state.tiles[index]
  if (tile.ground !== 'soil') {
    if (tile.ground === 'grass') return refuse(state, 'TILL THE GROUND FIRST.')
    if (tile.ground === 'weeds' || tile.ground === 'rock' || tile.ground === 'log') {
      return refuse(state, `CLEAR THE ${debrisName(tile.ground)} FIRST.`)
    }
    return refuse(state, 'SEEDS WILL NOT TAKE THERE.')
  }
  if (tile.plant) return refuse(state, 'SOMETHING IS ALREADY GROWING HERE.')

  const seed: ItemRef = { kind: 'seed', cropId }
  if (countItem(state, seed) < 1) return refuse(state, `NO ${name} SEEDS IN THE BAG.`)
  if (!crop.seasons.includes(state.season)) {
    return refuse(state, `${name} WILL NOT GROW IN ${state.season.toUpperCase()}.`)
  }

  const spent = removeItem(state, seed, 1)
  if (!spent) return refuse(state, `NO ${name} SEEDS IN THE BAG.`)

  const s = spent
  const t = s.tiles[index]
  t.plant = {
    cropId,
    stage: 0,
    progress: 0,
    dry: 0,
    dead: false,
    fertilized: t.fertilized,
    regrown: 0,
  }
  s.stats.cropsPlanted += 1
  spend(s, ENERGY_COST.plant)
  return done(s, `${name} SOWN.`, 'plant', [{ kind: 'dirt', index }])
}

/**
 * The stage a regrowing crop falls back to: far enough down the ladder that the
 * watered days left to ripen cover `regrowDays`.
 */
function regrowStage(crop: CropDef): number {
  const stages = crop.stageDays
  if (stages.length === 0) return 0
  const target = Math.max(1, crop.regrowDays ?? 1)
  let stage = stages.length
  let days = 0
  while (stage > 0 && days < target) {
    stage -= 1
    days += Math.max(1, stages[stage])
  }
  return Math.min(stage, stages.length - 1)
}

function rollQuality(rand: () => number, fertilized: boolean, regrown: number): Quality {
  // Base 70 / 22 / 8, shifted hard by fertilizer and nudged by each regrowth.
  let gold = fertilized ? 0.2 : 0.08
  let silver = fertilized ? 0.34 : 0.22
  const nudge = Math.min(regrown, 4) * 0.02
  gold += nudge
  silver += nudge

  const r = rand()
  if (r < gold) return 'gold'
  if (r < gold + silver) return 'silver'
  return 'normal'
}

export function harvest(state: GameState, index: number): ActionResult {
  const stop = guard(state, index, ENERGY_COST.harvest)
  if (stop) return refuse(state, stop)

  const tile = state.tiles[index]
  const plant = tile.plant
  if (!plant) {
    if (tile.ground === 'weeds' || tile.ground === 'rock' || tile.ground === 'log') {
      return refuse(state, `USE THE AXE ON THE ${debrisName(tile.ground)}.`)
    }
    return refuse(state, 'THERE IS NOTHING TO PICK HERE.')
  }

  const crop = cropById(plant.cropId)

  // A dead plant, or one from a save that no longer knows its crop, just comes up.
  if (plant.dead || !crop) {
    const s = cloneState(state)
    s.tiles[index].plant = null
    spend(s, ENERGY_COST.harvest)
    const label = crop ? crop.name.toUpperCase() : 'PLANT'
    return done(s, `YOU PULL UP THE WITHERED ${label}.`, 'wither', [{ kind: 'leaf', index }])
  }

  const name = crop.name.toUpperCase()
  if (!isRipe(plant, crop)) return refuse(state, `THE ${name} IS NOT READY YET.`)

  const rand = rngFor(
    state.seed,
    `harvest:${state.year}:${state.season}:${state.day}:${index}:${state.stats.harvested}:${plant.regrown}`,
  )
  const amount = Math.max(1, randInt(rand, crop.yieldMin, crop.yieldMax))
  const quality = rollQuality(rand, plant.fertilized, plant.regrown)

  // The silo has to take the whole crop before the plant gives it up, and it is all or
  // nothing: a plant left standing keeps every unit, where a part-picked one would drop the
  // remainder on the floor. `docs/PROGRESSION.md` §5 — a harvest never quietly evaporates.
  const picked: ItemRef = { kind: 'produce', cropId: crop.id, quality }
  const room = spaceCheck(state, picked, amount)
  if (!room.ok) return refuse(state, `${room.message} THE ${name} KEEPS UNTIL YOU DO.`)

  const deposit = depositItem(state, picked, amount)
  const s = deposit.state
  const t = s.tiles[index]
  const regrowing = crop.regrowDays !== null && t.plant !== null

  if (regrowing && t.plant) {
    t.plant.stage = regrowStage(crop)
    t.plant.progress = 0
    t.plant.dry = 0
    t.plant.dead = false
    t.plant.regrown += 1
  } else {
    t.plant = null
  }

  s.stats.harvested += deposit.stored
  spend(s, ENERGY_COST.harvest)

  const fx: Fx[] = [{ kind: 'pop', index }]
  if (quality === 'gold') fx.push({ kind: 'sparkle', index })

  // Two experience a unit, per `docs/PROGRESSION.md` §1. Paid on what reached the silo.
  const awarded = grantXp(s, xpFor('harvest', deposit.stored), 'harvest')
  const top = awarded.leveled[awarded.leveled.length - 1]
  const levelled = top === undefined ? '' : ` LEVEL ${top}!`

  const suffix = quality === 'normal' ? '' : ` - ${quality.toUpperCase()}!`
  const tail = regrowing ? ' IT WILL BEAR AGAIN.' : ''
  return done(awarded.state, `PICKED ${amount} ${name}${suffix}.${tail}${levelled}`, 'harvest', fx)
}

export function clearDebris(state: GameState, index: number): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')
  if (index < 0 || index >= state.tiles.length) return refuse(state, 'THERE IS NOTHING OVER THERE.')

  const tile = state.tiles[index]
  if (tile.ground !== 'weeds' && tile.ground !== 'rock' && tile.ground !== 'log') {
    return refuse(state, 'THERE IS NOTHING TO CLEAR THERE.')
  }

  const cost = debrisCost(tile.ground)
  if (state.energy < cost) return refuse(state, 'YOU ARE TOO TIRED FOR THAT.')

  // Past the fence it is not yours yet, per `docs/PROGRESSION.md` §3: buying a region is
  // what makes its tiles clearable, and clearing is what pays out the materials.
  const x = index % FARM_W
  const y = Math.floor(index / FARM_W)
  if (!isTileOwned(state, x, y)) {
    const region = regionAt(x, y)
    return refuse(
      state,
      region === null
        ? 'THAT GROUND IS NOT YOURS.'
        : `${region.name} IS NOT YOURS YET - BUY THE PLOT FIRST.`,
    )
  }

  const message = debrisCleared(tile.ground)
  const ground = tile.ground
  let s = cloneState(state)
  const t = s.tiles[index]
  t.ground = 'grass'
  t.watered = false
  t.fertilized = false
  t.plant = null
  spend(s, cost)

  // What the swing turned up. `materials.ts` owns the drop table; the roll is salted with
  // the date and the tile, so a save replays the same haul.
  const source = clearingSource(ground)
  let haul = ''
  if (source !== null) {
    const drop = rollMaterials(
      source,
      state.seed,
      `clear:${state.year}:${state.season}:${state.day}:${index}`,
    )
    if (Object.keys(drop).length > 0) {
      s = addMaterials(s, drop)
      haul = ` ${formatMaterials(drop)}.`
    }
  }

  const awarded = grantXp(s, xpFor('clear'), 'clear')
  const top = awarded.leveled[awarded.leveled.length - 1]
  const levelled = top === undefined ? '' : ` LEVEL ${top}!`
  return done(awarded.state, `${message}${haul}${levelled}`, 'chop', [{ kind: 'leaf', index }])
}

export function placeSprinkler(state: GameState, index: number): ActionResult {
  const stop = guard(state, index, ENERGY_COST.sprinkler)
  if (stop) return refuse(state, stop)

  const good: ItemRef = { kind: 'good', goodId: 'sprinkler' }
  if (countItem(state, good) < 1) return refuse(state, 'NO SPRINKLERS IN THE BAG.')

  const tile = state.tiles[index]
  if (tile.sprinkler) return refuse(state, 'A SPRINKLER ALREADY STANDS HERE.')
  if (tile.ground === 'water') return refuse(state, 'IT WOULD SINK IN THE POND.')
  if (tile.ground === 'weeds' || tile.ground === 'rock' || tile.ground === 'log') {
    return refuse(state, `CLEAR THE ${debrisName(tile.ground)} FIRST.`)
  }
  if (tile.plant) return refuse(state, 'SOMETHING IS GROWING THERE ALREADY.')

  const spent = removeItem(state, good, 1)
  if (!spent) return refuse(state, 'NO SPRINKLERS IN THE BAG.')

  const s = spent
  s.tiles[index].sprinkler = true
  spend(s, ENERGY_COST.sprinkler)
  return done(s, 'THE SPRINKLER WILL WET ITS NEIGHBOURS.', 'plant', [{ kind: 'sparkle', index }])
}

export function fertilize(state: GameState, index: number): ActionResult {
  const stop = guard(state, index, ENERGY_COST.fertilize)
  if (stop) return refuse(state, stop)

  const good: ItemRef = { kind: 'good', goodId: 'fertilizer' }
  if (countItem(state, good) < 1) return refuse(state, 'NO FERTILIZER IN THE BAG.')

  const tile = state.tiles[index]
  if (tile.ground !== 'soil') return refuse(state, 'FERTILIZER ONLY HELPS TILLED SOIL.')
  if (tile.plant) return refuse(state, 'FEED THE SOIL BEFORE YOU SOW IT.')
  if (tile.fertilized) return refuse(state, 'THIS SOIL IS ALREADY RICH.')

  const spent = removeItem(state, good, 1)
  if (!spent) return refuse(state, 'NO FERTILIZER IN THE BAG.')

  const s = spent
  s.tiles[index].fertilized = true
  spend(s, ENERGY_COST.fertilize)
  return done(s, 'THE SOIL IS DARK AND RICH.', 'plant', [{ kind: 'dirt', index }])
}

export function useTool(state: GameState): ActionResult {
  const index = facingIndex(state)
  switch (state.tool) {
    case 'hoe':
      return till(state, index)
    case 'can':
      return water(state, index)
    case 'seeds':
      if (state.selectedSeed === null) return refuse(state, 'PICK A SEED FIRST - PRESS Q OR E.')
      return sow(state, index, state.selectedSeed)
    case 'hand':
      return harvest(state, index)
    case 'axe':
      // The axe is the cutting tool, not only the clearing one. Swung at rock, timber or
      // weeds it clears them; swung at standing sward it scythes hay into the silo, which
      // is the *only* way hay is ever made. Without this, a silo can never fill, animals
      // cannot be fed through a winter that lets nothing graze, and `cutGrass` is a verb
      // with a full set of refusals that nothing in the game can reach.
      //
      // Deciding which of the two the player meant belongs here, in the one place that
      // already turns a held tool into a verb, rather than in a second tool slot the belt
      // and the save format would both have to grow to hold.
      return state.tiles[index]?.ground === 'grass'
        ? cutGrass(state, index)
        : clearDebris(state, index)
    case 'sprinkler':
      return placeSprinkler(state, index)
    case 'fertilizer':
      return fertilize(state, index)
    default:
      return refuse(state, 'NOTHING HAPPENS.')
  }
}

// ---------------------------------------------------------------------------
// the night
// ---------------------------------------------------------------------------

function rollWeather(rand: () => number, season: Season): Weather {
  const r = rand()
  switch (season) {
    case 'spring':
      return r < 0.36 ? 'rain' : r < 0.44 ? 'storm' : 'clear'
    case 'summer':
      return r < 0.16 ? 'rain' : r < 0.32 ? 'storm' : 'clear'
    case 'fall':
      return r < 0.3 ? 'rain' : r < 0.4 ? 'storm' : 'clear'
    default:
      return r < 0.42 ? 'snow' : r < 0.48 ? 'storm' : 'clear'
  }
}

function wetsEverything(weather: Weather): boolean {
  return weather === 'rain' || weather === 'storm'
}

/** Sprinklers reach their four orthogonal neighbours, and only tilled soil holds water. */
function runSprinklers(tiles: Tile[]): void {
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i].sprinkler) continue
    const x = i % FARM_W
    const y = Math.floor(i / FARM_W)
    for (const [ox, oy] of ORTHOGONAL) {
      const nx = x + ox
      const ny = y + oy
      if (!inBounds(nx, ny)) continue
      const t = tiles[tileIndex(nx, ny)]
      if (t.ground === 'soil') t.watered = true
    }
  }
}

/**
 * One night.
 *
 * The passes run in the order `docs/GAMEPLAY.md` §5 sets out, and the report counts what
 * each pass actually did rather than estimating it:
 *
 *  1. the weather falls, sprinklers run, crops drink and grow or wither
 *  2. animals eat, the unfed lose friendship, produce clocks tick, the herd comes in
 *  3. machines work through their queue and finish into the barn, or are blocked by it
 *  4. the roadside stall sells overnight at the price the player named
 *  5. on the last night of a season: interest accrues and the levy is assessed
 *  6. the calendar turns
 *  7. the market heals, the week's event is rolled, orders expire and are topped back up,
 *     and today's closing prices go into the ledger
 *  8. the farmer wakes, and the forecast for tonight is rolled
 *
 * Steps 5 and 6 are in that order deliberately: the levy is assessed against the season that
 * is ending, and it opens the next season's books, so it has to run while the date still says
 * the old season. Everything in step 7 is keyed to the *new* day and runs after the turn.
 *
 * A single generator threads the whole night, so one seed replays one night exactly.
 */
export function sleep(state: GameState): { state: GameState; report: DayReport } {
  let s = cloneState(state)
  const rand = rngFor(s.seed, `night:${s.year}:${s.season}:${s.day}`)

  // The forecast the player went to bed on is the weather that actually falls.
  const night = s.tomorrow
  const dayEnded = s.day
  const passedOut = s.passedOut
  const levelBefore = s.progression.level

  // Set before any pass reads it: the animals care about the weather they stood out in.
  s.weather = night

  runSprinklers(s.tiles)
  if (wetsEverything(night)) {
    for (const t of s.tiles) if (t.ground === 'soil') t.watered = true
  }

  let watered = 0
  let grew = 0
  let ripened = 0
  let withered = 0

  for (const t of s.tiles) {
    if (t.ground === 'soil' && t.watered) watered += 1

    const p = t.plant
    if (!p || p.dead) continue
    const crop = cropById(p.cropId)
    if (!crop) continue

    if (t.watered) {
      p.dry = 0
      if (p.stage < crop.stageDays.length) {
        // Fertilized ground gives a bonus day of growth every other day.
        p.progress += p.fertilized && dayEnded % 2 === 0 ? 2 : 1
        grew += 1
        while (p.stage < crop.stageDays.length && p.progress >= Math.max(1, crop.stageDays[p.stage])) {
          p.progress -= Math.max(1, crop.stageDays[p.stage])
          p.stage += 1
        }
        if (p.stage >= crop.stageDays.length) {
          p.stage = crop.stageDays.length
          p.progress = 0
          ripened += 1
        }
      }
    } else {
      p.dry += 1
      if (p.dry >= DRY_DAYS_TO_WITHER && p.stage > 0) {
        p.dead = true
        withered += 1
      }
    }
  }

  for (const t of s.tiles) t.watered = false

  // ---- 2. the animals -----------------------------------------------------
  const barnyard = nightlyLivestock(s, rand)
  s = barnyard.state

  // ---- 3. the machines ----------------------------------------------------
  const workshop = nightlyProduction(s)
  s = workshop.state

  // ---- 4. the roadside stall ----------------------------------------------
  const stall = nightlyStall(s, rand)
  s = stall.state

  // ---- 5. the books, on the last night of the season ----------------------
  let interestAccrued = 0
  let tax: DayReport['tax'] = null
  if (dayEnded >= DAYS_PER_SEASON) {
    const owedBefore = totalDebt(s)
    s = accrueInterest(s)
    interestAccrued = Math.max(0, totalDebt(s) - owedBefore)

    const levy = seasonalTax(s)
    s = levy.state
    tax = {
      gross: levy.gross,
      expenses: levy.expenses,
      taxable: levy.taxable,
      rate: levy.rate,
      due: levy.due,
    }
  }

  // ---- 6. the calendar turns ----------------------------------------------
  s.day += 1
  let seasonChanged = false
  if (s.day > DAYS_PER_SEASON) {
    s.day = 1
    s.season = nextSeason(s.season)
    seasonChanged = true
    if (s.season === 'spring') s.year += 1
  }

  let outOfSeason = 0
  if (seasonChanged) {
    for (const t of s.tiles) {
      const p = t.plant
      if (!p || p.dead) continue
      const crop = cropById(p.cropId)
      if (!crop || !crop.seasons.includes(s.season)) {
        t.plant = null
        outOfSeason += 1
      }
    }
  }

  // ---- 7. the market, on the new day --------------------------------------
  s = dailyRecovery(s)
  s = refreshEvent(s)
  const expired = expireOrders(s)
  s = expired.state
  s = offerOrders(s, rand)
  s = recordPrices(s)
  const eventBegan = eventBeginsToday(s.market.event, absoluteDay(s)) ? s.market.event : null

  // ---- 8. the farmer wakes ------------------------------------------------
  s.tomorrow = rollWeather(rand, s.season)

  const cap = Math.min(s.maxEnergy, ENERGY_CAP)
  let medicalFee = 0
  if (passedOut) {
    s.energy = Math.max(1, Math.floor(cap * PASSED_OUT_RECOVERY))
    medicalFee = Math.min(s.gold, MEDICAL_FEE)
    s.gold -= medicalFee
    s.stats.spent += medicalFee
  } else {
    s.energy = cap
  }

  s.minutes = DAY_START
  s.passedOut = false
  s.stats.daysPlayed += 1
  s.stats.withered += withered

  // Levels can be crossed by a machine finishing overnight, so the morning says so.
  const leveled: number[] = []
  for (let level = levelBefore + 1; level <= s.progression.level; level++) leveled.push(level)

  const report: DayReport = {
    grew,
    withered,
    watered,
    ripened,
    weather: night,
    seasonChanged,
    outOfSeason,
    passedOut,
    medicalFee,
    fed: barnyard.fed,
    unfed: barnyard.unfed,
    produced: barnyard.produced,
    machinesFinished: workshop.finished,
    machinesBlocked: workshop.blocked,
    animalsUnwell: barnyard.unwell,
    stallSold: stall.sold,
    stallEarned: stall.earned,
    ordersFailed: expired.failed,
    eventBegan,
    interestAccrued,
    tax,
    leveled,
  }
  return { state: s, report }
}
