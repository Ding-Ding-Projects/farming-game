/**
 * The activity log and the three ways out of it.
 *
 * `docs/SHELL-CONTRACT.md`: "Local only. Bounded to a sensible entry count with the oldest
 * dropped. Export covers the save, the settings, the appearance map and the history."
 *
 * Two things get particular attention. First, eviction: the log has to stay bounded while
 * keeping the newest, because an unbounded log in `localStorage` is a slow leak. Second,
 * CSV quoting: a summary containing a comma, a quote or a line break must survive a
 * round-trip through the file, and the only honest way to assert that is to parse the CSV
 * back out with a real RFC 4180 reader, which this file carries.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

type StoreModule = typeof import('../src/shell/core/store')
type HistoryModule = typeof import('../src/shell/core/history')
type ExportModule = typeof import('../src/shell/core/export')
type HistoryEntry = import('../src/shell/core/store').HistoryEntry

/** The three modules share one store singleton, so each case gets a fresh set. */
async function fresh(): Promise<{
  store: StoreModule
  history: HistoryModule
  exporter: ExportModule
}> {
  vi.resetModules()
  const store = (await import('../src/shell/core/store')) as StoreModule
  const history = (await import('../src/shell/core/history')) as HistoryModule
  const exporter = (await import('../src/shell/core/export')) as ExportModule
  return { store, history, exporter }
}

afterEach(() => {
  vi.resetModules()
})

/* ------------------------------------------------------------------------ *
 * An RFC 4180 reader, so "valid CSV" is proved rather than asserted by eye
 * ------------------------------------------------------------------------ */

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let started = false
  let i = 0

  const endField = (): void => {
    row.push(field)
    field = ''
    started = false
  }
  const endRow = (): void => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const character = text[i] as string
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += character
      i += 1
      continue
    }
    if (character === '"' && !started) {
      quoted = true
      started = true
      i += 1
      continue
    }
    if (character === ',') {
      endField()
      i += 1
      continue
    }
    if (character === '\r' && text[i + 1] === '\n') {
      endRow()
      i += 2
      continue
    }
    if (character === '\n' || character === '\r') {
      endRow()
      i += 1
      continue
    }
    field += character
    started = true
    i += 1
  }
  if (field.length > 0 || row.length > 0) endRow()
  return rows
}

describe('the CSV reader this file checks against', () => {
  it('reads the shapes RFC 4180 defines', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseCsv('"a,b",c\r\n')).toEqual([['a,b', 'c']])
    expect(parseCsv('"he said ""hi""",c\r\n')).toEqual([['he said "hi"', 'c']])
    expect(parseCsv('"one\r\ntwo",c\r\n')).toEqual([['one\r\ntwo', 'c']])
    expect(parseCsv('a,,c\r\n')).toEqual([['a', '', 'c']])
  })
})

/* ------------------------------------------------------------------------ *
 * record
 * ------------------------------------------------------------------------ */

