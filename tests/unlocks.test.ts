import { describe, expect, it } from 'vitest'
import { BUILDINGS } from '../src/game/buildings'
import { CROPS } from '../src/game/crops'
import { MACHINES } from '../src/game/factories'
import { REGIONS, isFreeRegion } from '../src/game/regions'
import { SPECIES } from '../src/game/species'
import { TREES } from '../src/game/trees'
import {
  LEVEL_CAP,
  MAX_LADDER_LEVEL,
  allUnlocks,
  assertLadderComplete,
  isKnownUnlock,
  ladderProblems,
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
} from '../src/game/unlocks'
import type { UnlockKind } from '../src/game/unlocks'

const KINDS: readonly UnlockKind[] = [
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
]

describe('the ladder', () => {
  it('runs a hundred rungs, and every single one opens something real', () => {
    expect(MAX_LADDER_LEVEL).toBe(100)
    const empty: number[] = []
    for (let level = 1; level <= MAX_LADDER_LEVEL; level++) {
      if (unlocksAt(level).length === 0) empty.push(level)
    }
    expect(empty, `these levels unlock nothing: ${empty.join(', ')}`).toEqual([])
  })

  it('reports no problems at all, and says so by throwing nothing', () => {
    expect(ladderProblems()).toEqual([])
    expect(() => assertLadderComplete()).not.toThrow()
  })

  it('never unlocks the same thing twice', () => {
    const all = allUnlocks()
    expect(new Set(all).size).toBe(all.length)
  })

  it('gives every rung a known kind and a printable name', () => {
    for (const id of allUnlocks()) {
      const kind = unlockKind(id)
      expect(kind, `"${id}" has no kind`).not.toBeNull()
      expect(KINDS, id).toContain(kind)
      expect(unlockName(id).trim().length, id).toBeGreaterThan(0)
    }
  })

  it('is empty outside one to a hundred', () => {
    expect(unlocksAt(0)).toEqual([])
    expect(unlocksAt(-4)).toEqual([])
    expect(unlocksAt(101)).toEqual([])
    expect(unlocksAt(MAX_LADDER_LEVEL).length).toBeGreaterThan(0)
  })

  it('answers requiredLevel with the level the rung actually sits on', () => {
    for (let level = 1; level <= MAX_LADDER_LEVEL; level++) {
      for (const id of unlocksAt(level)) {
        expect(requiredLevel(id), id).toBe(level)
        expect(isKnownUnlock(id), id).toBe(true)
      }
    }
  })

  it('treats content it has never met as free rather than as locked forever', () => {
    expect(isKnownUnlock('factory:teleporter')).toBe(false)
    expect(requiredLevel('factory:teleporter')).toBe(1)
  })

  it('answers for a bare name and for a differently namespaced id', () => {
    expect(requiredLevel('wheat')).toBe(requiredLevel('crop:wheat'))
    expect(requiredLevel('machine:mill')).toBe(requiredLevel('factory:mill'))
  })

  it('sorts unlocksOfKind into level order, and covers every kind', () => {
    for (const kind of KINDS) {
      const ids = unlocksOfKind(kind)
      expect(ids.length, `nothing on the ladder is a ${kind}`).toBeGreaterThan(0)
      for (const id of ids) expect(unlockKind(id)).toBe(kind)
      const levels = ids.map(requiredLevel)
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i], `${kind} ${ids[i]}`).toBeGreaterThanOrEqual(levels[i - 1])
      }
    }
  })
})

