/**
 * The Ledger — `docs/ECONOMY.md` section 9, as a shell tab.
 *
 * Five surfaces, in the order the contract lists them:
 *
 *  1. **Price history** — the chart in `pricechart.ts`, the live supply index, and every
 *     good this farm has ever traded with the numbers behind its price.
 *  2. **Income and expenses** — by source and by season, with the season's levy worked
 *     out the same way `market.seasonalTax` will work it out.
 *  3. **Orders** — available, accepted, completed and failed.
 *  4. **Loans** — outstanding, rate, what the next accrual adds, and a real repay control.
 *  5. **Reputation** — the number, the named rank beside it, and what moved it.
 *
 * Each one owns **its own search field**, with its own anchored regular-expression
 * builder from `searchfield.ts` and its own id in `LEDGER_SEARCH_FIELD_IDS`, and each
 * registers a command-palette `Target` that really brings the section forward and puts
 * focus on it. The whole thing exports as JSON, CSV and Markdown through the primitives
 * in `src/shell/core/export.ts`.
 *
 * ## Where every number comes from
 *
 * Nothing here is invented and nothing is retyped. Prices, supply, events, economics,
 * reputation, credit and the levy are read from `src/game/economy.ts` and
 * `src/game/market.ts` at render time, so a balance pass in either module moves this page
 * in the same edit.
 *
 * Two things the save does not keep, and how they are honestly recovered:
 *
 * - **Completed and failed orders.** `fulfilOrder` and `expireOrders` remove an order
 *   from `state.orders`; nothing retains it. So the Ledger *watches*: on every refresh it
 *   diffs the order board against the one it last saw, decides from the due day whether a
 *   vanished accepted order was filled or missed, and writes that to the shell's own
 *   history through `record()`. The log therefore survives a reload, and it is seeded back
 *   out of the history when the panel is built.
 * - **What moved reputation.** Same technique: the standing delta between two refreshes
 *   is attributed to the order events seen in the same tick, to a loan whose missed-payment
 *   count went up, and — for whatever is left — to steady trade. Every movement is
 *   recorded with its cause and its running total.
 *
 * The income-by-source table is derived from the application's own history log rather
 * than from a per-source counter the save does not carry, and the page says so in as many
 * words. The by-season table uses `seasonFigures`, which is exact for the season the
 * assessor has opened books on and, for the rest, the published even-share estimate that
 * `market.ts` documents — each row is labelled with which of the two it is. A number the
 * player cannot predict is a bug with a story attached, so both rules are on the page.
 *
 * Every string goes through `t()` where the catalogue has the key, and through this file's
 * plain-English defaults where it does not yet — the same route `almanac.ts` takes, with
 * the same rule that facts stay `{placeholders}` so no funny level can restate a price.
 * Every colour comes from the tokens.
 */

import { DAYS_PER_SEASON, SEASONS } from '../../game/constants'
import { cropById } from '../../game/crops'
import {
  HISTORY_DAYS,
  absoluteDay,
  economicsFor,
  eventIsActive,
  goodCategory,
  itemFromKey,
  marketDepth,
  reputationBonus,
  rollWeeklyEvent,
  sellPrice,
  supplyIndexOf,
  tradedGoods,
} from '../../game/economy'
import {
  CRATE_LEVEL,
  CRATE_REPUTATION,
  TAX_RATE,
  absoluteSeason,
  canFulfil,
  creditAvailable,
  creditLimit,
  expectedOutstanding,
  loanRate,
  maxAcceptedOrders,
  orderTier,
  repayLoan,
  reputationRank,
  seasonFigures,
  totalDebt,
} from '../../game/market'
import { materialName } from '../../game/materials'
import { productById } from '../../game/products'
import { treeById } from '../../game/trees'
import type { Loan, MarketEvent, MaterialId, Order } from '../../game/farm-types'
import type { ActionResult, GameState, ItemRef, Season } from '../../game/types'
import { csvField, download, extensionFor, mimeFor } from '../core/export'
import type { ExportFormat } from '../core/export'
import { query as queryHistory, record } from '../core/history'
import type { HistoryEntry } from '../core/history'
import { cropNameKey, goodKey, hasKey, onLangChange, qualityKey, seasonKey, t } from '../core/i18n'
import type { StringKey } from '../core/i18n'
import { registerCommand, registerGroupLabel, registerTarget } from '../core/palette-registry'
import type { Command, Target } from '../core/palette-registry'
import type { CatalogueEntry } from './catalogue'
import { applyPaletteFallbacks, docText, ensureDocStyles, motionAllowed, registerDocStrings } from './almanac'
import { fail, success } from './notify'
import { createPriceChart, groupDigits, SERIES_LIMIT } from './pricechart'
import type { ChartEventDatum, PriceChart, PriceSeriesDatum } from './pricechart'
import { createSearchField } from './searchfield'
import type { SearchField } from './searchfield'

/* ------------------------------------------------------------------- ids */

/** The tab id and the palette group. Section targets are `ledger.section.<id>`. */
export const LEDGER_ID = 'ledger'

/**
 * One search field per section, each with its own builder state and its own catalogue
 * row. No two of these ever share a builder.
 */
export const LEDGER_SEARCH_FIELD_IDS = {
  prices: 'ledger.prices',
  income: 'ledger.income',
  orders: 'ledger.orders',
  loans: 'ledger.loans',
  reputation: 'ledger.reputation',
} as const

export type LedgerSectionId = keyof typeof LEDGER_SEARCH_FIELD_IDS

const SECTION_ORDER: readonly LedgerSectionId[] = [
  'prices',
  'income',
  'orders',
  'loans',
  'reputation',
]

/**
 * The rows `src/shell/ui/catalogue.ts` must carry for this lane, in its own
 * `CatalogueEntry` shape, ready to spread into `CATALOGUE`. They live here rather than
 * there because this wave assigns `catalogue.ts` to nobody: the integrating lane spreads
 * `...LEDGER_CATALOGUE` into the array and `tests/search-catalogue.test.ts` goes green in
 * both directions.
 *
 * The label and placeholder keys are the generic ones the shared string catalogue really
 * carries today; the fields themselves show this file's own, more specific wording.
 */
export const LEDGER_CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  {
    id: LEDGER_SEARCH_FIELD_IDS.prices,
    where: 'src/shell/ui/ledger.ts',
    constant: 'LEDGER_SEARCH_FIELD_IDS.prices',
    labelKey: 'common.search' as StringKey,
    placeholderKey: 'search.crops.placeholder' as StringKey,
  },
  {
    id: LEDGER_SEARCH_FIELD_IDS.income,
    where: 'src/shell/ui/ledger.ts',
    constant: 'LEDGER_SEARCH_FIELD_IDS.income',
    labelKey: 'common.search' as StringKey,
    placeholderKey: 'search.history.placeholder' as StringKey,
  },
  {
    id: LEDGER_SEARCH_FIELD_IDS.orders,
    where: 'src/shell/ui/ledger.ts',
    constant: 'LEDGER_SEARCH_FIELD_IDS.orders',
    labelKey: 'common.search' as StringKey,
    placeholderKey: 'search.history.placeholder' as StringKey,
  },
  {
    id: LEDGER_SEARCH_FIELD_IDS.loans,
    where: 'src/shell/ui/ledger.ts',
    constant: 'LEDGER_SEARCH_FIELD_IDS.loans',
    labelKey: 'common.search' as StringKey,
    placeholderKey: 'search.history.placeholder' as StringKey,
  },
  {
    id: LEDGER_SEARCH_FIELD_IDS.reputation,
    where: 'src/shell/ui/ledger.ts',
    constant: 'LEDGER_SEARCH_FIELD_IDS.reputation',
    labelKey: 'common.search' as StringKey,
    placeholderKey: 'search.history.placeholder' as StringKey,
  },
])

/* --------------------------------------------------------------- strings */

/**
 * Plain, factual level-1 English for everything the shared catalogue does not carry yet.
 * Facts stay `{placeholders}` exactly as they do in `strings.ts`.
 */
