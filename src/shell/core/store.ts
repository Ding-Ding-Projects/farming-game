/**
 * The shell's persistence spine.
 *
 * One versioned record — settings, appearance, tabs and history — read through
 * `window.sprout` when the Electron preload is present and `localStorage` otherwise,
 * exactly the way `src/renderer/bridge.ts` detects its host. It uses its own storage key
 * (`sprout-hollow.shell`) so the game save and the shell record can never collide, and its
 * own bridge channels, so a host that only knows the three save channels still works.
 *
 * Two promises this module keeps:
 *
 * 1. **Nothing here throws.** Every parse, every read, every write and every subscriber
 *    callback is guarded. Losing a preference beats taking the app down.
 * 2. **Malformed data degrades per key.** A corrupt appearance map costs you the appearance
 *    map. The settings beside it survive, and so does every field of the appearance map
 *    that still reads cleanly.
 */

import type { SproutBridge } from '../../renderer/bridge'

/* ------------------------------------------------------------------ language & settings */

/** Matches `Lang` in `src/shell/core/i18n.ts` — the two are interchangeable. */
export type Lang = 'en' | 'yue' | 'both'

export const LANGS: readonly Lang[] = ['en', 'yue', 'both']

export type FunnyLevel = 1 | 2 | 3 | 4 | 5

export const FUNNY_LEVELS: readonly FunnyLevel[] = [1, 2, 3, 4, 5]

/** Independent voices: English and Cantonese are dialled separately. */
export interface FunnyLevels {
  en: FunnyLevel
  yue: FunnyLevel
}

/**
 * `system` follows `prefers-reduced-motion`; the other two override it in either
 * direction, as DESIGN.md section 10.3 requires.
 */
export type MotionMode = 'system' | 'full' | 'reduced'

export const MOTION_MODES: readonly MotionMode[] = ['system', 'full', 'reduced']

/** The scale ladder from DESIGN.md section 10.3, as a percentage. */
export type DisplayScale = 100 | 125 | 150 | 200

export const DISPLAY_SCALES: readonly DisplayScale[] = [100, 125, 150, 200]

export interface AudioSettings {
  muted: boolean
  /** 0..1, linear. The engine's master gain. */
  volume: number
}

/** The integer upscale for the game canvas, or `auto` for the largest that fits. */
export type PixelScale = 'auto' | 2 | 3 | 4 | 5 | 6

export const PIXEL_SCALES: readonly PixelScale[] = ['auto', 2, 3, 4, 5, 6]

/** Options that change how the game surface behaves inside the shell. */
export interface GameOptions {
  /** Pause the frame loop when the Farm tab is not the visible one. */
  pauseWhenHidden: boolean
  /** Write the game save automatically as the day advances. */
  autosave: boolean
  /** Ask before anything destructive: reset, delete, closing unsaved work. */
  confirmDestructive: boolean
  /** Dirt specks, harvest pops, weather flecks. Reduced motion also suppresses these. */
  particles: boolean
  /** Screen shake. Reduced motion also suppresses this. */
  screenShake: boolean
  /** Mirror game events into the screen-reader live region. */
  announceActions: boolean
  pixelScale: PixelScale
}

export interface Settings {
  language: Lang
  funny: FunnyLevels
  motion: MotionMode
  displayScale: DisplayScale
  audio: AudioSettings
  game: GameOptions
}

/* ------------------------------------------------------------------------- appearance */

/**
 * One element's persisted appearance override. Every field is optional: an element with no
 * entry, or an entry with no fields, renders exactly as the stylesheet says.
 *
 * Colour strings are stored as the user authored them — hex, `rgb()`, `hsl()` or a palette
 * name — and are sanitised on the way in so a stored value can never smuggle extra
 * declarations into an inline style.
 */
