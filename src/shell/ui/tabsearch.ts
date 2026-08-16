/**
 * Searching tabs.
 *
 * Four searches, each with its own field, its own builder and its own catalogue
 * entry — the current strip, within each group, group names, and every tab the app
 * owns — plus the two bulk actions, "close tabs containing text" and "close tabs
 * not containing text".
 *
 * The two bulk actions share **one** predicate and differ only by a boolean, so
 * they cannot disagree about what a query means. An empty or invalid query is not
 * a wildcard: it selects nothing. Pinned tabs are out of scope unless the operator
 * explicitly opts them in, tabs the app locked are never selected, and anything
 * holding unsaved work is confirmed before it goes.
 *
 * Every result says which strip it is on, which group it is in, whether it is
 * pinned, and the label you can actually see.
 */

import { compile, plainToPattern } from '../core/regex'
import { onLangChange, t } from '../core/i18n'
import type { StringKey } from '../core/i18n'
import { nextId } from './primitives'
import { createSearchField } from './searchfield'
import type { SearchField } from './searchfield'
import {
  DEFAULT_STRIP_ID,
  allStrips,
  getStrip,
  groupLabel,
  requestCloseTabs,
  revealGroup,
  revealTab,
  stripLabel,
  tabLabel,
} from './tabmodel'
import type { Tab, TabGroup, TabModel } from './tabmodel'

/* ------------------------------------------------------------------------- *
 * Records and scopes
 * ------------------------------------------------------------------------- */

export interface TabRecord {
  readonly model: TabModel
  readonly stripId: string
  readonly stripName: string
  readonly tabId: string
  /** The label the user can actually see, already translated. */
  readonly label: string
  readonly groupId: string | null
  readonly groupName: string | null
  readonly pinned: boolean
  readonly dirty: boolean
  readonly closable: boolean
}

export interface GroupRecord {
  readonly model: TabModel
  readonly stripId: string
  readonly stripName: string
  readonly groupId: string
  readonly label: string
  readonly collapsed: boolean
  readonly tabCount: number
}

export type TabScope =
  | { kind: 'strip'; stripId?: string }
  | { kind: 'group'; stripId?: string; groupId: string }
  | { kind: 'all' }

function modelsFor(scope: TabScope): TabModel[] {
  if (scope.kind === 'all') return [...allStrips()]
  return [getStrip(scope.stripId ?? DEFAULT_STRIP_ID)]
}

function recordFor(model: TabModel, tab: Tab, stripName: string): TabRecord {
  const group = tab.groupId === null ? undefined : model.group(tab.groupId)
  return {
    model,
    stripId: model.id,
    stripName,
    tabId: tab.id,
    label: tabLabel(tab),
    groupId: tab.groupId,
    groupName: group ? groupLabel(group) : null,
    pinned: tab.pinned,
    dirty: tab.dirty,
    closable: tab.closable,
  }
}

/** Every tab in scope, in strip order. */
export function collectTabs(scope: TabScope): TabRecord[] {
  const out: TabRecord[] = []
  for (const model of modelsFor(scope)) {
    const stripName = stripLabel(model)
    for (const tab of model.tabs()) {
      if (scope.kind === 'group' && tab.groupId !== scope.groupId) continue
      out.push(recordFor(model, tab, stripName))
    }
  }
  return out
}

/** Every group in scope. */
export function collectGroups(scope: TabScope): GroupRecord[] {
  const out: GroupRecord[] = []
  for (const model of modelsFor(scope)) {
    const stripName = stripLabel(model)
    for (const group of model.groups()) {
      if (scope.kind === 'group' && group.id !== scope.groupId) continue
      out.push({
        model,
        stripId: model.id,
        stripName,
        groupId: group.id,
        label: groupLabel(group),
        collapsed: group.collapsed,
        tabCount: model.tabsInGroup(group.id).length,
      })
    }
  }
  return out
}

/* ------------------------------------------------------------------------- *
 * The one predicate
 * ------------------------------------------------------------------------- */

export interface TabSearchQuery {
  text: string
  useRegex: boolean
}

export interface TabPredicate {
  /** True only when a usable pattern came out of a non-empty query. */
  readonly ok: boolean
  readonly empty: boolean
  readonly error: string | null
  /** The pattern that was actually compiled, for the field's own feedback. */
  readonly source: string
  /** Always false when `ok` is false, so a bad query can never select everything. */
  test(subject: string): boolean
}

