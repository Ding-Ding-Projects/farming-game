/**
 * The shell's translation layer.
 *
 * Three persisted language modes — English, playful Hong Kong Cantonese, and a compact
 * bilingual mode — with an independent 1..5 "funny level" per language.
 *
 * The one law of this module, restated because everything else depends on it:
 * **the funny level restyles the voice and never edits a fact.** Every level of every key
 * carries exactly the same `{parameter}` placeholders, so a price, a count, a crop name, a
 * key binding, a file path and an error code read identically at level 1 and at level 5.
 * `strings.ts` holds the catalogue; `tests` enforce the placeholder parity.
 *
 * No DOM here. Persistence goes through `store.ts` only.
 */
import type { GoodId, Ground, Quality, Season, ToolId, Weather } from '../../game/types'
import type { StringEntry, StringKey } from './strings'
import { STRINGS } from './strings'
import { get, save, subscribe } from './store'

export type { StringKey }

/** English, Cantonese, or both at once. */
export type Lang = 'en' | 'yue' | 'both'

/** 1 is plain and factual, 3 is warm, 5 is theatrical. */
export type FunnyLevel = 1 | 2 | 3 | 4 | 5

export interface FunnyLevels {
  en: FunnyLevel
  yue: FunnyLevel
}

export const LANGS: readonly Lang[] = ['en', 'yue', 'both']
export const FUNNY_LEVELS: readonly FunnyLevel[] = [1, 2, 3, 4, 5]
export const MIN_FUNNY: FunnyLevel = 1
export const MAX_FUNNY: FunnyLevel = 5

/** Mirrors `defaultSettings()` in `store.ts`; the store is the authority once it loads. */
export const DEFAULT_LANG: Lang = 'en'
export const DEFAULT_FUNNY: Readonly<FunnyLevels> = { en: 2, yue: 2 }

/** How `both` mode joins the two voices. Compact by design: no line break, no brackets. */
export const BOTH_SEPARATOR = ' · '

/** `{name}`, `{count}`, `{error_code}`. Nothing else is treated as a placeholder. */
const PARAM_RE = /\{([A-Za-z0-9_]+)\}/g

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

let lang: Lang = DEFAULT_LANG
let funny: FunnyLevels = { ...DEFAULT_FUNNY }

const listeners = new Set<() => void>()

let started = false
/** True while we are writing to the store, so its echo does not re-notify. */
let writing = false

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      // One bad listener must not stop the rest of the shell from re-rendering.
    }
  }
}

// ---------------------------------------------------------------------------
// store bridge — defensive in both directions
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asLang(value: unknown): Lang | null {
  return value === 'en' || value === 'yue' || value === 'both' ? value : null
}

function asLevel(value: unknown): FunnyLevel | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

/**
 * Reads `settings.language` and `settings.funny`. The store sanitises both, but this
 * re-checks them anyway: a broken store must cost you a preference, never a label.
 */
function readStored(): { lang: Lang | null; funny: FunnyLevels | null } {
  let root: unknown
  try {
    root = get()
  } catch {
    return { lang: null, funny: null }
  }

  const settings = asRecord(asRecord(root)?.settings)
  if (!settings) return { lang: null, funny: null }

  const storedFunny = asRecord(settings.funny)
  const en = storedFunny ? asLevel(storedFunny.en) : null
  const yue = storedFunny ? asLevel(storedFunny.yue) : null

  return {
    lang: asLang(settings.language),
    funny: en === null && yue === null ? null : { en: en ?? funny.en, yue: yue ?? funny.yue },
  }
}

function pullFromStore(): void {
  if (writing) return
  const stored = readStored()
  let changed = false

  if (stored.lang !== null && stored.lang !== lang) {
    lang = stored.lang
    changed = true
  }
  if (stored.funny !== null && (stored.funny.en !== funny.en || stored.funny.yue !== funny.yue)) {
    funny = { en: stored.funny.en, yue: stored.funny.yue }
    changed = true
  }
  if (changed) notify()
}