describe('record', () => {
  it('appends an entry with its key, its facts and a timestamp', async () => {
    const { history } = await fresh()
    const before = Date.now()
    history.record('game', 'game.harvested', undefined, { crop: 'parsnip', count: 3 })
    const after = Date.now()

    const entries = history.all()
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('game')
    // A key, not a sentence — so the line re-reads in whatever language is on later.
    expect(entries[0].summary).toBe('game.harvested')
    expect(entries[0].params).toEqual({ crop: 'parsnip', count: 3 })
    expect(entries[0].at).toBeGreaterThanOrEqual(before)
    expect(entries[0].at).toBeLessThanOrEqual(after)
  })

  it('returns entries newest first', async () => {
    const { history } = await fresh()
    history.record('system', 'one')
    history.record('system', 'two')
    history.record('system', 'three')
    expect(history.all().map((entry) => entry.summary)).toEqual(['three', 'two', 'one'])
  })

  it('numbers entries monotonically and never reuses an id', async () => {
    const { history } = await fresh()
    for (let n = 0; n < 5; n += 1) history.record('system', `entry-${n}`)
    const ids = history.all().map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort((a, b) => a - b)).toEqual([...ids].reverse())
  })

  it('takes a detail blob, and lifts a params object out of it', async () => {
    const { history } = await fresh()
    history.record('data', 'data.exported', { format: 'csv', params: { bytes: 120 } })
    const [entry] = history.all()
    expect(entry.params).toEqual({ bytes: 120 })
    expect(entry.detail).toEqual({ format: 'csv' })
  })

  it('offers the two-fact shape as recordWith', async () => {
    const { history } = await fresh()
    history.recordWith('settings', 'settings.changed', { setting: 'motion', value: 'reduced' })
    expect(history.all()[0].params).toEqual({ setting: 'motion', value: 'reduced' })
  })

  it('refuses an empty key rather than logging a blank line', async () => {
    const { history } = await fresh()
    history.record('system', '')
    history.record('system', '    ')
    history.record('system', undefined as unknown as string)
    expect(history.all()).toEqual([])
  })

  it('files an unknown kind under system instead of dropping the line', async () => {
    const { history } = await fresh()
    history.record('nonsense' as never, 'something.happened')
    expect(history.all()[0].kind).toBe('system')
  })

  it('never throws, whatever it is handed', async () => {
    const { history } = await fresh()
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(() => history.record('system', 'a', cycle)).not.toThrow()
    expect(() => history.record('system', 'b', undefined, { n: Number.NaN })).not.toThrow()
    expect(history.all().length).toBeGreaterThan(0)
  })

  it('persists through the store and nowhere else', async () => {
    const { store, history } = await fresh()
    history.record('game', 'game.slept')
    expect(store.get().history.map((entry) => entry.summary)).toEqual(['game.slept'])
  })
})

/* ------------------------------------------------------------------------ *
 * Eviction
 * ------------------------------------------------------------------------ */

describe('the log is bounded', () => {
  it('drops the oldest once the limit is reached', async () => {
    const { history } = await fresh()
    const limit = history.HISTORY_LIMIT
    const overshoot = 25

    for (let n = 0; n < limit + overshoot; n += 1) history.record('system', `entry-${n}`)

    const entries = history.all()
    expect(entries).toHaveLength(limit)
    // Newest first: the most recent survived …
    expect(entries[0].summary).toBe(`entry-${limit + overshoot - 1}`)
    // … and the oldest `overshoot` are the ones that went.
    expect(entries[entries.length - 1].summary).toBe(`entry-${overshoot}`)
    for (let n = 0; n < overshoot; n += 1) {
      expect(entries.some((entry) => entry.summary === `entry-${n}`)).toBe(false)
    }
  })

  it('reports what it is holding and what it will hold', async () => {
    const { history } = await fresh()
    expect(history.stats()).toEqual({
      count: 0,
      limit: history.HISTORY_LIMIT,
      oldest: null,
      newest: null,
    })

    history.record('system', 'first')
    history.record('system', 'second')
    const stats = history.stats()
    expect(stats.count).toBe(2)
    expect(stats.limit).toBe(history.HISTORY_LIMIT)
    expect(stats.oldest).toBeTypeOf('number')
    expect(stats.newest as number).toBeGreaterThanOrEqual(stats.oldest as number)
  })

  it('empties on clear, and keeps working afterwards', async () => {
    const { store, history } = await fresh()
    history.record('system', 'before')
    await history.clear()

    expect(history.all()).toEqual([])
    expect(store.get().history).toEqual([])

    history.record('system', 'after')
    expect(history.all().map((entry) => entry.summary)).toEqual(['after'])
  })
})

/* ------------------------------------------------------------------------ *
 * query
 * ------------------------------------------------------------------------ */

