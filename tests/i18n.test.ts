/**
 * The facts-never-change law, mechanically enforced.
 *
 * `DESIGN.md` 10.4 says the funny level "never edits a fact: a number, a name, a file
 * path, a key binding, an error code and a crop price read identically at level 1 and
 * level 5". The only way that can be true is if every fact is an interpolated
 * `{parameter}` and every voice of every key carries exactly the same set of them.
 *
 * The first test in this file is that law. It walks every key in the catalogue, both
 * languages, all five levels, and refuses any key whose placeholder set is not identical
 * across all ten voices. Cross-language parity matters as much as per-language parity,
 * because `both` mode renders the two halves side by side: a fact present in English and
 * missing in Cantonese would vanish from half of what the user reads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { STRINGS, placeholdersOf } from '../src/shell/core/strings'
import type { StringEntry } from '../src/shell/core/strings'
import {
  BOTH_SEPARATOR,
  DEFAULT_FUNNY,
  DEFAULT_LANG,
  FUNNY_LEVELS,
  LANGS,
  availableKeys,
  getFunny,
  getLang,
  hasKey,
  onLangChange,
  setFunny,
  setLang,
  t,
} from '../src/shell/core/i18n'
import type { FunnyLevel, StringKey } from '../src/shell/core/i18n'

const ENTRIES = Object.entries(STRINGS) as Array<[string, StringEntry]>
const LEVEL_COUNT = 5

/** Every voice of one key, labelled, so a failure names the exact cell that broke. */
function voices(key: string, entry: StringEntry): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = []
  for (const which of ['en', 'yue'] as const) {
    entry[which].forEach((text, index) => {
      out.push({ label: `${key}.${which}[${index + 1}]`, text })
    })
  }
  return out
}

/* ------------------------------------------------------------------------ *
 * The law
 * ------------------------------------------------------------------------ */

describe('the funny level never edits a fact', () => {
  it('carries the same {parameter} set at all five levels, in both languages', () => {
    const offenders: string[] = []

    for (const [key, entry] of ENTRIES) {
      const seen = new Map<string, string[]>()
      for (const { label, text } of voices(key, entry)) {
        const signature = placeholdersOf(text).join('|')
        const bucket = seen.get(signature)
        if (bucket) bucket.push(label)
        else seen.set(signature, [label])
      }
      if (seen.size === 1) continue
      const detail = [...seen.entries()]
        .map(([signature, labels]) => `{${signature}} in ${labels.join(', ')}`)
        .join(' vs ')
      offenders.push(`${key}: ${detail}`)
    }

    expect(offenders, `keys whose facts change with the voice:\n${offenders.join('\n')}`).toEqual(
      [],
    )
  })

  it('agrees per language as well as across the pair', () => {
    // The assertion above is the stronger one; this one localises a failure to a single
    // language when the two disagree, which is the more common authoring slip.
    for (const which of ['en', 'yue'] as const) {
      const offenders: string[] = []
      for (const [key, entry] of ENTRIES) {
        const signatures = new Set(entry[which].map((text) => placeholdersOf(text).join('|')))
        if (signatures.size !== 1) offenders.push(`${key}.${which}: ${[...signatures].join(' vs ')}`)
      }
      expect(offenders, `${which} placeholder drift:\n${offenders.join('\n')}`).toEqual([])
    }
  })

  it('never leaves a half-written placeholder that the parity check would miss', () => {
    // `{count` is invisible to `placeholdersOf`, so a typo like it would sail past the
    // test above while printing a broken brace on screen. Balanced ASCII braces, in the
    // exact count of the placeholders found, is what rules that out.
    const offenders: string[] = []
    for (const [key, entry] of ENTRIES) {
      for (const { label, text } of voices(key, entry)) {
        const opens = (text.match(/\{/g) ?? []).length
        const closes = (text.match(/\}/g) ?? []).length
        const placeholders = (text.match(/\{[A-Za-z0-9_]+\}/g) ?? []).length
        if (opens !== closes || opens !== placeholders) {
          offenders.push(`${label}: ${JSON.stringify(text)}`)
        }
      }
    }
    expect(offenders, `malformed braces:\n${offenders.join('\n')}`).toEqual([])
  })
})