export interface AppearanceValue {
  color?: string
  background?: string
  borderColor?: string
  accent?: string
  /** 50..300, percent of the inherited size. */
  fontSizePct?: number
  fontWeight?: 'normal' | 'bold'
  /** -2..8 CSS px. */
  letterSpacingPx?: number
  /** 0..48 CSS px. */
  paddingPx?: number
  /** 0..8 CSS px. */
  borderWidthPx?: number
  hidden?: boolean
  /** A user-authored label. Never translated — it is the user's own words. */
  label?: string
}

/** Keyed by the stable `elementId` an element registers with the appearance editor. */
export type AppearanceMap = Record<string, AppearanceValue>

/* ------------------------------------------------------------------------------- tabs */

export interface TabRecord {
  id: string
  /** Which panel to build — owned by the tabs lane, kept open here on purpose. */
  kind: string
  /** A key for `t()`, never a rendered string, so a tab title follows the language. */
  titleKey: string
  /** Facts inside the title. Never rewritten by the funny level. */
  titleParams?: Record<string, string | number>
  groupId: string | null
  pinned: boolean
  closable: boolean
}

export interface TabGroup {
  id: string
  /** A key for `t()` when the group is one the app named. */
  nameKey?: string
  /** The user's own name for the group, when they renamed it. Shown verbatim. */
  name?: string
  collapsed: boolean
  /** A `PaletteName` from `src/engine/palette.ts`, resolved to a token by the UI. */
  color?: string
}

/** Strip order is array order. */
export interface TabState {
  tabs: TabRecord[]
  groups: TabGroup[]
  activeId: string | null
}

/* ---------------------------------------------------------------------------- history */

export type HistoryKind =
  | 'game'
  | 'settings'
  | 'appearance'
  | 'tab'
  | 'search'
  | 'data'
  | 'system'
  | 'error'

export const HISTORY_KINDS: readonly HistoryKind[] = [
  'game',
  'settings',
  'appearance',
  'tab',
  'search',
  'data',
  'system',
  'error',
]

/** Oldest entries are dropped past this. */
export const HISTORY_LIMIT = 500

/**
 * `summary` is a **string key**, not a sentence, and `params` carries the facts. History
 * recorded in Cantonese at funny level 5 reads as plain English at level 1 the moment you
 * switch, because nothing was ever frozen into a language.
 */
export interface HistoryEntry {
  /** Monotonically increasing within a record. */
  id: number
  /** Epoch milliseconds. The shell may read the clock; `src/game` may not. */
  at: number
  kind: HistoryKind
  summary: string
  params?: Record<string, string | number>
  detail?: Record<string, unknown>
}

/* --------------------------------------------------------------------------- the record */

/** Bump when a shape changes in a way older readers cannot survive. */
export const SCHEMA_VERSION = 1

export interface Persisted {
  version: number
  settings: Settings
  appearance: AppearanceMap
  tabs: TabState
  history: HistoryEntry[]
}

/** A field present with the value `undefined` clears that field. Omitted fields are kept. */
export type AppearancePatch = Record<string, AppearanceValue | null>

export interface SettingsPatch {
  language?: Lang
  funny?: Partial<FunnyLevels>
  motion?: MotionMode
  displayScale?: DisplayScale
  audio?: Partial<AudioSettings>
  game?: Partial<GameOptions>
}

/**
 * Wider than `Partial<Persisted>` on purpose — every `Partial<Persisted>` is a valid patch,
 * but you may also send `{ settings: { motion: 'reduced' } }` without rebuilding the rest.
 */
export interface PersistedPatch {
  version?: number
  settings?: SettingsPatch
  /** Merged per element, then per field. `null` for an element deletes it. */
  appearance?: AppearancePatch
  tabs?: Partial<TabState>
  history?: readonly HistoryEntry[]
}

/* -------------------------------------------------------------------------- defaults */

export function defaultSettings(): Settings {
  return {
    language: 'en',
    funny: { en: 2, yue: 2 },
    motion: 'system',
    displayScale: 100,
    audio: { muted: false, volume: 0.7 },
    game: {
      pauseWhenHidden: true,
      autosave: true,
      confirmDestructive: true,
      particles: true,
      screenShake: true,
      announceActions: true,
      pixelScale: 'auto',
    },
  }
}

