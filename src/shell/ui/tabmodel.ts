/**
 * The tab state, and the primitives the rest of the tabs lane is built from.
 *
 * Two halves, kept apart on purpose:
 *
 *  1. **The model.** Ordered tabs, named groups, one active tab, persisted through
 *     `core/store.ts` in the `TabState` shape that store already publishes, and
 *     restored on boot. Pure data — every function in this half runs without a
 *     `document`.
 *  2. **The lane primitives.** The i18n helper for keys that arrive as data, the
 *     anchored popover and menu, and the single confirm-guarded close path.
 *     `tabs.ts` and `tabsearch.ts` both need these, and putting them here keeps the
 *     lane acyclic: tabmodel <- tabsearch <- tabs.
 *
 * Ordering invariant, enforced after every mutation: pinned tabs sort ahead of
 * unpinned ones and can never be reordered behind them, and the members of a group
 * stay contiguous.
 *
 * All appearance comes from `base.css` and `tokens.css`; this lane writes no CSS
 * and names no colour.
 */

import { hasKey, t } from '../core/i18n'
import type { StringKey } from '../core/i18n'
import { confirm } from './notify'
import {
  get as storeGet,
  load as storeLoad,
  save as storeSave,
  subscribe as storeSubscribe,
} from '../core/store'
import type { TabGroup as StoredGroup, TabRecord as StoredTab, TabState } from '../core/store'

/* ------------------------------------------------------------------------- *
 * i18n
 * ------------------------------------------------------------------------- */

/**
 * For keys that arrive as data rather than as literals — a tab carries its own
 * title key, and the app that opened it chose that key. A key the catalogue does
 * not know falls back to `fallback` if one is given, and only then to the id
 * itself, which is visible and fixable rather than silently blank. Literal keys
 * elsewhere in this lane go straight to `t()` so a typo is a compile error.
 */
export function text(
  key: string,
  params?: Record<string, string | number>,
  fallback?: StringKey,
): string {
  if (hasKey(key)) return t(key, params)
  if (fallback !== undefined) return t(fallback, params)
  return key
}

/** The one place a data-supplied key is narrowed for an API that wants a `StringKey`. */
export function messageKey(id: string): StringKey {
  return id as StringKey
}

/* ------------------------------------------------------------------------- *
 * Model types
 * ------------------------------------------------------------------------- */

export interface Tab {
  readonly id: string
  /** Which panel to build. Owned by whoever opened the tab; the strip only carries it. */
  readonly kind: string
  /** i18n key for the visible label. */
  readonly titleKey: string
  /** Facts inside the label, never rewritten by the funny level. */
  readonly titleParams?: Readonly<Record<string, string | number>>
  readonly groupId: string | null
  readonly pinned: boolean
  readonly closable: boolean
  /** Unsaved work. Closing asks first. Belongs to this run, never to the store. */
  readonly dirty: boolean
}

export interface TabGroup {
  readonly id: string
  /** i18n key for a group the app named. */
  readonly nameKey: string | null
  /** A name the user typed. Data, not a translatable string, so it wins when set. */
  readonly name: string | null
  readonly collapsed: boolean
  /** A `PaletteName`, resolved to a token by the strip. */
  readonly color: string | null
}

export interface TabInit {
  id: string
  titleKey: string
  kind?: string
  titleParams?: Record<string, string | number>
  groupId?: string | null
  pinned?: boolean
  closable?: boolean
  dirty?: boolean
}

export interface OpenOptions {
  /** Activate the tab once it exists. Defaults to true for a newly opened tab. */
  activate?: boolean
  /** Where to insert a newly opened tab. Clamped into the legal partition. */
  index?: number
}

export const DEFAULT_STRIP_ID = 'main'

/** The label shown for a group the app has not named and the user has not renamed. */
const UNTITLED_GROUP_KEY = 'tabs.group.new'

const MAX_NAME_LENGTH = 240

