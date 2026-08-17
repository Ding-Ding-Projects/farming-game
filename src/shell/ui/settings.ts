/**
 * The Settings tab.
 *
 * Eight tabbed sections — Language, Appearance, Motion & accessibility, Display scale,
 * Audio, Game, Data, About — with one search field over all of them, its own anchored
 * regex builder, and one rule: nothing is stored that is not visibly consumed. Every row
 * reads and writes `src/shell/core/store.ts`, registers a palette `Target` that really
 * teleports to it, and is a real labelled control with a keyboard path and visible focus.
 *
 * Everything that can be applied from here is applied from here: the motion override
 * reaches the farm through `matchMedia`, the display scale is verified against the
 * stylesheet before falling back to the root font size, the volume slider sits on a real
 * gain node in front of every audio destination, and the theme colours are written to the
 * palette custom properties `tokens.css` publishes.
 */

import { PAL } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'
import { CROPS, produceValue } from '../../game/crops'
import { isMuted, playSound, setMuted, unlockAudio } from '../../engine/audio'
import { SAVE_VERSION } from '../../game/constants'
import type { GameState } from '../../game/types'
import { clearSave, loadSave, saveGame } from '../../renderer/bridge'

import {
  DISPLAY_SCALES,
  FUNNY_LEVELS,
  LANGS,
  MOTION_MODES,
  PIXEL_SCALES,
  get,
  load,
  resetAll,
  save,
  subscribe,
} from '../core/store'
import type {
  DisplayScale,
  FunnyLevel,
  GameOptions,
  HistoryKind,
  Lang,
  MotionMode,
  PixelScale,
  Settings,
  SettingsPatch,
} from '../core/store'
import {
  funnyLevelKey,
  hasKey,
  langOptionDescKey,
  langOptionKey,
  onLangChange,
  setFunny,
  setLang,
  t as translate,
} from '../core/i18n'
import type { StringKey } from '../core/i18n'
import { compile, escapeLiteral, plainToPattern, run as runPattern } from '../core/regex'
import { registerCommand, registerGroupLabel, registerTarget } from '../core/palette-registry'
import { clear as clearHistory, record } from '../core/history'
import {
  EXPORT_FORMATS,
  MAX_IMPORT_BYTES,
  download,
  exportAs,
  importJson,
  mimeFor,
  suggestFilename,
  validateImport,
} from '../core/export'
import type { ExportFormat, ExportSection } from '../core/export'
import {
  APPEARANCE_CHORD,
  appearanceFor,
  attachEditor,
  detachEditor,
  openAppearanceEditor,
  resetAllAppearance,
  setAppearance,
} from './appearance'
import { confirm as confirmDialog, fail, info, success } from './notify'
import { createTabStrip } from './tabs'
import { applyRootTokens } from './tokens'

import licenceText from '../../../LICENSE?raw'
import packageManifest from '../../../package.json?raw'

// ---------------------------------------------------------------------------
// shape
// ---------------------------------------------------------------------------

const SECTION_IDS = [
  'language',
  'appearance',
  'motion',
  'scale',
  'audio',
  'game',
  'data',
  'about',
] as const

export type SettingsSectionId = (typeof SECTION_IDS)[number]

/** The id `src/shell/ui/catalogue.ts` lists for this surface's search field. */
export const SETTINGS_SEARCH_ID = 'settings'

/** The appearance-map element id this panel registers, and the theme colour prefix. */
export const SETTINGS_ELEMENT_ID = 'shell.settings'
const THEME_PREFIX = 'theme.color.'

export interface SettingsPanelOptions {
  /**
   * Brings the Settings tab to the front. `app.ts` owns the tab strip, so a palette
   * teleport calls this before opening a section and focusing a row.
   */
  activate?: () => void
}

export interface SettingsPanel {
  readonly element: HTMLElement
  readonly sections: readonly SettingsSectionId[]
  /** Opens a section and, when given a row, scrolls it into view and focuses it. */
  open(section?: SettingsSectionId, rowId?: string): void
  /** Re-reads every control from the store. */
  sync(): void
  destroy(): void
}

type Params = Record<string, string | number>
type AnyFn = (...args: readonly unknown[]) => unknown

const EXPORT_CHOICES = ['all', 'save', 'settings', 'appearance', 'history'] as const
type ExportChoice = (typeof EXPORT_CHOICES)[number]

const PALETTE_NAMES: readonly PaletteName[] = [
  'ink',
  'shadow',
  'bark',
  'soil',
  'soilWet',
  'grass',
  'grassLit',
  'leaf',
  'parchment',
  'cream',
  'lantern',
  'berry',
  'sky',
  'dusk',
]

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const tFn = translate as unknown as (key: string, params?: Params) => string

/** Suffixes whose absence should leave the surface quiet rather than shout an id. */
const OPTIONAL_SUFFIX = /\.(desc|note|hint)$/

function humanise(key: string): string {
  const parts = key.split('.').filter((part) => part !== 'label' && part !== 'title')
  const tail = parts[parts.length - 1] ?? key
  const words = tail
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (words.length === 0) return key
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/**
 * Every user-visible string goes through `t()`. A key the catalogue has not grown yet
 * degrades to a readable label rather than a raw id, and an absent description simply
 * does not render.
 */
function t(key: string, params?: Params): string {
  if (hasKey(key)) {
    try {
      return tFn(key, params)
    } catch {
      return humanise(key)
    }
  }
  if (OPTIONAL_SUFFIX.test(key)) return ''
  const label = humanise(key)
  if (params === undefined) return label
  const facts = Object.values(params)
    .map((value) => String(value))
    .join(', ')
  return facts.length === 0 ? label : `${label}: ${facts}`
}

/** For the shared modules that type their arguments as `StringKey`. */
function key(id: string): StringKey {
  return id as unknown as StringKey
}

/** True while a funny-level sample is rendered in a language that is not the active one. */
let sampling = false

function sampleIn(lang: Lang, id: string, params?: Params): string {
  const active = settings().language
  if (active === lang) return t(id, params)
  sampling = true
  try {
    setLang(lang)
    return t(id, params)
  } finally {
    try {
      setLang(active)
    } catch {
      // The store still holds the real choice; the next render puts it back.
    }
    sampling = false
  }
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

function settings(): Settings {
  return get().settings
}

function patch(next: SettingsPatch): void {
  void save({ settings: next }).catch(() => undefined)
}

function gameOptions(): GameOptions {
  return settings().game
}

function patchGame(next: Partial<GameOptions>): void {
  patch({ game: next })
}

function logSetting(id: string, params: Params, kind: HistoryKind = 'settings'): void {
  try {
    record(kind, id, undefined, params)
  } catch {
    // A history line is never worth losing a setting over.
  }
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: Node,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== '') node.className = className
  if (parent !== undefined) parent.appendChild(node)
  return node
}

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `sh-${prefix}-${idCounter}`
}

const retranslators: Array<() => void> = []

function tText(node: HTMLElement, id: string, params?: () => Params): void {
  const paint = (): void => {
    node.textContent = t(id, params === undefined ? undefined : params())
  }
  paint()
  retranslators.push(paint)
}

function tAttr(node: HTMLElement, attr: string, id: string, params?: () => Params): void {
  const paint = (): void => {
    const value = t(id, params === undefined ? undefined : params())
    if (value.length === 0) node.removeAttribute(attr)
    else node.setAttribute(attr, value)
  }
  paint()
  retranslators.push(paint)
}

function retranslateAll(): void {
  for (const paint of retranslators) {
    try {
      paint()
    } catch {
      // One dead string must not blank the rest of the panel.
    }
  }
}


// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

function toast(kind: 'info' | 'success' | 'failure', id: string, params?: Params): void {
  try {
    if (kind === 'info') info(key(id), params)
    else if (kind === 'success') success(key(id), params)
    else fail(key(id), params)
  } catch {
    announceShell(t(id, params), kind === 'failure')
  }
}

interface ConfirmRequest {
  titleKey: string
  bodyKey: string
  params?: Params
  confirmKey: string
}

/** The only blocking dialog this file opens, and only for something with no undo. */
function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return confirmDialog({
    titleKey: key(request.titleKey),
    messageKey: key(request.bodyKey),
    params: request.params,
    confirmKey: key(request.confirmKey),
    cancelKey: key('common.cancel'),
    destructive: true,
  }).catch(() => false)
}

let liveRegion: HTMLElement | null = null

