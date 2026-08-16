/**
 * The tab model's ordering invariants and its guarded close path.
 *
 * `DESIGN.md` 10.3: "Tabs — persistent and browser-style: overflow, reorder by drag and by
 * keyboard, pin, groups with collapse … Closing a tab with unsaved work asks first."
 *
 * Everything under test here is the pure-data half of `src/shell/ui/tabmodel.ts`, which the
 * module itself promises runs "without a `document`". The one thing that does need a
 * document — the blocking confirmation `requestCloseTabs` puts in front of unsaved work —
 * is replaced with a stub so the *decision* can be asserted rather than the dialog: a
 * refusal must keep the tab, and a confirmation must close it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { confirmStub } = vi.hoisted(() => ({
  confirmStub: vi.fn<(init: unknown) => Promise<boolean>>(),
}))

vi.mock('../src/shell/ui/notify', () => ({ confirm: confirmStub }))

import {
  DEFAULT_STRIP_ID,
  TabModel,
  allStrips,
  getStrip,
  groupLabel,
  normalizeTabState,
  requestCloseTabs,
  revealGroup,
  revealTab,
  stripLabel,
  tabAccessibleName,
  tabLabel,
  tabShortLabel,
  text,
} from '../src/shell/ui/tabmodel'
import type { Tab, TabInit } from '../src/shell/ui/tabmodel'
import { get as storeGet } from '../src/shell/core/store'

/** A model with no persistence attached: the strip registry only writes the default id. */
function model(): TabModel {
  return new TabModel('test-strip', 'tabs.strip.label')
}

function open(m: TabModel, id: string, init: Partial<TabInit> = {}): Tab {
  return m.open({ id, titleKey: 'tabs.strip.label', kind: 'doc', ...init })
}

const ids = (m: TabModel): string[] => m.tabs().map((tab) => tab.id)

/** The invariant the whole lane rests on, checked after every mutation in every test. */
function assertOrdering(m: TabModel): void {
  const tabs = m.tabs()

  // 1. Pinned tabs sort ahead of unpinned ones, always.
  const lastPinned = tabs.reduce((at, tab, index) => (tab.pinned ? index : at), -1)
  const firstUnpinned = tabs.findIndex((tab) => !tab.pinned)
  if (lastPinned >= 0 && firstUnpinned >= 0) {
    expect(lastPinned, `pinned tab behind an unpinned one in ${ids(m).join(',')}`).toBeLessThan(
      firstUnpinned,
    )
  }

  // 2. The members of a group are contiguous within their pinned partition.
  const runs = new Map<string, number>()
  let previousKey: string | null = null
  tabs.forEach((tab) => {
    const key = tab.groupId === null ? null : `${tab.pinned ? 'p' : 'u'}:${tab.groupId}`
    if (key !== previousKey && key !== null) {
      runs.set(key, (runs.get(key) ?? 0) + 1)
      expect(runs.get(key), `group ${key} is split apart in ${ids(m).join(',')}`).toBe(1)
    }
    previousKey = key
  })

  // 3. The active tab, when there is one, is a tab that exists.
  const active = m.activeId()
  if (active !== null) expect(m.tab(active), `active id ${active} is not a tab`).toBeDefined()

  // 4. Ids are unique.
  expect(new Set(ids(m)).size).toBe(tabs.length)
}

beforeEach(() => {
  confirmStub.mockReset()
  confirmStub.mockResolvedValue(false)
})

/* ------------------------------------------------------------------------ *
 * open / close / activate
 * ------------------------------------------------------------------------ */