describe('query', () => {
  async function seeded(): Promise<HistoryModule> {
    const { history } = await fresh()
    history.record('game', 'game.harvested', undefined, { crop: 'Parsnip', count: 3 })
    history.record('settings', 'settings.changed', undefined, { setting: 'motion' })
    history.record('error', 'error.saveFailed', { code: 'EACCES' })
    history.record('game', 'game.slept', undefined, { day: 4 })
    history.record('data', 'data.exported', undefined, { format: 'csv' })
    return history
  }

  it('returns everything, newest first, for an empty filter', async () => {
    const history = await seeded()
    expect(history.query()).toHaveLength(5)
    expect(history.query()[0].summary).toBe('data.exported')
    expect(history.query()).toEqual(history.all())
  })

  it('filters on text, case-insensitively, across the key and the facts', async () => {
    const history = await seeded()
    expect(history.query({ text: 'harvest' }).map((entry) => entry.summary)).toEqual([
      'game.harvested',
    ])
    // The facts are searchable too, whatever the case.
    expect(history.query({ text: 'parsnip' })).toHaveLength(1)
    expect(history.query({ text: 'PARSNIP' })).toHaveLength(1)
    // And the detail blob.
    expect(history.query({ text: 'EACCES' }).map((entry) => entry.summary)).toEqual([
      'error.saveFailed',
    ])
    expect(history.query({ text: '   ' })).toHaveLength(5) // a blank query narrows nothing
    expect(history.query({ text: 'nothing like this' })).toEqual([])
  })

  it('filters on a compiled pattern', async () => {
    const history = await seeded()
    expect(history.query({ pattern: /^game\./ })).toEqual([])
    expect(history.query({ pattern: /game\.\w+/ }).map((entry) => entry.summary)).toEqual([
      'game.slept',
      'game.harvested',
    ])
    expect(history.query({ pattern: /\bcount\b/ })).toHaveLength(1)
  })

  it('leaves a global pattern’s lastIndex exactly as it found it', async () => {
    const history = await seeded()
    const sticky = /game/g
    sticky.lastIndex = 3
    const matched = history.query({ pattern: sticky })
    expect(matched).toHaveLength(2) // every entry tested from the start, not from index 3
    expect(sticky.lastIndex).toBe(3)
  })

  it('combines text and pattern with AND, so narrowing never widens', async () => {
    const history = await seeded()
    expect(history.query({ text: 'game', pattern: /slept/ }).map((e) => e.summary)).toEqual([
      'game.slept',
    ])
    expect(history.query({ text: 'settings', pattern: /slept/ })).toEqual([])
  })

  it('filters on one kind and on several', async () => {
    const history = await seeded()
    expect(history.query({ kind: 'game' })).toHaveLength(2)
    expect(history.query({ kind: 'error' }).map((entry) => entry.summary)).toEqual([
      'error.saveFailed',
    ])
    expect(history.query({ kinds: ['settings', 'data'] })).toHaveLength(2)
    expect(history.query({ kind: 'game', kinds: ['error'] })).toHaveLength(3)
    expect(history.query({ kind: 'appearance' })).toEqual([])
  })

  it('combines a kind with a text filter', async () => {
    const history = await seeded()
    expect(history.query({ kind: 'game', text: 'slept' })).toHaveLength(1)
    expect(history.query({ kind: 'settings', text: 'slept' })).toEqual([])
  })

  it('bounds by time and by count', async () => {
    const history = await seeded()
    const all = history.all()
    const newest = all[0].at
    const oldest = all[all.length - 1].at

    expect(history.query({ since: newest + 1000 })).toEqual([])
    expect(history.query({ until: oldest - 1000 })).toEqual([])
    expect(history.query({ since: oldest, until: newest })).toHaveLength(5)
    expect(history.query({ limit: 2 })).toHaveLength(2)
    expect(history.query({ limit: 2 })[0].summary).toBe('data.exported') // from the newest end
  })

  it('searches the line as it is actually read when given a translator', async () => {
    const history = await seeded()
    const translate = (entry: HistoryEntry): string =>
      entry.summary === 'game.harvested' ? 'You dug up three parsnips' : entry.summary

    expect(history.query({ text: 'dug up' })).toEqual([]) // not in the raw fields
    expect(history.query({ text: 'dug up', translate })).toHaveLength(1)
  })

  it('survives a translator that throws', async () => {
    const history = await seeded()
    const translate = (): string => {
      throw new Error('bad translator')
    }
    expect(() => history.query({ text: 'game', translate })).not.toThrow()
    expect(history.query({ text: 'game', translate })).toHaveLength(2)
  })

  it('exposes what a search actually sees through searchText', async () => {
    const history = await seeded()
    const [entry] = history.query({ kind: 'game', text: 'harvest' })
    const haystack = history.searchText(entry)
    expect(haystack).toContain('game')
    expect(haystack).toContain('game.harvested')
    expect(haystack).toContain('Parsnip')
    expect(haystack).toContain('3')
  })
})

