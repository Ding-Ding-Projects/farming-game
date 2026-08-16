/**
 * The persistence spine.
 *
 * `docs/SHELL-CONTRACT.md` asks for a store that is "versioned, defensive, never throws
 * on malformed stored data — fall back to defaults per key rather than losing the whole
 * record". Per-key is the important half: a corrupt appearance blob must cost you the
 * appearance blob and nothing beside it.
 *
 * The store is a module singleton backed by `window.localStorage`, so every case here
 * imports a fresh copy with its own stub storage underneath. Nothing is mocked beyond
 * that: the sanitisers, the merge, the debounce and the write path all really run.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

type StoreModule = typeof import('../src/shell/core/store')
type Persisted = import('../src/shell/core/store').Persisted

/** A minimal `window` with the two things the store actually reaches for. */
function installWindow(): Map<string, string> {
  const data = new Map<string, string>()
  const fake = {
    localStorage: {
      getItem: (key: string): string | null => (data.has(key) ? (data.get(key) as string) : null),
      setItem: (key: string, value: string): void => {
        data.set(key, value)
      },
      removeItem: (key: string): void => {
        data.delete(key)
      },
    },
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  }
  ;(globalThis as unknown as Record<string, unknown>).window = fake
  return data
}

function removeWindow(): void {
  delete (globalThis as unknown as Record<string, unknown>).window
}

/** A store module with `raw` already sitting in its storage. */
async function storeWith(raw: string | null): Promise<{
  store: StoreModule
  data: Map<string, string>
}> {
  vi.resetModules()
  const data = installWindow()
  const store = (await import('../src/shell/core/store')) as StoreModule
  if (raw !== null) data.set(store.SHELL_STORAGE_KEY, raw)
  return { store, data }
}

/** What is actually sitting in storage right now, parsed. */
function readBack(store: StoreModule, data: Map<string, string>): Persisted {
  const raw = data.get(store.SHELL_STORAGE_KEY)
  expect(raw, 'nothing was written to storage').toBeTypeOf('string')
  return JSON.parse(raw as string) as Persisted
}

afterEach(() => {
  removeWindow()
  vi.resetModules()
})

/* ------------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------------ */

describe('defaults', () => {
  it('loads the documented defaults from empty storage', async () => {
    const { store } = await storeWith(null)
    const loaded = await store.load()
    expect(loaded).toEqual(store.defaults())
    expect(loaded.version).toBe(store.SCHEMA_VERSION)
    expect(loaded.settings.language).toBe('en')
    expect(loaded.settings.funny).toEqual({ en: 2, yue: 2 })
    expect(loaded.settings.motion).toBe('system')
    expect(loaded.settings.displayScale).toBe(100)
    expect(loaded.settings.audio).toEqual({ muted: false, volume: 0.7 })
    expect(loaded.settings.game.pixelScale).toBe('auto')
    expect(loaded.appearance).toEqual({})
    expect(loaded.tabs).toEqual({ tabs: [], groups: [], activeId: null })
    expect(loaded.history).toEqual([])
  })

  it('answers get() with the defaults before load() has resolved', async () => {
    const { store } = await storeWith('{"settings":{"language":"yue"}}')
    expect(store.isLoaded()).toBe(false)
    expect(store.get().settings.language).toBe('en')
    await store.load()
    expect(store.isLoaded()).toBe(true)
    expect(store.get().settings.language).toBe('yue')
  })

  it('builds a fresh object every time, so one caller cannot poison the next', async () => {
    const { store } = await storeWith(null)
    const first = store.defaults()
    first.settings.language = 'yue'
    first.history.push({ id: 1, at: 0, kind: 'system', summary: 'x' })
    expect(store.defaults().settings.language).toBe('en')
    expect(store.defaults().history).toEqual([])
  })

  it('shares one read between concurrent callers', async () => {
    const { store } = await storeWith('{"version":1,"settings":{"displayScale":150}}')
    const [a, b] = await Promise.all([store.load(), store.load()])
    expect(a).toBe(b)
    expect(a.settings.displayScale).toBe(150)
  })

  it('freezes the snapshot so nothing can mutate shared state behind its back', async () => {
    const { store } = await storeWith(null)
    const snapshot = await store.load()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.settings)).toBe(true)
    expect(Object.isFrozen(snapshot.settings.audio)).toBe(true)
    expect(Object.isFrozen(snapshot.history)).toBe(true)
  })
})

