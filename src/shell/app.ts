/**
 * The application shell.
 *
 * DESIGN.md section 10 in one file: the frameless title bar, the persistent tab strip,
 * the panel region, the command palette, the status line and the notification stack,
 * with the canvas game of sections 1–9 living inside the Farm tab and keeping its own
 * loop and its own save.
 *
 * Boot order is not arbitrary and is the reason this file reads top to bottom:
 *
 *   1. `load()` the store, because every decision below is a persisted one.
 *   2. `applyPersistedSettings()`, which writes the display scale, the motion mode and
 *      the appearance overrides onto the root and hands the language and funny levels
 *      to `i18n` — before the farm mounts, because `src/art/tiles.ts` caches the
 *      reduced-motion answer the first time it draws.
 *   3. The title bar, then the tab strip, then the default tabs — Farm pinned and
 *      active, Almanac, Settings.
 *   4. The panels, which is when the settings rows and documentation sections register
 *      their palette `Target`s, so the palette is complete the moment it opens.
 *   5. The shell's own commands, the `Ctrl+Shift+F` handler, and the notifications.
 *
 * The whole thing is wrapped in one `try`/`catch`. A shell that cannot start paints a
 * legible, translated, focusable panel into the app root: a blank window with the
 * reason in devtools is not an option this contract allows.
 *
 * Colour comes from `tokens.css` through `base.css`. The only inline styles here are
 * layout ones with no design opinion, and no colour is named anywhere in this file.
 */

import packageManifest from '../../package.json?raw'
import { SAVE_VERSION } from '../game/constants'

import {
  DISPLAY_SCALES,
  HISTORY_KINDS,
  HISTORY_LIMIT,
  get as storeGet,
  load as storeLoad,
  resetAll as storeResetAll,
  save as storeSave,
  subscribe as storeSubscribe,
} from './core/store'
import type { DisplayScale, FunnyLevel, HistoryEntry, HistoryKind } from './core/store'

import { funnyLevelKey, getFunny, getLang, onLangChange, setFunny, t } from './core/i18n'
import type { StringKey } from './core/i18n'

import { clear as clearHistory, query as queryHistory } from './core/history'
import { EXPORT_FORMATS, downloadAs, suggestFilename } from './core/export'
import type { ExportFormat } from './core/export'

import {
  activate as activatePaletteEntry,
  entries as paletteEntries,
  grouped as groupPaletteEntries,
  groupLabel as paletteGroupLabel,
  isTarget,
  registerCommand,
  registerGroupLabel,
} from './core/palette-registry'
import type { Command, PaletteEntry } from './core/palette-registry'

import { mountTitleBar } from './ui/titlebar'
import type { TitleBar } from './ui/titlebar'
import { createTabStrip } from './ui/tabs'
import type { TabStrip } from './ui/tabs'
import { DEFAULT_STRIP_ID, requestCloseTabs, tabLabel } from './ui/tabmodel'
import type { Tab } from './ui/tabmodel'
import { createTabSearchPanel } from './ui/tabsearch'
import {
  confirm as confirmDialog,
  fail as notifyFail,
  info as notifyInfo,
  isBlockingDialogOpen,
  mountNotifications,
  success as notifySuccess,
} from './ui/notify'
import { applyPersistedSettings, createSettingsPanel, motionIsReduced } from './ui/settings'
import { createAlmanacPanel } from './ui/almanac'
import { createChangelogPanel } from './ui/changelog'
import { createSurprisePanel, installSurprise } from './ui/surprise'
import { createSearchField } from './ui/searchfield'
import type { SearchField } from './ui/searchfield'
import { createFarmTab } from './ui/farmtab'
import type { FarmTab } from './ui/farmtab'

/* -------------------------------------------------------------------------- *
 * Facts
 * -------------------------------------------------------------------------- */

/** The product name. Never translated, never restyled by the funny level. */
const APP_NAME = 'Sprout Hollow'

/** The command palette chord, quoted to the reader as a parameter and never as prose. */
const PALETTE_CHORD = 'Ctrl+Shift+F'

/** The palette group this file's own commands live in. */
const COMMAND_GROUP = 'commands'

/** The catalogue ids of the search fields this file owns. */
const PALETTE_SEARCH_ID = 'palette'
const HISTORY_SEARCH_ID = 'history'

const ROOT_ID = 'app'
const TITLEBAR_HOST_ID = 'shell-titlebar'
const TABSTRIP_HOST_ID = 'shell-tabstrip'
const PANELS_HOST_ID = 'shell-panels'
const STATUS_HOST_ID = 'shell-status'
const NOTIFY_HOST_ID = 'shell-notifications'