/* ------------------------------------------------------------------------- *
 * Defensive reading of stored data
 * ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function params(value: unknown): Record<string, string | number> | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, string | number> = {}
  let n = 0
  for (const [key, raw] of Object.entries(value)) {
    if (n >= 24) break
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw
    else if (typeof raw === 'string') out[key] = raw.slice(0, MAX_NAME_LENGTH)
    else continue
    n += 1
  }
  return n === 0 ? undefined : out
}

/**
 * The store sanitises what it reads, but it cannot know this lane's rules: ids are
 * unique, a tab points at a group that exists, and the active tab is one of them.
 * Nothing here throws, and a bad entry costs only itself.
 */
export function normalizeTabState(raw: unknown): TabState {
  const state: TabState = { tabs: [], groups: [], activeId: null }
  if (!isRecord(raw)) return state

  const groupIds = new Set<string>()
  for (const entry of Array.isArray(raw.groups) ? raw.groups : []) {
    if (!isRecord(entry)) continue
    const id = optionalId(entry.id)
    if (id === null || groupIds.has(id)) continue
    groupIds.add(id)
    const group: StoredGroup = { id, collapsed: entry.collapsed === true }
    if (typeof entry.nameKey === 'string') group.nameKey = entry.nameKey
    if (typeof entry.name === 'string') group.name = entry.name.slice(0, MAX_NAME_LENGTH)
    if (typeof entry.color === 'string') group.color = entry.color
    state.groups.push(group)
  }

  const tabIds = new Set<string>()
  for (const entry of Array.isArray(raw.tabs) ? raw.tabs : []) {
    if (!isRecord(entry)) continue
    const id = optionalId(entry.id)
    if (id === null || tabIds.has(id)) continue
    tabIds.add(id)
    const groupId = optionalId(entry.groupId)
    const tab: StoredTab = {
      id,
      kind: typeof entry.kind === 'string' ? entry.kind : id,
      titleKey: typeof entry.titleKey === 'string' ? entry.titleKey : id,
      groupId: groupId !== null && groupIds.has(groupId) ? groupId : null,
      pinned: entry.pinned === true,
      closable: entry.closable !== false,
    }
    const titleParams = params(entry.titleParams)
    if (titleParams) tab.titleParams = titleParams
    state.tabs.push(tab)
  }

  const activeId = optionalId(raw.activeId)
  state.activeId = activeId !== null && tabIds.has(activeId) ? activeId : null
  return state
}

/* ------------------------------------------------------------------------- *
 * The model
 * ------------------------------------------------------------------------- */

function freezeTab(tab: Tab): Tab {
  return Object.freeze({ ...tab })
}

function freezeGroup(group: TabGroup): TabGroup {
  return Object.freeze({ ...group })
}