export const LEDGER_STRINGS: Readonly<Record<string, string>> = {
  'ledger.title': 'Ledger',
  'ledger.tab': 'Ledger',
  'ledger.lede':
    'What the market has been doing, what the farm has earned and spent, what the town has asked for, what the bank is owed, and what the valley thinks of you.',
  'ledger.contents': 'Ledger contents',
  'ledger.jump': 'Jump to {section}',
  'ledger.empty': 'There is no farm loaded, so the ledger has nothing to show yet.',
  'ledger.asOf': 'As of {date}, {time}.',
  'ledger.command.open': 'Open the Ledger',
  'ledger.command.search': 'Search the Ledger',
  'ledger.search.count': 'Showing {shown} of {total}.',
  'ledger.search.none': 'Nothing in this table matches {query}.',
  'ledger.search.invalid': 'That query will not compile: {error}',
  'ledger.date.short': '{season} {day} · Y{year}',
  'ledger.date.long': '{season} {day}, year {year}',
  'ledger.season.name': '{season}, year {year}',
  'ledger.none': '—',
  'ledger.yes': 'Yes',
  'ledger.no': 'No',

  // -- export
  'ledger.export.title': 'Export the ledger',
  'ledger.export.format': 'Format',
  'ledger.export.download': 'Download',
  'ledger.export.copy': 'Copy to the clipboard',
  'ledger.export.copied': 'The ledger is on the clipboard.',
  'ledger.export.copyManual':
    'The clipboard is unavailable, so the export is selected in the box below: copy it from there.',
  'ledger.export.note': 'Every table on this page, whatever the search fields are filtering.',

  // -- prices
  'ledger.section.prices': 'Price history',
  'ledger.prices.lede':
    'Every good this farm has traded keeps its own market. Selling floods it and pushes the price down; the index heals a little every day.',
  'ledger.prices.search.label': 'Search the goods this farm trades',
  'ledger.prices.search.placeholder': 'A good, a category or a price',
  'ledger.prices.plotNote':
    'Tick up to {limit} goods to plot. With nothing ticked, the first {limit} rows below are drawn.',
  'ledger.prices.plotFull': 'The plot holds {limit} goods. Untick one to add another.',
  'ledger.prices.caption':
    'Every good traded, with today’s price, its supply index and the market behaviour behind it',
  'ledger.prices.column.plot': 'Plot',
  'ledger.prices.column.good': 'Good',
  'ledger.prices.column.category': 'Category',
  'ledger.prices.column.price': 'Today',
  'ledger.prices.column.base': 'Base',
  'ledger.prices.column.supply': 'Supply',
  'ledger.prices.column.elasticity': 'Swing',
  'ledger.prices.column.recovery': 'Heals',
  'ledger.prices.column.depth': 'Depth',
  'ledger.prices.column.season': 'This season',
  'ledger.prices.plotOne': 'Plot {good}',
  'ledger.prices.recoveryValue': '{percent}% a day',
  'ledger.prices.depthValue': '{units} units',
  'ledger.prices.empty': 'Nothing has been sold yet, so no market has an opinion about this farm.',
  'ledger.prices.window': 'The chart keeps the last {days} days.',
  'ledger.category.produce': 'Produce',
  'ledger.category.artisan': 'Artisan',
  'ledger.category.animal': 'Animal',
  'ledger.category.material': 'Material',
  'ledger.category.supply': 'Supplies',
  'ledger.event.bumper': 'Bumper harvest',
  'ledger.event.shortage': 'Shortage',
  'ledger.event.festival': 'Festival',
  'ledger.event.caravan': 'Trade caravan',
  'ledger.event.quiet': 'Quiet week',
  'ledger.event.caravan.detail': 'Every price up a tenth, and a rare seed in the shop',
  'ledger.event.today': 'Running today: {event} — {detail}, until {until}.',
  'ledger.event.none': 'No market event is running today.',

  // -- income and expenses
  'ledger.section.income': 'Income and expenses',
  'ledger.income.lede':
    'The purse, what the season has taken in and paid out, and what the assessor will want at the end of it.',
  'ledger.income.search.label': 'Search income and expenses',
  'ledger.income.search.placeholder': 'A source, a season or an amount',
  'ledger.income.tile.gold': 'In the purse',
  'ledger.income.tile.earned': 'Earned all told',
  'ledger.income.tile.spent': 'Spent all told',
  'ledger.income.tile.net': 'This season’s net',
  'ledger.income.tile.tax': 'Levy if the season ended now',
  'ledger.income.bySource': 'By source',
  'ledger.income.bySource.caption': 'What the application has recorded happening, gathered by source',
  'ledger.income.bySource.note':
    'Read from this application’s own history log, which holds the last few hundred events. It is a record of what you did here, not a second set of books kept by the farm.',
  'ledger.income.bySeason': 'By season',
  'ledger.income.bySeason.caption':
    'Every season farmed so far, with the flat {rate}% levy on what was left after expenses',
  'ledger.income.bySeason.note':
    'The assessor opens books at the start of a season, so the season with open books is exact. Every other row is the published even share of lifetime trade across the seasons farmed — the same rule the game itself uses when it has no opening figure, and it is stated here rather than hidden.',
  'ledger.income.column.source': 'Source',
  'ledger.income.column.income': 'Income',
  'ledger.income.column.expenses': 'Expenses',
  'ledger.income.column.net': 'Net',
  'ledger.income.column.entries': 'Entries',
  'ledger.income.column.season': 'Season',
  'ledger.income.column.gross': 'Gross',
  'ledger.income.column.taxable': 'Taxable',
  'ledger.income.column.rate': 'Rate',
  'ledger.income.column.due': 'Levy',
  'ledger.income.column.basis': 'Basis',
  'ledger.income.basis.exact': 'Exact',
  'ledger.income.basis.estimated': 'Even-share estimate',
  'ledger.income.lifetime': 'Everything, all told',
  'ledger.income.source.shop': 'The shop',
  'ledger.income.source.shipping': 'The shipping bin',
  'ledger.income.source.market': 'The town market',
  'ledger.income.source.stall': 'The roadside stall',
  'ledger.income.source.orders': 'Orders and crates',
  'ledger.income.source.credit': 'Credit',
  'ledger.income.source.tax': 'The levy',
  'ledger.income.source.investment': 'Buildings and machines',
  'ledger.income.source.other': 'Everything else',
  'ledger.income.empty': 'Nothing with a price on it has been recorded here yet.',

  // -- orders
  'ledger.section.orders': 'Orders',
  'ledger.orders.lede':
    'Accepting is a promise. An order you fill pays a premium the market cannot take away; one you miss costs standing.',
  'ledger.orders.search.label': 'Search orders',
  'ledger.orders.search.placeholder': 'A good, a status or a reward',
  'ledger.orders.caption': 'Every order offered, accepted, filled or missed',
  'ledger.orders.column.status': 'Status',
  'ledger.orders.column.kind': 'Kind',
  'ledger.orders.column.wants': 'Wants',
  'ledger.orders.column.reward': 'Pays',
  'ledger.orders.column.standing': 'Standing',
  'ledger.orders.column.issued': 'Issued',
  'ledger.orders.column.due': 'Due',
  'ledger.orders.column.ready': 'In the bag now',
  'ledger.orders.status.available': 'Available',
  'ledger.orders.status.accepted': 'Accepted',
  'ledger.orders.status.overdue': 'Overdue',
  'ledger.orders.status.completed': 'Completed',
  'ledger.orders.status.failed': 'Failed',
  'ledger.orders.kind.delivery': 'Delivery',
  'ledger.orders.kind.crate': 'Boat crate',
  'ledger.orders.line': '{count} × {good} ({quality} or better)',
  'ledger.orders.reward': '{gold}g, {xp} xp',
  'ledger.orders.rewardMaterials': '{gold}g, {xp} xp, {materials}',
  'ledger.orders.standing': '+{reward} / −{penalty}',
  'ledger.orders.due': '{date} ({days} days)',
  'ledger.orders.dueToday': '{date} (today)',
  'ledger.orders.overdue': '{date} (overdue)',
  'ledger.orders.slots': '{open} of {cap} accepted.',
  'ledger.orders.crateLocked':
    'Boat crates need {reputation} standing and level {level}. You have {haveReputation} and level {haveLevel}.',
  'ledger.orders.empty': 'The board is empty and nothing has been filled or missed yet.',
  'ledger.orders.watchNote':
    'Filled and missed orders are watched for by this page and kept in the application’s history, because the save does not keep an order once it leaves the board.',

  // -- loans
  'ledger.section.loans': 'Loans',
  'ledger.loans.lede':
    'Interest is added at the end of each season. Nothing is repossessed and nothing ends the game — the debt simply follows you, and it gets dearer.',
  'ledger.loans.search.label': 'Search loans',
  'ledger.loans.search.placeholder': 'A loan, a rate or an amount',
  'ledger.loans.caption': 'Every loan outstanding, with what the next accrual will add',
  'ledger.loans.tile.debt': 'Owed in total',
  'ledger.loans.tile.limit': 'The bank’s limit',
  'ledger.loans.tile.available': 'Left to draw on',
  'ledger.loans.tile.rate': 'Today’s rate',
  'ledger.loans.column.loan': 'Loan',
  'ledger.loans.column.principal': 'Borrowed',
  'ledger.loans.column.outstanding': 'Outstanding',
  'ledger.loans.column.rate': 'Rate a season',
  'ledger.loans.column.taken': 'Taken',
  'ledger.loans.column.due': 'Clear by',
  'ledger.loans.column.accrual': 'Next accrual',
  'ledger.loans.column.expected': 'Schedule expects',
  'ledger.loans.column.missed': 'Missed',
  'ledger.loans.column.repay': 'Repay',
  'ledger.loans.repayLabel': 'Gold to repay against {loan}',
  'ledger.loans.repay': 'Repay',
  'ledger.loans.repayAll': 'Repay in full',
  'ledger.loans.repaid': 'Paid {amount}g against {loan}. {left}g still owing.',
  'ledger.loans.cleared': 'Paid {amount}g and cleared {loan}.',
  'ledger.loans.refused': 'That repayment was refused: {reason}',
  'ledger.loans.readOnly':
    'This ledger is showing a farm it cannot write to, so the repay control is unavailable.',
  'ledger.loans.behind': 'Behind schedule by {gold}g.',
  'ledger.loans.onTrack': 'On schedule.',
  'ledger.loans.empty': 'Nothing is owed. The bank has never heard of you and that is a fine place to be.',
  'ledger.loans.taxArrears': 'Unpaid levy, carried at the kindest rate there is',

  // -- reputation
  'ledger.section.reputation': 'Reputation',
  'ledger.reputation.lede':
    'Nought to a thousand, starting at two hundred and fifty. It gates the lucrative work, sets what the bank charges, and puts a few per cent either way on every sale.',
  'ledger.reputation.search.label': 'Search what moved your standing',
  'ledger.reputation.search.placeholder': 'A cause, a day or an amount',
  'ledger.reputation.value': '{value} of {max}',
  'ledger.reputation.rank': 'Rank: {rank}',
  'ledger.reputation.meter': 'Standing {value} out of {max}, ranked {rank}',
  'ledger.reputation.tile.bonus': 'On every sale',
  'ledger.reputation.tile.tier': 'Order tier',
  'ledger.reputation.tile.slots': 'Orders you may hold',
  'ledger.reputation.tile.rank': 'Rank',
  'ledger.reputation.caption': 'Every movement in your standing this page has seen',
  'ledger.reputation.column.when': 'When',
  'ledger.reputation.column.change': 'Change',
  'ledger.reputation.column.cause': 'Cause',
  'ledger.reputation.column.total': 'Standing after',
  'ledger.reputation.cause.order': 'Filled {order}',
  'ledger.reputation.cause.failed': 'Missed {order}',
  'ledger.reputation.cause.trade': 'Steady trade',
  'ledger.reputation.cause.loan': 'A loan cleared, or a payment missed',
  'ledger.reputation.cause.other': 'Something the ledger could not name',
  'ledger.reputation.empty':
    'Nothing has moved your standing while this page has been watching. It starts watching the first time the Ledger is opened.',
  'ledger.reputation.watchNote':
    'Movements are noticed by comparing your standing against the last time this page looked, and are kept in the application’s history.',

  // -- the log keys, which are also the history keys this page writes
  'ledger.log.order.completed': 'Filled {kind} {order} for {gold}g, {standing} standing',
  'ledger.log.order.failed': 'Missed {kind} {order}, {standing} standing',
  'ledger.log.reputation': 'Standing moved {delta} to {total}: {cause}',
}

registerDocStrings(LEDGER_STRINGS)

/** A catalogue key when there is one, and the rendered words when there is not. */
function resolved(key: string, params?: Record<string, string | number>): string {
  return hasKey(key) ? key : docText(key, params)
}

/* ---------------------------------------------------------------- helpers */