function announceShell(message: string, isFailure: boolean): void {
  if (typeof document === 'undefined' || message.length === 0) return
  if (liveRegion === null || !liveRegion.isConnected) {
    liveRegion = el('div', 'sh-live')
    liveRegion.id = 'sh-settings-live'
    liveRegion.setAttribute('role', isFailure ? 'alert' : 'status')
    liveRegion.setAttribute('aria-live', 'polite')
    document.body.appendChild(liveRegion)
  }
  if (!isFailure && !gameOptions().announceActions) return
  liveRegion.textContent = message
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

const STYLE_ID = 'sh-settings-style'

/**
 * Layout only, and only what `base.css` does not already carry. Every value here is a
 * token from `tokens.css`; there is no colour literal anywhere in this file.
 */
function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
  const style = el('style')
  style.id = STYLE_ID
  style.textContent = `
.sh-settings{display:flex;flex-direction:column;gap:var(--sh-space-3);height:100%;min-width:0}
.sh-settings__head{display:flex;flex-wrap:wrap;gap:var(--sh-space-2);align-items:flex-end;justify-content:space-between}
.sh-settings__title{display:flex;flex-direction:column;gap:var(--sh-space-1);min-width:0}
.sh-settings__body{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:var(--sh-space-3)}
.sh-setting{display:flex;flex-wrap:wrap;gap:var(--sh-space-3);align-items:flex-start;justify-content:space-between;padding:var(--sh-space-2) 0;border-bottom:var(--sh-px) solid var(--sh-color-soil)}
.sh-setting:last-child{border-bottom:0}
.sh-setting[hidden]{display:none}
.sh-setting__text{display:flex;flex-direction:column;gap:var(--sh-space-1);flex:1 1 18rem;min-width:0}
.sh-setting__ctl{display:flex;flex-wrap:wrap;gap:var(--sh-space-2);align-items:center;min-width:0}
.sh-settings[data-sh-narrow='true'] .sh-setting{flex-direction:column;align-items:stretch}
.sh-settings__choices{display:flex;flex-wrap:wrap;gap:var(--sh-space-1);min-width:0}
.sh-settings__sample{margin:0;padding:var(--sh-space-2);border:var(--sh-px) solid var(--sh-color-bark);background:var(--sh-bg-field,var(--sh-color-cream));max-width:46ch}
.sh-settings__pre{margin:0;padding:var(--sh-space-2);max-height:14rem;overflow:auto;white-space:pre-wrap;border:var(--sh-px) solid var(--sh-color-bark);background:var(--sh-bg-field,var(--sh-color-cream));font-size:var(--sh-text-xs)}
.sh-settings__search{position:relative;min-width:0;flex:1 1 18rem}
.sh-settings__group{display:flex;flex-direction:column;gap:var(--sh-space-2)}
.sh-settings__builder{display:flex;flex-direction:column;gap:var(--sh-space-2);min-width:min(30rem,80vw)}
.sh-settings__builder textarea{width:100%;min-height:5rem}
.sh-settings__swatch{width:calc(var(--sh-target-min) * 2);min-height:var(--sh-target-min);padding:0}
.sh-setting input[type='range']{min-height:var(--sh-target-min);width:min(14rem,50vw)}
.sh-setting input[type='file']{max-width:min(18rem,60vw)}
.sh-setting[data-sh-teleport='true']{background:var(--sh-surface-hover,transparent)}
`
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// motion: the override has to reach the farm as well as the shell
// ---------------------------------------------------------------------------

type MatchMediaFn = (query: string) => MediaQueryList

let nativeMatchMedia: MatchMediaFn | null = null
let motionBridgeInstalled = false

function systemPrefersReduced(): boolean {
  try {
    const fn = nativeMatchMedia ?? (typeof matchMedia === 'function' ? matchMedia : null)
    if (fn === null) return false
    return fn.call(globalThis, '(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** What the app is actually doing, once the in-app override is taken into account. */
export function motionIsReduced(): boolean {
  const mode = settings().motion
  if (mode === 'reduced') return true
  if (mode === 'full') return false
  return systemPrefersReduced()
}

/**
 * `tokens.css` already resolves the override for CSS in both directions. The farm does
 * not read CSS: `src/art/tiles.ts` asks `matchMedia('(prefers-reduced-motion: reduce)')`,
 * and this lane may not edit it. Wrapping `matchMedia` is the honest way to make one
 * setting govern both surfaces; every other query is handed back untouched.
 */
function installMotionBridge(): void {
  if (motionBridgeInstalled) return
  const holder = globalThis as unknown as { matchMedia?: MatchMediaFn }
  const native = holder.matchMedia
  if (typeof native !== 'function') return
  const bound: MatchMediaFn = (query) => native.call(globalThis, query)
  nativeMatchMedia = bound
  holder.matchMedia = (query: string): MediaQueryList => {
    const real = bound(query)
    return /prefers-reduced-motion/i.test(query) ? motionView(query, real) : real
  }
  motionBridgeInstalled = true
}

function motionView(query: string, real: MediaQueryList): MediaQueryList {
  const view = Object.create(real) as MediaQueryList
  const passthrough = [
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
    'addListener',
    'removeListener',
  ] as const
  for (const name of passthrough) {
    const fn = (real as unknown as Record<string, unknown>)[name]
    if (typeof fn === 'function') {
      Object.defineProperty(view, name, { value: (fn as AnyFn).bind(real), configurable: true })
    }
  }
  Object.defineProperty(view, 'media', { get: () => real.media, configurable: true })
  Object.defineProperty(view, 'onchange', {
    get: () => real.onchange,
    set: (handler: MediaQueryList['onchange']) => {
      real.onchange = handler
    },
    configurable: true,
  })
  const wantsReduce = !/no-preference/i.test(query)
  Object.defineProperty(view, 'matches', {
    get: () => (settings().motion === 'system' ? real.matches : motionIsReduced() === wantsReduce),
    configurable: true,
  })
  return view
}

// ---------------------------------------------------------------------------
// theme colours
// ---------------------------------------------------------------------------

function themeElementId(name: PaletteName): string {
  return `${THEME_PREFIX}${name}`
}

function themeColour(name: PaletteName): string | null {
  const value = appearanceFor(themeElementId(name)).color
  return typeof value === 'string' && value.length > 0 ? value : null
}

function themeOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const name of PALETTE_NAMES) {
    const value = themeColour(name)
    if (value !== null) overrides[name] = value
  }
  return overrides
}

// ---------------------------------------------------------------------------
// audio: mute through the engine, volume through a shell master bus
// ---------------------------------------------------------------------------

type AudioCtor = new (options?: AudioContextOptions) => AudioContext

const volumeBuses: GainNode[] = []
let volumeBusInstalled = false

function targetGain(): number {
  const audio = settings().audio
  if (audio.muted) return 0
  return Math.min(1, Math.max(0, audio.volume))
}

/**
 * `src/engine/audio.ts` owns mute and is called for it directly. It has no volume, and
 * this lane may not edit it, so every `AudioContext` built from here on gets a shell
 * gain node in front of its destination — a real master volume for the synthesised
 * sound, rather than a slider that only moves a number.
 */
function installVolumeBus(): void {
  if (volumeBusInstalled) return
  const holder = globalThis as unknown as { AudioContext?: AudioCtor }
  const Native = holder.AudioContext
  if (typeof Native !== 'function') return
  class ShellAudioContext extends Native {
    constructor(options?: AudioContextOptions) {
      super(options)
      try {
        const real = this.destination
        const bus = this.createGain()
        bus.gain.value = targetGain()
        bus.connect(real)
        Object.defineProperty(this, 'destination', { get: () => bus, configurable: true })
        volumeBuses.push(bus)
      } catch {
        // Without a bus the context still plays; only the slider loses its reach.
      }
    }
  }
  holder.AudioContext = ShellAudioContext as unknown as AudioCtor
  volumeBusInstalled = true
}

function applyAudio(): void {
  installVolumeBus()
  const wanted = settings().audio.muted
  try {
    if (isMuted() !== wanted) setMuted(wanted)
  } catch {
    // A locked-down profile is not a reason to fail the rest of the panel.
  }
  const gain = targetGain()
  for (const bus of volumeBuses) {
    try {
      bus.gain.value = gain
    } catch {
      // A closed context. The list is short and harmless.
    }
  }
}

// ---------------------------------------------------------------------------
// announcements
// ---------------------------------------------------------------------------

function applyAnnounce(): void {
  if (typeof document === 'undefined') return
  const region = document.getElementById('live')
  if (region === null) return
  region.setAttribute('aria-live', gameOptions().announceActions ? 'polite' : 'off')
}

// ---------------------------------------------------------------------------
// keyboard routing
// ---------------------------------------------------------------------------

/** Everything `src/renderer` binds, from the control table in `docs/ARCHITECTURE.md`. */
const FARM_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'Enter',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'KeyQ',
  'KeyE',
  'KeyB',
  'KeyI',
  'KeyN',
  'KeyH',
  'KeyM',
  'F1',
])

function isEditable(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.isContentEditable) return true
  const tag = node.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (node as HTMLInputElement).type
    return type !== 'radio' && type !== 'checkbox' && type !== 'button' && type !== 'file'
  }
  const role = node.getAttribute('role')
  return role === 'textbox' || role === 'searchbox' || role === 'combobox'
}

function ownsFarmKeys(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return true
  if (node.tagName === 'CANVAS' || node.id === 'game') return true
  if (node.closest('[data-sh-farm]') !== null) return true
  return node.tagName === 'BODY' || node.tagName === 'HTML'
}

/**
 * `src/engine/input.ts` listens on `window` and swallows the arrows and Space, so a
 * shell text field would walk the farmer instead of typing. Stopping those keys at
 * `document` — the last hop before `window` — leaves every shell control untouched and
 * never reaches the farm. Modified keys always pass so the palette and the tab chords
 * keep working.
 */
const keyGuard = (event: KeyboardEvent): void => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (!FARM_KEYS.has(event.code)) return
  if (ownsFarmKeys(event.target) && !isEditable(event.target)) return
  event.stopPropagation()
}

let keyGuardInstalled = false

function installKeyGuard(): void {
  if (keyGuardInstalled || typeof document === 'undefined') return
  document.addEventListener('keydown', keyGuard)
  document.addEventListener('keyup', keyGuard)
  keyGuardInstalled = true
}

// ---------------------------------------------------------------------------
// applying everything
// ---------------------------------------------------------------------------

let bootstrapped = false

/**
 * Applies every persisted setting to the running app. `app.ts` should call this as early
 * as it can — before the farm mounts — because `src/art/tiles.ts` caches the
 * reduced-motion answer the first time it draws.
 */
