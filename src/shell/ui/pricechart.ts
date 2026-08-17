/**
 * The price-history chart — the Ledger's picture of what the market has been doing.
 *
 * ## How this was built
 *
 * The `dataviz` skill was read before a line of chart code was written, and its method
 * was followed in order: pick the form, assign colour by the job it does, **run** the
 * palette validator rather than eyeball it, apply the mark specs, ship the hover layer,
 * then the accessibility pass. Where that guidance and `docs/GRAPHICS.md` disagree on
 * colour, the game palette wins, because a chart that does not look like the rest of
 * Sprout Hollow is a worse chart here.
 *
 * **Form.** Prices over time for several goods that the reader must tell apart: a
 * multi-series line chart, capped at `SERIES_LIMIT` and never cycling a hue. The supply
 * index is *not* a second y-axis — a dual-axis plot invents a correlation that is not in
 * the data — it is a row of stat tiles with a diverging meter, one per plotted good.
 * Goods whose prices live on wildly different scales are reconciled the sanctioned way,
 * by indexing every series to 100 at the first charted day, on one axis.
 *
 * **Colour.** Six slots, in a fixed order, every one of them
 * `shade(PAL.x, k)` — the only way `src/engine/palette.ts` permits a new tone. The order
 * was chosen by search rather than by taste: candidate shades of each hue family were
 * enumerated and scored with the skill's own validator. What it reports for the six, on
 * the parchment/cream surface this panel uses:
 *
 * | Check | Result |
 * |---|---|
 * | Lightness band (light mode) | PASS — all six inside OKLCH L 0.43–0.77 |
 * | CVD separation, adjacent | PASS — worst pair ΔE 18.2 (protan), well over the 8 target |
 * | Normal-vision floor | PASS — worst pair ΔE 18.6 |
 * | Chroma floor | **FAIL** — dusk, soil and sky sit at C 0.04–0.05 |
 * | Contrast vs surface | WARN — the light green reads 2.23:1 |
 *
 * The chroma failure is not fixable and is not a mistake: Sprout Hollow's blue, brown
 * and purple are deliberately desaturated pixel-art tones, and the brief says the game
 * palette wins. A hue below the chroma floor stops doing identity work on its own, so
 * identity here is **never carried by colour alone**. Every series also gets its own
 * marker glyph (composite encoding), a legend entry that mirrors the mark, a direct end
 * label where one fits, and a real table of the underlying numbers that is always in the
 * document. Those are exactly the relief channels the WARN obliges, and they are shipped,
 * not promised.
 *
 * **Accessibility.** The `<svg>` is `aria-hidden`; it is decoration over data that is
 * carried in text. The plot is a focusable region driven entirely from the keyboard —
 * left/right walk the crosshair a day at a time, up/down change which series is
 * emphasised, Home/End jump to the ends — and every move writes the same readout a
 * pointer would see into a polite live region. The table below it holds every number the
 * chart draws. Nothing is reachable only by hovering.
 *
 * No canvas: `docs/SHELL-CONTRACT.md` reserves canvas for display type, and inline SVG is
 * real DOM, stays crisp at 100 through 200 per cent, and takes its colour from custom
 * properties like everything else in the shell.
 */

import { PAL, shade, withAlpha } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'
import { applyPaletteFallbacks, docText, ensureDocStyles, registerDocStrings } from './almanac'

/* ------------------------------------------------------------------ strings */

/**
 * Plain, factual English for the wordings the shared catalogue does not carry yet.
 * Facts stay `{placeholders}`, exactly as they do in `strings.ts`, so no funny level can
 * ever restate a price. `registerDocStrings` hands the set to whoever translates next.
 */
export const PRICE_CHART_STRINGS: Readonly<Record<string, string>> = {
  'chart.price.title': 'Price history',
  'chart.price.summary':
    'Line chart. {series} goods over {days} days, from {from} to {to}. Prices run {low} to {high} gold.',
  'chart.price.empty': 'Nothing has been traded yet, so there is no price history to draw.',
  'chart.price.hint':
    'Left and right walk the cursor a day at a time, up and down change which good is emphasised, Home and End jump to the ends.',
  'chart.price.plotLabel': 'Price history plot, {series} goods',
  'chart.price.axis.gold': 'Gold',
  'chart.price.axis.indexed': 'Indexed, 100 = {day}',
  'chart.price.axis.day': 'Day',
  'chart.price.scale.label': 'Scale',
  'chart.price.scale.gold': 'Gold',
  'chart.price.scale.indexed': 'Indexed to 100',
  'chart.price.scale.goldHint': 'Every price in gold, on one axis.',
  'chart.price.scale.indexedHint':
    'Every good starts at 100 on the first charted day, so a cheap good and a dear one can be compared on one axis.',
  'chart.price.legend': 'Goods plotted',
  'chart.price.legend.entry': '{good}, {mark}',
  'chart.price.focus': 'Emphasise {good}',
  'chart.price.focus.none': 'Emphasise nothing',
  'chart.price.readout': '{date}: {values}',
  'chart.price.readout.value': '{good} {price}g',
  'chart.price.readout.indexed': '{good} {price}',
  'chart.price.readout.missing': '{good} not traded',
  'chart.price.readout.event': 'Event: {event}',
  'chart.price.readout.idle': 'Cursor on {date}.',
  'chart.price.table.caption':
    'Every price the chart draws, in gold, one row per day. This table is the chart.',
  'chart.price.table.day': 'Day',
  'chart.price.table.event': 'Market event',
  'chart.price.table.none': '—',
  'chart.price.table.show': 'Show the numbers as a table',
  'chart.price.table.hide': 'Hide the table of numbers',
  'chart.price.supply.title': 'Supply index today',
  'chart.price.supply.note':
    'One is a market in balance. Above one the market is flooded and the price is held down; below one it is short and the price is lifted.',
  'chart.price.supply.value': '{index}',
  'chart.price.supply.flooded': 'Flooded',
  'chart.price.supply.balanced': 'Balanced',
  'chart.price.supply.short': 'Short',
  'chart.price.supply.meter': '{good}: supply index {index}, {state}',
  'chart.price.latest': 'Latest {price}g',
  'chart.price.change.up': 'Up {change}% over the charted days',
  'chart.price.change.down': 'Down {change}% over the charted days',
  'chart.price.change.flat': 'Unchanged over the charted days',
  'chart.price.events.title': 'Market events on these days',
  'chart.price.events.none': 'No market event fell inside the charted days.',
  'chart.price.event.span': '{event}, {from} to {to}',
  'chart.price.event.lifts': 'lifts prices',
  'chart.price.event.cuts': 'cuts prices',
  'chart.price.mark.circle': 'circle',
  'chart.price.mark.square': 'square',
  'chart.price.mark.triangle': 'triangle',
  'chart.price.mark.diamond': 'diamond',
  'chart.price.mark.cross': 'cross',
  'chart.price.mark.wedge': 'wedge',
}

