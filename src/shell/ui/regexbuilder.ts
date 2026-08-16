/**
 * The anchored regular-expression builder.
 *
 * One of these belongs to one search field. It is opened from that field's own "…"
 * button, it is positioned against that button, and it writes back into that field —
 * there is no module-level builder state at all, so two fields open at once cannot see
 * each other's pattern. Nothing here is persisted: the pattern lives as long as the
 * field does and no longer, which is what `regex.notPersisted` tells the reader.
 *
 * What it offers, in the order the contract asks for it: guided literals with real
 * escaping, character classes, anchors, groups, alternation and quantifiers; raw pattern
 * editing; flags; a bounded sample; live matches with their capture groups; syntax
 * feedback; and copy and export.
 *
 * The maths is `src/shell/core/regex.ts` and nothing is re-implemented here — escaping is
 * `escapeLiteral`, plain text becomes a pattern through `plainToPattern`, compiling is
 * `compile` and running is `run`, whose sample, match-count and time bounds are the ones
 * this popover advertises rather than bounds of its own invention.
 */

import {
  DEFAULT_LIMITS,
  DIALECT_LABEL,
  compile,
  escapeLiteral,
  plainToPattern,
  run,
} from '../core/regex'
import type { Match } from '../core/regex'
import { download } from '../core/export'
import { announce, el, ensureSharedStyles, nextId, openPopover, tr } from './primitives'
import type { PopoverHandle } from './primitives'

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * Everything the builder decides about one field's query. The field owns the object; the
 * popover only reads and writes it, so closing and reopening the popover loses nothing.
 */
export interface BuilderState {
  /** The query text is a raw pattern rather than literal text. */
  regex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  startAnchor: boolean
  endAnchor: boolean
  multiline: boolean
  unicode: boolean
}

export function newBuilderState(): BuilderState {
  return {
    regex: false,
    caseSensitive: false,
    wholeWord: false,
    startAnchor: false,
    endAnchor: false,
    multiline: false,
    unicode: false,
  }
}

/** The pattern the query really compiles to, with the toggles folded in. */
export function composePattern(state: BuilderState, query: string): string {
  if (query.length === 0) return ''
  let body = state.regex ? query : plainToPattern(query)
  if (state.wholeWord) body = `\\b(?:${body})\\b`
  if (state.startAnchor) body = `^(?:${body})`
  if (state.endAnchor) body = `(?:${body})$`
  return body
}

export function composeFlags(state: BuilderState): string {
  let flags = ''
  if (!state.caseSensitive) flags += 'i'
  if (state.multiline) flags += 'm'
  if (state.unicode) flags += 'u'
  return flags
}

/** How many matched rows the popover will draw before it stops listing them. */
const MAX_LISTED_MATCHES = 40

/* ------------------------------------------------------------------ *
 * The seam back to the field
 * ------------------------------------------------------------------ */

export interface BuilderHost {
  /** The field's own state object, edited in place. */
  readonly state: BuilderState
  /** The current query text. */
  query(): string
  /** Replaces the query text. Used by raw pattern editing and by the piece buttons. */
  setQuery(text: string): void
  /** Mirrors the builder's regex switch onto the field's own toggle. */
  setRegexMode(on: boolean): void
  /** The query or the state changed: recompile, redraw, tell the surface. */
  changed(): void
}

