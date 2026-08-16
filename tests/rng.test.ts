import { describe, expect, it } from 'vitest'
import { hashString, mulberry32, pick, randInt, rngFor } from '../src/game/rng'

function take(rand: () => number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(rand())
  return out
}

describe('mulberry32', () => {
  it('produces the same stream for the same seed', () => {
    expect(take(mulberry32(12345), 16)).toEqual(take(mulberry32(12345), 16))
  })

  it('produces a different stream for a different seed', () => {
    expect(take(mulberry32(1), 16)).not.toEqual(take(mulberry32(2), 16))
  })

  it('stays inside [0, 1)', () => {
    for (const v of take(mulberry32(99), 500)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashString', () => {
  it('is stable and unsigned', () => {
    expect(hashString('spring')).toBe(hashString('spring'))
    expect(hashString('')).toBe(2166136261)
    for (const s of ['', 'a', 'pond', 'night:1:spring:4', 'harvest:1:winter:28:12:0:0']) {
      const h = hashString(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('separates strings that differ by one character', () => {
    expect(hashString('crop:1')).not.toBe(hashString('crop:2'))
  })
})

describe('rngFor', () => {
  it('is deterministic for a (seed, salt) pair', () => {
    expect(take(rngFor(7, 'weather'), 24)).toEqual(take(rngFor(7, 'weather'), 24))
  })

  it('diverges when the salt changes', () => {
    expect(take(rngFor(7, 'weather'), 24)).not.toEqual(take(rngFor(7, 'debris'), 24))
  })

  it('diverges when the seed changes', () => {
    expect(take(rngFor(7, 'weather'), 24)).not.toEqual(take(rngFor(8, 'weather'), 24))
  })

  it('keeps neighbouring salts far apart', () => {
    const first = rngFor(1000, 'harvest:1')()
    const second = rngFor(1000, 'harvest:2')()
    expect(Math.abs(first - second)).toBeGreaterThan(0.01)
  })
})

describe('randInt', () => {
  it('is inclusive at both ends and never escapes the range', () => {
    const rand = rngFor(4, 'bounds')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = randInt(rand, 3, 5)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(5)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([3, 4, 5])
  })

  it('hits both ends of a two-value range', () => {
    const rand = rngFor(11, 'coin')
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(randInt(rand, 0, 1))
    expect([...seen].sort()).toEqual([0, 1])
  })

  it('returns the single value of a degenerate range', () => {
    const rand = rngFor(5, 'flat')
    for (let i = 0; i < 20; i++) expect(randInt(rand, 4, 4)).toBe(4)
  })

  it('tolerates a reversed range', () => {
    const rand = rngFor(6, 'reversed')
    for (let i = 0; i < 100; i++) {
      const v = randInt(rand, 9, 2)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(9)
    }
  })

  it('never returns 1 above the top when the generator returns almost 1', () => {
    const almostOne = () => 0.9999999
    expect(randInt(almostOne, 0, 3)).toBe(3)
  })
})

describe('pick', () => {
  it('always returns a member of the list', () => {
    const rand = rngFor(2, 'pick')
    const items = ['a', 'b', 'c', 'd'] as const
    for (let i = 0; i < 200; i++) expect(items).toContain(pick(rand, items))
  })

  it('is deterministic for a seeded generator', () => {
    const items = [10, 20, 30, 40]
    const randA = rngFor(3, 'p')
    const randB = rngFor(3, 'p')
    const draws = Array.from({ length: 8 }, () => 0)
    expect(draws.map(() => pick(randA, items))).toEqual(draws.map(() => pick(randB, items)))
  })

  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pick(rngFor(1, 'x'), [])).toThrow()
  })
})