const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length
const DAYS_PER_WEEK = 7
const REPUTATION_MAX = 1000

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (parent !== undefined) parent.appendChild(node)
  return node
}

function gold(value: number): string {
  return t('label.gold', { gold: groupDigits(value) })
}

function percent(value: number, digits = 0): string {
  const scaled = value * 100
  return digits === 0 ? `${Math.round(scaled)}%` : `${(Math.round(scaled * 10) / 10).toFixed(1)}%`
}

function oneDecimal(value: number): string {
  return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '0.0'
}

/** The calendar position of an absolute day. Day 0 is the first morning of the run. */
export function calendarOf(day: number): { year: number; season: Season; day: number } {
  const whole = Math.max(0, Math.floor(day))
  const year = Math.floor(whole / DAYS_PER_YEAR) + 1
  const inYear = whole % DAYS_PER_YEAR
  const season = SEASONS[Math.floor(inYear / DAYS_PER_SEASON)]
  return { year, season, day: (inYear % DAYS_PER_SEASON) + 1 }
}

function shortDate(day: number): string {
  const at = calendarOf(day)
  return docText('ledger.date.short', {
    season: t(seasonKey(at.season)),
    day: at.day,
    year: at.year,
  })
}

function longDate(day: number): string {
  const at = calendarOf(day)
  return docText('ledger.date.long', {
    season: t(seasonKey(at.season)),
    day: at.day,
    year: at.year,
  })
}

function seasonText(abs: number): string {
  const index = ((abs % SEASONS.length) + SEASONS.length) % SEASONS.length
  return docText('ledger.season.name', {
    season: t(seasonKey(SEASONS[index])),
    year: Math.floor(abs / SEASONS.length) + 1,
  })
}

/** A state moved to another day, so a pure roll can be asked about a week gone by. */
function stateAtDay(state: GameState, day: number): GameState {
  const at = calendarOf(day)
  return { ...state, year: at.year, season: at.season, day: at.day }
}

/** The reader's name for one item. Falls back to the game's own catalogue name. */
export function itemLabel(item: ItemRef): string {
  switch (item.kind) {
    case 'seed': {
      const plant = cropById(item.cropId) ?? treeById(item.cropId)
      const name = hasKey(`crop.${item.cropId}`)
        ? t(cropNameKey(item.cropId))
        : (plant?.name ?? item.cropId)
      return t('item.seed', { crop: name })
    }
    case 'produce': {
      const plant = cropById(item.cropId) ?? treeById(item.cropId)
      const name = hasKey(`crop.${item.cropId}`)
        ? t(cropNameKey(item.cropId))
        : (plant?.name ?? item.cropId)
      return item.quality === 'normal'
        ? t('item.produce', { crop: name })
        : t('item.produce.quality', { quality: t(qualityKey(item.quality)), crop: name })
    }
    case 'good':
      return t(goodKey(item.goodId))
    case 'product': {
      const name = productById(item.productId)?.name ?? item.productId
      return item.quality === 'normal'
        ? name
        : t('item.produce.quality', { quality: t(qualityKey(item.quality)), crop: name })
    }
    case 'material':
      return materialName(item.materialId)
  }
}

const CATEGORY_KEY: Readonly<Record<string, string>> = {
  produce: 'ledger.category.produce',
  artisan: 'ledger.category.artisan',
  animal: 'ledger.category.animal',
  material: 'ledger.category.material',
  supply: 'ledger.category.supply',
}

const EVENT_KEY: Readonly<Record<MarketEvent['kind'], string>> = {
  bumper: 'ledger.event.bumper',
  shortage: 'ledger.event.shortage',
  festival: 'ledger.event.festival',
  caravan: 'ledger.event.caravan',
  quiet: 'ledger.event.quiet',
}

/** What an event is aimed at, in words: a good, a whole category, or the whole market. */
function eventDetail(event: MarketEvent): string {
  if (event.kind === 'caravan') return docText('ledger.event.caravan.detail')
  if (event.target === null) return docText('ledger.none')
  if (event.kind === 'festival') {
    const key = CATEGORY_KEY[event.target]
    return key === undefined ? event.target : docText(key)
  }
  const item = itemFromKey(event.target)
  return item === null ? event.target : itemLabel(item)
}

/* ------------------------------------------------------------ table plumbing */

interface Column {
  readonly key: string
  /** Right-aligned, tabular figures: a column of numbers that must line up. */
  readonly numeric?: boolean
}

interface Row {
  readonly cells: ReadonlyArray<string | HTMLElement>
  /** Everything a search on this table should see. */
  readonly search: string
}

interface TableHandle {
  readonly el: HTMLElement
  readonly table: HTMLTableElement
  /** Replaces the body. Returns the row elements, in order, for filtering. */
  render(columns: readonly Column[], rows: readonly Row[], caption: string): HTMLTableRowElement[]
}

function createTable(): TableHandle {
  const scroll = el('div', 'sh-doc__scroll shl__scroll')
  scroll.tabIndex = 0
  scroll.setAttribute('role', 'region')
  const table = document.createElement('table')
  const caption = document.createElement('caption')
  const head = document.createElement('thead')
  const body = document.createElement('tbody')
  table.append(caption, head, body)
  scroll.appendChild(table)

  return {
    el: scroll,
    table,
    render(columns, rows, captionText): HTMLTableRowElement[] {
      caption.textContent = captionText
      scroll.setAttribute('aria-label', captionText)
      while (head.firstChild !== null) head.removeChild(head.firstChild)
      while (body.firstChild !== null) body.removeChild(body.firstChild)

      const headRow = document.createElement('tr')
      for (const column of columns) {
        const th = document.createElement('th')
        th.scope = 'col'
        th.textContent = docText(column.key)
        if (column.numeric === true) th.className = 'shl__num'
        headRow.appendChild(th)
      }
      head.appendChild(headRow)

      const out: HTMLTableRowElement[] = []
      for (const row of rows) {
        const tr = document.createElement('tr')
        row.cells.forEach((cell, index) => {
          const column = columns[index]
          const isHeader = index === 0
          const node = document.createElement(isHeader ? 'th' : 'td')
          if (isHeader) (node as HTMLTableCellElement).scope = 'row'
          if (column?.numeric === true) node.className = 'shl__num'
          if (typeof cell === 'string') node.textContent = cell
          else node.appendChild(cell)
          tr.appendChild(node)
        })
        tr.setAttribute('data-search-text', row.search)
        body.appendChild(tr)
        out.push(tr)
      }
      return out
    },
  }
}

/** Applies one field's query to one set of rows and writes the count into `status`. */
function applyFilter(field: SearchField, rows: readonly HTMLElement[], status: HTMLElement): void {
  const error = field.error()
  if (error !== null) {
    for (const row of rows) row.hidden = false
    status.textContent = docText('ledger.search.invalid', { error })
    return
  }
  let shown = 0
  for (const row of rows) {
    const hit = field.test(row.getAttribute('data-search-text') ?? '')
    row.hidden = !hit
    if (hit) shown += 1
  }
  if (!field.active()) {
    status.textContent = docText('ledger.search.count', { shown: rows.length, total: rows.length })
  } else if (shown === 0) {
    status.textContent = docText('ledger.search.none', { query: field.query() })
  } else {
    status.textContent = docText('ledger.search.count', { shown, total: rows.length })
  }
}

/* -------------------------------------------------------- the watched logs */

interface OrderLogEntry {
  readonly id: string
  readonly orderId: string
  readonly kind: Order['kind']
  readonly outcome: 'completed' | 'failed'
  readonly day: number
  readonly gold: number
  readonly standing: number
  readonly wants: string
}

interface ReputationLogEntry {
  readonly id: string
  readonly day: number
  readonly delta: number
  readonly total: number
  readonly causeKey: string
  readonly causeParams: Record<string, string | number>
}

const ORDER_LOG_KEY_COMPLETED = 'ledger.log.order.completed'
const ORDER_LOG_KEY_FAILED = 'ledger.log.order.failed'
const REPUTATION_LOG_KEY = 'ledger.log.reputation'

/** Bounded so a long run cannot grow either table without limit. */
const LOG_LIMIT = 200