export function defaultTabs(): TabState {
  return { tabs: [], groups: [], activeId: null }
}

/** A fresh, fully-populated record. Never shared — every call builds new objects. */
export function defaults(): Persisted {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    appearance: {},
    tabs: defaultTabs(),
    history: [],
  }
}

/* ------------------------------------------------------------------- reading primitives */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  return n > max ? max : n
}

function numberOr(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(value, min, max)
}

function intOr(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(Math.floor(value), min, max)
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Trims, drops control characters, and caps the length. Returns null when nothing is left. */
function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (cleaned.length === 0) return null
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned
}

/** Facts for `t()`: strings and finite numbers only, bounded in count and length. */
function readParams(value: unknown): Record<string, string | number> | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, string | number> = {}
  let count = 0
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || count >= 32) continue
    const raw = value[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = raw
      count += 1
    } else if (typeof raw === 'string') {
      out[key] = raw.length > 512 ? raw.slice(0, 512) : raw
      count += 1
    }
  }
  return count === 0 ? undefined : out
}

/** A JSON-shaped detail blob, depth- and size-bounded so one bad entry cannot bloat storage. */
function readDetail(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!isRecord(value) || depth > 4) return undefined
  const out: Record<string, unknown> = {}
  let count = 0
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || count >= 64) continue
    const cleaned = readDetailValue(value[key], depth)
    if (cleaned === undefined) continue
    out[key] = cleaned
    count += 1
  }
  return count === 0 ? undefined : out
}

function readDetailValue(raw: unknown, depth: number): unknown {
  if (raw === null) return null
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
  if (typeof raw === 'string') return raw.length > 2048 ? raw.slice(0, 2048) : raw
  if (Array.isArray(raw)) {
    if (depth >= 4) return undefined
    const items: unknown[] = []
    for (const item of raw.slice(0, 64)) {
      const cleaned = readDetailValue(item, depth + 1)
      if (cleaned !== undefined) items.push(cleaned)
    }
    return items
  }
  if (isRecord(raw)) return readDetail(raw, depth + 1)
  return undefined
}

/**
 * Colours and other appearance values end up in inline styles, so anything that could close
 * a declaration or reach the network is refused outright. What survives is the small
 * vocabulary a colour picker or a numeric field can actually produce.
 */