describe('open', () => {
  it('appends and activates by default', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    expect(ids(m)).toEqual(['a', 'b'])
    expect(m.activeId()).toBe('b')
    assertOrdering(m)
  })

  it('honours activate: false, but still selects the very first tab', () => {
    const m = model()
    open(m, 'a', { })
    m.open({ id: 'b', titleKey: 'tabs.strip.label' }, { activate: false })
    expect(m.activeId()).toBe('a')

    const empty = model()
    empty.open({ id: 'only', titleKey: 'tabs.strip.label' }, { activate: false })
    expect(empty.activeId()).toBe('only') // nothing else could be selected
  })

  it('inserts at a requested index, clamped into the list', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    m.open({ id: 'c', titleKey: 'tabs.strip.label' }, { index: 1 })
    expect(ids(m)).toEqual(['a', 'c', 'b'])
    m.open({ id: 'd', titleKey: 'tabs.strip.label' }, { index: 99 })
    expect(ids(m)).toEqual(['a', 'c', 'b', 'd'])
    m.open({ id: 'e', titleKey: 'tabs.strip.label' }, { index: -5 })
    expect(ids(m)).toEqual(['e', 'a', 'c', 'b', 'd'])
    assertOrdering(m)
  })

  it('is idempotent: reopening an id refreshes it and keeps its place', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b', { pinned: true })
    open(m, 'c')
    const before = ids(m)

    m.open({ id: 'a', titleKey: 'tabs.group.new', titleParams: { count: 2 } })

    expect(ids(m)).toEqual(before)
    expect(m.tabs()).toHaveLength(3)
    expect(m.tab('a')?.titleKey).toBe('tabs.group.new')
    expect(m.tab('a')?.titleParams).toEqual({ count: 2 })
    assertOrdering(m)
  })

  it('creates the group a tab names, so a restored tab is never orphaned', () => {
    const m = model()
    open(m, 'a', { groupId: 'chores' })
    expect(m.group('chores')).toBeDefined()
    expect(m.tabsInGroup('chores').map((tab) => tab.id)).toEqual(['a'])
    assertOrdering(m)
  })

  it('hands back a frozen tab, so nothing can edit the model from outside', () => {
    const m = model()
    const tab = open(m, 'a')
    expect(Object.isFrozen(tab)).toBe(true)
  })
})

describe('close', () => {
  it('removes the tab and reports whether it did', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    expect(m.close('a')).toBe(true)
    expect(m.close('a')).toBe(false)
    expect(m.close('never-existed')).toBe(false)
    expect(ids(m)).toEqual(['b'])
    assertOrdering(m)
  })

  it('moves the selection to the right-hand neighbour, then to the left-hand one', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    open(m, 'c')
    m.activate('b')
    m.close('b')
    expect(m.activeId()).toBe('c') // the tab that slid into its place

    m.activate('c')
    m.close('c')
    expect(m.activeId()).toBe('a') // nothing to the right, so the left
    m.close('a')
    expect(m.activeId()).toBeNull()
    assertOrdering(m)
  })

  it('drops a group once its last tab has gone', () => {
    const m = model()
    open(m, 'a', { groupId: 'g' })
    open(m, 'b')
    expect(m.groups().map((group) => group.id)).toEqual(['g'])
    m.close('a')
    expect(m.groups()).toEqual([])
    assertOrdering(m)
  })
})

describe('activate', () => {
  it('selects an existing tab and refuses an unknown one', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    expect(m.activate('a')).toBe(true)
    expect(m.activeId()).toBe('a')
    expect(m.activate('a')).toBe(true) // already active
    expect(m.activate('ghost')).toBe(false)
    expect(m.activeId()).toBe('a')
  })
})

/* ------------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------------ */

describe('pinning', () => {
  it('lifts a pinned tab ahead of every unpinned one', () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    open(m, 'c')
    expect(m.setPinned('c', true)).toBe(true)
    expect(ids(m)).toEqual(['c', 'a', 'b'])
    assertOrdering(m)
  })

  it('drops an unpinned tab back behind the pinned run', () => {
    const m = model()
    open(m, 'a', { pinned: true })
    open(m, 'b', { pinned: true })
    open(m, 'c')
    expect(ids(m)).toEqual(['a', 'b', 'c'])
    m.setPinned('a', false)
    expect(ids(m)).toEqual(['b', 'a', 'c'])
    assertOrdering(m)
  })

  it('reports no change when the tab is already in that state', () => {
    const m = model()
    open(m, 'a')
    expect(m.setPinned('a', false)).toBe(false)
    expect(m.setPinned('ghost', true)).toBe(false)
  })

  it('keeps relative order inside each partition', () => {
    const m = model()
    for (const id of ['a', 'b', 'c', 'd', 'e']) open(m, id)
    m.setPinned('d', true)
    m.setPinned('b', true)
    // d pinned first, so d leads; the unpinned keep a, c, e in their original order.
    expect(ids(m)).toEqual(['d', 'b', 'a', 'c', 'e'])
    assertOrdering(m)
  })
})

