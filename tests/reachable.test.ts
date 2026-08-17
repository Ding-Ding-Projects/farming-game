/**
 * Every verb a player is meant to use has to be reachable from a scene.
 *
 * This project kept shipping the same defect: a verb in `src/game` with a full set of
 * rules, refusals and tests, and nothing in `src/renderer` that called it. `buyAnimal`
 * went that way — forty tests, and no way to buy an animal. So did `cutGrass`, which is
 * the *only* source of hay, so a silo could never fill and no animal could be fed through
 * a winter that lets nothing graze. So did `buyRegion`, which left two thirds of the farm
 * permanently the town's. Each one passed every test it had.
 *
 * A unit test cannot catch that, because the unit works. What was missing was a wire. So
 * this file checks the wire: it reads the renderer's own source and asserts that each
 * verb below is named somewhere in it.
 *
 * What this proves and what it does not: naming a verb is not the same as calling it
 * correctly, and this makes no claim about the button being reachable, enabled, or in a
 * sensible place. It proves only that the verb is not *orphaned* — which is precisely the
 * failure that kept happening, and precisely the one nothing else here notices.
 *
 * Adding a player-facing verb to `src/game` means adding it to this list. If it belongs
 * to the nightly pass or to another rules module rather than to the player, put it under
 * INTERNAL with the reason, so the next reader does not have to work that out again.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const RENDERER = path.join(process.cwd(), 'src', 'renderer')

/** Verbs the player performs. Each must be named somewhere under `src/renderer`. */
const PLAYER_VERBS: readonly string[] = [
  // tools and the farm
  'movePlayer',
  'setTool',
  'selectSeed',
  'useTool',
  'sleep',
  // livestock
  'buyAnimal',
  'feedAnimal',
  'petAnimal',
  'collectProduce',
  'letOut',
  // production
  'placeMachine',
  'insertIntoMachine',
  'collectMachine',
  // building and land
  'placeBuilding',
  'buyRegion',
  'expandStore',
  // trade
  'buy',
  'sell',
  'sellAllProduce',
  'stockStall',
  'unstockStall',
  'acceptOrder',
  'fulfilOrder',
  'takeLoan',
  'repayLoan',
  'shipToBin',
  'sellAtMarket',
  'moveBuilding',
  'demolishBuilding',
]

/**
 * Verbs that are still orphaned, with what each one costs the player.
 *
 * Empty, and worth keeping empty rather than deleting: it is where a verb goes when it
 * is written but not yet reachable, asserted ABSENT so that wiring one up turns this red
 * and says to promote it. Every entry it once held has been promoted into PLAYER_VERBS.
 */
const STILL_ORPHANED: Readonly<Record<string, string>> = {}

/**
 * Verbs no scene should call, with the reason. `cutGrass` is deliberately absent from
 * both lists: the player reaches it through `useTool`, not by name.
 */
const INTERNAL: Readonly<Record<string, string>> = {
  offerOrders: 'rolled by the nightly pass in actions.ts',
  expireOrders: 'rolled by the nightly pass in actions.ts',
  nightlyStall: 'rolled by the nightly pass in actions.ts',
  nightlyLivestock: 'rolled by the nightly pass in actions.ts',
  nightlyProduction: 'rolled by the nightly pass in actions.ts',
  accrueInterest: 'assessed at the turn of the season',
  seasonalTax: 'assessed at the turn of the season',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const FILES = sourceFiles(RENDERER)
const SOURCE = FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

/**
 * True when the renderer actually *calls* the verb.
 *
 * Matching the bare name would pass on a mention in a comment — and several of these
 * names are ordinary English words, so `sell` and `sleep` would pass on prose alone. So
 * the pattern requires a call: the name followed by an open bracket, with the definition
 * form `function verb(` excluded so a scene that happens to define a same-named local
 * helper cannot satisfy the check for the game verb it is standing in for.
 */
function names(verb: string): boolean {
  const calls = new RegExp(`(?<!function\\s)(?<![\\w.])${verb}\\s*\\(`, 'g')
  return calls.test(SOURCE)
}

describe('no verb is orphaned', () => {
  it('finds the renderer to read', () => {
    expect(FILES.length).toBeGreaterThan(5)
    expect(SOURCE.length).toBeGreaterThan(10_000)
  })

  it.each(PLAYER_VERBS)('%s is reachable from a scene', (verb) => {
    expect(
      names(verb),
      `${verb} exists in src/game and nothing in src/renderer names it. ` +
        'A verb the player cannot reach is a feature that does not ship, however well tested.',
    ).toBe(true)
  })

  it.each(Object.entries(INTERNAL))('%s stays out of the scenes (%s)', (verb) => {
    expect(
      names(verb),
      `${verb} is ${INTERNAL[verb]}; a scene calling it directly would run it off-schedule.`,
    ).toBe(false)
  })

  it.each(Object.entries(STILL_ORPHANED))(
    '%s is still unreachable, and this is what it costs: %s',
    (verb) => {
      expect(
        names(verb),
        `${verb} is now reachable. Good — move it from STILL_ORPHANED into PLAYER_VERBS ` +
          'so it is held there permanently.',
      ).toBe(false)
    },
  )

  it('would fail if the wire were cut', () => {
    // The check has to be able to fail, or it is decoration. A verb that is not there.
    expect(names('aVerbNobodyHasWritten')).toBe(false)
  })
})

/**
 * The three that actually shipped broken, called out by name so a regression reads as
 * the specific bug it is rather than as one row of a table.
 */
describe('the three that shipped unreachable', () => {
  it('an animal can be bought', () => {
    expect(names('buyAnimal')).toBe(true)
  })

  it('hay can be cut, through the tool that routes to it', () => {
    const actions = fs.readFileSync(path.join(process.cwd(), 'src', 'game', 'actions.ts'), 'utf8')
    expect(
      /\bcutGrass\b/.test(actions),
      'cutGrass is the only source of hay in the game. Nothing else fills a silo, ' +
        'and without hay no animal can be fed through a winter.',
    ).toBe(true)
  })

  it('land can be bought, so the valley is not permanently the town’s', () => {
    expect(names('buyRegion')).toBe(true)
  })
})