function safeCssValue(value: unknown): string | undefined {
  const s = text(value, 64)
  if (s === null) return undefined
  if (!/^[A-Za-z0-9#(),.%/\s+-]+$/.test(s)) return undefined
  if (/url|expression|javascript|import/i.test(s)) return undefined
  return s
}

/* ------------------------------------------------------------------------- sanitisers */

/**
 * Every field falls back independently: one bad number costs that number, not the section
 * around it. `base` lets an import start from the live settings instead of the defaults.
 */
export function sanitizeSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  if (!isRecord(raw)) return base

  const funnyRaw = isRecord(raw['funny']) ? raw['funny'] : {}
  const audioRaw = isRecord(raw['audio']) ? raw['audio'] : {}
  const gameRaw = isRecord(raw['game']) ? raw['game'] : {}

  return {
    language: oneOf(raw['language'], LANGS, base.language),
    funny: {
      en: intOr(funnyRaw['en'], 1, 5, base.funny.en) as FunnyLevel,
      yue: intOr(funnyRaw['yue'], 1, 5, base.funny.yue) as FunnyLevel,
    },
    motion: oneOf(raw['motion'], MOTION_MODES, base.motion),
    displayScale: nearestScale(raw['displayScale'], base.displayScale),
    audio: {
      muted: boolOr(audioRaw['muted'], base.audio.muted),
      volume: numberOr(audioRaw['volume'], 0, 1, base.audio.volume),
    },
    game: {
      pauseWhenHidden: boolOr(gameRaw['pauseWhenHidden'], base.game.pauseWhenHidden),
      autosave: boolOr(gameRaw['autosave'], base.game.autosave),
      confirmDestructive: boolOr(gameRaw['confirmDestructive'], base.game.confirmDestructive),
      particles: boolOr(gameRaw['particles'], base.game.particles),
      screenShake: boolOr(gameRaw['screenShake'], base.game.screenShake),
      announceActions: boolOr(gameRaw['announceActions'], base.game.announceActions),
      pixelScale: readPixelScale(gameRaw['pixelScale'], base.game.pixelScale),
    },
  }
}

/** An off-ladder scale snaps to the nearest rung rather than reverting to 100 %. */
function nearestScale(value: unknown, fallback: DisplayScale): DisplayScale {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  let best: DisplayScale = DISPLAY_SCALES[0] as DisplayScale
  let bestGap = Number.POSITIVE_INFINITY
  for (const scale of DISPLAY_SCALES) {
    const gap = Math.abs(scale - value)
    if (gap < bestGap) {
      bestGap = gap
      best = scale
    }
  }
  return best
}

function readPixelScale(value: unknown, fallback: PixelScale): PixelScale {
  if (value === 'auto') return 'auto'
  if (typeof value === 'number' && Number.isFinite(value)) {
    const whole = Math.floor(value)
    if (whole >= 2 && whole <= 6) return whole as PixelScale
  }
  return fallback
}

/** Elements that read cleanly are kept; a broken one is dropped alone. */
export function sanitizeAppearance(raw: unknown): AppearanceMap {
  if (!isRecord(raw)) return {}
  const out: AppearanceMap = {}
  let kept = 0
  for (const id of Object.keys(raw)) {
    if (id === '__proto__' || kept >= 2000) continue
    const key = text(id, 128)
    if (key === null) continue
    const value = sanitizeAppearanceValue(raw[id])
    if (value === null) continue
    out[key] = value
    kept += 1
  }
  return out
}

/** Returns null when there is nothing usable left to store for this element. */
export function sanitizeAppearanceValue(raw: unknown): AppearanceValue | null {
  if (!isRecord(raw)) return null
  const out: AppearanceValue = {}

  const color = safeCssValue(raw['color'])
  if (color !== undefined) out.color = color
  const background = safeCssValue(raw['background'])
  if (background !== undefined) out.background = background
  const borderColor = safeCssValue(raw['borderColor'])
  if (borderColor !== undefined) out.borderColor = borderColor
  const accent = safeCssValue(raw['accent'])
  if (accent !== undefined) out.accent = accent

  if (typeof raw['fontSizePct'] === 'number' && Number.isFinite(raw['fontSizePct'])) {
    out.fontSizePct = clamp(Math.round(raw['fontSizePct']), 50, 300)
  }
  if (raw['fontWeight'] === 'normal' || raw['fontWeight'] === 'bold') {
    out.fontWeight = raw['fontWeight']
  }
  if (typeof raw['letterSpacingPx'] === 'number' && Number.isFinite(raw['letterSpacingPx'])) {
    out.letterSpacingPx = clamp(Math.round(raw['letterSpacingPx']), -2, 8)
  }
  if (typeof raw['paddingPx'] === 'number' && Number.isFinite(raw['paddingPx'])) {
    out.paddingPx = clamp(Math.round(raw['paddingPx']), 0, 48)
  }
  if (typeof raw['borderWidthPx'] === 'number' && Number.isFinite(raw['borderWidthPx'])) {
    out.borderWidthPx = clamp(Math.round(raw['borderWidthPx']), 0, 8)
  }
  if (typeof raw['hidden'] === 'boolean') out.hidden = raw['hidden']

  const label = text(raw['label'], 120)
  if (label !== null) out.label = label

  return Object.keys(out).length === 0 ? null : out
}

const MAX_TABS = 200
const MAX_GROUPS = 50

export function sanitizeTabs(raw: unknown): TabState {
  if (!isRecord(raw)) return defaultTabs()

  const tabs: TabRecord[] = []
  const seenTabs = new Set<string>()
  if (Array.isArray(raw['tabs'])) {
    for (const entry of raw['tabs']) {
      if (tabs.length >= MAX_TABS) break
      const tab = sanitizeTab(entry)
      if (tab === null || seenTabs.has(tab.id)) continue
      seenTabs.add(tab.id)
      tabs.push(tab)
    }
  }

  const groups: TabGroup[] = []
  const seenGroups = new Set<string>()
  if (Array.isArray(raw['groups'])) {
    for (const entry of raw['groups']) {
      if (groups.length >= MAX_GROUPS) break
      const group = sanitizeGroup(entry)
      if (group === null || seenGroups.has(group.id)) continue
      seenGroups.add(group.id)
      groups.push(group)
    }
  }

  // A tab pointing at a group that did not survive becomes a loose tab rather than a ghost.
  for (const tab of tabs) {
    if (tab.groupId !== null && !seenGroups.has(tab.groupId)) tab.groupId = null
  }

  const activeRaw = text(raw['activeId'], 128)
  const activeId = activeRaw !== null && seenTabs.has(activeRaw) ? activeRaw : firstId(tabs)

  return { tabs, groups, activeId }
}

function firstId(tabs: readonly TabRecord[]): string | null {
  return tabs.length === 0 ? null : tabs[0].id
}

function sanitizeTab(raw: unknown): TabRecord | null {
  if (!isRecord(raw)) return null
  const id = text(raw['id'], 128)
  const kind = text(raw['kind'], 64)
  if (id === null || kind === null) return null
  const titleKey = text(raw['titleKey'], 200)
  const tab: TabRecord = {
    id,
    kind,
    titleKey: titleKey ?? kind,
    groupId: text(raw['groupId'], 128),
    pinned: boolOr(raw['pinned'], false),
    closable: boolOr(raw['closable'], true),
  }
  const params = readParams(raw['titleParams'])
  if (params !== undefined) tab.titleParams = params
  return tab
}

function sanitizeGroup(raw: unknown): TabGroup | null {
  if (!isRecord(raw)) return null
  const id = text(raw['id'], 128)
  if (id === null) return null
  const group: TabGroup = { id, collapsed: boolOr(raw['collapsed'], false) }
  const nameKey = text(raw['nameKey'], 200)
  if (nameKey !== null) group.nameKey = nameKey
  const name = text(raw['name'], 120)
  if (name !== null) group.name = name
  const color = safeCssValue(raw['color'])
  if (color !== undefined) group.color = color
  return group
}

/** Drops unreadable entries, keeps the newest `HISTORY_LIMIT`, and repairs the ids. */
export function sanitizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryEntry[] = []
  for (const value of raw) {
    const entry = sanitizeHistoryEntry(value)
    if (entry !== null) out.push(entry)
  }
  const trimmed = out.length > HISTORY_LIMIT ? out.slice(out.length - HISTORY_LIMIT) : out
  let previous = 0
  for (const entry of trimmed) {
    if (entry.id <= previous) entry.id = previous + 1
    previous = entry.id
  }
  return trimmed
}

