/**
 * The one reusable search field.
 *
 * Every list, table, picker, menu and settings surface in the shell that filters
 * anything uses this control, and every instance of it carries its own catalogue id,
 * its own `BuilderState` and its own anchored builder popover. **No builder state is
 * shared between fields**: the state object is created here, per call, and handed to
 * that field's builder alone. Nothing is persisted — no pattern, no flag, no sample.
 *
 * Plain text is the default and regex is an explicit opt-in, made twice over: the `.*`
 * toggle on the bar and the first switch in the builder are the same boolean, and
 * touching the raw pattern flips it on rather than silently reinterpreting what was
 * typed.
 *
 * Matching is `src/shell/core/regex.ts` throughout — `plainToPattern` for escaping and
 * `compile` for the pattern — so a query means exactly the same thing here as it does
 * in a test.
 *
 * A field with an empty or unusable query is **inactive**, and `test()` answers `true`
 * for everything while it is: a surface that filters through this control shows all of
 * its rows rather than none when the reader has not asked for anything yet. Callers
 * that need the opposite reading — bulk close, where a bad query must select nothing —
 * ask `active()` and `error()` and decide for themselves.
 */

import { compile } from '../core/regex'
import { announce, el, ensureSharedStyles, nextId, tr } from './primitives'
import {
  composeFlags,
  composePattern,
  newBuilderState,
  openRegexBuilder,
} from './regexbuilder'
import type { BuilderState, RegexBuilder } from './regexbuilder'

export interface SearchFieldOpts {
  /** Catalogue id. One per field; no builder state is ever shared between fields. */
  readonly id: string
  readonly labelKey: string
  readonly placeholderKey?: string
  /**
   * Facts interpolated into the label and the placeholder — a group name, for instance.
   * They are parameters rather than prose so no funny level can rewrite them.
   */
  readonly labelParams?: Record<string, string | number>
  /** Draw the label rather than hiding it visually. Defaults to hidden. */
  readonly showLabel?: boolean
  /** Called on every keystroke, every toggle and every builder change. */
  onChange(field: SearchField): void
}

export interface SearchField {
  readonly el: HTMLElement
  readonly input: HTMLInputElement
  readonly id: string
  /** True when a query is present and compiles. */
  active(): boolean
  /** True when the reader has typed nothing at all. */
  empty(): boolean
  /** The syntax error the query has, or null when it has none. */
  error(): string | null
  /** The current query text, as typed. */
  query(): string
  /** The pattern the query really compiles to, and its flags. */
  pattern(): { source: string; flags: string }
  /** Does this text match? True for every text while the field is inactive. */
  test(text: string): boolean
  clear(): void
  focus(): void
  /** Re-reads its labels after a language change. */
  relabel(): void
  destroy(): void
}

/**
 * Builds one field. The caller keeps the handle; the DOM is `field.el` and is not
 * attached to anything until the caller attaches it.
 */
