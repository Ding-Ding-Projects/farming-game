/**
 * Per-element appearance editing.
 *
 * Any element in the shell can be handed to `attachEditor` with a stable id. From then on
 * it carries two routes to the same anchored editor:
 *
 * - **Right-click** opens its appearance menu at the pointer.
 * - **Ctrl+Shift+E** with focus on it — or anywhere inside it — opens the editor directly,
 *   and `Shift+F10` / the Menu key opens the same menu the mouse gets. A context menu on
 *   its own is not keyboard reachable, so it is never the only route. Each element also
 *   registers a command-palette `Command` and a `Target` that really teleports focus to it,
 *   which is the third route for anyone who cannot press the chord.
 *
 * The editor offers only the properties the element genuinely supports, each with a live
 * preview, a per-property reset and a reset for the whole element.
 *
 * **The persisted shape is `store.ts`'s `AppearanceValue`, not one of this file's own.**
 * That store sanitises on the way in and merges patches field by field, so this file writes
 * exactly the fields it manages — `color`, `background`, `borderColor`, `borderWidthPx`,
 * `fontSizePct`, `paddingPx` — and leaves every other field of the record untouched. An
 * explicit `undefined` clears one field; `null` clears the whole element.
 *
 * Values are applied as CSS custom properties on the element itself, with the real
 * declaration reading `var(--sh-a-…)`, so a change lands on the pixel immediately, the
 * source of the value is visible in devtools, and clearing one returns the element to
 * whatever the stylesheet said with nothing left behind.
 *
 * Colour comes from `colorpicker.ts`; this file never invents one.
 */

import {
  CONTRAST_AA,
  SEARCH_FIELD_IDS,
  contrastRatio,
  createColorPicker,
  formatHex,
  meetsContrastAA,
  parseColor,
} from './colorpicker'
import {
  announce,
  el,
  ensureStyles,
  focusableWithin,
  nextId,
  openPopover,
  tok,
  tr,
} from './primitives'
import type { PopoverHandle } from './primitives'
import { createSearchField } from './searchfield'
import type { SearchField } from './searchfield'
import { PAL } from '../../engine/palette'
import { onLangChange } from '../core/i18n'
import { get as storeGet, save as storeSave, subscribe as storeSubscribe } from '../core/store'
import type { AppearanceMap, AppearanceValue } from '../core/store'
import { registerCommand, registerGroupLabel, registerTarget } from '../core/palette-registry'

/** Re-exported so a consumer of this editor never has to guess which type it means. */
export type { AppearanceMap, AppearanceValue }

/* ------------------------------------------------------------------ *
 * Public shape
 * ------------------------------------------------------------------ */

/** The fields of `AppearanceValue` this editor offers. */
export type AppearanceProperty = 'color' | 'background' | 'borderColor' | 'borderWidthPx' | 'fontSizePct' | 'paddingPx'

export interface EditorOpts {
  /**
   * String key naming this element for the editor title, the context menu and the command
   * palette. Without one the element id is shown instead, which is honest but terse.
   */
  readonly labelKey?: string
  /** The properties this element genuinely supports. Defaults to all of them. */
  readonly properties?: readonly AppearanceProperty[]
  /** Command-palette group. Defaults to `appearance`. */
  readonly group?: string
  /** Extra palette search keywords. The element id is always included. */
  readonly keywords?: readonly string[]
  /** Called after every change to this element, including resets. */
  onChange?(value: AppearanceValue): void
}

/** The documented keyboard route. Always passed to `t()` as a parameter, never as prose. */
export const APPEARANCE_CHORD = 'Ctrl+Shift+E'

/** Every property the editor can offer, in the order it presents them. */
export const APPEARANCE_PROPERTIES: readonly AppearanceProperty[] = [
  'color',
  'background',
  'borderColor',
  'borderWidthPx',
  'fontSizePct',
  'paddingPx',
]

/* ------------------------------------------------------------------ *
 * Property table
 * ------------------------------------------------------------------ */

interface PropSpec {
  readonly id: AppearanceProperty
  readonly kind: 'color' | 'number'
  /** The CSS property the custom property is fed into. */
  readonly css: string
  readonly cssVar: string
  readonly labelKey: string
  /** Numeric properties only. */
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
}