export function applyPersistedSettings(): void {
  if (typeof document === 'undefined') return
  installStyles()
  installMotionBridge()
  installKeyGuard()
  const current = settings()
  applyRootTokens({
    scale: current.displayScale,
    motion: current.motion,
    overrides: themeOverrides(),
  })
  applyAudio()
  applyAnnounce()
  if (bootstrapped) return
  bootstrapped = true
  try {
    setLang(current.language)
    setFunny(current.funny)
  } catch {
    // i18n keeps its own defaults; the rows still show what the store holds.
  }
  subscribe(() => {
    // `sampleIn` switches the language, reads one string and switches back, and
    // `setLang` writes through to the store — so without this guard drawing a sample
    // re-enters here, re-syncs the panel, redraws the sample and switches the language
    // again, forever. It is a synchronous cycle, so nothing else on the main thread
    // ever runs again: no timers, no animation frames, not even the load event. The
    // application opened to a window that never appeared.
    //
    // The language-change handler further down already skipped sampling for exactly
    // this reason. The store is the second way in, and it was not guarded.
    if (sampling) return
    const now = settings()
    applyRootTokens({
      scale: now.displayScale,
      motion: now.motion,
      overrides: themeOverrides(),
    })
    applyAudio()
    applyAnnounce()
    activePanel?.sync()
  })
  void load()
    .then(() => {
      const loaded = settings()
      applyRootTokens({
        scale: loaded.displayScale,
        motion: loaded.motion,
        overrides: themeOverrides(),
      })
      applyAudio()
      applyAnnounce()
      try {
        setLang(loaded.language)
        setFunny(loaded.funny)
      } catch {
        // As above.
      }
      retranslateAll()
      activePanel?.sync()
    })
    .catch(() => undefined)
}

// ---------------------------------------------------------------------------
// rows and controls
// ---------------------------------------------------------------------------

interface Row {
  id: string
  section: SettingsSectionId
  element: HTMLElement
  readonly focusTarget: HTMLElement | null
  labelKey: string
  sync(): void
  searchText(): string
}

interface RowHandle {
  id: string
  section: SettingsSectionId
  element: HTMLElement
  control: HTMLElement
  labelId: string
  descId: string
  setFocus(node: HTMLElement): void
  onSync(fn: () => void): void
  addTerms(text: string): void
}

function makeRow(
  section: SettingsSectionId,
  id: string,
  labelKey: string,
  descKey: string,
  rows: Row[],
  params?: () => Params,
): RowHandle {
  const element = el('div', 'sh-setting')
  element.id = `sh-setting-${id.replace(/\./g, '-')}`
  element.dataset.shRow = id
  element.dataset.shSection = section

  const text = el('div', 'sh-setting__text', element)
  const label = el('span', 'sh-label', text)
  label.id = uid('label')
  tText(label, labelKey, params)

  const desc = el('p', 'sh-hint', text)
  desc.id = uid('hint')
  const paintDesc = (): void => {
    const value = t(descKey, params === undefined ? undefined : params())
    desc.textContent = value
    desc.hidden = value.length === 0
  }
  paintDesc()
  retranslators.push(paintDesc)

  const control = el('div', 'sh-setting__ctl', element)

  const syncers: Array<() => void> = []
  let focusTarget: HTMLElement | null = null
  const terms: string[] = [id, section]

  rows.push({
    id,
    section,
    element,
    labelKey,
    get focusTarget() {
      return focusTarget
    },
    sync: () => {
      for (const fn of syncers) {
        try {
          fn()
        } catch {
          // One control that cannot read itself must not stop the others.
        }
      }
    },
    searchText: () => `${element.textContent ?? ''} ${terms.join(' ')}`,
  })

  return {
    id,
    section,
    element,
    control,
    labelId: label.id,
    descId: desc.id,
    setFocus: (node) => {
      focusTarget = node
    },
    onSync: (fn) => {
      syncers.push(fn)
    },
    addTerms: (extra) => {
      terms.push(extra)
    },
  }
}

interface ChoiceSpec {
  value: string
  labelKey: string
  descKey?: string
  params?: Params
}

function choiceParams(choice: ChoiceSpec): (() => Params) | undefined {
  const values = choice.params
  return values === undefined ? undefined : () => values
}

function radioControl(
  handle: RowHandle,
  choices: readonly ChoiceSpec[],
  read: () => string,
  write: (value: string) => void,
): void {
  const group = el('div', 'sh-settings__choices', handle.control)
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-labelledby', handle.labelId)
  group.setAttribute('aria-describedby', handle.descId)
  const name = uid('radio')
  const inputs: HTMLInputElement[] = []

  for (const choice of choices) {
    const option = el('label', 'sh-option', group)
    const input = el('input', '', option)
    input.type = 'radio'
    input.name = name
    input.value = choice.value
    const caption = el('span', '', option)
    tText(caption, choice.labelKey, choiceParams(choice))
    if (choice.descKey !== undefined) {
      const hint = el('span', 'sh-hint', option)
      hint.id = uid('opt-hint')
      tText(hint, choice.descKey)
      input.setAttribute('aria-describedby', hint.id)
    }
    input.addEventListener('change', () => {
      if (input.checked) write(choice.value)
    })
    inputs.push(input)
    handle.addTerms(choice.value)
  }

  const paint = (): void => {
    const value = read()
    let matched = false
    for (const input of inputs) {
      input.checked = input.value === value
      matched = matched || input.checked
    }
    if (!matched && inputs.length > 0) inputs[0].checked = true
    const checked = inputs.find((input) => input.checked)
    handle.setFocus(checked ?? inputs[0])
  }
  paint()
  handle.onSync(paint)
}

function switchControl(
  handle: RowHandle,
  read: () => boolean,
  write: (value: boolean) => void,
): HTMLButtonElement {
  const button = el('button', 'sh-btn', handle.control)
  button.type = 'button'
  button.setAttribute('role', 'switch')
  button.setAttribute('aria-labelledby', handle.labelId)
  button.setAttribute('aria-describedby', handle.descId)
  const state = el('span', 'sh-hint', handle.control)
  state.setAttribute('aria-hidden', 'true')

  const paintState = (): void => {
    const on = button.getAttribute('aria-checked') === 'true'
    state.textContent = t(on ? 'common.on' : 'common.off')
  }
  const paint = (): void => {
    button.setAttribute('aria-checked', String(read()))
    paintState()
  }
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true'
    button.setAttribute('aria-checked', String(next))
    paintState()
    write(next)
  })
  retranslators.push(paintState)
  paint()
  handle.onSync(paint)
  handle.setFocus(button)
  return button
}

function sliderControl(
  handle: RowHandle,
  bounds: { min: number; max: number; step: number },
  read: () => number,
  write: (value: number) => void,
  format: (value: number) => string,
): HTMLInputElement {
  const input = el('input', 'sh-input', handle.control)
  input.type = 'range'
  input.min = String(bounds.min)
  input.max = String(bounds.max)
  input.step = String(bounds.step)
  input.setAttribute('aria-labelledby', handle.labelId)
  input.setAttribute('aria-describedby', handle.descId)
  const readout = el('output', 'sh-num', handle.control)
  readout.setAttribute('aria-hidden', 'true')

  const paintOut = (): void => {
    const text = format(Number(input.value))
    readout.textContent = text
    input.setAttribute('aria-valuetext', text)
  }
  input.addEventListener('input', () => {
    write(Number(input.value))
    paintOut()
  })
  const paint = (): void => {
    input.value = String(read())
    paintOut()
  }
  retranslators.push(paintOut)
  paint()
  handle.onSync(paint)
  handle.setFocus(input)
  return input
}

function selectControl(
  parent: HTMLElement,
  labelledBy: string,
  describedBy: string,
  choices: readonly ChoiceSpec[],
  read: () => string,
  write: (value: string) => void,
): HTMLSelectElement {
  const select = el('select', 'sh-select', parent)
  select.setAttribute('aria-labelledby', labelledBy)
  select.setAttribute('aria-describedby', describedBy)
  for (const choice of choices) {
    const option = el('option', '', select)
    option.value = choice.value
    tText(option, choice.labelKey, choiceParams(choice))
  }
  select.addEventListener('change', () => write(select.value))
  select.value = read()
  return select
}

function buttonControl(
  parent: HTMLElement,
  labelKey: string,
  onClick: () => void,
  danger = false,
): HTMLButtonElement {
  const button = el('button', danger ? 'sh-btn sh-btn--danger' : 'sh-btn', parent)
  button.type = 'button'
  tText(button, labelKey)
  button.addEventListener('click', onClick)
  return button
}

/** A row with no control is still reachable, and still a teleport destination. */
function infoTarget(handle: RowHandle, node: HTMLElement): void {
  node.tabIndex = -1
  handle.setFocus(node)
}

// ---------------------------------------------------------------------------
// the search field and its own anchored regex builder
// ---------------------------------------------------------------------------

const MAX_SAMPLE = 4000

interface SearchBar {
  element: HTMLElement
  focus(): void
  clear(): void
  value(): string
  useRegex(): boolean
  flags(): string
  setStatus(text: string, isError: boolean): void
}

interface BuilderPiece {
  labelKey: string
  insert: string
  caret?: number
}

const BUILDER_PIECES: readonly BuilderPiece[] = [
  { labelKey: 'regex.piece.any', insert: '.' },
  { labelKey: 'regex.piece.digit', insert: '\\d' },
  { labelKey: 'regex.piece.word', insert: '\\w' },
  { labelKey: 'regex.piece.space', insert: '\\s' },
  { labelKey: 'regex.piece.charclass', insert: '[a-z]', caret: 1 },
  { labelKey: 'regex.piece.anchor.start', insert: '^' },
  { labelKey: 'regex.piece.anchor.end', insert: '$' },
  { labelKey: 'regex.piece.wordboundary', insert: '\\b' },
  { labelKey: 'regex.piece.capture', insert: '()', caret: 1 },
  { labelKey: 'regex.piece.noncapture', insert: '(?:)', caret: 3 },
  { labelKey: 'regex.piece.alternation', insert: '|' },
  { labelKey: 'regex.quantifier.optional', insert: '?' },
  { labelKey: 'regex.quantifier.some', insert: '+' },
  { labelKey: 'regex.quantifier.any', insert: '*' },
  { labelKey: 'regex.quantifier.exact', insert: '{2}', caret: 1 },
  { labelKey: 'regex.quantifier.range', insert: '{1,3}', caret: 1 },
]

