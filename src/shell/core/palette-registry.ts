/**
 * The command palette registry.
 *
 * Two kinds of thing live here. A `Command` does something when you pick it. A
 * `Target` is a *place* — a tab, a settings row, a documentation section, an
 * appearance-editable element — and picking it teleports you there: switch tab,
 * expand its group, scroll it into view, put focus on the element itself.
 *
 * Core module: no DOM, no `window`. It ranks and groups; `src/shell/ui/commandpalette.ts`
 * draws the result.
 *
 * Ranking, best first:
 *   1. the title is exactly the query
 *   2. the title starts with the query
 *   3. a word inside the title starts with the query
 *   4. the title contains the query
 *   5. …then the same four tiers over keywords, then the group, then the id
 * Ties break on how often the entry has been used this session, then most recently
 * used, then the translated title. Results are then *grouped*: entries that share a
 * group stay together, and groups are ordered by their own best-ranked member, so a
 * flat `search()` and a structured `grouped()` always agree.
 */

import { t } from './i18n'
import type { StringKey } from './i18n'
import { compile, plainToPattern } from './regex'

export interface Command {
  id: string
  titleKey: StringKey
  group: string
  keywords?: string[]
  run(): void
}

export interface Target {
  id: string
  titleKey: StringKey
  group: string
  teleport(): void
}

/** Either kind of registry entry. */
export type PaletteEntry = Command | Target

/** Which kind an entry is, for display. */
export type EntryKind = 'command' | 'target'

/** One group of results, in display order. */
export interface SearchGroup {
  /** The raw group id, as registered. */
  group: string
  /** The translated group heading, via `registerGroupLabel` or the raw id. */
  label: string
  entries: PaletteEntry[]
}

/** A search that reports why it found nothing, for the field's syntax feedback. */
export interface SearchOutcome {
  entries: PaletteEntry[]
  /** A compile error message when `useRegex` and the pattern is malformed, else null. */
  error: string | null
  /** Where in the pattern the error is, when the engine could tell us. */
  errorIndex?: number
}

/**
 * A query longer than this cannot usefully match a title, and a very long adversarial
 * pattern is not worth compiling. Longer queries are truncated before matching.
 */
const MAX_QUERY_LENGTH = 256

/** Field weights. A title hit always beats a keyword hit, which always beats an id hit. */
const W_TITLE = 0
const W_KEYWORD = 8
const W_GROUP = 16
const W_ID = 24

/** Tiers inside one field. */
const T_EXACT = 0
const T_PREFIX = 1
const T_WORD_PREFIX = 2
const T_SUBSTRING = 3
const T_EMPTY_MATCH = 4

/** Higher than any real score: "did not match at all". */
const NO_MATCH = Number.POSITIVE_INFINITY

const commands = new Map<string, Command>()
const targets = new Map<string, Target>()

interface GroupLabel {
  titleKey: StringKey
  order: number
}
const groupLabels = new Map<string, GroupLabel>()

/** Registration order, so groups without an explicit order stay stable. */
let registrationSeq = 0
const registeredAt = new Map<string, number>()

interface Usage {
  count: number
  /** Monotonic "when", so most-recently-used is a plain number comparison. */
  at: number
}
const usage = new Map<string, Usage>()
let usageSeq = 0

const changeListeners = new Set<() => void>()

function emitChange(): void {
  for (const fn of [...changeListeners]) {
    try {
      fn()
    } catch {
      // One bad listener must not stop the others, and must not break a registration.
    }
  }
}

/** Subscribe to registrations and unregistrations. Returns the unsubscribe function. */
export function onRegistryChange(fn: () => void): () => void {
  changeListeners.add(fn)
  return () => {
    changeListeners.delete(fn)
  }
}

/**
 * Register a command. Registering an id twice replaces the earlier entry; the
 * returned function removes the entry only while it is still the one registered, so a
 * late unregister cannot delete somebody else's replacement.
 */