function numberParam(entry: HistoryEntry, name: string): number {
  const raw = entry.params?.[name]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function stringParam(entry: HistoryEntry, name: string): string {
  const raw = entry.params?.[name]
  return typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : ''
}

/* ----------------------------------------------------- income classification */

type Flow = 'income' | 'expense'

interface SourceRule {
  readonly test: RegExp
  readonly source: string
  readonly flow: Flow | 'either'
  readonly fields: readonly string[]
}

/**
 * How a recorded event is read as money. Written out rather than guessed at, and ordered:
 * the first rule whose pattern matches the entry's string key wins. An entry no rule
 * claims still counts if it carries a money fact, under "everything else", so nothing
 * with a price on it silently vanishes from the books.
 */
const SOURCE_RULES: readonly SourceRule[] = [
  { test: /^shop\.buy/, source: 'shop', flow: 'expense', fields: ['cost', 'total', 'gold'] },
  { test: /^shop\.sell/, source: 'shop', flow: 'income', fields: ['total', 'gold'] },
  { test: /^ledger\.log\.order/, source: 'orders', flow: 'income', fields: ['gold'] },
  { test: /order|crate|contract/i, source: 'orders', flow: 'income', fields: ['reward', 'gold', 'total'] },
  { test: /stall/i, source: 'stall', flow: 'income', fields: ['total', 'earned', 'gold'] },
  { test: /ship|bin/i, source: 'shipping', flow: 'income', fields: ['total', 'gold'] },
  { test: /market|town/i, source: 'market', flow: 'income', fields: ['total', 'gold'] },
  { test: /repay|instal/i, source: 'credit', flow: 'expense', fields: ['amount', 'gold', 'total'] },
  { test: /loan|borrow|credit/i, source: 'credit', flow: 'income', fields: ['amount', 'gold', 'total'] },
  { test: /tax|levy|assess/i, source: 'tax', flow: 'expense', fields: ['due', 'amount', 'gold'] },
  {
    test: /build|machine|animal|region|expand|deed|upgrade/i,
    source: 'investment',
    flow: 'expense',
    fields: ['cost', 'price', 'gold', 'total'],
  },
]

const INCOME_FIELDS: readonly string[] = ['total', 'earned', 'reward', 'gold']
const EXPENSE_FIELDS: readonly string[] = ['cost', 'spent', 'due', 'price', 'fee']

const SOURCE_KEY: Readonly<Record<string, string>> = {
  shop: 'ledger.income.source.shop',
  shipping: 'ledger.income.source.shipping',
  market: 'ledger.income.source.market',
  stall: 'ledger.income.source.stall',
  orders: 'ledger.income.source.orders',
  credit: 'ledger.income.source.credit',
  tax: 'ledger.income.source.tax',
  investment: 'ledger.income.source.investment',
  other: 'ledger.income.source.other',
}

const SOURCE_ORDER: readonly string[] = [
  'shop',
  'shipping',
  'market',
  'stall',
  'orders',
  'investment',
  'credit',
  'tax',
  'other',
]

interface SourceTotals {
  income: number
  expenses: number
  entries: number
}

function firstMoney(entry: HistoryEntry, fields: readonly string[]): number {
  for (const field of fields) {
    const value = numberParam(entry, field)
    if (value !== 0) return Math.abs(value)
  }
  return 0
}

/** The books, gathered from the application's own history. */
export function incomeBySource(entries: readonly HistoryEntry[]): Map<string, SourceTotals> {
  const out = new Map<string, SourceTotals>()
  const bump = (source: string, flow: Flow, amount: number): void => {
    if (amount <= 0) return
    const row = out.get(source) ?? { income: 0, expenses: 0, entries: 0 }
    if (flow === 'income') row.income += amount
    else row.expenses += amount
    row.entries += 1
    out.set(source, row)
  }

  for (const entry of entries) {
    const rule = SOURCE_RULES.find((candidate) => candidate.test.test(entry.summary))
    if (rule !== undefined && rule.flow !== 'either') {
      const amount = firstMoney(entry, rule.fields)
      if (amount > 0) {
        bump(rule.source, rule.flow, amount)
        continue
      }
    }
    const income = firstMoney(entry, INCOME_FIELDS)
    if (income > 0) {
      bump(rule?.source ?? 'other', 'income', income)
      continue
    }
    const expense = firstMoney(entry, EXPENSE_FIELDS)
    if (expense > 0) bump(rule?.source ?? 'other', 'expense', expense)
  }
  return out
}

/* --------------------------------------------------------------- the panel */

export interface LedgerHost {
  /** The live game state, or null when no farm is loaded. */
  state(): GameState | null
  /**
   * Applies a mutation the ledger performed — a repayment. Omit it and the repay control
   * is disabled with a visible reason rather than quietly doing nothing.
   */
  commit?(result: ActionResult): void
}

export interface LedgerPanel {
  readonly id: string
  readonly el: HTMLElement
  /** Re-reads the game state and repaints. Call it after every overnight pass. */
  refresh(): void
  /** Brings one section forward and puts focus on it. */
  reveal(section: LedgerSectionId): void
  focusSearch(section: LedgerSectionId): void
  /** The ledger as text, in one of the three formats. */
  exportAs(format: ExportFormat): string
  destroy(): void
}

interface Section {
  readonly id: LedgerSectionId
  readonly element: HTMLElement
  readonly heading: HTMLHeadingElement
  readonly lede: HTMLParagraphElement
  readonly body: HTMLElement
  readonly status: HTMLParagraphElement
  readonly field: SearchField
  readonly tocButton: HTMLButtonElement
  rows: HTMLElement[]
}

interface ExportTable {
  readonly id: string
  readonly title: string
  readonly columns: readonly string[]
  readonly rows: ReadonlyArray<readonly string[]>
}

/**
 * Builds the Ledger. The DOM is `panel.el` and is not attached to anything until the
 * caller attaches it.
 */
export function createLedgerPanel(host: LedgerHost): LedgerPanel {
  ensureDocStyles()
  ensureLedgerStyles()

  const root = el('div', 'sh-doc sh-doc--ledger shl')
  root.setAttribute('data-doc', LEDGER_ID)
  applyPaletteFallbacks(root)

  /* -- head ---------------------------------------------------------------- */

  const head = el('header', 'sh-doc__head', root)
  const title = el('h2', undefined, head)
  const lede = el('p', 'sh-doc__lede', head)
  const asOf = el('p', 'sh-doc__note', head)

  const exportRow = el('div', 'shl__export', head)
  const exportLabel = el('label', 'sh-small', exportRow)
  const formatSelect = el('select', undefined, exportRow)
  const formatId = uniqueId('shl-export-format')
  exportLabel.htmlFor = formatId
  formatSelect.id = formatId
  const optionJson = el('option', undefined, formatSelect)
  optionJson.value = 'json'
  const optionCsv = el('option', undefined, formatSelect)
  optionCsv.value = 'csv'
  const optionMarkdown = el('option', undefined, formatSelect)
  optionMarkdown.value = 'markdown'
  const downloadButton = el('button', undefined, exportRow)
  downloadButton.type = 'button'
  const copyButton = el('button', undefined, exportRow)
  copyButton.type = 'button'
  const exportNote = el('p', 'sh-doc__note', head)
  const exportBox = el('textarea', 'shl__exportBox', head)
  exportBox.readOnly = true
  exportBox.hidden = true
  exportBox.rows = 6

  const pageStatus = el('p', 'sh-doc__status', head)
  pageStatus.setAttribute('role', 'status')

  const toc = el('nav', 'sh-doc__toc', root)
  const tocList = el('ul', undefined, toc)
  const body = el('div', 'sh-doc__body', root)

  /* -- sections ------------------------------------------------------------ */

  const sections = new Map<LedgerSectionId, Section>()

  for (const id of SECTION_ORDER) {
    const element = el('section', 'sh-doc__section shl__section', body)
    element.id = `${LEDGER_ID}-${id}`
    element.tabIndex = -1
    const heading = el('h3', undefined, element)
    heading.id = `${element.id}-heading`
    element.setAttribute('aria-labelledby', heading.id)
    const sectionLede = el('p', undefined, element)

    const field = createSearchField({
      id: LEDGER_SEARCH_FIELD_IDS[id],
      labelKey: resolved(`ledger.${id}.search.label`),
      placeholderKey: resolved(`ledger.${id}.search.placeholder`),
      onChange: (changed) => {
        const section = sections.get(id)
        if (section === undefined) return
        applyFilter(changed, section.rows, section.status)
      },
    })
    element.appendChild(field.el)

    const status = el('p', 'sh-doc__status', element)
    status.setAttribute('role', 'status')
    const sectionBody = el('div', 'shl__body', element)

    const tocItem = el('li', undefined, tocList)
    const tocButton = el('button', undefined, tocItem)
    tocButton.type = 'button'
    tocButton.addEventListener('click', () => reveal(id))

    sections.set(id, {
      id,
      element,
      heading,
      lede: sectionLede,
      body: sectionBody,
      status,
      field,
      tocButton,
      rows: [],
    })
  }

  /* -- the chart ----------------------------------------------------------- */

  const chart: PriceChart = createPriceChart()
  const pricesSection = sections.get('prices')
  const chartHolder = el('div', 'shl__chart')
  chartHolder.appendChild(chart.el)
  const pricesTable = createTable()
  const pricesEventLine = el('p', 'sh-doc__note')
  const pricesPlotNote = el('p', 'sh-doc__note')
  if (pricesSection !== undefined) {
    pricesSection.body.append(chartHolder, pricesEventLine, pricesPlotNote, pricesTable.el)
  }

  /* -- the other tables ---------------------------------------------------- */

  const incomeTiles = el('ul', 'shl__tiles')
  const incomeSourceHead = el('h4')
  const incomeSourceTable = createTable()
  const incomeSourceNote = el('p', 'sh-doc__note')
  const incomeSeasonHead = el('h4')
  const incomeSeasonTable = createTable()
  const incomeSeasonNote = el('p', 'sh-doc__note')
  const incomeSection = sections.get('income')
  if (incomeSection !== undefined) {
    incomeSection.body.append(
      incomeTiles,
      incomeSourceHead,
      incomeSourceTable.el,
      incomeSourceNote,
      incomeSeasonHead,
      incomeSeasonTable.el,
      incomeSeasonNote,
    )
  }

  const ordersSummary = el('p', 'sh-doc__note')
  const ordersCrateNote = el('p', 'sh-doc__note')
  const ordersTable = createTable()
  const ordersWatchNote = el('p', 'sh-doc__note')
  const ordersSection = sections.get('orders')
  if (ordersSection !== undefined) {
    ordersSection.body.append(ordersSummary, ordersCrateNote, ordersTable.el, ordersWatchNote)
  }

  const loanTiles = el('ul', 'shl__tiles')
  const loansTable = createTable()
  const loansStatus = el('p', 'sh-doc__status')
  loansStatus.setAttribute('role', 'status')
  const loansSection = sections.get('loans')
  if (loansSection !== undefined) {
    loansSection.body.append(loanTiles, loansTable.el, loansStatus)
  }

  const reputationTiles = el('ul', 'shl__tiles')
  const reputationMeter = el('div', 'shl__meter')
  const reputationFill = el('i', undefined, reputationMeter)
  const reputationTable = createTable()
  const reputationNote = el('p', 'sh-doc__note')
  const reputationSection = sections.get('reputation')
  if (reputationSection !== undefined) {
    reputationSection.body.append(
      reputationTiles,
      reputationMeter,
      reputationTable.el,
      reputationNote,
    )
  }

  /* -- watched logs -------------------------------------------------------- */

  const orderLog: OrderLogEntry[] = []
  const reputationLog: ReputationLogEntry[] = []
  let watched: { orders: Map<string, Order>; reputation: number; missed: number; day: number } | null =
    null
  let logSeq = 0

  seedLogs()

  function seedLogs(): void {
    let entries: HistoryEntry[] = []
    try {
      entries = queryHistory({ kind: 'game' })
    } catch {
      // A history that will not answer costs the log, not the page.
      return
    }
    // `query` hands back newest first; the tables read oldest first.
    for (const entry of [...entries].reverse()) {
      if (entry.summary === ORDER_LOG_KEY_COMPLETED || entry.summary === ORDER_LOG_KEY_FAILED) {
        orderLog.push({
          id: `h${entry.id}`,
          orderId: stringParam(entry, 'order'),
          kind: stringParam(entry, 'kindId') === 'crate' ? 'crate' : 'delivery',
          outcome: entry.summary === ORDER_LOG_KEY_COMPLETED ? 'completed' : 'failed',
          day: numberParam(entry, 'day'),
          gold: numberParam(entry, 'gold'),
          standing: numberParam(entry, 'standing'),
          wants: stringParam(entry, 'wants'),
        })
      } else if (entry.summary === REPUTATION_LOG_KEY) {
        reputationLog.push({
          id: `h${entry.id}`,
          day: numberParam(entry, 'day'),
          delta: numberParam(entry, 'delta'),
          total: numberParam(entry, 'total'),
          causeKey: stringParam(entry, 'causeKey') || 'ledger.reputation.cause.other',
          causeParams: {},
        })
      }
    }
    trimLogs()
  }

  function trimLogs(): void {
    if (orderLog.length > LOG_LIMIT) orderLog.splice(0, orderLog.length - LOG_LIMIT)
    if (reputationLog.length > LOG_LIMIT) reputationLog.splice(0, reputationLog.length - LOG_LIMIT)
  }

  function nextLogId(): string {
    logSeq += 1
    return `l${logSeq}`
  }

  /**
   * Compares the board and the standing against the last time this page looked, and
   * writes down what changed. This is the only place the ledger learns anything the save
   * does not keep, and every conclusion it draws is written to the shell's history so it
   * survives a reload.
   */
  function watch(state: GameState): void {
    const today = absoluteDay(state)
    const board = new Map<string, Order>()
    for (const order of state.orders) board.set(order.id, order)
    const missed = state.loans.reduce((sum, loan) => sum + loan.missedPayments, 0)

    const previous = watched
    watched = { orders: board, reputation: state.market.reputation, missed, day: today }
    if (previous === null) return

    let attributed = 0
    const causes: Array<{ key: string; params: Record<string, string | number>; delta: number }> = []

    for (const [id, order] of previous.orders) {
      if (board.has(id)) continue
      if (!order.accepted) continue
      const failedIt = order.dueDay < today
      const wants = order.lines
        .map((line) => docText('ledger.orders.line', {
          count: line.count,
          good: itemLabel(line.item),
          quality: t(qualityKey(line.minQuality)),
        }))
        .join(', ')
      const standing = failedIt ? -order.reputationPenalty : order.reputationReward
      const entry: OrderLogEntry = {
        id: nextLogId(),
        orderId: id,
        kind: order.kind,
        outcome: failedIt ? 'failed' : 'completed',
        day: today,
        gold: failedIt ? 0 : order.reward,
        standing,
        wants,
      }
      orderLog.push(entry)
      attributed += standing
      causes.push({
        key: failedIt ? 'ledger.reputation.cause.failed' : 'ledger.reputation.cause.order',
        params: { order: wants },
        delta: standing,
      })
      try {
        record('game', failedIt ? ORDER_LOG_KEY_FAILED : ORDER_LOG_KEY_COMPLETED, undefined, {
          order: id,
          kindId: order.kind,
          kind: docText(`ledger.orders.kind.${order.kind}`),
          day: today,
          gold: entry.gold,
          standing,
          wants,
        })
      } catch {
        // A log line is never worth taking the page down for.
      }
    }

    const delta = state.market.reputation - previous.reputation
    const residual = delta - attributed
    if (residual !== 0) {
      const key =
        missed > previous.missed
          ? 'ledger.reputation.cause.loan'
          : residual > 0
            ? 'ledger.reputation.cause.trade'
            : 'ledger.reputation.cause.loan'
      causes.push({ key, params: {}, delta: residual })
    }

    let running = previous.reputation
    for (const cause of causes) {
      if (cause.delta === 0) continue
      running += cause.delta
      reputationLog.push({
        id: nextLogId(),
        day: today,
        delta: cause.delta,
        total: running,
        causeKey: cause.key,
        causeParams: cause.params,
      })
      try {
        record('game', REPUTATION_LOG_KEY, undefined, {
          day: today,
          delta: cause.delta,
          total: running,
          causeKey: cause.key,
          cause: docText(cause.key, cause.params),
        })
      } catch {
        // As above.
      }
    }
    trimLogs()
  }

  /* -- the plot selection -------------------------------------------------- */

  const plotSelection = new Set<string>()

  /**
   * Which colour slot each plotted good holds. A good keeps its slot for as long as it is
   * plotted, and only a good that leaves gives one up — so unticking one series never
   * repaints the ones still on the chart. A reader who learned that melons are the green
   * line should not have that quietly taken away from them.
   */
  const plotSlots = new Map<string, number>()

  function assignSlots(keys: readonly string[]): void {
    for (const key of [...plotSlots.keys()]) {
      if (!keys.includes(key)) plotSlots.delete(key)
    }
    const taken = new Set(plotSlots.values())
    for (const key of keys) {
      if (plotSlots.has(key)) continue
      let slot = 0
      while (taken.has(slot)) slot += 1
      plotSlots.set(key, slot)
      taken.add(slot)
    }
  }

  /* -- rendering ----------------------------------------------------------- */

  /**
   * Every table as flat text, which is exactly what the three export formats need.
   * Keyed by id and replaced rather than appended, so a section that repaints on its own
   * — the plot selection does — never doubles its rows in the export.
   */
  const exportTables = new Map<string, ExportTable>()

  function setExportTable(table: ExportTable): void {
    exportTables.set(table.id, table)
  }

  /** In the order the sections are read, which is the order they were first written. */
  function exportOrder(): ExportTable[] {
    return [...exportTables.values()]
  }

  function paint(): void {
    const state = host.state()
    title.textContent = docText('ledger.title')
    lede.textContent = docText('ledger.lede')
    toc.setAttribute('aria-label', docText('ledger.contents'))
    exportLabel.textContent = docText('ledger.export.format')
    optionJson.textContent = t('export.format.json')
    optionCsv.textContent = t('export.format.csv')
    optionMarkdown.textContent = t('export.format.markdown')
    downloadButton.textContent = docText('ledger.export.download')
    copyButton.textContent = docText('ledger.export.copy')
    exportNote.textContent = docText('ledger.export.note')

    for (const id of SECTION_ORDER) {
      const section = sections.get(id)
      if (section === undefined) continue
      const name = docText(`ledger.section.${id}`)
      section.heading.textContent = name
      section.lede.textContent = docText(`ledger.${id}.lede`)
      section.tocButton.textContent = name
      section.tocButton.setAttribute('aria-label', docText('ledger.jump', { section: name }))
      section.field.relabel()
    }

    // Every section registers its palette entries whether or not a farm is loaded: the
    // command palette should be able to take you to an empty Ledger just as readily.
    registerEntries()
    exportTables.clear()

    if (state === null) {
      asOf.textContent = docText('ledger.empty')
      for (const id of SECTION_ORDER) {
        const section = sections.get(id)
        if (section === undefined) continue
        section.rows = []
        section.status.textContent = docText('ledger.empty')
      }
      chart.update({ days: [], dayLabels: [], series: [], events: [] })
      const nothing = docText('ledger.empty')
      for (const handle of [
        pricesTable,
        incomeSourceTable,
        incomeSeasonTable,
        ordersTable,
        loansTable,
        reputationTable,
      ]) {
        handle.render([], [], nothing)
      }
      return
    }

    watch(state)
    const today = absoluteDay(state)
    asOf.textContent = docText('ledger.asOf', {
      date: longDate(today),
      time: `${Math.floor(state.minutes / 60)}:${String(state.minutes % 60).padStart(2, '0')}`,
    })

    paintPrices(state, today)
    paintIncome(state)
    paintOrders(state, today)
    paintLoans(state)
    paintReputation(state)

    for (const id of SECTION_ORDER) {
      const section = sections.get(id)
      if (section !== undefined) applyFilter(section.field, section.rows, section.status)
    }
  }

  /* -- section 1: prices --------------------------------------------------- */

  function paintPrices(state: GameState, today: number): void {
    const section = sections.get('prices')
    if (section === undefined) return

    const keys = tradedGoods(state)
    const points = state.market.history

    const columns: readonly Column[] = [
      { key: 'ledger.prices.column.good' },
      { key: 'ledger.prices.column.plot' },
      { key: 'ledger.prices.column.category' },
      { key: 'ledger.prices.column.price', numeric: true },
      { key: 'ledger.prices.column.base', numeric: true },
      { key: 'ledger.prices.column.supply', numeric: true },
      { key: 'ledger.prices.column.season', numeric: true },
      { key: 'ledger.prices.column.elasticity', numeric: true },
      { key: 'ledger.prices.column.recovery' },
      { key: 'ledger.prices.column.depth' },
    ]

    interface GoodRow {
      key: string
      item: ItemRef
      label: string
      category: string
      price: number
      base: number
      supply: number
      seasonal: number
      elasticity: number
      recovery: number
      depth: number
    }

    const goods: GoodRow[] = []
    for (const key of keys) {
      const item = itemFromKey(key)
      if (item === null) continue
      const econ = economicsFor(item)
      goods.push({
        key,
        item,
        label: itemLabel(item),
        category: docText(CATEGORY_KEY[goodCategory(item)] ?? 'ledger.category.produce'),
        price: sellPrice(state, item, 'normal'),
        base: econ.base,
        supply: supplyIndexOf(state, item),
        seasonal: econ.seasonal[state.season] ?? 1,
        elasticity: econ.elasticity,
        recovery: econ.recovery,
        depth: marketDepth(item),
      })
    }
    goods.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))

    // Colour follows the good, never the row number: a checkbox that removes a series
    // never repaints the survivors, because the plotted order is stable.
    for (const key of [...plotSelection]) {
      if (!goods.some((good) => good.key === key)) plotSelection.delete(key)
    }
    const explicit = plotSelection.size > 0
    const plotted = explicit
      ? goods.filter((good) => plotSelection.has(good.key))
      : goods.slice(0, SERIES_LIMIT)
    const full = plotSelection.size >= SERIES_LIMIT

    const rows: Row[] = goods.map((good) => {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = plotted.some((entry) => entry.key === good.key)
      box.disabled = full && !plotSelection.has(good.key)
      box.setAttribute('aria-label', docText('ledger.prices.plotOne', { good: good.label }))
      box.addEventListener('change', () => {
        // The first tick promotes the implicit "first six" into an explicit selection, so
        // ticking a seventh good never silently repaints the six already drawn.
        if (plotSelection.size === 0) {
          for (const entry of goods.slice(0, SERIES_LIMIT)) plotSelection.add(entry.key)
        }
        if (box.checked) {
          if (plotSelection.size < SERIES_LIMIT) plotSelection.add(good.key)
        } else {
          plotSelection.delete(good.key)
        }
        refresh()
      })
      return {
        cells: [
          good.label,
          box,
          good.category,
          gold(good.price),
          gold(good.base),
          oneDecimal(good.supply),
          `×${(Math.round(good.seasonal * 100) / 100).toFixed(2)}`,
          (Math.round(good.elasticity * 100) / 100).toFixed(2),
          docText('ledger.prices.recoveryValue', { percent: Math.round(good.recovery * 100) }),
          docText('ledger.prices.depthValue', { units: good.depth }),
        ],
        search: [
          good.label,
          good.category,
          good.key,
          String(good.price),
          String(good.base),
          oneDecimal(good.supply),
        ].join(' '),
      }
    })

    section.rows = pricesTable.render(columns, rows, docText('ledger.prices.caption'))

    setExportTable({
      id: 'prices',
      title: docText('ledger.section.prices'),
      columns: columns.map((column) => docText(column.key)),
      rows: goods.map((good) => [
        good.label,
        plotted.some((entry) => entry.key === good.key) ? docText('ledger.yes') : docText('ledger.no'),
        good.category,
        String(good.price),
        String(good.base),
        oneDecimal(good.supply),
        (Math.round(good.seasonal * 100) / 100).toFixed(2),
        (Math.round(good.elasticity * 100) / 100).toFixed(2),
        String(Math.round(good.recovery * 100)),
        String(good.depth),
      ]),
    })

    /* the chart's own data */

    const days = points.map((point) => point.day)
    const drawn = plotted.slice(0, SERIES_LIMIT)
    assignSlots(drawn.map((good) => good.key))
    const series: PriceSeriesDatum[] = drawn.map((good, index) => ({
      key: good.key,
      label: good.label,
      supplyIndex: good.supply,
      slot: plotSlots.get(good.key) ?? index,
      points: points.map((point) => ({
        day: point.day,
        price: typeof point.prices[good.key] === 'number' ? point.prices[good.key] : null,
      })),
    }))

    const eventRows = chartEvents(state, days)
    chart.update({ days, dayLabels: days.map(shortDate), series, events: eventRows })

    const running = state.market.event
    pricesEventLine.textContent =
      running !== null && eventIsActive(running, today)
        ? docText('ledger.event.today', {
            event: docText(EVENT_KEY[running.kind]),
            detail: eventDetail(running),
            until: shortDate(running.endDay),
          })
        : docText('ledger.event.none')

    pricesPlotNote.textContent =
      goods.length === 0
        ? docText('ledger.prices.empty')
        : `${docText(full ? 'ledger.prices.plotFull' : 'ledger.prices.plotNote', {
            limit: SERIES_LIMIT,
          })} ${docText('ledger.prices.window', { days: HISTORY_DAYS })}`

    if (eventRows.length > 0) {
      setExportTable({
        id: 'events',
        title: docText('chart.price.events.title'),
        columns: [
          docText('ledger.prices.column.category'),
          docText('ledger.orders.column.issued'),
          docText('ledger.orders.column.due'),
          docText('ledger.prices.column.price'),
        ],
        rows: eventRows.map((event) => [
          `${event.label} — ${event.detail}`,
          shortDate(event.startDay),
          shortDate(event.endDay),
          `×${event.multiplier}`,
        ]),
      })
    }
  }

  /**
   * Every market event that overlaps the charted window. The weekly roll is deterministic
   * from the seed and the week number alone, so a week that has already gone by can be
   * asked about again and will answer the same thing it answered at the time.
   */
  function chartEvents(state: GameState, days: readonly number[]): ChartEventDatum[] {
    if (days.length === 0) return []
    const first = days[0]
    const last = days[days.length - 1]
    const out: ChartEventDatum[] = []
    const firstWeek = Math.floor(first / DAYS_PER_WEEK)
    const lastWeek = Math.floor(last / DAYS_PER_WEEK)
    for (let week = firstWeek; week <= lastWeek; week++) {
      let event: MarketEvent
      try {
        event = rollWeeklyEvent(stateAtDay(state, week * DAYS_PER_WEEK))
      } catch {
        continue
      }
      if (event.kind === 'quiet') continue
      if (event.endDay < first || event.startDay > last) continue
      out.push({
        id: `w${week}`,
        label: docText(EVENT_KEY[event.kind]),
        detail: eventDetail(event),
        startDay: event.startDay,
        endDay: event.endDay,
        multiplier: event.multiplier,
      })
    }
    return out
  }

  /* -- section 2: income and expenses -------------------------------------- */

  function paintIncome(state: GameState): void {
    const section = sections.get('income')
    if (section === undefined) return

    const figures = seasonFigures(state)
    const net = figures.gross - figures.expenses
    const taxable = Math.max(0, net)

    while (incomeTiles.firstChild !== null) incomeTiles.removeChild(incomeTiles.firstChild)
    tile(incomeTiles, docText('ledger.income.tile.gold'), gold(state.gold))
    tile(incomeTiles, docText('ledger.income.tile.earned'), gold(state.stats.earned))
    tile(incomeTiles, docText('ledger.income.tile.spent'), gold(state.stats.spent))
    tile(incomeTiles, docText('ledger.income.tile.net'), gold(net))
    tile(incomeTiles, docText('ledger.income.tile.tax'), gold(Math.round(taxable * TAX_RATE)))

    incomeSourceHead.textContent = docText('ledger.income.bySource')
    incomeSeasonHead.textContent = docText('ledger.income.bySeason')
    incomeSourceNote.textContent = docText('ledger.income.bySource.note')
    incomeSeasonNote.textContent = docText('ledger.income.bySeason.note')

    let entries: HistoryEntry[] = []
    try {
      entries = queryHistory({})
    } catch {
      entries = []
    }
    const bySource = incomeBySource(entries)

    const sourceColumns: readonly Column[] = [
      { key: 'ledger.income.column.source' },
      { key: 'ledger.income.column.income', numeric: true },
      { key: 'ledger.income.column.expenses', numeric: true },
      { key: 'ledger.income.column.net', numeric: true },
      { key: 'ledger.income.column.entries', numeric: true },
    ]
    const sourceRows: Row[] = []
    const sourceExport: string[][] = []
    for (const source of SOURCE_ORDER) {
      const totals = bySource.get(source)
      if (totals === undefined) continue
      const label = docText(SOURCE_KEY[source] ?? 'ledger.income.source.other')
      sourceRows.push({
        cells: [
          label,
          gold(totals.income),
          gold(totals.expenses),
          gold(totals.income - totals.expenses),
          groupDigits(totals.entries),
        ],
        search: `${label} ${totals.income} ${totals.expenses} ${totals.entries}`,
      })
      sourceExport.push([
        label,
        String(Math.round(totals.income)),
        String(Math.round(totals.expenses)),
        String(Math.round(totals.income - totals.expenses)),
        String(totals.entries),
      ])
    }
    const sourceRowEls = incomeSourceTable.render(
      sourceColumns,
      sourceRows,
      docText('ledger.income.bySource.caption'),
    )
    incomeSourceTable.el.hidden = sourceRows.length === 0
    incomeSourceNote.textContent =
      sourceRows.length === 0
        ? `${docText('ledger.income.empty')} ${docText('ledger.income.bySource.note')}`
        : docText('ledger.income.bySource.note')

    const seasonColumns: readonly Column[] = [
      { key: 'ledger.income.column.season' },
      { key: 'ledger.income.column.gross', numeric: true },
      { key: 'ledger.income.column.expenses', numeric: true },
      { key: 'ledger.income.column.taxable', numeric: true },
      { key: 'ledger.income.column.rate', numeric: true },
      { key: 'ledger.income.column.due', numeric: true },
      { key: 'ledger.income.column.basis' },
    ]
    const current = absoluteSeason(state)
    const seasonsFarmed = Math.max(1, current + 1)
    const averageGross = Math.max(0, Math.round(state.stats.earned / seasonsFarmed))
    const averageSpent = Math.max(0, Math.round(state.stats.spent / seasonsFarmed))

    const seasonRows: Row[] = []
    const seasonExport: string[][] = []
    for (let abs = 0; abs <= current; abs++) {
      const isNow = abs === current
      const grossHere = isNow ? figures.gross : averageGross
      const spentHere = isNow ? figures.expenses : averageSpent
      const taxableHere = Math.max(0, grossHere - spentHere)
      const due = Math.round(taxableHere * TAX_RATE)
      const exact = isNow && figures.exact
      const basis = docText(exact ? 'ledger.income.basis.exact' : 'ledger.income.basis.estimated')
      const name = seasonText(abs)
      seasonRows.push({
        cells: [
          name,
          gold(grossHere),
          gold(spentHere),
          gold(taxableHere),
          percent(TAX_RATE),
          gold(due),
          basis,
        ],
        search: `${name} ${grossHere} ${spentHere} ${taxableHere} ${due} ${basis}`,
      })
      seasonExport.push([
        name,
        String(grossHere),
        String(spentHere),
        String(taxableHere),
        percent(TAX_RATE),
        String(due),
        basis,
      ])
    }
    const lifetimeName = docText('ledger.income.lifetime')
    const lifetimeTaxable = Math.max(0, state.stats.earned - state.stats.spent)
    seasonRows.push({
      cells: [
        lifetimeName,
        gold(state.stats.earned),
        gold(state.stats.spent),
        gold(lifetimeTaxable),
        percent(TAX_RATE),
        docText('ledger.none'),
        docText('ledger.income.basis.exact'),
      ],
      search: `${lifetimeName} ${state.stats.earned} ${state.stats.spent}`,
    })
    seasonExport.push([
      lifetimeName,
      String(Math.round(state.stats.earned)),
      String(Math.round(state.stats.spent)),
      String(Math.round(lifetimeTaxable)),
      percent(TAX_RATE),
      '',
      docText('ledger.income.basis.exact'),
    ])

    const seasonRowEls = incomeSeasonTable.render(
      seasonColumns,
      seasonRows,
      docText('ledger.income.bySeason.caption', { rate: Math.round(TAX_RATE * 100) }),
    )

    section.rows = [...sourceRowEls, ...seasonRowEls]

    setExportTable({
      id: 'income-by-source',
      title: `${docText('ledger.section.income')} — ${docText('ledger.income.bySource')}`,
      columns: sourceColumns.map((column) => docText(column.key)),
      rows: sourceExport,
    })
    setExportTable({
      id: 'income-by-season',
      title: `${docText('ledger.section.income')} — ${docText('ledger.income.bySeason')}`,
      columns: seasonColumns.map((column) => docText(column.key)),
      rows: seasonExport,
    })
  }

  /* -- section 3: orders --------------------------------------------------- */

  function paintOrders(state: GameState, today: number): void {
    const section = sections.get('orders')
    if (section === undefined) return

    const columns: readonly Column[] = [
      { key: 'ledger.orders.column.status' },
      { key: 'ledger.orders.column.kind' },
      { key: 'ledger.orders.column.wants' },
      { key: 'ledger.orders.column.reward', numeric: true },
      { key: 'ledger.orders.column.standing' },
      { key: 'ledger.orders.column.issued' },
      { key: 'ledger.orders.column.due' },
      { key: 'ledger.orders.column.ready' },
    ]

    const rows: Row[] = []
    const exportRows: string[][] = []

    const describe = (order: Order): string =>
      order.lines
        .map((line) =>
          docText('ledger.orders.line', {
            count: line.count,
            good: itemLabel(line.item),
            quality: t(qualityKey(line.minQuality)),
          }),
        )
        .join(', ')

    const dueText = (order: Order): string => {
      const left = order.dueDay - today
      const date = shortDate(order.dueDay)
      if (left < 0) return docText('ledger.orders.overdue', { date })
      if (left === 0) return docText('ledger.orders.dueToday', { date })
      return docText('ledger.orders.due', { date, days: left })
    }

    const rewardText = (order: Order): string => {
      const materials = Object.entries(order.materialReward)
        .filter(([, count]) => typeof count === 'number' && count > 0)
        .map(([id, count]) => `${count} × ${materialName(id as MaterialId)}`)
        .join(', ')
      return materials.length === 0
        ? docText('ledger.orders.reward', { gold: groupDigits(order.reward), xp: order.xpReward })
        : docText('ledger.orders.rewardMaterials', {
            gold: groupDigits(order.reward),
            xp: order.xpReward,
            materials,
          })
    }

    const board = [...state.orders].sort((a, b) => a.dueDay - b.dueDay)
    for (const order of board) {
      const overdue = order.dueDay < today
      const statusKey = !order.accepted
        ? 'ledger.orders.status.available'
        : overdue
          ? 'ledger.orders.status.overdue'
          : 'ledger.orders.status.accepted'
      const status = docText(statusKey)
      const kind = docText(`ledger.orders.kind.${order.kind}`)
      const wants = describe(order)
      const reward = rewardText(order)
      const standing = docText('ledger.orders.standing', {
        reward: order.reputationReward,
        penalty: order.reputationPenalty,
      })
      const ready = docText(canFulfil(state, order) ? 'ledger.yes' : 'ledger.no')
      const cells = [
        status,
        kind,
        wants,
        reward,
        standing,
        shortDate(order.issuedDay),
        dueText(order),
        ready,
      ]
      rows.push({ cells, search: cells.join(' ') })
      exportRows.push(cells.map((cell) => cell))
    }

    for (const entry of [...orderLog].reverse()) {
      const status = docText(
        entry.outcome === 'completed'
          ? 'ledger.orders.status.completed'
          : 'ledger.orders.status.failed',
      )
      const cells = [
        status,
        docText(`ledger.orders.kind.${entry.kind}`),
        entry.wants,
        entry.gold > 0 ? gold(entry.gold) : docText('ledger.none'),
        entry.standing > 0 ? `+${entry.standing}` : String(entry.standing),
        docText('ledger.none'),
        shortDate(entry.day),
        docText('ledger.none'),
      ]
      rows.push({ cells, search: cells.join(' ') })
      exportRows.push(cells.map((cell) => cell))
    }

    section.rows = ordersTable.render(columns, rows, docText('ledger.orders.caption'))

    const open = state.orders.filter((order) => order.accepted).length
    ordersSummary.textContent =
      rows.length === 0
        ? docText('ledger.orders.empty')
        : docText('ledger.orders.slots', { open, cap: maxAcceptedOrders(state) })
    ordersWatchNote.textContent = docText('ledger.orders.watchNote')

    const crateReady =
      state.market.reputation >= CRATE_REPUTATION && state.progression.level >= CRATE_LEVEL
    ordersCrateNote.hidden = crateReady
    ordersCrateNote.textContent = docText('ledger.orders.crateLocked', {
      reputation: CRATE_REPUTATION,
      level: CRATE_LEVEL,
      haveReputation: state.market.reputation,
      haveLevel: state.progression.level,
    })

    setExportTable({
      id: 'orders',
      title: docText('ledger.section.orders'),
      columns: columns.map((column) => docText(column.key)),
      rows: exportRows,
    })
  }

  /* -- section 4: loans ---------------------------------------------------- */

  function paintLoans(state: GameState): void {
    const section = sections.get('loans')
    if (section === undefined) return

    while (loanTiles.firstChild !== null) loanTiles.removeChild(loanTiles.firstChild)
    tile(loanTiles, docText('ledger.loans.tile.debt'), gold(totalDebt(state)))
    tile(loanTiles, docText('ledger.loans.tile.limit'), gold(creditLimit(state)))
    tile(loanTiles, docText('ledger.loans.tile.available'), gold(creditAvailable(state)))
    tile(loanTiles, docText('ledger.loans.tile.rate'), percent(loanRate(state), 1))

    const columns: readonly Column[] = [
      { key: 'ledger.loans.column.loan' },
      { key: 'ledger.loans.column.principal', numeric: true },
      { key: 'ledger.loans.column.outstanding', numeric: true },
      { key: 'ledger.loans.column.rate', numeric: true },
      { key: 'ledger.loans.column.accrual', numeric: true },
      { key: 'ledger.loans.column.taken' },
      { key: 'ledger.loans.column.due' },
      { key: 'ledger.loans.column.expected' },
      { key: 'ledger.loans.column.missed', numeric: true },
      { key: 'ledger.loans.column.repay' },
    ]

    const abs = absoluteSeason(state)
    const rows: Row[] = []
    const exportRows: string[][] = []

    for (const loan of state.loans) {
      const accrual = Math.max(0, Math.round(loan.outstanding * loan.ratePerSeason))
      const expected = expectedOutstanding(loan, abs)
      const behind = loan.outstanding - expected
      const scheduleText =
        behind > 0 ? docText('ledger.loans.behind', { gold: groupDigits(behind) }) : docText('ledger.loans.onTrack')
      const name = loanName(loan)

      const cells: Array<string | HTMLElement> = [
        name,
        gold(loan.principal),
        gold(loan.outstanding),
        percent(loan.ratePerSeason, 1),
        gold(accrual),
        seasonText(loan.takenSeason),
        seasonText(loan.dueSeason),
        `${gold(expected)} · ${scheduleText}`,
        groupDigits(loan.missedPayments),
        repayControl(state, loan, name),
      ]
      rows.push({
        cells,
        search: [
          name,
          loan.id,
          String(loan.principal),
          String(loan.outstanding),
          percent(loan.ratePerSeason, 1),
          seasonText(loan.takenSeason),
          seasonText(loan.dueSeason),
          scheduleText,
        ].join(' '),
      })
      exportRows.push([
        name,
        String(loan.principal),
        String(loan.outstanding),
        percent(loan.ratePerSeason, 1),
        String(accrual),
        seasonText(loan.takenSeason),
        seasonText(loan.dueSeason),
        `${expected} — ${scheduleText}`,
        String(loan.missedPayments),
        '',
      ])
    }

    section.rows = loansTable.render(columns, rows, docText('ledger.loans.caption'))
    if (rows.length === 0) loansStatus.textContent = docText('ledger.loans.empty')

    setExportTable({
      id: 'loans',
      title: docText('ledger.section.loans'),
      columns: columns.map((column) => docText(column.key)),
      rows: exportRows,
    })
  }

  /** A loan the levy created says so; everything else is named by its own id. */
  function loanName(loan: Loan): string {
    return loan.id.startsWith('tax-') ? `${loan.id} — ${docText('ledger.loans.taxArrears')}` : loan.id
  }

  function repayControl(state: GameState, loan: Loan, name: string): HTMLElement {
    const wrap = el('div', 'shl__repay')
    const canWrite = typeof host.commit === 'function'

    const input = el('input', undefined, wrap)
    input.type = 'number'
    input.min = '1'
    input.step = '1'
    input.max = String(Math.max(1, Math.min(loan.outstanding, Math.max(0, state.gold))))
    input.value = String(Math.max(1, Math.min(loan.outstanding, Math.max(0, state.gold))))
    input.setAttribute('aria-label', docText('ledger.loans.repayLabel', { loan: name }))
    input.disabled = !canWrite || state.gold <= 0

    const pay = el('button', undefined, wrap)
    pay.type = 'button'
    pay.textContent = docText('ledger.loans.repay')
    pay.disabled = input.disabled

    const payAll = el('button', undefined, wrap)
    payAll.type = 'button'
    payAll.textContent = docText('ledger.loans.repayAll')
    payAll.disabled = input.disabled

    const settle = (amount: number): void => {
      const commit = host.commit
      if (typeof commit !== 'function') {
        loansStatus.textContent = docText('ledger.loans.readOnly')
        return
      }
      const before = state.loans.find((entry) => entry.id === loan.id)?.outstanding ?? 0
      const result = repayLoan(state, loan.id, amount)
      if (!result.ok) {
        loansStatus.textContent = docText('ledger.loans.refused', { reason: result.message })
        return
      }
      const after = result.state.loans.find((entry) => entry.id === loan.id)
      const paid = after === undefined ? before : before - after.outstanding
      loansStatus.textContent =
        after === undefined
          ? docText('ledger.loans.cleared', { amount: groupDigits(paid), loan: name })
          : docText('ledger.loans.repaid', {
              amount: groupDigits(paid),
              loan: name,
              left: groupDigits(after.outstanding),
            })
      try {
        record('game', 'ledger.loans.repaid', undefined, {
          amount: Math.round(paid),
          loan: loan.id,
          left: after === undefined ? 0 : Math.round(after.outstanding),
        })
      } catch {
        // As elsewhere: a log line is not worth an exception.
      }
      commit(result)
      refresh()
    }

    pay.addEventListener('click', () => {
      const amount = Number.parseInt(input.value, 10)
      settle(Number.isFinite(amount) ? amount : 0)
    })
    payAll.addEventListener('click', () => settle(loan.outstanding))

    if (!canWrite) wrap.title = docText('ledger.loans.readOnly')
    return wrap
  }

  /* -- section 5: reputation ----------------------------------------------- */

  function paintReputation(state: GameState): void {
    const section = sections.get('reputation')
    if (section === undefined) return

    const value = state.market.reputation
    const rank = reputationRank(value)

    while (reputationTiles.firstChild !== null) {
      reputationTiles.removeChild(reputationTiles.firstChild)
    }
    tile(
      reputationTiles,
      docText('ledger.reputation.tile.rank'),
      docText('ledger.reputation.value', { value: groupDigits(value), max: REPUTATION_MAX }),
      docText('ledger.reputation.rank', { rank }),
    )
    tile(
      reputationTiles,
      docText('ledger.reputation.tile.bonus'),
      `×${(Math.round(reputationBonus(value) * 1000) / 1000).toFixed(3)}`,
    )
    tile(reputationTiles, docText('ledger.reputation.tile.tier'), String(orderTier(value)))
    tile(
      reputationTiles,
      docText('ledger.reputation.tile.slots'),
      String(maxAcceptedOrders(state)),
    )

    const share = Math.max(0, Math.min(1, value / REPUTATION_MAX))
    reputationFill.style.width = `${Math.round(share * 100)}%`
    reputationMeter.setAttribute('role', 'img')
    reputationMeter.setAttribute(
      'aria-label',
      docText('ledger.reputation.meter', { value, max: REPUTATION_MAX, rank }),
    )

    const columns: readonly Column[] = [
      { key: 'ledger.reputation.column.when' },
      { key: 'ledger.reputation.column.change', numeric: true },
      { key: 'ledger.reputation.column.cause' },
      { key: 'ledger.reputation.column.total', numeric: true },
    ]
    const rows: Row[] = []
    const exportRows: string[][] = []
    for (const entry of [...reputationLog].reverse()) {
      const cause = docText(entry.causeKey, entry.causeParams)
      const cells = [
        shortDate(entry.day),
        entry.delta > 0 ? `+${entry.delta}` : String(entry.delta),
        cause,
        groupDigits(entry.total),
      ]
      rows.push({ cells, search: cells.join(' ') })
      exportRows.push(cells)
    }

    section.rows = reputationTable.render(columns, rows, docText('ledger.reputation.caption'))
    reputationNote.textContent =
      rows.length === 0
        ? `${docText('ledger.reputation.empty')} ${docText('ledger.reputation.watchNote')}`
        : docText('ledger.reputation.watchNote')

    setExportTable({
      id: 'reputation',
      title: docText('ledger.section.reputation'),
      columns: columns.map((column) => docText(column.key)),
      rows: exportRows,
    })
  }

  function tile(list: HTMLElement, label: string, value: string, note?: string): void {
    const item = el('li', 'shl__tile', list)
    const name = el('span', 'shl__tile-label', item)
    name.textContent = label
    const figure = el('strong', 'shl__tile-value', item)
    figure.textContent = value
    if (note !== undefined) {
      const extra = el('span', 'shl__tile-note', item)
      extra.textContent = note
    }
  }

  /* -- export -------------------------------------------------------------- */

  function buildExport(format: ExportFormat): string {
    const at = new Date()
    const stamp = safeIso(at)
    if (format === 'csv') {
      const lines: string[] = []
      for (const table of exportOrder()) {
        if (lines.length > 0) lines.push('')
        lines.push([csvField('table'), ...table.columns.map(csvField)].join(','))
        for (const row of table.rows) {
          lines.push([csvField(table.id), ...row.map(csvField)].join(','))
        }
      }
      return lines.length === 0 ? '' : `${lines.join('\r\n')}\r\n`
    }
    if (format === 'markdown') {
      const lines: string[] = [`# ${docText('ledger.title')}`, '', stamp, '']
      for (const table of exportOrder()) {
        lines.push(`## ${table.title}`, '')
        lines.push(`| ${table.columns.map(mdCell).join(' | ')} |`)
        lines.push(`|${table.columns.map(() => ' --- ').join('|')}|`)
        for (const row of table.rows) lines.push(`| ${row.map(mdCell).join(' | ')} |`)
        lines.push('')
      }
      return `${lines.join('\n').trimEnd()}\n`
    }
    const state = host.state()
    const bundle = {
      app: 'sprout-hollow',
      kind: 'ledger-export',
      version: 1,
      exportedAt: stamp,
      summary:
        state === null
          ? null
          : {
              day: absoluteDay(state),
              season: state.season,
              year: state.year,
              gold: state.gold,
              earned: state.stats.earned,
              spent: state.stats.spent,
              reputation: state.market.reputation,
              rank: reputationRank(state.market.reputation),
              debt: totalDebt(state),
              creditLimit: creditLimit(state),
              level: state.progression.level,
              taxRate: TAX_RATE,
            },
      tables: exportOrder().map((table) => ({
        id: table.id,
        title: table.title,
        columns: [...table.columns],
        rows: table.rows.map((row) => [...row]),
      })),
    }
    try {
      return `${JSON.stringify(bundle, null, 2)}\n`
    } catch {
      return '{}\n'
    }
  }

  function safeIso(at: Date): string {
    try {
      return at.toISOString()
    } catch {
      return new Date(0).toISOString()
    }
  }

  function currentFormat(): ExportFormat {
    const value = formatSelect.value
    return value === 'csv' || value === 'markdown' ? value : 'json'
  }

  downloadButton.addEventListener('click', () => {
    const format = currentFormat()
    const text = buildExport(format)
    const stamp = safeIso(new Date()).replace(/[:T]/g, '-').slice(0, 16)
    const filename = `sprout-hollow-ledger-${stamp}.${extensionFor(format)}`
    try {
      download(filename, text, mimeFor(format))
      pageStatus.textContent = t('export.done', { filename })
      success('export.done', { filename })
      record('data', 'export.done', undefined, { filename })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pageStatus.textContent = t('export.failed', { error: message })
      fail('export.failed', { error: message })
    }
  })

  copyButton.addEventListener('click', () => {
    const text = buildExport(currentFormat())
    void copyText(text)
  })

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      pageStatus.textContent = docText('ledger.export.copied')
      exportBox.hidden = true
    } catch {
      // A refused clipboard still leaves a keyboard route: the text is put where it can
      // be selected and copied by hand, and the reader is told which happened.
      exportBox.hidden = false
      exportBox.value = text
      exportBox.focus()
      exportBox.select()
      pageStatus.textContent = docText('ledger.export.copyManual')
    }
  }

  /* -- palette ------------------------------------------------------------- */

  let unregister: Array<() => void> = []

  try {
    registerGroupLabel(LEDGER_ID, resolved('ledger.title') as StringKey, 45)
  } catch {
    // A registry that will not take a label still groups the entries correctly.
  }

  function registerEntries(): void {
    for (const off of unregister) off()
    unregister = []
    for (const id of SECTION_ORDER) {
      const target: Target = {
        id: `${LEDGER_ID}.section.${id}`,
        titleKey: resolved(`ledger.section.${id}`) as StringKey,
        group: LEDGER_ID,
        teleport: () => reveal(id),
      }
      try {
        unregister.push(registerTarget(target))
      } catch {
        // A palette that is not up yet must not stop the page rendering.
      }
      const command: Command = {
        id: `${LEDGER_ID}.search.${id}`,
        titleKey: resolved('ledger.command.search') as StringKey,
        group: LEDGER_ID,
        keywords: ['ledger', 'search', id],
        run: () => focusSearch(id),
      }
      try {
        unregister.push(registerCommand(command))
      } catch {
        // As above.
      }
    }
  }

  /* -- navigation ---------------------------------------------------------- */

  function reveal(id: LedgerSectionId): void {
    const section = sections.get(id)
    if (section === undefined) return
    root.dispatchEvent(
      new CustomEvent('shell:reveal', {
        bubbles: true,
        detail: { panel: LEDGER_ID, section: section.element.id },
      }),
    )
    try {
      section.element.scrollIntoView({
        block: 'start',
        behavior: motionAllowed() ? 'smooth' : 'auto',
      })
    } catch {
      section.element.scrollIntoView()
    }
    section.element.focus()
  }

  function focusSearch(id: LedgerSectionId): void {
    const section = sections.get(id)
    if (section === undefined) return
    root.dispatchEvent(
      new CustomEvent('shell:reveal', { bubbles: true, detail: { panel: LEDGER_ID } }),
    )
    section.field.focus()
  }

  function refresh(): void {
    paint()
  }

  const stopLang = onLangChange(() => {
    chart.relabel()
    paint()
  })

  paint()

  return {
    id: LEDGER_ID,
    el: root,
    refresh,
    reveal,
    focusSearch,
    exportAs: buildExport,
    destroy(): void {
      for (const off of unregister) off()
      unregister = []
      stopLang()
      for (const section of sections.values()) section.field.destroy()
      chart.destroy()
      root.remove()
    },
  }
}