const BUILDER_FLAGS = [
  { flag: 'i', labelKey: 'regex.flag.i' },
  { flag: 'm', labelKey: 'regex.flag.m' },
  { flag: 's', labelKey: 'regex.flag.s' },
  { flag: 'u', labelKey: 'regex.flag.u' },
] as const

/**
 * The Settings surface owns its own field and its own builder: no builder state is
 * shared with any other search in the app, and nothing here is persisted. It registers
 * with `searchfield.ts`'s registry when one is exported so `catalogue.ts` still resolves
 * this surface to a real field.
 */
function createSearchBar(onQuery: () => void, corpus: () => string): SearchBar {
  const element = el('div', 'sh-searchfield sh-settings__search')

  const label = el('label', 'sh-label', element)
  label.htmlFor = uid('search')
  tText(label, 'search.settings.label')

  const input = el('input', 'sh-input sh-searchfield__input', element)
  input.type = 'text'
  input.id = label.htmlFor
  input.autocomplete = 'off'
  input.spellcheck = false
  tAttr(input, 'placeholder', 'search.settings.placeholder')

  const modeToggle = el('button', 'sh-btn', element)
  modeToggle.type = 'button'
  modeToggle.setAttribute('aria-pressed', 'false')
  tText(modeToggle, 'search.mode.regex')
  tAttr(modeToggle, 'title', 'search.mode.hint')

  const builderToggle = el('button', 'sh-btn', element)
  builderToggle.type = 'button'
  builderToggle.setAttribute('aria-expanded', 'false')

  const clearButton = el('button', 'sh-btn sh-btn--ghost', element)
  clearButton.type = 'button'
  tText(clearButton, 'search.clear')

  const status = el('p', 'sh-searchfield__count', element)
  status.id = uid('search-count')
  status.setAttribute('role', 'status')
  input.setAttribute('aria-describedby', status.id)

  const builder = el('div', 'sh-popover sh-settings__builder', element)
  builder.id = uid('builder')
  builder.hidden = true
  builder.setAttribute('role', 'group')
  tAttr(builder, 'aria-label', 'regex.title')
  builderToggle.setAttribute('aria-controls', builder.id)

  let regexOn = false
  let flags = 'i'

  const patternField = el('div', 'sh-field', builder)
  const patternLabel = el('label', 'sh-label', patternField)
  patternLabel.htmlFor = uid('pattern')
  tText(patternLabel, 'regex.pattern.label')
  const pattern = el('input', 'sh-input', patternField)
  pattern.type = 'text'
  pattern.id = patternLabel.htmlFor
  pattern.autocomplete = 'off'
  pattern.spellcheck = false
  tAttr(pattern, 'placeholder', 'regex.pattern.placeholder')
  const dialect = el('p', 'sh-hint', patternField)
  tText(dialect, 'regex.dialect', () => ({ dialect: 'ECMAScript RegExp' }))

  const pieces = el('div', 'sh-settings__choices', builder)
  for (const piece of BUILDER_PIECES) {
    const button = el('button', 'sh-btn', pieces)
    button.type = 'button'
    tText(button, piece.labelKey)
    button.addEventListener('click', () => {
      const start = pattern.selectionStart ?? pattern.value.length
      const end = pattern.selectionEnd ?? start
      pattern.value = `${pattern.value.slice(0, start)}${piece.insert}${pattern.value.slice(end)}`
      const caret = start + (piece.caret ?? piece.insert.length)
      pattern.focus()
      pattern.setSelectionRange(caret, caret)
      refreshBuilder()
      pushPattern()
    })
  }

  const literalField = el('div', 'sh-field', builder)
  const literalLabel = el('label', 'sh-label', literalField)
  literalLabel.htmlFor = uid('literal')
  tText(literalLabel, 'regex.piece.literal')
  const literalRow = el('div', 'sh-row', literalField)
  const literal = el('input', 'sh-input', literalRow)
  literal.type = 'text'
  literal.id = literalLabel.htmlFor
  buttonControl(literalRow, 'regex.piece.add', () => {
    if (literal.value.length === 0) return
    pattern.value += escapeLiteral(literal.value)
    literal.value = ''
    refreshBuilder()
    pushPattern()
    pattern.focus()
  })
  const escapeNote = el('p', 'sh-hint', literalField)
  tText(escapeNote, 'regex.escape.note')

  const flagsField = el('fieldset', 'sh-field', builder)
  const flagsLegend = el('legend', 'sh-label', flagsField)
  tText(flagsLegend, 'regex.flags.label')
  const flagsRow = el('div', 'sh-settings__choices', flagsField)
  for (const entry of BUILDER_FLAGS) {
    const option = el('label', 'sh-option', flagsRow)
    const box = el('input', '', option)
    box.type = 'checkbox'
    box.checked = flags.includes(entry.flag)
    const caption = el('span', '', option)
    tText(caption, entry.labelKey)
    box.addEventListener('change', () => {
      const wanted = new Set(flags.split(''))
      if (box.checked) wanted.add(entry.flag)
      else wanted.delete(entry.flag)
      flags = BUILDER_FLAGS.filter((f) => wanted.has(f.flag))
        .map((f) => f.flag)
        .join('')
      refreshBuilder()
      onQuery()
    })
  }

  const sampleField = el('div', 'sh-field', builder)
  const sampleLabel = el('label', 'sh-label', sampleField)
  sampleLabel.htmlFor = uid('sample')
  tText(sampleLabel, 'regex.sample.label')
  const sample = el('textarea', 'sh-input', sampleField)
  sample.id = sampleLabel.htmlFor
  tAttr(sample, 'placeholder', 'regex.sample.placeholder')
  const sampleLimit = el('p', 'sh-hint', sampleField)
  tText(sampleLimit, 'regex.sample.limit', () => ({ max: MAX_SAMPLE }))

  const feedback = el('p', 'sh-hint', builder)
  feedback.setAttribute('role', 'status')
  const notPersisted = el('p', 'sh-hint', builder)
  tText(notPersisted, 'regex.notPersisted')

  const actions = el('div', 'sh-row', builder)
  buttonControl(actions, 'common.reset', () => {
    sample.value = corpus().slice(0, MAX_SAMPLE)
    refreshBuilder()
  })
  buttonControl(actions, 'regex.copy', () => {
    copyText(pattern.value)
    toast('info', 'common.copied', { text: pattern.value })
  })
  buttonControl(actions, 'common.apply', () => {
    if (!regexOn) setRegex(true)
    input.value = pattern.value
    onQuery()
    input.focus()
  })

  function pushPattern(): void {
    if (!regexOn) return
    input.value = pattern.value
    onQuery()
  }

  function refreshBuilder(): void {
    const source = pattern.value
    if (source.length === 0) {
      feedback.textContent = t('regex.empty')
      return
    }
    const compiled = compile(source, flags)
    if (!compiled.ok) {
      feedback.textContent =
        compiled.index === undefined
          ? t('regex.error', { error: compiled.error })
          : t('regex.error.at', { index: compiled.index, error: compiled.error })
      return
    }
    const started = typeof performance === 'undefined' ? 0 : performance.now()
    const outcome = runPattern(compiled.re, sample.value.slice(0, MAX_SAMPLE))
    const elapsed = typeof performance === 'undefined' ? 0 : Math.round(performance.now() - started)
    if (outcome.timedOut) {
      feedback.textContent = t('regex.timeout', { ms: elapsed })
      return
    }
    const count = outcome.matches.length
    const lines = [count === 0 ? t('regex.matches.none') : t('regex.matches', { count })]
    if (outcome.truncated) {
      lines.push(t('regex.matches.truncated', { shown: count, limit: count }))
    }
    feedback.textContent = lines.join(' ')
  }

  function setRegex(on: boolean): void {
    regexOn = on
    modeToggle.setAttribute('aria-pressed', String(on))
    modeToggle.textContent = t(on ? 'search.mode.regex' : 'search.mode.plain')
    if (on && pattern.value.length === 0 && input.value.length > 0) {
      pattern.value = plainToPattern(input.value)
      input.value = pattern.value
    }
    refreshBuilder()
  }

  function openBuilder(open: boolean): void {
    builder.hidden = !open
    builderToggle.setAttribute('aria-expanded', String(open))
    builderToggle.textContent = t(open ? 'search.builder.close' : 'search.builder.open')
    if (!open) return
    if (pattern.value.length === 0) {
      pattern.value = regexOn ? input.value : plainToPattern(input.value)
    }
    if (sample.value.length === 0) sample.value = corpus().slice(0, MAX_SAMPLE)
    refreshBuilder()
    pattern.focus()
  }

  input.addEventListener('input', () => {
    if (regexOn) {
      pattern.value = input.value
      refreshBuilder()
    }
    onQuery()
  })
  pattern.addEventListener('input', () => {
    refreshBuilder()
    pushPattern()
  })
  sample.addEventListener('input', refreshBuilder)
  modeToggle.addEventListener('click', () => {
    setRegex(modeToggle.getAttribute('aria-pressed') !== 'true')
    onQuery()
  })
  builderToggle.addEventListener('click', () => openBuilder(builder.hidden))
  clearButton.addEventListener('click', () => {
    input.value = ''
    onQuery()
    input.focus()
  })
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || builder.hidden) return
    event.stopPropagation()
    openBuilder(false)
    builderToggle.focus()
  })
  document.addEventListener('pointerdown', (event) => {
    if (builder.hidden) return
    const target = event.target
    if (target instanceof Node && element.contains(target)) return
    openBuilder(false)
  })

  retranslators.push(() => {
    modeToggle.textContent = t(regexOn ? 'search.mode.regex' : 'search.mode.plain')
    builderToggle.textContent = t(builder.hidden ? 'search.builder.open' : 'search.builder.close')
    refreshBuilder()
  })

  builderToggle.textContent = t('search.builder.open')
  sample.value = corpus().slice(0, MAX_SAMPLE)
  refreshBuilder()

  /**
   * The catalogue resolves a surface's field by this id. It is an attribute rather than a
   * call into `searchfield.ts` so the Settings tab does not fail to build when that lane's
   * registry is not there yet; `catalogue.ts` can find it with
   * `[data-sh-search-id="settings"]`.
   */
  element.dataset.shSearchId = SETTINGS_SEARCH_ID
  input.dataset.shSearchId = SETTINGS_SEARCH_ID

  return {
    element,
    focus: () => input.focus(),
    clear: () => {
      input.value = ''
    },
    value: () => input.value,
    useRegex: () => regexOn,
    flags: () => flags,
    setStatus: (text, isError) => {
      status.textContent = text
      element.dataset.shInvalid = String(isError)
      status.className = isError ? 'sh-error' : 'sh-searchfield__count'
    },
  }
}