function clamp(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

export type TabModelListener = (model: TabModel) => void

export class TabModel {
  readonly id: string
  /** i18n key naming this strip; search results quote it. */
  readonly nameKey: string

  private tabList: Tab[] = []
  private groupList: TabGroup[] = []
  private active: string | null = null
  private readonly listeners = new Set<TabModelListener>()
  private restored = false
  private groupSeq = 0

  constructor(id: string, nameKey: string) {
    this.id = id
    this.nameKey = nameKey
  }

  /* -- reads -- */

  tabs(): readonly Tab[] {
    return this.tabList
  }

  groups(): readonly TabGroup[] {
    return this.groupList
  }

  activeId(): string | null {
    return this.active
  }

  tab(id: string): Tab | undefined {
    return this.tabList.find((entry) => entry.id === id)
  }

  group(id: string): TabGroup | undefined {
    return this.groupList.find((entry) => entry.id === id)
  }

  /** The tabs of one group, in strip order. */
  tabsInGroup(groupId: string): Tab[] {
    return this.tabList.filter((entry) => entry.groupId === groupId)
  }

  indexOf(id: string): number {
    return this.tabList.findIndex((entry) => entry.id === id)
  }

  /* -- writes -- */

  /** Idempotent: opening an id that already exists refreshes it and keeps its place. */
  open(init: TabInit, opts: OpenOptions = {}): Tab {
    const existing = this.tab(init.id)
    if (existing) {
      const merged = freezeTab({
        ...existing,
        kind: init.kind ?? existing.kind,
        titleKey: init.titleKey,
        ...(init.titleParams ? { titleParams: init.titleParams } : {}),
        ...(init.closable === undefined ? {} : { closable: init.closable }),
      })
      this.tabList[this.indexOf(init.id)] = merged
      if (opts.activate === true) this.active = merged.id
      this.changed()
      return merged
    }
    const tab = freezeTab({
      id: init.id,
      kind: init.kind ?? init.id,
      titleKey: init.titleKey,
      ...(init.titleParams ? { titleParams: init.titleParams } : {}),
      groupId: init.groupId ?? null,
      pinned: init.pinned ?? false,
      closable: init.closable ?? true,
      dirty: init.dirty ?? false,
    })
    const at = opts.index === undefined ? this.tabList.length : clamp(opts.index, 0, this.tabList.length)
    this.tabList.splice(at, 0, tab)
    if (tab.groupId !== null && !this.group(tab.groupId)) {
      this.groupList.push(
        freezeGroup({ id: tab.groupId, nameKey: UNTITLED_GROUP_KEY, name: null, collapsed: false, color: null }),
      )
    }
    if (opts.activate !== false || this.active === null) this.active = tab.id
    this.changed()
    return tab
  }

  /**
   * Removes the tab outright. Callers that can lose work go through
   * {@link requestCloseTabs}, which asks first.
   */
  close(id: string): boolean {
    const index = this.indexOf(id)
    if (index < 0) return false
    this.tabList.splice(index, 1)
    if (this.active === id) this.active = this.neighbourId(index)
    this.pruneGroups()
    this.changed()
    return true
  }

  activate(id: string): boolean {
    if (this.active === id) return true
    if (!this.tab(id)) return false
    this.active = id
    this.changed()
    return true
  }

  /**
   * Absolute move. `toIndex` is an insertion point in the list *with this tab
   * already lifted out*, so `reorder(id, +1)` swaps with the right-hand neighbour.
   * The destination is clamped into the tab's own pinned partition, so an unpinned
   * tab can never be moved ahead of a pinned one and vice versa. Pass `groupId` to
   * adopt or leave a group in the same gesture, which is what dragging into or out
   * of a group run means.
   */
  move(id: string, toIndex: number, opts: { groupId?: string | null } = {}): boolean {
    const from = this.indexOf(id)
    if (from < 0) return false
    const current = this.tabList[from]
    if (current === undefined) return false
    const wanted = opts.groupId === undefined ? current.groupId : opts.groupId
    const groupId = wanted !== null && this.group(wanted) ? wanted : null
    const moving = freezeTab({ ...current, groupId })
    this.tabList.splice(from, 1)
    const [lo, hi] = this.partitionBounds(moving.pinned)
    this.tabList.splice(clamp(toIndex, lo, hi), 0, moving)
    this.pruneGroups()
    this.changed()
    return true
  }

  /** Relative move by whole positions. Used by `Ctrl+Shift+Left/Right`. */
  reorder(id: string, delta: number): boolean {
    const from = this.indexOf(id)
    if (from < 0) return false
    return this.move(id, from + delta)
  }

  setPinned(id: string, pinned: boolean): boolean {
    const index = this.indexOf(id)
    const current = this.tabList[index]
    if (current === undefined || current.pinned === pinned) return false
    this.tabList[index] = freezeTab({ ...current, pinned })
    this.changed()
    return true
  }

  setDirty(id: string, dirty: boolean): boolean {
    const index = this.indexOf(id)
    const current = this.tabList[index]
    if (current === undefined || current.dirty === dirty) return false
    this.tabList[index] = freezeTab({ ...current, dirty })
    this.changed()
    return true
  }

  setTitle(id: string, titleKey: string, titleParams?: Record<string, string | number>): boolean {
    const index = this.indexOf(id)
    const current = this.tabList[index]
    if (current === undefined) return false
    this.tabList[index] = freezeTab({ ...current, titleKey, titleParams })
    this.changed()
    return true
  }

  /** Moves a tab into a group, or out of every group with `null`. */
  assignGroup(id: string, groupId: string | null): boolean {
    const index = this.indexOf(id)
    const current = this.tabList[index]
    if (current === undefined) return false
    const target = groupId !== null && this.group(groupId) ? groupId : null
    if (current.groupId === target) return false
    this.tabList[index] = freezeTab({ ...current, groupId: target })
    this.pruneGroups()
    this.changed()
    return true
  }

  createGroup(
    opts: { id?: string; nameKey?: string; name?: string; color?: string } = {},
  ): TabGroup {
    let id = opts.id
    if (id === undefined || this.group(id)) {
      do {
        this.groupSeq += 1
        id = `${this.id}-group-${this.groupSeq}`
      } while (this.group(id))
    }
    const group = freezeGroup({
      id,
      nameKey: opts.nameKey ?? UNTITLED_GROUP_KEY,
      name: opts.name ?? null,
      collapsed: false,
      color: opts.color ?? null,
    })
    this.groupList.push(group)
    this.changed()
    return group
  }

  /** The user's own name. An empty one clears it and the group falls back to its key. */
  renameGroup(groupId: string, name: string): boolean {
    const index = this.groupList.findIndex((entry) => entry.id === groupId)
    const current = this.groupList[index]
    if (current === undefined) return false
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
    this.groupList[index] = freezeGroup({ ...current, name: trimmed.length === 0 ? null : trimmed })
    this.changed()
    return true
  }

  /** The translatable name, for groups the app creates rather than the user. */
  setGroupTitleKey(groupId: string, nameKey: string): boolean {
    const index = this.groupList.findIndex((entry) => entry.id === groupId)
    const current = this.groupList[index]
    if (current === undefined) return false
    this.groupList[index] = freezeGroup({ ...current, nameKey })
    this.changed()
    return true
  }

  setCollapsed(groupId: string, collapsed: boolean): boolean {
    const index = this.groupList.findIndex((entry) => entry.id === groupId)
    const current = this.groupList[index]
    if (current === undefined || current.collapsed === collapsed) return false
    this.groupList[index] = freezeGroup({ ...current, collapsed })
    if (collapsed) {
      // Never leave the selection folded away when somewhere else can hold it. If
      // nowhere can, the run keeps showing its selected tab and nothing is lost.
      const activeTab = this.active === null ? undefined : this.tab(this.active)
      if (activeTab && activeTab.groupId === groupId) {
        const outside = this.tabList.find((entry) => entry.groupId !== groupId)
        if (outside) this.active = outside.id
      }
    }
    this.changed()
    return true
  }

  toggleCollapsed(groupId: string): boolean {
    const group = this.group(groupId)
    if (!group) return false
    return this.setCollapsed(groupId, !group.collapsed)
  }

  /** Drops the group; its tabs survive, ungrouped and in place. */
  ungroup(groupId: string): boolean {
    if (!this.group(groupId)) return false
    this.tabList = this.tabList.map((entry) =>
      entry.groupId === groupId ? freezeTab({ ...entry, groupId: null }) : entry,
    )
    this.groupList = this.groupList.filter((entry) => entry.id !== groupId)
    this.changed()
    return true
  }

  /* -- plumbing -- */

  subscribe(fn: TabModelListener): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Exactly the `TabState` the store persists. */
  snapshot(): TabState {
    return {
      tabs: this.tabList.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        titleKey: entry.titleKey,
        ...(entry.titleParams ? { titleParams: { ...entry.titleParams } } : {}),
        groupId: entry.groupId,
        pinned: entry.pinned,
        closable: entry.closable,
      })),
      groups: this.groupList.map((entry) => ({
        id: entry.id,
        ...(entry.nameKey === null ? {} : { nameKey: entry.nameKey }),
        ...(entry.name === null ? {} : { name: entry.name }),
        collapsed: entry.collapsed,
        ...(entry.color === null ? {} : { color: entry.color }),
      })),
      activeId: this.active,
    }
  }

  /**
   * Folds stored state in without discarding anything already opened this boot:
   * stored tabs supply order, pinning and grouping, live tabs supply fresh titles,
   * and anything opened before the store answered keeps its place at the end.
   */
  applyPersisted(stored: TabState): void {
    const live = new Map(this.tabList.map((entry) => [entry.id, entry]))
    const tabs: Tab[] = []
    for (const record of stored.tabs) {
      const current = live.get(record.id)
      live.delete(record.id)
      tabs.push(
        freezeTab({
          id: record.id,
          kind: current?.kind ?? record.kind,
          titleKey: current?.titleKey ?? record.titleKey,
          ...(current?.titleParams
            ? { titleParams: current.titleParams }
            : record.titleParams
              ? { titleParams: record.titleParams }
              : {}),
          groupId: record.groupId,
          pinned: record.pinned,
          closable: current?.closable ?? record.closable,
          dirty: current?.dirty ?? false,
        }),
      )
    }
    for (const entry of this.tabList) if (live.has(entry.id)) tabs.push(entry)
    this.tabList = tabs

    const liveGroups = new Map(this.groupList.map((entry) => [entry.id, entry]))
    const groups: TabGroup[] = []
    for (const record of stored.groups) {
      const current = liveGroups.get(record.id)
      liveGroups.delete(record.id)
      groups.push(
        freezeGroup({
          id: record.id,
          nameKey: current?.nameKey ?? record.nameKey ?? UNTITLED_GROUP_KEY,
          name: record.name ?? null,
          collapsed: record.collapsed,
          color: record.color ?? current?.color ?? null,
        }),
      )
    }
    for (const entry of this.groupList) if (liveGroups.has(entry.id)) groups.push(entry)
    this.groupList = groups

    if (!this.restored && stored.activeId !== null && tabs.some((entry) => entry.id === stored.activeId)) {
      this.active = stored.activeId
    }
    this.restored = true
    this.changed({ persist: false })
  }

  private neighbourId(removedIndex: number): string | null {
    const after = this.tabList[removedIndex]
    if (after) return after.id
    const before = this.tabList[removedIndex - 1]
    return before ? before.id : null
  }

  private partitionBounds(pinned: boolean): [number, number] {
    const pinnedCount = this.tabList.filter((entry) => entry.pinned).length
    return pinned ? [0, pinnedCount] : [pinnedCount, this.tabList.length]
  }

  private pruneGroups(): void {
    this.groupList = this.groupList.filter((group) =>
      this.tabList.some((entry) => entry.groupId === group.id),
    )
    const ids = new Set(this.groupList.map((group) => group.id))
    this.tabList = this.tabList.map((entry) =>
      entry.groupId !== null && !ids.has(entry.groupId) ? freezeTab({ ...entry, groupId: null }) : entry,
    )
  }

  /** Pinned ahead of unpinned; group members contiguous; otherwise order is kept. */
  private normalize(): void {
    const rankOf = new Map<string, number>()
    this.tabList.forEach((tab, index) => {
      if (tab.groupId === null) return
      const key = `${tab.pinned ? 'p' : 'u'}:${tab.groupId}`
      if (!rankOf.has(key)) rankOf.set(key, index)
    })
    const decorated = this.tabList.map((tab, index) => {
      const key = tab.groupId === null ? null : `${tab.pinned ? 'p' : 'u'}:${tab.groupId}`
      return { tab, index, rank: key === null ? index : (rankOf.get(key) ?? index) }
    })
    decorated.sort((a, b) => {
      if (a.tab.pinned !== b.tab.pinned) return a.tab.pinned ? -1 : 1
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.index - b.index
    })
    this.tabList = decorated.map((entry) => entry.tab)
    if (this.active !== null && !this.tabList.some((entry) => entry.id === this.active)) {
      this.active = this.tabList[0]?.id ?? null
    }
  }

  private changed(opts: { persist?: boolean } = {}): void {
    this.normalize()
    if (opts.persist !== false) schedulePersist()
    for (const fn of [...this.listeners]) {
      try {
        fn(this)
      } catch {
        // One bad subscriber must not stop the rest of the shell from redrawing.
      }
    }
  }
}