describe('there really are a hundred things to unlock', () => {
  it('counts enough content for the ladder never to pad', () => {
    const content =
      CROPS.length + TREES.length + SPECIES.length + MACHINES.length + BUILDINGS.length
    expect(content).toBeGreaterThanOrEqual(MAX_LADDER_LEVEL)
    expect(allUnlocks().length).toBeGreaterThanOrEqual(MAX_LADDER_LEVEL)
  })

  it('puts every crop, tree, animal, factory and building on the ladder', () => {
    for (const crop of CROPS) expect(isKnownUnlock(`crop:${crop.id}`), crop.id).toBe(true)
    for (const tree of TREES) expect(isKnownUnlock(`tree:${tree.id}`), tree.id).toBe(true)
    for (const species of SPECIES) {
      expect(isKnownUnlock(`animal:${species.id}`), species.id).toBe(true)
    }
    for (const machine of MACHINES) {
      expect(isKnownUnlock(`factory:${machine.kind}`), machine.kind).toBe(true)
    }
    for (const building of BUILDINGS) {
      expect(isKnownUnlock(`building:${building.kind}`), building.kind).toBe(true)
    }
  })

  it('sells every region at the level its own deed office quotes', () => {
    for (const region of REGIONS) {
      if (isFreeRegion(region)) {
        expect(isKnownUnlock(`region:${region.id}`), region.id).toBe(false)
        continue
      }
      expect(requiredLevel(`region:${region.id}`), region.id).toBe(region.level)
      expect(unlockName(`region:${region.id}`)).toBe(region.name)
    }
  })

  it('opens both stores to extension', () => {
    expect(isKnownUnlock('storage:silo-expansion')).toBe(true)
    expect(isKnownUnlock('storage:barn-expansion')).toBe(true)
  })

  it('opens every selling channel the economy contract names', () => {
    for (const id of [
      'system:shipping-bin',
      'system:town-market',
      'system:delivery-orders',
      'system:boat-crates',
      'system:credit',
      'building:stall',
    ]) {
      expect(isKnownUnlock(id), id).toBe(true)
    }
  })

  it('opens a coop before a chicken, a barn before a cow, an apiary before a bee', () => {
    expect(requiredLevel('building:coop')).toBeLessThanOrEqual(requiredLevel('animal:chicken'))
    expect(requiredLevel('building:barn')).toBeLessThanOrEqual(requiredLevel('animal:cow'))
    expect(requiredLevel('building:apiary')).toBeLessThanOrEqual(requiredLevel('animal:bee'))
    expect(requiredLevel('building:stable')).toBeLessThanOrEqual(requiredLevel('animal:horse'))
    expect(requiredLevel('building:pond')).toBeLessThanOrEqual(requiredLevel('animal:fish'))
  })

  it('houses every animal at or before the level the animal itself arrives', () => {
    for (const species of SPECIES) {
      const homes = BUILDINGS.filter((b) => b.species.includes(species.id))
      const earliest = Math.min(...homes.map((b) => b.level))
      expect(species.level, `${species.id} arrives before its housing`).toBeGreaterThanOrEqual(
        earliest,
      )
    }
  })

  it('keeps the keg a second-year achievement, not a first-year formality', () => {
    expect(requiredLevel('factory:keg')).toBeGreaterThanOrEqual(80)
  })
})

describe('the experience curve', () => {
  it('is strictly increasing, level after level', () => {
    for (let level = 1; level < LEVEL_CAP; level++) {
      expect(xpForLevel(level + 1), `level ${level + 1}`).toBeGreaterThan(xpForLevel(level))
    }
  })

  it('costs a hundred to leave level one, and far more to leave the hundredth', () => {
    expect(xpForLevel(1)).toBe(100)
    expect(xpForLevel(100)).toBeGreaterThan(xpForLevel(50) * 2)
  })

  it('tolerates a fractional or nonsense level rather than answering NaN', () => {
    expect(xpForLevel(0)).toBe(xpForLevel(1))
    expect(xpForLevel(-5)).toBe(xpForLevel(1))
    expect(xpForLevel(3.7)).toBe(xpForLevel(3))
  })

  it('accumulates: reaching a level costs the sum of every step below it', () => {
    expect(totalXpForLevel(1)).toBe(0)
    let running = 0
    for (let level = 1; level <= 120; level++) {
      expect(totalXpForLevel(level), `total for ${level}`).toBe(running)
      running += xpForLevel(level)
    }
  })

  it('is strictly increasing in total as well as in step', () => {
    for (let level = 1; level < 200; level++) {
      expect(totalXpForLevel(level + 1)).toBeGreaterThan(totalXpForLevel(level))
    }
  })
})