function copyText(text: string): void {
  const clipboard = (navigator as unknown as { clipboard?: { writeText?: AnyFn } }).clipboard
  if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
  try {
    const result = clipboard.writeText(text)
    if (result instanceof Promise) void result.catch(() => undefined)
  } catch {
    // A refused clipboard is not worth a failure notification.
  }
}

// ---------------------------------------------------------------------------
// the section strip
// ---------------------------------------------------------------------------

function sectionLabelKey(id: SettingsSectionId): string {
  return `settings.section.${id}`
}

function sectionNoteKey(id: SettingsSectionId): string {
  return `settings.section.${id}.desc`
}

interface SectionStrip {
  /** The bar plus its panels, ready to place in the panel body. */
  element: HTMLElement
  /** The element holding the section panels; hidden while a search is running. */
  panelHost: HTMLElement
  bodyFor(id: SettingsSectionId): HTMLElement
  select(id: SettingsSectionId): void
  activeId(): SettingsSectionId
  focusStrip(): void
  /** Re-opens any section tab a reset or an import removed. */
  ensure(): void
  destroy(): void
}

const SECTION_STRIP_ID = 'settings-sections'

/**
 * The section strip is the app's own tab component, per the contract. If that component
 * cannot produce a `tablist` for these sections — a missing model, a refused open — the
 * local strip below takes over, so the panel is never a bar with nothing in it.
 */
function sharedStrip(onSelect: (id: SettingsSectionId) => void): SectionStrip | null {
  try {
    const strip = createTabStrip({ stripId: SECTION_STRIP_ID })
    const model = strip.model
    const bodies = new Map<SettingsSectionId, HTMLElement>()
    let guard = false

    const ensure = (): void => {
      if (guard) return
      guard = true
      try {
        for (const id of SECTION_IDS) {
          if (model.tab(id) !== undefined) continue
          model.open(
            { id, titleKey: sectionLabelKey(id), closable: false, pinned: false },
            { activate: false },
          )
        }
        if (!isSectionId(model.activeId())) model.activate('language')
        for (const id of SECTION_IDS) {
          const body = bodies.get(id)
          if (body === undefined || body.isConnected) continue
          try {
            strip.setPanelContent(id, body)
          } catch {
            // The panel is not there yet; the next change puts the content back.
          }
        }
      } finally {
        guard = false
      }
    }

    for (const id of SECTION_IDS) {
      const body = el('div', 'sh-settings__group')
      bodies.set(id, body)
    }
    ensure()
    for (const id of SECTION_IDS) {
      const body = bodies.get(id)
      if (body !== undefined) strip.setPanelContent(id, body)
    }

    if (strip.element.querySelectorAll('[role="tab"]').length < SECTION_IDS.length) {
      strip.destroy()
      return null
    }

    const stop = model.subscribe(() => {
      if (guard) return
      const id = model.activeId()
      if (isSectionId(id)) onSelect(id)
      ensure()
    })

    return {
      element: strip.element,
      panelHost: strip.panels,
      bodyFor: (id) => bodies.get(id) ?? el('div'),
      select: (id) => {
        model.activate(id)
      },
      activeId: () => {
        const id = model.activeId()
        return isSectionId(id) ? id : 'language'
      },
      focusStrip: () => strip.focusStrip(),
      ensure,
      destroy: () => {
        stop()
        strip.destroy()
      },
    }
  } catch {
    return null
  }
}

function isSectionId(value: string | null): value is SettingsSectionId {
  return value !== null && (SECTION_IDS as readonly string[]).includes(value)
}

function localStrip(onSelect: (id: SettingsSectionId) => void): SectionStrip {
  const element = el('div', 'sh-tabstrip sh-stack')
  const bar = el('div', 'sh-tablist', element)
  bar.setAttribute('role', 'tablist')
  tAttr(bar, 'aria-label', 'settings.title')
  const panelHost = el('div', '', element)

  const tabs = new Map<SettingsSectionId, HTMLButtonElement>()
  const panels = new Map<SettingsSectionId, HTMLElement>()
  const bodies = new Map<SettingsSectionId, HTMLElement>()
  let active: SettingsSectionId = 'language'

  const focusAt = (index: number): void => {
    const list = SECTION_IDS.map((id) => tabs.get(id))
    const wrapped = ((index % list.length) + list.length) % list.length
    list[wrapped]?.focus()
  }

  SECTION_IDS.forEach((id, index) => {
    const tab = el('button', 'sh-tab', bar)
    tab.type = 'button'
    tab.id = uid(`tab-${id}`)
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', 'false')
    tab.tabIndex = -1
    const caption = el('span', 'sh-tab__label', tab)
    tText(caption, sectionLabelKey(id))
    tab.addEventListener('click', () => {
      select(id)
      onSelect(id)
    })
    tab.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault()
          focusAt(index + 1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault()
          focusAt(index - 1)
          break
        case 'Home':
          event.preventDefault()
          focusAt(0)
          break
        case 'End':
          event.preventDefault()
          focusAt(SECTION_IDS.length - 1)
          break
        default:
          break
      }
    })
    tabs.set(id, tab)

    const panel = el('div', 'sh-tabpanel', panelHost)
    panel.id = uid(`panel-${id}`)
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tab.id)
    panel.tabIndex = 0
    panel.hidden = true
    tab.setAttribute('aria-controls', panel.id)
    const body = el('div', 'sh-settings__group', panel)
    panels.set(id, panel)
    bodies.set(id, body)
  })

  function select(id: SettingsSectionId): void {
    active = id
    for (const [candidate, tab] of tabs) {
      const selected = candidate === id
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
    }
    for (const [candidate, panel] of panels) panel.hidden = candidate !== id
  }

  select('language')

  return {
    element,
    panelHost,
    bodyFor: (id) => bodies.get(id) ?? el('div'),
    select,
    activeId: () => active,
    focusStrip: () => tabs.get(active)?.focus(),
    ensure: () => undefined,
    destroy: () => element.remove(),
  }
}

// ---------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------

interface BuildContext {
  rows: Row[]
  bodyFor(id: SettingsSectionId): HTMLElement
  root: HTMLElement
  refresh(): void
}

let activePanel: SettingsPanel | null = null