/* ------------------------------------------------------------------------- *
 * The strip registry and persistence
 * ------------------------------------------------------------------------- */

const strips = new Map<string, TabModel>()
let hydrationStarted = false
let persistQueued = false
let lastWritten = ''

/** Every strip in the app, in creation order. The "all tabs" search walks this. */
export function allStrips(): readonly TabModel[] {
  return [...strips.values()]
}

/**
 * The strip with this id, created on first ask. `Persisted.tabs` holds one strip,
 * so the default strip is the persisted one and any further strip the app makes is
 * for this session only.
 */
export function getStrip(id: string = DEFAULT_STRIP_ID, nameKey = 'tabs.strip.label'): TabModel {
  const existing = strips.get(id)
  if (existing) return existing
  const model = new TabModel(id, nameKey)
  strips.set(id, model)
  if (id === DEFAULT_STRIP_ID) {
    try {
      model.applyPersisted(normalizeTabState(storeGet().tabs))
    } catch {
      // No readable record yet; the strip simply starts empty.
    }
  }
  if (!hydrationStarted) void initTabModels()
  return model
}

function adopt(stored: unknown): void {
  const next = normalizeTabState(stored)
  if (JSON.stringify(next) === lastWritten) return
  strips.get(DEFAULT_STRIP_ID)?.applyPersisted(next)
}