/* ------------------------------------------------------------------------ *
 * CSV quoting
 * ------------------------------------------------------------------------ */

describe('csvField', () => {
  it('leaves an ordinary value alone', async () => {
    const { exporter } = await fresh()
    expect(exporter.csvField('parsnip')).toBe('parsnip')
    expect(exporter.csvField('123')).toBe('123')
    expect(exporter.csvField('')).toBe('')
  })

  it('quotes a comma', async () => {
    const { exporter } = await fresh()
    expect(exporter.csvField('a,b')).toBe('"a,b"')
  })

  it('quotes a quote and doubles it', async () => {
    const { exporter } = await fresh()
    expect(exporter.csvField('he said "hi"')).toBe('"he said ""hi"""')
    expect(exporter.csvField('"')).toBe('""""')
  })

  it('quotes a line break, in either spelling', async () => {
    const { exporter } = await fresh()
    expect(exporter.csvField('one\ntwo')).toBe('"one\ntwo"')
    expect(exporter.csvField('one\r\ntwo')).toBe('"one\r\ntwo"')
  })

  it('quotes edge whitespace, which a reader would otherwise eat', async () => {
    const { exporter } = await fresh()
    expect(exporter.csvField(' padded ')).toBe('" padded "')
  })

  it('round-trips every one of those through a real reader', async () => {
    const { exporter } = await fresh()
    const values = ['plain', 'a,b', 'he said "hi"', 'one\ntwo', 'one\r\ntwo', ' padded ', '', '""']
    const line = `${values.map(exporter.csvField).join(',')}\r\n`
    expect(parseCsv(line)).toEqual([values])
  })
})

/* ------------------------------------------------------------------------ *
 * exportAs
 * ------------------------------------------------------------------------ */

/** Deliberately awkward entries: a comma, a quote, a newline and a pipe. */
const NASTY: HistoryEntry[] = [
  { id: 1, at: 0, kind: 'game', summary: 'plain.line', params: { count: 2 } },
  { id: 2, at: 60_000, kind: 'data', summary: 'commas, and "quotes", together' },
  { id: 3, at: 120_000, kind: 'error', summary: 'line one\nline two', detail: { code: 'EACCES' } },
  { id: 4, at: 180_000, kind: 'system', summary: 'a | pipe | and a \\ backslash' },
]