/* ------------------------------------------------------------------------ *
 * Degrading per key
 * ------------------------------------------------------------------------ */

describe('malformed data degrades per key', () => {
  it('loses a corrupt appearance blob and keeps the settings beside it', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        version: 1,
        settings: { language: 'yue', displayScale: 150, audio: { muted: true, volume: 0.25 } },
        appearance: 'this is not an appearance map',
        tabs: { tabs: [{ id: 'farm', kind: 'farm', titleKey: 'tab.farm' }], activeId: 'farm' },
        history: [{ id: 4, at: 10, kind: 'game', summary: 'game.harvest' }],
      }),
    )
    const loaded = await store.load()

    expect(loaded.appearance).toEqual({})
    // Everything else survived intact.
    expect(loaded.settings.language).toBe('yue')
    expect(loaded.settings.displayScale).toBe(150)
    expect(loaded.settings.audio).toEqual({ muted: true, volume: 0.25 })
    expect(loaded.tabs.tabs.map((tab) => tab.id)).toEqual(['farm'])
    expect(loaded.tabs.activeId).toBe('farm')
    expect(loaded.history).toHaveLength(1)
    expect(loaded.history[0].summary).toBe('game.harvest')
  })

  it('drops only the broken elements of an appearance map, not the map', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        version: 1,
        appearance: {
          'shell.titlebar': { color: '#f2a541', fontSizePct: 120 },
          'shell.evil': { color: 'url(javascript:alert(1))' },
          'shell.wrongType': 42,
          'shell.empty': {},
          'shell.partly': { color: '#8fb8c9', paddingPx: 'nonsense', hidden: true },
        },
      }),
    )
    const loaded = await store.load()

    expect(Object.keys(loaded.appearance).sort()).toEqual(['shell.partly', 'shell.titlebar'])
    expect(loaded.appearance['shell.titlebar']).toEqual({ color: '#f2a541', fontSizePct: 120 })
    // The bad field went; the good fields beside it stayed.
    expect(loaded.appearance['shell.partly']).toEqual({ color: '#8fb8c9', hidden: true })
  })

  it('clamps out-of-range settings instead of discarding the section', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        settings: {
          language: 'martian',
          funny: { en: 99, yue: -4 },
          motion: 'wobbly',
          displayScale: 130,
          audio: { muted: 'yes please', volume: 40 },
          game: { pixelScale: 99, autosave: 'no', particles: false },
        },
      }),
    )
    const loaded = await store.load()

    expect(loaded.settings.language).toBe('en') // unknown value, back to the default
    expect(loaded.settings.funny).toEqual({ en: 5, yue: 1 }) // clamped into 1..5
    expect(loaded.settings.motion).toBe('system')
    expect(loaded.settings.displayScale).toBe(125) // 130 snaps to the nearest rung
    expect(loaded.settings.audio.muted).toBe(false) // wrong type, back to the default
    expect(loaded.settings.audio.volume).toBe(1) // clamped into 0..1
    expect(loaded.settings.game.pixelScale).toBe('auto')
    expect(loaded.settings.game.autosave).toBe(true)
    expect(loaded.settings.game.particles).toBe(false) // a real value is respected
  })

  it('turns a tab pointing at a vanished group into a loose tab', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        tabs: {
          tabs: [
            { id: 'a', kind: 'doc', groupId: 'ghost' },
            { id: 'a', kind: 'doc' },
            { id: '', kind: 'doc' },
            { id: 'b', kind: 'doc', groupId: 'real' },
          ],
          groups: [{ id: 'real' }],
          activeId: 'nobody',
        },
      }),
    )
    const loaded = await store.load()

    expect(loaded.tabs.tabs.map((tab) => tab.id)).toEqual(['a', 'b']) // duplicate and blank dropped
    expect(loaded.tabs.tabs[0].groupId).toBeNull()
    expect(loaded.tabs.tabs[1].groupId).toBe('real')
    expect(loaded.tabs.activeId).toBe('a') // an unknown active id falls to the first tab
  })

  it('repairs history ids and drops entries with nothing to say', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        history: [
          { id: 5, at: 1, kind: 'game', summary: 'one' },
          { id: 5, at: 2, kind: 'nonsense', summary: 'two' },
          { id: 'x', at: 3, summary: '   ' },
          { id: 2, at: 4, kind: 'error', summary: 'three' },
          'not an entry',
        ],
      }),
    )
    const loaded = await store.load()

    expect(loaded.history.map((entry) => entry.summary)).toEqual(['one', 'two', 'three'])
    expect(loaded.history[1].kind).toBe('system') // an unknown kind is not a reason to drop it
    const ids = loaded.history.map((entry) => entry.id)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps only the newest entries when the stored log is over the limit', async () => {
    const count = 1200 // comfortably past any sane HISTORY_LIMIT
    const oversized = Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      at: index,
      kind: 'system',
      summary: `entry-${index}`,
    }))
    const { store } = await storeWith(JSON.stringify({ history: oversized }))
    const loaded = await store.load()

    expect(store.HISTORY_LIMIT).toBeLessThan(count)
    expect(loaded.history).toHaveLength(store.HISTORY_LIMIT)
    // The newest survived and the oldest are the ones that went.
    expect(loaded.history[loaded.history.length - 1].summary).toBe(`entry-${count - 1}`)
    expect(loaded.history[0].summary).toBe(`entry-${count - store.HISTORY_LIMIT}`)
  })
})

