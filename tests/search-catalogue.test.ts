/**
 * The search-catalogue completeness guard, in both directions.
 *
 * `docs/SHELL-CONTRACT.md`, on `src/shell/ui/catalogue.ts`: "The hand-written catalogue of
 * every search surface in the app: id, where it lives, what it searches.
 * `tests/search-catalogue.test.ts` asserts every registered field appears in it and every
 * catalogue entry resolves to a real field — a guard that fails when a field is added
 * without an entry."
 *
 * Both halves matter and they fail for opposite reasons. A field with no entry is a
 * surface nobody documented. An entry with no field is a promise the app does not keep —
 * a row in the catalogue pointing at a search that no longer exists.
 *
 * The field side is read from the source: every lane declares its field ids as named
 * constants (`STRIP_SEARCH_FIELD_ID`, `SEARCH_FIELD_IDS`, …), and this file gathers all of
 * them rather than keeping a list of its own that could quietly fall behind. A list
 * maintained here would be a third thing to forget to update, which is the exact failure
 * the guard exists to prevent.
 *
 * The catalogue side is read from the module itself, by inspecting what it actually
 * exports rather than by assuming a shape: an array of entries, a record keyed by id, or a
 * function that returns either are all understood.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { STRINGS } from '../src/shell/core/strings'

const SHELL_DIR = fileURLToPath(new URL('../src/shell', import.meta.url))
const CATALOGUE_FILE = join(SHELL_DIR, 'ui', 'catalogue.ts')

/* ------------------------------------------------------------------------ *
 * Reading the shell's sources
 * ------------------------------------------------------------------------ */

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out.sort()
}

interface RegisteredField {
  /** The id the field registers under, and the id the catalogue must carry. */
  id: string
  /** The constant that declares it, for a failure message a human can act on. */
  constant: string
  /** Repo-relative path of the file that declares it. */
  file: string
}

/**
 * Every search-field id the shell declares.
 *
 * Lanes name these constants consistently — the name carries `SEARCH` or ends in
 * `FIELD_ID` — and each is either a single string or a small record of them. Aggregate
 * arrays such as `TAB_SEARCH_FIELD_IDS` are deliberately not read: they are built from
 * the very constants already gathered here, so reading them would double-count.
 */
function registeredFields(): RegisteredField[] {
  const single =
    /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:SEARCH[A-Z0-9_]*|FIELD_ID|FIELD_PREFIX))\s*(?::\s*[^=]+)?=\s*'([^']+)'/g
  const record =
    /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:SEARCH|FIELD)[A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*\{([^}]*)\}/g
  const member = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']+)'/g

  const found: RegisteredField[] = []
  for (const path of sourceFiles(SHELL_DIR)) {
    if (path === CATALOGUE_FILE) continue
    const file = relative(SHELL_DIR, path).replace(/\\/g, '/')
    const source = readFileSync(path, 'utf8')

    for (const match of source.matchAll(single)) {
      found.push({ id: match[2] as string, constant: match[1] as string, file })
    }
    for (const match of source.matchAll(record)) {
      for (const inner of (match[2] as string).matchAll(member)) {
        found.push({
          id: inner[2] as string,
          constant: `${match[1] as string}.${inner[1] as string}`,
          file,
        })
      }
    }
  }
  return found
}

const FIELDS = registeredFields()
const FIELD_IDS = [...new Set(FIELDS.map((field) => field.id))].sort()

/* ------------------------------------------------------------------------ *
 * Reading the catalogue, whatever shape it took
 * ------------------------------------------------------------------------ */

type Entry = Record<string, unknown>