describe('move and reorder', () => {
  it('moves a tab to an absolute position', () => {
    const m = model()
    for (const id of ['a', 'b', 'c', 'd']) open(m, id)
    expect(m.move('d', 0)).toBe(true)
    expect(ids(m)).toEqual(['d', 'a', 'b', 'c'])
    expect(m.move('ghost', 0)).toBe(false)
    assertOrdering(m)
  })

  it('swaps with a neighbour on a relative move, which is what Ctrl+Shift+Arrow does', () => {
    const m = model()
    for (const id of ['a', 'b', 'c']) open(m, id)
    expect(m.reorder('a', 1)).toBe(true)
    expect(ids(m)).toEqual(['b', 'a', 'c'])
    expect(m.reorder('a', -1)).toBe(true)
    expect(ids(m)).toEqual(['a', 'b', 'c'])
    assertOrdering(m)
  })

  it('clamps a relative move at each end instead of wrapping', () => {
    const m = model()
    for (const id of ['a', 'b', 'c']) open(m, id)
    m.reorder('a', -10)
    expect(ids(m)).toEqual(['a', 'b', 'c'])
    m.reorder('a', 10)
    expect(ids(m)).toEqual(['b', 'c', 'a'])
    assertOrdering(m)
  })

  it('refuses to move an unpinned tab ahead of a pinned one', () => {
    const m = model()
    open(m, 'p1', { pinned: true })
    open(m, 'p2', { pinned: true })
    open(m, 'u1')
    open(m, 'u2')

    m.move('u2', 0)
    expect(ids(m)).toEqual(['p1', 'p2', 'u2', 'u1'])
    expect(m.tabs()[0].pinned).toBe(true)

    m.reorder('u1', -5)
    expect(ids(m).slice(0, 2)).toEqual(['p1', 'p2'])
    assertOrdering(m)
  })

  it('refuses to move a pinned tab behind an unpinned one', () => {
    const m = model()
    open(m, 'p1', { pinned: true })
    open(m, 'p2', { pinned: true })
    open(m, 'u1')

    m.move('p1', 99)
    expect(ids(m)).toEqual(['p2', 'p1', 'u1'])
    expect(m.tabs()[2].pinned).toBe(false)
    assertOrdering(m)
  })

  it('adopts or leaves a group in the same gesture, the way a drag does', () => {
    const m = model()
    open(m, 'a', { groupId: 'g' })
    open(m, 'b')
    expect(m.move('b', 0, { groupId: 'g' })).toBe(true)
    expect(m.tab('b')?.groupId).toBe('g')

    m.move('b', 9, { groupId: null })
    expect(m.tab('b')?.groupId).toBeNull()
    assertOrdering(m)
  })

  it('keeps a group contiguous even when a stranger is dropped into the middle', () => {
    const m = model()
    open(m, 'g1', { groupId: 'g' })
    open(m, 'g2', { groupId: 'g' })
    open(m, 'loose')
    m.move('loose', 1) // aimed between the two group members

    const positions = ids(m)
    const first = positions.indexOf('g1')
    const second = positions.indexOf('g2')
    expect(Math.abs(first - second)).toBe(1)
    assertOrdering(m)
  })
})

/* ------------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------------ */