registerDocStrings(PRICE_CHART_STRINGS)

/* -------------------------------------------------------------------- data */

/** One day of one good's price. `price` is null on a day the market did not record it. */
export interface PricePointDatum {
  readonly day: number
  readonly price: number | null
}

/** One plotted good. Already capped and ordered by the caller. */
export interface PriceSeriesDatum {
  /** The market key, e.g. `produce:melon`. Colour follows this, never the row number. */
  readonly key: string
  /** The good's name, in the reader's language where the catalogue has it. */
  readonly label: string
  readonly points: readonly PricePointDatum[]
  /** Today's supply index. 1.0 is a market in balance. */
  readonly supplyIndex: number
  /**
   * Which colour slot this good holds, 0..`SERIES_LIMIT`-1. **Supply it and keep it
   * stable per good**: a filter that removes one series must not repaint the survivors,
   * because a reader who learned that melons are green is misled the moment green means
   * something else. Omitted, the slot falls back to the position in the array, which is
   * only safe when the array itself never reorders.
   */
  readonly slot?: number
}

/** A market event overlapping the charted window. */
export interface ChartEventDatum {
  readonly id: string
  /** The event's name, translated. */
  readonly label: string
  /** What it does, translated — the target good or category. */
  readonly detail: string
  readonly startDay: number
  readonly endDay: number
  /** Above 1 the event lifts prices, below 1 it cuts them. */
  readonly multiplier: number
}

export interface PriceChartData {
  /** Ascending absolute days, one entry per recorded point. */
  readonly days: readonly number[]
  /** `SPR 4 Y1` for each entry of `days`, same length. */
  readonly dayLabels: readonly string[]
  readonly series: readonly PriceSeriesDatum[]
  readonly events: readonly ChartEventDatum[]
}

export interface PriceChartOptions {
  /** Notified when the reader emphasises a different good, so a host can follow along. */
  onFocusSeries?(key: string | null): void
}

export interface PriceChart {
  readonly el: HTMLElement
  update(data: PriceChartData): void
  focusedSeries(): string | null
  setFocusedSeries(key: string | null): void
  /** The numbers as a real table. It is inside `el`; this is for a caller that exports. */
  tableElement(): HTMLTableElement
  /** Re-reads every label after a language change. */
  relabel(): void
  focus(): void
  destroy(): void
}

/* ------------------------------------------------------------------ palette */

/**
 * The six categorical slots, in the fixed order the validator chose. Assigned in
 * sequence and **never cycled**: a seventh good is not given a seventh hue, it is left
 * out of the plot and kept in the table.
 */
const SERIES_RECIPE: ReadonlyArray<{ readonly base: PaletteName; readonly amount: number }> = [
  { base: 'lantern', amount: -0.35 },
  { base: 'dusk', amount: -0.15 },
  { base: 'berry', amount: 0.2 },
  { base: 'soil', amount: -0.05 },
  { base: 'grassLit', amount: 0.2 },
  { base: 'sky', amount: -0.4 },
]

/** How many goods the plot will draw at once. The rest stay in the table. */
export const SERIES_LIMIT = SERIES_RECIPE.length

/** Marker glyphs, one per slot. The second identity channel, since three of the six
 * hues sit below the chroma floor and cannot carry identity on their own. */
export type SeriesMark = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'wedge'

const SERIES_MARKS: readonly SeriesMark[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
  'wedge',
]

const MARK_KEY: Readonly<Record<SeriesMark, string>> = {
  circle: 'chart.price.mark.circle',
  square: 'chart.price.mark.square',
  triangle: 'chart.price.mark.triangle',
  diamond: 'chart.price.mark.diamond',
  cross: 'chart.price.mark.cross',
  wedge: 'chart.price.mark.wedge',
}

/** The colour for a slot. Derived from `PAL`, so no colour is invented here. */
export function seriesColour(slot: number): string {
  const recipe = SERIES_RECIPE[((slot % SERIES_LIMIT) + SERIES_LIMIT) % SERIES_LIMIT]
  return shade(PAL[recipe.base], recipe.amount)
}

/** The marker glyph for a slot. */
export function seriesMark(slot: number): SeriesMark {
  return SERIES_MARKS[((slot % SERIES_LIMIT) + SERIES_LIMIT) % SERIES_LIMIT]
}

/* ------------------------------------------------------------------- styles */

const STYLE_ID = 'sprout-pricechart-styles'

/**
 * Colour is read from the shell's tokens first and falls back to the `--dcf-*` values
 * `applyPaletteFallbacks` writes on the root from `src/engine/palette.ts`. No literal
 * colour is written in this stylesheet.
 */
function token(name: PaletteName): string {
  const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  return `var(--sh-color-${kebab}, var(--dcf-${kebab}))`
}