const NO_MATCH: TabPredicate = {
  ok: false,
  empty: true,
  error: null,
  source: '',
  test: () => false,
}

/**
 * Plain text is the default and is escaped by the regex module rather than by
 * anything hand-rolled here; regex is an explicit opt-in. Both compile
 * case-insensitively. Unicode mode is preferred and dropped only when the pattern
 * cannot compile with it, because some otherwise valid ECMAScript escapes are
 * illegal under `u`.
 */
export function buildTabPredicate(query: TabSearchQuery): TabPredicate {
  const raw = query.text.trim()
  if (raw.length === 0) return NO_MATCH
  const source = query.useRegex ? raw : plainToPattern(raw)
  let error: string | null = null
  for (const flags of ['iu', 'i']) {
    const result = compile(source, flags)
    if (result.ok) {
      const re = result.re
      return {
        ok: true,
        empty: false,
        error: null,
        source,
        test(subject: string): boolean {
          // A global or sticky pattern would carry `lastIndex` from one row to the
          // next and match every other one; resetting keeps each test independent.
          re.lastIndex = 0
          return re.test(subject)
        },
      }
    }
    error = result.error
  }
  return { ok: false, empty: false, error, source, test: () => false }
}

/**
 * The same predicate, read off a live search field instead of a plain query.
 *
 * The field owns the anchored builder, so its answer already has the case, whole-word,
 * anchor, multiline and unicode switches folded in — reading its `test()` is what keeps
 * the builder from being decorative on this surface. `test()` on an inactive field is
 * true for everything, which is right for a list and wrong for bulk close, so `ok` and
 * `empty` are reported separately and each caller decides.
 */
export function fieldPredicate(field: SearchField): TabPredicate {
  if (field.empty()) return NO_MATCH
  const error = field.error()
  const source = field.pattern().source
  if (!field.active()) return { ok: false, empty: false, error, source, test: () => false }
  return { ok: true, empty: false, error: null, source, test: (subject) => field.test(subject) }
}

export interface TabSearchOutcome {
  records: TabRecord[]
  total: number
  error: string | null
  /** The query was blank, so everything in scope is listed. */
  browsing: boolean
}

/**
 * List semantics: a blank query browses everything in scope, an invalid one lists
 * nothing and says why. Bulk close deliberately does not use this — see
 * {@link selectForBulkClose}.
 */
export function searchTabs(
  scope: TabScope,
  predicate: TabPredicate,
  filter?: (record: TabRecord) => boolean,
): TabSearchOutcome {
  const all = collectTabs(scope).filter((record) => (filter ? filter(record) : true))
  if (predicate.empty) return { records: all, total: all.length, error: null, browsing: true }
  if (!predicate.ok) return { records: [], total: all.length, error: predicate.error, browsing: false }
  return {
    records: all.filter((record) => predicate.test(record.label)),
    total: all.length,
    error: null,
    browsing: false,
  }
}

export interface GroupSearchOutcome {
  records: GroupRecord[]
  total: number
  error: string | null
  browsing: boolean
}

export function searchGroupNames(
  predicate: TabPredicate,
  scope: TabScope = { kind: 'all' },
): GroupSearchOutcome {
  const all = collectGroups(scope)
  if (predicate.empty) return { records: all, total: all.length, error: null, browsing: true }
  if (!predicate.ok) return { records: [], total: all.length, error: predicate.error, browsing: false }
  return {
    records: all.filter((record) => predicate.test(record.label)),
    total: all.length,
    error: null,
    browsing: false,
  }
}

/* ------------------------------------------------------------------------- *
 * Bulk close
 * ------------------------------------------------------------------------- */

export type BulkMode = 'contains' | 'notContains'

export interface BulkSelection {
  predicate: TabPredicate
  /** In scope and closable, after the pinned rule has been applied. */
  eligible: TabRecord[]
  selected: TabRecord[]
  /** Selected tabs holding unsaved work. */
  dirty: TabRecord[]
  /** Left alone because they are pinned and pinned tabs were not opted in. */
  pinnedSkipped: number
  /** Left alone because the app does not allow them to be closed. */
  lockedSkipped: number
}

export interface BulkOptions {
  scope: TabScope
  predicate: TabPredicate
  mode: BulkMode
  includePinned: boolean
}