describe('exportAs json', () => {
  it('produces a bundle that parses and names itself', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('json', { history: NASTY, now: 0 })

    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed.app).toBe('sprout-hollow')
    expect(parsed.kind).toBe('shell-export')
    expect(parsed.version).toBeTypeOf('number')
    expect(parsed.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(parsed.sections).toEqual(['settings', 'appearance', 'history'])
    expect(text.endsWith('\n')).toBe(true)
  })

  it('carries the history verbatim, awkward characters and all', async () => {
    const { exporter } = await fresh()
    const parsed = JSON.parse(
      exporter.exportAs('json', { sections: ['history'], history: NASTY, now: 0 }),
    ) as { data: { history: HistoryEntry[] } }

    expect(parsed.data.history).toEqual(NASTY)
    expect(parsed.data.history[2].summary).toBe('line one\nline two')
  })

  it('covers the save, the settings and the appearance map as well', async () => {
    const { store, exporter } = await fresh()
    await store.save({ appearance: { 'shell.tab': { color: '#f2a541' } } })

    const parsed = JSON.parse(
      exporter.exportAs('json', { save: { seed: 7, tiles: [] }, now: 0 }),
    ) as { sections: string[]; data: Record<string, unknown> }

    expect(parsed.sections).toEqual(['save', 'settings', 'appearance', 'history'])
    expect(parsed.data.save).toEqual({ seed: 7, tiles: [] })
    expect(parsed.data.settings).toEqual(store.get().settings)
    expect(parsed.data.appearance).toEqual({ 'shell.tab': { color: '#f2a541' } })
  })

  it('drops the save section when there is no save, rather than exporting a null', async () => {
    const { exporter } = await fresh()
    const parsed = JSON.parse(exporter.exportAs('json', { now: 0 })) as { sections: string[] }
    expect(parsed.sections).not.toContain('save')
  })

  it('embeds a serialized save as data, not as a quoted string', async () => {
    const { exporter } = await fresh()
    const parsed = JSON.parse(
      exporter.exportAs('json', { sections: ['save'], save: '{"seed":9}', now: 0 }),
    ) as { data: { save: unknown } }
    expect(parsed.data.save).toEqual({ seed: 9 })
  })

  it('returns parseable JSON even for a value that cannot be serialized', async () => {
    const { exporter } = await fresh()
    const cycle: Record<string, unknown> = { seed: 1 }
    cycle.self = cycle
    const text = exporter.exportAs('json', { sections: ['save'], save: cycle, now: 0 })
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('offers the same bundle as an object', async () => {
    const { exporter } = await fresh()
    const bundle = exporter.buildBundle({ sections: ['history'], history: NASTY, now: 0 })
    expect(bundle.app).toBe('sprout-hollow')
    expect(bundle.data.history).toEqual(NASTY)
  })
})

describe('exportAs csv', () => {
  it('produces a table a reader can parse, with CRLF endings', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('csv', { sections: ['history'], history: NASTY, now: 0 })

    expect(text.endsWith('\r\n')).toBe(true)
    const rows = parseCsv(text)
    expect(rows[0]).toEqual([
      'section',
      'id',
      'timestamp',
      'kind',
      'summary',
      'params',
      'detail',
    ])
    expect(rows).toHaveLength(NASTY.length + 1)
    for (const row of rows) expect(row).toHaveLength(rows[0].length)
  })

  it('escapes quotes, commas and newlines so every value survives the round-trip', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('csv', { sections: ['history'], history: NASTY, now: 0 })
    const rows = parseCsv(text)
    const summaries = rows.slice(1).map((row) => row[4])

    expect(summaries).toEqual(NASTY.map((entry) => entry.summary))
    expect(summaries[1]).toBe('commas, and "quotes", together')
    expect(summaries[2]).toBe('line one\nline two')

    // And the raw file really did quote them rather than emitting them bare.
    expect(text).toContain('"commas, and ""quotes"", together"')
  })

  it('writes the facts and the detail as JSON in their own columns', async () => {
    const { exporter } = await fresh()
    const rows = parseCsv(
      exporter.exportAs('csv', { sections: ['history'], history: NASTY, now: 0 }),
    )
    expect(JSON.parse(rows[1][5] as string)).toEqual({ count: 2 })
    expect(rows[1][6]).toBe('')
    expect(JSON.parse(rows[3][6] as string)).toEqual({ code: 'EACCES' })
  })

  it('adds the readable line as an extra column when a translator is given', async () => {
    const { exporter } = await fresh()
    const rows = parseCsv(
      exporter.exportAs('csv', {
        sections: ['history'],
        history: NASTY,
        now: 0,
        translate: (entry) => `read: ${entry.summary}`,
      }),
    )
    expect(rows[0][7]).toBe('line')
    expect(rows[1][7]).toBe('read: plain.line')
  })

  it('flattens the settings to section,key,value', async () => {
    const { store, exporter } = await fresh()
    const rows = parseCsv(exporter.exportAs('csv', { sections: ['settings'], now: 0 }))
    expect(rows[0]).toEqual(['section', 'key', 'value'])

    const found = new Map(rows.slice(1).map((row) => [row[1], row[2]]))
    expect(found.get('language')).toBe(store.get().settings.language)
    expect(found.get('funny.en')).toBe(String(store.get().settings.funny.en))
    expect(found.get('audio.volume')).toBe(String(store.get().settings.audio.volume))
  })

  it('keeps the flat table and the log apart, separated by a blank line', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('csv', {
      sections: ['settings', 'history'],
      history: NASTY,
      now: 0,
    })
    expect(text).toContain('\r\n\r\nsection,id,timestamp')
  })

  it('returns an empty string when there is nothing at all to write', async () => {
    const { exporter } = await fresh()
    expect(exporter.exportAs('csv', { sections: [], now: 0 })).toBe('')
  })
})