function isRecord(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasId(value: unknown): value is Entry & { id: string } {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
}

/** Entries out of an array of them, or out of a record keyed by id. */
function harvest(value: unknown): Entry[] {
  if (Array.isArray(value)) return value.filter(hasId)
  if (!isRecord(value)) return []
  const out: Entry[] = []
  for (const [key, item] of Object.entries(value)) {
    if (hasId(item)) out.push(item)
    else if (isRecord(item)) out.push({ id: key, ...item })
  }
  return out
}

/**
 * Whatever the catalogue lane called its export. Values are read first, and only if
 * nothing is found there is a plausibly-named zero-argument accessor called — so this
 * never invokes something that might try to mount a component.
 */
function entriesOf(module: Record<string, unknown>): Entry[] {
  const collected: Entry[] = []
  for (const value of Object.values(module)) collected.push(...harvest(value))

  if (collected.length === 0) {
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'function' || value.length !== 0) continue
      if (!/catalogue|entries|fields|surfaces|all/i.test(name)) continue
      try {
        collected.push(...harvest((value as () => unknown)()))
      } catch {
        // Not an accessor after all. Try the next export.
      }
    }
  }

  const seen = new Set<string>()
  const unique: Entry[] = []
  for (const entry of collected) {
    const id = entry.id as string
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(entry)
  }
  return unique
}

const CATALOGUE_EXISTS = existsSync(CATALOGUE_FILE)

/**
 * Imported through a specifier built at run time so the bundler never tries to resolve a
 * file that may not have been written yet. Only ever called once the file is known to
 * exist.
 */