/**
 * Restore on boot. Safe to call more than once, and safe to call after tabs have
 * already been opened — `applyPersisted` merges rather than replaces.
 */
export async function initTabModels(): Promise<void> {
  hydrationStarted = true
  try {
    adopt(storeGet().tabs)
  } catch {
    // As below: an unreadable record leaves the shell on its defaults.
  }
  try {
    const persisted = await storeLoad()
    adopt(persisted.tabs)
    storeSubscribe((next) => {
      adopt(next.tabs)
    })
  } catch {
    // A store that cannot answer leaves a working app with no tabs restored,
    // which is a great deal better than no app at all.
  }
}

function schedulePersist(): void {
  if (persistQueued) return
  persistQueued = true
  const flush = (): void => {
    persistQueued = false
    persistNow()
  }
  if (typeof queueMicrotask === 'function') queueMicrotask(flush)
  else void Promise.resolve().then(flush)
}

function persistNow(): void {
  const model = strips.get(DEFAULT_STRIP_ID)
  if (!model) return
  const snapshot = model.snapshot()
  lastWritten = JSON.stringify(snapshot)
  try {
    void storeSave({ tabs: snapshot })
  } catch {
    // Persistence is best effort; losing the layout must never lose the session.
  }
}

/* ------------------------------------------------------------------------- *
 * Labels
 * ------------------------------------------------------------------------- */