describe('levelForXp', () => {
  it('round-trips: the total for a level buys exactly that level', () => {
    for (let level = 1; level <= MAX_LADDER_LEVEL; level++) {
      expect(levelForXp(totalXpForLevel(level)), `level ${level}`).toBe(level)
    }
  })

  it('stays a level short one experience point below the threshold', () => {
    for (let level = 2; level <= MAX_LADDER_LEVEL; level++) {
      expect(levelForXp(totalXpForLevel(level) - 1), `level ${level}`).toBe(level - 1)
    }
  })

  it('never falls below one, whatever it is handed', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(-1)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(Number.NaN)).toBe(1)
  })

  it('stops at the cap rather than spinning on a corrupt total', () => {
    expect(levelForXp(Number.POSITIVE_INFINITY)).toBe(1)
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(LEVEL_CAP)
  })

  it('never goes backwards as experience climbs', () => {
    let last = 1
    for (let xp = 0; xp < 400_000; xp += 977) {
      const level = levelForXp(xp)
      expect(level).toBeGreaterThanOrEqual(last)
      last = level
    }
  })
})

describe('levelProgress', () => {
  it('reads exactly zero into a level at the moment it is reached', () => {
    for (const level of [1, 2, 10, 47, 100]) {
      const bar = levelProgress(totalXpForLevel(level))
      expect(bar.level).toBe(level)
      expect(bar.into).toBe(0)
      expect(bar.need).toBe(xpForLevel(level))
      expect(bar.total).toBe(totalXpForLevel(level))
    }
  })

  it('reads part of the way up when part of the way up', () => {
    const base = totalXpForLevel(12)
    const bar = levelProgress(base + 40)
    expect(bar.level).toBe(12)
    expect(bar.into).toBe(40)
    expect(bar.into).toBeLessThan(bar.need)
  })

  it('never reports negative progress on a corrupt total', () => {
    const bar = levelProgress(-500)
    expect(bar.level).toBe(1)
    expect(bar.into).toBe(0)
    expect(bar.total).toBe(0)
  })
})

describe('level rewards', () => {
  it('pays nothing for the level the player starts on', () => {
    expect(levelReward(1).gold).toBe(0)
    expect(levelReward(1).materials).toEqual({})
  })

  it('pays real gold at every rung past the first', () => {
    for (let level = 2; level <= MAX_LADDER_LEVEL; level++) {
      expect(levelReward(level).gold, `level ${level}`).toBeGreaterThan(0)
    }
  })

  it('pays more the higher it goes, milestone bonuses aside', () => {
    expect(levelReward(50).gold).toBeGreaterThan(levelReward(20).gold)
    expect(levelReward(100).gold).toBeGreaterThan(levelReward(50).gold)
    expect(levelReward(10).gold).toBeGreaterThan(levelReward(9).gold)
  })

  it('keeps paying past the ladder, where the unlocks stop', () => {
    expect(levelReward(120).gold).toBeGreaterThan(0)
    expect(unlocksAt(120)).toEqual([])
  })

  it('hands out land deeds somewhere on the way, or the valley is unbuyable', () => {
    let deeds = 0
    for (let level = 1; level <= MAX_LADDER_LEVEL; level++) {
      deeds += levelReward(level).materials.deed ?? 0
    }
    expect(deeds).toBeGreaterThan(0)
  })

  it('gifts enough gold across the hundred to buy the valley, and no more than twice over', () => {
    let gold = 0
    for (let level = 1; level <= MAX_LADDER_LEVEL; level++) gold += levelReward(level).gold
    const land = REGIONS.reduce((sum, region) => sum + region.cost, 0)
    expect(gold).toBeGreaterThan(land)
    expect(gold).toBeLessThan(land * 2)
  })
})