/* -------------------------------------------------------------------------- *
 * Tabs the shell knows how to build
 * -------------------------------------------------------------------------- */

const PANEL_KINDS = [
  'farm',
  'almanac',
  'settings',
  'changelog',
  'history',
  'surprise',
  'tabs',
] as const

type PanelKind = (typeof PANEL_KINDS)[number]

const TAB_TITLE: Readonly<Record<PanelKind, StringKey>> = {
  farm: 'tab.farm',
  almanac: 'tab.almanac',
  settings: 'tab.settings',
  changelog: 'tab.changelog',
  history: 'tab.history',
  surprise: 'tab.surprise',
  tabs: 'tabs.new',
}

function isPanelKind(value: string): value is PanelKind {
  return (PANEL_KINDS as readonly string[]).includes(value)
}

/** One built panel and how to take it down again. */
interface PanelHandle {
  element: HTMLElement
  destroy(): void
}

/* -------------------------------------------------------------------------- *
 * Small DOM helpers — layout and structure only, no colour, no design opinion
 * -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined && className.length > 0) node.className = className
  parent?.appendChild(node)
  return node
}

function button(label: string, parent: HTMLElement, className = 'sh-btn'): HTMLButtonElement {
  const b = el('button', className, parent)
  b.type = 'button'
  b.textContent = label
  return b
}

/** `document.getElementById`, but a missing mount point is a boot failure, not a silence. */
function requireElement(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`MISSING SHELL MOUNT POINT #${id}`)
  return node
}

function appVersion(): string {
  try {
    const parsed: unknown = JSON.parse(packageManifest)
    if (typeof parsed === 'object' && parsed !== null) {
      const version = (parsed as Record<string, unknown>).version
      if (typeof version === 'string' && version.length > 0) return version
    }
  } catch {
    // A manifest that will not parse costs a version string, nothing more.
  }
  return ''
}

/** How a history entry reads for a human. The key and the facts are what is stored. */
function historyLine(entry: HistoryEntry): string {
  return t(entry.summary as StringKey, entry.params)
}

/**
 * The string key naming a history kind. `store.ts` and `strings.ts` do not agree on
 * the set of kinds — see the report accompanying this lane — so the kinds the
 * catalogue does carry are translated and the rest show their own stable id, which is
 * a fact and is visible and fixable rather than silently blank.
 */
const HISTORY_KIND_KEY: Readonly<Partial<Record<HistoryKind, StringKey>>> = {
  game: 'history.kind.action',
  settings: 'history.kind.setting',
  tab: 'history.kind.navigation',
  data: 'history.kind.export',
  error: 'history.kind.error',
}

function historyKindLabel(kind: HistoryKind): string {
  const key = HISTORY_KIND_KEY[kind]
  return key === undefined ? kind : t(key)
}

/* -------------------------------------------------------------------------- *
 * The History panel
 * -------------------------------------------------------------------------- */