const CHART_CSS = `
.shp {
  --shp-ink: ${token('ink')};
  --shp-bark: ${token('bark')};
  --shp-shadow: ${token('shadow')};
  --shp-parchment: ${token('parchment')};
  --shp-cream: ${token('cream')};
  --shp-lantern: ${token('lantern')};
  --shp-berry: ${token('berry')};
  --shp-leaf: ${token('leaf')};
  --shp-dusk: ${token('dusk')};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  color: var(--shp-ink);
}
.shp *, .shp *::before, .shp *::after { box-sizing: border-box; }
.shp [hidden] { display: none !important; }
.shp__vh {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
/* The chart is normally mounted inside the Ledger's .sh-doc panel and inherits its
   controls; these rules only make it correct when it is used on its own. */
.shp button {
  min-height: 26px; min-width: 26px; padding: 2px 10px; font: inherit; cursor: pointer;
  color: var(--shp-ink); background: var(--shp-cream);
  border: 1px solid var(--shp-ink); border-radius: 0;
}
.shp button:hover { background: var(--shp-lantern); }
.shp button[aria-pressed='true'] { background: var(--shp-lantern); font-weight: 700; }
.shp :focus-visible { outline: 2px solid var(--shp-lantern); outline-offset: 2px; }
.shp__bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.shp__group { display: flex; flex-direction: column; gap: 3px; }
.shp__group > span { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.shp__choices { display: flex; gap: 0; }
.shp__choices button { border-right-width: 0; }
.shp__choices button:last-child { border-right-width: 1px; }
.shp__note { margin: 0; font-size: 0.85rem; opacity: 0.85; max-width: 68ch; }
.shp__legend { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.shp__legend li { display: block; }
.shp__legend button {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; min-height: 26px; font: inherit; text-align: left; cursor: pointer;
  color: var(--shp-ink); background: var(--shp-cream);
  border: 1px solid var(--shp-bark); border-radius: 0;
}
.shp__legend button[aria-pressed='true'] { background: var(--shp-lantern); font-weight: 700; }
.shp__legend svg { display: block; flex: 0 0 auto; }
.shp__plot {
  position: relative; min-width: 0; padding: 2px;
  background: var(--shp-cream); border: 1px solid var(--shp-bark);
}
.shp__plot:focus-visible { outline: 2px solid var(--shp-lantern); outline-offset: 2px; }
.shp__plot svg { display: block; width: 100%; height: auto; }
.shp__tip {
  position: absolute; z-index: 5; max-width: 18rem; padding: 4px 8px;
  font-size: 0.85rem; line-height: 1.35; pointer-events: none;
  color: var(--shp-ink); background: var(--shp-parchment);
  border: 1px solid var(--shp-ink); box-shadow: 2px 2px 0 0 var(--shp-shadow);
}
.shp__tip[hidden] { display: none; }
.shp__tip-date { display: block; font-size: 0.8rem; opacity: 0.85; }
.shp__tip-row { display: flex; gap: 6px; align-items: baseline; }
.shp__tip-key { flex: 0 0 auto; width: 18px; height: 2px; align-self: center; }
.shp__tip-value { font-weight: 700; font-variant-numeric: tabular-nums; }
.shp__tip-name { opacity: 0.85; }
.shp__readout { margin: 0; min-height: 1.4em; font-size: 0.85rem; }
.shp__tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.shp__tile {
  display: flex; flex-direction: column; gap: 3px; flex: 1 1 9rem; min-width: 8rem; padding: 6px 8px;
  background: var(--shp-cream); border: 1px solid var(--shp-bark);
}
.shp__tile-name { display: flex; gap: 6px; align-items: center; font-size: 0.85rem; }
.shp__tile-value { font-size: 1.25rem; font-weight: 700; line-height: 1.1; }
.shp__tile-delta { font-size: 0.8rem; opacity: 0.9; }
.shp__meter { position: relative; height: 8px; background: var(--shp-parchment); border: 1px solid var(--shp-bark); }
.shp__meter i { position: absolute; top: 0; bottom: 0; display: block; }
.shp__meter u {
  position: absolute; top: -2px; bottom: -2px; left: 50%; width: 1px;
  background: var(--shp-bark); text-decoration: none;
}
.shp__events { margin: 0; padding: 0 0 0 1.1em; font-size: 0.85rem; display: flex; flex-direction: column; gap: 2px; }
.shp__scroll { overflow-x: auto; max-width: 100%; }
.shp__scroll:focus-visible { outline: 2px solid var(--shp-lantern); outline-offset: 2px; }
.shp table { border-collapse: collapse; width: 100%; min-width: 26rem; text-align: left; }
.shp caption { text-align: left; padding-block-end: 6px; font-size: 0.85rem; opacity: 0.85; }
.shp th, .shp td { border: 1px solid var(--shp-bark); padding: 3px 8px; white-space: nowrap; }
.shp thead th { background: var(--shp-parchment); }
.shp td.shp__num { text-align: right; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .shp, .shp * { transition: none !important; animation: none !important; }
}
`

function ensureChartStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CHART_CSS
  const head = document.head ?? document.documentElement
  head.appendChild(style)
}

/* -------------------------------------------------------------- small utils */

const SVG_NS = 'http://www.w3.org/2000/svg'

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

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  parent?: SVGElement,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  if (attrs !== undefined) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  }
  if (parent !== undefined) parent.appendChild(node)
  return node
}

/** `1284` becomes `1,284`. Written out so the reading never depends on a locale. */
export function groupDigits(value: number): string {
  const rounded = Math.round(value)
  const negative = rounded < 0
  const digits = String(Math.abs(rounded))
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return negative ? `-${out}` : out
}

/** One decimal place, without trailing noise. `1.0` reads as `1.0`, not `1`. */
function oneDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0.0'
  return (Math.round(value * 10) / 10).toFixed(1)
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo
  return value < lo ? lo : value > hi ? hi : value
}