/**
 * Best effort. A store that is unavailable (a node test, a locked-down browser) must
 * degrade to an in-memory language setting rather than break every label in the app.
 * The patch is deliberately narrow: it touches `language` and `funny` and nothing else.
 */
function pushToStore(): void {
  writing = true
  try {
    void Promise.resolve(save({ settings: { language: lang, funny: { ...funny } } })).catch(
      () => undefined,
    )
  } catch {
    // Nothing persisted. The session still honours the choice.
  } finally {
    writing = false
  }
}

function ensureStarted(): void {
  if (started) return
  started = true
  pullFromStore()
  try {
    subscribe(() => pullFromStore())
  } catch {
    // A store without subscription support still works; we simply stop mirroring it.
  }
}

// ---------------------------------------------------------------------------
// lookup
// ---------------------------------------------------------------------------

const CATALOGUE: Readonly<Record<string, StringEntry>> = STRINGS

function entryFor(key: string): StringEntry | null {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, key) ? CATALOGUE[key] : null
}

function voice(entry: StringEntry, which: 'en' | 'yue'): string {
  const level = which === 'en' ? funny.en : funny.yue
  const index = Math.min(5, Math.max(1, level)) - 1
  const text = entry[which][index]
  return typeof text === 'string' && text.length > 0 ? text : entry[which][0]
}

/** Unresolved placeholders are left visible on purpose: a missing fact must be obvious. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(PARAM_RE, (whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return whole
    const value = params[name]
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : whole
    return typeof value === 'string' ? value : whole
  })
}

/**
 * Translate `key` in the active language at the active funny level.
 *
 * An unknown key returns the key itself, verbatim and visible — never an empty string —
 * so a missing entry shows up on screen instead of silently blanking a control.
 */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  ensureStarted()

  const entry = entryFor(key)
  if (!entry) return key

  if (lang === 'en') return interpolate(voice(entry, 'en'), params)
  if (lang === 'yue') return interpolate(voice(entry, 'yue'), params)

  const en = interpolate(voice(entry, 'en'), params)
  const yue = interpolate(voice(entry, 'yue'), params)
  if (en === yue) return en
  if (en.length === 0) return yue
  if (yue.length === 0) return en
  return `${en}${BOTH_SEPARATOR}${yue}`
}

/** Every key in the catalogue, sorted, as a fresh array. */
export function availableKeys(): StringKey[] {
  return (Object.keys(CATALOGUE) as StringKey[]).sort()
}

