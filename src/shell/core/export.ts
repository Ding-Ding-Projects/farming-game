/**
 * Taking your data out, and letting it back in.
 *
 * Three formats over four things — the game save, the settings, the appearance map and the
 * history:
 *
 * - **json** — the round-trip format. What `importJson()` reads back.
 * - **csv** — flat and spreadsheet-ready, RFC 4180 quoting, CRLF line endings.
 * - **markdown** — for reading and for pasting into a bug report.
 *
 * The import path validates the whole document before it changes a single stored byte, and
 * returns a coded error instead of a half-applied record. Codes and technical details come
 * back as facts for the caller to interpolate through `t()`; nothing here writes English
 * into the UI.
 */

import { SCHEMA_VERSION, get, sanitizeAppearance, sanitizeHistory, sanitizeSettings, save } from './store'
import type { AppearanceMap, HistoryEntry, Persisted, Settings } from './store'

export type ExportFormat = 'json' | 'csv' | 'markdown'

export type ExportSection = 'save' | 'settings' | 'appearance' | 'history'

export const EXPORT_FORMATS: readonly ExportFormat[] = ['json', 'csv', 'markdown']

export const EXPORT_SECTIONS: readonly ExportSection[] = ['save', 'settings', 'appearance', 'history']

/**
 * What to export. Everything is optional: whatever you leave out is taken from the live
 * store, except the game save, which lives behind `src/renderer/bridge.ts` and must be
 * handed in by the caller that already has it.
 */
export interface ExportTarget {
  /** Defaults to every section the target actually has data for. */
  sections?: readonly ExportSection[]
  /** A `GameState` object, the serialized save JSON, or null when there is no save. */
  save?: unknown
  settings?: Settings
  appearance?: AppearanceMap
  history?: readonly HistoryEntry[]
  /**
   * How to render a history line for a human — normally `(e) => t(e.summary, e.params)`.
   * When given, exports carry the readable line beside the key and the facts, never
   * instead of them.
   */
  translate?: (entry: HistoryEntry) => string
  /** Overrides the export timestamp. Tests use it; nothing else needs to. */
  now?: number
}

/** The envelope `exportAs('json', …)` writes and `importJson()` reads. */
export interface ExportBundle {
  app: 'sprout-hollow'
  kind: 'shell-export'
  version: number
  exportedAt: string
  sections: ExportSection[]
  data: {
    save?: unknown
    settings?: Settings
    appearance?: AppearanceMap
    history?: HistoryEntry[]
  }
}

const APP_ID = 'sprout-hollow'
const BUNDLE_KIND = 'shell-export'

/* ------------------------------------------------------------------------ resolution */

interface Resolved {
  sections: ExportSection[]
  save: unknown
  settings: Settings
  appearance: AppearanceMap
  history: HistoryEntry[]
  translate?: (entry: HistoryEntry) => string
  at: Date
}

function resolve(what: ExportTarget): Resolved {
  const current: Persisted = get()
  const hasSave = what.save !== undefined && what.save !== null
  const requested = what.sections
  const sections = (requested ?? EXPORT_SECTIONS).filter(
    (section) => EXPORT_SECTIONS.includes(section) && (section !== 'save' || hasSave),
  )
  const at = new Date(typeof what.now === 'number' && Number.isFinite(what.now) ? what.now : Date.now())
  const resolved: Resolved = {
    sections: [...new Set(sections)],
    save: normalizeSave(what.save),
    settings: what.settings ?? current.settings,
    appearance: what.appearance ?? current.appearance,
    history: [...(what.history ?? current.history)],
    at: Number.isNaN(at.getTime()) ? new Date(0) : at,
  }
  if (what.translate) resolved.translate = what.translate
  return resolved
}