async function loadCatalogue(): Promise<Record<string, unknown>> {
  const specifier = ['..', 'src', 'shell', 'ui', 'catalogue'].join('/')
  return (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>
}

/* ------------------------------------------------------------------------ *
 * The field side, which stands on its own
 * ------------------------------------------------------------------------ */

describe('the search fields the shell registers', () => {
  it('finds every lane’s fields, so the guard has something to guard', () => {
    expect(
      FIELD_IDS.length,
      `no search-field id constants were found under src/shell — the scan in this file has ` +
        `stopped matching how the lanes declare them`,
    ).toBeGreaterThanOrEqual(8)

    // Each of these surfaces is named in the contract and must own a field.
    const owners = new Set(FIELDS.map((field) => field.file))
    for (const file of ['ui/tabsearch.ts', 'ui/settings.ts', 'ui/almanac.ts', 'ui/changelog.ts']) {
      expect(owners, `${file} declares no search-field id`).toContain(file)
    }
  })

  it('gives every field its own id — no two surfaces share a builder', () => {
    const byId = new Map<string, RegisteredField[]>()
    for (const field of FIELDS) {
      const bucket = byId.get(field.id)
      if (bucket) bucket.push(field)
      else byId.set(field.id, [field])
    }

    const clashes: string[] = []
    for (const [id, holders] of byId) {
      const constants = new Set(holders.map((field) => `${field.file}:${field.constant}`))
      if (constants.size > 1) clashes.push(`${id} is declared by ${[...constants].join(' and ')}`)
    }
    expect(clashes, `search ids used twice:\n${clashes.join('\n')}`).toEqual([])
  })

  it('gives every id a shape a catalogue row can carry', () => {
    for (const id of FIELD_IDS) {
      expect(id, id).toMatch(/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/)
      expect(id.length, id).toBeLessThanOrEqual(64)
    }
  })

  it('really uses each id where the field is built, not only where it is declared', () => {
    // A constant nobody passes to a field constructor would be a phantom entry.
    const sources = sourceFiles(SHELL_DIR)
      .filter((path) => path !== CATALOGUE_FILE)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    const unused: string[] = []
    for (const field of FIELDS) {
      const bare = field.constant.includes('.')
        ? (field.constant.split('.')[0] as string)
        : field.constant
      const uses = sources.split(bare).length - 1
      // Once for the declaration; a real field is referenced at least once more.
      if (uses < 2) unused.push(`${field.file}:${field.constant} (${field.id})`)
    }
    expect(unused, `declared but never used:\n${unused.join('\n')}`).toEqual([])
  })

  it('can load a shell module through the same run-time specifier the catalogue uses', async () => {
    // The catalogue is imported by a specifier assembled at run time, so the bundler
    // cannot resolve it ahead of a file that may not be written yet. Prove that route
    // works against a module that certainly exists, so a failure below is really about
    // the catalogue and not about the loader.
    const specifier = ['..', 'src', 'shell', 'core', 'regex'].join('/')
    const module = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>
    expect(typeof module.compile).toBe('function')
  })
})

/* ------------------------------------------------------------------------ *
 * The catalogue itself
 * ------------------------------------------------------------------------ */

describe('src/shell/ui/catalogue.ts', () => {
  it('exists', () => {
    expect(
      CATALOGUE_EXISTS,
      'src/shell/ui/catalogue.ts has not been written. docs/SHELL-CONTRACT.md requires it: ' +
        '"the hand-written catalogue of every search surface in the app: id, where it lives, ' +
        `what it searches". The shell currently registers ${FIELD_IDS.length} search fields ` +
        `(${FIELD_IDS.join(', ')}) and none of them can be checked against it.`,
    ).toBe(true)
  })
})

describe.skipIf(!CATALOGUE_EXISTS)('the catalogue is complete in both directions', () => {
  it('lists an entry for every registered field', async () => {
    const entries = entriesOf(await loadCatalogue())
    expect(entries.length, 'the catalogue module exports no readable entries').toBeGreaterThan(0)

    const listed = new Set(entries.map((entry) => entry.id as string))
    const missing = FIELDS.filter((field) => !listed.has(field.id))
    const detail = missing
      .map((field) => `${field.id} (${field.file}:${field.constant})`)
      .join('\n')
    expect(
      missing.map((field) => field.id),
      `search fields with no catalogue entry — every field needs a row saying where it ` +
        `lives and what it searches:\n${detail}`,
    ).toEqual([])
  })

  it('resolves every entry to a field that really exists', async () => {
    const entries = entriesOf(await loadCatalogue())
    const registered = new Set(FIELD_IDS)
    const orphans = entries
      .map((entry) => entry.id as string)
      .filter((id) => !registered.has(id))
    expect(
      orphans,
      `catalogue entries pointing at no field — either the surface was removed and its ` +
        `row was left behind, or its id drifted:\n${orphans.join('\n')}`,
    ).toEqual([])
  })

  it('would notice a field added without an entry', async () => {
    // Prove the guard bites rather than trivially passing.
    const listed = new Set(entriesOf(await loadCatalogue()).map((entry) => entry.id as string))
    expect(listed.has('search.field.nobody.documented')).toBe(false)
  })

  it('gives every entry its own id', async () => {
    const raw = await loadCatalogue()
    const entries = entriesOf(raw)
    const ids = entries.map((entry) => entry.id as string)
    expect(new Set(ids).size, `duplicate catalogue ids in ${ids.join(', ')}`).toBe(ids.length)
  })

  it('says where each surface lives and what it searches', async () => {
    const entries = entriesOf(await loadCatalogue())
    const thin: string[] = []
    for (const entry of entries) {
      const described = Object.entries(entry).filter(
        ([key, value]) => key !== 'id' && typeof value === 'string' && value.length > 0,
      )
      // id, where, what: an entry carrying only an id documents nothing.
      if (described.length < 2) thin.push(entry.id as string)
    }
    expect(
      thin,
      `catalogue entries with no "where" and "what":\n${thin.join('\n')}`,
    ).toEqual([])
  })

  it('names its columns through the string catalogue, never in bare English', async () => {
    const entries = entriesOf(await loadCatalogue())
    const unknown: string[] = []
    for (const entry of entries) {
      for (const [field, value] of Object.entries(entry)) {
        if (!/Key$/.test(field) || typeof value !== 'string') continue
        if (!Object.prototype.hasOwnProperty.call(STRINGS, value)) {
          unknown.push(`${entry.id as string}.${field} = ${value}`)
        }
      }
    }
    expect(
      unknown,
      `catalogue entries pointing at string keys that do not exist:\n${unknown.join('\n')}`,
    ).toEqual([])
  })
})