export function tabLabel(tab: Tab): string {
  return text(tab.titleKey, tab.titleParams)
}

export function groupLabel(group: TabGroup): string {
  if (group.name !== null) return group.name
  return group.nameKey === null ? t(UNTITLED_GROUP_KEY) : text(group.nameKey, undefined, UNTITLED_GROUP_KEY)
}

export function stripLabel(model: TabModel): string {
  return text(model.nameKey, undefined, 'tabs.strip.label')
}

/** The one or two characters a pinned tab shows, derived from its label. */
export function tabShortLabel(tab: Tab): string {
  const label = tabLabel(tab).trim()
  if (label.length === 0) return tab.id.slice(0, 2).toUpperCase()
  const words = label.split(/\s+/u).filter((word) => word.length > 0)
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

/**
 * The accessible name of a tab: the visible label, then its states as words. A
 * pinned tab is shrunk to an icon on screen but reads in full here, and unsaved
 * work is never communicated by a coloured dot alone.
 */
export function tabAccessibleName(model: TabModel, tab: Tab): string {
  const parts = [tabLabel(tab)]
  const group = tab.groupId === null ? undefined : model.group(tab.groupId)
  if (group) parts.push(t('tabs.group.label', { group: groupLabel(group) }))
  if (tab.pinned) parts.push(t('tabs.pinned.badge'))
  if (tab.dirty) parts.push(t('common.unsaved'))
  return parts.join(', ')
}

/* ------------------------------------------------------------------------- *
 * The guarded close path
 * ------------------------------------------------------------------------- */

export interface CloseOutcome {
  closed: string[]
  kept: string[]
}

/**
 * The single close path for the whole lane — the strip, the overflow menu, the
 * context menus and both bulk actions all come through here, so unsaved work is
 * protected identically everywhere and a tab the app locked is never closed.
 * A confirmation that cannot be shown counts as a refusal: nothing is lost to a
 * broken dialog.
 */
export async function requestCloseTabs(model: TabModel, ids: readonly string[]): Promise<CloseOutcome> {
  const targets = ids
    .map((id) => model.tab(id))
    .filter((tab): tab is Tab => tab !== undefined && tab.closable)
  if (targets.length === 0) return { closed: [], kept: [...ids] }

  const dirty = targets.filter((tab) => tab.dirty)
  if (dirty.length > 0 || targets.length > 1) {
    let agreed = false
    try {
      agreed =
        targets.length === 1 && dirty[0]
          ? await confirm({
              titleKey: 'tabs.unsaved.title',
              titleParams: { title: tabLabel(dirty[0]) },
              messageKey: 'tabs.unsaved.body',
              params: { title: tabLabel(dirty[0]) },
              confirmKey: 'tabs.unsaved.discard',
              cancelKey: 'tabs.unsaved.keep',
              destructive: true,
            })
          : await confirm({
              titleKey: 'tabs.close.confirm.title',
              titleParams: { count: targets.length },
              messageKey: 'tabs.close.confirm.body',
              params: { count: targets.length, unsaved: dirty.length },
              confirmKey: dirty.length > 0 ? 'tabs.unsaved.discard' : 'common.close',
              cancelKey: 'tabs.unsaved.keep',
              destructive: true,
            })
    } catch {
      agreed = false
    }
    if (!agreed) return { closed: [], kept: targets.map((tab) => tab.id) }
  }

  const closed: string[] = []
  for (const tab of targets) if (model.close(tab.id)) closed.push(tab.id)
  const closedSet = new Set(closed)
  return { closed, kept: ids.filter((id) => !closedSet.has(id)) }
}

/* ------------------------------------------------------------------------- *
 * Revealing a tab
 * ------------------------------------------------------------------------- */

export const TAB_REVEAL_EVENT = 'sh-tabs:reveal'

export interface TabRevealDetail {
  stripId: string
  tabId: string
}

/**
 * The model half of "teleport": expand the tab's group, select it, then announce
 * it so whichever strip renders that model can scroll it into view and move focus
 * onto it. The event spares the search surfaces any knowledge of the strip's DOM,
 * which is what keeps this lane free of an import cycle.
 */
export function revealTab(model: TabModel, tabId: string): void {
  const tab = model.tab(tabId)
  if (!tab) return
  if (tab.groupId !== null) {
    const group = model.group(tab.groupId)
    if (group?.collapsed) model.setCollapsed(group.id, false)
  }
  model.activate(tabId)
  if (typeof document === 'undefined') return
  document.dispatchEvent(
    new CustomEvent<TabRevealDetail>(TAB_REVEAL_EVENT, { detail: { stripId: model.id, tabId } }),
  )
}

/** Expands a group and reveals its first tab. */
export function revealGroup(model: TabModel, groupId: string): void {
  const group = model.group(groupId)
  if (!group) return
  if (group.collapsed) model.setCollapsed(groupId, false)
  const first = model.tabsInGroup(groupId)[0]
  if (first) revealTab(model, first.id)
}

/* ------------------------------------------------------------------------- *
 * Anchored popovers and menus
 * ------------------------------------------------------------------------- */

export interface Popover {
  readonly element: HTMLElement
  close(): void
  reposition(): void
}

let openPopoverRef: Popover | null = null

export function closeOpenPopover(): void {
  openPopoverRef?.close()
}

/**
 * An anchored, non-modal popover, styled by `base.css`. Escape closes it, a click
 * outside closes it, focus goes back where it came from, and it is clamped inside
 * the viewport so it survives a 640 px window at 200 % scale.
 */
export function openPopover(
  anchor: HTMLElement,
  opts: { label: string; role?: 'dialog' | 'menu'; build: (pop: Popover) => void; onClose?: () => void },
): Popover {
  closeOpenPopover()
  const element = document.createElement('div')
  element.className = 'sh-popover'
  element.setAttribute('role', opts.role ?? 'dialog')
  element.setAttribute('aria-label', opts.label)
  if ((opts.role ?? 'dialog') === 'dialog') element.setAttribute('aria-modal', 'false')

  let closed = false
  const pop: Popover = {
    element,
    close(): void {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      element.remove()
      if (openPopoverRef === pop) openPopoverRef = null
      opts.onClose?.()
      if (anchor.isConnected) anchor.focus()
    },
    reposition(): void {
      reposition()
    },
  }

  function reposition(): void {
    const rect = anchor.getBoundingClientRect()
    const size = element.getBoundingClientRect()
    const margin = 8
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - size.width - margin))
    const below = rect.bottom + 2
    const top =
      below + size.height + margin <= window.innerHeight
        ? below
        : Math.max(margin, rect.top - size.height - 2)
    element.style.left = `${Math.round(left + window.scrollX)}px`
    element.style.top = `${Math.round(top + window.scrollY)}px`
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    pop.close()
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Node && (element.contains(target) || anchor.contains(target))) return
    pop.close()
  }

  document.body.appendChild(element)
  opts.build(pop)
  reposition()
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
  openPopoverRef = pop
  return pop
}