export function registerCommand(c: Command): () => void {
  commands.set(c.id, c)
  targets.delete(c.id)
  registeredAt.set(c.id, registrationSeq++)
  emitChange()
  return () => {
    if (commands.get(c.id) === c) {
      commands.delete(c.id)
      emitChange()
    }
  }
}

/** Register a place. `teleport()` must really move focus onto the element. */
export function registerTarget(target: Target): () => void {
  targets.set(target.id, target)
  commands.delete(target.id)
  registeredAt.set(target.id, registrationSeq++)
  emitChange()
  return () => {
    if (targets.get(target.id) === target) {
      targets.delete(target.id)
      emitChange()
    }
  }
}

/**
 * Give a group id a translated heading and a place in the running order. Optional:
 * an unlabelled group shows its raw id and sorts after the labelled ones.
 */
export function registerGroupLabel(group: string, titleKey: StringKey, order = 100): () => void {
  const entry: GroupLabel = { titleKey, order }
  groupLabels.set(group, entry)
  emitChange()
  return () => {
    if (groupLabels.get(group) === entry) {
      groupLabels.delete(group)
      emitChange()
    }
  }
}

/** The heading to show for a group id, translated when the group has been labelled. */
export function groupLabel(group: string): string {
  const label = groupLabels.get(group)
  return label ? t(label.titleKey) : group
}

function groupOrder(group: string): number {
  const label = groupLabels.get(group)
  return label ? label.order : 1000
}

export function isTarget(entry: PaletteEntry): entry is Target {
  return typeof (entry as Target).teleport === 'function'
}

export function isCommand(entry: PaletteEntry): entry is Command {
  return typeof (entry as Command).run === 'function'
}

export function kindOf(entry: PaletteEntry): EntryKind {
  return isTarget(entry) ? 'target' : 'command'
}

/** Every registered entry, commands first, in registration order. */
export function entries(): PaletteEntry[] {
  const all: PaletteEntry[] = [...commands.values(), ...targets.values()]
  all.sort((a, b) => (registeredAt.get(a.id) ?? 0) - (registeredAt.get(b.id) ?? 0))
  return all
}

/** Look one entry up by id. */
export function entryById(id: string): PaletteEntry | undefined {
  return commands.get(id) ?? targets.get(id)
}

/**
 * Record that an entry was used. Session-scoped on purpose: nothing here reaches
 * `store.ts`, because `Persisted` has no palette slot and inventing one would be a
 * change to another lane's contract.
 */
export function noteUse(id: string): void {
  const seen = usage.get(id)
  if (seen) {
    seen.count += 1
    seen.at = usageSeq++
  } else {
    usage.set(id, { count: 1, at: usageSeq++ })
  }
}

/** How many times an entry has been picked this session. */
export function useCount(id: string): number {
  return usage.get(id)?.count ?? 0
}

/** Run a command, or teleport to a place, counting the use. Errors reach the caller. */
export function activate(entry: PaletteEntry): void {
  noteUse(entry.id)
  if (isTarget(entry)) entry.teleport()
  else entry.run()
}

/**
 * What to show before anything has been typed: the most recently used entries first,
 * then the most used, then a stable slice of the registry so an untouched session
 * still offers somewhere to go.
 */
export function suggestions(limit = 12): PaletteEntry[] {
  const all = entries()
  const used = all.filter((e) => usage.has(e.id))
  used.sort((a, b) => {
    const ua = usage.get(a.id)
    const ub = usage.get(b.id)
    const at = (ub?.at ?? 0) - (ua?.at ?? 0)
    if (at !== 0) return at
    return (ub?.count ?? 0) - (ua?.count ?? 0)
  })

  const picked: PaletteEntry[] = []
  const seen = new Set<string>()
  for (const entry of used) {
    if (picked.length >= limit) break
    picked.push(entry)
    seen.add(entry.id)
  }
  if (picked.length < limit) {
    const rest = all.filter((e) => !seen.has(e.id))
    rest.sort(byGroupThenTitle)
    for (const entry of rest) {
      if (picked.length >= limit) break
      picked.push(entry)
    }
  }
  // Keep the recency order as the ranking, so the group holding the most recently used
  // entry still comes first once the list is grouped for display.
  const order = new Map<string, number>()
  picked.forEach((entry, index) => order.set(entry.id, index))
  return orderByGroup(picked, order)
}