/* ------------------------------------------------------------------------ *
 * Version
 * ------------------------------------------------------------------------ */

describe('version', () => {
  it('falls back to the current schema version when the stored one is not a number', async () => {
    const { store } = await storeWith(
      JSON.stringify({ version: 'banana', settings: { displayScale: 200 } }),
    )
    const loaded = await store.load()
    expect(loaded.version).toBe(store.SCHEMA_VERSION)
    expect(loaded.settings.displayScale).toBe(200) // the data beside it still reads
  })

  it('reads a record from the future field by field rather than throwing it away', async () => {
    const { store } = await storeWith(
      JSON.stringify({
        version: 9999,
        settings: { language: 'yue', unknownFutureField: { nested: true } },
        futureSection: [1, 2, 3],
      }),
    )
    const loaded = await store.load()
    expect(loaded.settings.language).toBe('yue')
    expect(loaded).not.toHaveProperty('futureSection')
    expect(loaded.settings).not.toHaveProperty('unknownFutureField')
  })

  it('writes the current schema version back on the next save', async () => {
    const { store, data } = await storeWith(JSON.stringify({ version: 9999, settings: {} }))
    await store.load()
    await store.save({ settings: { motion: 'reduced' } })
    await store.flush()
    expect(store.get().version).toBe(store.SCHEMA_VERSION)
    expect(readBack(store, data).version).toBe(store.SCHEMA_VERSION)
  })
})

/* ------------------------------------------------------------------------ *
 * Never throws
 * ------------------------------------------------------------------------ */