export function createSettingsPanel(options: SettingsPanelOptions = {}): SettingsPanel {
  applyPersistedSettings()

  const root = el('section', 'sh-settings')
  root.dataset.shElement = SETTINGS_ELEMENT_ID

  const head = el('div', 'sh-settings__head', root)
  const titleBox = el('div', 'sh-settings__title', head)
  const heading = el('h2', 'sh-title-caps', titleBox)
  heading.id = uid('settings-heading')
  tText(heading, 'settings.title')
  root.setAttribute('aria-labelledby', heading.id)
  const subtitle = el('p', 'sh-hint', titleBox)
  tText(subtitle, 'settings.desc')

  const rows: Row[] = []
  const corpus = (): string => rows.map((row) => row.searchText()).join('\n')
  const bar = createSearchBar(() => applyFilter(), corpus)
  head.appendChild(bar.element)

  const body = el('div', 'sh-settings__body', root)
  const strip = sharedStrip((id) => onSectionChosen(id)) ?? localStrip((id) => onSectionChosen(id))
  body.appendChild(strip.element)

  const results = el('div', 'sh-stack', body)
  results.hidden = true
  const resultGroups = new Map<SettingsSectionId, { group: HTMLElement; body: HTMLElement }>()

  for (const id of SECTION_IDS) {
    const note = el('p', 'sh-hint')
    tText(note, sectionNoteKey(id))
    const host = strip.bodyFor(id)
    if (note.textContent !== null && note.textContent.length > 0) host.appendChild(note)
  }

  const context: BuildContext = {
    rows,
    bodyFor: (id) => strip.bodyFor(id),
    root,
    refresh: () => {
      strip.ensure()
      for (const row of rows) row.sync()
      applyFilter()
    },
  }

  buildLanguageSection(context)
  buildAppearanceSection(context)
  buildMotionSection(context)
  buildScaleSection(context)
  buildAudioSection(context)
  buildGameSection(context)
  buildDataSection(context)
  buildAboutSection(context)

  function onSectionChosen(id: SettingsSectionId): void {
    if (bar.value().trim().length === 0) return
    const group = resultGroups.get(id)
    if (group === undefined || group.group.hidden) return
    group.group.scrollIntoView({ block: 'nearest', behavior: scrollBehaviour() })
  }

  function scrollBehaviour(): ScrollBehavior {
    return motionIsReduced() ? 'auto' : 'smooth'
  }

  function resultGroupFor(id: SettingsSectionId): { group: HTMLElement; body: HTMLElement } {
    const existing = resultGroups.get(id)
    if (existing !== undefined) return existing
    const group = el('div', 'sh-panel sh-stack', results)
    const header = el('div', 'sh-row sh-row--between', group)
    const title = el('h3', 'sh-panel__title', header)
    title.id = uid(`result-${id}`)
    title.tabIndex = -1
    tText(title, sectionLabelKey(id))
    const count = el('span', 'sh-badge', header)
    group.setAttribute('aria-labelledby', title.id)
    const groupBody = el('div', 'sh-settings__group', group)
    const made = { group, body: groupBody }
    resultGroups.set(id, made)
    countBadges.set(id, count)
    return made
  }

  const countBadges = new Map<SettingsSectionId, HTMLElement>()
  let lastSpokenSummary = ''

  function applyFilter(): void {
    const query = bar.value().trim()
    const focused = document.activeElement

    if (query.length === 0) {
      results.hidden = true
      strip.panelHost.hidden = false
      for (const [, entry] of resultGroups) entry.group.hidden = true
      for (const row of rows) {
        row.element.hidden = false
        const home = strip.bodyFor(row.section)
        if (row.element.parentElement !== home) home.appendChild(row.element)
      }
      bar.setStatus(t('settings.search.count', { count: rows.length }), false)
      lastSpokenSummary = ''
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus()
      return
    }

    const source = bar.useRegex() ? query : plainToPattern(query)
    const compiled = compile(source, bar.flags())
    if (!compiled.ok) {
      bar.setStatus(
        compiled.index === undefined
          ? t('regex.error', { error: compiled.error })
          : t('regex.error.at', { index: compiled.index, error: compiled.error }),
        true,
      )
      return
    }
    const re = compiled.re

    let total = 0
    const counts = new Map<SettingsSectionId, number>()
    for (const row of rows) {
      re.lastIndex = 0
      const hit = re.test(row.searchText())
      row.element.hidden = !hit
      if (hit) {
        total += 1
        counts.set(row.section, (counts.get(row.section) ?? 0) + 1)
        resultGroupFor(row.section).body.appendChild(row.element)
      } else {
        const home = strip.bodyFor(row.section)
        if (row.element.parentElement !== home) home.appendChild(row.element)
      }
    }

    strip.panelHost.hidden = true
    results.hidden = false
    for (const id of SECTION_IDS) {
      const count = counts.get(id) ?? 0
      const group = resultGroups.get(id)
      if (group !== undefined) group.group.hidden = count === 0
      const badge = countBadges.get(id)
      if (badge !== undefined) badge.textContent = t('common.count', { count })
    }

    const summary =
      total === 0
        ? t('settings.search.empty', { query })
        : t('settings.search.count', { count: total })
    bar.setStatus(summary, false)
    // A store change re-runs the filter; only a genuinely new result is worth speaking.
    if (summary !== lastSpokenSummary) {
      lastSpokenSummary = summary
      announceShell(summary, false)
    }
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus()
  }

  function open(section?: SettingsSectionId, rowId?: string): void {
    try {
      options.activate?.()
    } catch {
      // A strip that refuses to switch still leaves the panel usable in place.
    }
    const row = rowId === undefined ? undefined : rows.find((entry) => entry.id === rowId)
    if (row !== undefined && row.element.hidden) {
      bar.clear()
      applyFilter()
    }
    const target = section ?? row?.section
    if (target !== undefined) strip.select(target)
    if (row === undefined) {
      strip.focusStrip()
      return
    }
    row.element.scrollIntoView({ block: 'center', behavior: scrollBehaviour() })
    row.element.dataset.shTeleport = 'true'
    window.setTimeout(() => {
      row.element.removeAttribute('data-sh-teleport')
    }, 2000)
    row.focusTarget?.focus()
  }

  const disposers: Array<() => void> = []
  /**
   * A stable id, not a rendered label: the palette looks a group's words up through
   * `registerGroupLabel`, so this heading follows a language change instead of freezing
   * whichever language the Settings tab happened to be built in.
   */
  const paletteGroup = 'settings'
  disposers.push(registerGroupLabel(paletteGroup, key('palette.group.settings'), 20))
  for (const row of rows) {
    disposers.push(
      registerTarget({
        id: `settings.${row.id}`,
        titleKey: key(row.labelKey),
        group: paletteGroup,
        teleport: () => open(row.section, row.id),
      }),
    )
  }
  for (const id of SECTION_IDS) {
    disposers.push(
      registerTarget({
        id: `settings.section.${id}`,
        titleKey: key(sectionLabelKey(id)),
        group: paletteGroup,
        teleport: () => {
          try {
            options.activate?.()
          } catch {
            // As above.
          }
          bar.clear()
          applyFilter()
          strip.select(id)
          strip.focusStrip()
        },
      }),
    )
  }
  disposers.push(
    registerCommand({
      id: 'settings.search',
      titleKey: key('search.settings.label'),
      group: paletteGroup,
      keywords: ['search', 'filter', 'regex', 'settings'],
      run: () => {
        try {
          options.activate?.()
        } catch {
          // As above.
        }
        bar.focus()
      },
    }),
  )

  attachEditor(root, SETTINGS_ELEMENT_ID, {
    labelKey: 'settings.title',
    group: paletteGroup,
    keywords: ['settings', 'panel'],
  })

  const stopLang = onLangChange(() => {
    if (sampling) return
    retranslateAll()
    context.refresh()
  })

  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) root.dataset.shNarrow = String(entry.contentRect.width < 560)
    })
    observer.observe(root)
  }

  applyFilter()

  const panel: SettingsPanel = {
    element: root,
    sections: SECTION_IDS,
    open,
    sync: () => context.refresh(),
    destroy: () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // A registry that has already forgotten this entry is fine.
        }
      }
      stopLang()
      observer?.disconnect()
      try {
        detachEditor(SETTINGS_ELEMENT_ID)
      } catch {
        // Already detached.
      }
      strip.destroy()
      root.remove()
      if (activePanel === panel) activePanel = null
    },
  }
  activePanel = panel
  return panel
}

/** Mounts the panel into a container and hands back its disposer. */
export function mountSettings(
  container: HTMLElement,
  options: SettingsPanelOptions = {},
): () => void {
  const panel = createSettingsPanel(options)
  container.appendChild(panel.element)
  return () => panel.destroy()
}