function byGroupThenTitle(a: PaletteEntry, b: PaletteEntry): number {
  const ga = groupOrder(a.group)
  const gb = groupOrder(b.group)
  if (ga !== gb) return ga - gb
  if (a.group !== b.group) return a.group < b.group ? -1 : 1
  const ta = t(a.titleKey)
  const tb = t(b.titleKey)
  return ta.localeCompare(tb)
}

interface Hit {
  index: number
  length: number
}

function firstHit(re: RegExp, text: string): Hit | null {
  if (text.length === 0) return null
  re.lastIndex = 0
  let m: RegExpExecArray | null = null
  try {
    m = re.exec(text)
  } catch {
    // A pattern that throws mid-run (an engine limit) simply does not match.
    return null
  }
  if (!m) return null
  return { index: m.index, length: m[0].length }
}

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch)
}

function tierFor(text: string, hit: Hit | null): number {
  if (!hit) return NO_MATCH
  if (hit.length === 0) return T_EMPTY_MATCH
  if (hit.index === 0) return hit.length === text.length ? T_EXACT : T_PREFIX
  const before = text.charAt(hit.index - 1)
  if (!isWordChar(before)) return T_WORD_PREFIX
  return T_SUBSTRING
}

function scoreField(re: RegExp, text: string, weight: number): number {
  const tier = tierFor(text, firstHit(re, text))
  return tier === NO_MATCH ? NO_MATCH : weight + tier
}

function scoreEntry(entry: PaletteEntry, re: RegExp, title: string): number {
  let best = scoreField(re, title, W_TITLE)
  if (best === W_TITLE + T_EXACT) return best

  const keywords = isCommand(entry) ? entry.keywords : undefined
  if (keywords) {
    for (const keyword of keywords) {
      const score = scoreField(re, keyword, W_KEYWORD)
      if (score < best) best = score
    }
  }
  const groupScore = scoreField(re, groupLabel(entry.group), W_GROUP)
  if (groupScore < best) best = groupScore
  const idScore = scoreField(re, entry.id, W_ID)
  if (idScore < best) best = idScore
  return best
}

/**
 * Group the ranked entries. Groups are ordered by their best-scoring member, then by
 * the registered group order, then alphabetically, and entries keep their rank inside
 * the group.
 */
function orderByGroup(ranked: readonly PaletteEntry[], scores: Map<string, number>): PaletteEntry[] {
  const groups = groupsOf(ranked, scores)
  const out: PaletteEntry[] = []
  for (const group of groups) out.push(...group.entries)
  return out
}

function groupsOf(ranked: readonly PaletteEntry[], scores: Map<string, number>): SearchGroup[] {
  const buckets = new Map<string, PaletteEntry[]>()
  for (const entry of ranked) {
    const bucket = buckets.get(entry.group)
    if (bucket) bucket.push(entry)
    else buckets.set(entry.group, [entry])
  }
  const out: SearchGroup[] = []
  for (const [group, groupEntries] of buckets) {
    out.push({ group, label: groupLabel(group), entries: groupEntries })
  }
  out.sort((a, b) => {
    const sa = scores.get(a.entries[0]?.id ?? '') ?? 0
    const sb = scores.get(b.entries[0]?.id ?? '') ?? 0
    if (sa !== sb) return sa - sb
    const oa = groupOrder(a.group)
    const ob = groupOrder(b.group)
    if (oa !== ob) return oa - ob
    return a.label.localeCompare(b.label)
  })
  return out
}