export function sanitizeHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!isRecord(raw)) return null
  const summary = text(raw['summary'], 200)
  if (summary === null) return null
  const entry: HistoryEntry = {
    id: intOr(raw['id'], 1, Number.MAX_SAFE_INTEGER, 1),
    at: intOr(raw['at'], 0, Number.MAX_SAFE_INTEGER, 0),
    kind: oneOf(raw['kind'], HISTORY_KINDS, 'system'),
    summary,
  }
  const params = readParams(raw['params'])
  if (params !== undefined) entry.params = params
  const detail = readDetail(raw['detail'])
  if (detail !== undefined) entry.detail = detail
  return entry
}

/**
 * The whole record, key by key. An older or newer `version` is not a reason to throw the
 * record away: every field is validated on its own terms, so what still reads survives.
 */
export function sanitizePersisted(raw: unknown): Persisted {
  if (!isRecord(raw)) return defaults()
  return {
    version: intOr(raw['version'], 0, 1_000_000, SCHEMA_VERSION),
    settings: sanitizeSettings(raw['settings']),
    appearance: sanitizeAppearance(raw['appearance']),
    tabs: sanitizeTabs(raw['tabs']),
    history: sanitizeHistory(raw['history']),
  }
}

/* --------------------------------------------------------------------------- storage */

