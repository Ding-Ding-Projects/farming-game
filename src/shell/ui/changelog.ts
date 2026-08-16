/**
 * The Changelog tab.
 *
 * `CHANGELOG.md` is imported at build time as a string, parsed into versions and
 * entries here, and rendered as real headings and lists. Nothing is fetched, and
 * there is no Markdown dependency: the file is written in one known format — Keep a
 * Changelog — and this parser reads exactly that, treating anything it does not
 * recognise as text rather than dropping it.
 *
 * Links are rendered as their text followed by the address in plain sight. A
 * documentation tab in an offline desktop application has no business navigating
 * anywhere, and showing the address is more honest than hiding it under a word.
 */

import changelogSource from '../../../CHANGELOG.md?raw'
import type { DocPanel, DocSectionSpec } from './almanac'
import { createDocPanel, docText, registerDocStrings } from './almanac'

export const CHANGELOG_ID = 'changelog'
export const CHANGELOG_SEARCH_ID = 'changelog.search'

/** The raw Markdown, exported so a test can assert the parser against the file. */
export const CHANGELOG_SOURCE: string = changelogSource

/**
 * Wordings the shared catalogue does not carry yet. Everything else — the title,
 * the intro, the version heading, the release date, the empty state and the search
 * field — comes from the catalogue, so the changelog follows the language too.
 */
export const CHANGELOG_STRINGS: Readonly<Record<string, string>> = {
  'changelog.contents': 'Releases',
  'changelog.counts': '{versions} versions, {entries} entries.',
  'changelog.yanked': 'Withdrawn',
  'changelog.latest': 'Latest release',
  'changelog.section.added': 'Added',
  'changelog.section.changed': 'Changed',
  'changelog.section.deprecated': 'Deprecated',
  'changelog.section.removed': 'Removed',
  'changelog.section.fixed': 'Fixed',
  'changelog.section.security': 'Security',
}

registerDocStrings(CHANGELOG_STRINGS)

// ---------------------------------------------------------------------------
// the parser
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  /** The plain text of the bullet, with inline markup resolved. */
  text: string
  /** The `####` sub-heading this bullet sits under, if any. */
  group: string | null
  /** The inline runs, so the renderer can set code spans in a code face. */
  runs: readonly InlineRun[]
}

export interface ChangelogSection {
  /** The literal heading — `Added`, `Fixed` — as written in the file. */
  kind: string
  entries: ChangelogEntry[]
}

export interface ChangelogVersion {
  /** A DOM-safe id derived from the version. */
  id: string
  /** `1.0.0`, or `Unreleased`. */
  version: string
  /** `2026-08-16`, or null when the heading carries no date. */
  date: string | null
  yanked: boolean
  /** Paragraphs written under the version heading before any `###` section. */
  notes: string[]
  sections: ChangelogSection[]
}

export interface ChangelogDoc {
  title: string
  intro: string[]
  versions: ChangelogVersion[]
}

export interface InlineRun {
  kind: 'text' | 'code'
  text: string
}

const VERSION_HEADING = /^##\s+(.+?)\s*$/
const SECTION_HEADING = /^###\s+(.+?)\s*$/
const GROUP_HEADING = /^####\s+(.+?)\s*$/
const TITLE_HEADING = /^#\s+(.+?)\s*$/
const BULLET = /^[-*+]\s+(.*)$/
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S+\s*$/
const CONTINUATION = /^\s{2,}\S/

/** `[1.0.0] - 2026-08-16 [YANKED]`, and every looser spelling of the same thing. */
function parseVersionHeading(heading: string): { version: string; date: string | null; yanked: boolean } {
  let rest = heading
  let yanked = false
  const yankedMatch = /\[yanked\]/i.exec(rest)
  if (yankedMatch !== null) {
    yanked = true
    rest = rest.replace(yankedMatch[0], ' ')
  }
  const bracketed = /^\[([^\]]+)\]/.exec(rest.trim())
  let version: string
  let tail: string
  if (bracketed !== null) {
    version = bracketed[1].trim()
    tail = rest.trim().slice(bracketed[0].length)
  } else {
    const parts = rest.trim().split(/\s+[-–—]\s+/)
    version = (parts[0] ?? rest).trim()
    tail = parts.length > 1 ? parts.slice(1).join(' - ') : ''
  }
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(tail)
  return { version, date: dateMatch === null ? null : dateMatch[1], yanked }
}

function slug(text: string): string {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length === 0 ? 'version' : cleaned
}

/**
 * Resolves the inline Markdown this project actually uses: code spans, emphasis
 * and links. Anything else is left exactly as written.
 */