/** A save handed in as serialized JSON is embedded as data, not as a quoted string. */
function normalizeSave(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function iso(at: Date): string {
  try {
    return at.toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}

/* --------------------------------------------------------------------------- exportAs */

/** Never throws: a value that cannot be serialized is reported in place, not propagated. */
export function exportAs(format: ExportFormat, what: ExportTarget): string {
  try {
    const resolved = resolve(what)
    switch (format) {
      case 'csv':
        return toCsv(resolved)
      case 'markdown':
        return toMarkdown(resolved)
      case 'json':
      default:
        return toJson(resolved)
    }
  } catch {
    return format === 'json' ? '{}' : ''
  }
}

/** The bundle as an object, for a caller that wants to inspect it before writing it out. */
export function buildBundle(what: ExportTarget): ExportBundle {
  const resolved = resolve(what)
  return bundleOf(resolved)
}

function bundleOf(resolved: Resolved): ExportBundle {
  const data: ExportBundle['data'] = {}
  if (resolved.sections.includes('save')) data.save = resolved.save
  if (resolved.sections.includes('settings')) data.settings = resolved.settings
  if (resolved.sections.includes('appearance')) data.appearance = resolved.appearance
  if (resolved.sections.includes('history')) data.history = resolved.history
  return {
    app: APP_ID,
    kind: BUNDLE_KIND,
    version: SCHEMA_VERSION,
    exportedAt: iso(resolved.at),
    sections: resolved.sections,
    data,
  }
}

function toJson(resolved: Resolved): string {
  try {
    return `${JSON.stringify(bundleOf(resolved), null, 2)}\n`
  } catch {
    // A save object with a cycle in it is the only realistic way here; drop it rather than
    // losing the settings beside it.
    const safe: Resolved = { ...resolved, save: null }
    return `${JSON.stringify(bundleOf(safe), null, 2)}\n`
  }
}

/* -------------------------------------------------------------------------------- csv */

const CRLF = '\r\n'

/**
 * RFC 4180: fields containing a quote, a comma, a line break or edge whitespace are wrapped
 * in double quotes and their own quotes doubled. Values are never otherwise altered — a
 * number exported here reads back as the same number.
 */
export function csvField(value: string): string {
  const needsQuotes = /["\r\n,]/.test(value) || value !== value.trim()
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

function csvRow(fields: readonly string[]): string {
  return fields.map(csvField).join(',')
}

/**
 * One `section,key,value` table for the flat sections, then — because a log is genuinely
 * tabular and flattening it would ruin it — the history as its own table after a blank
 * line.
 */
function toCsv(resolved: Resolved): string {
  const lines: string[] = []
  const flat = resolved.sections.filter((section) => section !== 'history')

  if (flat.length > 0) {
    lines.push(csvRow(['section', 'key', 'value']))
    for (const section of flat) {
      const source =
        section === 'settings'
          ? (resolved.settings as unknown)
          : section === 'appearance'
            ? (resolved.appearance as unknown)
            : resolved.save
      for (const [key, value] of flatten(source)) {
        lines.push(csvRow([section, key, value]))
      }
    }
  }

  if (resolved.sections.includes('history')) {
    if (lines.length > 0) lines.push('')
    const header = ['section', 'id', 'timestamp', 'kind', 'summary', 'params', 'detail']
    if (resolved.translate) header.push('line')
    lines.push(csvRow(header))
    for (const entry of resolved.history) {
      const row = [
        'history',
        String(entry.id),
        iso(new Date(entry.at)),
        entry.kind,
        entry.summary,
        entry.params ? jsonOr(entry.params, '') : '',
        entry.detail ? jsonOr(entry.detail, '') : '',
      ]
      if (resolved.translate) row.push(rendered(entry, resolved.translate))
      lines.push(csvRow(row))
    }
  }

  return lines.length === 0 ? '' : `${lines.join(CRLF)}${CRLF}`
}

/** Dot-path flattening. Arrays index numerically; leaves stringify plainly. */
function flatten(value: unknown, prefix = '', depth = 0): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (depth > 8) return out
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      out.push(...flatten(item, prefix === '' ? String(index) : `${prefix}.${index}`, depth + 1))
    })
    return out
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.push(...flatten(child, prefix === '' ? key : `${prefix}.${key}`, depth + 1))
    }
    return out
  }
  out.push([prefix === '' ? 'value' : prefix, scalar(value)])
  return out
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return jsonOr(value, '')
}

function jsonOr(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value) ?? fallback
  } catch {
    return fallback
  }
}

function rendered(entry: HistoryEntry, translate: (entry: HistoryEntry) => string): string {
  try {
    const line = translate(entry)
    return typeof line === 'string' ? line : ''
  } catch {
    return ''
  }
}

/* --------------------------------------------------------------------------- markdown */

/** A pipe inside a table cell would end the cell, and a newline would end the row. */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function mdTable(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] {
  const lines = [
    `| ${header.map(mdCell).join(' | ')} |`,
    `|${header.map(() => ' --- ').join('|')}|`,
  ]
  for (const row of rows) lines.push(`| ${row.map(mdCell).join(' | ')} |`)
  return lines
}