export interface MenuItem {
  label: string
  onSelect(): void
  disabled?: boolean
  /** Renders as `menuitemcheckbox` with this state when given. */
  checked?: boolean
}

/** A real `menu` of real `menuitem` buttons: arrows, Home, End, Escape, wrap-around. */
export function openMenu(anchor: HTMLElement, label: string, items: readonly MenuItem[]): Popover {
  return openPopover(anchor, {
    label,
    role: 'menu',
    build(pop) {
      const list = document.createElement('ul')
      list.className = 'sh-menu'
      list.setAttribute('role', 'none')
      const buttons: HTMLButtonElement[] = []
      for (const item of items) {
        const li = document.createElement('li')
        li.setAttribute('role', 'none')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sh-menuitem'
        button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemcheckbox')
        if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked))
        button.textContent = item.label
        button.tabIndex = -1
        if (item.disabled === true) {
          button.disabled = true
          button.setAttribute('aria-disabled', 'true')
        }
        button.addEventListener('click', () => {
          pop.close()
          item.onSelect()
        })
        li.appendChild(button)
        list.appendChild(li)
        buttons.push(button)
      }
      pop.element.appendChild(list)

      const usable = (): HTMLButtonElement[] => buttons.filter((button) => !button.disabled)
      const step = (delta: number): void => {
        const list2 = usable()
        if (list2.length === 0) return
        const current = list2.findIndex((button) => button === document.activeElement)
        list2[(current + delta + list2.length) % list2.length]?.focus()
      }
      list.addEventListener('keydown', (event) => {
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault()
            step(1)
            break
          case 'ArrowUp':
            event.preventDefault()
            step(-1)
            break
          case 'Home':
            event.preventDefault()
            usable()[0]?.focus()
            break
          case 'End': {
            event.preventDefault()
            const all = usable()
            all[all.length - 1]?.focus()
            break
          }
          default:
            break
        }
      })
      usable()[0]?.focus()
    },
  })
}