export function createSearchField(opts: SearchFieldOpts): SearchField {
  ensureSharedStyles()

  /** This field's builder state. Created here, seen by nothing else. */
  const state: BuilderState = newBuilderState()

  const root = el('div', 'sh-search')
  root.dataset.searchId = opts.id

  const inputId = nextId('sh-search')
  const label = el('label', opts.showLabel === true ? 'sh-small' : 'sh-vh', root)
  label.htmlFor = inputId
  label.textContent = tr(opts.labelKey, opts.labelParams)

  const bar = el('div', 'sh-search-bar', root)
  const input = el('input', 'sh-search-input', bar)
  input.id = inputId
  input.type = 'search'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.placeholder = tr(opts.placeholderKey ?? opts.labelKey, opts.labelParams)
  // The catalogue names a surface by this id; the attribute is how a reader — or a
  // devtools inspection — finds the field the catalogue row is talking about.
  input.setAttribute('data-search-field', opts.id)

  // These two carry notation, not language: `.*` is what a regular expression looks like
  // and `…` is the "more" affordance. The translated words are the accessible names.
  const regexToggle = el('button', 'sh-btn sh-toggle sh-mono', bar)
  regexToggle.type = 'button'
  regexToggle.textContent = '.*'
  regexToggle.title = tr('search.mode.regex')
  regexToggle.setAttribute('aria-label', tr('search.mode.regex'))
  regexToggle.setAttribute('aria-pressed', 'false')

  const builderButton = el('button', 'sh-btn', bar)
  builderButton.type = 'button'
  builderButton.textContent = '…'
  builderButton.title = tr('search.builder.open')
  builderButton.setAttribute('aria-label', tr('search.builder.open'))
  builderButton.setAttribute('aria-haspopup', 'dialog')
  builderButton.setAttribute('aria-expanded', 'false')

  // A real, named, full-size Clear. The native `type="search"` affordance is a sub-24 px
  // pseudo-element that no keyboard can reach, so it is suppressed in the stylesheet.
  const clearButton = el('button', 'sh-btn sh-search-clear', bar)
  clearButton.type = 'button'
  clearButton.textContent = '×'
  clearButton.title = tr('search.clear')
  clearButton.setAttribute('aria-label', tr('search.clear'))
  clearButton.hidden = true
  clearButton.addEventListener('click', () => {
    input.value = ''
    changed()
    input.focus()
  })

  // Errors go in the live region; the effective pattern is a quiet hint, so a screen
  // reader is not read a regular expression on every keystroke.
  const status = el('p', 'sh-search-status', root)
  status.id = nextId('sh-search-status')
  status.setAttribute('role', 'status')
  const hint = el('p', 'sh-search-hint', root)
  hint.id = nextId('sh-search-hint')
  input.setAttribute('aria-describedby', `${status.id} ${hint.id}`)

  let compiled: RegExp | null = null
  let compileError: string | null = null

  function recompile(): void {
    const pattern = composePattern(state, input.value)
    const flags = composeFlags(state)
    if (pattern.length === 0) {
      compiled = null
      compileError = null
      status.textContent = ''
      hint.textContent = ''
      return
    }
    const result = compile(pattern, flags)
    if (result.ok) {
      compiled = result.re
      compileError = null
      status.textContent = ''
      hint.textContent = tr('search.builder.patternValid', {
        pattern,
        flags: flags.length > 0 ? flags : tr('search.builder.noFlags'),
      })
      input.removeAttribute('aria-invalid')
    } else {
      compiled = null
      compileError = result.error
      status.textContent = tr('search.builder.patternError', { error: result.error })
      hint.textContent = ''
      input.setAttribute('aria-invalid', 'true')
    }
  }

  function changed(): void {
    recompile()
    clearButton.hidden = input.value.length === 0
    builder?.sync()
    opts.onChange(field)
  }

  input.addEventListener('input', changed)
  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    // Esc clears the query before it reaches anything that would close the surface.
    if (ev.key === 'Escape' && input.value.length > 0) {
      ev.preventDefault()
      ev.stopPropagation()
      input.value = ''
      changed()
    }
  })

  function setRegexMode(on: boolean): void {
    state.regex = on
    regexToggle.setAttribute('aria-pressed', on ? 'true' : 'false')
  }

  regexToggle.addEventListener('click', () => {
    setRegexMode(!state.regex)
    announce(tr(state.regex ? 'search.mode.regex' : 'search.mode.plain'))
    changed()
  })

  let builder: RegexBuilder | null = null
  builderButton.addEventListener('click', () => {
    if (builder !== null && builder.isOpen()) {
      builder.close()
      return
    }
    builderButton.setAttribute('aria-expanded', 'true')
    builder = openRegexBuilder(
      builderButton,
      {
        state,
        query: () => input.value,
        setQuery: (text) => {
          input.value = text
        },
        setRegexMode,
        changed: () => {
          recompile()
          clearButton.hidden = input.value.length === 0
          opts.onChange(field)
        },
      },
      () => {
        builderButton.setAttribute('aria-expanded', 'false')
        builder = null
      },
    )
  })

  const field: SearchField = {
    el: root,
    input,
    id: opts.id,
    active: () => compiled !== null,
    empty: () => input.value.length === 0,
    error: () => compileError,
    query: () => input.value,
    pattern: () => ({ source: composePattern(state, input.value), flags: composeFlags(state) }),
    test: (text: string) => {
      if (compiled === null) return true
      // A global or sticky pattern would carry `lastIndex` from one row to the next and
      // match every other one; resetting keeps each test independent.
      compiled.lastIndex = 0
      return compiled.test(text)
    },
    clear: () => {
      input.value = ''
      changed()
    },
    focus: () => input.focus(),
    relabel: () => {
      label.textContent = tr(opts.labelKey, opts.labelParams)
      input.placeholder = tr(opts.placeholderKey ?? opts.labelKey, opts.labelParams)
      regexToggle.title = tr('search.mode.regex')
      regexToggle.setAttribute('aria-label', tr('search.mode.regex'))
      builderButton.title = tr('search.builder.open')
      builderButton.setAttribute('aria-label', tr('search.builder.open'))
      clearButton.title = tr('search.clear')
      clearButton.setAttribute('aria-label', tr('search.clear'))
      recompile()
    },
    destroy: () => {
      builder?.close()
      builder = null
      root.remove()
    },
  }

  recompile()
  return field
}
