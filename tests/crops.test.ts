import { describe, expect, it } from 'vitest'
import { QUALITY_MULTIPLIER, SEASONS } from '../src/game/constants'
import {
  CROPS,
  cropById,
  cropsForSeason,
  isRipe,
  produceValue,
  requireCrop,
  totalGrowDays,
} from '../src/game/crops'
import type { Plant, Quality } from '../src/game/types'

const QUALITIES: Quality[] = ['normal', 'silver', 'gold']

function plantOf(cropId: string, stage: number, dead = false): Plant {
  return { cropId, stage, progress: 0, dry: 0, dead, fertilized: false, regrown: 0 }
}

describe('the crop table', () => {
  it('holds at least twelve crops', () => {
    expect(CROPS.length).toBeGreaterThanOrEqual(12)
  })

  it('gives every crop a unique id', () => {
    const ids = CROPS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every crop a unique fruit colour', () => {
    const fruits = CROPS.map((c) => c.art.fruit.toLowerCase())
    expect(new Set(fruits).size).toBe(fruits.length)
  })

  it('gives every crop a non-empty name and at least one season', () => {
    for (const crop of CROPS) {
      expect(crop.name.length).toBeGreaterThan(0)
      expect(crop.seasons.length).toBeGreaterThanOrEqual(1)
      for (const season of crop.seasons) expect(SEASONS).toContain(season)
      expect(new Set(crop.seasons).size).toBe(crop.seasons.length)
    }
  })

  it('gives every crop a positive grow time', () => {
    for (const crop of CROPS) {
      expect(crop.stageDays.length).toBeGreaterThan(0)
      for (const days of crop.stageDays) expect(days).toBeGreaterThan(0)
      expect(totalGrowDays(crop)).toBeGreaterThan(0)
      expect(totalGrowDays(crop)).toBe(crop.stageDays.reduce((a, b) => a + b, 0))
    }
  })

  it('gives every crop a sane yield, price and regrow value', () => {
    for (const crop of CROPS) {
      expect(crop.yieldMin).toBeGreaterThanOrEqual(1)
      expect(crop.yieldMax).toBeGreaterThanOrEqual(crop.yieldMin)
      expect(crop.seedCost).toBeGreaterThan(0)
      expect(crop.basePrice).toBeGreaterThan(0)
      if (crop.regrowDays !== null) expect(crop.regrowDays).toBeGreaterThan(0)
    }
  })

  it('gives every crop drawable art inside the documented limits', () => {
    for (const crop of CROPS) {
      expect(crop.art.height).toBeGreaterThanOrEqual(4)
      expect(crop.art.height).toBeLessThanOrEqual(14)
      expect(crop.art.fruits).toBeGreaterThanOrEqual(1)
      for (const hex of [crop.art.stem, crop.art.leaf, crop.art.fruit]) {
        expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('stocks every season, winter included', () => {
    for (const season of SEASONS) {
      expect(cropsForSeason(season).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('offers at least two regrowing crops', () => {
    expect(CROPS.filter((c) => c.regrowDays !== null).length).toBeGreaterThanOrEqual(2)
  })

  it('spans cheap-and-fast to expensive-and-slow', () => {
    const fastest = Math.min(...CROPS.map(totalGrowDays))
    const slowest = Math.max(...CROPS.map(totalGrowDays))
    expect(slowest).toBeGreaterThan(fastest)
    expect(Math.max(...CROPS.map((c) => c.basePrice))).toBeGreaterThan(
      Math.min(...CROPS.map((c) => c.basePrice)) * 3,
    )
  })
})

describe('lookup', () => {
  it('finds every listed crop by id', () => {
    for (const crop of CROPS) expect(cropById(crop.id)).toBe(crop)
  })

  it('returns undefined for an unknown id', () => {
    expect(cropById('moonfruit')).toBeUndefined()
  })

  it('requireCrop throws for an unknown id', () => {
    expect(() => requireCrop('moonfruit')).toThrow(/moonfruit/)
    expect(requireCrop(CROPS[0].id)).toBe(CROPS[0])
  })

  it('cropsForSeason only returns crops that list the season', () => {
    for (const season of SEASONS) {
      for (const crop of cropsForSeason(season)) expect(crop.seasons).toContain(season)
    }
  })
})

describe('isRipe', () => {
  const crop = CROPS[0]

  it('is true only at or past the last stage', () => {
    expect(isRipe(plantOf(crop.id, crop.stageDays.length - 1), crop)).toBe(false)
    expect(isRipe(plantOf(crop.id, crop.stageDays.length), crop)).toBe(true)
  })

  it('is false for a dead plant or a mismatched crop', () => {
    expect(isRipe(plantOf(crop.id, crop.stageDays.length, true), crop)).toBe(false)
    expect(isRipe(plantOf('somethingelse', crop.stageDays.length), crop)).toBe(false)
  })
})

describe('produceValue', () => {
  it('applies the quality multiplier and floors the result', () => {
    for (const crop of CROPS) {
      for (const quality of QUALITIES) {
        expect(produceValue(crop, quality)).toBe(
          Math.floor(crop.basePrice * QUALITY_MULTIPLIER[quality]),
        )
      }
    }
  })

  it('never values a better quality lower', () => {
    for (const crop of CROPS) {
      const normal = produceValue(crop, 'normal')
      const silver = produceValue(crop, 'silver')
      const gold = produceValue(crop, 'gold')
      expect(normal).toBe(crop.basePrice)
      expect(silver).toBeGreaterThanOrEqual(normal)
      expect(gold).toBeGreaterThanOrEqual(silver)
    }
  })
})
