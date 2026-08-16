/**
 * The catalogue of every search surface in the application.
 *
 * One row per search field: the id it registers under, the module that builds it, the
 * constant that declares that id, and — through the string catalogue rather than in bare
 * English — the field's own label and the words that say what it searches.
 *
 * It is hand-written on purpose. `tests/search-catalogue.test.ts` reads the field ids
 * straight out of `src/shell` and checks this file in both directions: a field with no
 * row here fails, and a row here pointing at no field fails too. That is the whole point
 * of the file — a surface nobody documented and a promise the app does not keep are both
 * caught by the same guard.
 *
 * There is no DOM in this module and there never should be: the guard imports it in a
 * node environment, and a catalogue that could only be read inside a browser would be a
 * catalogue nothing could check.
 *
 * Adding a search field? Declare its id as a named constant next to the surface that
 * builds it, then add a row here. Both halves of the guard will tell you if you forget.
 */

import type { StringKey } from '../core/i18n'

export interface CatalogueEntry {
  /** The id the field registers under, and the `data-search-field` value it carries. */
  readonly id: string
  /** Repo-relative path of the module that builds the field. */
  readonly where: string
  /** The exported constant that declares the id, so one grep lands on it. */
  readonly constant: string
  /** The field's own label, in the reader's language. */
  readonly labelKey: StringKey
  /** What it searches, in the reader's language: the field's placeholder. */
  readonly placeholderKey: StringKey
}

/**
 * Every search field the shell registers.
 *
 * `tabs.group` is a prefix rather than a single field: the real ids are
 * `tabs.group.<groupId>`, one per tab group, each with its own builder state. The row is
 * the prefix because the set of groups is whatever the reader has made.
 */
export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  /* -- the tab strip -- */
  {
    id: 'tabs.strip',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'STRIP_SEARCH_FIELD_ID',
    labelKey: 'search.tabs.strip.label',
    placeholderKey: 'search.tabs.strip.placeholder',
  },
  {
    id: 'tabs.overflow',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'OVERFLOW_SEARCH_FIELD_ID',
    labelKey: 'tabs.overflow.label',
    placeholderKey: 'search.tabs.strip.placeholder',
  },
  {
    id: 'tabs.group',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'GROUP_SEARCH_FIELD_PREFIX',
    labelKey: 'search.tabs.group.label',
    placeholderKey: 'search.tabs.group.placeholder',
  },
  {
    id: 'tabs.groupNames',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'GROUP_NAME_SEARCH_FIELD_ID',
    labelKey: 'search.tabs.groupNames.label',
    placeholderKey: 'search.tabs.groupNames.placeholder',
  },
  {
    id: 'tabs.all',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'ALL_TABS_SEARCH_FIELD_ID',
    labelKey: 'search.tabs.all.label',
    placeholderKey: 'search.tabs.all.placeholder',
  },
  {
    id: 'tabs.bulkClose',
    where: 'src/shell/ui/tabsearch.ts',
    constant: 'BULK_CLOSE_FIELD_ID',
    labelKey: 'common.search',
    placeholderKey: 'search.tabs.all.placeholder',
  },

  /* -- the shell's own surfaces -- */
  {
    id: 'palette',
    where: 'src/shell/app.ts',
    constant: 'PALETTE_SEARCH_ID',
    labelKey: 'palette.label',
    placeholderKey: 'palette.placeholder',
  },
  {
    id: 'history',
    where: 'src/shell/app.ts',
    constant: 'HISTORY_SEARCH_ID',
    labelKey: 'search.history.label',
    placeholderKey: 'search.history.placeholder',
  },
  {
    id: 'settings',
    where: 'src/shell/ui/settings.ts',
    constant: 'SETTINGS_SEARCH_ID',
    labelKey: 'search.settings.label',
    placeholderKey: 'search.settings.placeholder',
  },

  /* -- documentation -- */
  {
    id: 'almanac.search',
    where: 'src/shell/ui/almanac.ts',
    constant: 'ALMANAC_SEARCH_ID',
    labelKey: 'search.almanac.label',
    placeholderKey: 'search.almanac.placeholder',
  },
  {
    id: 'changelog.search',
    where: 'src/shell/ui/changelog.ts',
    constant: 'CHANGELOG_SEARCH_ID',
    labelKey: 'search.changelog.label',
    placeholderKey: 'search.changelog.placeholder',
  },

  /* -- appearance and colour -- */
  {
    id: 'appearance.colorpicker.swatches',
    where: 'src/shell/ui/colorpicker.ts',
    constant: 'SEARCH_FIELD_IDS.swatches',
    labelKey: 'colorpicker.searchLabel',
    placeholderKey: 'colorpicker.searchPlaceholder',
  },
  {
    id: 'appearance.editor.properties',
    where: 'src/shell/ui/appearance.ts',
    constant: 'SEARCH_FIELD_IDS.properties',
    labelKey: 'search.appearance.label',
    placeholderKey: 'search.appearance.placeholder',
  },
  {
    id: 'appearance.menu.items',
    where: 'src/shell/ui/appearance.ts',
    constant: 'SEARCH_FIELD_IDS.menu',
    labelKey: 'search.appearance.label',
    placeholderKey: 'search.appearance.placeholder',
  },
])

/** The row for one field id, or `undefined` when the catalogue has never heard of it. */
export function catalogueEntry(id: string): CatalogueEntry | undefined {
  const exact = CATALOGUE.find((entry) => entry.id === id)
  if (exact !== undefined) return exact
  // `tabs.group.work` is one of the fields the `tabs.group` prefix row stands for.
  return CATALOGUE.find((entry) => id.startsWith(`${entry.id}.`))
}

/** Every id the catalogue carries, in the order the rows are written. */
export function catalogueIds(): string[] {
  return CATALOGUE.map((entry) => entry.id)
}