describe('groups', () => {
  it('creates a group with a generated id when none is given', () => {
    const m = model()
    const first = m.createGroup()
    const second = m.createGroup()
    expect(first.id).not.toBe(second.id)
    expect(first.collapsed).toBe(false)
    expect(m.group(first.id)).toBeDefined()
  })

  it('never reuses an id that is already taken', () => {
    const m = model()
    const first = m.createGroup({ id: 'chores' })
    const second = m.createGroup({ id: 'chores' })
    expect(first.id).toBe('chores')
    expect(second.id).not.toBe('chores')
  })

  it('assigns and unassigns membership, dropping a group that empties', () => {
    const m = model()
    m.createGroup({ id: 'g' })
    open(m, 'a')
    open(m, 'b')

    expect(m.assignGroup('a', 'g')).toBe(true)
    expect(m.assignGroup('a', 'g')).toBe(false) // already there
    expect(m.assignGroup('a', 'nonexistent')).toBe(true) // falls to ungrouped
    expect(m.tab('a')?.groupId).toBeNull()
    expect(m.assignGroup('ghost', 'g')).toBe(false)
    assertOrdering(m)
  })

  it('collapses and expands', () => {
    const m = model()
    open(m, 'a', { groupId: 'g' })
    expect(m.group('g')?.collapsed).toBe(false)
    expect(m.setCollapsed('g', true)).toBe(true)
    expect(m.group('g')?.collapsed).toBe(true)
    expect(m.setCollapsed('g', true)).toBe(false) // already collapsed
    expect(m.toggleCollapsed('g')).toBe(true)
    expect(m.group('g')?.collapsed).toBe(false)
    expect(m.toggleCollapsed('missing')).toBe(false)
  })

  it('moves the selection out of a group it folds away', () => {
    const m = model()
    open(m, 'inside', { groupId: 'g' })
    open(m, 'outside')
    m.activate('inside')

    m.setCollapsed('g', true)
    expect(m.activeId()).toBe('outside')
    assertOrdering(m)
  })

  it('keeps showing the selected tab when there is nowhere else for it to go', () => {
    const m = model()
    open(m, 'only', { groupId: 'g' })
    m.activate('only')
    m.setCollapsed('g', true)
    expect(m.activeId()).toBe('only') // folding it away would leave nothing selected
  })

  it('ungroups without closing anything', () => {
    const m = model()
    open(m, 'a', { groupId: 'g' })
    open(m, 'b', { groupId: 'g' })
    expect(m.ungroup('g')).toBe(true)
    expect(m.ungroup('g')).toBe(false)
    expect(ids(m)).toEqual(['a', 'b'])
    expect(m.tabs().every((tab) => tab.groupId === null)).toBe(true)
    expect(m.groups()).toEqual([])
    assertOrdering(m)
  })

  it('renames a group, and an empty name gives it back its key', () => {
    const m = model()
    const group = m.createGroup({ id: 'g', nameKey: 'tabs.group.new' })
    open(m, 'a', { groupId: 'g' })

    expect(m.renameGroup('g', '  Winter crops  ')).toBe(true)
    expect(m.group('g')?.name).toBe('Winter crops')
    expect(groupLabel(m.group('g') as NonNullable<typeof group>)).toBe('Winter crops')

    m.renameGroup('g', '   ')
    expect(m.group('g')?.name).toBeNull()
    expect(groupLabel(m.group('g') as NonNullable<typeof group>).length).toBeGreaterThan(0)
    expect(m.renameGroup('missing', 'x')).toBe(false)
  })

  it('takes a translatable name for a group the app made', () => {
    const m = model()
    m.createGroup({ id: 'g' })
    open(m, 'a', { groupId: 'g' })
    expect(m.setGroupTitleKey('g', 'tabs.strip.label')).toBe(true)
    expect(m.group('g')?.nameKey).toBe('tabs.strip.label')
    expect(m.setGroupTitleKey('missing', 'tabs.strip.label')).toBe(false)
  })
})

/* ------------------------------------------------------------------------ *
 * Subscription
 * ------------------------------------------------------------------------ */

