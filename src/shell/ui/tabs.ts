/**
 * The tab strip.
 *
 * A real `tablist` of real `tab`s over real `tabpanel`s: `aria-selected`,
 * `aria-controls`, and a roving tabindex so Tab enters the strip exactly once and
 * the arrow keys move within it. Home and End jump to the ends,
 * `Ctrl+Shift+Left/Right` reorders — the same reorder the mouse does by dragging —
 * Delete closes, and Shift+F10 or the Menu key opens the same menu the right
 * button does. Activation is manual: arrows move focus, Enter or Space selects,
 * because the Farm tab hosts a running game loop and walking past it must not
 * start and stop it.
 *
 * Overflow is a scrolling strip plus a real overflow menu listing every tab you
 * cannot currently see — scrolled out, or folded into a collapsed group — and that
 * menu is searchable. Groups render as labelled, collapsible runs. Pinned tabs
 * shrink to an icon drawn in the game's own 5x7 face, with the full name still on
 * the tab for assistive technology. Closing a tab that holds unsaved work asks
 * first, every time, through the one guarded close path in `tabmodel.ts`.
 *
 * Every class here comes from `base.css`; this file names no colour and writes no
 * stylesheet. The only inline styles are layout ones with no design opinion.
 */

import { FONT_H, drawText, textWidth } from '../../engine/font'
import { PAL } from '../../engine/palette'
import { onLangChange, t } from '../core/i18n'
import { registerGroupLabel, registerTarget } from '../core/palette-registry'
import { OVERFLOW_SEARCH_FIELD_ID, createGroupSearch, createStripSearch } from './tabsearch'
import {
  DEFAULT_STRIP_ID,
  TAB_REVEAL_EVENT,
  closeOpenPopover,
  getStrip,
  groupLabel,
  messageKey,
  openMenu,
  openPopover,
  requestCloseTabs,
  stripLabel,
  tabAccessibleName,
  tabLabel,
  tabShortLabel,
  text,
} from './tabmodel'
import type { MenuItem, Tab, TabModel, TabRevealDetail } from './tabmodel'

export interface TabStripOptions {
  /** An existing model, or the strip id to look one up by. */
  model?: TabModel
  stripId?: string
}

export interface TabStrip {
  /** The strip itself, for the chrome row of the application grid. */
  readonly element: HTMLElement
  /** The panel host, for the main region of the application grid. */
  readonly panels: HTMLElement
  readonly model: TabModel
  /** Appends the strip and then the panels; use the two properties for a grid. */
  mount(container: HTMLElement): void
  /** The panel for a tab, created on first ask. */
  panelFor(tabId: string): HTMLElement
  setPanelContent(tabId: string, content: Node): void
  /** Closes through the guarded path: unsaved work is confirmed first. */
  requestClose(tabId: string): Promise<boolean>
  /** Moves focus onto the strip's current roving item. */
  focusStrip(): void
  destroy(): void
}

const KEY_ATTR = 'data-sh-key'
const TAB_ATTR = 'data-sh-tab'
const FOLDED_ATTR = 'data-sh-folded'

/** The reorder binding, quoted to the user as a fact rather than as prose. */
const REORDER_KEYS = 'Ctrl+Shift+Left / Ctrl+Shift+Right'

/** The palette group every tab registers itself under. */
const PALETTE_GROUP = 'tabs'
let paletteGroupNamed = false

