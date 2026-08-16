import { describe, expect, it } from 'vitest'
import { DAY_END, DAY_START, SEASONS } from '../src/game/constants'
import { createState } from '../src/game/state'
import {
  darkness,
  formatClock,
  formatDate,
  isNight,
  nextSeason,
  seasonIndex,
} from '../src/game/time'
import type { Season } from '../src/game/types'

describe('formatClock', () => {
  it('formats the working day', () => {
    expect(formatClock(DAY_START)).toBe('6:00 AM')
    expect(formatClock(9 * 60 + 5)).toBe('9:05 AM')
    expect(formatClock(23 * 60 + 40)).toBe('11:40 PM')
  })

  it('calls noon PM and midnight AM', () => {
    expect(formatClock(12 * 60)).toBe('12:00 PM')
    expect(formatClock(12 * 60 + 30)).toBe('12:30 PM')
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatClock(24 * 60)).toBe('12:00 AM')
  })

  it('wraps the past-midnight clock the game actually uses', () => {
    expect(formatClock(25 * 60)).toBe('1:00 AM')
    expect(formatClock(25 * 60 + 20)).toBe('1:20 AM')
    expect(formatClock(DAY_END)).toBe('2:00 AM')
  })

  it('always pads the minutes to two digits', () => {
    for (let m = DAY_START; m <= DAY_END; m += 10) {
      expect(formatClock(m)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
    }
  })
})

describe('formatDate', () => {
  it('reads as SEASON DAY, YEAR N', () => {
    const state = createState(1)
    expect(formatDate(state)).toBe('SPRING 1, YEAR 1')
    expect(formatDate({ ...state, season: 'winter', day: 28, year: 3 })).toBe(
      'WINTER 28, YEAR 3',
    )
  })
})

describe('seasons', () => {
  it('indexes the calendar in order', () => {
    SEASONS.forEach((season, i) => expect(seasonIndex(season)).toBe(i))
  })

  it('wraps winter back to spring', () => {
    expect(nextSeason('spring')).toBe('summer')
    expect(nextSeason('summer')).toBe('fall')
    expect(nextSeason('fall')).toBe('winter')
    expect(nextSeason('winter')).toBe('spring')
  })

  it('returns to the start after four steps', () => {
    let season: Season = 'spring'
    const walked: Season[] = []
    for (let i = 0; i < 4; i++) {
      walked.push(season)
      season = nextSeason(season)
    }
    expect(walked).toEqual([...SEASONS])
    expect(season).toBe('spring')
  })
})

describe('isNight', () => {
  it('is true from 20:00 and false again at 6:00', () => {
    expect(isNight(19 * 60 + 59)).toBe(false)
    expect(isNight(20 * 60)).toBe(true)
    expect(isNight(25 * 60)).toBe(true)
    expect(isNight(5 * 60 + 59)).toBe(true)
    expect(isNight(DAY_START)).toBe(false)
    expect(isNight(12 * 60)).toBe(false)
  })
})

describe('darkness', () => {
  it('is flat zero across midday only', () => {
    for (let m = 10 * 60; m < 17 * 60; m += 10) expect(darkness(m)).toBe(0)
    expect(darkness(9 * 60 + 50)).toBeGreaterThan(0)
    expect(darkness(17 * 60 + 10)).toBeGreaterThan(0)
  })

  it('lifts as the morning brightens', () => {
    let previous = Number.POSITIVE_INFINITY
    for (let m = DAY_START; m <= 10 * 60; m += 10) {
      const value = darkness(m)
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
    expect(previous).toBe(0)
  })

  it('deepens monotonically from evening through to 2:00 AM', () => {
    let previous = -1
    for (let m = 17 * 60; m <= DAY_END; m += 5) {
      const value = darkness(m)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    expect(darkness(DAY_END)).toBeCloseTo(1, 6)
  })

  it('is deeper at night than in the evening, and evening deeper than midday', () => {
    expect(darkness(18 * 60)).toBeGreaterThan(darkness(16 * 60))
    expect(darkness(22 * 60)).toBeGreaterThan(darkness(18 * 60))
  })

  it('stays inside 0..1 for every minute of the day', () => {
    for (let m = -600; m <= 2 * 24 * 60; m++) {
      const value = darkness(m)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous across midnight', () => {
    expect(darkness(24 * 60)).toBeCloseTo(darkness(24 * 60 - 1), 2)
    expect(darkness(0)).toBeCloseTo(darkness(24 * 60), 10)
  })
})