describe('subscribe', () => {
  it('fires on every mutation and stops when unsubscribed', () => {
    const m = model()
    const seen = vi.fn()
    const off = m.subscribe(seen)

    open(m, 'a')
    open(m, 'b')
    m.setPinned('b', true)
    expect(seen).toHaveBeenCalledTimes(3)

    off()
    m.close('a')
    expect(seen).toHaveBeenCalledTimes(3)
    off()
  })

  it('keeps notifying the rest when one subscriber throws', () => {
    const m = model()
    const good = vi.fn()
    m.subscribe(() => {
      throw new Error('rude subscriber')
    })
    m.subscribe(good)
    expect(() => open(m, 'a')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})

/* ------------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------------ */

describe('persistence', () => {
  it('round-trips a whole strip through the persisted shape', () => {
    const source = model()
    open(source, 'farm', { pinned: true, kind: 'farm', closable: false })
    open(source, 'notes', { groupId: 'writing', titleParams: { count: 3 } })
    open(source, 'draft', { groupId: 'writing' })
    open(source, 'settings', { kind: 'settings' })
    source.renameGroup('writing', 'Writing')
    source.setCollapsed('writing', true)
    source.activate('settings')
    source.setDirty('draft', true)

    // Exactly what the store would hold: serialised, re-read, re-normalised.
    const wire = JSON.parse(JSON.stringify(source.snapshot())) as unknown
    const restored = model()
    restored.applyPersisted(normalizeTabState(wire))

    expect(ids(restored)).toEqual(ids(source))
    expect(restored.activeId()).toBe('settings')
    expect(restored.tab('farm')?.pinned).toBe(true)
    expect(restored.tab('farm')?.closable).toBe(false)
    expect(restored.tab('notes')?.titleParams).toEqual({ count: 3 })
    expect(restored.tab('notes')?.groupId).toBe('writing')
    expect(restored.group('writing')?.name).toBe('Writing')
    expect(restored.group('writing')?.collapsed).toBe(true)
    // Unsaved work belongs to the run, never to the store.
    expect(restored.tab('draft')?.dirty).toBe(false)
    assertOrdering(restored)
  })

  it('folds stored order in without discarding what this boot already opened', () => {
    const live = model()
    open(live, 'stored-a')
    open(live, 'opened-now')

    live.applyPersisted(
      normalizeTabState({
        tabs: [
          { id: 'stored-b', kind: 'doc', titleKey: 'tabs.strip.label' },
          { id: 'stored-a', kind: 'doc', titleKey: 'tabs.strip.label', pinned: true },
        ],
        groups: [],
        activeId: 'stored-b',
      }),
    )

    // Stored tabs supply order and pinning; the tab opened before the store answered stays.
    expect(ids(live)).toEqual(['stored-a', 'stored-b', 'opened-now'])
    expect(live.tab('stored-a')?.pinned).toBe(true)
    expect(live.activeId()).toBe('stored-b')
    assertOrdering(live)
  })

  it('reads hostile stored data without throwing and without inventing tabs', () => {
    for (const junk of [null, 42, 'nope', [], { tabs: 'no' }, { tabs: [1, 2, null] }]) {
      const state = normalizeTabState(junk)
      expect(state.tabs).toEqual([])
      expect(state.groups).toEqual([])
      expect(state.activeId).toBeNull()
    }

    const repaired = normalizeTabState({
      tabs: [
        { id: 'a', groupId: 'ghost' },
        { id: 'a' },
        { id: '' },
        { id: 'b', groupId: 'real', pinned: 'yes', closable: false },
      ],
      groups: [{ id: 'real' }, { id: 'real' }, {}],
      activeId: 'nobody',
    })
    expect(repaired.tabs.map((tab) => tab.id)).toEqual(['a', 'b'])
    expect(repaired.tabs[0].groupId).toBeNull() // the group never existed
    expect(repaired.tabs[1].pinned).toBe(false) // 'yes' is not true
    expect(repaired.tabs[1].closable).toBe(false)
    expect(repaired.groups.map((group) => group.id)).toEqual(['real'])
    expect(repaired.activeId).toBeNull()
  })

  it('writes the default strip through the store', async () => {
    const strip = getStrip()
    expect(strip.id).toBe(DEFAULT_STRIP_ID)
    expect(getStrip()).toBe(strip) // created once, then handed back
    expect(allStrips()).toContain(strip)

    open(strip, 'farm', { kind: 'farm', pinned: true })
    open(strip, 'settings', { kind: 'settings' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const stored = storeGet().tabs
    expect(stored.tabs.map((tab) => tab.id)).toEqual(['farm', 'settings'])
    expect(stored.tabs[0].pinned).toBe(true)
    expect(stored.activeId).toBe('settings')

    strip.close('farm')
    strip.close('settings')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(storeGet().tabs.tabs).toEqual([])
  })
})

/* ------------------------------------------------------------------------ *
 * The guarded close path
 * ------------------------------------------------------------------------ */

describe('requestCloseTabs', () => {
  afterEach(() => {
    confirmStub.mockReset()
    confirmStub.mockResolvedValue(false)
  })

  it('closes one clean tab without asking anything', async () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')

    const outcome = await requestCloseTabs(m, ['a'])

    expect(confirmStub).not.toHaveBeenCalled()
    expect(outcome).toEqual({ closed: ['a'], kept: [] })
    expect(ids(m)).toEqual(['b'])
  })

  it('refuses to close a dirty tab when the confirmation is declined', async () => {
    const m = model()
    open(m, 'draft')
    open(m, 'other')
    m.setDirty('draft', true)
    confirmStub.mockResolvedValue(false)

    const outcome = await requestCloseTabs(m, ['draft'])

    expect(confirmStub).toHaveBeenCalledTimes(1)
    expect(outcome.closed).toEqual([])
    expect(outcome.kept).toEqual(['draft'])
    expect(m.tab('draft')).toBeDefined()
    expect(ids(m)).toEqual(['draft', 'other'])
  })

  it('closes a dirty tab once the confirmation is given', async () => {
    const m = model()
    open(m, 'draft')
    open(m, 'other')
    m.setDirty('draft', true)
    confirmStub.mockResolvedValue(true)

    const outcome = await requestCloseTabs(m, ['draft'])

    expect(confirmStub).toHaveBeenCalledTimes(1)
    expect(outcome.closed).toEqual(['draft'])
    expect(ids(m)).toEqual(['other'])
  })

  it('names the tab and its unsaved state in what it asks', async () => {
    const m = model()
    open(m, 'draft', { titleKey: 'tabs.strip.label' })
    m.setDirty('draft', true)
    await requestCloseTabs(m, ['draft'])

    const asked = confirmStub.mock.calls[0][0] as Record<string, unknown>
    expect(asked.destructive).toBe(true)
    expect(asked.titleKey).toBe('tabs.unsaved.title')
    // The title is a fact, passed as a parameter — never baked into the sentence.
    expect(asked.titleParams).toEqual({ title: tabLabel(m.tab('draft') as Tab) })
  })

  it('asks once before a bulk close, and reports how many are unsaved', async () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    open(m, 'c')
    m.setDirty('b', true)
    confirmStub.mockResolvedValue(true)

    const outcome = await requestCloseTabs(m, ['a', 'b'])

    expect(confirmStub).toHaveBeenCalledTimes(1)
    const asked = confirmStub.mock.calls[0][0] as { params?: Record<string, number> }
    expect(asked.params).toEqual({ count: 2, unsaved: 1 })
    expect(outcome.closed).toEqual(['a', 'b'])
    expect(ids(m)).toEqual(['c'])
  })

  it('keeps everything when a bulk close is declined', async () => {
    const m = model()
    open(m, 'a')
    open(m, 'b')
    confirmStub.mockResolvedValue(false)

    const outcome = await requestCloseTabs(m, ['a', 'b'])

    expect(outcome.closed).toEqual([])
    expect(outcome.kept).toEqual(['a', 'b'])
    expect(ids(m)).toEqual(['a', 'b'])
  })

  it('never closes a tab the app locked, and never asks about it either', async () => {
    const m = model()
    open(m, 'farm', { closable: false })
    open(m, 'notes')

    const outcome = await requestCloseTabs(m, ['farm'])
    expect(confirmStub).not.toHaveBeenCalled()
    expect(outcome).toEqual({ closed: [], kept: ['farm'] })
    expect(m.tab('farm')).toBeDefined()

    confirmStub.mockResolvedValue(true)
    const mixed = await requestCloseTabs(m, ['farm', 'notes'])
    expect(mixed.closed).toEqual(['notes'])
    expect(mixed.kept).toEqual(['farm'])
  })

  it('treats a confirmation that cannot be shown as a refusal', async () => {
    const m = model()
    open(m, 'draft')
    m.setDirty('draft', true)
    confirmStub.mockRejectedValue(new Error('no document to draw a dialog on'))

    const outcome = await requestCloseTabs(m, ['draft'])

    expect(outcome.closed).toEqual([])
    expect(m.tab('draft')).toBeDefined()
  })

  it('does nothing, and asks nothing, for ids that are not tabs', async () => {
    const m = model()
    open(m, 'a')
    const outcome = await requestCloseTabs(m, ['ghost', 'phantom'])
    expect(confirmStub).not.toHaveBeenCalled()
    expect(outcome).toEqual({ closed: [], kept: ['ghost', 'phantom'] })
  })
})

/* ------------------------------------------------------------------------ *
 * Labels and reveal
 * ------------------------------------------------------------------------ */

describe('labels', () => {
  it('translates a known key and shows an unknown one verbatim', () => {
    expect(text('tabs.strip.label').length).toBeGreaterThan(0)
    expect(text('not.a.real.key')).toBe('not.a.real.key')
    expect(text('not.a.real.key', undefined, 'tabs.strip.label')).toBe(text('tabs.strip.label'))
  })

  it('reads a tab’s states as words, never as a colour alone', () => {
    const m = model()
    open(m, 'draft', { groupId: 'g', pinned: true })
    m.setDirty('draft', true)
    m.renameGroup('g', 'Writing')

    const name = tabAccessibleName(m, m.tab('draft') as Tab)
    expect(name).toContain(tabLabel(m.tab('draft') as Tab))
    expect(name).toContain('Writing')
    // Pinned and unsaved both add words of their own.
    expect(name.split(',').length).toBeGreaterThanOrEqual(4)
  })

  it('shortens a pinned label to one or two characters', () => {
    const m = model()
    const tab = open(m, 'x', { titleKey: 'tabs.strip.label' })
    const short = tabShortLabel(tab)
    expect(short.length).toBeGreaterThan(0)
    expect(short.length).toBeLessThanOrEqual(2)
    expect(short).toBe(short.toUpperCase())
  })

  it('names the strip', () => {
    expect(stripLabel(model()).length).toBeGreaterThan(0)
  })
})

describe('reveal', () => {
  it('expands the group and selects the tab', () => {
    const m = model()
    open(m, 'hidden', { groupId: 'g' })
    open(m, 'other')
    m.setCollapsed('g', true)
    m.activate('other')

    revealTab(m, 'hidden')

    expect(m.group('g')?.collapsed).toBe(false)
    expect(m.activeId()).toBe('hidden')
  })

  it('does nothing for a tab or group that is not there', () => {
    const m = model()
    open(m, 'a')
    expect(() => revealTab(m, 'ghost')).not.toThrow()
    expect(() => revealGroup(m, 'ghost')).not.toThrow()
    expect(m.activeId()).toBe('a')
  })

  it('reveals a group through its first tab', () => {
    const m = model()
    open(m, 'first', { groupId: 'g' })
    open(m, 'second', { groupId: 'g' })
    open(m, 'elsewhere')
    m.setCollapsed('g', true)

    revealGroup(m, 'g')

    expect(m.group('g')?.collapsed).toBe(false)
    expect(m.activeId()).toBe('first')
  })
})