const SPECS: readonly PropSpec[] = [
  {
    id: 'color',
    kind: 'color',
    css: 'color',
    cssVar: '--sh-a-color',
    labelKey: 'appearance.field.color',
    min: 0,
    max: 0,
    step: 0,
    unit: '',
  },
  {
    id: 'background',
    kind: 'color',
    css: 'background-color',
    cssVar: '--sh-a-background',
    labelKey: 'appearance.field.background',
    min: 0,
    max: 0,
    step: 0,
    unit: '',
  },
  {
    id: 'borderColor',
    kind: 'color',
    css: 'border-color',
    cssVar: '--sh-a-border-color',
    labelKey: 'appearance.field.border',
    min: 0,
    max: 0,
    step: 0,
    unit: '',
  },
  {
    id: 'borderWidthPx',
    kind: 'number',
    css: 'border-width',
    cssVar: '--sh-a-border-width',
    labelKey: 'appearance.field.borderWidth',
    min: 0,
    max: 8,
    step: 1,
    unit: 'px',
  },
  {
    // Percent of the inherited size, exactly as the store defines it, so the element still
    // scales with the display-scale ladder instead of being pinned to an absolute size.
    id: 'fontSizePct',
    kind: 'number',
    css: 'font-size',
    cssVar: '--sh-a-font-size',
    labelKey: 'appearance.field.size',
    min: 50,
    max: 300,
    step: 5,
    unit: '%',
  },
  {
    id: 'paddingPx',
    kind: 'number',
    css: 'padding',
    cssVar: '--sh-a-padding',
    labelKey: 'appearance.field.spacing',
    min: 0,
    max: 48,
    step: 1,
    unit: 'px',
  },
]

function specFor(id: AppearanceProperty): PropSpec {
  const found = SPECS.find((s) => s.id === id)
  // SPECS covers the union exhaustively; the fallback only keeps the function total.
  return found ?? SPECS[0]
}

function isProperty(key: string): key is AppearanceProperty {
  return SPECS.some((s) => s.id === key)
}