export function parseInline(source: string): InlineRun[] {
  const withLinks = source.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_whole, text: string, url: string) =>
    text.trim() === url.trim() ? text : `${text} (${url})`,
  )
  const runs: InlineRun[] = []
  let buffer = ''
  let index = 0
  while (index < withLinks.length) {
    const char = withLinks[index]
    if (char === '`') {
      const close = withLinks.indexOf('`', index + 1)
      if (close > index) {
        if (buffer.length > 0) {
          runs.push({ kind: 'text', text: stripEmphasis(buffer) })
          buffer = ''
        }
        runs.push({ kind: 'code', text: withLinks.slice(index + 1, close) })
        index = close + 1
        continue
      }
    }
    buffer += char
    index += 1
  }
  if (buffer.length > 0) runs.push({ kind: 'text', text: stripEmphasis(buffer) })
  return runs
}

function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/__([^_]+)__/g, '$1')
}

function runsToText(runs: readonly InlineRun[]): string {
  let out = ''
  for (const run of runs) out += run.text
  return out
}

/** Parses a Keep a Changelog document. Never throws: bad input yields empty versions. */
export function parseChangelog(markdown: string): ChangelogDoc {
  const doc: ChangelogDoc = { title: '', intro: [], versions: [] }
  const lines = markdown.split(/\r?\n/)

  let version: ChangelogVersion | null = null
  let section: ChangelogSection | null = null
  let group: string | null = null
  let entry: ChangelogEntry | null = null
  let paragraph: string[] = []
  const usedIds = new Set<string>()

  function flushParagraph(): void {
    if (paragraph.length === 0) return
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (text.length === 0) return
    const resolved = runsToText(parseInline(text))
    if (version === null) doc.intro.push(resolved)
    else version.notes.push(resolved)
  }

  function closeEntry(): void {
    entry = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.trim().length === 0) {
      flushParagraph()
      closeEntry()
      continue
    }
    if (LINK_DEFINITION.test(line.trim())) {
      flushParagraph()
      closeEntry()
      continue
    }

    const title = TITLE_HEADING.exec(line)
    if (title !== null) {
      flushParagraph()
      closeEntry()
      doc.title = title[1]
      continue
    }

    const versionHeading = VERSION_HEADING.exec(line)
    if (versionHeading !== null) {
      flushParagraph()
      closeEntry()
      const parsed = parseVersionHeading(versionHeading[1])
      let id = slug(parsed.version)
      let n = 2
      while (usedIds.has(id)) {
        id = `${slug(parsed.version)}-${n}`
        n += 1
      }
      usedIds.add(id)
      version = {
        id,
        version: parsed.version,
        date: parsed.date,
        yanked: parsed.yanked,
        notes: [],
        sections: [],
      }
      doc.versions.push(version)
      section = null
      group = null
      continue
    }

    const sectionHeading = SECTION_HEADING.exec(line)
    if (sectionHeading !== null && version !== null) {
      flushParagraph()
      closeEntry()
      section = { kind: sectionHeading[1], entries: [] }
      version.sections.push(section)
      group = null
      continue
    }

    const groupHeading = GROUP_HEADING.exec(line)
    if (groupHeading !== null) {
      flushParagraph()
      closeEntry()
      group = groupHeading[1]
      continue
    }

    const bullet = BULLET.exec(line.trim())
    if (bullet !== null && version !== null) {
      flushParagraph()
      if (section === null) {
        section = { kind: '', entries: [] }
        version.sections.push(section)
      }
      const runs = parseInline(bullet[1])
      entry = { text: runsToText(runs), group, runs }
      section.entries.push(entry)
      continue
    }

    // A wrapped bullet: two or more spaces of indent and an open entry. The entry
    // is already in its section by reference, so mending it here is enough.
    if (entry !== null && CONTINUATION.test(rawLine)) {
      const runs = parseInline(`${entry.text} ${line.trim()}`)
      entry.text = runsToText(runs)
      entry.runs = runs
      continue
    }

    paragraph.push(line.trim())
  }

  flushParagraph()
  return doc
}