describe('malformed JSON never throws', () => {
  const junk: Array<[string, string]> = [
    ['a truncated object', '{"settings": {'],
    ['bare garbage', 'not json at all'],
    ['an empty string', ''],
    ['a lone null', 'null'],
    ['an array', '[1,2,3]'],
    ['a quoted string', '"just a string"'],
    ['a number', '42'],
    ['a booby-trapped prototype', '{"__proto__":{"polluted":true},"settings":{"language":"yue"}}'],
    ['sections of the wrong type', '{"settings":5,"appearance":[],"tabs":"no","history":{}}'],
    ['nested nonsense', '{"settings":{"funny":"loud","audio":null,"game":[]}}'],
  ]

  for (const [label, raw] of junk) {
    it(`survives ${label}`, async () => {
      const { store } = await storeWith(raw)
      const loaded = await store.load()
      expect(loaded.version).toBe(store.SCHEMA_VERSION)
      expect(store.LANGS).toContain(loaded.settings.language)
      expect(loaded.settings.funny.en).toBeGreaterThanOrEqual(1)
      expect(loaded.settings.funny.en).toBeLessThanOrEqual(5)
      expect(loaded.appearance).toBeTypeOf('object')
      expect(Array.isArray(loaded.history)).toBe(true)
      expect(Array.isArray(loaded.tabs.tabs)).toBe(true)
      // Prototype pollution never happened.
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
      // And the store is still usable afterwards.
      await store.save({ settings: { motion: 'reduced' } })
      expect(store.get().settings.motion).toBe('reduced')
    })
  }

  it('shrugs off a storage layer that throws on every call', async () => {
    vi.resetModules()
    const angry = {
      localStorage: {
        getItem: (): string => {
          throw new Error('storage is disabled')
        },
        setItem: (): void => {
          throw new Error('quota exceeded')
        },
        removeItem: (): void => {
          throw new Error('no')
        },
      },
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }
    ;(globalThis as unknown as Record<string, unknown>).window = angry
    const store = (await import('../src/shell/core/store')) as StoreModule

    await expect(store.load()).resolves.toEqual(store.defaults())
    await expect(store.save({ settings: { language: 'yue' } })).resolves.toBeUndefined()
    expect(store.get().settings.language).toBe('yue') // the session still honours it
    await expect(store.resetAll()).resolves.toBeUndefined()
  })

  it('ignores a patch it cannot make sense of and keeps the record it had', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({ settings: { displayScale: 150 } })
    const before = store.get()

    await store.save({ settings: null as never })
    await store.save({ appearance: null as never })
    await store.save({ tabs: null as never })

    expect(store.get().settings.displayScale).toBe(150)
    expect(store.get()).toEqual(before)
  })
})

/* ------------------------------------------------------------------------ *
 * save / merge
 * ------------------------------------------------------------------------ */

describe('save', () => {
  it('merges one field without rebuilding the section around it', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    await store.save({ settings: { audio: { volume: 0.2 } } })
    await store.flush()

    expect(store.get().settings.audio).toEqual({ muted: false, volume: 0.2 })
    expect(readBack(store, data).settings.audio.volume).toBe(0.2)
  })

  it('merges appearance per element and then per field', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({ appearance: { 'shell.tab': { color: '#f2a541', paddingPx: 4 } } })
    await store.save({ appearance: { 'shell.tab': { paddingPx: 8 } } })

    expect(store.get().appearance['shell.tab']).toEqual({ color: '#f2a541', paddingPx: 8 })
  })

  it('deletes an element with an explicit null', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({ appearance: { a: { color: '#cccccc' }, b: { color: '#dddddd' } } })
    await store.save({ appearance: { a: null } })

    expect(Object.keys(store.get().appearance)).toEqual(['b'])
  })

  it('clears one field with an explicit undefined', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({ appearance: { a: { color: '#cccccc', paddingPx: 6 } } })
    await store.save({ appearance: { a: { color: undefined } } })

    expect(store.get().appearance['a']).toEqual({ paddingPx: 6 })
  })

  it('rejects a value that could smuggle a second declaration into an inline style', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({
      appearance: {
        a: { color: 'red; background: url(http://example.com/x.png)' },
        b: { color: '#f2a541' },
      },
    })
    expect(store.get().appearance['a']).toBeUndefined()
    expect(store.get().appearance['b']).toEqual({ color: '#f2a541' })
  })

  it('resolves only once the bytes are really out', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    await store.save({ settings: { language: 'both' } })
    expect(readBack(store, data).settings.language).toBe('both')
  })

  it('coalesces a burst of writes and still stores the last one', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    const writes = [1, 2, 3, 4, 5].map((n) =>
      store.save({ settings: { audio: { volume: n / 10 } } }),
    )
    await Promise.all(writes)
    expect(store.get().settings.audio.volume).toBeCloseTo(0.5)
    expect(readBack(store, data).settings.audio.volume).toBeCloseTo(0.5)
  })
})