/**
 * Both bulk actions run through here. `contains` keeps the tabs the predicate
 * matches and `notContains` keeps the ones it does not — the same predicate, the
 * same eligibility rules, one boolean apart. When the predicate is unusable
 * neither mode selects anything at all.
 */
export function selectForBulkClose(opts: BulkOptions): BulkSelection {
  const predicate = opts.predicate
  let pinnedSkipped = 0
  let lockedSkipped = 0
  const eligible: TabRecord[] = []
  for (const record of collectTabs(opts.scope)) {
    if (!record.closable) {
      lockedSkipped += 1
      continue
    }
    if (record.pinned && !opts.includePinned) {
      pinnedSkipped += 1
      continue
    }
    eligible.push(record)
  }
  const wanted = opts.mode === 'contains'
  const selected = predicate.ok ? eligible.filter((r) => predicate.test(r.label) === wanted) : []
  return {
    predicate,
    eligible,
    selected,
    dirty: selected.filter((record) => record.dirty),
    pinnedSkipped,
    lockedSkipped,
  }
}

/** Closes a selection, one strip at a time, through the guarded close path. */
export async function runBulkClose(selection: BulkSelection): Promise<number> {
  if (selection.selected.length === 0) return 0
  const byModel = new Map<TabModel, string[]>()
  for (const record of selection.selected) {
    const list = byModel.get(record.model)
    if (list) list.push(record.tabId)
    else byModel.set(record.model, [record.tabId])
  }
  let closed = 0
  for (const [model, ids] of byModel) {
    const outcome = await requestCloseTabs(model, ids)
    closed += outcome.closed.length
  }
  return closed
}

/* ------------------------------------------------------------------------- *
 * Field ids — one per search surface, all of them catalogue entries
 * ------------------------------------------------------------------------- */

export const STRIP_SEARCH_FIELD_ID = 'tabs.strip'
export const OVERFLOW_SEARCH_FIELD_ID = 'tabs.overflow'
export const GROUP_SEARCH_FIELD_PREFIX = 'tabs.group'
export const GROUP_NAME_SEARCH_FIELD_ID = 'tabs.groupNames'
export const ALL_TABS_SEARCH_FIELD_ID = 'tabs.all'
export const BULK_CLOSE_FIELD_ID = 'tabs.bulkClose'

/**
 * Every search field this lane creates, for `ui/catalogue.ts` to carry an entry
 * for. The per-group fields are `tabs.group.<groupId>`, one for each group, and
 * are covered by the `tabs.group` prefix.
 */
export const TAB_SEARCH_FIELD_IDS: readonly string[] = Object.freeze([
  STRIP_SEARCH_FIELD_ID,
  OVERFLOW_SEARCH_FIELD_ID,
  GROUP_SEARCH_FIELD_PREFIX,
  GROUP_NAME_SEARCH_FIELD_ID,
  ALL_TABS_SEARCH_FIELD_ID,
  BULK_CLOSE_FIELD_ID,
])

/* ------------------------------------------------------------------------- *
 * The search field
 * ------------------------------------------------------------------------- */

export interface TabSearchFieldOptions {
  /** Catalogue id. Every field in this lane has its own, and no two share one. */
  id: string
  labelKey: StringKey
  placeholderKey: StringKey
  /** Facts interpolated into both — a group name. Never prose. */
  labelParams?: Record<string, string | number>
  onChange(field: SearchField): void
}

/**
 * One field, one catalogue id, no builder state shared with any other field.
 *
 * This is a direct call into `searchfield.ts`, which is the module the shell contract
 * names as the owner of the one reusable field: every strip, group, group-name, all-tabs
 * and bulk-close query therefore gets the same anchored regex builder, the same plain-text
 * default and the same syntax feedback as every other search in the app.
 */
export function createTabSearchField(options: TabSearchFieldOptions): SearchField {
  return createSearchField({
    id: options.id,
    labelKey: options.labelKey,
    placeholderKey: options.placeholderKey,
    labelParams: options.labelParams,
    showLabel: true,
    onChange: options.onChange,
  })
}

/* ------------------------------------------------------------------------- *
 * Surfaces
 * ------------------------------------------------------------------------- */

export interface TabSearchSurface {
  element: HTMLElement
  focus(): void
  refresh(): void
  destroy(): void
}

function statusLine(): HTMLParagraphElement {
  const line = document.createElement('p')
  line.className = 'sh-hint'
  line.setAttribute('role', 'status')
  line.setAttribute('aria-live', 'polite')
  return line
}