/** The CSS a stored value becomes. Returns null when the stored value is unusable. */
function cssFor(spec: PropSpec, raw: string | number | boolean | undefined): string | null {
  if (spec.kind === 'color') {
    return typeof raw === 'string' && parseColor(raw) !== null ? raw : null
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return `${clampStep(spec, raw)}${spec.unit}`
}

function clampStep(spec: PropSpec, n: number): number {
  const stepped = spec.step > 0 ? Math.round(n / spec.step) * spec.step : Math.round(n)
  return Math.min(spec.max, Math.max(spec.min, stepped))
}

/* ------------------------------------------------------------------ *
 * Cross-lane seams
 * ------------------------------------------------------------------ */

interface LooseCommand {
  id: string
  titleKey: string
  group: string
  keywords?: string[]
  run(): void
}

interface LooseTarget {
  id: string
  titleKey: string
  group: string
  teleport(): void
}

/**
 * `Command.titleKey` and `Target.titleKey` are typed against the i18n lane's key union.
 * The registrations go through a widened signature so an element can register a label key
 * this file cannot know about — the caller's `labelKey` — rather than being restricted to
 * the handful of keys this file happens to name.
 */
const addCommand = registerCommand as unknown as (c: LooseCommand) => unknown
const addTarget = registerTarget as unknown as (t: LooseTarget) => unknown
const addGroupLabel = registerGroupLabel as unknown as (
  group: string,
  titleKey: string,
  order?: number,
) => unknown

/** Registers and normalises the disposer, tolerating a registry that returns nothing. */
function register<T>(fn: (entry: T) => unknown, entry: T): (() => void) | null {
  try {
    const off = fn(entry)
    return typeof off === 'function' ? (off as () => void) : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

let map: Record<string, AppearanceValue> = {}
let loaded = false
let saveTimer = 0
const touched = new Set<string>()

function readStore(): Record<string, AppearanceValue> {
  const out: Record<string, AppearanceValue> = {}
  try {
    const persisted = storeGet()
    const raw: unknown = persisted ? (persisted as { appearance?: unknown }).appearance : undefined
    if (typeof raw !== 'object' || raw === null) return out
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (id.length === 0 || typeof value !== 'object' || value === null) continue
      // The store hands back frozen records; copy before this file holds on to one.
      out[id] = { ...(value as AppearanceValue) }
    }
  } catch {
    return out
  }
  return out
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  map = readStore()
  try {
    storeSubscribe(() => {
      // Skip the echo of this file's own write; adopt anything else — an import, a reset
      // performed in Settings, a second window — and repaint from it.
      const next = readStore()
      if (JSON.stringify(next) === JSON.stringify(map)) return
      map = next
      applyAll()
      for (const id of Object.keys(attached)) notify(id)
    })
  } catch {
    // A store that cannot be subscribed to still serves reads: appearance simply will not
    // follow a change made elsewhere until the next reload.
  }
  try {
    onLangChange(() => {
      // These surfaces are transient and their labels are baked at build time, so the
      // honest response to a language change is to close them rather than show stale text.
      closeOpenSurfaces()
    })
  } catch {
    // No language notifications: the editor still renders in the language it opened with.
  }
}

/**
 * Writes the fields this file manages for every element it has touched. Fields it does not
 * manage are omitted so the store's per-field merge leaves them alone; an element with
 * nothing left at all is sent as `null` so the record does not accumulate empty entries.
 */
function flush(): void {
  if (touched.size === 0) return
  const patch: Record<string, AppearanceValue | null> = {}
  for (const id of touched) {
    const value = map[id]
    if (!value || Object.keys(value).length === 0) {
      patch[id] = null
      continue
    }
    patch[id] = {
      color: value.color,
      background: value.background,
      borderColor: value.borderColor,
      borderWidthPx: value.borderWidthPx,
      fontSizePct: value.fontSizePct,
      paddingPx: value.paddingPx,
    }
  }
  touched.clear()
  try {
    void Promise.resolve(storeSave({ appearance: patch })).catch(() => undefined)
  } catch {
    // Persistence is best effort; the live styles are already applied.
  }
}

function persist(elementId: string): void {
  touched.add(elementId)
  if (typeof window === 'undefined') {
    flush()
    return
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flush, 150)
}

/* ------------------------------------------------------------------ *
 * Attachment registry
 * ------------------------------------------------------------------ */

interface Attached {
  readonly el: HTMLElement
  readonly opts: EditorOpts
  readonly teardown: () => void
}

const attached: Record<string, Attached[]> = {}
const paletteDisposers: Record<string, Array<() => void>> = {}
const listeners = new Set<(elementId: string, value: AppearanceValue) => void>()

function entriesFor(elementId: string): Attached[] {
  return attached[elementId] ?? []
}

/**
 * The element to act on. A connected one wins; an element that has been built but not
 * inserted yet is still valid, so "not in the document" never means "not attached".
 */
function anyFor(elementId: string): Attached | null {
  const list = entriesFor(elementId)
  const connected = list.find((a) => a.el.isConnected)
  if (connected) return connected
  return list.length > 0 ? list[list.length - 1] : null
}

function notify(elementId: string): void {
  const value = appearanceFor(elementId)
  for (const a of entriesFor(elementId)) {
    if (a.opts.onChange) a.opts.onChange(value)
  }
  for (const fn of listeners) fn(elementId, value)
}

/** Subscribe to every appearance change, whatever caused it. */
export function onAppearanceChange(fn: (elementId: string, value: AppearanceValue) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

function applyTo(element: HTMLElement, value: AppearanceValue): void {
  for (const spec of SPECS) {
    const css = cssFor(spec, value[spec.id])
    if (css === null) {
      element.style.removeProperty(spec.cssVar)
      element.style.removeProperty(spec.css)
    } else {
      element.style.setProperty(spec.cssVar, css)
      // The declaration consumes the custom property, so the token is the single source of
      // the applied value and an inspection shows where the value came from.
      element.style.setProperty(spec.css, `var(${spec.cssVar})`)
    }
  }
  const hasBorder = value.borderColor !== undefined || value.borderWidthPx !== undefined
  if (hasBorder) {
    element.style.setProperty('border-style', 'solid')
    // A colour without a width would otherwise inherit the CSS initial `medium` and shove
    // the layout around; a width without a colour falls back to `currentColor`.
    element.style.setProperty('border-width', 'var(--sh-a-border-width, 1px)')
    element.style.setProperty('box-sizing', 'border-box')
  } else {
    element.style.removeProperty('border-style')
    element.style.removeProperty('box-sizing')
  }
}

function applyId(elementId: string): void {
  const value = appearanceFor(elementId)
  for (const a of entriesFor(elementId)) applyTo(a.el, value)
}

function applyAll(): void {
  for (const id of Object.keys(attached)) applyId(id)
}

/* ------------------------------------------------------------------ *
 * Contract exports
 * ------------------------------------------------------------------ */

/** The stored overrides for an element. Always an object, never null. */
export function appearanceFor(elementId: string): AppearanceValue {
  ensureLoaded()
  const entry = map[elementId]
  return entry ? { ...entry } : {}
}

/**
 * Sets or clears one property, applies it live and schedules the save. A value outside the
 * property's range, or a colour that is not a colour, is refused rather than stored.
 */
export function setAppearance(elementId: string, property: AppearanceProperty, value: string | number | null): void {
  ensureLoaded()
  const spec = specFor(property)
  const entry: Record<string, unknown> = { ...(map[elementId] ?? {}) }

  if (value === null) {
    delete entry[property]
  } else if (spec.kind === 'color') {
    if (typeof value !== 'string' || parseColor(value) === null) return
    entry[property] = value
  } else {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return
    entry[property] = clampStep(spec, n)
  }

  if (Object.keys(entry).length > 0) map[elementId] = entry as AppearanceValue
  else delete map[elementId]

  applyId(elementId)
  persist(elementId)
  notify(elementId)
}

/** Drops every override for one element and returns it to the stylesheet. */
export function resetAppearance(elementId: string): void {
  ensureLoaded()
  if (map[elementId]) delete map[elementId]
  applyId(elementId)
  persist(elementId)
  notify(elementId)
  announce(tr('appearance.reset.done', { element: nameOf(elementId) }))
}

/** Drops every override for every element. */
export function resetAllAppearance(): void {
  ensureLoaded()
  const count = Object.keys(map).length
  for (const id of Object.keys(map)) touched.add(id)
  map = {}
  applyAll()
  if (touched.size > 0) persist('')
  touched.delete('')
  for (const id of Object.keys(attached)) notify(id)
  announce(tr('appearance.resetAll.done', { count }))
}

function nameOf(elementId: string): string {
  const entry = anyFor(elementId)
  const key = entry?.opts.labelKey
  return key ? tr(key) : elementId
}

/**
 * Gives an element its appearance affordances. Safe to call again for the same id — a
 * re-rendered element replaces the previous one and inherits its stored value.
 */
export function attachEditor(element: HTMLElement, elementId: string, opts: EditorOpts): void {
  ensureLoaded()
  ensureStyles('sh-appearance-ui-styles', APPEARANCE_CSS)

  // Re-attaching after a re-render replaces the old entry, and sweeps any element that has
  // since left the document, so a tab that opens and closes repeatedly cannot leak.
  for (const a of entriesFor(elementId)) {
    if (a.el === element) a.teardown()
  }
  attached[elementId] = entriesFor(elementId).filter((a) => a.el !== element && a.el.isConnected)

  element.dataset.shAppearance = elementId
  if (!element.hasAttribute('tabindex') && element.tabIndex < 0) element.tabIndex = -1
  if (!element.hasAttribute('aria-keyshortcuts')) element.setAttribute('aria-keyshortcuts', 'Control+Shift+E')

  const onContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault()
    // The innermost registered element wins, exactly as a nested context menu should.
    ev.stopPropagation()
    openMenu(elementId, element, { x: ev.clientX, y: ev.clientY })
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.defaultPrevented) return
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'E' || ev.key === 'e')) {
      ev.preventDefault()
      ev.stopPropagation()
      openEditor(elementId, element)
      return
    }
    if (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) {
      ev.preventDefault()
      ev.stopPropagation()
      openMenu(elementId, element, null)
    }
  }

  element.addEventListener('contextmenu', onContextMenu)
  element.addEventListener('keydown', onKeyDown)

  attached[elementId] = [
    ...entriesFor(elementId),
    {
      el: element,
      opts,
      teardown: () => {
        element.removeEventListener('contextmenu', onContextMenu)
        element.removeEventListener('keydown', onKeyDown)
        delete element.dataset.shAppearance
      },
    },
  ]

  registerPaletteEntries(elementId)
  applyTo(element, appearanceFor(elementId))
}