export function hasKey(key: string): key is StringKey {
  return entryFor(key) !== null
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export function getLang(): Lang {
  ensureStarted()
  return lang
}

export function getFunny(): FunnyLevels {
  ensureStarted()
  return { ...funny }
}

export function setLang(next: Lang): void {
  ensureStarted()
  const valid = asLang(next)
  if (valid === null || valid === lang) return
  lang = valid
  pushToStore()
  notify()
}

export function setFunny(levels: Partial<FunnyLevels>): void {
  ensureStarted()
  const en = levels.en === undefined ? funny.en : asLevel(levels.en)
  const yue = levels.yue === undefined ? funny.yue : asLevel(levels.yue)
  if (en === null || yue === null) return
  if (en === funny.en && yue === funny.yue) return
  funny = { en, yue }
  pushToStore()
  notify()
}

/** Subscribe to language or funny-level changes. Returns the unsubscribe function. */
export function onLangChange(fn: () => void): () => void {
  ensureStarted()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// typed key helpers
//
// These exist so no other lane has to build a key by string concatenation and lose the
// compile-time check on `StringKey`.
// ---------------------------------------------------------------------------

const FUNNY_NAME_KEY: Readonly<Record<FunnyLevel, StringKey>> = {
  1: 'settings.lang.funny.level.1',
  2: 'settings.lang.funny.level.2',
  3: 'settings.lang.funny.level.3',
  4: 'settings.lang.funny.level.4',
  5: 'settings.lang.funny.level.5',
}

const FUNNY_DESC_KEY: Readonly<Record<FunnyLevel, StringKey>> = {
  1: 'settings.lang.funny.level.1.desc',
  2: 'settings.lang.funny.level.2.desc',
  3: 'settings.lang.funny.level.3.desc',
  4: 'settings.lang.funny.level.4.desc',
  5: 'settings.lang.funny.level.5.desc',
}

const LANG_OPTION_KEY: Readonly<Record<Lang, StringKey>> = {
  en: 'settings.lang.option.en',
  yue: 'settings.lang.option.yue',
  both: 'settings.lang.option.both',
}

const LANG_OPTION_DESC_KEY: Readonly<Record<Lang, StringKey>> = {
  en: 'settings.lang.option.en.desc',
  yue: 'settings.lang.option.yue.desc',
  both: 'settings.lang.option.both.desc',
}

const SEASON_KEY: Readonly<Record<Season, StringKey>> = {
  spring: 'season.spring',
  summer: 'season.summer',
  fall: 'season.fall',
  winter: 'season.winter',
}

const WEATHER_KEY: Readonly<Record<Weather, StringKey>> = {
  clear: 'weather.clear',
  rain: 'weather.rain',
  storm: 'weather.storm',
  snow: 'weather.snow',
}

const QUALITY_KEY: Readonly<Record<Quality, StringKey>> = {
  normal: 'quality.normal',
  silver: 'quality.silver',
  gold: 'quality.gold',
}

const TOOL_KEY: Readonly<Record<ToolId, StringKey>> = {
  hoe: 'tool.hoe',
  can: 'tool.can',
  seeds: 'tool.seeds',
  hand: 'tool.hand',
  axe: 'tool.axe',
  sprinkler: 'tool.sprinkler',
  fertilizer: 'tool.fertilizer',
}

const TOOL_DESC_KEY: Readonly<Record<ToolId, StringKey>> = {
  hoe: 'tool.hoe.desc',
  can: 'tool.can.desc',
  seeds: 'tool.seeds.desc',
  hand: 'tool.hand.desc',
  axe: 'tool.axe.desc',
  sprinkler: 'tool.sprinkler.desc',
  fertilizer: 'tool.fertilizer.desc',
}

const GOOD_KEY: Readonly<Record<GoodId, StringKey>> = {
  sprinkler: 'good.sprinkler',
  fertilizer: 'good.fertilizer',
}

const GROUND_KEY: Readonly<Record<Ground, StringKey>> = {
  grass: 'ground.grass',
  soil: 'ground.soil',
  weeds: 'ground.weeds',
  rock: 'ground.rock',
  log: 'ground.log',
  water: 'ground.water',
  path: 'ground.path',
}

export function funnyLevelKey(level: FunnyLevel): StringKey {
  return FUNNY_NAME_KEY[level]
}

export function funnyLevelDescKey(level: FunnyLevel): StringKey {
  return FUNNY_DESC_KEY[level]
}

export function langOptionKey(value: Lang): StringKey {
  return LANG_OPTION_KEY[value]
}

export function langOptionDescKey(value: Lang): StringKey {
  return LANG_OPTION_DESC_KEY[value]
}

export function seasonKey(season: Season): StringKey {
  return SEASON_KEY[season]
}

export function weatherKey(weather: Weather): StringKey {
  return WEATHER_KEY[weather]
}

export function qualityKey(quality: Quality): StringKey {
  return QUALITY_KEY[quality]
}

export function toolKey(tool: ToolId): StringKey {
  return TOOL_KEY[tool]
}

export function toolDescKey(tool: ToolId): StringKey {
  return TOOL_DESC_KEY[tool]
}

export function goodKey(good: GoodId): StringKey {
  return GOOD_KEY[good]
}

export function groundKey(ground: Ground): StringKey {
  return GROUND_KEY[ground]
}

/** `crop.parsnip` and friends. An id the catalogue has never heard of falls back safely. */
export function cropNameKey(cropId: string): StringKey {
  const key = `crop.${cropId}`
  return hasKey(key) ? key : 'crop.unknown'
}