/** Split a ranked, already grouped list back into its groups for display. */
export function grouped(ranked: readonly PaletteEntry[]): SearchGroup[] {
  return groupsOf(ranked, new Map())
}

/**
 * The full search, including why a regex query found nothing.
 *
 * Plain queries are turned into a pattern by `regex.ts` so that plain and regex mode
 * share one matcher and one definition of "starts with"; a plain query that somehow
 * fails to compile falls back to a case-insensitive substring scan rather than
 * showing the user an error they did not cause.
 */
export function searchDetailed(query: string, useRegex: boolean): SearchOutcome {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH)
  const all = entries()
  if (trimmed.length === 0) {
    const ranked = [...all].sort(byGroupThenTitle)
    return { entries: orderByGroup(ranked, new Map()), error: null }
  }

  const pattern = useRegex ? trimmed : plainToPattern(trimmed)
  const compiled = compile(pattern, 'i')
  if (!compiled.ok) {
    if (useRegex) {
      const outcome: SearchOutcome = { entries: [], error: compiled.error }
      if (typeof compiled.index === 'number') outcome.errorIndex = compiled.index
      return outcome
    }
    return { entries: literalSearch(all, trimmed), error: null }
  }

  const re = compiled.re
  const titles = new Map<string, string>()
  const scores = new Map<string, number>()
  const matched: PaletteEntry[] = []
  for (const entry of all) {
    const title = t(entry.titleKey)
    titles.set(entry.id, title)
    const score = scoreEntry(entry, re, title)
    if (score === NO_MATCH) continue
    scores.set(entry.id, score)
    matched.push(entry)
  }

  matched.sort((a, b) => {
    const sa = scores.get(a.id) ?? NO_MATCH
    const sb = scores.get(b.id) ?? NO_MATCH
    if (sa !== sb) return sa - sb
    const ca = usage.get(a.id)
    const cb = usage.get(b.id)
    const byCount = (cb?.count ?? 0) - (ca?.count ?? 0)
    if (byCount !== 0) return byCount
    const byRecency = (cb?.at ?? -1) - (ca?.at ?? -1)
    if (byRecency !== 0) return byRecency
    return (titles.get(a.id) ?? '').localeCompare(titles.get(b.id) ?? '')
  })

  return { entries: orderByGroup(matched, scores), error: null }
}

/** The last-resort matcher: plain, case-insensitive, no engine involved. */
function literalSearch(all: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const needle = query.toLowerCase()
  const scores = new Map<string, number>()
  const matched: PaletteEntry[] = []
  for (const entry of all) {
    const title = t(entry.titleKey)
    const haystacks: Array<[string, number]> = [
      [title, W_TITLE],
      [groupLabel(entry.group), W_GROUP],
      [entry.id, W_ID],
    ]
    if (isCommand(entry) && entry.keywords) {
      for (const keyword of entry.keywords) haystacks.push([keyword, W_KEYWORD])
    }
    let best = NO_MATCH
    for (const [text, weight] of haystacks) {
      const index = text.toLowerCase().indexOf(needle)
      if (index < 0) continue
      const score = weight + tierFor(text, { index, length: needle.length })
      if (score < best) best = score
    }
    if (best === NO_MATCH) continue
    scores.set(entry.id, best)
    matched.push(entry)
  }
  matched.sort((a, b) => (scores.get(a.id) ?? 0) - (scores.get(b.id) ?? 0))
  return orderByGroup(matched, scores)
}

/**
 * Ranked, grouped results for a query. An empty query matches everything; the palette
 * itself shows `suggestions()` instead so that an empty field offers recent and common
 * entries rather than the whole registry.
 */
export function search(query: string, useRegex: boolean): Array<Command | Target> {
  return searchDetailed(query, useRegex).entries
}