describe('exportAs markdown', () => {
  it('produces a document with a heading, a stamp and one table per section', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('markdown', { history: NASTY, now: 0 })

    expect(text.startsWith('# Sprout Hollow — export')).toBe(true)
    expect(text).toContain('Exported 1970-01-01T00:00:00.000Z')
    expect(text).toContain('## Settings')
    expect(text).toContain('## Appearance')
    expect(text).toContain('## History')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('writes well-formed tables: a header, a rule, and rows of equal width', async () => {
    const { exporter } = await fresh()
    const lines = exporter
      .exportAs('markdown', { sections: ['history'], history: NASTY, now: 0 })
      .split('\n')

    const headerAt = lines.findIndex((line) => line.startsWith('| # |'))
    expect(headerAt).toBeGreaterThan(-1)
    // Cell delimiters only: an escaped `\|` inside a cell is content, not a column break.
    const width = (line: string): number => line.split(/(?<!\\)\|/).length
    expect(lines[headerAt + 1]).toMatch(/^\|(\s---\s\|)+$/)
    expect(width(lines[headerAt + 1] as string)).toBe(width(lines[headerAt] as string))
    for (let n = headerAt + 2; n < headerAt + 2 + NASTY.length; n += 1) {
      expect(width(lines[n] as string), lines[n]).toBe(width(lines[headerAt] as string))
    }
  })

  it('escapes a pipe and flattens a newline so neither breaks a row', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('markdown', { sections: ['history'], history: NASTY, now: 0 })

    expect(text).toContain('a \\| pipe \\| and a \\ backslash')
    expect(text).toContain('line one line two')
    // The entry with a newline in it still occupies exactly one row.
    const rows = text.split('\n').filter((line) => line.startsWith('| 3 |'))
    expect(rows).toHaveLength(1)
  })

  it('says so plainly when a section is empty', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('markdown', { sections: ['appearance', 'history'], now: 0 })
    expect(text).toContain('_No appearance overrides._')
    expect(text).toContain('_No history._')
  })

  it('fences the save as JSON', async () => {
    const { exporter } = await fresh()
    const text = exporter.exportAs('markdown', {
      sections: ['save'],
      save: { seed: 7 },
      now: 0,
    })
    expect(text).toContain('## Save')
    expect(text).toContain('```json')
    expect(text).toContain('{"seed":7}')
  })

  it('lists the history newest first, as the log itself reads', async () => {
    const { exporter } = await fresh()
    const lines = exporter
      .exportAs('markdown', { sections: ['history'], history: NASTY, now: 0 })
      .split('\n')
      .filter((line) => /^\| \d+ \|/.test(line))
    expect(lines[0].startsWith('| 4 |')).toBe(true)
    expect(lines[lines.length - 1].startsWith('| 1 |')).toBe(true)
  })
})

/* ------------------------------------------------------------------------ *
 * The rest of the export surface
 * ------------------------------------------------------------------------ */

describe('the export surface', () => {
  it('names the right mime type and extension for each format', async () => {
    const { exporter } = await fresh()
    expect(exporter.mimeFor('json')).toContain('application/json')
    expect(exporter.mimeFor('csv')).toContain('text/csv')
    expect(exporter.mimeFor('markdown')).toContain('text/markdown')
    expect(exporter.extensionFor('json')).toBe('json')
    expect(exporter.extensionFor('csv')).toBe('csv')
    expect(exporter.extensionFor('markdown')).toBe('md')
  })

  it('suggests a sortable filename built from facts', async () => {
    const { exporter } = await fresh()
    expect(exporter.suggestFilename('csv', { sections: ['history'], now: 0 })).toBe(
      'sprout-hollow-history-1970-01-01-00-00.csv',
    )
    expect(exporter.suggestFilename('json', { now: 0 })).toBe(
      'sprout-hollow-all-1970-01-01-00-00.json',
    )
  })

  it('does nothing, quietly, where there is no document to download into', async () => {
    const { exporter } = await fresh()
    expect(() => exporter.download('x.json', '{}', 'application/json')).not.toThrow()
    expect(exporter.downloadAs('json', { sections: ['history'], history: NASTY, now: 0 })).toContain(
      'plain.line',
    )
  })

  it('publishes the formats and sections a settings surface can offer', async () => {
    const { exporter } = await fresh()
    expect(exporter.EXPORT_FORMATS).toEqual(['json', 'csv', 'markdown'])
    expect(exporter.EXPORT_SECTIONS).toEqual(['save', 'settings', 'appearance', 'history'])
  })
})