export function createTabStrip(options: TabStripOptions = {}): TabStrip {
  const model = options.model ?? getStrip(options.stripId ?? DEFAULT_STRIP_ID)
  const uid = `sh-${model.id}`

  if (!paletteGroupNamed) {
    paletteGroupNamed = true
    try {
      registerGroupLabel(PALETTE_GROUP, 'palette.group.tabs')
    } catch {
      // A registry that will not take a label still takes the targets below.
    }
  }

  /* -- structure -- */

  const element = document.createElement('div')
  element.className = 'sh-tabstrip'

  const list = document.createElement('div')
  list.className = 'sh-tablist'
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-orientation', 'horizontal')

  const hint = document.createElement('span')
  hint.className = 'sh-visually-hidden'
  hint.id = `${uid}-hint`
  hint.textContent = t('tabs.reorder.hint', { keys: REORDER_KEYS })
  list.setAttribute('aria-describedby', hint.id)

  const dropLine = document.createElement('div')
  dropLine.className = 'sh-tab-dropline'
  dropLine.setAttribute('aria-hidden', 'true')

  const actions = document.createElement('div')
  actions.className = 'sh-tabstrip__actions'

  const searchButton = document.createElement('button')
  searchButton.type = 'button'
  searchButton.className = 'sh-btn'
  searchButton.setAttribute('aria-haspopup', 'dialog')

  const overflowButton = document.createElement('button')
  overflowButton.type = 'button'
  overflowButton.className = 'sh-btn'
  overflowButton.setAttribute('aria-haspopup', 'dialog')

  actions.append(searchButton, overflowButton)

  const live = document.createElement('div')
  live.className = 'sh-visually-hidden'
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')

  element.append(list, actions, hint, live)

  const panels = document.createElement('div')
  // Layout only: the host fills the main region so each panel can be full height.
  panels.style.height = '100%'
  panels.style.minHeight = '0'

  /* -- state -- */

  const panelMap = new Map<string, HTMLElement>()
  const targetDisposers = new Map<string, () => void>()
  const hiddenTabIds = new Set<string>()
  let rovingKey: string | null = null
  let draggingId: string | null = null
  let movingId: string | null = null
  let renamingGroupId: string | null = null
  let overflowFrame = 0
  let disposed = false

  const tabElementId = (tabId: string): string => `${uid}-tab-${tabId}`
  const panelElementId = (tabId: string): string => `${uid}-panel-${tabId}`
  const groupElementId = (groupId: string): string => `${uid}-group-${groupId}`
  const renameElementId = (groupId: string): string => `${uid}-rename-${groupId}`

  function announce(message: string): void {
    live.textContent = message
  }

  function attr(value: string): string {
    return value.replace(/["\\]/gu, '\\$&')
  }

  /** Folded away by its own collapsed group, and therefore not on screen. */
  function isFolded(tab: Tab): boolean {
    if (tab.groupId === null) return false
    const group = model.group(tab.groupId)
    return group?.collapsed === true && model.activeId() !== tab.id
  }

  /* -- panels -- */

  function panelFor(tabId: string): HTMLElement {
    const existing = panelMap.get(tabId)
    if (existing) return existing
    const tab = model.tab(tabId)
    const panel = document.createElement('div')
    panel.className = 'sh-tabpanel'
    panel.id = panelElementId(tabId)
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-label', t('tabs.panel.label', { title: tab ? tabLabel(tab) : tabId }))
    panel.tabIndex = 0
    panel.hidden = true
    panel.appendChild(emptyPanel(tabId))
    panelMap.set(tabId, panel)
    panels.appendChild(panel)
    return panel
  }

  /**
   * What a restored tab shows until whoever owns it fills it in. A tab can outlive
   * the feature that opened it, and an honest empty state with a working way out
   * beats an empty rectangle.
   */
  function emptyPanel(tabId: string): HTMLElement {
    const tab = model.tab(tabId)
    const title = tab ? tabLabel(tab) : tabId
    const wrap = document.createElement('div')
    wrap.className = 'sh-empty'
    const message = document.createElement('p')
    message.textContent = text('tabs.panel.empty', { title }, 'tabs.empty')
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'sh-btn'
    close.textContent = t('tabs.close', { title })
    close.addEventListener('click', () => {
      void requestClose(tabId)
    })
    wrap.append(message, close)
    return wrap
  }

  function setPanelContent(tabId: string, content: Node): void {
    const panel = panelFor(tabId)
    panel.textContent = ''
    panel.appendChild(content)
  }

  function syncPanels(): void {
    const ids = new Set(model.tabs().map((tab) => tab.id))
    for (const [tabId, panel] of panelMap) {
      if (ids.has(tabId)) continue
      panel.remove()
      panelMap.delete(tabId)
    }
    const activeId = model.activeId()
    for (const tab of model.tabs()) {
      const panel = panelFor(tab.id)
      panel.setAttribute('aria-label', t('tabs.panel.label', { title: tabLabel(tab) }))
      panel.hidden = tab.id !== activeId
    }
  }

  /* -- palette targets -- */

  function syncTargets(): void {
    const ids = new Set(model.tabs().map((tab) => tab.id))
    for (const [tabId, dispose] of targetDisposers) {
      if (ids.has(tabId)) continue
      dispose()
      targetDisposers.delete(tabId)
    }
    for (const tab of model.tabs()) {
      if (targetDisposers.has(tab.id)) continue
      try {
        targetDisposers.set(
          tab.id,
          registerTarget({
            id: `tab:${model.id}:${tab.id}`,
            titleKey: messageKey(tab.titleKey),
            group: PALETTE_GROUP,
            teleport: () => {
              reveal(tab.id)
            },
          }),
        )
      } catch {
        // A palette that is not accepting targets must not stop the strip drawing.
      }
    }
  }

  /* -- rendering -- */

  function items(): HTMLElement[] {
    return [...list.querySelectorAll<HTMLElement>(`[${KEY_ATTR}]:not([${FOLDED_ATTR}])`)]
  }

  function applyRoving(): void {
    const all = items()
    if (all.length === 0) return
    const activeId = model.activeId()
    const preferred = activeId === null ? null : `tab:${activeId}`
    const keys = all.map((el) => el.getAttribute(KEY_ATTR))
    let key = rovingKey
    if (key === null || !keys.includes(key)) {
      key = preferred !== null && keys.includes(preferred) ? preferred : (keys[0] ?? null)
    }
    rovingKey = key
    for (const el of all) el.tabIndex = el.getAttribute(KEY_ATTR) === key ? 0 : -1
  }

  /** The pinned tab's initials, in the game's own face, in the tab's own colour. */
  function paintIcon(canvas: HTMLCanvasElement, tab: Tab, host: HTMLElement): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const glyph = tabShortLabel(tab)
    const computed = typeof getComputedStyle === 'function' ? getComputedStyle(host).color : ''
    const x = Math.max(0, Math.round((canvas.width - textWidth(glyph)) / 2))
    const y = Math.round((canvas.height - FONT_H) / 2)
    drawText(ctx, glyph, x, y, computed.length > 0 ? computed : PAL.parchment)
  }

  function buildTab(tab: Tab, host: HTMLElement): HTMLElement {
    const selected = model.activeId() === tab.id
    const el = document.createElement('div')
    el.className = 'sh-tab'
    if (tab.pinned) el.classList.add('is-pinned')
    if (tab.dirty) el.classList.add('is-dirty')
    if (movingId === tab.id) el.classList.add('is-keyboard-moving')
    el.id = tabElementId(tab.id)
    el.setAttribute('role', 'tab')
    el.setAttribute('aria-selected', String(selected))
    el.setAttribute('aria-controls', panelElementId(tab.id))
    el.setAttribute('aria-label', tabAccessibleName(model, tab))
    el.setAttribute(KEY_ATTR, `tab:${tab.id}`)
    el.setAttribute(TAB_ATTR, tab.id)
    if (isFolded(tab)) el.setAttribute(FOLDED_ATTR, '')
    el.tabIndex = -1
    el.draggable = true

    if (tab.pinned) {
      const canvas = document.createElement('canvas')
      canvas.width = 16
      canvas.height = 16
      canvas.setAttribute('aria-hidden', 'true')
      canvas.style.imageRendering = 'pixelated'
      el.appendChild(canvas)
      paintIcon(canvas, tab, el)
    }

    const label = document.createElement('span')
    label.className = 'sh-tab__label'
    label.textContent = tabLabel(tab)
    el.appendChild(label)

    if (tab.closable) {
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'sh-tab__close'
      close.tabIndex = -1
      close.setAttribute('aria-label', t('tabs.close', { title: tabLabel(tab) }))
      const glyph = document.createElement('span')
      glyph.className = 'sh-glyph sh-glyph--close'
      glyph.setAttribute('aria-hidden', 'true')
      close.appendChild(glyph)
      close.addEventListener('click', (event) => {
        event.stopPropagation()
        void requestClose(tab.id)
      })
      el.appendChild(close)
    }

    el.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.sh-tab__close')) return
      model.activate(tab.id)
    })
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      openTabMenu(tab.id, el)
    })
    el.addEventListener('dragstart', (event) => {
      draggingId = tab.id
      el.classList.add('is-dragging')
      event.dataTransfer?.setData('text/plain', tab.id)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    })
    el.addEventListener('dragend', () => {
      draggingId = null
      el.classList.remove('is-dragging')
      dropLine.remove()
    })

    host.appendChild(el)
    return el
  }

  function buildGroupRun(groupId: string, tabs: readonly Tab[]): void {
    const group = model.group(groupId)
    if (!group) {
      for (const tab of tabs) buildTab(tab, list)
      return
    }
    const wrap = document.createElement('div')
    wrap.className = group.collapsed ? 'sh-tabgroup is-collapsed' : 'sh-tabgroup'
    wrap.id = groupElementId(groupId)
    wrap.setAttribute('role', 'presentation')
    if (group.color !== null) {
      // The group's own palette entry, read as a token rather than as a colour.
      wrap.style.boxShadow = `inset 0 0 0 var(--sh-px) var(--sh-color-${group.color})`
    }
    const name = groupLabel(group)

    if (renamingGroupId === groupId) {
      wrap.appendChild(buildRenameField(groupId, name))
    } else {
      const header = document.createElement('button')
      header.type = 'button'
      header.className = 'sh-tabgroup__label'
      header.textContent = name
      header.setAttribute('aria-expanded', String(!group.collapsed))
      header.setAttribute('aria-controls', wrap.id)
      header.setAttribute('aria-label', t('tabs.group.count', { group: name, count: tabs.length }))
      header.setAttribute(KEY_ATTR, `group:${groupId}`)
      header.tabIndex = -1
      header.addEventListener('click', () => {
        model.toggleCollapsed(groupId)
      })
      header.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        openGroupMenu(groupId, header)
      })
      wrap.appendChild(header)
    }

    for (const tab of tabs) buildTab(tab, wrap)
    list.appendChild(wrap)
  }

  function buildRenameField(groupId: string, name: string): HTMLElement {
    const wrap = document.createElement('span')
    const inputId = renameElementId(groupId)
    const label = document.createElement('label')
    label.className = 'sh-visually-hidden'
    label.htmlFor = inputId
    label.textContent = t('tabs.group.name.label')
    const input = document.createElement('input')
    input.type = 'text'
    input.id = inputId
    input.className = 'sh-input'
    input.value = name
    input.setAttribute(KEY_ATTR, `group:${groupId}`)

    const commit = (): void => {
      if (renamingGroupId !== groupId) return
      renamingGroupId = null
      model.renameGroup(groupId, input.value)
      const group = model.group(groupId)
      if (group) {
        announce(
          t('tabs.group.count', { group: groupLabel(group), count: model.tabsInGroup(groupId).length }),
        )
      }
      render()
    }
    const cancel = (): void => {
      if (renamingGroupId !== groupId) return
      renamingGroupId = null
      render()
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }
    })
    input.addEventListener('blur', commit)
    wrap.append(label, input)
    return wrap
  }

  function render(): void {
    if (disposed) return
    const focusKey = focusedKey()
    list.textContent = ''
    list.setAttribute('aria-label', stripLabel(model))

    const tabs = [...model.tabs()]
    let index = 0
    while (index < tabs.length) {
      const tab = tabs[index]
      if (tab === undefined) break
      if (tab.groupId === null) {
        buildTab(tab, list)
        index += 1
        continue
      }
      const groupId = tab.groupId
      const run: Tab[] = []
      while (index < tabs.length) {
        const next = tabs[index]
        if (next === undefined || next.groupId !== groupId) break
        run.push(next)
        index += 1
      }
      buildGroupRun(groupId, run)
    }

    hint.textContent = t('tabs.reorder.hint', { keys: REORDER_KEYS })
    searchButton.textContent = t('common.search')
    searchButton.setAttribute('aria-label', t('search.tabs.strip.label'))

    applyRoving()
    syncPanels()
    syncTargets()
    if (focusKey !== null) {
      list.querySelector<HTMLElement>(`[${KEY_ATTR}="${attr(focusKey)}"]`)?.focus()
    }
    updateOverflow()
  }

  function focusedKey(): string | null {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !element.contains(active)) return null
    const owner = active.closest(`[${KEY_ATTR}]`)
    return owner instanceof HTMLElement ? owner.getAttribute(KEY_ATTR) : null
  }

  /* -- overflow -- */

  function updateOverflow(): void {
    hiddenTabIds.clear()
    const bounds = list.getBoundingClientRect()
    for (const tab of model.tabs()) {
      if (isFolded(tab)) {
        hiddenTabIds.add(tab.id)
        continue
      }
      const el = list.querySelector<HTMLElement>(`[${TAB_ATTR}="${attr(tab.id)}"]`)
      if (!el) {
        hiddenTabIds.add(tab.id)
        continue
      }
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) hiddenTabIds.add(tab.id)
    }

    const count = hiddenTabIds.size
    if (count === 0 && overflowButton.contains(document.activeElement)) searchButton.focus()
    overflowButton.hidden = count === 0
    overflowButton.textContent = t('tabs.overflow', { count })
    overflowButton.setAttribute('aria-label', t('tabs.overflow.label'))
  }

  function scheduleOverflow(): void {
    if (overflowFrame !== 0 || typeof window === 'undefined') return
    overflowFrame = window.requestAnimationFrame(() => {
      overflowFrame = 0
      if (!disposed) updateOverflow()
    })
  }

  /* -- popovers and menus -- */

  function openSearchPopover(
    anchor: HTMLElement,
    label: string,
    build: (close: () => void) => { element: HTMLElement; focus(): void; destroy(): void },
  ): void {
    let surface: { destroy(): void } | null = null
    openPopover(anchor, {
      label,
      build(pop) {
        const made = build(() => {
          pop.close()
        })
        surface = made
        pop.element.appendChild(made.element)
        made.focus()
      },
      onClose: () => {
        surface?.destroy()
        surface = null
      },
    })
  }

  function openStripSearch(): void {
    openSearchPopover(searchButton, t('search.tabs.strip.label'), (close) =>
      createStripSearch(model, { onPick: close }),
    )
  }

  function openOverflow(): void {
    // The overflow menu is the strip search narrowed to what you cannot see, so it
    // is one surface with one behaviour rather than a second, weaker list.
    openSearchPopover(overflowButton, t('tabs.overflow.label'), (close) =>
      createStripSearch(model, {
        fieldId: OVERFLOW_SEARCH_FIELD_ID,
        labelKey: 'tabs.overflow.label',
        filter: (record) => hiddenTabIds.has(record.tabId),
        onPick: close,
      }),
    )
  }

  function openGroupSearch(groupId: string): void {
    const group = model.group(groupId)
    if (!group) return
    const anchor =
      list.querySelector<HTMLElement>(`[${KEY_ATTR}="${attr(`group:${groupId}`)}"]`) ?? searchButton
    // Each group's field carries its own catalogue id, `tabs.group.<groupId>`, and
    // its own builder state, so two groups never share a query.
    openSearchPopover(anchor, t('search.tabs.group.label', { group: groupLabel(group) }), () =>
      createGroupSearch(model, groupId),
    )
  }

  function startRename(groupId: string): void {
    renamingGroupId = groupId
    render()
    list.querySelector<HTMLInputElement>(`#${CSS.escape(renameElementId(groupId))}`)?.focus()
  }

  function announceGroup(groupId: string): void {
    const group = model.group(groupId)
    if (!group) return
    announce(t('tabs.group.count', { group: groupLabel(group), count: model.tabsInGroup(groupId).length }))
  }

  function groupMenuItems(groupId: string): MenuItem[] {
    const group = model.group(groupId)
    if (!group) return []
    const name = groupLabel(group)
    const tabs = model.tabsInGroup(groupId)
    return [
      {
        label: group.collapsed ? t('tabs.group.expand', { group: name }) : t('tabs.group.collapse', { group: name }),
        checked: !group.collapsed,
        onSelect: () => {
          model.toggleCollapsed(groupId)
        },
      },
      {
        label: t('tabs.group.rename', { group: name }),
        onSelect: () => {
          startRename(groupId)
        },
      },
      {
        label: t('search.tabs.group.label', { group: name }),
        onSelect: () => {
          openGroupSearch(groupId)
        },
      },
      {
        label: t('tabs.closeAll'),
        disabled: tabs.every((tab) => !tab.closable),
        onSelect: () => {
          void closeMany(tabs.map((tab) => tab.id))
        },
      },
    ]
  }

  function openGroupMenu(groupId: string, anchor: HTMLElement): void {
    const group = model.group(groupId)
    if (!group) return
    openMenu(anchor, t('tabs.group.label', { group: groupLabel(group) }), groupMenuItems(groupId))
  }

  function openTabMenu(tabId: string, anchor: HTMLElement): void {
    const tab = model.tab(tabId)
    if (!tab) return
    const title = tabLabel(tab)
    const ordered = model.tabs()
    const position = model.indexOf(tabId)
    const others = ordered.filter((entry) => entry.id !== tabId && entry.closable)
    const toTheRight = ordered.slice(position + 1).filter((entry) => entry.closable)
    const menuItems: MenuItem[] = [
      {
        label: tab.pinned ? t('tabs.unpin', { title }) : t('tabs.pin', { title }),
        checked: tab.pinned,
        onSelect: () => {
          model.setPinned(tabId, !tab.pinned)
          announce(t('tabs.reordered', { title, position: model.indexOf(tabId) + 1 }))
        },
      },
      {
        label: t('tabs.moveLeft', { title }),
        disabled: position <= 0,
        onSelect: () => {
          keyboardReorder(tabId, -1)
        },
      },
      {
        label: t('tabs.moveRight', { title }),
        disabled: position < 0 || position >= ordered.length - 1,
        onSelect: () => {
          keyboardReorder(tabId, 1)
        },
      },
      {
        label: t('tabs.close', { title }),
        disabled: !tab.closable,
        onSelect: () => {
          void requestClose(tabId)
        },
      },
      {
        label: t('tabs.closeOthers'),
        disabled: others.length === 0,
        onSelect: () => {
          void closeMany(others.map((entry) => entry.id))
        },
      },
      {
        label: t('tabs.closeRight'),
        disabled: toTheRight.length === 0,
        onSelect: () => {
          void closeMany(toTheRight.map((entry) => entry.id))
        },
      },
      {
        label: t('tabs.group.new'),
        onSelect: () => {
          const group = model.createGroup({ name: title })
          model.assignGroup(tabId, group.id)
          announceGroup(group.id)
        },
      },
    ]
    for (const group of model.groups()) {
      if (group.id === tab.groupId) continue
      const groupName = groupLabel(group)
      menuItems.push({
        label: t('tabs.group.addTo', { title, group: groupName }),
        onSelect: () => {
          model.assignGroup(tabId, group.id)
          announceGroup(group.id)
        },
      })
    }
    if (tab.groupId !== null) {
      const groupId = tab.groupId
      const group = model.group(groupId)
      menuItems.push({
        label: t('tabs.group.remove', { title, group: group ? groupLabel(group) : '' }),
        onSelect: () => {
          model.assignGroup(tabId, null)
          announce(t('tabs.reordered', { title, position: model.indexOf(tabId) + 1 }))
        },
      })
      menuItems.push(...groupMenuItems(groupId))
    }
    menuItems.push({
      label: t('search.tabs.strip.label'),
      onSelect: openStripSearch,
    })
    openMenu(anchor, title, menuItems)
  }

  /* -- closing -- */

  async function requestClose(tabId: string): Promise<boolean> {
    const tab = model.tab(tabId)
    if (!tab) return false
    const title = tabLabel(tab)
    const outcome = await requestCloseTabs(model, [tabId])
    const closed = outcome.closed.length > 0
    announce(closed ? t('tabs.closed', { title }) : t('tabs.unsaved.keep'))
    return closed
  }

  async function closeMany(ids: readonly string[]): Promise<number> {
    const outcome = await requestCloseTabs(model, ids)
    announce(
      outcome.closed.length === 0
        ? t('tabs.unsaved.keep')
        : t('tabs.close.done', { count: outcome.closed.length }),
    )
    return outcome.closed.length
  }

  /* -- keyboard -- */

  function focusItem(delta: number, absolute?: 'first' | 'last'): void {
    const all = items()
    if (all.length === 0) return
    let next: HTMLElement | undefined
    if (absolute === 'first') next = all[0]
    else if (absolute === 'last') next = all[all.length - 1]
    else {
      const current = all.findIndex((el) => el === document.activeElement)
      const from = current < 0 ? all.findIndex((el) => el.getAttribute(KEY_ATTR) === rovingKey) : current
      const base = from < 0 ? 0 : from
      next = all[(base + delta + all.length) % all.length]
    }
    if (!next) return
    rovingKey = next.getAttribute(KEY_ATTR)
    applyRoving()
    next.focus()
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /**
   * Keyboard reorder, matching what a drag does: inside a group you move within
   * the run, and the step that would carry you past its edge takes you out of the
   * group instead. Stepping into a neighbouring run joins it. Pinned and unpinned
   * tabs never swap places.
   */
  function keyboardReorder(tabId: string, dir: -1 | 1): void {
    const tabs = model.tabs()
    const from = model.indexOf(tabId)
    const tab = tabs[from]
    if (tab === undefined) return
    const title = tabLabel(tab)
    const neighbour = tabs[from + dir]
    if (neighbour === undefined || neighbour.pinned !== tab.pinned) {
      announce(text('tabs.move.blocked', { title }, 'tabs.pinned.badge'))
      return
    }
    movingId = tabId
    if (tab.groupId !== null && neighbour.groupId !== tab.groupId) {
      const groupId = tab.groupId
      model.assignGroup(tabId, null)
      announceGroup(groupId)
      return
    }
    if (tab.groupId === null && neighbour.groupId !== null) {
      const groupId = neighbour.groupId
      model.assignGroup(tabId, groupId)
      announceGroup(groupId)
      return
    }
    model.move(tabId, from + dir)
    announce(t('tabs.reordered', { title, position: model.indexOf(tabId) + 1 }))
  }

  function keyOf(target: EventTarget | null): { kind: 'tab' | 'group'; id: string } | null {
    if (!(target instanceof HTMLElement)) return null
    const owner = target.closest(`[${KEY_ATTR}]`)
    const key = owner instanceof HTMLElement ? owner.getAttribute(KEY_ATTR) : null
    if (key === null) return null
    const [kind, ...rest] = key.split(':')
    if (kind === 'tab' || kind === 'group') return { kind, id: rest.join(':') }
    return null
  }

  /** Marks the tab being walked along the strip, and clears the mark when you stop. */
  function setMoving(tabId: string | null): void {
    if (movingId === tabId) return
    movingId = tabId
    render()
  }

  list.addEventListener('keydown', (event) => {
    // A group being renamed owns its own arrows, Home, End and Escape.
    if (event.target instanceof HTMLInputElement) return
    const target = keyOf(event.target)
    const reordering =
      event.ctrlKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    const modifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)
    if (!reordering && !modifier) setMoving(null)
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        const dir = event.key === 'ArrowRight' ? 1 : -1
        if (event.ctrlKey && event.shiftKey) {
          if (target?.kind !== 'tab') return
          event.preventDefault()
          keyboardReorder(target.id, dir)
          return
        }
        if (event.ctrlKey || event.altKey || event.metaKey) return
        event.preventDefault()
        focusItem(dir)
        return
      }
      case 'Home':
        event.preventDefault()
        focusItem(0, 'first')
        return
      case 'End':
        event.preventDefault()
        focusItem(0, 'last')
        return
      case 'Enter':
      case ' ':
      case 'Spacebar':
        if (target?.kind !== 'tab') return
        event.preventDefault()
        model.activate(target.id)
        return
      case 'Delete':
        if (target?.kind !== 'tab') return
        event.preventDefault()
        void requestClose(target.id)
        return
      case 'F2':
        if (target?.kind !== 'group') return
        event.preventDefault()
        startRename(target.id)
        return
      case 'F10':
      case 'ContextMenu': {
        if (event.key === 'F10' && !event.shiftKey) return
        if (target === null) return
        const anchor = list.querySelector<HTMLElement>(
          `[${KEY_ATTR}="${attr(`${target.kind}:${target.id}`)}"]`,
        )
        if (!anchor) return
        event.preventDefault()
        if (target.kind === 'tab') openTabMenu(target.id, anchor)
        else openGroupMenu(target.id, anchor)
        return
      }
      default:
        return
    }
  })

  list.addEventListener('focusin', (event) => {
    const key = keyOf(event.target)
    if (key === null) return
    rovingKey = `${key.kind}:${key.id}`
    applyRoving()
  })

  list.addEventListener('focusout', (event) => {
    const next = event.relatedTarget
    if (next instanceof Node && list.contains(next)) return
    setMoving(null)
  })

  /* -- drag reorder -- */

  /** Where a drop at this x would land, in model order, and which group it joins. */
  function dropTargetFor(clientX: number): { index: number; groupId: string | null } {
    const tabs = model.tabs()
    let index = tabs.length
    for (const el of list.querySelectorAll<HTMLElement>(`[${TAB_ATTR}]`)) {
      const id = el.getAttribute(TAB_ATTR)
      if (id === null) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (clientX < rect.left + rect.width / 2) {
        index = model.indexOf(id)
        break
      }
    }
    const before = tabs[index - 1]
    const after = tabs[index]
    // Only the inside of a run counts as joining it; either edge means ungrouped.
    const groupId =
      before !== undefined && after !== undefined && before.groupId !== null && before.groupId === after.groupId
        ? before.groupId
        : null
    return { index, groupId }
  }

  list.addEventListener('dragover', (event) => {
    if (draggingId === null) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const { index } = dropTargetFor(event.clientX)
    const target = model.tabs()[index]
    const anchor =
      target === undefined
        ? null
        : list.querySelector<HTMLElement>(`[${TAB_ATTR}="${attr(target.id)}"]`)
    if (anchor?.parentElement) anchor.parentElement.insertBefore(dropLine, anchor)
    else list.appendChild(dropLine)
  })

  list.addEventListener('dragleave', (event) => {
    if (event.target === list) dropLine.remove()
  })

  list.addEventListener('drop', (event) => {
    if (draggingId === null) return
    event.preventDefault()
    dropLine.remove()
    const id = draggingId
    draggingId = null
    const tab = model.tab(id)
    const from = model.indexOf(id)
    const { index, groupId } = dropTargetFor(event.clientX)
    model.move(id, from < index ? index - 1 : index, { groupId })
    if (tab) {
      announce(t('tabs.reordered', { title: tabLabel(tab), position: model.indexOf(id) + 1 }))
    }
  })

  /* -- wiring -- */

  searchButton.addEventListener('click', openStripSearch)
  overflowButton.addEventListener('click', openOverflow)

  function reveal(tabId: string): void {
    const tab = model.tab(tabId)
    if (!tab) return
    if (tab.groupId !== null) {
      const group = model.group(tab.groupId)
      if (group?.collapsed) model.setCollapsed(group.id, false)
    }
    model.activate(tabId)
    closeOpenPopover()
    const el = list.querySelector<HTMLElement>(`#${CSS.escape(tabElementId(tabId))}`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    el?.focus()
  }

  const onReveal = (event: Event): void => {
    const detail = (event as CustomEvent<TabRevealDetail>).detail
    if (detail?.stripId !== model.id) return
    reveal(detail.tabId)
  }
  document.addEventListener(TAB_REVEAL_EVENT, onReveal)

  const unsubscribeModel = model.subscribe(() => {
    render()
    const activeId = model.activeId()
    if (activeId === null) return
    list
      .querySelector<HTMLElement>(`#${CSS.escape(tabElementId(activeId))}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const stopLang = onLangChange(render)

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleOverflow) : null
  observer?.observe(list)
  list.addEventListener('scroll', scheduleOverflow, { passive: true })
  window.addEventListener('resize', scheduleOverflow)

  render()

  return {
    element,
    panels,
    model,
    mount(container: HTMLElement): void {
      container.append(element, panels)
      render()
    },
    panelFor,
    setPanelContent,
    requestClose,
    focusStrip(): void {
      const all = items()
      const item = all.find((el) => el.getAttribute(KEY_ATTR) === rovingKey) ?? all[0]
      item?.focus()
    },
    destroy(): void {
      disposed = true
      unsubscribeModel()
      stopLang()
      observer?.disconnect()
      list.removeEventListener('scroll', scheduleOverflow)
      window.removeEventListener('resize', scheduleOverflow)
      document.removeEventListener(TAB_REVEAL_EVENT, onReveal)
      if (overflowFrame !== 0) window.cancelAnimationFrame(overflowFrame)
      for (const dispose of targetDisposers.values()) dispose()
      targetDisposers.clear()
      closeOpenPopover()
      for (const panel of panelMap.values()) panel.remove()
      panelMap.clear()
      panels.remove()
      element.remove()
    },
  }
}