function createHistoryPanel(): PanelHandle {
  const element = el('section', 'sh-content sh-stack sh-stack--loose')

  const heading = el('h2', undefined, element)
  const lede = el('p', 'sh-hint', element)

  const controls = el('div', 'sh-row', element)

  let field: SearchField | null = null
  try {
    field = createSearchField({
      id: HISTORY_SEARCH_ID,
      labelKey: 'search.history.label',
      placeholderKey: 'search.history.placeholder',
      onChange: () => {
        render()
      },
    })
    controls.appendChild(field.el)
  } catch {
    // A search field that will not build must not cost the reader the list itself.
    field = null
  }

  const kindField = el('label', 'sh-field', controls)
  const kindLabel = el('span', 'sh-label', kindField)
  const kindWrap = el('span', 'sh-select', kindField)
  const kindSelect = el('select', undefined, kindWrap)
  const allOption = el('option', undefined, kindSelect)
  allOption.value = ''
  for (const kind of HISTORY_KINDS) {
    const option = el('option', undefined, kindSelect)
    option.value = kind
  }
  kindSelect.addEventListener('change', () => {
    render()
  })

  const count = el('p', 'sh-hint', element)
  count.setAttribute('role', 'status')
  count.setAttribute('aria-live', 'polite')

  const list = el('ul', 'sh-list', element)

  const actions = el('div', 'sh-row', element)
  const exportButtons = new Map<ExportFormat, HTMLButtonElement>()
  for (const format of EXPORT_FORMATS) {
    exportButtons.set(format, button('', actions))
  }
  const clearButton = button('', actions, 'sh-btn sh-btn--danger')

  for (const [format, node] of exportButtons) {
    node.addEventListener('click', () => {
      const target = { sections: ['history'] as const, translate: historyLine }
      const filename = suggestFilename(format, target)
      try {
        downloadAs(format, target, filename)
        notifySuccess('export.done', { filename })
      } catch (err) {
        notifyFail('export.failed', { error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  clearButton.addEventListener('click', () => {
    const total = storeGet().history.length
    void confirmDialog({
      titleKey: 'history.clear.confirm.title',
      messageKey: 'history.clear.confirm.body',
      params: { count: total },
      destructive: true,
    }).then(async (agreed) => {
      if (!agreed) return
      await clearHistory()
      notifySuccess('history.cleared', { count: total })
      render()
    })
  })

  function selectedKind(): HistoryKind | undefined {
    const value = kindSelect.value
    return (HISTORY_KINDS as readonly string[]).includes(value) ? (value as HistoryKind) : undefined
  }

  function render(): void {
    const kind = selectedKind()
    const all = queryHistory(kind === undefined ? {} : { kind })
    const matching = all.filter((entry) => {
      if (field === null || !field.active()) return true
      return field.test(`${historyLine(entry)} ${entry.summary} ${historyKindLabel(entry.kind)}`)
    })

    count.textContent = t('history.count', { count: matching.length, total: all.length })

    list.textContent = ''
    if (matching.length === 0) {
      const empty = el('li', 'sh-list__item', list)
      empty.textContent = t('history.empty')
      return
    }
    for (const entry of matching) {
      const item = el('li', 'sh-list__item', list)
      const badge = el('span', 'sh-badge', item)
      badge.textContent = historyKindLabel(entry.kind)
      const when = el('time', 'sh-fact', item)
      when.dateTime = new Date(entry.at).toISOString()
      when.textContent = t('history.at', { time: new Date(entry.at).toLocaleTimeString() })
      const text = el('span', 'sh-truncate', item)
      text.textContent = historyLine(entry)
      item.title = historyLine(entry)
    }
  }

  function relabel(): void {
    heading.textContent = t('history.title')
    lede.textContent = t('history.desc', { max: HISTORY_LIMIT })
    kindLabel.textContent = t('history.filter.kind')
    allOption.textContent = t('history.filter.all')
    for (let i = 0; i < HISTORY_KINDS.length; i++) {
      const option = kindSelect.options.item(i + 1)
      const kind = HISTORY_KINDS[i]
      if (option !== null && kind !== undefined) option.textContent = historyKindLabel(kind)
    }
    for (const [format, node] of exportButtons) {
      node.textContent = t('export.download', { format: t(`export.format.${format}` as StringKey) })
    }
    clearButton.textContent = t('history.clear')
    render()
  }

  relabel()
  const stopLang = onLangChange(relabel)
  const stopStore = storeSubscribe(() => {
    render()
  })

  return {
    element,
    destroy(): void {
      stopLang()
      stopStore()
      element.remove()
    },
  }
}

/* -------------------------------------------------------------------------- *
 * The command palette
 * -------------------------------------------------------------------------- */

interface CommandPalette {
  open(): void
  close(): void
  isOpen(): boolean
  destroy(): void
}

function createCommandPalette(root: HTMLElement): CommandPalette {
  const dialog = el('dialog', 'sh-dialog sh-palette')
  dialog.setAttribute('aria-label', t('palette.title'))

  const title = el('div', 'sh-dialog__title', dialog)
  const body = el('div', 'sh-dialog__body sh-stack', dialog)

  const field = createSearchField({
    id: PALETTE_SEARCH_ID,
    labelKey: 'palette.label',
    placeholderKey: 'palette.placeholder',
    onChange: () => {
      render()
    },
  })
  body.appendChild(field.el)

  const hint = el('p', 'sh-hint', body)
  const status = el('p', 'sh-hint', body)
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const list = el('ul', 'sh-listbox', body)
  list.id = 'sh-palette-list'
  list.setAttribute('role', 'listbox')

  const input = field.input
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'true')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-autocomplete', 'list')

  root.appendChild(dialog)

  let shown: PaletteEntry[] = []
  let activeIndex = 0
  let returnFocusTo: HTMLElement | null = null

  function optionId(index: number): string {
    return `sh-palette-option-${index}`
  }

  function matches(entry: PaletteEntry): boolean {
    if (!field.active()) return true
    const haystacks = [t(entry.titleKey), paletteGroupLabel(entry.group), entry.id]
    const keywords = (entry as Command).keywords
    if (Array.isArray(keywords)) haystacks.push(...keywords)
    return haystacks.some((text) => field.test(text))
  }

  function render(): void {
    shown = groupPaletteEntries(paletteEntries().filter(matches))
      .flatMap((group) => group.entries)
      .slice(0, 200)
    if (activeIndex >= shown.length) activeIndex = 0

    list.textContent = ''
    for (let i = 0; i < shown.length; i++) {
      const entry = shown[i]
      if (entry === undefined) continue
      const option = el('li', 'sh-option', list)
      option.id = optionId(i)
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(i === activeIndex))
      if (i === activeIndex) option.classList.add('is-active')
      const label = t(entry.titleKey)
      option.setAttribute(
        'aria-label',
        isTarget(entry) ? t('palette.goto', { title: label }) : t('palette.run', { title: label }),
      )
      const group = el('span', 'sh-badge', option)
      group.textContent = paletteGroupLabel(entry.group)
      const text = el('span', 'sh-truncate', option)
      text.textContent = label
      option.addEventListener('click', () => {
        choose(i)
      })
    }

    if (shown.length === 0) {
      const empty = el('li', 'sh-option', list)
      empty.setAttribute('role', 'presentation')
      empty.textContent = t('palette.empty', { query: field.query() })
      input.removeAttribute('aria-activedescendant')
    } else {
      input.setAttribute('aria-activedescendant', optionId(activeIndex))
    }
    status.textContent = t('palette.count', { count: shown.length })
  }

  function move(delta: number): void {
    if (shown.length === 0) return
    activeIndex = (activeIndex + delta + shown.length) % shown.length
    render()
    list.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({
      block: 'nearest',
    })
  }

  function choose(index: number): void {
    const entry = shown[index]
    if (entry === undefined) return
    close()
    try {
      activatePaletteEntry(entry)
    } catch (err) {
      notifyFail('common.error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        activeIndex = 0
        render()
        break
      case 'End':
        event.preventDefault()
        activeIndex = Math.max(0, shown.length - 1)
        render()
        break
      case 'Enter':
        event.preventDefault()
        choose(activeIndex)
        break
      default:
        break
    }
  })

  // Native `close` covers Escape as well as the button, so focus comes back once.
  dialog.addEventListener('close', () => {
    if (returnFocusTo !== null && returnFocusTo.isConnected) returnFocusTo.focus()
    returnFocusTo = null
  })

  function relabel(): void {
    dialog.setAttribute('aria-label', t('palette.title'))
    title.textContent = t('palette.title')
    hint.textContent = t('palette.hint', { keys: PALETTE_CHORD })
    list.setAttribute('aria-label', t('palette.title'))
    if (dialog.open) render()
  }

  relabel()
  const stopLang = onLangChange(relabel)

  function close(): void {
    if (dialog.open) dialog.close()
  }

  return {
    open(): void {
      if (dialog.open) return
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      activeIndex = 0
      field.clear()
      render()
      dialog.showModal()
      field.focus()
    },
    close,
    isOpen(): boolean {
      return dialog.open
    },
    destroy(): void {
      stopLang()
      close()
      dialog.remove()
    },
  }
}

/* -------------------------------------------------------------------------- *
 * Boot
 * -------------------------------------------------------------------------- */

export interface Shell {
  destroy(): void
}

let running: Shell | null = null

export async function start(): Promise<Shell> {
  if (running !== null) return running

  const root = requireElement(ROOT_ID)
  try {
    running = await boot(root)
    return running
  } catch (err) {
    paintBootError(root, err)
    throw err
  }
}

async function boot(root: HTMLElement): Promise<Shell> {
  const disposers: Array<() => void> = []

  /* 1. the store, then everything it decides */
  await storeLoad()
  applyPersistedSettings()

  /* 2. the title bar */
  const titlebarHost = requireElement(TITLEBAR_HOST_ID)
  const titlebar: TitleBar = mountTitleBar(titlebarHost)
  disposers.push(() => titlebar.destroy())

  /* 3. the tab strip and its panels */
  const strip: TabStrip = createTabStrip({ stripId: DEFAULT_STRIP_ID })
  requireElement(TABSTRIP_HOST_ID).appendChild(strip.element)
  const panelsHost = requireElement(PANELS_HOST_ID)
  panelsHost.appendChild(strip.panels)
  disposers.push(() => strip.destroy())

  const model = strip.model

  /* 4. the default tabs — Farm pinned and active */
  model.open(
    { id: 'farm', kind: 'farm', titleKey: TAB_TITLE.farm, pinned: true, closable: false },
    { activate: false, index: 0 },
  )
  model.open({ id: 'almanac', kind: 'almanac', titleKey: TAB_TITLE.almanac }, { activate: false })
  model.open({ id: 'settings', kind: 'settings', titleKey: TAB_TITLE.settings }, { activate: false })
  model.activate('farm')

  /* 5. the panels */
  const panels = new Map<string, PanelHandle>()
  let farm: FarmTab | null = null

  const activateTab = (tabId: string): void => {
    model.activate(tabId)
  }

  function buildPanel(kind: PanelKind): PanelHandle {
    switch (kind) {
      case 'farm': {
        const tab = createFarmTab()
        farm = tab
        return { element: tab.element, destroy: () => tab.destroy() }
      }
      case 'almanac': {
        const doc = createAlmanacPanel()
        return { element: doc.el, destroy: () => doc.destroy() }
      }
      case 'settings': {
        const panel = createSettingsPanel({ activate: () => activateTab('settings') })
        return { element: panel.element, destroy: () => panel.destroy() }
      }
      case 'changelog': {
        const doc = createChangelogPanel()
        return { element: doc.el, destroy: () => doc.destroy() }
      }
      case 'history':
        return createHistoryPanel()
      case 'surprise': {
        const panel = createSurprisePanel()
        return { element: panel.el, destroy: () => panel.destroy() }
      }
      case 'tabs': {
        const surface = createTabSearchPanel(DEFAULT_STRIP_ID)
        return { element: surface.element, destroy: () => surface.destroy() }
      }
    }
  }

  function ensurePanel(tab: Tab): void {
    if (panels.has(tab.id)) return
    if (!isPanelKind(tab.kind)) return
    let built: PanelHandle
    try {
      built = buildPanel(tab.kind)
    } catch (err) {
      // One panel that will not build must not take the shell with it. The strip's own
      // empty state stays in place and the reason is reported where it can be read.
      notifyFail('common.error', { error: err instanceof Error ? err.message : String(err) })
      return
    }
    panels.set(tab.id, built)
    strip.setPanelContent(tab.id, built.element)
    if (tab.kind === 'farm') strip.panelFor(tab.id).classList.add('sh-tabpanel--canvas')
  }

  function syncPanels(): void {
    const live = new Set(model.tabs().map((tab) => tab.id))
    for (const [id, panel] of panels) {
      if (live.has(id)) continue
      panel.destroy()
      panels.delete(id)
      if (id === 'farm') farm = null
    }
    for (const tab of model.tabs()) ensurePanel(tab)

    const activeId = model.activeId()
    farm?.setVisible(activeId === 'farm')

    const active = activeId === null ? undefined : model.tab(activeId)
    document.title =
      active === undefined
        ? APP_NAME
        : t('titlebar.documentTitle', { tab: tabLabel(active), app: APP_NAME })
  }

  syncPanels()
  disposers.push(model.subscribe(syncPanels))

  /** Opens a shell tab, building it if it is not there, and brings it forward. */
  function openTab(kind: PanelKind): void {
    model.open(
      {
        id: kind,
        kind,
        titleKey: TAB_TITLE[kind],
        closable: kind !== 'farm',
        pinned: kind === 'farm',
      },
      { activate: true },
    )
    model.activate(kind)
  }

  /* 6. panels that reveal themselves — the documentation lane's teleports */
  const onReveal = (event: Event): void => {
    const detail = (event as CustomEvent<{ panel?: unknown }>).detail
    const panel = typeof detail?.panel === 'string' ? detail.panel : null
    if (panel === null) return
    const tab = model.tabs().find((candidate) => candidate.kind === panel)
    if (tab !== undefined) model.activate(tab.id)
    else if (isPanelKind(panel)) openTab(panel)
  }
  root.addEventListener('shell:reveal', onReveal)
  disposers.push(() => root.removeEventListener('shell:reveal', onReveal))

  /* 7. the status line */
  const statusHost = requireElement(STATUS_HOST_ID)
  const statusHint = el('span', 'sh-truncate', statusHost)
  el('span', 'sh-spacer', statusHost)
  const statusTagline = el('span', 'sh-truncate', statusHost)

  /* 8. notifications and the dim-sum trolley */
  mountNotifications(requireElement(NOTIFY_HOST_ID))
  disposers.push(installSurprise(root))

  /* 9. the command palette and its chord */
  const palette = createCommandPalette(root)
  disposers.push(() => palette.destroy())

  const onChord = (event: KeyboardEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return
    if (!event.shiftKey || event.altKey) return
    if (event.code !== 'KeyF' && event.key !== 'F' && event.key !== 'f') return
    // A blocking dialog is a real decision; nothing may be opened over the top of it.
    if (isBlockingDialogOpen()) return
    event.preventDefault()
    event.stopPropagation()
    if (palette.isOpen()) palette.close()
    else palette.open()
  }
  window.addEventListener('keydown', onChord, true)
  disposers.push(() => window.removeEventListener('keydown', onChord, true))

  /* 10. the shell's own commands */
  disposers.push(...registerShellCommands({ model, strip, openTab, focusFarm: () => farm?.focus() }))

  /* 11. language */
  function relabel(): void {
    root.setAttribute('aria-label', t('app.window.label'))
    panelsHost.setAttribute('aria-label', t('tabs.strip.label'))
    statusHint.textContent = t('palette.hint', { keys: PALETTE_CHORD })
    statusTagline.textContent = t('app.tagline')
    titlebar.refresh()
    syncPanels()
  }
  relabel()
  disposers.push(onLangChange(relabel))

  /* 12. the farm keeps its own save; make sure the last day reaches disk */
  const onPageHide = (): void => {
    farm?.saveNow()
  }
  window.addEventListener('pagehide', onPageHide)
  disposers.push(() => window.removeEventListener('pagehide', onPageHide))

  return {
    destroy(): void {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose()
        } catch {
          // Teardown is best effort; one failure must not strand the rest.
        }
      }
      disposers.length = 0
      for (const panel of panels.values()) panel.destroy()
      panels.clear()
      running = null
    },
  }
}

/* -------------------------------------------------------------------------- *
 * The commands the shell owns
 * -------------------------------------------------------------------------- */

interface CommandContext {
  model: TabStrip['model']
  strip: TabStrip
  openTab(kind: PanelKind): void
  focusFarm(): void
}

/** The window half of the preload bridge, duck-typed exactly as `titlebar.ts` does. */
interface WindowControls {
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
}

function windowControls(): WindowControls | null {
  const host = (globalThis as { sprout?: Record<string, unknown> }).sprout
  if (host === undefined) return null
  for (const name of ['minimizeWindow', 'toggleMaximizeWindow', 'closeWindow']) {
    if (typeof host[name] !== 'function') return null
  }
  return host as unknown as WindowControls
}

function registerShellCommands(ctx: CommandContext): Array<() => void> {
  const offs: Array<() => void> = []
  const add = (command: Command): void => {
    try {
      offs.push(registerCommand(command))
    } catch {
      // A registry that will not take a command still leaves the command's own
      // keyboard route and its control working.
    }
  }

  try {
    offs.push(registerGroupLabel(COMMAND_GROUP, 'palette.group.commands', 10))
  } catch {
    // An unlabelled group shows its id, which is a fact and still findable.
  }

  /* -- places -- */

  add({
    id: 'shell.focusFarm',
    titleKey: 'cmd.focusFarm',
    group: COMMAND_GROUP,
    keywords: ['farm', 'game', 'play', 'canvas'],
    run: () => {
      ctx.openTab('farm')
      ctx.focusFarm()
    },
  })
  for (const kind of ['settings', 'almanac', 'changelog', 'history'] as const) {
    const titleKey: StringKey =
      kind === 'settings'
        ? 'cmd.openSettings'
        : kind === 'almanac'
          ? 'cmd.openAlmanac'
          : kind === 'changelog'
            ? 'cmd.openChangelog'
            : 'cmd.openHistory'
    add({
      id: `shell.open.${kind}`,
      titleKey,
      group: COMMAND_GROUP,
      keywords: [kind, 'open', 'tab'],
      run: () => {
        ctx.openTab(kind)
      },
    })
  }

  /* -- tabs -- */

  add({
    id: 'shell.newTab',
    titleKey: 'cmd.newTab',
    group: COMMAND_GROUP,
    keywords: ['tab', 'new', 'search'],
    run: () => {
      ctx.openTab('tabs')
    },
  })
  add({
    id: 'shell.closeTab',
    titleKey: 'cmd.closeTab',
    group: COMMAND_GROUP,
    keywords: ['tab', 'close'],
    run: () => {
      const activeId = ctx.model.activeId()
      if (activeId === null) return
      void requestCloseTabs(ctx.model, [activeId])
    },
  })
  for (const [id, titleKey, delta] of [
    ['shell.nextTab', 'cmd.nextTab', 1],
    ['shell.prevTab', 'cmd.prevTab', -1],
  ] as const) {
    add({
      id,
      titleKey,
      group: COMMAND_GROUP,
      keywords: ['tab', 'switch'],
      run: () => {
        const tabs = ctx.model.tabs()
        if (tabs.length === 0) return
        const at = ctx.model.indexOf(ctx.model.activeId() ?? '')
        const next = tabs[((at < 0 ? 0 : at) + delta + tabs.length) % tabs.length]
        if (next !== undefined) ctx.model.activate(next.id)
      },
    })
  }

  /* -- language -- */

  for (const [id, titleKey, delta] of [
    ['shell.funnyUp', 'cmd.funnyUp', 1],
    ['shell.funnyDown', 'cmd.funnyDown', -1],
  ] as const) {
    add({
      id,
      titleKey,
      group: COMMAND_GROUP,
      keywords: ['funny', 'voice', 'tone', 'language'],
      run: () => {
        const lang = getLang()
        const current = getFunny()
        const bump = (level: FunnyLevel): FunnyLevel =>
          Math.min(5, Math.max(1, level + delta)) as FunnyLevel
        const next = {
          en: lang === 'yue' ? current.en : bump(current.en),
          yue: lang === 'en' ? current.yue : bump(current.yue),
        }
        setFunny(next)
        const shown = lang === 'yue' ? next.yue : next.en
        notifyInfo('settings.lang.funny.changed', {
          level: shown,
          name: t(funnyLevelKey(shown)),
        })
      },
    })
  }

  /* -- presentation -- */

  add({
    id: 'shell.toggleMute',
    titleKey: 'cmd.toggleMute',
    group: COMMAND_GROUP,
    keywords: ['audio', 'sound', 'mute', 'silence'],
    run: () => {
      const muted = !storeGet().settings.audio.muted
      void storeSave({ settings: { audio: { muted } } })
      notifyInfo(muted ? 'settings.audio.muted' : 'settings.audio.unmuted')
    },
  })
  add({
    id: 'shell.toggleMotion',
    titleKey: 'cmd.toggleMotion',
    group: COMMAND_GROUP,
    keywords: ['motion', 'animation', 'reduce', 'accessibility'],
    run: () => {
      const mode = motionIsReduced() ? 'full' : 'reduced'
      void storeSave({ settings: { motion: mode } })
      notifyInfo('settings.motion.changed', {
        mode: t(mode === 'full' ? 'settings.motion.option.full' : 'settings.motion.option.reduced'),
        effective: t(
          motionIsReduced() ? 'settings.motion.option.reduced' : 'settings.motion.option.full',
        ),
      })
    },
  })
  for (const [id, titleKey, delta] of [
    ['shell.zoomIn', 'cmd.zoomIn', 1],
    ['shell.zoomOut', 'cmd.zoomOut', -1],
    ['shell.zoomReset', 'cmd.zoomReset', 0],
  ] as const) {
    add({
      id,
      titleKey,
      group: COMMAND_GROUP,
      keywords: ['scale', 'zoom', 'size', 'display'],
      run: () => {
        const current = storeGet().settings.displayScale
        const at = DISPLAY_SCALES.indexOf(current)
        const wanted: DisplayScale =
          delta === 0
            ? 100
            : (DISPLAY_SCALES[
                Math.min(DISPLAY_SCALES.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))
              ] ?? current)
        if (wanted === current) return
        void storeSave({ settings: { displayScale: wanted } })
        notifyInfo('settings.scale.changed', { scale: wanted })
      },
    })
  }

  /* -- data -- */

  add({
    id: 'shell.exportData',
    titleKey: 'cmd.exportData',
    group: COMMAND_GROUP,
    keywords: ['export', 'download', 'backup', 'json'],
    run: () => {
      const target = { translate: historyLine }
      const filename = suggestFilename('json', target)
      try {
        downloadAs('json', target, filename)
        notifySuccess('export.done', { filename })
      } catch (err) {
        notifyFail('export.failed', { error: err instanceof Error ? err.message : String(err) })
      }
    },
  })
  add({
    id: 'shell.resetAll',
    titleKey: 'cmd.resetAll',
    group: COMMAND_GROUP,
    keywords: ['reset', 'default', 'wipe', 'settings'],
    run: () => {
      void confirmDialog({
        titleKey: 'settings.data.resetAll.confirmTitle',
        messageKey: 'settings.data.resetAll.confirmBody',
        destructive: true,
      }).then(async (agreed) => {
        if (!agreed) return
        await storeResetAll()
        notifySuccess('settings.data.resetAll.done')
      })
    },
  })
  add({
    id: 'shell.copyDiagnostics',
    titleKey: 'cmd.copyDiagnostics',
    group: COMMAND_GROUP,
    keywords: ['diagnostics', 'support', 'copy', 'version'],
    run: () => {
      const settings = storeGet().settings
      const version = appVersion()
      const lines = [
        `${APP_NAME} ${version}`,
        `save-format=${SAVE_VERSION}`,
        `language=${settings.language}`,
        `funny=en:${settings.funny.en},yue:${settings.funny.yue}`,
        `scale=${settings.displayScale}`,
        `motion=${settings.motion} effective=${motionIsReduced() ? 'reduced' : 'full'}`,
        `pixel-scale=${String(settings.game.pixelScale)}`,
        `tabs=${ctx.model.tabs().length}`,
        `viewport=${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      ]
      const text = lines.join('\n')
      const done = (): void => {
        notifySuccess('common.copied')
      }
      const failed = (err: unknown): void => {
        notifyFail('common.error', { error: err instanceof Error ? err.message : String(err) })
      }
      try {
        const clip = navigator.clipboard
        if (clip === undefined) throw new Error('CLIPBOARD UNAVAILABLE')
        void clip.writeText(text).then(done, failed)
      } catch (err) {
        failed(err)
      }
    },
  })

  /* -- the window, only where the controls really exist -- */

  const controls = windowControls()
  if (controls !== null) {
    add({
      id: 'shell.window.minimise',
      titleKey: 'cmd.minimise',
      group: COMMAND_GROUP,
      keywords: ['window', 'minimise', 'minimize'],
      run: () => {
        void controls.minimizeWindow().catch(() => undefined)
      },
    })
    add({
      id: 'shell.window.maximise',
      titleKey: 'cmd.maximise',
      group: COMMAND_GROUP,
      keywords: ['window', 'maximise', 'maximize', 'restore'],
      run: () => {
        void controls.toggleMaximizeWindow().catch(() => undefined)
      },
    })
    add({
      id: 'shell.window.close',
      titleKey: 'cmd.closeWindow',
      group: COMMAND_GROUP,
      keywords: ['window', 'close', 'quit', 'exit'],
      run: () => {
        void controls.closeWindow().catch(() => undefined)
      },
    })
  }

  return offs
}

/* -------------------------------------------------------------------------- *
 * Failure
 * -------------------------------------------------------------------------- */

/**
 * The shell could not start. Whatever went wrong, the reader gets a readable reason
 * and a working way out instead of a black rectangle.
 *
 * `t()` is tried first and every call is guarded: the failure may well *be* the string
 * catalogue, and a translation layer that throws must not swallow the only message the
 * reader is going to see. The literals below are that last resort and nothing else.
 */
function paintBootError(root: HTMLElement, err: unknown): void {
  const message = err instanceof Error && err.message.length > 0 ? err.message : String(err)
  const say = (key: StringKey, params?: Record<string, string | number>, fallback = ''): string => {
    try {
      const out = t(key, params)
      if (out.length > 0 && out !== key) return out
    } catch {
      // Fall through to the literal below.
    }
    return fallback
  }

  try {
    console.error('[sprout hollow]', err)
  } catch {
    // No console is not a reason to lose the panel below.
  }

  try {
    root.textContent = ''
    root.className = 'sh-app'
    const wrap = el('div', 'sh-panel sh-content', root)
    wrap.style.margin = 'auto'
    const heading = el('h1', 'sh-panel__title', wrap)
    heading.textContent = say('app.name', undefined, APP_NAME)
    const bodyWrap = el('div', 'sh-panel__body sh-stack', wrap)
    const line = el('p', undefined, bodyWrap)
    line.textContent = say('common.error', { error: message }, `Error: ${message}`)
    const retry = button(say('common.retry', undefined, 'Reload'), bodyWrap, 'sh-btn sh-btn--primary')
    retry.addEventListener('click', () => {
      window.location.reload()
    })
    // A panel nobody can reach is a panel nobody can read.
    retry.autofocus = true
    window.setTimeout(() => retry.focus(), 0)
  } catch {
    // Even the panel failed. The document at least says why.
    root.textContent = `Sprout Hollow could not start: ${message}`
  }
}

/* -------------------------------------------------------------------------- *
 * Entry
 * -------------------------------------------------------------------------- */

if (typeof document !== 'undefined') {
  void start().catch(() => undefined)
}