function toMarkdown(resolved: Resolved): string {
  const lines: string[] = ['# Sprout Hollow — export', '', `Exported ${iso(resolved.at)}`, '']

  if (resolved.sections.includes('settings')) {
    lines.push('## Settings', '')
    lines.push(...mdTable(['Setting', 'Value'], flatten(resolved.settings)))
    lines.push('')
  }

  if (resolved.sections.includes('appearance')) {
    lines.push('## Appearance', '')
    const ids = Object.keys(resolved.appearance).sort()
    if (ids.length === 0) {
      lines.push('_No appearance overrides._', '')
    } else {
      const rows: string[][] = []
      for (const id of ids) {
        for (const [key, value] of flatten(resolved.appearance[id])) rows.push([id, key, value])
      }
      lines.push(...mdTable(['Element', 'Property', 'Value'], rows))
      lines.push('')
    }
  }

  if (resolved.sections.includes('history')) {
    lines.push('## History', '')
    if (resolved.history.length === 0) {
      lines.push('_No history._', '')
    } else {
      const header = ['#', 'When', 'Kind', 'Summary']
      if (resolved.translate) header.push('Line')
      const rows = [...resolved.history].reverse().map((entry) => {
        const row = [
          String(entry.id),
          iso(new Date(entry.at)),
          entry.kind,
          entry.params ? `${entry.summary} ${jsonOr(entry.params, '')}` : entry.summary,
        ]
        if (resolved.translate) row.push(rendered(entry, resolved.translate))
        return row
      })
      lines.push(...mdTable(header, rows))
      lines.push('')
      const detailed = resolved.history.filter((entry) => entry.detail !== undefined)
      if (detailed.length > 0) {
        lines.push('### History detail', '')
        for (const entry of [...detailed].reverse()) {
          lines.push(`- **${mdCell(String(entry.id))}** \`${jsonOr(entry.detail, '{}')}\``)
        }
        lines.push('')
      }
    }
  }

  if (resolved.sections.includes('save')) {
    lines.push('## Save', '', '```json', jsonOr(resolved.save, 'null'), '```', '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/* --------------------------------------------------------------------------- download */

export function mimeFor(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv;charset=utf-8'
    case 'markdown':
      return 'text/markdown;charset=utf-8'
    case 'json':
    default:
      return 'application/json;charset=utf-8'
  }
}

export function extensionFor(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'csv'
    case 'markdown':
      return 'md'
    case 'json':
    default:
      return 'json'
  }
}

/** `sprout-hollow-settings-2026-08-16-1432.json` — sortable, and a fact, not a sentence. */
export function suggestFilename(format: ExportFormat, what: ExportTarget = {}): string {
  const resolved = resolve(what)
  const scope = resolved.sections.length === 1 ? resolved.sections[0] : 'all'
  const stamp = iso(resolved.at).replace(/[:T]/g, '-').slice(0, 16)
  return `${APP_ID}-${scope}-${stamp}.${extensionFor(format)}`
}

/** Path separators, control characters and leading dots have no business in a filename. */
function safeFilename(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .trim()
  if (cleaned.length === 0) return fallback
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned
}

/**
 * Builds a Blob, clicks an object URL and revokes it afterwards. Silently does nothing
 * where there is no document — a node test importing this module must not explode.
 */
export function download(filename: string, contents: string, mime: string): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return

  let url: string | null = null
  let anchor: HTMLAnchorElement | null = null
  try {
    const type = typeof mime === 'string' && mime.length > 0 ? mime : 'application/octet-stream'
    url = URL.createObjectURL(new Blob([contents], { type }))
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = safeFilename(filename, `${APP_ID}-export`)
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
  } catch {
    // A blocked download is not worth an exception on the caller's stack.
  } finally {
    if (anchor?.parentNode) anchor.parentNode.removeChild(anchor)
    if (url !== null) {
      const doomed = url
      // Revoking in the same tick can cancel the download in some engines; one timeout is
      // long enough for the click to have been taken.
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(doomed)
          } catch {
            // Already gone.
          }
        }, 1000)
      } else {
        try {
          URL.revokeObjectURL(doomed)
        } catch {
          // Already gone.
        }
      }
    }
  }
}

/** Export and download in one step. Returns the text that was written. */
export function downloadAs(format: ExportFormat, what: ExportTarget, filename?: string): string {
  const contents = exportAs(format, what)
  download(filename ?? suggestFilename(format, what), contents, mimeFor(format))
  return contents
}

/* ----------------------------------------------------------------------------- import */

export type ImportErrorCode =
  | 'empty'
  | 'too-large'
  | 'not-json'
  | 'not-object'
  | 'foreign'
  | 'no-sections'

/** A machine-readable note about something dropped or repaired. `params` are facts. */
export interface ImportNote {
  code: string
  params?: Record<string, string | number>
}

export interface ImportPreview {
  /** Which sections the document actually carries. */
  sections: ExportSection[]
  version: number
  exportedAt: string | null
  settings?: Settings
  appearance?: AppearanceMap
  history?: HistoryEntry[]
  /**
   * The game save, untouched and unapplied. It belongs to `src/renderer/bridge.ts`, so the
   * caller writes it — the shell store never touches the farm.
   */
  save?: unknown
  notes: ImportNote[]
}

export type ImportCheck =
  | { ok: true; preview: ImportPreview }
  | { ok: false; code: ImportErrorCode; error: string }