let uid = 0
function uniqueId(prefix: string): string {
  uid += 1
  return `${prefix}-${uid}`
}

/** A pipe inside a cell would end the cell, and a newline would end the row. */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/* -------------------------------------------------------------------- styles */

const STYLE_ID = 'sprout-ledger-styles'

const LEDGER_CSS = `
.shl__export { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.shl__exportBox { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.shl__section { gap: 10px; }
.shl__body { display: flex; flex-direction: column; gap: 10px; }
.shl__chart { min-width: 0; }
.shl__tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.shl__tile {
  display: flex; flex-direction: column; gap: 2px; flex: 1 1 9rem; min-width: 8rem; padding: 6px 8px;
  background: var(--dc-cream); border: 1px solid var(--dc-bark);
}
.shl__tile-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.85; }
.shl__tile-value { font-size: 1.25rem; font-weight: 700; line-height: 1.15; }
.shl__tile-note { font-size: 0.85rem; opacity: 0.9; }
.shl__meter { position: relative; height: 12px; background: var(--dc-parchment); border: 1px solid var(--dc-bark); }
.shl__meter i { position: absolute; inset-block: 0; left: 0; display: block; background: var(--dc-lantern); }
.shl__repay { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.shl__repay input { width: 7rem; min-height: 26px; }
.shl table td.shl__num, .shl table th.shl__num { text-align: right; font-variant-numeric: tabular-nums; }
.shl__scroll table { min-width: 34rem; }
@media (max-width: 40rem) {
  .shl__tile { flex: 1 1 100%; }
}
`

function ensureLedgerStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = LEDGER_CSS
  const head = document.head ?? document.documentElement
  head.appendChild(style)
}
