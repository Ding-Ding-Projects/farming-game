/**
 * The seams between the wave-three systems and the game that was already here.
 *
 * Every other test file proves one module. This one proves the joins: that `sleep()` really
 * runs every overnight pass in the documented order and reports what actually happened, that
 * quality survives a three-step chain end to end, that nothing anywhere silently destroys
 * what the player made, that every `ItemRef` variant is handled by every function that
 * consumes one, and that `src/game` is still a pure function of its seed.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearDebris, harvest, sleep } from '../src/game/actions'
import { DAYS_PER_SEASON, SEASONS } from '../src/game/constants'
import { MACHINES, machinesForLevel, requireRecipe } from '../src/game/factories'
import {
  HISTORY_DAYS,
  absoluteDay,
  createMarket,
  goodCategory,
  isPriced,
  marketKey,
  priceOf,
} from '../src/game/economy'
import { buyAnimal } from '../src/game/livestock'
import { stockStall } from '../src/game/market'
import { MATERIALS } from '../src/game/materials'
import { demolishBuilding, placeBuilding } from '../src/game/placement'
import { collectMachine, insertIntoMachine, machineById, placeMachine } from '../src/game/production'
import { PRODUCTS, productById } from '../src/game/products'
import {
  MAX_LADDER_LEVEL,
  addMaterials,
  createProgression,
  depositItem,
  requiredLevel,
  spaceCheck,
  storeOf,
} from '../src/game/progression'
import { deserialize, serialize } from '../src/game/save'
import { buy, sellValue } from '../src/game/shop'
import { CROPS } from '../src/game/crops'
import { TREES } from '../src/game/trees'
import { itemLabel } from '../src/shell/ui/ledger'
import { addItem, cloneState, countItem, createState, itemKey, itemName, tileIndex } from '../src/game/state'
import type { GameState, ItemRef } from '../src/game/types'

/* ------------------------------------------------------------------- fixtures */

/** A farm with the whole business standing on it: room, materials, level and land. */
function business(seed = 4): GameState {
  const state = createState(seed)
  state.gold = 400_000
  state.progression = {
    ...createProgression(),
    level: 90,
    siloCap: 4000,
    barnCap: 4000,
  }
  // Bare ground everywhere the farmhouse and the pond are not, so placement has room.
  for (const tile of state.tiles) {
    if (tile.ground !== 'path' && tile.ground !== 'water') {
      tile.ground = 'grass'
      tile.plant = null
      tile.watered = false
      tile.fertilized = false
      tile.sprinkler = false
    }
  }
  state.inventory = []
  return addMaterials(state, {
    wood: 400,
    stone: 300,
    fibre: 200,
    plank: 200,
    nail: 200,
    screw: 120,
    bolt: 120,
    tape: 60,
    mallet: 8,
    saw: 8,
    axe: 8,
    deed: 20,
  })
}

const GOLD_WHEAT: ItemRef = { kind: 'produce', cropId: 'wheat', quality: 'gold' }

/** One of each `ItemRef` variant, for the exhaustiveness sweeps. */
const EVERY_VARIANT: readonly ItemRef[] = [
  { kind: 'seed', cropId: 'parsnip' },
  { kind: 'produce', cropId: 'parsnip', quality: 'gold' },
  { kind: 'good', goodId: 'sprinkler' },
  { kind: 'product', productId: 'cheese', quality: 'silver' },
  { kind: 'material', materialId: 'plank' },
]

/* =========================================================== the overnight pass */

