import { DAY_START, SEASONS } from './constants'
import type { GameState, Season } from './types'

const MINUTES_PER_DAY = 24 * 60

/** Band edges from DESIGN.md section 4, in minutes from midnight. */
const MORNING_START = DAY_START // 6:00 — faint cold wash
const MIDDAY_START = 10 * 60 // 10:00 — the palette shows true
const EVENING_START = 17 * 60 // 17:00 — the warm hour
const NIGHT_START = 20 * 60 // 20:00 — shadow eases in

/** Darkness at the two band joins, as a fraction of the deepest-night tint. */
const MORNING_LEVEL = 0.16
const EVENING_LEVEL = 0.26

/** 20:00 -> 2:00 deepens to full night; 2:00 -> 6:00 lifts back to the morning wash. */
const NIGHT_DEEPEN = 6 * 60
const NIGHT_LENGTH = MINUTES_PER_DAY - NIGHT_START + MORNING_START

function wrapMinutes(minutes: number): number {
  const m = Math.floor(minutes) % MINUTES_PER_DAY
  return m < 0 ? m + MINUTES_PER_DAY : m
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

export function formatClock(minutes: number): string {
  const m = wrapMinutes(minutes)
  const hour24 = Math.floor(m / 60)
  const minute = m % 60
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  return `${hour12}:${minute < 10 ? '0' : ''}${minute} ${suffix}`
}

export function formatDate(state: GameState): string {
  return `${state.season.toUpperCase()} ${state.day}, YEAR ${state.year}`
}

export function seasonIndex(season: Season): number {
  return SEASONS.indexOf(season)
}

export function nextSeason(season: Season): Season {
  return SEASONS[(seasonIndex(season) + 1) % SEASONS.length]
}

export function isNight(minutes: number): boolean {
  const m = wrapMinutes(minutes)
  return m >= NIGHT_START || m < MORNING_START
}

/** 0 = full daylight, 1 = deepest night. Drives the world tint. */
export function darkness(minutes: number): number {
  const m = wrapMinutes(minutes)

  if (m >= MIDDAY_START && m < EVENING_START) return 0

  if (m >= MORNING_START && m < MIDDAY_START) {
    const t = (m - MORNING_START) / (MIDDAY_START - MORNING_START)
    return MORNING_LEVEL * (1 - smooth(t))
  }

  if (m >= EVENING_START && m < NIGHT_START) {
    const t = (m - EVENING_START) / (NIGHT_START - EVENING_START)
    return EVENING_LEVEL * smooth(t)
  }

  const since = m >= NIGHT_START ? m - NIGHT_START : m + (MINUTES_PER_DAY - NIGHT_START)
  if (since <= NIGHT_DEEPEN) {
    return EVENING_LEVEL + (1 - EVENING_LEVEL) * smooth(since / NIGHT_DEEPEN)
  }
  const lift = (since - NIGHT_DEEPEN) / (NIGHT_LENGTH - NIGHT_DEEPEN)
  return 1 - (1 - MORNING_LEVEL) * smooth(lift)
}