/** Strip, group and pinned state, in that order, as words rather than colour. */
function recordMeta(record: TabRecord): string {
  const parts = [record.stripName]
  parts.push(record.groupName === null ? t('common.none') : t('tabs.group.label', { group: record.groupName }))
  if (record.pinned) parts.push(t('tabs.pinned.badge'))
  if (record.dirty) parts.push(t('common.unsaved'))
  return parts.join(' · ')
}

function resultButton(label: string, meta: string, onSelect: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sh-menuitem'
  button.setAttribute('aria-label', t('palette.goto', { title: label }))
  const title = document.createElement('span')
  title.className = 'sh-truncate'
  title.textContent = label
  const detail = document.createElement('span')
  detail.className = 'sh-muted'
  detail.textContent = meta
  button.append(title, detail)
  button.addEventListener('click', onSelect)
  return button
}

function reportCount(status: HTMLElement, shown: number, field: SearchField): void {
  const query = field.query().trim()
  status.classList.remove('sh-error')
  status.textContent =
    shown === 0 && query.length > 0
      ? t('search.results.none', { query })
      : t('search.results', { count: shown })
}

function reportInvalid(status: HTMLElement, error: string): void {
  status.classList.add('sh-error')
  status.textContent = t('tabs.close.invalid', { error })
}

/**
 * Wires one field to one list. Down-arrow out of the query box walks into the
 * results, so the whole surface is operable without ever reaching for the mouse.
 */
function listSurface(opts: {
  fieldId: string
  labelKey: StringKey
  placeholderKey: StringKey
  labelParams?: Record<string, string | number>
  models: () => readonly TabModel[]
  render: (field: SearchField, list: HTMLElement, status: HTMLElement) => void
}): TabSearchSurface {
  const element = document.createElement('div')
  element.className = 'sh-stack'
  const list = document.createElement('ul')
  list.className = 'sh-menu'
  list.setAttribute('role', 'none')
  const status = statusLine()

  const draw = (): void => {
    opts.render(field, list, status)
  }
  const field: SearchField = createTabSearchField({
    id: opts.fieldId,
    labelKey: opts.labelKey,
    placeholderKey: opts.placeholderKey,
    labelParams: opts.labelParams,
    onChange: draw,
  })
  element.append(field.el, status, list)

  element.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const target = event.target
    // Only the query box and the results themselves; anything else inside the
    // field — a regex builder popover, for instance — keeps its own arrow keys.
    const fromQuery = target instanceof HTMLInputElement && target.type === 'search'
    const fromResult = target instanceof HTMLElement && list.contains(target)
    if (!fromQuery && !fromResult) return
    const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')]
    if (buttons.length === 0) return
    const current = buttons.findIndex((button) => button === document.activeElement)
    if (current < 0 && event.key === 'ArrowUp') return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = current < 0 ? 0 : (current + delta + buttons.length) % buttons.length
    buttons[next]?.focus()
  })

  const unsubscribes = opts.models().map((model) => model.subscribe(draw))
  const stopLang = onLangChange(() => {
    field.relabel()
    draw()
  })
  draw()

  return {
    element,
    focus: () => field.focus(),
    refresh: draw,
    destroy: () => {
      for (const off of unsubscribes) off()
      stopLang()
      field.destroy()
      element.remove()
    },
  }
}

function fillTabList(
  list: HTMLElement,
  status: HTMLElement,
  field: SearchField,
  outcome: TabSearchOutcome,
  onPick: (record: TabRecord) => void,
): void {
  list.textContent = ''
  if (outcome.error !== null) {
    reportInvalid(status, outcome.error)
    return
  }
  reportCount(status, outcome.records.length, field)
  for (const record of outcome.records) {
    const item = document.createElement('li')
    item.setAttribute('role', 'none')
    item.appendChild(
      resultButton(record.label, recordMeta(record), () => {
        onPick(record)
      }),
    )
    list.appendChild(item)
  }
}

/* -- 1. the current strip -------------------------------------------------- */

export interface StripSearchOptions {
  /** Defaults to the strip search id; the overflow menu passes its own. */
  fieldId?: string
  /** Defaults to the strip search wording; the overflow menu passes its own key. */
  labelKey?: StringKey
  /** Narrows the searched set — the overflow menu uses it to list hidden tabs. */
  filter?: (record: TabRecord) => boolean
  onPick?: (record: TabRecord) => void
}