export type ImportResult =
  | { ok: true; applied: ExportSection[]; save?: unknown; notes: ImportNote[] }
  | { ok: false; code: ImportErrorCode; error: string }

/** 8 MiB. A shell record with a full history is a few hundred kilobytes at the outside. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024

/**
 * Reads a document without changing anything. Accepts an export bundle, a bare `Persisted`
 * record, or a bare game save, and reports exactly what would be applied.
 */
export function validateImport(text: string): ImportCheck {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, code: 'empty', error: 'no content' }
  }
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, code: 'too-large', error: `${text.length} > ${MAX_IMPORT_BYTES}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text, (key: string, value: unknown) =>
      key === '__proto__' ? undefined : value,
    )
  } catch (err) {
    return { ok: false, code: 'not-json', error: message(err) }
  }
  if (!isRecord(parsed)) {
    return { ok: false, code: 'not-object', error: describe(parsed) }
  }

  if (typeof parsed['app'] === 'string' && parsed['app'] !== APP_ID) {
    return { ok: false, code: 'foreign', error: parsed['app'] }
  }

  const container = isRecord(parsed['data']) ? parsed['data'] : parsed
  const notes: ImportNote[] = []
  const sections: ExportSection[] = []
  const preview: ImportPreview = {
    sections,
    version: typeof parsed['version'] === 'number' && Number.isFinite(parsed['version'])
      ? Math.floor(parsed['version'])
      : SCHEMA_VERSION,
    exportedAt: typeof parsed['exportedAt'] === 'string' ? parsed['exportedAt'] : null,
    notes,
  }

  if (isRecord(container['settings'])) {
    preview.settings = sanitizeSettings(container['settings'], get().settings)
    sections.push('settings')
  }
  if (isRecord(container['appearance'])) {
    const clean = sanitizeAppearance(container['appearance'])
    const offered = Object.keys(container['appearance']).length
    const kept = Object.keys(clean).length
    if (kept < offered) {
      notes.push({ code: 'import.appearance.dropped', params: { dropped: offered - kept } })
    }
    preview.appearance = clean
    sections.push('appearance')
  }
  if (Array.isArray(container['history'])) {
    const clean = sanitizeHistory(container['history'])
    const offered = container['history'].length
    if (clean.length < offered) {
      notes.push({ code: 'import.history.dropped', params: { dropped: offered - clean.length } })
    }
    preview.history = clean
    sections.push('history')
  }

  const save = readSave(container)
  if (save !== undefined) {
    preview.save = save
    sections.push('save')
  }

  if (sections.length === 0) {
    return { ok: false, code: 'no-sections', error: Object.keys(container).slice(0, 8).join(', ') }
  }
  if (preview.version > SCHEMA_VERSION) {
    notes.push({
      code: 'import.version.newer',
      params: { found: preview.version, expected: SCHEMA_VERSION },
    })
  }
  return { ok: true, preview }
}

/** An explicit `save` key, or a bare game save recognised by its own shape. */
function readSave(container: Record<string, unknown>): unknown {
  if ('save' in container) {
    const raw = container['save']
    if (raw === null || raw === undefined) return undefined
    return normalizeSave(raw)
  }
  if (Array.isArray(container['tiles']) && isRecord(container['player']) && 'seed' in container) {
    return container
  }
  return undefined
}

/**
 * Validates, then applies — settings, appearance and history, in one store patch, so a
 * refused document leaves the record exactly as it was. The game save is handed back
 * rather than applied: writing it is `src/renderer/bridge.ts`'s job, not the shell's.
 */
export async function importJson(text: string): Promise<ImportResult> {
  const check = validateImport(text)
  if (!check.ok) return check

  const { preview } = check
  const applied: ExportSection[] = []
  const patch: Parameters<typeof save>[0] = {}

  if (preview.settings) {
    patch.settings = preview.settings
    applied.push('settings')
  }
  if (preview.appearance) {
    // A wholesale replacement, not a merge: an import of an appearance map means that map.
    for (const id of Object.keys(get().appearance)) {
      if (!(id in preview.appearance)) {
        patch.appearance = { ...(patch.appearance ?? {}), [id]: null }
      }
    }
    patch.appearance = { ...(patch.appearance ?? {}), ...preview.appearance }
    applied.push('appearance')
  }
  if (preview.history) {
    patch.history = preview.history
    applied.push('history')
  }

  if (applied.length > 0) await save(patch)

  if (preview.save === undefined) return { ok: true, applied, notes: preview.notes }
  applied.push('save')
  return { ok: true, applied, save: preview.save, notes: preview.notes }
}

/* ------------------------------------------------------------------------- primitives */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function message(err: unknown): string {
  if (err instanceof Error && typeof err.message === 'string') return err.message
  return String(err)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  return Array.isArray(value) ? 'array' : typeof value
}