/* ------------------------------------------------------------------------ *
 * subscribe
 * ------------------------------------------------------------------------ */

describe('subscribe', () => {
  it('notifies on every committed change and stops when unsubscribed', async () => {
    const { store } = await storeWith(null)
    await store.load()

    const seen: string[] = []
    const off = store.subscribe((record) => {
      seen.push(record.settings.language)
    })

    await store.save({ settings: { language: 'yue' } })
    await store.save({ settings: { language: 'both' } })
    expect(seen).toEqual(['yue', 'both'])

    off()
    await store.save({ settings: { language: 'en' } })
    expect(seen).toEqual(['yue', 'both'])

    off() // calling it twice is safe
    expect(store.get().settings.language).toBe('en')
  })

  it('hands the subscriber the same frozen snapshot get() returns', async () => {
    const { store } = await storeWith(null)
    await store.load()
    let received: Persisted | null = null
    const off = store.subscribe((record) => {
      received = record
    })
    await store.save({ settings: { motion: 'full' } })
    off()
    expect(received).toBe(store.get())
    expect(Object.isFrozen(received as unknown as object)).toBe(true)
  })

  it('fires when the load resolves, so a subscriber added early still sees the record', async () => {
    const { store } = await storeWith('{"settings":{"language":"yue"}}')
    const seen: string[] = []
    const off = store.subscribe((record) => {
      seen.push(record.settings.language)
    })
    await store.load()
    off()
    expect(seen).toEqual(['yue'])
  })

  it('keeps notifying the rest when one subscriber throws', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    const good = vi.fn()
    const offBad = store.subscribe(() => {
      throw new Error('rude subscriber')
    })
    const offGood = store.subscribe(good)

    await expect(store.save({ settings: { language: 'yue' } })).resolves.toBeUndefined()
    expect(good).toHaveBeenCalledTimes(1)
    // And the write behind the rude subscriber still happened.
    expect(readBack(store, data).settings.language).toBe('yue')

    offBad()
    offGood()
  })
})

/* ------------------------------------------------------------------------ *
 * resetAll
 * ------------------------------------------------------------------------ */

describe('resetAll', () => {
  it('puts everything back and empties the stored record', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    await store.save({
      settings: { language: 'yue', displayScale: 200, motion: 'reduced' },
      appearance: { 'shell.tab': { color: '#f2a541' } },
      tabs: { tabs: [{ id: 'a', kind: 'doc', titleKey: 'a', groupId: null, pinned: false, closable: true }], activeId: 'a' },
      history: [{ id: 1, at: 1, kind: 'system', summary: 'something' }],
    })
    expect(store.get().settings.language).toBe('yue')

    await store.resetAll()

    expect(store.get()).toEqual(store.defaults())
    expect(data.has(store.SHELL_STORAGE_KEY)).toBe(false)
  })

  it('notifies subscribers', async () => {
    const { store } = await storeWith(null)
    await store.load()
    await store.save({ settings: { language: 'yue' } })
    const seen = vi.fn()
    const off = store.subscribe(seen)
    await store.resetAll()
    off()
    expect(seen).toHaveBeenCalledTimes(1)
    expect(store.get().settings.language).toBe('en')
  })

  it('cancels a pending write rather than letting it land after the reset', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    const pending = store.save({ settings: { language: 'yue' } })
    await store.resetAll()
    await pending

    expect(store.get()).toEqual(store.defaults())
    expect(data.has(store.SHELL_STORAGE_KEY)).toBe(false)
  })

  it('leaves the store usable afterwards', async () => {
    const { store, data } = await storeWith(null)
    await store.load()
    await store.resetAll()
    await store.save({ settings: { displayScale: 150 } })
    await store.flush()
    expect(readBack(store, data).settings.displayScale).toBe(150)
  })
})