describe('sleep runs every overnight pass, in the documented order', () => {
  /**
   * A farm with an animal, a machine mid-job and a stocked stall, so one night has
   * something to do in every pass.
   */
  function busyNight(): GameState {
    let state = business(11)
    state = placeBuilding(state, 'coop', 4, 4).state
    state = placeBuilding(state, 'silo', 0, 4).state
    state = placeBuilding(state, 'stall', 4, 0).state
    state = buyAnimal(state, 'chicken', 'bld-1', 'HEN').state
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = addItem(state, GOLD_WHEAT, 3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state = addItem(state, { kind: 'produce', cropId: 'parsnip', quality: 'normal' }, 40)
    const parsnip: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
    state = stockStall(state, 0, parsnip, 40, 60).state
    state.hay = 200
    return state
  }

  it('sets everything up the passes need', () => {
    const state = busyNight()
    expect(state.buildings).toHaveLength(3)
    expect(state.animals).toHaveLength(1)
    expect(state.machines).toHaveLength(1)
    expect(state.machines[0].queue).toHaveLength(1)
    expect(state.stall[0].count).toBe(40)
  })

  it('feeds the animals from the silo before anything else touches the hay', () => {
    const state = busyNight()
    const { state: morning, report } = sleep(state)
    expect(report.fed).toBe(1)
    expect(report.unfed).toBe(0)
    expect(morning.hay).toBeLessThan(state.hay)
    expect(report.fed + report.unfed).toBe(state.animals.length)
  })

  it('works the machines and books what came off the line', () => {
    const state = busyNight()
    const { state: morning, report } = sleep(state)
    expect(report.machinesFinished).toBe(1)
    expect(report.machinesBlocked).toBe(0)
    expect(machineById(morning, 'mch-1')?.queue).toHaveLength(0)
    expect(countItem(morning, { kind: 'product', productId: 'flour', quality: 'gold' })).toBe(2)
  })

  it('sells from the stall at the price the player named, to the gold', () => {
    const state = busyNight()
    const { state: morning, report } = sleep(state)
    expect(report.stallSold).toBeGreaterThan(0)
    expect(report.stallEarned).toBe(report.stallSold * state.stall[0].price)
    expect(morning.stall[0].count).toBe(state.stall[0].count - report.stallSold)
    expect(morning.gold - state.gold).toBe(report.stallEarned)
  })

  it('holds a finished job in the machine, and says so, when the barn is full', () => {
    const state = busyNight()
    state.progression.barnCap = 0
    const { state: morning, report } = sleep(state)
    expect(report.machinesFinished).toBe(0)
    expect(report.machinesBlocked).toBe(1)
    const held = machineById(morning, 'mch-1')?.ready ?? []
    expect(held).toHaveLength(1)
    expect(held[0].count).toBe(2)
    expect(held[0].item).toEqual({ kind: 'product', productId: 'flour', quality: 'gold' })
  })

  it('assesses the levy against the season that is ending, not the one beginning', () => {
    const state = busyNight()
    state.day = DAYS_PER_SEASON
    const { state: morning, report } = sleep(state)
    expect(report.seasonChanged).toBe(true)
    expect(report.tax).not.toBeNull()
    expect(morning.season).toBe('summer')
    expect(morning.day).toBe(1)
    // The next season opens its books at today's totals, so the next levy is exact.
    expect(morning.market.ledger?.season).toBe(1)
    expect(morning.market.ledger?.earnedAt).toBe(morning.stats.earned)
  })

  it('rolls the week event and records prices against the new day', () => {
    const state = busyNight()
    const { state: morning } = sleep(state)
    expect(morning.market.event).not.toBeNull()
    expect(morning.market.eventWeek).toBe(Math.floor(absoluteDay(morning) / 7))
    const last = morning.market.history[morning.market.history.length - 1]
    expect(last.day).toBe(absoluteDay(morning))
  })
})

describe('a simulated year', () => {
  /**
   * Four seasons of nights, with the report checked against what the state actually did on
   * every single one of them. Anything the morning panel claims is measured here.
   */
  it('reports truthfully, every night, for a whole year', () => {
    let state = business(23)
    state = placeBuilding(state, 'coop', 4, 4).state
    state = placeBuilding(state, 'silo', 0, 4).state
    state = placeBuilding(state, 'stall', 4, 0).state
    state = buyAnimal(state, 'chicken', 'bld-1', 'HEN').state
    state = buyAnimal(state, 'chicken', 'bld-1', 'CLUCK').state
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = addItem(state, GOLD_WHEAT, 60)
    const parsnip: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
    state = addItem(state, parsnip, 300)
    state = stockStall(state, 0, parsnip, 300, 40).state
    state.hay = 2000

    const days = DAYS_PER_SEASON * SEASONS.length
    let taxNights = 0
    let seasonsTurned = 0
    let stallEarnedTotal = 0

    for (let night = 0; night < days; night++) {
      // Keep the mill fed, so the workshop pass has something to do most nights.
      if (countItem(state, GOLD_WHEAT) >= 3 && state.machines[0].queue.length < 3) {
        state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
      }
      const before = cloneState(state)
      const queuedBefore = before.machines.reduce((n, m) => n + m.queue.length, 0)

      const { state: after, report } = sleep(before)

      // -- the barnyard: every animal is accounted for, in exactly one bucket
      expect(report.fed + report.unfed).toBe(before.animals.length)
      expect(report.animalsUnwell).toBe(after.animals.filter((a) => a.unwell).length)

      // -- the workshop: jobs that left a queue either reached the barn or are held
      const queuedAfter = after.machines.reduce((n, m) => n + m.queue.length, 0)
      const worked = Math.max(0, queuedBefore - queuedAfter)
      expect(report.machinesFinished + report.machinesBlocked).toBe(worked)
      const heldAfter = after.machines.reduce(
        (n, m) => n + m.ready.reduce((k, lot) => k + lot.count, 0),
        0,
      )
      const heldBefore = before.machines.reduce(
        (n, m) => n + m.ready.reduce((k, lot) => k + lot.count, 0),
        0,
      )
      if (report.machinesBlocked === 0) expect(heldAfter).toBe(heldBefore)

      // -- the stall: the units left and the gold that came in agree with the report
      const soldUnits = before.stall.reduce((n, slot, i) => {
        const then = slot.item === null ? 0 : slot.count
        const now = after.stall[i].item === null ? 0 : after.stall[i].count
        return n + Math.max(0, then - now)
      }, 0)
      expect(report.stallSold).toBe(soldUnits)
      stallEarnedTotal += report.stallEarned

      // -- the books: the levy lands on the last night of a season and nowhere else
      if (before.day === DAYS_PER_SEASON) {
        expect(report.tax).not.toBeNull()
        taxNights++
      } else {
        expect(report.tax).toBeNull()
      }
      if (report.seasonChanged) seasonsTurned++

      // -- the calendar and the ledger
      expect(after.market.history.length).toBeLessThanOrEqual(HISTORY_DAYS)
      expect(after.market.history[after.market.history.length - 1].day).toBe(absoluteDay(after))
      // The town always has work on the board, and never more than it offers.
      expect(after.orders.filter((o) => !o.accepted && o.kind === 'delivery').length).toBe(3)

      state = after
    }

    expect(taxNights).toBe(SEASONS.length)
    expect(seasonsTurned).toBe(SEASONS.length)
    expect(state.year).toBe(2)
    expect(state.season).toBe('spring')
    expect(state.day).toBe(1)
    expect(stallEarnedTotal).toBeGreaterThan(0)
    expect(state.stats.daysPlayed).toBe(days)
  })

  it('replays a year identically from the same seed', () => {
    const run = (): GameState => {
      let state = business(31)
      for (let i = 0; i < 60; i++) state = sleep(state).state
      return state
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })

  it('survives a save and a load in the middle of a night-by-night year', () => {
    let state = business(17)
    state = placeBuilding(state, 'coop', 4, 4).state
    state = buyAnimal(state, 'chicken', 'bld-1', 'HEN').state
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = addItem(state, GOLD_WHEAT, 9)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    for (let i = 0; i < 10; i++) state = sleep(state).state

    const loaded = deserialize(serialize(state))
    expect(loaded).not.toBeNull()
    if (loaded === null) return
    expect(loaded).toEqual(state)
    // And the loaded farm runs the next night to exactly the same place.
    expect(JSON.stringify(sleep(loaded).state)).toBe(JSON.stringify(sleep(state).state))
  })
})

/* ================================================================ the chain */

describe('quality through a three-deep chain', () => {
  /**
   * `docs/GAMEPLAY.md` §3: a gold input makes a gold output, all the way down. Run for
   * real — placed machines, queued jobs, nights slept, output collected — rather than by
   * calling the grading helper directly.
   */
  it('carries gold from wheat through flour to bread, end to end', () => {
    let state = business(5)
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = placeMachine(state, 'bakery', tileIndex(7, 3)).state
    expect(state.machines).toHaveLength(2)

    // Step one: three gold wheat into the mill.
    state = addItem(state, GOLD_WHEAT, 3)
    const milling = insertIntoMachine(state, 'mch-1', 'mill.flour')
    expect(milling.ok).toBe(true)
    state = milling.state
    expect(state.machines[0].queue[0].quality).toBe('gold')

    state = sleep(state).state
    const goldFlour: ItemRef = { kind: 'product', productId: 'flour', quality: 'gold' }
    expect(countItem(state, goldFlour)).toBe(2)

    // Step two: gold flour and a gold egg into the bakery.
    state = addItem(state, { kind: 'product', productId: 'egg', quality: 'gold' }, 1)
    const baking = insertIntoMachine(state, 'mch-2', 'bakery.bread')
    expect(baking.ok).toBe(true)
    state = baking.state
    expect(state.machines[1].queue[0].quality).toBe('gold')

    state = sleep(state).state
    const goldBread: ItemRef = { kind: 'product', productId: 'bread', quality: 'gold' }
    expect(countItem(state, goldBread)).toBeGreaterThan(0)

    // And the grade is worth something at the end of it: gold bread out-prices normal
    // bread, which out-prices the gold wheat it started as.
    const normalBread: ItemRef = { kind: 'product', productId: 'bread', quality: 'normal' }
    expect(priceOf(state, goldBread)).toBeGreaterThan(priceOf(state, normalBread))
    expect(priceOf(state, goldBread)).toBeGreaterThan(priceOf(state, GOLD_WHEAT))
  })

  it('grades a batch by its best ingredient and keeps the rest of the gold back', () => {
    let state = business(6)
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = addItem(state, { kind: 'produce', cropId: 'wheat', quality: 'normal' }, 2)
    state = addItem(state, GOLD_WHEAT, 4)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    expect(state.machines[0].queue[0].quality).toBe('gold')
    // One gold went in to set the mark; the rest of the gold is still the player's.
    expect(countItem(state, GOLD_WHEAT)).toBe(3)
    expect(countItem(state, { kind: 'produce', cropId: 'wheat', quality: 'normal' })).toBe(0)
  })
})

/* ================================================== nothing is ever destroyed */

describe('storage is consulted everywhere', () => {
  it('never lets addItem push a store past its cap', () => {
    const state = business(8)
    state.progression.siloCap = 10
    const wheat: ItemRef = { kind: 'produce', cropId: 'wheat', quality: 'normal' }
    const over = addItem(state, wheat, 40)
    expect(countItem(over, wheat)).toBe(10)
    expect(spaceCheck(over, wheat, 1).ok).toBe(false)
  })

  it('refuses a harvest the silo cannot take, and leaves the crop standing', () => {
    let state = business(12)
    state.progression.siloCap = 0
    const at = tileIndex(4, 2)
    state.tiles[at].ground = 'soil'
    state.tiles[at].plant = {
      cropId: 'parsnip',
      stage: 4,
      progress: 0,
      dry: 0,
      dead: false,
      fertilized: false,
      regrown: 0,
    }
    const refused = harvest(state, at)
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('SILO')
    expect(refused.state.tiles[at].plant).not.toBeNull()

    // Room appears, and the same swing works.
    state = refused.state
    state.progression.siloCap = 100
    const picked = harvest(state, at)
    expect(picked.ok).toBe(true)
    expect(picked.state.tiles[at].plant).toBeNull()
  })

  it('refuses a purchase there is no shelf for, and charges nothing for asking', () => {
    const state = business(13)
    state.progression.siloCap = 0
    const result = buy(state, { kind: 'seed', cropId: 'parsnip' }, 5)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('SILO')
    expect(result.state.gold).toBe(state.gold)
  })

  it('will not pull the stall down while stock is still priced on it', () => {
    let state = business(14)
    state = placeBuilding(state, 'stall', 4, 0).state
    const parsnip: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
    state = addItem(state, parsnip, 10)
    state = stockStall(state, 0, parsnip, 10, 50).state
    const pulled = demolishBuilding(state, 'bld-1')
    expect(pulled.ok).toBe(false)
    expect(pulled.message).toContain('STOCK')
    expect(pulled.state.stall[0].count).toBe(10)
  })

  it('hands a machine its output back rather than dropping it, on collection too', () => {
    let state = business(15)
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    state = addItem(state, GOLD_WHEAT, 3)
    state = insertIntoMachine(state, 'mch-1', 'mill.flour').state
    state.progression.barnCap = 0
    state = sleep(state).state

    const stuck = collectMachine(state, 'mch-1')
    expect(stuck.ok).toBe(false)
    expect(machineById(stuck.state, 'mch-1')?.ready[0].count).toBe(2)

    const roomy = { ...stuck.state, progression: { ...stuck.state.progression, barnCap: 4000 } }
    const freed = collectMachine(roomy, 'mch-1')
    expect(freed.ok).toBe(true)
    expect(machineById(freed.state, 'mch-1')?.ready).toHaveLength(0)
    expect(countItem(freed.state, { kind: 'product', productId: 'flour', quality: 'gold' })).toBe(2)
  })

  it('pays clearing in materials and experience, and only on land you own', () => {
    let state = business(16)
    const owned = tileIndex(3, 5)
    state.tiles[owned].ground = 'rock'
    const cleared = clearDebris(state, owned)
    expect(cleared.ok).toBe(true)
    expect(cleared.state.progression.xp).toBeGreaterThan(state.progression.xp)

    state = cleared.state
    const beyond = tileIndex(10, 5)
    state.tiles[beyond].ground = 'rock'
    const refused = clearDebris(state, beyond)
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('NOT YOURS')
    expect(refused.state.tiles[beyond].ground).toBe('rock')
  })

  it('takes a deposit apart into what fits and what does not, and loses neither', () => {
    const state = business(18)
    state.progression.barnCap = 3
    const cheese: ItemRef = { kind: 'product', productId: 'cheese', quality: 'gold' }
    const deposit = depositItem(state, cheese, 10)
    expect(deposit.stored + deposit.refused).toBe(10)
    expect(countItem(deposit.state, cheese)).toBe(deposit.stored)
    expect(deposit.message).toContain('BARN STORE')
  })
})

/* ============================================================== every variant */

describe('every ItemRef variant is handled everywhere it is consumed', () => {
  it('keys and names each one distinctly, with nothing blank', () => {
    const keys = EVERY_VARIANT.map(itemKey)
    expect(new Set(keys).size).toBe(EVERY_VARIANT.length)
    for (const item of EVERY_VARIANT) {
      expect(itemKey(item).length).toBeGreaterThan(0)
      expect(itemName(item).length).toBeGreaterThan(0)
      expect(itemName(item)).not.toContain('undefined')
    }
    expect(itemName({ kind: 'product', productId: 'cheese', quality: 'gold' })).toBe('GOLD CHEESE')
    expect(itemName({ kind: 'material', materialId: 'plank' })).toBe('PLANK')
  })

  it('routes each one to a store, a market key and a category', () => {
    for (const item of EVERY_VARIANT) {
      expect(['silo', 'barn']).toContain(storeOf(item))
      expect(marketKey(item).length).toBeGreaterThan(0)
      expect(goodCategory(item).length).toBeGreaterThan(0)
      expect(isPriced(item)).toBe(true)
      expect(priceOf(neutralFarm(), item)).toBeGreaterThan(0)
    }
  })

  it('prices each one at the counter, materials excepted', () => {
    expect(sellValue({ kind: 'seed', cropId: 'parsnip' })).toBeGreaterThan(0)
    expect(sellValue({ kind: 'produce', cropId: 'parsnip', quality: 'gold' })).toBeGreaterThan(0)
    expect(sellValue({ kind: 'good', goodId: 'sprinkler' })).toBeGreaterThan(0)
    expect(sellValue({ kind: 'product', productId: 'cheese', quality: 'gold' })).toBeGreaterThan(
      sellValue({ kind: 'product', productId: 'cheese', quality: 'normal' }),
    )
    // Materials are earned and spent, never traded. `docs/PROGRESSION.md` §2.
    expect(sellValue({ kind: 'material', materialId: 'plank' })).toBe(0)
  })

  it('round-trips each one through a save', () => {
    let state = createState(21)
    state.inventory = []
    for (const item of EVERY_VARIANT) state = addItem(state, item, 2)
    const loaded = deserialize(serialize(state))
    expect(loaded).not.toBeNull()
    if (loaded === null) return
    for (const item of EVERY_VARIANT) expect(countItem(loaded, item)).toBe(2)
  })

  it('is exhaustive in the shell ledger too', () => {
    for (const item of EVERY_VARIANT) {
      expect(itemLabel(item).length).toBeGreaterThan(0)
      expect(itemLabel(item)).not.toContain('undefined')
    }
  })
})

/** A farm with a fresh, neutral market, for the variant price sweep. */
function neutralFarm(): GameState {
  const state = createState(2)
  state.market = createMarket()
  return state
}

/* =================================================================== purity */

describe('src/game stays a pure function of its seed', () => {
  function gameFiles(): string[] {
    const dir = join(process.cwd(), 'src', 'game')
    return readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => join(dir, name))
  }

  /** Strips block and line comments, so a doc comment naming `Math.random` is not a hit. */
  function code(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }

  it('covers every module in the folder', () => {
    expect(gameFiles().length).toBeGreaterThan(20)
  })

  it('never reaches for the clock, the dice, the window or the document', () => {
    const banned: ReadonlyArray<readonly [string, RegExp]> = [
      ['Math.random', /\bMath\s*\.\s*random\b/],
      ['Date', /\bnew\s+Date\b|\bDate\s*\.\s*now\b/],
      ['window', /\bwindow\s*\./],
      ['document', /\bdocument\s*\./],
      ['performance', /\bperformance\s*\.\s*now\b/],
      ['localStorage', /\blocalStorage\b/],
    ]
    for (const file of gameFiles()) {
      const source = code(readFileSync(file, 'utf8'))
      for (const [name, pattern] of banned) {
        expect(pattern.test(source), `${file} reaches for ${name}`).toBe(false)
      }
    }
  })
})

/* ========================================================= the unlock ladder */

describe('every factory is reachable and fed', () => {
  it('puts all thirty factories on the ladder inside a hundred levels', () => {
    expect(MACHINES).toHaveLength(30)
    for (const machine of MACHINES) {
      const level = requiredLevel(`factory:${machine.kind}`)
      expect(level, `${machine.kind} is not on the ladder`).toBeGreaterThan(0)
      expect(level, `${machine.kind} is past the ladder`).toBeLessThanOrEqual(MAX_LADDER_LEVEL)
      expect(level).toBe(machine.level)
    }
  })

  it('hands the level-hundred player every one of them', () => {
    expect(machinesForLevel(MAX_LADDER_LEVEL)).toHaveLength(MACHINES.length)
  })

  it('feeds every factory from something the farm can actually produce', () => {
    // Everything a farm can hold: crops and tree fruit, animal produce, factory output,
    // and the materials that come out of the ground.
    const obtainable = new Set<string>()
    for (const product of PRODUCTS) obtainable.add(`product:${product.id}`)
    for (const material of MATERIALS) obtainable.add(`material:${material.id}`)
    for (const crop of CROPS) obtainable.add(`produce:${crop.id}`)
    for (const tree of TREES) obtainable.add(`produce:${tree.id}`)

    for (const machine of MACHINES) {
      expect(machine.recipes.length, `${machine.kind} has no recipes`).toBeGreaterThan(0)
      for (const recipe of machine.recipes) {
        expect(recipe.inputs.length, `${recipe.id} eats nothing`).toBeGreaterThan(0)
        for (const input of recipe.inputs) {
          expect(
            obtainable.has(marketKey(input.item)),
            `${recipe.id} asks for ${marketKey(input.item)}, which nothing produces`,
          ).toBe(true)
        }
        expect(productById(recipe.outputProductId), `${recipe.id} makes nothing real`).toBeDefined()
        expect(requireRecipe(recipe.id).id).toBe(recipe.id)
      }
    }
  })
})

/* ======================================================= the buildings' effects */

describe('a building does what its catalogue entry says it does', () => {
  it('opens the stall slots when the stall is raised, and closes them when it goes', () => {
    let state = business(25)
    expect(state.stall).toHaveLength(0)
    const raised = placeBuilding(state, 'stall', 4, 0)
    expect(raised.ok).toBe(true)
    state = raised.state
    expect(state.stall.length).toBeGreaterThan(0)

    const gone = demolishBuilding(state, 'bld-1')
    expect(gone.ok).toBe(true)
    expect(gone.state.stall).toHaveLength(0)
  })

  it('adds the barn store shelves to the barn cap, and takes them away again', () => {
    let state = business(26)
    const before = state.progression.barnCap
    const raised = placeBuilding(state, 'barn-store', 4, 4)
    expect(raised.ok).toBe(true)
    state = raised.state
    expect(state.progression.barnCap).toBe(before + 100)

    const gone = demolishBuilding(state, 'bld-1')
    expect(gone.ok).toBe(true)
    expect(gone.state.progression.barnCap).toBe(before)
  })

  it('mirrors what is standing on a tile onto the tile itself', () => {
    let state = business(27)
    state = placeBuilding(state, 'coop', 4, 4).state
    state = placeMachine(state, 'mill', tileIndex(7, 2)).state
    expect(state.tiles[tileIndex(4, 4)].buildingId).toBe('bld-1')
    expect(state.tiles[tileIndex(6, 6)].buildingId).toBe('bld-1')
    expect(state.tiles[tileIndex(7, 2)].machineId).toBe('mch-1')
    // And the mirror survives a clone and a save, which it did not before.
    expect(cloneState(state).tiles[tileIndex(4, 4)].buildingId).toBe('bld-1')
    const loaded = deserialize(serialize(state))
    expect(loaded?.tiles[tileIndex(7, 2)].machineId).toBe('mch-1')
  })
})
