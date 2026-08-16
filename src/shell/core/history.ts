/**
 * The shell's local activity log.
 *
 * Bounded to `HISTORY_LIMIT` entries with the oldest dropped, persisted through
 * `src/shell/core/store.ts` and nowhere else, and stored as **string keys plus facts**
 * rather than sentences. A line recorded while the app was in Cantonese at funny level 5
 * reads as plain English at level 1 the moment the language changes, because nothing was
 * ever frozen into a language.
 *
 * Timestamps come from `Date` here. `src/game` may not read the clock; the shell may, and
 * a history without times is not a history.
 */

import { HISTORY_KINDS, HISTORY_LIMIT, get, save, subscribe } from './store'
import type { HistoryEntry, HistoryKind } from './store'

export type { HistoryEntry, HistoryKind } from './store'
export { HISTORY_KINDS, HISTORY_LIMIT } from './store'

/** Facts inside a summary. Interpolated by `t()`; never rewritten by the funny level. */
export type HistoryParams = Record<string, string | number>

export interface HistoryFilter {
  /** Case-insensitive substring, matched against the searchable text of each entry. */
  text?: string
  /** A compiled pattern from `src/shell/core/regex.ts`. Its `lastIndex` is never disturbed. */
  pattern?: RegExp
  kind?: HistoryKind
  /** Several kinds at once. Combined with `kind` as a union. */
  kinds?: readonly HistoryKind[]
  /** Only entries at or after this epoch millisecond. */
  since?: number
  /** Only entries at or before this epoch millisecond. */
  until?: number
  /** At most this many, taken from the newest end. */
  limit?: number
  /**
   * How a caller renders an entry for reading — normally `(e) => t(e.summary, e.params)`.
   * When supplied, `text` and `pattern` match the rendered line as well as the raw fields,
   * so a user searching what they can see finds it.
   */
  translate?: (entry: HistoryEntry) => string
}

/**
 * The next id. Monotonic across a session and never reused, reconciled against whatever the
 * store hands back so a load or an import cannot make it go backwards.
 */
let nextId = 1

function reconcile(entries: readonly HistoryEntry[]): void {
  if (entries.length === 0) return
  const last = entries[entries.length - 1]
  if (last.id >= nextId) nextId = last.id + 1
}

reconcile(get().history)
subscribe((persisted) => reconcile(persisted.history))

/**
 * Appends one entry. Never throws, never awaits: the write behind it is the store's
 * debounced one, so a burst of events costs a burst of memory and one write.
 *
 * `summary` is a string key for `t()`. `params` carries the facts. `detail` is optional
 * structured context for the expanded view — pass `undefined` for `detail` when you only
 * want params. For callers that follow the contract's three-argument shape, a `params`
 * object inside `detail` is picked up as the params.
 */
export function record(
  kind: HistoryKind,
  summary: string,
  detail?: Record<string, unknown>,
  params?: HistoryParams,
): void {
  try {
    const key = typeof summary === 'string' ? summary.trim() : ''
    if (key.length === 0) return

    const resolvedParams = params ?? paramsInside(detail)
    const rest = params === undefined && resolvedParams !== undefined ? without(detail) : detail

    const entry: HistoryEntry = {
      id: nextId,
      at: Date.now(),
      kind: (HISTORY_KINDS as readonly string[]).includes(kind) ? kind : 'system',
      summary: key,
    }
    if (resolvedParams !== undefined) entry.params = resolvedParams
    if (rest !== undefined && Object.keys(rest).length > 0) entry.detail = rest
    nextId += 1

    const current = get().history
    const next = current.length >= HISTORY_LIMIT ? current.slice(current.length - HISTORY_LIMIT + 1) : current.slice()
    next.push(entry)
    void save({ history: next })
  } catch {
    // A log line is never worth taking the app down for.
  }
}

/** Convenience for the common shape: a key and its facts, no detail blob. */
export function recordWith(kind: HistoryKind, summary: string, params: HistoryParams): void {
  record(kind, summary, undefined, params)
}

