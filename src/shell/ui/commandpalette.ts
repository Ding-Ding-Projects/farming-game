import {
  activate as activatePaletteEntry,
  entries as paletteEntries,
  grouped as groupPaletteEntries,
  groupLabel as paletteGroupLabel,
  isTarget,
} from '../core/palette-registry'
import type { Command, PaletteEntry } from '../core/palette-registry'
import { onLangChange, t } from '../core/i18n'
import { fail as notifyFail } from './notify'
import { createSearchField } from './searchfield'
import { el } from './primitives'

/**
 * The command palette: one modal list over everything the shell can do or go to.
 *
 * It owns no commands of its own. Everything it shows comes from `core/palette-registry`,
 * which the rest of the shell registers into, so a feature becomes reachable here by
 * registering rather than by editing this file. That is the whole point of the split: the
 * palette is a way of *finding* things, and it should not know what the things are.
 *
 * Lifted out of `app.ts`, which had grown to hold the boot sequence, the tab strip, the
 * history panel, every shell command and this — so a change to the search behaviour meant
 * reading a thousand lines to be sure nothing else moved.
 */

/** The chord that opens it. Exported because the status bar prints the same hint. */
export const PALETTE_CHORD = 'Ctrl+Shift+F'

/** Distinct from the history panel's field, which persists its own query separately. */
const PALETTE_SEARCH_ID = 'palette'

/**
 * A ceiling on rendered rows. The registry is small today, but the palette rebuilds its
 * whole list on every keystroke and an unbounded one would make typing feel heavy the day
 * somebody registers a few hundred entries.
 */
const MAX_ROWS = 200

export interface CommandPalette {
  open(): void
  close(): void
  isOpen(): boolean
  destroy(): void
}

export function createCommandPalette(root: HTMLElement): CommandPalette {
  const dialog = el('dialog', 'sh-dialog sh-palette')
  dialog.setAttribute('aria-label', t('palette.title'))

  const title = el('div', 'sh-dialog__title', dialog)
  const body = el('div', 'sh-dialog__body sh-stack', dialog)

  const field = createSearchField({
    id: PALETTE_SEARCH_ID,
    labelKey: 'palette.label',
    placeholderKey: 'palette.placeholder',
    onChange: () => {
      render()
    },
  })
  body.appendChild(field.el)

  const hint = el('p', 'sh-hint', body)
  const status = el('p', 'sh-hint', body)
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const list = el('ul', 'sh-listbox', body)
  list.id = 'sh-palette-list'
  list.setAttribute('role', 'listbox')

  const input = field.input
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'true')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-autocomplete', 'list')

  root.appendChild(dialog)

  let shown: PaletteEntry[] = []
  let activeIndex = 0
  let returnFocusTo: HTMLElement | null = null

  function optionId(index: number): string {
    return `sh-palette-option-${index}`
  }

  function matches(entry: PaletteEntry): boolean {
    if (!field.active()) return true
    const haystacks = [t(entry.titleKey), paletteGroupLabel(entry.group), entry.id]
    const keywords = (entry as Command).keywords
    if (Array.isArray(keywords)) haystacks.push(...keywords)
    return haystacks.some((text) => field.test(text))
  }

  function render(): void {
    shown = groupPaletteEntries(paletteEntries().filter(matches))
      .flatMap((group) => group.entries)
      .slice(0, MAX_ROWS)
    if (activeIndex >= shown.length) activeIndex = 0

    list.textContent = ''
    for (let i = 0; i < shown.length; i++) {
      const entry = shown[i]
      if (entry === undefined) continue
      const option = el('li', 'sh-option', list)
      option.id = optionId(i)
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(i === activeIndex))
      if (i === activeIndex) option.classList.add('is-active')
      const label = t(entry.titleKey)
      option.setAttribute(
        'aria-label',
        isTarget(entry) ? t('palette.goto', { title: label }) : t('palette.run', { title: label }),
      )
      const group = el('span', 'sh-badge', option)
      group.textContent = paletteGroupLabel(entry.group)
      const text = el('span', 'sh-truncate', option)
      text.textContent = label
      option.addEventListener('click', () => {
        choose(i)
      })
    }

    if (shown.length === 0) {
      const empty = el('li', 'sh-option', list)
      empty.setAttribute('role', 'presentation')
      empty.textContent = t('palette.empty', { query: field.query() })
      input.removeAttribute('aria-activedescendant')
    } else {
      input.setAttribute('aria-activedescendant', optionId(activeIndex))
    }
    status.textContent = t('palette.count', { count: shown.length })
  }

  function move(delta: number): void {
    if (shown.length === 0) return
    activeIndex = (activeIndex + delta + shown.length) % shown.length
    render()
    list.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({
      block: 'nearest',
    })
  }

  function choose(index: number): void {
    const entry = shown[index]
    if (entry === undefined) return
    close()
    try {
      activatePaletteEntry(entry)
    } catch (err) {
      notifyFail('common.error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        activeIndex = 0
        render()
        break
      case 'End':
        event.preventDefault()
        activeIndex = Math.max(0, shown.length - 1)
        render()
        break
      case 'Enter':
        event.preventDefault()
        choose(activeIndex)
        break
      default:
        break
    }
  })

  // Native `close` covers Escape as well as the button, so focus comes back once.
  dialog.addEventListener('close', () => {
    if (returnFocusTo !== null && returnFocusTo.isConnected) returnFocusTo.focus()
    returnFocusTo = null
  })

  function relabel(): void {
    dialog.setAttribute('aria-label', t('palette.title'))
    title.textContent = t('palette.title')
    hint.textContent = t('palette.hint', { keys: PALETTE_CHORD })
    list.setAttribute('aria-label', t('palette.title'))
    if (dialog.open) render()
  }

  relabel()
  const stopLang = onLangChange(relabel)

  function close(): void {
    if (dialog.open) dialog.close()
  }

  return {
    open(): void {
      if (dialog.open) return
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      activeIndex = 0
      field.clear()
      render()
      dialog.showModal()
      field.focus()
    },
    close,
    isOpen(): boolean {
      return dialog.open
    },
    destroy(): void {
      stopLang()
      close()
      dialog.remove()
    },
  }
}