/** Total number of bullets across every version. Used in the lede and by tests. */
export function countEntries(doc: ChangelogDoc): number {
  let n = 0
  for (const version of doc.versions) {
    for (const section of version.sections) n += section.entries.length
  }
  return n
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

const KNOWN_SECTIONS: Readonly<Record<string, string>> = {
  added: 'changelog.section.added',
  changed: 'changelog.section.changed',
  deprecated: 'changelog.section.deprecated',
  removed: 'changelog.section.removed',
  fixed: 'changelog.section.fixed',
  security: 'changelog.section.security',
}

function sectionLabel(kind: string): string {
  const key = KNOWN_SECTIONS[kind.trim().toLowerCase()]
  return key === undefined ? kind : docText(key)
}

function inlineFragment(runs: readonly InlineRun[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const run of runs) {
    if (run.kind === 'code') {
      const code = document.createElement('code')
      code.className = 'sh-doc__mono'
      code.textContent = run.text
      fragment.appendChild(code)
    } else {
      fragment.appendChild(document.createTextNode(run.text))
    }
  }
  return fragment
}

function buildVersion(version: ChangelogVersion, latest: boolean): (section: HTMLElement) => void {
  return (host: HTMLElement) => {
    const parts: string[] = []
    if (version.date !== null) parts.push(docText('changelog.released', { date: version.date }))
    if (latest) parts.push(docText('changelog.latest'))
    if (version.yanked) parts.push(docText('changelog.yanked'))
    if (parts.length > 0) {
      const badges = document.createElement('p')
      badges.className = 'sh-doc__note'
      badges.textContent = parts.join(' · ')
      badges.setAttribute('data-search-text', `${parts.join(' ')} ${version.version}`)
      host.appendChild(badges)
    }

    for (const note of version.notes) {
      const p = document.createElement('p')
      p.textContent = note
      p.setAttribute('data-search-text', `${note} ${version.version}`)
      host.appendChild(p)
    }

    for (const section of version.sections) {
      if (section.kind.length > 0) {
        const heading = document.createElement('h4')
        heading.textContent = sectionLabel(section.kind)
        host.appendChild(heading)
      }
      let currentGroup: string | null = null
      let list: HTMLUListElement | null = null
      for (const entry of section.entries) {
        if (list === null || entry.group !== currentGroup) {
          currentGroup = entry.group
          if (currentGroup !== null) {
            const groupHeading = document.createElement('h5')
            groupHeading.textContent = currentGroup
            host.appendChild(groupHeading)
          }
          list = document.createElement('ul')
          list.className = 'sh-doc__list'
          host.appendChild(list)
        }
        const item = document.createElement('li')
        item.appendChild(inlineFragment(entry.runs))
        const context = [version.version, section.kind, entry.group ?? ''].join(' ')
        item.setAttribute('data-search-text', `${entry.text} ${context}`)
        list.appendChild(item)
      }
    }
  }
}

/** `Unreleased` is a holding pen, not a release, so it never wears the badge. */
export function isUnreleased(version: ChangelogVersion): boolean {
  return /^unreleased$/i.test(version.version.trim())
}

function sectionsFor(doc: ChangelogDoc): DocSectionSpec[] {
  const latest = doc.versions.findIndex((version) => !isUnreleased(version))
  return doc.versions.map((version, index) => ({
    id: version.id,
    titleKey: 'changelog.version',
    titleParams: { version: version.version },
    build: buildVersion(version, index === latest),
  }))
}

let listStyleInjected = false

/** One extra rule the shared documentation stylesheet does not need to carry. */
function ensureListStyles(): void {
  if (listStyleInjected || typeof document === 'undefined') return
  listStyleInjected = true
  const style = document.createElement('style')
  style.id = 'sprout-changelog-styles'
  style.textContent = `
.sh-doc--changelog .sh-doc__list { margin: 0; padding-inline-start: 1.4em; display: flex; flex-direction: column; gap: 4px; }
.sh-doc--changelog .sh-doc__list li { max-width: 68ch; }
.sh-doc--changelog h5 { margin: 4px 0 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.04em; }
`
  const head = document.head ?? document.documentElement
  head.appendChild(style)
}

/** The Changelog panel, parsed from the repository's own `CHANGELOG.md`. */
export function createChangelogPanel(): DocPanel {
  ensureListStyles()
  const doc = parseChangelog(CHANGELOG_SOURCE)
  const sections = sectionsFor(doc)

  const panel = createDocPanel({
    id: CHANGELOG_ID,
    titleKey: 'changelog.title',
    ledeKey: 'changelog.intro',
    notes: [
      docText('changelog.counts', { versions: doc.versions.length, entries: countEntries(doc) }),
      ...doc.intro,
    ],
    searchId: CHANGELOG_SEARCH_ID,
    searchLabelKey: 'search.changelog.label',
    searchPlaceholderKey: 'search.changelog.placeholder',
    searchScopeKey: 'docs.search.scope.changelog',
    searchCommandKey: 'search.changelog.label',
    tocKey: 'changelog.contents',
    sections,
  })

  if (sections.length === 0) {
    const empty = document.createElement('p')
    empty.textContent = docText('changelog.empty')
    empty.setAttribute('data-search-text', empty.textContent)
    panel.el.appendChild(empty)
  }

  return panel
}

/** Convenience for a host that would rather hand over a container than an element. */
export function mountChangelog(host: HTMLElement): DocPanel {
  const panel = createChangelogPanel()
  host.appendChild(panel.el)
  return panel
}