/** Opens a section, and a row inside it, from anywhere in the shell. */
export function openSettings(section?: SettingsSectionId, rowId?: string): void {
  activePanel?.open(section, rowId)
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

function addRow(
  ctx: BuildContext,
  section: SettingsSectionId,
  id: string,
  labelKey: string,
  descKey: string,
  params?: () => Params,
): RowHandle {
  const handle = makeRow(section, id, labelKey, descKey, ctx.rows, params)
  ctx.bodyFor(section).appendChild(handle.element)
  return handle
}

/** A real crop and its real price, so the funny-level sample proves facts never move. */
const SAMPLE_CROP = CROPS[0]

function buildLanguageSection(ctx: BuildContext): void {
  const mode = addRow(
    ctx,
    'language',
    'language.mode',
    'settings.lang.mode.label',
    'settings.lang.mode.desc',
  )
  radioControl(
    mode,
    LANGS.map((lang) => ({
      value: lang,
      labelKey: langOptionKey(lang),
      descKey: langOptionDescKey(lang),
    })),
    () => settings().language,
    (value) => {
      const lang = LANGS.find((candidate) => candidate === value) ?? 'en'
      patch({ language: lang })
      try {
        setLang(lang)
      } catch {
        // i18n keeps its last good language; the store still holds the choice.
      }
      logSetting('settings.lang.changed', { lang })
      retranslateAll()
      ctx.refresh()
      toast('success', 'settings.lang.changed', { lang })
    },
  )

  for (const lang of ['en', 'yue'] as const) {
    const row = addRow(
      ctx,
      'language',
      `language.funny.${lang}`,
      `settings.lang.funny.${lang}.label`,
      `settings.lang.funny.${lang}.desc`,
    )
    const preview = el('div', 'sh-field', row.element)
    const previewLabel = el('span', 'sh-hint', preview)
    tText(previewLabel, 'settings.lang.preview.label')
    const sample = el('p', 'sh-settings__sample', preview)

    const paintSample = (): void => {
      sample.textContent = sampleIn(lang, 'settings.lang.disclosure.example', {
        crop: SAMPLE_CROP.name,
        price: produceValue(SAMPLE_CROP, 'normal'),
      })
    }
    retranslators.push(paintSample)

    sliderControl(
      row,
      { min: 1, max: 5, step: 1 },
      () => settings().funny[lang],
      (value) => {
        const level = (FUNNY_LEVELS.find((candidate) => candidate === value) ?? 1) as FunnyLevel
        patch({ funny: { [lang]: level } })
        try {
          setFunny({ [lang]: level })
        } catch {
          // As above.
        }
        retranslateAll()
        paintSample()
        logSetting('settings.lang.funny.changed', { level, name: t(funnyLevelKey(level)) })
      },
      (value) => {
        const level = (FUNNY_LEVELS.find((candidate) => candidate === value) ?? 1) as FunnyLevel
        return t(funnyLevelKey(level))
      },
    )
    paintSample()
    row.onSync(paintSample)
    row.addTerms(`funny ${lang}`)
  }

  const disclosure = addRow(
    ctx,
    'language',
    'language.disclosure',
    'settings.lang.disclosure',
    'settings.lang.disclosure.example',
    () => ({
      min: 1,
      max: 5,
      crop: SAMPLE_CROP.name,
      price: produceValue(SAMPLE_CROP, 'normal'),
    }),
  )
  const body = el('p', 'sh-settings__sample', disclosure.control)
  tText(body, 'settings.lang.disclosure', () => ({ min: 1, max: 5 }))
  infoTarget(disclosure, body)
}

function buildAppearanceSection(ctx: BuildContext): void {
  for (const name of PALETTE_NAMES) {
    const row = addRow(
      ctx,
      'appearance',
      `appearance.colour.${name}`,
      `color.name.${name}`,
      `color.name.${name}.desc`,
    )
    const input = el('input', 'sh-input sh-settings__swatch', row.control)
    input.type = 'color'
    input.setAttribute('aria-labelledby', row.labelId)
    const readout = el('span', 'sh-num', row.control)

    const paint = (): void => {
      const value = themeColour(name) ?? PAL[name]
      input.value = value
      readout.textContent = value
    }
    input.addEventListener('input', () => {
      setAppearance(themeElementId(name), 'color', input.value)
      applyRootTokens({ overrides: themeOverrides() })
      readout.textContent = input.value
    })
    buttonControl(row.control, 'common.reset', () => {
      setAppearance(themeElementId(name), 'color', null)
      applyRootTokens({ overrides: themeOverrides() })
      paint()
      toast('info', 'appearance.reset.done', { element: t(`color.name.${name}`) })
    })
    paint()
    row.onSync(paint)
    row.setFocus(input)
    row.addTerms(`palette theme ${PAL[name]} ${name}`)
  }

  const editor = addRow(
    ctx,
    'appearance',
    'appearance.editor',
    'appearance.open',
    'appearance.editor.hint',
    () => ({ chord: APPEARANCE_CHORD }),
  )
  const editorButton = buttonControl(editor.control, 'appearance.open', () => {
    if (openAppearanceEditor(SETTINGS_ELEMENT_ID)) return
    toast('info', 'appearance.editor.hint', { chord: APPEARANCE_CHORD })
  })
  editor.setFocus(editorButton)
  editor.addTerms('appearance editor element')

  const reset = addRow(
    ctx,
    'appearance',
    'appearance.resetAll',
    'appearance.resetAll',
    'appearance.resetAll.confirm.body',
    () => ({ count: Object.keys(get().appearance).length }),
  )
  const resetButton = buttonControl(
    reset.control,
    'common.reset',
    () => {
      void (async () => {
        const count = Object.keys(get().appearance).length
        const ok = await askConfirm({
          titleKey: 'appearance.resetAll',
          bodyKey: 'appearance.resetAll.confirm.body',
          params: { count },
          confirmKey: 'common.reset',
        })
        if (!ok) return
        resetAllAppearance()
        applyRootTokens({ overrides: {} })
        logSetting('appearance.resetAll', { count })
        ctx.refresh()
        toast('success', 'appearance.resetAll', { count })
      })()
    },
    true,
  )
  reset.setFocus(resetButton)
}

function buildMotionSection(ctx: BuildContext): void {
  const motion = addRow(
    ctx,
    'motion',
    'motion.mode',
    'settings.motion.label',
    'settings.motion.desc',
  )
  radioControl(
    motion,
    MOTION_MODES.map((value) => ({ value, labelKey: `settings.motion.option.${value}` })),
    () => settings().motion,
    (value) => {
      const mode = (MOTION_MODES.find((candidate) => candidate === value) ?? 'system') as MotionMode
      patch({ motion: mode })
      applyRootTokens({ motion: mode })
      logSetting('settings.motion.label', { mode })
    },
  )
  const note = el('p', 'sh-hint', motion.element)
  tText(note, 'settings.motion.reduced.note')

  const announce = addRow(
    ctx,
    'motion',
    'motion.announce',
    'settings.motion.announce.label',
    'settings.motion.announce.desc',
  )
  switchControl(
    announce,
    () => gameOptions().announceActions,
    (value) => {
      patchGame({ announceActions: value })
      applyAnnounce()
      logSetting('settings.motion.announce.label', { on: value ? 1 : 0 })
    },
  )
  announce.addTerms('verbosity announcements screen reader live region')
}

function buildScaleSection(ctx: BuildContext): void {
  const row = addRow(
    ctx,
    'scale',
    'scale.level',
    'settings.scale.label',
    'settings.scale.desc',
    () => ({
      min: DISPLAY_SCALES[0],
      max: DISPLAY_SCALES[DISPLAY_SCALES.length - 1],
      width: 640,
    }),
  )
  radioControl(
    row,
    DISPLAY_SCALES.map((percent) => ({
      value: String(percent),
      labelKey: 'settings.scale.option',
      params: { percent },
    })),
    () => String(settings().displayScale),
    (value) => {
      const scale = (DISPLAY_SCALES.find((candidate) => String(candidate) === value) ??
        100) as DisplayScale
      patch({ displayScale: scale })
      applyRootTokens({ scale })
      logSetting('settings.scale.label', { percent: scale })
    },
  )
}

function buildAudioSection(ctx: BuildContext): void {
  const mute = addRow(
    ctx,
    'audio',
    'audio.mute',
    'settings.audio.mute.label',
    'settings.audio.mute.desc',
  )
  switchControl(
    mute,
    () => settings().audio.muted,
    (value) => {
      patch({ audio: { muted: value } })
      applyAudio()
      logSetting('settings.audio.mute.label', { muted: value ? 1 : 0 })
    },
  )

  const volume = addRow(
    ctx,
    'audio',
    'audio.volume',
    'settings.audio.volume.label',
    'settings.audio.volume.desc',
  )
  const slider = sliderControl(
    volume,
    { min: 0, max: 100, step: 5 },
    () => Math.round(settings().audio.volume * 100),
    (value) => {
      patch({ audio: { volume: Math.min(1, Math.max(0, value / 100)) } })
      applyAudio()
    },
    (value) => t('settings.scale.option', { percent: value }),
  )
  slider.addEventListener('change', () => {
    if (settings().audio.muted || settings().audio.volume === 0) return
    try {
      unlockAudio()
      playSound('select')
    } catch {
      // No WebAudio here; the level is still recorded.
    }
  })
  volume.addTerms('volume loudness gain')

  const test = addRow(ctx, 'audio', 'audio.test', 'settings.audio.test', 'settings.audio.test.desc')
  const testButton = buttonControl(test.control, 'settings.audio.test', () => {
    try {
      unlockAudio()
      playSound('newday')
    } catch {
      // As above.
    }
  })
  test.setFocus(testButton)
}

/** The farm save, read through `src/renderer/bridge.ts`, for the seed row and exports. */
let farmSave: GameState | null = null

function refreshFarmSave(): void {
  void loadSave()
    .then((state) => {
      farmSave = state
      retranslateAll()
      activePanel?.sync()
    })
    .catch(() => undefined)
}

const GAME_SWITCHES: ReadonlyArray<{
  id: string
  field: keyof GameOptions
}> = [
  { id: 'game.pauseWhenHidden', field: 'pauseWhenHidden' },
  { id: 'game.autosave', field: 'autosave' },
  { id: 'game.confirmDestructive', field: 'confirmDestructive' },
  { id: 'game.particles', field: 'particles' },
  { id: 'game.screenShake', field: 'screenShake' },
]

function buildGameSection(ctx: BuildContext): void {
  const seed = addRow(
    ctx,
    'game',
    'game.seed',
    'settings.game.seed.label',
    'settings.game.seed.desc',
    () => ({ seed: farmSave === null ? 0 : farmSave.seed }),
  )
  const seedValue = el('p', 'sh-fact', seed.control)
  const paintSeed = (): void => {
    seedValue.textContent =
      farmSave === null ? t('common.none') : t('common.count', { count: farmSave.seed })
  }
  retranslators.push(paintSeed)
  paintSeed()
  seed.onSync(paintSeed)
  buttonControl(seed.control, 'common.copy', () => {
    copyText(farmSave === null ? '' : String(farmSave.seed))
    toast('info', 'common.copied')
  })
  infoTarget(seed, seedValue)

  const newFarm = addRow(
    ctx,
    'game',
    'game.newFarm',
    'settings.game.newFarm',
    'settings.game.newFarm.desc',
  )
  const newFarmButton = buttonControl(
    newFarm.control,
    'settings.game.newFarm',
    () => {
      void (async () => {
        const days = farmSave === null ? 0 : farmSave.stats.daysPlayed
        const ok = await askConfirm({
          titleKey: 'settings.game.newFarm.confirm.title',
          bodyKey: 'settings.game.newFarm.confirm.body',
          params: { days },
          confirmKey: 'settings.game.newFarm',
        })
        if (!ok) return
        try {
          await clearSave()
        } catch {
          toast('failure', 'export.failed', { error: 'save' })
          return
        }
        farmSave = null
        logSetting('settings.game.newFarm', { days })
        ctx.refresh()
        toast('success', 'settings.game.newFarm', { days })
      })()
    },
    true,
  )
  newFarm.setFocus(newFarmButton)

  for (const entry of GAME_SWITCHES) {
    const row = addRow(
      ctx,
      'game',
      entry.id,
      `settings.${entry.id}.label`,
      `settings.${entry.id}.desc`,
    )
    switchControl(
      row,
      () => gameOptions()[entry.field] === true,
      (value) => {
        patchGame({ [entry.field]: value } as Partial<GameOptions>)
        logSetting(`settings.${entry.id}.label`, { on: value ? 1 : 0 })
      },
    )
  }

  const pixel = addRow(
    ctx,
    'game',
    'game.pixelScale',
    'settings.game.pixelScale.label',
    'settings.game.pixelScale.desc',
  )
  const pixelSelect = selectControl(
    pixel.control,
    pixel.labelId,
    pixel.descId,
    PIXEL_SCALES.map((value) =>
      value === 'auto'
        ? { value: 'auto', labelKey: 'common.default' }
        : { value: String(value), labelKey: 'common.count', params: { count: value } },
    ),
    () => String(gameOptions().pixelScale),
    (value) => {
      const scale: PixelScale =
        value === 'auto'
          ? 'auto'
          : ((PIXEL_SCALES.find((candidate) => String(candidate) === value) ??
              'auto') as PixelScale)
      patchGame({ pixelScale: scale })
      logSetting('settings.game.pixelScale.label', { scale: String(scale) })
    },
  )
  pixel.onSync(() => {
    pixelSelect.value = String(gameOptions().pixelScale)
  })
  pixel.setFocus(pixelSelect)

  refreshFarmSave()
}

function buildDataSection(ctx: BuildContext): void {
  let format: ExportFormat = 'json'
  let choice: ExportChoice = 'all'

  const exportRow = addRow(ctx, 'data', 'data.export', 'settings.data.export.label', 'export.title')
  const formatSelect = selectControl(
    exportRow.control,
    exportRow.labelId,
    exportRow.descId,
    EXPORT_FORMATS.map((value) => ({ value, labelKey: `export.format.${value}` })),
    () => format,
    (value) => {
      format = (EXPORT_FORMATS.find((candidate) => candidate === value) ?? 'json') as ExportFormat
      paintSize()
    },
  )
  const targetSelect = selectControl(
    exportRow.control,
    exportRow.labelId,
    exportRow.descId,
    EXPORT_CHOICES.map((value) => ({ value, labelKey: `export.target.${value}` })),
    () => choice,
    (value) => {
      choice = (EXPORT_CHOICES.find((candidate) => candidate === value) ?? 'all') as ExportChoice
      paintSize()
    },
  )
  const size = el('span', 'sh-num', exportRow.control)

  const buildTarget = (): Parameters<typeof exportAs>[1] => ({
    sections: choice === 'all' ? undefined : ([choice] as readonly ExportSection[]),
    save: farmSave,
    translate: (entry) => t(entry.summary, entry.params),
  })

  const render = (): string => {
    try {
      return exportAs(format, buildTarget())
    } catch {
      return ''
    }
  }

  const paintSize = (): void => {
    size.textContent = t('export.size', { bytes: render().length })
  }
  retranslators.push(paintSize)
  paintSize()
  exportRow.onSync(paintSize)

  buttonControl(exportRow.control, 'export.download', () => {
    const contents = render()
    if (contents.length === 0) {
      toast('failure', 'export.empty')
      return
    }
    const filename = suggestFilename(format, buildTarget())
    try {
      download(filename, contents, mimeFor(format))
    } catch (error) {
      toast('failure', 'export.failed', { error: String(error) })
      return
    }
    logSetting('export.done', { filename, bytes: contents.length })
    toast('success', 'export.done', { filename })
  })
  buttonControl(exportRow.control, 'export.copy', () => {
    const contents = render()
    copyText(contents)
    toast('info', 'common.copied')
  })
  exportRow.setFocus(formatSelect)
  exportRow.addTerms('export json csv markdown download backup')
  targetSelect.setAttribute('aria-describedby', exportRow.descId)

  const importRow = addRow(ctx, 'data', 'data.import', 'settings.data.import.label', 'import.title')
  const file = el('input', 'sh-input', importRow.control)
  file.type = 'file'
  file.accept = 'application/json,.json'
  file.id = uid('import')
  file.setAttribute('aria-labelledby', importRow.labelId)
  file.setAttribute('aria-describedby', importRow.descId)
  buttonControl(importRow.control, 'import.title', () => {
    void (async () => {
      const chosen = file.files === null ? null : file.files[0]
      if (chosen === null || chosen === undefined) {
        toast('failure', 'import.invalid', { error: t('common.none') })
        return
      }
      if (chosen.size > MAX_IMPORT_BYTES) {
        toast('failure', 'import.invalid', { error: String(chosen.size) })
        return
      }
      let text = ''
      try {
        text = await chosen.text()
      } catch (error) {
        toast('failure', 'import.invalid', { error: String(error) })
        return
      }
      const check = validateImport(text)
      if (!check.ok) {
        toast('failure', 'import.invalid', { error: check.error })
        return
      }
      const ok = await askConfirm({
        titleKey: 'import.confirm.title',
        bodyKey: 'import.confirm.body',
        params: { count: check.preview.sections.length },
        confirmKey: 'import.title',
      })
      if (!ok) return
      const result = await importJson(text)
      if (!result.ok) {
        toast('failure', 'import.invalid', { error: result.error })
        return
      }
      if (result.save !== undefined && isGameState(result.save)) {
        farmSave = result.save
        try {
          await saveGame(result.save)
        } catch {
          // The shell record landed; the farm save did not, and says so below.
        }
      }
      applyPersistedSettings()
      try {
        setLang(settings().language)
        setFunny(settings().funny)
      } catch {
        // i18n keeps what it had.
      }
      retranslateAll()
      ctx.refresh()
      logSetting('import.done', { count: result.applied.length })
      toast('success', 'import.done', { count: result.applied.length })
    })()
  })
  importRow.setFocus(file)
  importRow.addTerms('import restore json file')

  const historyRow = addRow(ctx, 'data', 'data.clearHistory', 'history.clear', 'history.desc')
  const historyButton = buttonControl(
    historyRow.control,
    'history.clear',
    () => {
      void (async () => {
        const count = get().history.length
        const ok = await askConfirm({
          titleKey: 'history.clear.confirm.title',
          bodyKey: 'history.clear.confirm.body',
          params: { count },
          confirmKey: 'history.clear',
        })
        if (!ok) return
        await clearHistory()
        ctx.refresh()
        toast('success', 'history.cleared', { count })
      })()
    },
    true,
  )
  historyRow.setFocus(historyButton)

  const resetRow = addRow(
    ctx,
    'data',
    'data.resetAll',
    'settings.data.reset.label',
    'settings.data.reset.desc',
  )
  const resetButton = buttonControl(
    resetRow.control,
    'settings.data.reset.label',
    () => {
      void (async () => {
        const ok = await askConfirm({
          titleKey: 'settings.data.reset.confirm.title',
          bodyKey: 'settings.data.reset.confirm.body',
          confirmKey: 'settings.data.reset.label',
        })
        if (!ok) return
        await resetAll()
        applyPersistedSettings()
        applyRootTokens({
          scale: settings().displayScale,
          motion: settings().motion,
          overrides: {},
        })
        try {
          setLang(settings().language)
          setFunny(settings().funny)
        } catch {
          // As above.
        }
        retranslateAll()
        ctx.refresh()
        toast('success', 'settings.data.reset.done')
      })()
    },
    true,
  )
  resetRow.setFocus(resetButton)
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false
  const record_ = value as Record<string, unknown>
  return Array.isArray(record_.tiles) && typeof record_.seed === 'number'
}

interface Manifest {
  version?: unknown
  author?: unknown
  license?: unknown
}

function manifest(): Manifest {
  try {
    return JSON.parse(packageManifest) as Manifest
  } catch {
    return {}
  }
}

function manifestString(field: keyof Manifest): string {
  const value = manifest()[field]
  return typeof value === 'string' ? value : ''
}

function buildAboutSection(ctx: BuildContext): void {
  const version = manifestString('version')
  const versionRow = addRow(
    ctx,
    'about',
    'about.version',
    'settings.about.version',
    'settings.about.version.desc',
    () => ({ version }),
  )
  const versionText = el('p', 'sh-fact', versionRow.control)
  tText(versionText, 'settings.about.version', () => ({ version }))
  const saveVersionText = el('p', 'sh-hint', versionRow.control)
  tText(saveVersionText, 'settings.about.saveVersion', () => ({ version: SAVE_VERSION }))
  buttonControl(versionRow.control, 'common.copy', () => {
    copyText(t('settings.about.version', { version }))
    toast('info', 'common.copied')
  })
  infoTarget(versionRow, versionText)
  versionRow.addTerms(`${version} ${SAVE_VERSION}`)

  const authorRow = addRow(
    ctx,
    'about',
    'about.author',
    'settings.about.author',
    'settings.about.author.desc',
    () => ({ author: manifestString('author') }),
  )
  const authorText = el('p', 'sh-fact', authorRow.control)
  tText(authorText, 'settings.about.author', () => ({ author: manifestString('author') }))
  infoTarget(authorRow, authorText)

  const offlineRow = addRow(
    ctx,
    'about',
    'about.offline',
    'settings.about.offline',
    'settings.about.offline.desc',
  )
  const offlineText = el('p', 'sh-settings__sample', offlineRow.control)
  tText(offlineText, 'settings.about.offline')
  infoTarget(offlineRow, offlineText)
  offlineRow.addTerms('offline network privacy')

  const licence = manifestString('license')
  const licenceRow = addRow(
    ctx,
    'about',
    'about.licence',
    'settings.about.licence',
    'settings.about.licence.desc',
    () => ({ licence }),
  )
  const licenceBody = el('pre', 'sh-settings__pre', licenceRow.control)
  licenceBody.tabIndex = 0
  licenceBody.setAttribute('role', 'group')
  licenceBody.setAttribute('aria-labelledby', licenceRow.labelId)
  const text = typeof licenceText === 'string' ? licenceText.trim() : ''
  if (text.length > 0) licenceBody.textContent = text
  else tText(licenceBody, 'settings.about.licence', () => ({ licence }))
  licenceRow.setFocus(licenceBody)
  licenceRow.addTerms('licence license MIT copyright')

  const a11yRow = addRow(
    ctx,
    'about',
    'about.accessibility',
    'almanac.section.accessibility',
    'almanac.section.accessibility.desc',
  )
  const statement = el('div', 'sh-settings__sample', a11yRow.control)
  statement.tabIndex = -1
  statement.setAttribute('role', 'group')
  statement.setAttribute('aria-labelledby', a11yRow.labelId)
  for (const part of ['keyboard', 'reader', 'focus', 'contrast', 'motion']) {
    const line = el('p', '', statement)
    tText(line, `almanac.accessibility.${part}`)
  }
  a11yRow.setFocus(statement)
  a11yRow.addTerms('accessibility statement keyboard screen reader contrast motion')
}