/**
 * The shell's own key. `src/renderer/bridge.ts` owns `sprout-hollow.save`; these two must
 * never meet.
 */
export const SHELL_STORAGE_KEY = 'sprout-hollow.shell'

/**
 * The optional channels a host may add for the shell record. `electron/preload.ts` exposes
 * only the three save channels today, so the absence of these is the normal case and the
 * `localStorage` path below is what actually runs. When a host does add them they are used
 * in preference, exactly as the save bridge is.
 */
interface ShellStorageBridge {
  readShell?: () => Promise<string | null>
  writeShell?: (json: string) => Promise<void>
  clearShell?: () => Promise<void>
}

/** Mirrors `host()` in `src/renderer/bridge.ts`. */
function host(): SproutBridge | null {
  if (typeof window === 'undefined') return null
  return window.sprout ?? null
}

function shellChannels(): ShellStorageBridge | null {
  const bridge = host()
  if (bridge === null) return null
  const channels = bridge as unknown as ShellStorageBridge
  return typeof channels.readShell === 'function' &&
    typeof channels.writeShell === 'function' &&
    typeof channels.clearShell === 'function'
    ? channels
    : null
}

function readLocal(): string | null {
  try {
    return window.localStorage.getItem(SHELL_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLocal(json: string): void {
  try {
    window.localStorage.setItem(SHELL_STORAGE_KEY, json)
  } catch {
    // Private mode or a full quota. Losing a preference beats taking the shell down.
  }
}

function clearLocal(): void {
  try {
    window.localStorage.removeItem(SHELL_STORAGE_KEY)
  } catch {
    // Nothing stored, or storage is unavailable. Either way there is nothing left to do.
  }
}

async function readStorage(): Promise<string | null> {
  const channels = shellChannels()
  if (channels?.readShell) {
    try {
      return await channels.readShell()
    } catch {
      return null
    }
  }
  return typeof window === 'undefined' ? null : readLocal()
}

async function writeStorage(json: string): Promise<void> {
  const channels = shellChannels()
  if (channels?.writeShell) {
    try {
      await channels.writeShell(json)
    } catch {
      // A dead channel. There is nowhere better to put the bytes.
    }
    return
  }
  if (typeof window !== 'undefined') writeLocal(json)
}

async function clearStorage(): Promise<void> {
  const channels = shellChannels()
  if (channels?.clearShell) {
    try {
      await channels.clearShell()
    } catch {
      // As above.
    }
    return
  }
  if (typeof window !== 'undefined') clearLocal()
}

function encode(record: Persisted): string | null {
  try {
    return JSON.stringify(record)
  } catch {
    return null
  }
}

/** Strips `__proto__` so a hand-edited record cannot reach the object prototype. */
function decode(json: string | null): unknown {
  if (typeof json !== 'string' || json.length === 0) return null
  try {
    return JSON.parse(json, (key: string, value: unknown) =>
      key === '__proto__' ? undefined : value,
    )
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------------------- state */

let state: Persisted = freeze(defaults())
let loaded = false
let loading: Promise<Persisted> | null = null

const listeners = new Set<(p: Persisted) => void>()

/**
 * Frozen top to branch. `get()` hands out the live record rather than a copy — cloning a
 * 500-entry history on every read would be absurd — so freezing is what stops a caller
 * mutating shared state behind the store's back. Patch through `save()` instead.
 */
function freeze(record: Persisted): Persisted {
  Object.freeze(record.settings.funny)
  Object.freeze(record.settings.audio)
  Object.freeze(record.settings.game)
  Object.freeze(record.settings)
  for (const key of Object.keys(record.appearance)) Object.freeze(record.appearance[key])
  Object.freeze(record.appearance)
  for (const tab of record.tabs.tabs) {
    if (tab.titleParams) Object.freeze(tab.titleParams)
    Object.freeze(tab)
  }
  Object.freeze(record.tabs.tabs)
  for (const group of record.tabs.groups) Object.freeze(group)
  Object.freeze(record.tabs.groups)
  Object.freeze(record.tabs)
  for (const entry of record.history) {
    if (!Object.isFrozen(entry)) Object.freeze(entry)
  }
  Object.freeze(record.history)
  return Object.freeze(record)
}

function notify(): void {
  const snapshot = state
  for (const fn of [...listeners]) {
    try {
      fn(snapshot)
    } catch {
      // One rude subscriber does not get to break the others, or the write behind them.
    }
  }
}

/* ------------------------------------------------------------------- debounced writing */

const WRITE_DEBOUNCE_MS = 200
/** However long a slider is dragged, the record still reaches storage this often. */
const WRITE_MAX_WAIT_MS = 1000

let timer: ReturnType<typeof setTimeout> | null = null
let queuedAt = 0
let dirty = false
let waiters: Array<() => void> = []
/** Writes are chained so two flushes can never interleave and store an older record last. */
let writing: Promise<void> = Promise.resolve()

function scheduleWrite(): Promise<void> {
  dirty = true
  const now = Date.now()
  if (timer === null) queuedAt = now
  else clearTimeout(timer)
  const waited = now - queuedAt
  const delay = Math.max(0, Math.min(WRITE_DEBOUNCE_MS, WRITE_MAX_WAIT_MS - waited))
  const settled = new Promise<void>((resolve) => waiters.push(resolve))
  timer = setTimeout(() => {
    void flush()
  }, delay)
  return settled
}

/** Writes any pending change immediately. Awaiting it guarantees the bytes are out. */
export async function flush(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  const resolvers = waiters
  waiters = []
  if (dirty) {
    dirty = false
    const json = encode(state)
    writing = writing.then(() => (json === null ? Promise.resolve() : writeStorage(json)))
  }
  try {
    await writing
  } catch {
    // `writeStorage` already swallows its own failures; this is belt and braces.
  }
  for (const resolve of resolvers) resolve()
}

/** A last chance to persist when the window is going away. Best effort, never blocking. */
function installUnloadHook(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  const persistNow = (): void => {
    if (!dirty) return
    dirty = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    const json = encode(state)
    if (json === null) return
    // A pagehide handler gets no chance to await, so take the synchronous path when it
    // exists and fire the bridge off unawaited when it does not.
    const channels = shellChannels()
    if (channels?.writeShell) {
      try {
        void channels.writeShell(json)
      } catch {
        // Nothing further to try.
      }
      return
    }
    writeLocal(json)
  }
  window.addEventListener('pagehide', persistNow)
  window.addEventListener('beforeunload', persistNow)
}

installUnloadHook()

/* ------------------------------------------------------------------------- public API */

/**
 * Reads the stored record, degrading per key. Concurrent callers share one read, and a
 * second call after the first resolved simply returns the snapshot.
 */
export function load(): Promise<Persisted> {
  if (loaded) return Promise.resolve(state)
  if (loading !== null) return loading
  loading = (async (): Promise<Persisted> => {
    let stored: Persisted
    try {
      stored = sanitizePersisted(decode(await readStorage()))
    } catch {
      stored = defaults()
    }
    // Anything recorded during boot, before the read came back, is kept and re-numbered
    // above the stored ids rather than being overwritten by the load.
    const early = state.history
    if (early.length > 0) {
      let next = stored.history.length === 0 ? 1 : stored.history[stored.history.length - 1].id + 1
      const merged = stored.history.map((entry) => ({ ...entry }))
      for (const entry of early) {
        merged.push({ ...entry, id: next })
        next += 1
      }
      stored.history =
        merged.length > HISTORY_LIMIT ? merged.slice(merged.length - HISTORY_LIMIT) : merged
    }
    state = freeze(stored)
    loaded = true
    loading = null
    notify()
    return state
  })()
  return loading
}

/** True once `load()` has resolved. Until then `get()` returns the defaults. */
export function isLoaded(): boolean {
  return loaded
}

/**
 * Merges the patch into the record, notifies subscribers immediately, and persists on a
 * debounce. The returned promise settles when those bytes have actually been written, so a
 * caller that needs certainty — an export, a reset, a quit — can await it.
 */
export function save(patch: PersistedPatch): Promise<void> {
  try {
    state = freeze(merge(state, patch))
  } catch {
    // A patch this broken changes nothing; the previous record stands untouched.
    return Promise.resolve()
  }
  notify()
  return scheduleWrite()
}

/** The current snapshot. Synchronous, always populated, and frozen. */
export function get(): Persisted {
  return state
}

/** Subscribe to every committed change. The returned function unsubscribes; calling it twice is safe. */
export function subscribe(fn: (p: Persisted) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Back to defaults, stored and in memory. The game save is deliberately untouched —
 * `clearSave()` in `src/renderer/bridge.ts` owns that, and losing a farm to a settings
 * reset would be unforgivable.
 */
export async function resetAll(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  dirty = false
  const resolvers = waiters
  waiters = []
  state = freeze(defaults())
  loaded = true
  notify()
  writing = writing.then(() => clearStorage())
  try {
    await writing
  } catch {
    // `clearStorage` swallows its own failures.
  }
  for (const resolve of resolvers) resolve()
}

/* ------------------------------------------------------------------------------ merge */

function merge(current: Persisted, patch: PersistedPatch): Persisted {
  return {
    version: SCHEMA_VERSION,
    settings: patch.settings ? mergeSettings(current.settings, patch.settings) : current.settings,
    appearance: patch.appearance
      ? mergeAppearance(current.appearance, patch.appearance)
      : current.appearance,
    tabs: patch.tabs ? mergeTabs(current.tabs, patch.tabs) : current.tabs,
    history: patch.history ? sanitizeHistory(patch.history) : current.history,
  }
}

function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  const next: Record<string, unknown> = {
    language: patch.language ?? current.language,
    funny: { ...current.funny, ...(patch.funny ?? {}) },
    motion: patch.motion ?? current.motion,
    displayScale: patch.displayScale ?? current.displayScale,
    audio: { ...current.audio, ...(patch.audio ?? {}) },
    game: { ...current.game, ...(patch.game ?? {}) },
  }
  // Re-validated on the way in as well as on the way out: a lane that ships a bad value
  // never gets to store it.
  return sanitizeSettings(next, current)
}

function mergeAppearance(current: AppearanceMap, patch: AppearancePatch): AppearanceMap {
  const next: AppearanceMap = { ...current }
  for (const id of Object.keys(patch)) {
    if (id === '__proto__') continue
    const value = patch[id]
    if (value === null) {
      delete next[id]
      continue
    }
    const merged: Record<string, unknown> = { ...next[id] }
    for (const field of Object.keys(value)) {
      const raw = (value as Record<string, unknown>)[field]
      // An explicit `undefined` clears that one field; an omitted field is left alone.
      if (raw === undefined) delete merged[field]
      else merged[field] = raw
    }
    const clean = sanitizeAppearanceValue(merged)
    if (clean === null) delete next[id]
    else next[id] = clean
  }
  return next
}

function mergeTabs(current: TabState, patch: Partial<TabState>): TabState {
  return sanitizeTabs({
    tabs: patch.tabs ?? current.tabs,
    groups: patch.groups ?? current.groups,
    activeId: patch.activeId !== undefined ? patch.activeId : current.activeId,
  })
}