function paramsInside(detail: Record<string, unknown> | undefined): HistoryParams | undefined {
  if (detail === undefined) return undefined
  const raw = detail['params']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: HistoryParams = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      out[key] = value
    }
  }
  return Object.keys(out).length === 0 ? undefined : out
}

function without(detail: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (detail === undefined) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (key !== 'params') out[key] = value
  }
  return out
}

/** Every entry, newest first. The array is a copy; the entries themselves are frozen. */
export function all(): HistoryEntry[] {
  return [...get().history].reverse()
}

/**
 * Newest first, filtered. An empty filter returns everything. `text` and `pattern` are
 * combined with AND, as are `kind` and the time bounds, so narrowing never widens.
 */
export function query(filter: HistoryFilter = {}): HistoryEntry[] {
  const wanted = kindSet(filter)
  const needle = typeof filter.text === 'string' ? filter.text.trim().toLowerCase() : ''
  const out: HistoryEntry[] = []

  const entries = get().history
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (wanted !== null && !wanted.has(entry.kind)) continue
    if (typeof filter.since === 'number' && entry.at < filter.since) continue
    if (typeof filter.until === 'number' && entry.at > filter.until) continue

    if (needle.length > 0 || filter.pattern) {
      const haystack = searchText(entry, filter.translate)
      if (needle.length > 0 && !haystack.toLowerCase().includes(needle)) continue
      if (filter.pattern && !matches(filter.pattern, haystack)) continue
    }

    out.push(entry)
    if (typeof filter.limit === 'number' && filter.limit > 0 && out.length >= filter.limit) break
  }
  return out
}

function kindSet(filter: HistoryFilter): Set<HistoryKind> | null {
  const wanted = new Set<HistoryKind>()
  if (filter.kind) wanted.add(filter.kind)
  if (filter.kinds) for (const kind of filter.kinds) wanted.add(kind)
  return wanted.size === 0 ? null : wanted
}

/**
 * A global or sticky pattern carries `lastIndex` between calls, which would make the same
 * entry match or miss depending on what was tested before it. Testing from a reset index
 * and restoring it afterwards keeps a caller's own pattern object usable.
 */
function matches(pattern: RegExp, haystack: string): boolean {
  try {
    if (!pattern.global && !pattern.sticky) return pattern.test(haystack)
    const previous = pattern.lastIndex
    pattern.lastIndex = 0
    const hit = pattern.test(haystack)
    pattern.lastIndex = previous
    return hit
  } catch {
    return false
  }
}

/**
 * Everything about an entry that a search should see: its kind, its key, its facts, its
 * detail and — when the caller supplied a translator — the line as it is actually read.
 */
export function searchText(
  entry: HistoryEntry,
  translate?: (entry: HistoryEntry) => string,
): string {
  const parts: string[] = [entry.kind, entry.summary]
  if (translate) {
    try {
      parts.push(translate(entry))
    } catch {
      // A translator that fails costs the translated line, not the search.
    }
  }
  if (entry.params) {
    for (const [key, value] of Object.entries(entry.params)) parts.push(key, String(value))
  }
  if (entry.detail) parts.push(flatten(entry.detail))
  return parts.join(' ')
}

function flatten(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail) ?? ''
  } catch {
    return ''
  }
}

/** Empties the log and persists that. Resolves once the bytes are out. */
export async function clear(): Promise<void> {
  try {
    await save({ history: [] })
  } catch {
    // `save` does not reject; this is belt and braces.
  }
}

/** How many entries are held, and how many more will fit before the oldest start dropping. */
export function stats(): { count: number; limit: number; oldest: number | null; newest: number | null } {
  const entries = get().history
  return {
    count: entries.length,
    limit: HISTORY_LIMIT,
    oldest: entries.length === 0 ? null : entries[0].at,
    newest: entries.length === 0 ? null : entries[entries.length - 1].at,
  }
}