/** Removes the affordances for an id. Stored values are kept, not deleted. */
export function detachEditor(elementId: string): void {
  for (const a of entriesFor(elementId)) a.teardown()
  delete attached[elementId]
  for (const off of paletteDisposers[elementId] ?? []) off()
  delete paletteDisposers[elementId]
}

/** Opens the editor from anywhere — the command palette route. */
export function openAppearanceEditor(elementId: string): boolean {
  const entry = anyFor(elementId)
  if (!entry) return false
  entry.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  openEditor(elementId, entry.el)
  return true
}

/* ------------------------------------------------------------------ *
 * Command palette
 * ------------------------------------------------------------------ */

/** The palette group every appearance entry lands in, unless its owner names another. */
const APPEARANCE_GROUP = 'appearance'

let globalsRegistered = false

function registerGlobals(): void {
  if (globalsRegistered) return
  globalsRegistered = true
  try {
    // Without this the palette has no words for the group and falls back to printing the
    // raw id, which is an identifier rather than language.
    addGroupLabel(APPEARANCE_GROUP, 'palette.group.appearance', 30)
  } catch {
    // A registry that will not take a label still groups the entries correctly.
  }
  register(addCommand, {
    id: 'appearance.resetAll',
    titleKey: 'appearance.resetAll',
    group: APPEARANCE_GROUP,
    keywords: ['appearance', 'reset', 'colour', 'color', 'theme'],
    run: () => resetAllAppearance(),
  })
}