/** Search #1 — the tabs on one strip. */
export function createStripSearch(model: TabModel, options: StripSearchOptions = {}): TabSearchSurface {
  return listSurface({
    fieldId: options.fieldId ?? STRIP_SEARCH_FIELD_ID,
    labelKey: options.labelKey ?? 'search.tabs.strip.label',
    placeholderKey: 'search.tabs.strip.placeholder',
    models: () => [model],
    render: (field, list, status) => {
      const scope = { kind: 'strip', stripId: model.id } as const
      const outcome = searchTabs(scope, fieldPredicate(field), options.filter)
      fillTabList(list, status, field, outcome, (record) => {
        revealTab(record.model, record.tabId)
        options.onPick?.(record)
      })
    },
  })
}

/* -- 2. within one group --------------------------------------------------- */

/** Search #2 — one field per group, each with its own catalogue id. */
export function createGroupSearch(model: TabModel, groupId: string): TabSearchSurface {
  const group = model.group(groupId)
  const name = group ? groupLabel(group) : groupId
  return listSurface({
    fieldId: `${GROUP_SEARCH_FIELD_PREFIX}.${groupId}`,
    labelKey: 'search.tabs.group.label',
    placeholderKey: 'search.tabs.group.placeholder',
    labelParams: { group: name },
    models: () => [model],
    render: (field, list, status) => {
      const scope = { kind: 'group', stripId: model.id, groupId } as const
      const outcome = searchTabs(scope, fieldPredicate(field))
      fillTabList(list, status, field, outcome, (record) => {
        revealTab(record.model, record.tabId)
      })
    },
  })
}

/* -- 3. group names -------------------------------------------------------- */

/** Search #3 — the names of every group in the app. */
export function createGroupNameSearch(): TabSearchSurface {
  return listSurface({
    fieldId: GROUP_NAME_SEARCH_FIELD_ID,
    labelKey: 'search.tabs.groupNames.label',
    placeholderKey: 'search.tabs.groupNames.placeholder',
    models: allStrips,
    render: (field, list, status) => {
      const outcome = searchGroupNames(fieldPredicate(field))
      list.textContent = ''
      if (outcome.error !== null) {
        reportInvalid(status, outcome.error)
        return
      }
      reportCount(status, outcome.records.length, field)
      for (const record of outcome.records) {
        const item = document.createElement('li')
        item.setAttribute('role', 'none')
        const meta = `${record.stripName} · ${t('tabs.group.count', {
          group: record.label,
          count: record.tabCount,
        })}`
        item.appendChild(
          resultButton(record.label, meta, () => {
            revealGroup(record.model, record.groupId)
          }),
        )
        list.appendChild(item)
      }
    },
  })
}

/* -- 4. every tab the app owns --------------------------------------------- */

/** Search #4 — every tab on every strip. */
export function createAllTabsSearch(): TabSearchSurface {
  return listSurface({
    fieldId: ALL_TABS_SEARCH_FIELD_ID,
    labelKey: 'search.tabs.all.label',
    placeholderKey: 'search.tabs.all.placeholder',
    models: allStrips,
    render: (field, list, status) => {
      const outcome = searchTabs({ kind: 'all' }, fieldPredicate(field))
      fillTabList(list, status, field, outcome, (record) => {
        revealTab(record.model, record.tabId)
      })
    },
  })
}

/* -- the bulk actions ------------------------------------------------------ */

export interface BulkCloseOptions {
  scope?: TabScope
}

/**
 * Both bulk actions on one surface, over one query. The preview and the count are
 * live and are exactly what the buttons act on, so what you see is what closes.
 * Pointing at or focusing an action switches the preview to that action, and a
 * query that would take everything says so before you commit to it.
 */