/* ------------------------------------------------------------------------ *
 * Catalogue completeness
 * ------------------------------------------------------------------------ */

describe('the catalogue', () => {
  it('holds a meaningful number of keys', () => {
    expect(ENTRIES.length).toBeGreaterThan(200)
  })

  it('gives every key both languages at all five levels', () => {
    const offenders: string[] = []
    for (const [key, entry] of ENTRIES) {
      for (const which of ['en', 'yue'] as const) {
        const level = entry[which] as unknown
        if (!Array.isArray(level)) {
          offenders.push(`${key}.${which} is not an array`)
          continue
        }
        if (level.length !== LEVEL_COUNT) {
          offenders.push(`${key}.${which} has ${level.length} levels, expected ${LEVEL_COUNT}`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('gives every level a non-empty, untrimmed-free string', () => {
    const offenders: string[] = []
    for (const [key, entry] of ENTRIES) {
      for (const { label, text } of voices(key, entry)) {
        if (typeof text !== 'string') offenders.push(`${label} is ${typeof text}`)
        else if (text.length === 0) offenders.push(`${label} is empty`)
        else if (text !== text.trim()) offenders.push(`${label} has edge whitespace`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('publishes exactly those keys through availableKeys(), sorted', () => {
    const keys = availableKeys()
    expect(keys).toHaveLength(ENTRIES.length)
    expect([...keys].sort()).toEqual(keys)
    expect(new Set(keys).size).toBe(keys.length)
    for (const [key] of ENTRIES) expect(keys).toContain(key)
  })

  it('hands out a fresh array each time, so a caller cannot edit the catalogue', () => {
    const first = availableKeys()
    first.length = 0
    expect(availableKeys().length).toBe(ENTRIES.length)
  })

  it('recognises its own keys and nothing else through hasKey()', () => {
    expect(hasKey('common.ok')).toBe(true)
    expect(hasKey('definitely.not.a.key')).toBe(false)
    // A key inherited from Object.prototype is not a key.
    expect(hasKey('toString')).toBe(false)
    expect(hasKey('__proto__')).toBe(false)
  })

  it('exports the language and level vocabularies the settings surface offers', () => {
    expect(LANGS).toEqual(['en', 'yue', 'both'])
    expect(FUNNY_LEVELS).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_LANG).toBe('en')
    expect(DEFAULT_FUNNY).toEqual({ en: 2, yue: 2 })
  })
})

/* ------------------------------------------------------------------------ *
 * t()
 * ------------------------------------------------------------------------ */

describe('t()', () => {
  afterEach(() => {
    setLang('en')
    setFunny({ en: 2, yue: 2 })
  })

  it('falls back visibly for an unknown key, returning the key itself', () => {
    const missing = 'no.such.key.at.all' as StringKey
    expect(t(missing)).toBe('no.such.key.at.all')
    expect(t(missing, { count: 3 })).toBe('no.such.key.at.all')
    // Never blank: a missing entry has to be obvious on screen, not invisible.
    expect(t(missing).length).toBeGreaterThan(0)
  })

  it('does not resolve inherited object properties as keys', () => {
    expect(t('constructor' as StringKey)).toBe('constructor')
    expect(t('__proto__' as StringKey)).toBe('__proto__')
  })

  it('substitutes every parameter it is given', () => {
    setLang('en')
    setFunny({ en: 1 })
    expect(t('common.more', { count: 4 })).toBe('4 more')
    expect(t('common.more', { count: '4' })).toBe('4 more')
  })

  it('leaves an unsupplied placeholder visible rather than blanking the fact', () => {
    setLang('en')
    setFunny({ en: 1 })
    expect(t('common.more')).toContain('{count}')
    expect(t('common.more', { other: 1 })).toContain('{count}')
  })

  it('refuses a non-finite number rather than printing NaN at the user', () => {
    setLang('en')
    setFunny({ en: 1 })
    expect(t('common.more', { count: Number.NaN })).toContain('{count}')
    expect(t('common.more', { count: Number.POSITIVE_INFINITY })).toContain('{count}')
  })

  it('changes voice with the funny level while the fact stands still', () => {
    setLang('en')
    const rendered = FUNNY_LEVELS.map((level) => {
      setFunny({ en: level })
      return t('common.more', { count: 7 })
    })
    for (const line of rendered) {
      expect(line).toContain('7')
      expect(line).not.toContain('{count}')
    }
    // Level 1 and level 5 are different voices carrying the identical fact.
    expect(rendered[0]).not.toBe(rendered[4])
  })

  it('dials the two languages independently', () => {
    setFunny({ en: 1, yue: 5 })
    expect(getFunny()).toEqual({ en: 1, yue: 5 })
    setLang('en')
    const plainEnglish = t('common.cancel')
    setLang('yue')
    const theatricalCantonese = t('common.cancel')
    setFunny({ yue: 1 })
    const plainCantonese = t('common.cancel')
    expect(theatricalCantonese).not.toBe(plainCantonese)
    setLang('en')
    expect(t('common.cancel')).toBe(plainEnglish)
  })

  it('hands out a copy of the funny levels, not the live object', () => {
    setFunny({ en: 3, yue: 4 })
    const levels = getFunny()
    levels.en = 1 as FunnyLevel
    expect(getFunny()).toEqual({ en: 3, yue: 4 })
  })
})

/* ------------------------------------------------------------------------ *
 * both mode
 * ------------------------------------------------------------------------ */

describe('bilingual mode', () => {
  afterEach(() => {
    setLang('en')
    setFunny({ en: 2, yue: 2 })
  })

  it('renders both halves, joined compactly', () => {
    setFunny({ en: 1, yue: 1 })
    setLang('en')
    const english = t('common.cancel')
    setLang('yue')
    const cantonese = t('common.cancel')
    setLang('both')
    const both = t('common.cancel')

    expect(english).not.toBe(cantonese)
    expect(both).toBe(`${english}${BOTH_SEPARATOR}${cantonese}`)
    expect(both).toContain(english)
    expect(both).toContain(cantonese)
    expect(both).not.toContain('\n')
  })

  it('interpolates the fact into both halves', () => {
    setLang('both')
    setFunny({ en: 1, yue: 1 })
    const line = t('common.more', { count: 12 })
    expect(line.split('12')).toHaveLength(3) // once per half
    expect(line).not.toContain('{count}')
    expect(line).toContain(BOTH_SEPARATOR)
  })

  it('does not repeat itself when the two languages happen to agree', () => {
    setLang('both')
    // `common.ok` is "OK" in both languages at every level.
    expect(t('common.ok')).toBe('OK')
  })

  it('reads every key in every mode at every level without throwing or blanking', () => {
    for (const lang of LANGS) {
      setLang(lang)
      for (const level of FUNNY_LEVELS) {
        setFunny({ en: level, yue: level })
        for (const [key] of ENTRIES) {
          const line = t(key as StringKey, { count: 1, name: 'x', title: 'x', action: 'x' })
          expect(typeof line).toBe('string')
          expect(line.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

/* ------------------------------------------------------------------------ *
 * change notification
 * ------------------------------------------------------------------------ */

describe('onLangChange', () => {
  afterEach(() => {
    setLang('en')
    setFunny({ en: 2, yue: 2 })
  })

  it('fires on a real change, not on a no-op, and unsubscribes cleanly', () => {
    setLang('en')
    setFunny({ en: 2, yue: 2 })

    const seen = vi.fn()
    const off = onLangChange(seen)

    setLang('en') // already English
    expect(seen).toHaveBeenCalledTimes(0)

    setLang('yue')
    expect(seen).toHaveBeenCalledTimes(1)

    setFunny({ en: 2 }) // already 2
    expect(seen).toHaveBeenCalledTimes(1)

    setFunny({ en: 5 })
    expect(seen).toHaveBeenCalledTimes(2)

    off()
    setLang('en')
    expect(seen).toHaveBeenCalledTimes(2)
    off() // twice is safe
  })

  it('keeps notifying the rest when one listener throws', () => {
    const good = vi.fn()
    const offBad = onLangChange(() => {
      throw new Error('rude listener')
    })
    const offGood = onLangChange(good)
    expect(() => setLang('yue')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    offBad()
    offGood()
  })

  it('ignores a value that is not a language or a level', () => {
    setLang('en')
    setLang('klingon' as unknown as 'en')
    expect(getLang()).toBe('en')

    setFunny({ en: 3 })
    setFunny({ en: 9 as unknown as FunnyLevel })
    expect(getFunny().en).toBe(3)
    setFunny({ en: 0 as unknown as FunnyLevel })
    expect(getFunny().en).toBe(3)
  })
})

/* ------------------------------------------------------------------------ *
 * persistence
 *
 * The store is a module singleton, so these run against freshly imported copies
 * with a stub `window.localStorage` underneath — the same path the browser takes.
 * ------------------------------------------------------------------------ */

type StoreModule = typeof import('../src/shell/core/store')
type I18nModule = typeof import('../src/shell/core/i18n')

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

async function freshModules(): Promise<{
  store: StoreModule
  i18n: I18nModule
  data: Map<string, string>
}> {
  vi.resetModules()
  const data = installWindow()
  const store = (await import('../src/shell/core/store')) as StoreModule
  const i18n = (await import('../src/shell/core/i18n')) as I18nModule
  return { store, i18n, data }
}

describe('language settings persist', () => {
  afterEach(() => {
    removeWindow()
    vi.resetModules()
  })

  it('writes the language and both funny levels through the store', async () => {
    const { store, i18n, data } = await freshModules()

    i18n.setLang('yue')
    i18n.setFunny({ en: 5, yue: 4 })
    await store.flush()

    const raw = data.get(store.SHELL_STORAGE_KEY)
    expect(raw, 'nothing reached storage').toBeTypeOf('string')
    const parsed = JSON.parse(raw as string) as { settings: { language: string; funny: unknown } }
    expect(parsed.settings.language).toBe('yue')
    expect(parsed.settings.funny).toEqual({ en: 5, yue: 4 })
  })

  it('touches nothing else in the record', async () => {
    const { store, i18n } = await freshModules()
    const before = store.get()

    i18n.setLang('both')
    await store.flush()

    const after = store.get()
    expect(after.settings.language).toBe('both')
    expect(after.settings.motion).toBe(before.settings.motion)
    expect(after.settings.displayScale).toBe(before.settings.displayScale)
    expect(after.settings.audio).toEqual(before.settings.audio)
    expect(after.settings.game).toEqual(before.settings.game)
    expect(after.appearance).toEqual(before.appearance)
    expect(after.history).toEqual(before.history)
  })

  it('reads a stored preference back on the next boot', async () => {
    const first = await freshModules()
    first.i18n.setLang('yue')
    first.i18n.setFunny({ yue: 5 })
    await first.store.flush()
    const stored = first.data.get(first.store.SHELL_STORAGE_KEY) as string
    removeWindow()

    vi.resetModules()
    const data = installWindow()
    const store = (await import('../src/shell/core/store')) as StoreModule
    const i18n = (await import('../src/shell/core/i18n')) as I18nModule
    data.set(store.SHELL_STORAGE_KEY, stored)

    expect(i18n.getLang()).toBe('en') // before the read comes back
    await store.load()
    expect(i18n.getLang()).toBe('yue')
    expect(i18n.getFunny().yue).toBe(5)
  })

  it('degrades to an in-memory preference when there is no storage at all', async () => {
    vi.resetModules()
    removeWindow()
    const i18n = (await import('../src/shell/core/i18n')) as I18nModule
    expect(() => i18n.setLang('yue')).not.toThrow()
    expect(i18n.getLang()).toBe('yue')
    expect(i18n.t('common.cancel').length).toBeGreaterThan(0)
  })
})