/** A tick step a human would have chosen: 1, 2, 5 or 10 times a power of ten. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const scaled = rough / power
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * power
}

/** The SVG path for one marker glyph, centred on `(x, y)`. */
function markPath(mark: SeriesMark, x: number, y: number, r: number): string {
  switch (mark) {
    case 'square':
      return `M${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}z`
    case 'triangle':
      return `M${x} ${y - r * 1.15}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}z`
    case 'wedge':
      return `M${x} ${y + r * 1.15}L${x + r * 1.1} ${y - r * 0.8}L${x - r * 1.1} ${y - r * 0.8}z`
    case 'diamond':
      return `M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}z`
    case 'cross': {
      const t = r * 0.42
      return (
        `M${x - t} ${y - r}h${t * 2}v${r - t}h${r - t}v${t * 2}h${-(r - t)}v${r - t}` +
        `h${-t * 2}v${-(r - t)}h${-(r - t)}v${-t * 2}h${r - t}z`
      )
    }
    case 'circle':
    default:
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`
  }
}

/* ------------------------------------------------------------------- layout */

interface Geometry {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  fontSize: number
}

const EMPTY_DATA: PriceChartData = { days: [], dayLabels: [], series: [], events: [] }

type ScaleMode = 'gold' | 'indexed'

/* -------------------------------------------------------------------- chart */

/**
 * Builds one chart. The DOM is `chart.el` and is not attached to anything until the
 * caller attaches it. Every instance owns its own state; nothing is shared or persisted.
 */
export function createPriceChart(opts: PriceChartOptions = {}): PriceChart {
  ensureDocStyles()
  ensureChartStyles()

  const root = el('div', 'shp')
  applyPaletteFallbacks(root)

  let data: PriceChartData = EMPTY_DATA
  let scaleMode: ScaleMode = 'gold'
  let focusedKey: string | null = null
  /** Index into `data.days`, or -1 for "no cursor". */
  let cursor = -1
  let showTable = true

  /* -- controls ------------------------------------------------------------ */

  const bar = el('div', 'shp__bar', root)

  const scaleGroup = el('div', 'shp__group', bar)
  const scaleLabel = el('span', undefined, scaleGroup)
  const scaleChoices = el('div', 'shp__choices', scaleGroup)
  scaleChoices.setAttribute('role', 'group')
  const goldButton = el('button', 'sh-btn', scaleChoices)
  goldButton.type = 'button'
  const indexedButton = el('button', 'sh-btn', scaleChoices)
  indexedButton.type = 'button'

  const tableToggle = el('button', 'sh-btn', bar)
  tableToggle.type = 'button'
  tableToggle.setAttribute('aria-expanded', 'true')

  const scaleNote = el('p', 'shp__note', root)

  /* -- legend -------------------------------------------------------------- */

  const legendGroup = el('div', 'shp__group', root)
  const legendLabel = el('span', undefined, legendGroup)
  legendLabel.id = uniqueId('shp-legend')
  const legend = el('ul', 'shp__legend', legendGroup)
  legend.setAttribute('aria-labelledby', legendLabel.id)

  /* -- plot ---------------------------------------------------------------- */

  const plot = el('div', 'shp__plot', root)
  plot.tabIndex = 0
  plot.setAttribute('role', 'group')
  const surface = svgEl('svg')
  surface.setAttribute('aria-hidden', 'true')
  surface.setAttribute('focusable', 'false')
  plot.appendChild(surface)

  const tip = el('div', 'shp__tip', plot)
  tip.hidden = true

  const readout = el('p', 'shp__readout', root)
  readout.setAttribute('role', 'status')
  readout.id = uniqueId('shp-readout')
  const hint = el('p', 'shp__note', root)
  hint.id = uniqueId('shp-hint')
  plot.setAttribute('aria-describedby', `${readout.id} ${hint.id}`)

  /* -- supply tiles -------------------------------------------------------- */

  const supplyGroup = el('div', 'shp__group', root)
  const supplyLabel = el('span', undefined, supplyGroup)
  supplyLabel.id = uniqueId('shp-supply')
  const supplyNote = el('p', 'shp__note', supplyGroup)
  const tiles = el('ul', 'shp__tiles', supplyGroup)
  tiles.setAttribute('aria-labelledby', supplyLabel.id)

  /* -- events -------------------------------------------------------------- */

  const eventGroup = el('div', 'shp__group', root)
  const eventLabel = el('span', undefined, eventGroup)
  const eventList = el('ul', 'shp__events', eventGroup)
  const eventEmpty = el('p', 'shp__note', eventGroup)

  /* -- table --------------------------------------------------------------- */

  const tableScroll = el('div', 'shp__scroll', root)
  tableScroll.tabIndex = 0
  tableScroll.setAttribute('role', 'region')
  const table = document.createElement('table')
  const tableCaption = document.createElement('caption')
  const tableHead = document.createElement('thead')
  const tableBody = document.createElement('tbody')
  table.append(tableCaption, tableHead, tableBody)
  tableScroll.appendChild(table)

  /* -- behaviour ----------------------------------------------------------- */

  function plotted(): readonly PriceSeriesDatum[] {
    return data.series.slice(0, SERIES_LIMIT)
  }

  /**
   * The colour slot a series holds. The caller's own `slot` wins wherever it gives one,
   * so a good keeps its hue when its neighbours come and go; the array position is only
   * the fallback.
   */
  function slotFor(series: PriceSeriesDatum, index: number): number {
    const given = series.slot
    if (typeof given === 'number' && Number.isInteger(given) && given >= 0) return given
    return index
  }

  /** Where a series sits in the plotted array, or -1. Not its colour slot. */
  function rowOf(key: string): number {
    return plotted().findIndex((entry) => entry.key === key)
  }

  /** The value one series shows on one day, under the active scale. */
  function valueAt(series: PriceSeriesDatum, index: number): number | null {
    const point = series.points[index]
    if (point === undefined || point.price === null) return null
    if (scaleMode === 'gold') return point.price
    const base = firstPrice(series)
    if (base === null || base <= 0) return null
    return (point.price / base) * 100
  }

  function firstPrice(series: PriceSeriesDatum): number | null {
    for (const point of series.points) {
      if (point.price !== null && point.price > 0) return point.price
    }
    return null
  }

  function domain(): { lo: number; hi: number } {
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (const series of plotted()) {
      for (let i = 0; i < data.days.length; i++) {
        const value = valueAt(series, i)
        if (value === null) continue
        if (value < lo) lo = value
        if (value > hi) hi = value
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 }
    if (hi - lo < 1e-6) {
      // A dead-flat market still needs an axis with height to it.
      const pad = Math.max(1, Math.abs(hi) * 0.1)
      return { lo: Math.max(0, lo - pad), hi: hi + pad }
    }
    const pad = (hi - lo) * 0.08
    return { lo: Math.max(0, lo - pad), hi: hi + pad }
  }

  function geometry(): Geometry {
    const style = typeof window === 'undefined' ? null : window.getComputedStyle(root)
    const parsed = style === null ? 15 : Number.parseFloat(style.fontSize)
    const fontSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 15
    const measured = plot.clientWidth
    const width = Math.max(280, measured > 0 ? measured - 4 : 560)
    const plotHeight = clamp(Math.round(width * 0.42), 150, 340)
    const left = Math.round(fontSize * 3.4)
    const right = Math.round(fontSize * 0.8)
    const top = Math.round(fontSize * 0.8)
    // The axis band and the event strip are inside the box, so the card never grows a
    // nested scrollbar just to show its own tick labels.
    const bottom = Math.round(fontSize * 3.6)
    return { width, height: plotHeight + top + bottom, left, right, top, bottom, fontSize }
  }

  /** Renders the whole plot from scratch. Cheap enough at 56 days by six series. */
  function paint(): void {
    while (surface.firstChild !== null) surface.removeChild(surface.firstChild)

    const g = geometry()
    surface.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`)
    surface.setAttribute('width', String(g.width))
    surface.setAttribute('height', String(g.height))
    surface.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    const rows = plotted()
    if (data.days.length === 0 || rows.length === 0) return

    const innerW = g.width - g.left - g.right
    const innerH = g.height - g.top - g.bottom
    const { lo, hi } = domain()
    const span = hi - lo || 1
    const lastIndex = data.days.length - 1

    const xOf = (index: number): number =>
      g.left + (lastIndex === 0 ? innerW / 2 : (index / lastIndex) * innerW)
    const yOf = (value: number): number => g.top + innerH - ((value - lo) / span) * innerH

    /* -- event bands, behind everything ------------------------------------ */

    const bands = svgEl('g', surface)
    for (const event of data.events) {
      const from = indexOfDay(event.startDay, 'ceil')
      const to = indexOfDay(event.endDay, 'floor')
      if (from < 0 || to < 0 || to < from) continue
      const x0 = xOf(from)
      const x1 = xOf(to)
      const cuts = event.multiplier < 1
      const wash = withAlpha(cuts ? PAL.berry : PAL.leaf, 0.1)
      svgEl('rect', bands, {
        x: Math.min(x0, x1) - 1,
        y: g.top,
        width: Math.max(2, Math.abs(x1 - x0) + 2),
        height: innerH,
        fill: wash,
      })
      // A hairline on the time axis itself: the event's mark on the x axis.
      svgEl('rect', bands, {
        x: Math.min(x0, x1) - 1,
        y: g.top + innerH + 1,
        width: Math.max(2, Math.abs(x1 - x0) + 2),
        height: Math.max(3, Math.round(g.fontSize * 0.28)),
        fill: cuts ? PAL.berry : PAL.leaf,
      })
    }

    /* -- grid and axes ----------------------------------------------------- */

    const grid = svgEl('g', surface)
    const step = niceStep(span / 4)
    const firstTick = Math.ceil(lo / step) * step
    const tickFont = Math.max(9, Math.round(g.fontSize * 0.72))
    for (let value = firstTick; value <= hi + 1e-9; value += step) {
      const y = Math.round(yOf(value)) + 0.5
      svgEl('line', grid, {
        x1: g.left,
        y1: y,
        x2: g.left + innerW,
        y2: y,
        stroke: PAL.parchment,
        'stroke-width': 1,
      })
      const label = svgEl('text', grid, {
        x: g.left - 6,
        y: y + tickFont * 0.36,
        'text-anchor': 'end',
        'font-size': tickFont,
        fill: PAL.bark,
      })
      label.textContent = groupDigits(value)
    }

    // The two rules. Solid hairlines, one step off the surface, never dashed.
    svgEl('line', grid, {
      x1: g.left + 0.5,
      y1: g.top,
      x2: g.left + 0.5,
      y2: g.top + innerH,
      stroke: PAL.bark,
      'stroke-width': 1,
    })
    svgEl('line', grid, {
      x1: g.left,
      y1: g.top + innerH + 0.5,
      x2: g.left + innerW,
      y2: g.top + innerH + 0.5,
      stroke: PAL.bark,
      'stroke-width': 1,
    })

    const wanted = clamp(Math.floor(innerW / (tickFont * 5)), 2, 8)
    const every = Math.max(1, Math.ceil(data.days.length / wanted))
    for (let i = 0; i < data.days.length; i += every) {
      const text = svgEl('text', grid, {
        x: xOf(i),
        y: g.top + innerH + tickFont * 1.6,
        'text-anchor': i === 0 ? 'start' : 'middle',
        'font-size': tickFont,
        fill: PAL.bark,
      })
      text.textContent = data.dayLabels[i] ?? String(data.days[i])
    }

    /* -- the series -------------------------------------------------------- */

    const lines = svgEl('g', surface)
    const ends: Array<{ y: number; label: string; slot: number }> = []

    rows.forEach((series, index) => {
      const slot = slotFor(series, index)
      const colour = seriesColour(slot)
      const dim = focusedKey !== null && focusedKey !== series.key
      const stroke = dim ? withAlpha(PAL.dusk, 0.55) : colour
      const weight = focusedKey === series.key ? 3 : 2

      let path = ''
      let pen = false
      let lastX = 0
      let lastY = 0
      let lastLabelled = false
      for (let i = 0; i < data.days.length; i++) {
        const value = valueAt(series, i)
        if (value === null) {
          pen = false
          continue
        }
        const x = xOf(i)
        const y = yOf(value)
        path += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
        pen = true
        lastX = x
        lastY = y
        lastLabelled = true
      }
      if (path.length > 0) {
        svgEl('path', lines, {
          d: path,
          fill: 'none',
          stroke,
          'stroke-width': weight,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        })
      }

      if (!lastLabelled) return

      // The end marker: a 2px ring in the surface colour so it stays legible where two
      // series cross, then the glyph that carries this series' identity without colour.
      const r = Math.max(4, Math.round(g.fontSize * 0.3))
      svgEl('path', lines, {
        d: markPath(seriesMark(slot), lastX, lastY, r + 1.5),
        fill: PAL.cream,
      })
      svgEl('path', lines, {
        d: markPath(seriesMark(slot), lastX, lastY, r),
        fill: dim ? withAlpha(PAL.dusk, 0.65) : colour,
      })
      ends.push({ y: lastY, label: series.label, slot })
    })

    /* -- direct end labels, selectively ------------------------------------ */

    // Labels ride the marks to supplement the legend, never to replace it, and a label
    // that would collide with another is dropped rather than nudged off its own line.
    const labelFont = Math.max(9, Math.round(g.fontSize * 0.74))
    const wantLabels = rows.length <= 4 || focusedKey !== null
    if (wantLabels) {
      const placed: number[] = []
      const candidates = focusedKey === null ? ends : ends.filter((e) => rows[e.slot]?.key === focusedKey)
      for (const end of [...candidates].sort((a, b) => a.y - b.y)) {
        if (placed.some((y) => Math.abs(y - end.y) < labelFont * 1.25)) continue
        const width = end.label.length * labelFont * 0.58 + 8
        const fits = g.left + innerW - width > g.left + innerW * 0.45
        if (!fits) continue
        placed.push(end.y)
        const text = svgEl('text', lines, {
          x: g.left + innerW - 4,
          y: end.y - labelFont * 0.55,
          'text-anchor': 'end',
          'font-size': labelFont,
          // Text wears a text token, never the series colour: the glyph beside it
          // already carries the identity.
          fill: PAL.ink,
        })
        text.textContent = end.label
      }
    }

    /* -- crosshair --------------------------------------------------------- */

    if (cursor >= 0 && cursor < data.days.length) {
      const x = Math.round(xOf(cursor)) + 0.5
      svgEl('line', surface, {
        x1: x,
        y1: g.top,
        x2: x,
        y2: g.top + innerH,
        stroke: PAL.bark,
        'stroke-width': 1,
      })
      rows.forEach((series, index) => {
      const slot = slotFor(series, index)
        const value = valueAt(series, cursor)
        if (value === null) return
        const y = yOf(value)
        const r = Math.max(4, Math.round(g.fontSize * 0.26))
        svgEl('path', surface, { d: markPath(seriesMark(slot), x, y, r + 1.5), fill: PAL.cream })
        svgEl('path', surface, { d: markPath(seriesMark(slot), x, y, r), fill: seriesColour(slot) })
      })
    }
  }

  /** The nearest charted index for an absolute day. */
  function indexOfDay(day: number, mode: 'ceil' | 'floor'): number {
    if (data.days.length === 0) return -1
    if (mode === 'ceil') {
      for (let i = 0; i < data.days.length; i++) if (data.days[i] >= day) return i
      return -1
    }
    for (let i = data.days.length - 1; i >= 0; i--) if (data.days[i] <= day) return i
    return -1
  }

  function eventsOnDay(day: number): ChartEventDatum[] {
    return data.events.filter((event) => day >= event.startDay && day <= event.endDay)
  }

  /* -- the readout, shared by pointer and keyboard ------------------------- */

  function readoutText(index: number): string {
    const label = data.dayLabels[index] ?? String(data.days[index] ?? index)
    const parts: string[] = []
    plotted().forEach((series) => {
      const point = series.points[index]
      if (point === undefined || point.price === null) {
        parts.push(docText('chart.price.readout.missing', { good: series.label }))
        return
      }
      if (scaleMode === 'gold') {
        parts.push(
          docText('chart.price.readout.value', {
            good: series.label,
            price: groupDigits(point.price),
          }),
        )
        return
      }
      const value = valueAt(series, index)
      parts.push(
        docText('chart.price.readout.indexed', {
          good: series.label,
          price: value === null ? '—' : oneDecimal(value),
        }),
      )
    })
    const day = data.days[index]
    for (const event of day === undefined ? [] : eventsOnDay(day)) {
      parts.push(docText('chart.price.readout.event', { event: `${event.label} — ${event.detail}` }))
    }
    return docText('chart.price.readout', { date: label, values: parts.join(' · ') })
  }

  function paintTip(index: number, clientX: number | null): void {
    while (tip.firstChild !== null) tip.removeChild(tip.firstChild)
    const dateLine = el('span', 'shp__tip-date', tip)
    dateLine.textContent = data.dayLabels[index] ?? String(data.days[index] ?? index)

    plotted().forEach((series, index) => {
      const slot = slotFor(series, index)
      const row = el('div', 'shp__tip-row', tip)
      // A short stroke of the series colour keys the row; at tooltip density a filled
      // box would be data-weight ink doing a label's job.
      const key = el('span', 'shp__tip-key', row)
      key.style.background = seriesColour(slot)
      const value = el('span', 'shp__tip-value', row)
      const point = series.points[index]
      if (point === undefined || point.price === null) {
        value.textContent = docText('chart.price.table.none')
      } else if (scaleMode === 'gold') {
        value.textContent = `${groupDigits(point.price)}g`
      } else {
        const indexed = valueAt(series, index)
        value.textContent = indexed === null ? docText('chart.price.table.none') : oneDecimal(indexed)
      }
      const name = el('span', 'shp__tip-name', row)
      name.textContent = series.label
    })

    const day = data.days[index]
    for (const event of day === undefined ? [] : eventsOnDay(day)) {
      const row = el('div', 'shp__tip-row', tip)
      const name = el('span', 'shp__tip-name', row)
      name.textContent = `${event.label} — ${event.detail}`
    }

    tip.hidden = false
    const box = plot.getBoundingClientRect()
    const width = tip.offsetWidth
    const raw = clientX === null ? box.left + box.width / 2 : clientX
    const x = clamp(raw - box.left + 12, 4, Math.max(4, box.width - width - 4))
    tip.style.left = `${Math.round(x)}px`
    tip.style.top = '4px'
  }

  function setCursor(index: number, clientX: number | null): void {
    const next = data.days.length === 0 ? -1 : clamp(Math.round(index), 0, data.days.length - 1)
    cursor = next
    paint()
    if (next < 0) {
      tip.hidden = true
      readout.textContent = ''
      return
    }
    paintTip(next, clientX)
    readout.textContent = readoutText(next)
  }

  function clearCursor(): void {
    cursor = -1
    tip.hidden = true
    readout.textContent = ''
    paint()
  }

  function indexFromClientX(clientX: number): number {
    const g = geometry()
    const box = plot.getBoundingClientRect()
    const innerW = g.width - g.left - g.right
    if (innerW <= 0 || data.days.length === 0) return -1
    const scale = box.width > 0 ? g.width / box.width : 1
    const local = (clientX - box.left) * scale - g.left
    const ratio = clamp(local / innerW, 0, 1)
    return Math.round(ratio * (data.days.length - 1))
  }

  plot.addEventListener('pointermove', (event: PointerEvent) => {
    if (data.days.length === 0) return
    const index = indexFromClientX(event.clientX)
    if (index < 0) return
    setCursor(index, event.clientX)
  })
  plot.addEventListener('pointerleave', () => {
    if (document.activeElement !== plot) clearCursor()
  })
  plot.addEventListener('focus', () => {
    if (data.days.length === 0) return
    setCursor(cursor < 0 ? data.days.length - 1 : cursor, null)
  })
  plot.addEventListener('blur', () => {
    clearCursor()
  })

  plot.addEventListener('keydown', (event: KeyboardEvent) => {
    if (data.days.length === 0) return
    const rows = plotted()
    const at = cursor < 0 ? data.days.length - 1 : cursor
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        setCursor(at - 1, null)
        return
      case 'ArrowRight':
        event.preventDefault()
        setCursor(at + 1, null)
        return
      case 'Home':
        event.preventDefault()
        setCursor(0, null)
        return
      case 'End':
        event.preventDefault()
        setCursor(data.days.length - 1, null)
        return
      case 'ArrowUp':
      case 'ArrowDown': {
        if (rows.length === 0) return
        event.preventDefault()
        const current = focusedKey === null ? -1 : rowOf(focusedKey)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = current + delta
        setFocused(next < 0 || next >= rows.length ? null : rows[next].key)
        return
      }
      case 'Escape':
        if (cursor >= 0) {
          event.stopPropagation()
          clearCursor()
        }
        return
      default:
    }
  })

  /* -- the parts that are text -------------------------------------------- */

  function paintLegend(): void {
    while (legend.firstChild !== null) legend.removeChild(legend.firstChild)
    const rows = plotted()
    // One series needs no legend box — the section heading already names it.
    legendGroup.hidden = rows.length < 2
    rows.forEach((series, index) => {
      const slot = slotFor(series, index)
      const item = el('li', undefined, legend)
      const button = el('button', undefined, item)
      button.type = 'button'
      const pressed = focusedKey === series.key
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
      const mark = docText(MARK_KEY[seriesMark(slot)])
      button.setAttribute(
        'aria-label',
        `${docText('chart.price.legend.entry', { good: series.label, mark })} — ${docText(
          pressed ? 'chart.price.focus.none' : 'chart.price.focus',
          { good: series.label },
        )}`,
      )

      // The legend mirrors the mark: a 2px line-key plus the series' own glyph.
      const swatch = svgEl('svg', undefined, { width: 22, height: 12, viewBox: '0 0 22 12' })
      button.appendChild(swatch)
      svgEl('line', swatch, {
        x1: 1,
        y1: 6,
        x2: 21,
        y2: 6,
        stroke: seriesColour(slot),
        'stroke-width': 2,
        'stroke-linecap': 'round',
      })
      svgEl('path', swatch, { d: markPath(seriesMark(slot), 11, 6, 4), fill: PAL.cream })
      svgEl('path', swatch, { d: markPath(seriesMark(slot), 11, 6, 3), fill: seriesColour(slot) })

      const name = el('span', undefined, button)
      name.textContent = series.label

      button.addEventListener('click', () => {
        setFocused(focusedKey === series.key ? null : series.key)
      })
    })
  }

  function paintTiles(): void {
    while (tiles.firstChild !== null) tiles.removeChild(tiles.firstChild)
    const rows = plotted()
    supplyGroup.hidden = rows.length === 0
    rows.forEach((series, index) => {
      const slot = slotFor(series, index)
      const item = el('li', 'shp__tile', tiles)
      const head = el('div', 'shp__tile-name', item)

      const swatch = svgEl('svg', undefined, { width: 14, height: 12, viewBox: '0 0 14 12' })
      head.appendChild(swatch)
      svgEl('path', swatch, { d: markPath(seriesMark(slot), 7, 6, 4), fill: PAL.cream })
      svgEl('path', swatch, { d: markPath(seriesMark(slot), 7, 6, 3), fill: seriesColour(slot) })
      const name = el('span', undefined, head)
      name.textContent = series.label

      const supply = Number.isFinite(series.supplyIndex) ? series.supplyIndex : 1
      const value = el('strong', 'shp__tile-value', item)
      value.textContent = oneDecimal(supply)

      // A diverging meter: neutral at 1.0, warm above (flooded, price held down), leaf
      // below (short, price lifted). Two hues that read as opposite, a neutral middle.
      const meter = el('div', 'shp__meter', item)
      const fill = el('i', undefined, meter)
      const midpoint = el('u', undefined, meter)
      midpoint.setAttribute('aria-hidden', 'true')
      const spread = clamp((supply - 1) / 2, -1, 1)
      const half = Math.abs(spread) * 50
      if (spread >= 0) {
        fill.style.left = '50%'
        fill.style.width = `${half}%`
        fill.style.background = PAL.berry
      } else {
        fill.style.left = `${50 - half}%`
        fill.style.width = `${half}%`
        fill.style.background = PAL.leaf
      }
      const stateKey =
        supply > 1.05
          ? 'chart.price.supply.flooded'
          : supply < 0.95
            ? 'chart.price.supply.short'
            : 'chart.price.supply.balanced'
      meter.setAttribute('role', 'img')
      meter.setAttribute(
        'aria-label',
        docText('chart.price.supply.meter', {
          good: series.label,
          index: oneDecimal(supply),
          state: docText(stateKey),
        }),
      )

      const delta = el('span', 'shp__tile-delta', item)
      const first = firstPrice(series)
      const last = lastPrice(series)
      if (first === null || last === null) {
        delta.textContent = docText(stateKey)
      } else {
        const change = ((last - first) / first) * 100
        const key =
          Math.abs(change) < 0.5
            ? 'chart.price.change.flat'
            : change > 0
              ? 'chart.price.change.up'
              : 'chart.price.change.down'
        delta.textContent = `${docText('chart.price.latest', { price: groupDigits(last) })} · ${docText(
          key,
          { change: oneDecimal(Math.abs(change)) },
        )}`
      }
    })
  }

  function lastPrice(series: PriceSeriesDatum): number | null {
    for (let i = series.points.length - 1; i >= 0; i--) {
      const point = series.points[i]
      if (point.price !== null) return point.price
    }
    return null
  }

  function paintEvents(): void {
    while (eventList.firstChild !== null) eventList.removeChild(eventList.firstChild)
    eventLabel.textContent = docText('chart.price.events.title')
    const has = data.events.length > 0
    eventList.hidden = !has
    eventEmpty.hidden = has
    eventEmpty.textContent = docText('chart.price.events.none')
    for (const event of data.events) {
      const item = el('li', undefined, eventList)
      item.textContent = `${docText('chart.price.event.span', {
        event: event.label,
        from: labelForDay(event.startDay),
        to: labelForDay(event.endDay),
      })} — ${event.detail} (${docText(
        event.multiplier < 1 ? 'chart.price.event.cuts' : 'chart.price.event.lifts',
      )})`
    }
  }

  function labelForDay(day: number): string {
    const at = data.days.indexOf(day)
    if (at >= 0) return data.dayLabels[at] ?? String(day)
    const before = indexOfDay(day, 'floor')
    if (before >= 0) return data.dayLabels[before] ?? String(day)
    return String(day)
  }

  function paintTable(): void {
    while (tableHead.firstChild !== null) tableHead.removeChild(tableHead.firstChild)
    while (tableBody.firstChild !== null) tableBody.removeChild(tableBody.firstChild)

    const rows = plotted()
    tableCaption.textContent = docText('chart.price.table.caption')
    tableScroll.setAttribute('aria-label', docText('chart.price.table.caption'))

    const headRow = document.createElement('tr')
    const dayHead = document.createElement('th')
    dayHead.scope = 'col'
    dayHead.textContent = docText('chart.price.table.day')
    headRow.appendChild(dayHead)
    for (const series of rows) {
      const th = document.createElement('th')
      th.scope = 'col'
      th.textContent = series.label
      headRow.appendChild(th)
    }
    const eventHead = document.createElement('th')
    eventHead.scope = 'col'
    eventHead.textContent = docText('chart.price.table.event')
    headRow.appendChild(eventHead)
    tableHead.appendChild(headRow)

    for (let i = 0; i < data.days.length; i++) {
      const tr = document.createElement('tr')
      const th = document.createElement('th')
      th.scope = 'row'
      th.textContent = data.dayLabels[i] ?? String(data.days[i])
      tr.appendChild(th)
      for (const series of rows) {
        const td = document.createElement('td')
        td.className = 'shp__num'
        const point = series.points[i]
        td.textContent =
          point === undefined || point.price === null
            ? docText('chart.price.table.none')
            : groupDigits(point.price)
        tr.appendChild(td)
      }
      const td = document.createElement('td')
      const day = data.days[i]
      const here = day === undefined ? [] : eventsOnDay(day)
      td.textContent =
        here.length === 0
          ? docText('chart.price.table.none')
          : here.map((event) => `${event.label} — ${event.detail}`).join('; ')
      tr.appendChild(td)
      tableBody.appendChild(tr)
    }
  }

  function paintSummary(): void {
    const rows = plotted()
    if (data.days.length === 0 || rows.length === 0) {
      plot.setAttribute('aria-label', docText('chart.price.empty'))
      hint.textContent = docText('chart.price.empty')
      return
    }
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (const series of rows) {
      for (const point of series.points) {
        if (point.price === null) continue
        if (point.price < lo) lo = point.price
        if (point.price > hi) hi = point.price
      }
    }
    const summary = docText('chart.price.summary', {
      series: rows.length,
      days: data.days.length,
      from: data.dayLabels[0] ?? '',
      to: data.dayLabels[data.dayLabels.length - 1] ?? '',
      low: Number.isFinite(lo) ? groupDigits(lo) : '0',
      high: Number.isFinite(hi) ? groupDigits(hi) : '0',
    })
    plot.setAttribute('aria-label', docText('chart.price.plotLabel', { series: rows.length }))
    hint.textContent = `${summary} ${docText('chart.price.hint')}`
  }

  function setFocused(key: string | null): void {
    const valid = key !== null && rowOf(key) >= 0 ? key : null
    if (valid === focusedKey) return
    focusedKey = valid
    paintLegend()
    paint()
    if (cursor >= 0) readout.textContent = readoutText(cursor)
    if (opts.onFocusSeries) opts.onFocusSeries(focusedKey)
  }

  function setScale(mode: ScaleMode): void {
    if (scaleMode === mode) return
    scaleMode = mode
    relabel()
    paint()
    if (cursor >= 0) {
      paintTip(cursor, null)
      readout.textContent = readoutText(cursor)
    }
  }

  goldButton.addEventListener('click', () => setScale('gold'))
  indexedButton.addEventListener('click', () => setScale('indexed'))
  tableToggle.addEventListener('click', () => {
    showTable = !showTable
    tableScroll.hidden = !showTable
    tableToggle.setAttribute('aria-expanded', showTable ? 'true' : 'false')
    tableToggle.textContent = docText(showTable ? 'chart.price.table.hide' : 'chart.price.table.show')
  })

  function relabel(): void {
    scaleLabel.textContent = docText('chart.price.scale.label')
    goldButton.textContent = docText('chart.price.scale.gold')
    indexedButton.textContent = docText('chart.price.scale.indexed')
    goldButton.setAttribute('aria-pressed', scaleMode === 'gold' ? 'true' : 'false')
    indexedButton.setAttribute('aria-pressed', scaleMode === 'indexed' ? 'true' : 'false')
    scaleNote.textContent =
      scaleMode === 'gold'
        ? docText('chart.price.scale.goldHint')
        : docText('chart.price.scale.indexedHint', { day: data.dayLabels[0] ?? '' })
    tableToggle.textContent = docText(showTable ? 'chart.price.table.hide' : 'chart.price.table.show')
    legendLabel.textContent = docText('chart.price.legend')
    supplyLabel.textContent = docText('chart.price.supply.title')
    supplyNote.textContent = docText('chart.price.supply.note')
    paintLegend()
    paintTiles()
    paintEvents()
    paintTable()
    paintSummary()
  }

  /* -- resizing ------------------------------------------------------------ */

  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver === 'function') {
    // Keyed on the width *and* the root font size: moving up the 100/125/150/200 % scale
    // ladder can leave the plot the same number of pixels wide while every label in it
    // needs to grow, and a width-only guard would quietly skip that repaint.
    let last = ''
    const repaint = (): void => {
      const key = `${plot.clientWidth}:${geometry().fontSize}`
      if (key === last) return
      last = key
      paint()
    }
    observer = new ResizeObserver(repaint)
    observer.observe(plot)
    observer.observe(root)
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', paint)
  }

  relabel()
  paint()

  return {
    el: root,
    update(next: PriceChartData): void {
      data = next
      if (focusedKey !== null && rowOf(focusedKey) < 0) focusedKey = null
      if (cursor >= data.days.length) cursor = data.days.length - 1
      relabel()
      paint()
      if (cursor >= 0) {
        paintTip(cursor, null)
        readout.textContent = readoutText(cursor)
      }
    },
    focusedSeries: () => focusedKey,
    setFocusedSeries: setFocused,
    tableElement: () => table,
    relabel,
    focus: () => plot.focus(),
    destroy(): void {
      observer?.disconnect()
      observer = null
      if (typeof window !== 'undefined') window.removeEventListener('resize', paint)
      root.remove()
    },
  }
}

let uid = 0
function uniqueId(prefix: string): string {
  uid += 1
  return `${prefix}-${uid}`
}