export function createBulkCloseSurface(options: BulkCloseOptions = {}): TabSearchSurface {
  const scope: TabScope = options.scope ?? { kind: 'all' }
  const element = document.createElement('section')
  element.className = 'sh-stack'

  const title = document.createElement('h3')
  title.textContent = t('common.close')
  element.appendChild(title)

  let mode: BulkMode = 'contains'
  let includePinned = false

  const field = createTabSearchField({
    id: BULK_CLOSE_FIELD_ID,
    labelKey: 'common.search',
    placeholderKey: 'search.tabs.all.placeholder',
    onChange: () => {
      draw()
    },
  })
  element.appendChild(field.el)

  const pinnedWrap = document.createElement('label')
  pinnedWrap.className = 'sh-check'
  const pinnedToggle = document.createElement('input')
  pinnedToggle.type = 'checkbox'
  const pinnedText = document.createElement('span')
  pinnedText.textContent = t('tabs.close.includePinned')
  pinnedWrap.append(pinnedToggle, pinnedText)
  pinnedToggle.addEventListener('change', () => {
    includePinned = pinnedToggle.checked
    draw()
  })
  element.appendChild(pinnedWrap)

  const pinnedNote = document.createElement('p')
  pinnedNote.className = 'sh-hint'
  pinnedNote.textContent = t('tabs.close.pinnedExcluded')
  element.appendChild(pinnedNote)

  const status = statusLine()
  status.id = nextId('sh-tabs-bulk')
  element.appendChild(status)

  const preview = document.createElement('ul')
  preview.className = 'sh-menu'
  preview.setAttribute('role', 'none')
  element.appendChild(preview)

  const actions = document.createElement('div')
  actions.className = 'sh-row'
  const closeContaining = document.createElement('button')
  closeContaining.type = 'button'
  closeContaining.className = 'sh-btn sh-btn--danger'
  const closeNotContaining = document.createElement('button')
  closeNotContaining.type = 'button'
  closeNotContaining.className = 'sh-btn sh-btn--danger'
  actions.append(closeContaining, closeNotContaining)
  element.appendChild(actions)

  const outcomeLine = statusLine()
  element.appendChild(outcomeLine)

  const selectionFor = (which: BulkMode): BulkSelection =>
    selectForBulkClose({ scope, predicate: fieldPredicate(field), mode: which, includePinned })

  function labelAction(button: HTMLButtonElement, key: 'tabs.close.matching' | 'tabs.close.notMatching', count: number): void {
    button.textContent = ''
    const name = document.createElement('span')
    name.textContent = t(key)
    const badge = document.createElement('span')
    badge.className = 'sh-badge'
    badge.textContent = t('common.count', { count })
    button.append(name, badge)
    button.disabled = count === 0
    button.setAttribute('aria-describedby', status.id)
  }

  function draw(): void {
    const containing = selectionFor('contains')
    const notContaining = selectionFor('notContains')
    const selection = mode === 'contains' ? containing : notContaining
    labelAction(closeContaining, 'tabs.close.matching', containing.selected.length)
    labelAction(closeNotContaining, 'tabs.close.notMatching', notContaining.selected.length)
    pinnedNote.hidden = includePinned || selection.pinnedSkipped === 0
    preview.textContent = ''

    if (selection.predicate.empty) {
      status.classList.remove('sh-error')
      status.textContent = t('tabs.close.emptyQuery')
      return
    }
    if (!selection.predicate.ok) {
      reportInvalid(status, selection.predicate.error ?? '')
      return
    }
    status.classList.remove('sh-error')
    if (selection.selected.length === 0) {
      status.textContent = t('tabs.close.none')
      return
    }
    status.textContent =
      selection.selected.length === selection.eligible.length
        ? t('tabs.close.all')
        : t('tabs.close.preview', { count: selection.selected.length, total: selection.eligible.length })
    for (const record of selection.selected) {
      const item = document.createElement('li')
      item.setAttribute('role', 'none')
      const row = document.createElement('span')
      row.className = 'sh-menuitem'
      const name = document.createElement('span')
      name.className = 'sh-truncate'
      name.textContent = record.label
      const meta = document.createElement('span')
      meta.className = 'sh-muted'
      meta.textContent = recordMeta(record)
      row.append(name, meta)
      item.appendChild(row)
      preview.appendChild(item)
    }
  }

  async function act(which: BulkMode): Promise<void> {
    mode = which
    draw()
    const selection = selectionFor(which)
    if (selection.selected.length === 0) {
      outcomeLine.textContent = t('tabs.close.none')
      return
    }
    const closed = await runBulkClose(selection)
    draw()
    outcomeLine.textContent = closed === 0 ? t('tabs.unsaved.keep') : t('tabs.close.done', { count: closed })
  }

  const previewsOnFocus = (button: HTMLButtonElement, which: BulkMode): void => {
    const show = (): void => {
      if (mode === which) return
      mode = which
      draw()
    }
    button.addEventListener('pointerenter', show)
    button.addEventListener('focus', show)
  }
  previewsOnFocus(closeContaining, 'contains')
  previewsOnFocus(closeNotContaining, 'notContains')
  closeContaining.addEventListener('click', () => {
    void act('contains')
  })
  closeNotContaining.addEventListener('click', () => {
    void act('notContains')
  })

  const unsubscribes = allStrips().map((model) => model.subscribe(draw))
  const stopLang = onLangChange(() => {
    title.textContent = t('common.close')
    pinnedText.textContent = t('tabs.close.includePinned')
    pinnedNote.textContent = t('tabs.close.pinnedExcluded')
    field.relabel()
    draw()
  })
  draw()

  return {
    element,
    focus: () => field.focus(),
    refresh: draw,
    destroy: () => {
      for (const off of unsubscribes) off()
      stopLang()
      field.destroy()
      element.remove()
    },
  }
}