/* ------------------------------------------------------------------------ *
 * Reading an export back in
 * ------------------------------------------------------------------------ */

describe('importJson', () => {
  it('round-trips a bundle this module wrote', async () => {
    const first = await fresh()
    await first.store.save({
      settings: { language: 'yue', displayScale: 200 },
      appearance: { 'shell.tab': { color: '#f2a541' } },
    })
    first.history.record('game', 'game.harvested', undefined, { count: 3 })
    const bundle = first.exporter.exportAs('json', { now: 0 })

    const second = await fresh()
    const result = await second.exporter.importJson(bundle)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toEqual(['settings', 'appearance', 'history'])
    expect(second.store.get().settings.language).toBe('yue')
    expect(second.store.get().settings.displayScale).toBe(200)
    expect(second.store.get().appearance).toEqual({ 'shell.tab': { color: '#f2a541' } })
    expect(second.history.all().map((entry) => entry.summary)).toEqual(['game.harvested'])
  })

  it('reports a coded error instead of throwing, and changes nothing', async () => {
    const { store, exporter } = await fresh()
    const before = store.get()

    const cases: Array<[string, string]> = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['not json', 'not-json'],
      ['[1,2,3]', 'not-object'],
      ['{"app":"some-other-app","data":{}}', 'foreign'],
      ['{"nothing":"useful"}', 'no-sections'],
    ]
    for (const [text, code] of cases) {
      const result = await exporter.importJson(text)
      expect(result.ok, text).toBe(false)
      if (result.ok) continue
      expect(result.code, text).toBe(code)
      expect(result.error, text).toBeTypeOf('string')
    }
    expect(store.get()).toEqual(before)
  })

  it('validates without applying', async () => {
    const { store, exporter } = await fresh()
    const check = exporter.validateImport('{"settings":{"language":"yue"}}')
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.preview.sections).toEqual(['settings'])
    expect(check.preview.settings?.language).toBe('yue')
    expect(store.get().settings.language).toBe('en') // nothing was written
  })

  it('notes what it dropped, as facts rather than as a sentence', async () => {
    const { exporter } = await fresh()
    const check = exporter.validateImport(
      JSON.stringify({
        appearance: { good: { color: '#f2a541' }, bad: 42 },
        history: [{ summary: 'kept' }, 'not an entry'],
        version: 9999,
      }),
    )
    expect(check.ok).toBe(true)
    if (!check.ok) return
    const codes = check.preview.notes.map((note) => note.code)
    expect(codes).toContain('import.appearance.dropped')
    expect(codes).toContain('import.history.dropped')
    expect(codes).toContain('import.version.newer')
    for (const note of check.preview.notes) {
      expect(note.params, note.code).toBeTypeOf('object')
    }
  })

  it('hands the game save back rather than writing it, because the farm is not the shell’s', async () => {
    const { exporter } = await fresh()
    const result = await exporter.importJson(
      JSON.stringify({ app: 'sprout-hollow', data: { save: { seed: 11 }, settings: {} } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.save).toEqual({ seed: 11 })
    expect(result.applied).toContain('save')
  })

  it('refuses a document larger than the stated bound', async () => {
    const { exporter } = await fresh()
    const huge = `{"settings":{"language":"${'x'.repeat(exporter.MAX_IMPORT_BYTES)}"}}`
    const result = await exporter.importJson(huge)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('too-large')
  })
})