export interface RegexBuilder extends PopoverHandle {
  /** Re-reads the host after the field itself changed, so the two never disagree. */
  sync(): void
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** Guided pieces. The snippet is the label: it is notation, not language. */
const PIECES: ReadonlyArray<{ labelKey: string; snippet: string; caret?: number }> = [
  { labelKey: 'regex.piece.digit', snippet: '\\d' },
  { labelKey: 'regex.piece.word', snippet: '\\w' },
  { labelKey: 'regex.piece.space', snippet: '\\s' },
  { labelKey: 'regex.piece.any', snippet: '.' },
  { labelKey: 'regex.piece.charclass', snippet: '[a-z]', caret: 1 },
  { labelKey: 'regex.piece.anchor.start', snippet: '^' },
  { labelKey: 'regex.piece.anchor.end', snippet: '$' },
  { labelKey: 'regex.piece.wordboundary', snippet: '\\b' },
  { labelKey: 'regex.piece.capture', snippet: '()', caret: 1 },
  { labelKey: 'regex.piece.noncapture', snippet: '(?:)', caret: 3 },
  { labelKey: 'regex.piece.alternation', snippet: '|' },
  { labelKey: 'regex.quantifier.optional', snippet: '?' },
  { labelKey: 'regex.quantifier.some', snippet: '+' },
  { labelKey: 'regex.quantifier.any', snippet: '*' },
  { labelKey: 'regex.quantifier.exact', snippet: '{2}', caret: 1 },
  { labelKey: 'regex.quantifier.range', snippet: '{1,3}', caret: 1 },
]

/** The switches, in the order they read. `regex` is first because it changes the rest. */
const TOGGLES: ReadonlyArray<{ key: keyof BuilderState; labelKey: string }> = [
  { key: 'regex', labelKey: 'search.mode.regex' },
  { key: 'caseSensitive', labelKey: 'search.builder.caseSensitive' },
  { key: 'wholeWord', labelKey: 'search.builder.wholeWord' },
  { key: 'startAnchor', labelKey: 'search.builder.startAnchor' },
  { key: 'endAnchor', labelKey: 'search.builder.endAnchor' },
  { key: 'multiline', labelKey: 'search.builder.multiline' },
  { key: 'unicode', labelKey: 'search.builder.unicode' },
]

/* ------------------------------------------------------------------ *
 * The popover
 * ------------------------------------------------------------------ */

/**
 * Opens the builder against `anchor`. The returned handle closes it, repositions it and
 * — through `sync()` — keeps it honest when the field is typed into directly.
 */
export function openRegexBuilder(
  anchor: HTMLElement,
  host: BuilderHost,
  onClose?: () => void,
): RegexBuilder {
  ensureSharedStyles()

  let refresh: () => void = () => undefined

  const handle = openPopover({
    anchor: { element: anchor },
    className: 'sh-builder',
    label: tr('search.builder.title'),
    onClose,
    build: (pop, close) => {
      const heading = el('h2', 'sh-pop-title', pop)
      heading.textContent = tr('search.builder.title')

      const modeHint = el('p', 'sh-small', pop)
      modeHint.textContent = tr('search.mode.hint')

      const dialect = el('p', 'sh-small', pop)
      dialect.textContent = tr('regex.dialect', { dialect: DIALECT_LABEL })

      /* --- the switches --- */

      const toggleWrap = el('div', 'sh-builder-toggles', pop)
      toggleWrap.setAttribute('role', 'group')
      toggleWrap.setAttribute('aria-label', tr('regex.flags.label'))
      const boxes = new Map<keyof BuilderState, HTMLInputElement>()
      for (const toggle of TOGGLES) {
        const wrap = el('label', 'sh-check', toggleWrap)
        const box = el('input', undefined, wrap)
        box.type = 'checkbox'
        box.checked = host.state[toggle.key]
        const text = el('span', undefined, wrap)
        text.textContent = tr(toggle.labelKey)
        box.addEventListener('change', () => {
          host.state[toggle.key] = box.checked
          if (toggle.key === 'regex') host.setRegexMode(box.checked)
          host.changed()
          refresh()
        })
        boxes.set(toggle.key, box)
      }

      /* --- a literal, escaped for real --- */

      const literalRow = el('div', 'sh-builder-row', pop)
      const literalId = nextId('sh-literal')
      const literalLabel = el('label', 'sh-small', literalRow)
      literalLabel.htmlFor = literalId
      literalLabel.textContent = tr('search.builder.insertLiteral')
      const literalInput = el('input', 'sh-search-input', literalRow)
      literalInput.id = literalId
      literalInput.type = 'text'
      literalInput.autocomplete = 'off'
      const literalButton = el('button', 'sh-btn', literalRow)
      literalButton.type = 'button'
      literalButton.textContent = tr('search.builder.insert')
      literalButton.addEventListener('click', () => {
        if (literalInput.value.length === 0) return
        insert(escapeLiteral(literalInput.value))
        literalInput.value = ''
      })
      const escapeNote = el('p', 'sh-small', pop)
      escapeNote.textContent = tr('regex.escape.note')

      /* --- guided pieces --- */

      const pieces = el('div', 'sh-builder-toggles', pop)
      pieces.setAttribute('role', 'group')
      pieces.setAttribute('aria-label', tr('search.builder.pieces'))
      for (const piece of PIECES) {
        const button = el('button', 'sh-btn sh-mono', pieces)
        button.type = 'button'
        button.textContent = piece.snippet
        button.setAttribute('aria-label', tr(piece.labelKey, { snippet: piece.snippet }))
        button.addEventListener('click', () => {
          insert(piece.snippet, piece.caret)
        })
      }

      /* --- the raw pattern --- */

      const rawRow = el('div', 'sh-builder-row', pop)
      const rawId = nextId('sh-raw')
      const rawLabel = el('label', 'sh-small', rawRow)
      rawLabel.htmlFor = rawId
      rawLabel.textContent = tr('regex.pattern.label')
      const raw = el('input', 'sh-search-input sh-mono', rawRow)
      raw.id = rawId
      raw.type = 'text'
      raw.autocomplete = 'off'
      raw.spellcheck = false
      raw.placeholder = tr('regex.pattern.placeholder')
      raw.addEventListener('input', () => {
        // Editing the raw box is an explicit switch to regex mode.
        setRegex(true)
        host.setQuery(raw.value)
        host.changed()
        refresh()
      })

      const flagsLine = el('p', 'sh-small', pop)
      const effective = el('p', 'sh-small sh-mono', pop)
      const syntax = el('p', 'sh-search-status', pop)
      syntax.setAttribute('role', 'status')

      /* --- the sample and what it caught --- */

      const sampleRow = el('div', 'sh-builder-row', pop)
      const sampleId = nextId('sh-sample')
      const sampleLabel = el('label', 'sh-small', sampleRow)
      sampleLabel.htmlFor = sampleId
      sampleLabel.textContent = tr('regex.sample.label')
      const sample = el('textarea', 'sh-search-input sh-mono sh-builder-sample', pop)
      sample.id = sampleId
      sample.rows = 3
      sample.spellcheck = false
      sample.placeholder = tr('regex.sample.placeholder')
      sample.maxLength = DEFAULT_LIMITS.maxSampleLength
      const sampleLimit = el('p', 'sh-small', pop)
      sampleLimit.textContent = tr('regex.sample.limit', { max: DEFAULT_LIMITS.maxSampleLength })
      sample.addEventListener('input', refreshMatches)

      const matchCount = el('p', 'sh-small', pop)
      matchCount.setAttribute('role', 'status')
      const matchList = el('ul', 'sh-builder-matches', pop)

      /* --- taking it away --- */

      const actions = el('div', 'sh-builder-row', pop)
      const copy = el('button', 'sh-btn', actions)
      copy.type = 'button'
      copy.textContent = tr('regex.copy')
      copy.addEventListener('click', () => {
        const text = composePattern(host.state, host.query())
        if (text.length === 0) return
        void writeClipboard(text).then((done) => {
          announce(tr(done ? 'search.builder.copied' : 'search.builder.copyFailed', { pattern: text }))
        })
      })

      const exportButton = el('button', 'sh-btn', actions)
      exportButton.type = 'button'
      exportButton.textContent = tr('regex.export')
      exportButton.addEventListener('click', () => {
        exportPattern(host, sample.value)
      })

      const closeButton = el('button', 'sh-btn', actions)
      closeButton.type = 'button'
      closeButton.textContent = tr('search.builder.close')
      closeButton.addEventListener('click', close)

      const notPersisted = el('p', 'sh-small', pop)
      notPersisted.textContent = tr('regex.notPersisted')

      /* --- behaviour --- */

      function setRegex(on: boolean): void {
        host.state.regex = on
        const box = boxes.get('regex')
        if (box) box.checked = on
        host.setRegexMode(on)
      }

      function insert(snippet: string, caretOffset?: number): void {
        setRegex(true)
        const start = raw.selectionStart ?? raw.value.length
        const end = raw.selectionEnd ?? raw.value.length
        raw.value = raw.value.slice(0, start) + snippet + raw.value.slice(end)
        const caret = start + (caretOffset ?? snippet.length)
        raw.setSelectionRange(caret, caret)
        raw.focus()
        host.setQuery(raw.value)
        host.changed()
        refresh()
      }

      function refreshMatches(): void {
        const pattern = composePattern(host.state, host.query())
        matchList.textContent = ''
        if (pattern.length === 0 || sample.value.length === 0) {
          matchCount.textContent = ''
          return
        }
        // `g` is what makes the run report every match rather than only the first.
        const result = compile(pattern, `${composeFlags(host.state)}g`)
        if (!result.ok) {
          matchCount.textContent = ''
          return
        }
        const outcome = run(result.re, sample.value)
        const notes: string[] = [
          outcome.matches.length === 0
            ? tr('regex.matches.none')
            : tr('regex.matches', { count: outcome.matches.length }),
        ]
        if (outcome.truncated) {
          notes.push(
            tr('regex.matches.truncated', {
              shown: outcome.matches.length,
              limit: DEFAULT_LIMITS.maxMatches,
            }),
          )
        }
        if (outcome.sampleTruncated === true) {
          notes.push(tr('regex.sample.truncatedInput', { max: DEFAULT_LIMITS.maxSampleLength }))
        }
        if (outcome.timedOut) {
          notes.push(tr('regex.timeout', { ms: DEFAULT_LIMITS.timeBudgetMs }))
        }
        matchCount.textContent = notes.join(' ')
        for (const match of outcome.matches.slice(0, MAX_LISTED_MATCHES)) {
          matchList.appendChild(matchRow(match))
        }
      }

      refresh = (): void => {
        for (const toggle of TOGGLES) {
          const box = boxes.get(toggle.key)
          if (box) box.checked = host.state[toggle.key]
        }
        // In plain mode the raw box shows what the plain query compiles to; editing it
        // is an explicit switch to regex mode.
        const query = host.query()
        const shown = host.state.regex ? query : plainToPattern(query)
        if (raw.value !== shown && document.activeElement !== raw) raw.value = shown
        const flags = composeFlags(host.state)
        flagsLine.textContent = tr('search.builder.flags', {
          flags: flags.length > 0 ? flags : tr('search.builder.noFlags'),
        })
        const pattern = composePattern(host.state, query)
        effective.textContent = tr('search.builder.effectivePattern', {
          pattern: pattern.length > 0 ? pattern : tr('search.builder.emptyPattern'),
        })
        if (pattern.length === 0) {
          syntax.textContent = ''
        } else {
          const result = compile(pattern, flags)
          syntax.textContent = result.ok
            ? ''
            : result.index === undefined
              ? tr('regex.error', { error: result.error })
              : tr('regex.error.at', { error: result.error, index: result.index })
        }
        refreshMatches()
      }

      refresh()
      return raw
    },
  })

  return {
    root: handle.root,
    close: handle.close,
    reposition: handle.reposition,
    isOpen: handle.isOpen,
    sync: () => refresh(),
  }
}

/** One match, with every capture group it filled, as words rather than colour. */
function matchRow(match: Match): HTMLLIElement {
  const item = el('li')
  const head = el('span', 'sh-mono', item)
  head.textContent =
    match.value.length === 0
      ? tr('regex.match.empty', { index: match.index })
      : tr('regex.match.at', { index: match.index, text: match.value })
  const filled = match.groups.filter((group) => group.value !== undefined)
  if (filled.length === 0) return item
  const groups = el('ul', 'sh-builder-groups', item)
  for (const group of filled) {
    const row = el('li', 'sh-mono', groups)
    row.textContent =
      group.name === undefined
        ? tr('regex.group.numbered', { n: group.number, text: group.value ?? '' })
        : tr('regex.group.named', { name: group.name, text: group.value ?? '' })
  }
  return item
}

/**
 * The pattern, its flags, the sample and every match it caught, as Markdown. It goes
 * through `core/export.ts`'s `download`, so this file owns no download plumbing of its
 * own and nothing about the pattern is written to storage on the way past.
 */
function exportPattern(host: BuilderHost, sample: string): void {
  const pattern = composePattern(host.state, host.query())
  const flags = composeFlags(host.state)
  const lines = [`# ${tr('search.builder.title')}`, '', '```', `/${pattern}/${flags}`, '```', '']
  if (sample.length > 0) {
    const result = compile(pattern, `${flags}g`)
    lines.push(`## ${tr('regex.sample.label')}`, '', '```', sample, '```', '')
    if (result.ok) {
      const outcome = run(result.re, sample)
      lines.push(
        `## ${
          outcome.matches.length === 0
            ? tr('regex.matches.none')
            : tr('regex.matches', { count: outcome.matches.length })
        }`,
        '',
      )
      for (const match of outcome.matches) {
        lines.push(
          `- ${
            match.value.length === 0
              ? tr('regex.match.empty', { index: match.index })
              : tr('regex.match.at', { index: match.index, text: match.value })
          }`,
        )
        for (const group of match.groups) {
          if (group.value === undefined) continue
          lines.push(
            `  - ${
              group.name === undefined
                ? tr('regex.group.numbered', { n: group.number, text: group.value })
                : tr('regex.group.named', { name: group.name, text: group.value })
            }`,
          )
        }
      }
    }
  }
  try {
    download('sprout-hollow-pattern.md', `${lines.join('\n')}\n`, 'text/markdown;charset=utf-8')
  } catch {
    announce(tr('search.builder.copyFailed', { pattern }))
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } }
  if (!nav.clipboard) return false
  try {
    await nav.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