/* ------------------------------------------------------------------------- *
 * The composite panel
 * ------------------------------------------------------------------------- */

/**
 * One titled section. The heading is handed back with it so a language change can
 * rewrite it in place: a heading rendered once at build time would be the one piece of
 * this panel still speaking yesterday's language.
 */
function section(
  labelText: string,
  surface: TabSearchSurface,
): { element: HTMLElement; heading: HTMLElement } {
  const wrap = document.createElement('section')
  const heading = document.createElement('h3')
  heading.textContent = labelText
  wrap.append(heading, surface.element)
  return { element: wrap, heading }
}

/**
 * Everything above in one tab: the strip search, a search inside each group, the
 * group-name search, the all-tabs search and the two bulk actions. Group sections
 * are rebuilt when the groups change, so a new group brings its own field with it
 * rather than sharing anyone else's.
 */
export function createTabSearchPanel(stripId: string = DEFAULT_STRIP_ID): TabSearchSurface {
  const model = getStrip(stripId)
  const element = document.createElement('div')
  element.className = 'sh-stack sh-stack--loose'

  const title = document.createElement('h2')
  title.textContent = t('common.search')
  element.appendChild(title)

  const fixed: TabSearchSurface[] = []
  const headings: Array<{ node: HTMLElement; key: StringKey }> = []
  const add = (key: StringKey, surface: TabSearchSurface): void => {
    fixed.push(surface)
    const built = section(t(key), surface)
    headings.push({ node: built.heading, key })
    element.appendChild(built.element)
  }

  add('search.tabs.strip.label', createStripSearch(model))

  const groupHost = document.createElement('div')
  groupHost.className = 'sh-stack'
  element.appendChild(groupHost)

  add('search.tabs.groupNames.label', createGroupNameSearch())
  add('search.tabs.all.label', createAllTabsSearch())

  const bulk = createBulkCloseSurface()
  fixed.push(bulk)
  element.appendChild(bulk.element)

  let groupSurfaces: TabSearchSurface[] = []
  let rendered = ''

  function drawGroups(): void {
    const groups: readonly TabGroup[] = model.groups()
    const signature = groups.map((group) => `${group.id}:${groupLabel(group)}`).join('|')
    if (signature === rendered) return
    rendered = signature
    for (const surface of groupSurfaces) surface.destroy()
    groupSurfaces = []
    groupHost.textContent = ''
    if (groups.length === 0) {
      const none = document.createElement('p')
      none.className = 'sh-empty'
      none.textContent = t('common.none')
      groupHost.appendChild(none)
      return
    }
    for (const group of groups) {
      const surface = createGroupSearch(model, group.id)
      groupSurfaces.push(surface)
      groupHost.appendChild(
        section(t('search.tabs.group.label', { group: groupLabel(group) }), surface).element,
      )
    }
  }

  const off = model.subscribe(drawGroups)
  const stopLang = onLangChange(() => {
    title.textContent = t('common.search')
    for (const heading of headings) heading.node.textContent = t(heading.key)
    rendered = ''
    drawGroups()
  })
  drawGroups()

  return {
    element,
    focus: () => fixed[0]?.focus(),
    refresh: () => {
      drawGroups()
      for (const surface of [...fixed, ...groupSurfaces]) surface.refresh()
    },
    destroy: () => {
      off()
      stopLang()
      for (const surface of [...fixed, ...groupSurfaces]) surface.destroy()
      element.remove()
    },
  }
}