function registerPaletteEntries(elementId: string): void {
  registerGlobals()
  if (paletteDisposers[elementId]) return
  const disposers: Array<() => void> = []
  const entry = anyFor(elementId)
  const titleKey = entry?.opts.labelKey ?? 'appearance.open'
  const group = entry?.opts.group ?? APPEARANCE_GROUP
  const keywords = [elementId, 'appearance', ...(entry?.opts.keywords ?? [])]

  const offCommand = register(addCommand, {
    id: `appearance.edit:${elementId}`,
    titleKey,
    group,
    keywords,
    run: () => {
      openAppearanceEditor(elementId)
    },
  })
  if (offCommand) disposers.push(offCommand)

  const offTarget = register(addTarget, {
    id: `appearance.element:${elementId}`,
    titleKey,
    group,
    teleport: () => {
      const live = anyFor(elementId)
      if (!live) return
      live.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      // A control lands on itself. A container hands focus to its first control, because
      // parking on a `tabindex="-1"` wrapper would leave the traveller one Tab short of
      // anything they can actually use.
      const isControl = live.el.tabIndex >= 0 || live.el.matches('a[href],button,input,select,textarea')
      const focusTarget = isControl ? live.el : (focusableWithin(live.el)[0] ?? live.el)
      if (focusTarget.tabIndex < 0 && !focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1
      focusTarget.focus()
    },
  })
  if (offTarget) disposers.push(offTarget)

  paletteDisposers[elementId] = disposers
}

/* ------------------------------------------------------------------ *
 * Context menu
 * ------------------------------------------------------------------ */

let openMenuHandle: PopoverHandle | null = null
let openEditorHandle: PopoverHandle | null = null

function closeOpenSurfaces(): void {
  if (openMenuHandle) openMenuHandle.close()
  if (openEditorHandle) openEditorHandle.close()
}

interface MenuItem {
  readonly label: string
  readonly enabled: boolean
  readonly run: () => void
}

function openMenu(elementId: string, element: HTMLElement, at: { x: number; y: number } | null): void {
  closeOpenSurfaces()
  const name = nameOf(elementId)
  const stored = Object.keys(appearanceFor(elementId)).length

  const items: MenuItem[] = [
    { label: tr('appearance.open', { element: name }), enabled: true, run: () => openEditor(elementId, element) },
    { label: tr('appearance.reset', { element: name }), enabled: stored > 0, run: () => resetAppearance(elementId) },
    {
      label: tr('appearance.resetAll', { count: Object.keys(map).length }),
      enabled: Object.keys(map).length > 0,
      run: () => resetAllAppearance(),
    },
  ]

  openMenuHandle = openPopover({
    anchor: at ? { element, at } : { element },
    className: 'sh-ap-menu',
    label: tr('appearance.menu.title', { element: name }),
    onClose: () => {
      openMenuHandle = null
    },
    build: (pop, close) => {
      const heading = el('h2', 'sh-pop-title', pop)
      heading.id = nextId('sh-ap-menu-title')
      heading.textContent = tr('appearance.menu.title', { element: name })

      const list = el('div', 'sh-ap-menu-list', pop)
      list.setAttribute('role', 'menu')
      list.setAttribute('aria-labelledby', heading.id)
      list.setAttribute('aria-orientation', 'vertical')

      const empty = el('p', 'sh-small', pop)
      empty.hidden = true

      const buttons = items.map((item) => {
        const button = el('button', 'sh-btn sh-ap-menu-item', list)
        button.type = 'button'
        button.setAttribute('role', 'menuitem')
        button.tabIndex = -1
        button.textContent = item.label
        button.disabled = !item.enabled
        button.addEventListener('click', () => {
          close()
          item.run()
        })
        return button
      })

      const search = createSearchField({
        id: SEARCH_FIELD_IDS.menu,
        labelKey: 'search.appearance.label',
        placeholderKey: 'search.appearance.placeholder',
        onChange: (field) => filter(field),
      })
      pop.insertBefore(search.el, list)

      function visible(): HTMLButtonElement[] {
        return buttons.filter((b) => !b.hidden && !b.disabled)
      }

      function filter(field: SearchField): void {
        let shown = 0
        buttons.forEach((button, index) => {
          const hit = field.test(items[index].label)
          button.hidden = !hit
          if (hit) shown += 1
        })
        empty.hidden = shown > 0
        empty.textContent = shown > 0 ? '' : tr('search.results.none', { query: field.query() })
        const order = visible()
        for (const b of buttons) b.tabIndex = -1
        if (order.length > 0) order[0].tabIndex = 0
      }

      list.addEventListener('keydown', (ev: KeyboardEvent) => {
        const current = ev.target
        if (!(current instanceof HTMLButtonElement)) return
        const order = visible()
        const index = order.indexOf(current)
        if (index < 0) return
        const move = (to: number): void => {
          ev.preventDefault()
          const wrapped = ((to % order.length) + order.length) % order.length
          for (const b of order) b.tabIndex = -1
          order[wrapped].tabIndex = 0
          order[wrapped].focus()
        }
        if (ev.key === 'ArrowDown') move(index + 1)
        else if (ev.key === 'ArrowUp') move(index - 1)
        else if (ev.key === 'Home') move(0)
        else if (ev.key === 'End') move(order.length - 1)
      })

      search.input.addEventListener('keydown', (ev: KeyboardEvent) => {
        const first = visible()[0]
        if (!first) return
        if (ev.key === 'Enter') {
          ev.preventDefault()
          first.click()
        } else if (ev.key === 'ArrowDown') {
          ev.preventDefault()
          first.focus()
        }
      })

      filter(search)
      return visible()[0] ?? search.input
    },
  })
}

/* ------------------------------------------------------------------ *
 * Editor popover
 * ------------------------------------------------------------------ */

function computedColor(element: HTMLElement, which: 'color' | 'background'): string {
  if (typeof window === 'undefined') return PAL.parchment
  if (which === 'color') {
    const c = window.getComputedStyle(element).color
    return parseColor(c) ? c : PAL.ink
  }
  let node: HTMLElement | null = element
  while (node) {
    const bg = window.getComputedStyle(node).backgroundColor
    const parsed = parseColor(bg)
    if (parsed && parsed.a > 0) return bg
    node = node.parentElement
  }
  return PAL.parchment
}

/** The colour a property is read against: text against its background, and back. */
function partnerColor(element: HTMLElement, property: AppearanceProperty, value: AppearanceValue): string {
  if (property === 'background') return value.color ?? computedColor(element, 'color')
  return value.background ?? computedColor(element, 'background')
}

/** What a numeric property is worth before the user has set anything. */
function inheritedNumber(element: HTMLElement, spec: PropSpec): number {
  if (spec.id === 'fontSizePct') return 100
  if (typeof window === 'undefined') return spec.min
  const raw = window.getComputedStyle(element).getPropertyValue(spec.css)
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? clampStep(spec, n) : spec.min
}

interface Row {
  readonly el: HTMLElement
  readonly property: AppearanceProperty
  readonly label: string
  sync(): void
}

function openEditor(elementId: string, element: HTMLElement): void {
  closeOpenSurfaces()
  ensureStyles('sh-appearance-ui-styles', APPEARANCE_CSS)

  const name = nameOf(elementId)
  const entry = anyFor(elementId)
  const asked = (entry?.opts.properties ?? APPEARANCE_PROPERTIES).filter((p) => isProperty(p))
  const properties = asked.length > 0 ? asked : APPEARANCE_PROPERTIES

  openEditorHandle = openPopover({
    anchor: { element },
    className: 'sh-ap-editor',
    label: tr('appearance.editor.title', { element: name, keys: APPEARANCE_CHORD }),
    onClose: () => {
      openEditorHandle = null
    },
    build: (pop, close) => {
      const heading = el('h2', 'sh-pop-title', pop)
      heading.textContent = tr('appearance.editor.title', { element: name, keys: APPEARANCE_CHORD })

      const hint = el('p', 'sh-small', pop)
      hint.textContent = tr('appearance.editor.hint', { keys: APPEARANCE_CHORD })

      const search = createSearchField({
        id: SEARCH_FIELD_IDS.properties,
        labelKey: 'search.appearance.label',
        placeholderKey: 'search.appearance.placeholder',
        onChange: (field) => filter(field),
      })
      pop.appendChild(search.el)

      const rowsWrap = el('div', 'sh-ap-rows', pop)
      const empty = el('p', 'sh-small', pop)
      empty.hidden = true

      const rows: Row[] = properties.map((property) => buildRow(property))

      const footer = el('div', 'sh-ap-footer', pop)
      const resetElement = el('button', 'sh-btn', footer)
      resetElement.type = 'button'
      resetElement.textContent = tr('appearance.reset', { element: name })
      resetElement.addEventListener('click', () => {
        resetAppearance(elementId)
        for (const row of rows) row.sync()
        syncFooter()
      })

      const closeButton = el('button', 'sh-btn', footer)
      closeButton.type = 'button'
      closeButton.textContent = tr('appearance.editor.close')
      closeButton.addEventListener('click', close)

      function syncFooter(): void {
        resetElement.disabled = Object.keys(appearanceFor(elementId)).length === 0
      }

      function filter(field: SearchField): void {
        let shown = 0
        for (const row of rows) {
          const hit = field.test(row.label) || field.test(row.property)
          row.el.hidden = !hit
          if (hit) shown += 1
        }
        empty.hidden = shown > 0
        empty.textContent = shown > 0 ? '' : tr('search.results.none', { query: field.query() })
      }

      function buildRow(property: AppearanceProperty): Row {
        const spec = specFor(property)
        const label = tr(spec.labelKey)
        const row = el('div', 'sh-ap-row', rowsWrap)
        const head = el('div', 'sh-ap-row-head', row)

        const title = el('span', 'sh-ap-row-label', head)
        title.textContent = label

        const resetProp = el('button', 'sh-btn', head)
        resetProp.type = 'button'
        resetProp.textContent = tr('appearance.reset', { element: label })
        resetProp.addEventListener('click', () => {
          setAppearance(elementId, property, null)
          sync()
          syncFooter()
          announce(tr('appearance.changed', { element: name }))
        })

        const body = el('div', 'sh-ap-row-body', row)
        let sync: () => void

        if (spec.kind === 'color') {
          const toggle = el('button', 'sh-btn sh-ap-swatch-btn', body)
          toggle.type = 'button'
          toggle.setAttribute('aria-expanded', 'false')
          const swatch = el('span', 'sh-ap-swatch', toggle)
          swatch.setAttribute('aria-hidden', 'true')
          // The colour itself is data, like a price in the almanac: it is shown as the
          // value it is. The words around it are translated.
          const valueText = el('span', 'sh-ap-value sh-mono', toggle)
          const stateText = el('span', 'sh-ap-state', toggle)

          const holder = el('div', 'sh-ap-picker', body)
          holder.hidden = true
          holder.id = nextId('sh-ap-picker')
          toggle.setAttribute('aria-controls', holder.id)

          let picker: ReturnType<typeof createColorPicker> | null = null
          // True while the picker itself is the source of the change: pushing the value
          // straight back into it would rewrite the hex field under the caret.
          let fromPicker = false

          const current = (): string => {
            const stored = appearanceFor(elementId)[property]
            if (typeof stored === 'string') return stored
            return property === 'background' ? computedColor(element, 'background') : computedColor(element, 'color')
          }

          toggle.addEventListener('click', () => {
            const show = holder.hidden
            holder.hidden = !show
            toggle.setAttribute('aria-expanded', show ? 'true' : 'false')
            if (!show) return
            if (!picker) {
              picker = createColorPicker({
                value: current(),
                background: partnerColor(element, property, appearanceFor(elementId)),
                searchId: SEARCH_FIELD_IDS.swatches,
                onChange: (css) => {
                  fromPicker = true
                  try {
                    setAppearance(elementId, property, css)
                    sync()
                    syncFooter()
                    for (const other of rows) if (other.property !== property) other.sync()
                  } finally {
                    fromPicker = false
                  }
                },
              })
              holder.appendChild(picker.el)
            } else {
              picker.setValue(current())
              picker.setBackground(partnerColor(element, property, appearanceFor(elementId)))
            }
            if (openEditorHandle) openEditorHandle.reposition()
            picker.focus()
          })

          sync = () => {
            const stored = appearanceFor(elementId)[property]
            const shown = current()
            const rgba = parseColor(shown)
            const hex = rgba ? formatHex(rgba) : shown
            swatch.style.setProperty('--sh-a-swatch', shown)
            valueText.textContent = hex
            stateText.textContent =
              stored === undefined ? tr('appearance.value.inherited', { element: label, value: hex }) : ''
            toggle.setAttribute('aria-label', tr('appearance.field.edit', { property: label, value: hex }))
            resetProp.disabled = stored === undefined

            const partner = parseColor(partnerColor(element, property, appearanceFor(elementId)))
            if (rgba && partner) {
              const ratio = contrastRatio(rgba, partner)
              const pass = meetsContrastAA(ratio)
              row.dataset.contrastFail = pass ? 'false' : 'true'
              row.title = tr(pass ? 'colorpicker.contrastPass' : 'colorpicker.contrastFail', {
                ratio: ratio.toFixed(2),
                required: CONTRAST_AA,
                against: formatHex(partner),
              })
            }
            if (picker) {
              if (!fromPicker) picker.setValue(shown)
              picker.setBackground(partnerColor(element, property, appearanceFor(elementId)))
            }
          }
        } else {
          const range = el('input', 'sh-ap-range', body)
          range.type = 'range'
          range.id = nextId('sh-ap-range')
          range.min = String(spec.min)
          range.max = String(spec.max)
          range.step = String(spec.step)
          range.setAttribute('aria-label', tr('appearance.field.slider', { property: label, unit: spec.unit }))

          const number = el('input', 'sh-search-input sh-ap-number', body)
          number.type = 'number'
          number.id = nextId('sh-ap-number')
          number.min = String(spec.min)
          number.max = String(spec.max)
          number.step = String(spec.step)
          number.setAttribute('aria-label', tr('appearance.field.number', { property: label, unit: spec.unit }))

          const unit = el('span', 'sh-small', body)
          unit.textContent = spec.unit

          const commit = (raw: number, announceIt: boolean): void => {
            setAppearance(elementId, property, raw)
            sync()
            syncFooter()
            if (announceIt) announce(tr('appearance.changed', { element: name }))
          }

          range.addEventListener('input', () => commit(Number(range.value), false))
          range.addEventListener('change', () => commit(Number(range.value), true))
          // Half-typed numbers are left alone: clamping "1" to a 50 % minimum while the
          // user is on their way to "125" would make the field impossible to type into.
          number.addEventListener('input', () => {
            const raw = number.value.trim()
            if (raw.length === 0) return
            const n = Number(raw)
            if (!Number.isFinite(n) || n < spec.min || n > spec.max) return
            commit(n, false)
          })
          number.addEventListener('change', () => {
            const raw = number.value.trim()
            if (raw.length === 0) {
              setAppearance(elementId, property, null)
              sync()
              syncFooter()
              return
            }
            const n = Number(raw)
            if (!Number.isFinite(n)) sync()
            else commit(n, true)
          })

          sync = () => {
            const stored = appearanceFor(elementId)[property]
            const n = typeof stored === 'number' ? clampStep(spec, stored) : inheritedNumber(element, spec)
            range.value = String(n)
            if (document.activeElement !== number) number.value = String(n)
            range.setAttribute('aria-valuetext', tr('appearance.field.value', { value: n, unit: spec.unit }))
            resetProp.disabled = stored === undefined
          }
        }

        sync()
        return { el: row, property, label, sync }
      }

      filter(search)
      syncFooter()
      return search.input
    },
  })
}

/* ------------------------------------------------------------------ *
 * Styles
 *
 * Injected here rather than added to base.css, which belongs to the styles lane. Colour is
 * taken from the --pal-* custom properties with the palette.ts value as the CSS fallback,
 * so there is no literal hex. Rows wrap rather than clip at 640 px and every target stays
 * at least 1.5rem (24 px) square.
 * ------------------------------------------------------------------ */

const APPEARANCE_CSS = `
.sh-ap-menu{width:min(20rem,calc(100vw - 1rem))}
.sh-ap-menu-list{display:flex;flex-direction:column;gap:.2rem}
.sh-ap-menu-item{text-align:left}
.sh-ap-menu-item[hidden]{display:none}
.sh-ap-editor{width:min(24rem,calc(100vw - 1rem))}
.sh-ap-rows{display:flex;flex-direction:column;gap:.4rem}
.sh-ap-row{display:flex;flex-direction:column;gap:.2rem;padding:.3rem;
  border:1px solid ${tok('bark')};background:${tok('parchment')}}
.sh-ap-row[hidden]{display:none}
.sh-ap-row[data-contrast-fail="true"]{border-color:${tok('berry')};box-shadow:inset 2px 0 0 ${tok('berry')}}
.sh-ap-row-head{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;justify-content:space-between}
.sh-ap-row-label{font-weight:700;font-size:.9em}
.sh-ap-row-body{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.sh-ap-swatch-btn{display:inline-flex;gap:.35rem;align-items:center;flex:1 1 auto;min-width:0;text-align:left}
.sh-ap-swatch{width:1rem;height:1rem;flex:0 0 auto;border:1px solid ${tok('ink')};
  background:var(--sh-a-swatch,${tok('parchment')})}
.sh-ap-value{font-size:.85em;overflow-wrap:anywhere}
.sh-ap-state{font-size:.8em;color:${tok('shadow')}}
.sh-ap-state:empty{display:none}
.sh-ap-picker{flex:1 1 100%;min-width:0;margin-top:.3rem}
.sh-ap-picker[hidden]{display:none}
.sh-ap-range{flex:1 1 8rem;min-width:6rem;min-height:1.5rem;accent-color:${tok('lantern')}}
.sh-ap-number{flex:0 0 5rem;min-height:1.5rem}
.sh-ap-footer{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:flex-end}
@media (max-width:40rem){
  .sh-ap-editor,.sh-ap-menu{width:min(100vw - 1rem,22rem)}
  .sh-ap-row-body{flex-direction:column;align-items:stretch}
  .sh-ap-number{flex:1 1 auto}
}
@media (prefers-reduced-motion:reduce){
  .sh-ap-row,.sh-ap-picker{transition:none!important;animation:none!important}
}
`
