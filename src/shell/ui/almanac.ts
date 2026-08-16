/**
 * The Almanac — the whole of Sprout Hollow's documentation, in the application and
 * completely offline.
 *
 * Two rules shape this file.
 *
 * 1. **Nothing is fetched.** There is no network call here, no remote help centre and
 *    no embedded asset. Every glyph is either DOM text or the game's own 5x7 face
 *    drawn onto a canvas.
 * 2. **No number is retyped.** The crop table reads `src/game/crops.ts` at runtime and
 *    the energy, clock and calendar figures read `src/game/constants.ts`. Documentation
 *    that can drift away from the game it documents is a defect, so the only way to
 *    change what this page says about a parsnip is to change the parsnip.
 *
 * The file also exports the small search-field factory the changelog reuses, so both
 * documentation surfaces get an identical anchored regex builder without either of
 * them owning the other's markup.
 */

import {
  ACTION_MINUTES,
  DAYS_PER_SEASON,
  DAY_END,
  DAY_START,
  DRY_DAYS_TO_WITHER,
  ENERGY_CAP,
  ENERGY_COST,
  FARM_H,
  FARM_W,
  QUALITY_MULTIPLIER,
  SEASONS,
  START_ENERGY,
  START_GOLD,
} from '../../game/constants'
import { CROPS, totalGrowDays } from '../../game/crops'
import { formatClock } from '../../game/time'
import type { CropDef, Quality, Season, ToolId, Weather } from '../../game/types'
import { FONT_H, drawText, textWidth } from '../../engine/font'
import { PAL } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'
import {
  cropNameKey,
  hasKey,
  onLangChange,
  qualityKey,
  seasonKey,
  t,
  toolDescKey,
  toolKey,
  weatherKey,
} from '../core/i18n'
import type { StringKey } from '../core/i18n'
import { registerCommand, registerGroupLabel, registerTarget } from '../core/palette-registry'
import type { Command, Target } from '../core/palette-registry'
import {
  DEFAULT_LIMITS,
  DIALECT_LABEL,
  ESCAPED_CHARACTERS,
  compile,
  escapeLiteral,
  plainToPattern,
  run,
  sanitizeFlags,
  withFlag,
} from '../core/regex'
import type { Match } from '../core/regex'
import { get as storeGet } from '../core/store'

export type StringParams = Record<string, string | number>

/**
 * Wordings this lane needs that the shared string catalogue does not carry yet.
 * Every key the catalogue *does* carry is used from there instead, so the almanac
 * follows the language and the funny level like everything else.
 *
 * These are the plain, factual level-1 English lines, and `allDocStrings()` hands
 * the whole set to whoever translates them next. Facts stay `{placeholders}` here
 * exactly as they do in the catalogue, so no voice can ever restate a number.
 */
export const ALMANAC_STRINGS: Readonly<Record<string, string>> = {
  'almanac.section.tips': 'Tips',
  'almanac.contents': 'Almanac contents',
  'almanac.jump': 'Jump to {section}',

  // -- how to play
  'almanac.howto.intro.1':
    'You inherit one plot at the bottom of a wooded valley: a rusty hoe, {gold} gold, and {w} by {h} tiles of weeds, rocks and fallen logs. There is no timer pushing you and no way to lose.',
  'almanac.howto.intro.2':
    'The bag already holds a handful of the opening season’s seeds, so the first morning is playable without walking to the shop.',
  'almanac.howto.intro.3':
    'Walk with the arrow keys or {wasd}. The farmer faces the way you last moved, and every tool acts on the tile in front of the farmer — never the tile underneath.',
  'almanac.howto.steps': 'One tile, start to finish. Repeat it across the plot and that is the whole game.',
  'almanac.howto.outro':
    'The save is written for you: a file beside the application’s data on the desktop, and browser storage in the web preview. The farm is generated from the save’s seed, so the same save always plays the same valley.',

  // -- energy and time
  'almanac.energy.1':
    'The day runs from {start} to {end}. Every action advances the clock by {minutes} minutes, whatever the action was.',
  'almanac.energy.2':
    'You wake with {energy} energy. Upgrades raise the ceiling as far as {cap}, and a full night’s sleep refills it.',
  'almanac.energy.3':
    'Run the energy out, or reach {end} still standing in the field, and the farmer is carried home. The night still passes, but you wake with only part of your energy and the doctor takes a fee out of the purse.',
  'almanac.energy.caption': 'What each action costs',
  'almanac.energy.column.action': 'Action',
  'almanac.energy.column.cost': 'Energy',
  'almanac.energy.cost.till': 'Till a tile with the hoe',
  'almanac.energy.cost.water': 'Water with the can',
  'almanac.energy.cost.plant': 'Sow one seed',
  'almanac.energy.cost.harvest': 'Harvest by hand',
  'almanac.energy.cost.clearWeeds': 'Clear weeds',
  'almanac.energy.cost.clearRock': 'Break a rock',
  'almanac.energy.cost.clearLog': 'Split a fallen log',
  'almanac.energy.cost.sprinkler': 'Place a sprinkler',
  'almanac.energy.cost.fertilize': 'Work in fertilizer',

  // -- weather
  'almanac.weather.1':
    'Growth counts watered nights, not calendar days. A crop that spends a night dry simply does not advance.',
  'almanac.weather.2':
    'A sprouted plant that ends {dry} nights in a row dry withers, and a withered plant is gone. A seed that has not come up yet waits instead.',
  'almanac.weather.3':
    'A sprinkler waters its four neighbours every night, for as long as it stands there, and fertilizer worked into soil before sowing gives an extra day of growth every other day and better odds of a silver or gold harvest.',
  'almanac.weather.caption': 'What the sky does overnight',
  'almanac.weather.column.weather': 'Weather',
  'almanac.weather.column.effect': 'Overnight',
  'almanac.weather.effect.clear': 'Nothing is watered for you. The can and the sprinklers are all you have.',
  'almanac.weather.effect.rain': 'Every tilled tile is watered. A day off, if you spent it tilling.',
  'almanac.weather.effect.storm': 'Waters everything, exactly as rain does, and looks far more dramatic about it.',
  'almanac.weather.effect.snow': 'Waters nothing at all. Winter is worked by hand, or by sprinkler.',

  // -- seasons
  'almanac.seasons.1':
    '{days} days to a season, {count} seasons to a year. When winter ends the year turns over and spring starts again.',
  'almanac.seasons.2':
    'When the season turns, a living crop that cannot grow in the new season is cleared off its tile. Anything ripe is worth picking before you sleep on the last night.',
  'almanac.seasons.3':
    'Tomorrow’s weather is rolled when you sleep, so the morning report can tell you what is coming.',
  'almanac.seasons.column.season': 'Season',
  'almanac.seasons.column.crops': 'Seeds sold',
  'almanac.seasons.column.note': 'Character',
  'almanac.seasons.note.spring': 'Wet and forgiving. Rain does a good part of the watering.',
  'almanac.seasons.note.summer': 'Dry and long. The best money, and the most work.',
  'almanac.seasons.note.fall': 'Mixed weather, and the last chance to bank a cash crop.',
  'almanac.seasons.note.winter': 'No rain, only snow, which waters nothing. Plan the watering route.',

  // -- crops
  'almanac.crops.intro':
    'Read straight out of the game’s own crop table, so it cannot go stale: {count} crops in all.',
  'almanac.crops.caption': 'Every crop, with its seed cost, sale price, growing time, yield and regrowth',
  'almanac.crops.sort': 'Sort by {column}',
  'almanac.crops.note.grow':
    'Growing days count watered nights. A crop left dry takes longer in calendar days than the table says, which is what makes an expensive seed a gamble.',
  'almanac.crops.note.regrow':
    'A regrowing crop drops back to an earlier stage after a harvest and bears again, and each regrowth nudges the odds of a better quality up a little.',
  'almanac.crops.value.every': 'Every {days} days',

  // -- quality
  'almanac.quality.intro':
    'Every harvest is rolled for quality. Fertilizer shifts the odds hard, and each regrowth nudges them.',
  'almanac.quality.column.quality': 'Quality',
  'almanac.quality.column.price': 'Sells for',
  'almanac.quality.value': '{multiplier} × the crop’s price, rounded down',

  // -- money
  'almanac.money.1':
    'You start with {gold} gold. The shop stocks the current season’s seeds plus the sprinkler and the fertilizer, and it buys your produce at its quality.',
  'almanac.money.2':
    'Anything that is not produce is bought back at half its price, so stocking up and selling back is never free money.',
  'almanac.money.3':
    'A crop’s worth is the sale price in the table below times the quality multiplier, rounded down, times however many came off the plant.',
  'almanac.money.4':
    'Passing out costs a fee out of the purse on top of the day you lost, which makes an early night the cheapest decision in the game.',

  // -- tools
  'almanac.tools.intro':
    'Seven things the farmer can hold, on the number row in belt order. The held tool decides what {use} does to the faced tile.',
  'almanac.tools.column.key': 'Key',
  'almanac.tools.column.tool': 'Tool',
  'almanac.tools.column.does': 'What it does',
  'almanac.tools.column.energy': 'Energy',

  // -- controls
  'almanac.controls.intro':
    'Every action is on the keyboard. The mouse is optional everywhere in the game and everywhere in this application.',
  'almanac.controls.caption': 'Game controls',
  'almanac.controls.shell':
    'The application around the game keeps its own keyboard routes: the tab strip, the command palette and every settings control are reached with {tab} and operated with {enter} and the arrow keys.',

  // -- tips
  'almanac.tips.1':
    'Till in the evening. Tilling costs the same energy at any hour, and it leaves the whole morning for watering.',
  'almanac.tips.2': 'Water before you clear. A dry crop loses a night; a rock will still be there tomorrow.',
  'almanac.tips.3':
    'A regrowing crop pays for itself over a season even when its sale price looks small beside a one-shot cash crop.',
  'almanac.tips.4':
    'Read the forecast on the sleep report. If rain is coming, spend the evening tilling instead of watering.',
  'almanac.tips.5': 'Sprinklers are the only thing that waters winter ground for you, because snow does not.',
  'almanac.tips.6':
    'Do not sow into the last days of a season unless the crop can ripen: the turn of the season clears what cannot grow.',
  'almanac.tips.7': 'Fertilize before you sow. Fertilizer works on the soil, and the plant reads it as it goes in.',
  'almanac.tips.8':
    'Nothing is lost by stopping. There is no fail state, no timer and no score — the farm is exactly where you left it.',

  // -- accessibility
  'almanac.access.intro':
    'Being a canvas does not excuse anything. This is what the application promises, in both surfaces.',
  'almanac.access.keyboard.detail':
    'In the game, {arrows} walk, {use} acts, the number row picks a tool and {close} closes the top panel. In the application, {tab} moves between controls, the arrow keys move within a tab strip, a table or a menu, and {enter} activates.',
  'almanac.access.reader.detail':
    'Repeated identical messages are dropped, so walking along a row of grass does not announce grass twenty times. In the application, informational messages are announced politely and failures assertively, and nothing that appears on its own takes your focus.',
  'almanac.access.motion.detail':
    'The in-app motion setting overrides the system preference in either direction, so you can ask for reduced motion on a machine that does not set it, or keep the full animation on a machine that does.',
  'almanac.access.scale':
    'The application is usable at 100, 125, 150 and 200 per cent display scale and down to a {width} pixel window. Nothing clips, nothing overlaps, and no control is smaller than {target} by {target} pixels.',
  'almanac.access.pixels':
    'The game canvas is upscaled by whole numbers only, so the pixels stay square at every window size, and the remainder is letterboxed rather than stretched.',
  'almanac.access.offline':
    'This page, the changelog and the whole application work with the network unplugged. There is no telemetry, no account and no remote asset: the art is drawn from code, the type is a bitmap face stored as strings, and the sound is synthesised as it plays.',

  // -- search field wording the catalogue does not carry
  'docs.search.scope.almanac': 'Searches every paragraph, crop, tool and control on this page.',
  'docs.search.scope.changelog': 'Searches every entry in every release.',
  'docs.search.copy.manual': 'The clipboard is unavailable, so the pattern is selected: copy it from there.',
  'docs.search.showingAll': 'Showing all {count}.',
}

const PARAM_PATTERN = /\{(\w+)\}/g

/**
 * Default wordings, in registration order. The changelog and the surprise add
 * their own maps at load, so one `docText` serves every documentation surface.
 */
const DEFAULT_MAPS: Array<Readonly<Record<string, string>>> = [ALMANAC_STRINGS]

/** Lets a sibling documentation module contribute its own English defaults. */
export function registerDocStrings(map: Readonly<Record<string, string>>): void {
  if (!DEFAULT_MAPS.includes(map)) DEFAULT_MAPS.push(map)
}

/** Every default this lane owns, flattened — the hand-off to whoever translates them. */
export function allDocStrings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const map of DEFAULT_MAPS) {
    for (const key of Object.keys(map)) out[key] = map[key]
  }
  return out
}

function lookupDefault(key: string): string | undefined {
  for (const map of DEFAULT_MAPS) {
    const value = map[key]
    if (value !== undefined) return value
  }
  return undefined
}

function fillDefault(template: string, params?: StringParams): string {
  if (params === undefined) return template
  return template.replace(PARAM_PATTERN, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * `t()` for a key that may not be in the catalogue yet. A key the catalogue knows
 * goes straight through it, language, funny level and all. A key it does not know
 * falls back to the plain English above rather than leaking a dotted identifier
 * onto the page — and interpolates the same parameters either way, so a fact reads
 * identically down both branches.
 */
export function docText(key: string, params?: StringParams): string {
  if (hasKey(key)) return t(key, params)
  const fallback = lookupDefault(key)
  return fallback === undefined ? key : fillDefault(fallback, params)
}

/** A catalogue key when there is one, and the rendered words when there is not. */
function titleKeyOf(key: string, params?: StringParams): StringKey {
  return hasKey(key) ? key : (docText(key, params) as StringKey)
}

// ---------------------------------------------------------------------------
// styling
// ---------------------------------------------------------------------------

const PALETTE_NAMES: readonly PaletteName[] = [
  'ink',
  'shadow',
  'bark',
  'soil',
  'soilWet',
  'grass',
  'grassLit',
  'leaf',
  'parchment',
  'cream',
  'lantern',
  'berry',
  'sky',
  'dusk',
]

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * A colour, resolved from the shell's design tokens. The chain tries the spellings
 * `tokens.css` may reasonably use before falling back to the value the game itself
 * uses, which is set as `--dcf-*` on the component root from `src/engine/palette.ts`.
 * No literal colour is written in this file.
 */
function token(name: PaletteName): string {
  const k = kebab(name)
  const candidates = [`--sh-color-${k}`, `--color-${k}`, `--sh-${k}`, `--${k}`, `--${name}`]
  let out = `var(--dcf-${k})`
  for (let i = candidates.length - 1; i >= 0; i--) out = `var(${candidates[i]}, ${out})`
  return out
}

/** Puts the palette fallbacks on a component root so the token chain always lands. */
export function applyPaletteFallbacks(el: HTMLElement): void {
  for (const name of PALETTE_NAMES) el.style.setProperty(`--dcf-${kebab(name)}`, PAL[name])
}

const STYLE_ID = 'sprout-doc-styles'

const DOC_CSS = `
.sh-doc {
  --dc-ink: ${token('ink')};
  --dc-shadow: ${token('shadow')};
  --dc-bark: ${token('bark')};
  --dc-soil: ${token('soil')};
  --dc-grass-lit: ${token('grassLit')};
  --dc-parchment: ${token('parchment')};
  --dc-cream: ${token('cream')};
  --dc-lantern: ${token('lantern')};
  --dc-berry: ${token('berry')};
  --dc-sky: ${token('sky')};
  --dc-gap: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap);
  min-width: 0;
  max-width: 100%;
  padding: 12px;
  color: var(--dc-ink);
  background: var(--dc-parchment);
  border: 3px solid var(--dc-bark);
  box-shadow: inset 1px 1px 0 0 var(--dc-grass-lit), 2px 3px 0 0 var(--dc-shadow);
  font-size: 15px;
  line-height: 1.5;
  overflow: auto;
}
.sh-doc *, .sh-doc *::before, .sh-doc *::after { box-sizing: border-box; }
.sh-doc [hidden] { display: none !important; }
.sh-doc h2, .sh-doc h3, .sh-doc h4, .sh-doc h5 { margin: 0; line-height: 1.2; letter-spacing: 0.04em; text-transform: uppercase; }
.sh-doc h3 { font-size: 1.05rem; }
.sh-doc h4 { font-size: 0.95rem; }
.sh-doc h5 { font-size: 0.9rem; }
.sh-doc p { margin: 0; max-width: 68ch; }
.sh-doc ol { margin: 0; padding-inline-start: 1.5em; display: flex; flex-direction: column; gap: 4px; }
.sh-doc__vh {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.sh-doc__title { display: flex; align-items: center; gap: 8px; }
.sh-doc__title canvas { display: block; image-rendering: pixelated; }
.sh-doc__lede { opacity: 0.9; }
.sh-doc__note { font-size: 0.9rem; opacity: 0.85; }
.sh-doc__status { min-height: 1.5em; font-size: 0.9rem; }
.sh-doc__toc { border-block: 1px solid var(--dc-bark); padding-block: 8px; }
.sh-doc__toc ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.sh-doc__body { display: flex; flex-direction: column; gap: 20px; }
.sh-doc__section { display: flex; flex-direction: column; gap: 8px; scroll-margin-top: 8px; }
.sh-doc__section:focus, .sh-doc__section:focus-visible { outline: 2px solid var(--dc-lantern); outline-offset: 3px; }
.sh-doc__rows { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.sh-doc__row { display: grid; grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr); gap: 4px 12px; align-items: start; }
.sh-doc__row dt { font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.sh-doc__row dd { margin: 0; }
@media (max-width: 720px) { .sh-doc__row { grid-template-columns: minmax(0, 1fr); } }

.sh-doc button, .sh-doc input, .sh-doc textarea, .sh-doc select {
  font: inherit; color: var(--dc-ink); background: var(--dc-cream);
  border: 1px solid var(--dc-ink); border-radius: 0;
}
.sh-doc button {
  min-height: 26px; min-width: 26px; padding: 2px 10px; cursor: pointer; text-align: left;
  box-shadow: inset 1px 1px 0 0 var(--dc-parchment), 1px 1px 0 0 var(--dc-shadow);
}
.sh-doc button:hover { background: var(--dc-lantern); }
.sh-doc button[aria-pressed='true'], .sh-doc button[aria-expanded='true'] { background: var(--dc-lantern); }
.sh-doc button:active { background: var(--dc-ink); color: var(--dc-cream); }
.sh-doc :focus-visible { outline: 2px solid var(--dc-lantern); outline-offset: 2px; }
.sh-doc__search :focus-visible, .sh-doc__toc :focus-visible { outline-color: var(--dc-sky); }
.sh-doc input[type='search'], .sh-doc input[type='text'] { min-height: 28px; padding: 3px 8px; width: 100%; }
.sh-doc textarea { min-height: 72px; padding: 4px 8px; width: 100%; resize: vertical; }
.sh-doc label { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; }
.sh-doc input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--dc-lantern); }
.sh-doc fieldset { margin: 0; padding: 4px 8px; border: 1px solid var(--dc-bark); }
.sh-doc legend { padding: 0 4px; font-weight: 700; }

.sh-doc__search { position: relative; display: flex; flex-direction: column; gap: 6px; }
.sh-doc__search-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sh-doc__search-input { flex: 1 1 14rem; min-width: 0; }
.sh-doc__hint { font-size: 0.85rem; opacity: 0.85; }
.sh-doc__error { color: var(--dc-berry); font-weight: 700; }
.sh-doc__builder {
  position: absolute; inset-inline-start: 0; top: 100%; z-index: 30;
  width: min(34rem, calc(100vw - 24px)); max-height: min(60vh, 30rem); overflow: auto;
  display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px;
  background: var(--dc-parchment); border: 3px solid var(--dc-bark);
  box-shadow: inset 1px 1px 0 0 var(--dc-grass-lit), 2px 3px 0 0 var(--dc-shadow);
}
.sh-doc__builder-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sh-doc__pieces { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sh-doc__pieces button { font-size: 0.85rem; padding: 2px 6px; text-align: center; }
.sh-doc__field { display: flex; flex-direction: column; gap: 4px; }
.sh-doc__inline { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sh-doc__mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.sh-doc__scroll { overflow-x: auto; max-width: 100%; }
.sh-doc__scroll:focus-visible { outline: 2px solid var(--dc-lantern); outline-offset: 2px; }
.sh-doc table { border-collapse: collapse; width: 100%; min-width: 32rem; text-align: left; }
.sh-doc caption { text-align: left; padding-block-end: 6px; font-size: 0.9rem; opacity: 0.85; }
.sh-doc th, .sh-doc td { border: 1px solid var(--dc-bark); padding: 4px 8px; vertical-align: top; }
.sh-doc thead th { background: var(--dc-cream); position: sticky; top: 0; }
.sh-doc thead th button { width: 100%; background: transparent; border: 0; box-shadow: none; padding: 2px; font-weight: 700; }
.sh-doc td.sh-doc__num { text-align: right; font-variant-numeric: tabular-nums; }
.sh-doc kbd {
  display: inline-block; min-width: 22px; padding: 1px 5px; text-align: center;
  font-family: inherit; font-size: 0.85em; font-weight: 700;
  color: var(--dc-ink); background: var(--dc-lantern);
  border: 1px solid var(--dc-ink); box-shadow: 1px 1px 0 0 var(--dc-shadow);
}
@media (prefers-reduced-motion: reduce) {
  .sh-doc, .sh-doc * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
`

/** Injects the documentation stylesheet once. Safe to call from every component. */
export function ensureDocStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = DOC_CSS
  const head = document.head ?? document.documentElement
  head.appendChild(style)
}

// ---------------------------------------------------------------------------
// motion
// ---------------------------------------------------------------------------

/**
 * Whether animation is allowed here. The in-app motion setting overrides the system
 * preference in both directions; `system` defers to the preference.
 */
export function motionAllowed(): boolean {
  let mode: 'system' | 'full' | 'reduced' = 'system'
  try {
    mode = storeGet().settings.motion
  } catch {
    // A store that has not loaded yet is not a reason to refuse to render.
  }
  if (mode === 'reduced') return false
  if (mode === 'full') return true
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// small DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Marks an element as one row of searchable content. */
function searchable<T extends HTMLElement>(node: T, text: string): T {
  node.setAttribute('data-search-text', text)
  return node
}

function para(key: string, params?: StringParams): HTMLParagraphElement {
  const p = el('p')
  const text = docText(key, params)
  p.textContent = text
  return searchable(p, text)
}

/** A key cap, drawn as a real `<kbd>` so a screen reader announces it as one. */
function keycap(label: string): HTMLElement {
  const k = el('kbd')
  k.textContent = label
  return k
}

function cell(text: string, numeric = false): HTMLTableCellElement {
  const td = el('td')
  td.textContent = text
  if (numeric) td.className = 'sh-doc__num'
  return td
}

function rowHeader(text: string): HTMLTableCellElement {
  const th = el('th')
  th.scope = 'row'
  th.textContent = text
  return th
}

function headerCell(text: string): HTMLTableCellElement {
  const th = el('th')
  th.scope = 'col'
  th.textContent = text
  return th
}

/** A horizontally scrollable table region a keyboard can actually scroll. */
function scroller(label: string, table: HTMLTableElement): HTMLElement {
  const box = el('div', 'sh-doc__scroll')
  box.tabIndex = 0
  box.setAttribute('role', 'region')
  box.setAttribute('aria-label', label)
  box.appendChild(table)
  return box
}

/** Head, body and caption in one call, with every body row searchable. */
function table(
  captionText: string | null,
  columns: readonly string[],
  rows: ReadonlyArray<{ cells: readonly HTMLTableCellElement[]; search: string }>,
): HTMLElement {
  const t = el('table')
  if (captionText !== null) {
    const caption = el('caption')
    caption.textContent = captionText
    t.appendChild(caption)
  }
  const thead = el('thead')
  const headRow = el('tr')
  for (const column of columns) headRow.appendChild(headerCell(column))
  thead.appendChild(headRow)
  const tbody = el('tbody')
  for (const row of rows) {
    const tr = el('tr')
    for (const c of row.cells) tr.appendChild(c)
    tbody.appendChild(searchable(tr, row.search))
  }
  t.append(thead, tbody)
  return scroller(captionText ?? columns.join(' '), t)
}

// ---------------------------------------------------------------------------
// the shared search field
// ---------------------------------------------------------------------------

/** What a search field hands back on every keystroke. */
export interface DocQuery {
  /** Exactly what the user typed. */
  raw: string
  /** False when the field is empty: show everything. */
  active: boolean
  /** True when the query is a regular expression the user opted into. */
  regex: boolean
  /** Null unless the pattern failed to compile. */
  error: string | null
  test(text: string): boolean
}

export interface DocSearchOptions {
  /** The catalogue id. Also the DOM id stem, so a catalogue test can find it. */
  id: string
  labelKey: string
  placeholderKey: string
  /** Describes, in words, what this field searches. */
  scopeKey: string
  onQuery(query: DocQuery): void
}

export interface DocSearchField {
  el: HTMLElement
  input: HTMLInputElement
  focus(): void
  destroy(): void
}

const EMPTY_QUERY: DocQuery = { raw: '', active: false, regex: false, error: null, test: () => true }

interface Piece {
  key: string
  insert: string
  /** Where to drop the caret inside the inserted text. */
  caret?: number
  params?: StringParams
}

const PIECES: readonly Piece[] = [
  { key: 'regex.piece.digit', insert: '\\d' },
  { key: 'regex.piece.word', insert: '\\w' },
  { key: 'regex.piece.space', insert: '\\s' },
  { key: 'regex.piece.any', insert: '.' },
  { key: 'regex.piece.charclass', insert: '[a-z]', caret: 1 },
  { key: 'regex.piece.anchor.start', insert: '^' },
  { key: 'regex.piece.anchor.end', insert: '$' },
  { key: 'regex.piece.wordboundary', insert: '\\b' },
  { key: 'regex.piece.capture', insert: '()', caret: 1 },
  { key: 'regex.piece.noncapture', insert: '(?:)', caret: 3 },
  { key: 'regex.piece.alternation', insert: '|' },
  { key: 'regex.quantifier.any', insert: '*' },
  { key: 'regex.quantifier.some', insert: '+' },
  { key: 'regex.quantifier.optional', insert: '?' },
  { key: 'regex.quantifier.range', insert: '{2,4}', params: { min: 2, max: 4 } },
]

const FLAG_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['i', 'regex.flag.i'],
  ['m', 'regex.flag.m'],
  ['s', 'regex.flag.s'],
  ['u', 'regex.flag.u'],
]

interface RunSummary {
  count: number
  truncated: boolean
  timedOut: boolean
  first: Match | null
}

/** One bounded run through the shared engine. Never throws at the caller. */
function summarise(re: RegExp, text: string, maxMatches: number): RunSummary {
  try {
    const result = run(re, text, { maxMatches })
    return {
      count: result.matches.length,
      truncated: result.truncated,
      timedOut: result.timedOut,
      first: result.matches[0] ?? null,
    }
  } catch {
    return { count: 0, truncated: false, timedOut: false, first: null }
  }
}

/**
 * One search field, with its own anchored regular-expression builder. No state is
 * shared between two fields, and no pattern is ever persisted.
 */
export function createDocSearchField(opts: DocSearchOptions): DocSearchField {
  ensureDocStyles()

  const domId = opts.id.replace(/[^a-z0-9]+/gi, '-')
  const root = el('div', 'sh-doc__search')
  root.setAttribute('data-search-id', opts.id)

  const row = el('div', 'sh-doc__search-row')
  const label = el('label')
  label.htmlFor = `${domId}-input`
  const labelText = el('span')
  label.appendChild(labelText)

  const input = el('input')
  input.type = 'search'
  input.id = `${domId}-input`
  input.className = 'sh-doc__search-input'
  input.autocomplete = 'off'
  input.spellcheck = false

  const regexLabel = el('label')
  const regexToggle = el('input')
  regexToggle.type = 'checkbox'
  regexToggle.id = `${domId}-regex`
  const regexText = el('span')
  regexLabel.append(regexToggle, regexText)

  const builderButton = el('button')
  builderButton.type = 'button'
  builderButton.setAttribute('aria-expanded', 'false')
  builderButton.setAttribute('aria-controls', `${domId}-builder`)

  const clearButton = el('button')
  clearButton.type = 'button'

  row.append(label, input, regexLabel, builderButton, clearButton)

  const hint = el('p', 'sh-doc__hint')
  const error = el('p', 'sh-doc__error')
  error.setAttribute('role', 'alert')
  error.hidden = true

  // --- builder ------------------------------------------------------------
  const builder = el('div', 'sh-doc__builder')
  builder.id = `${domId}-builder`
  builder.hidden = true
  builder.setAttribute('role', 'group')

  const builderHead = el('div', 'sh-doc__builder-head')
  const builderTitle = el('h4')
  const builderClose = el('button')
  builderClose.type = 'button'
  builderHead.append(builderTitle, builderClose)

  const dialect = el('p', 'sh-doc__hint')
  const escapeNote = el('p', 'sh-doc__hint')
  const persistNote = el('p', 'sh-doc__hint')

  const patternField = el('div', 'sh-doc__field')
  const patternLabel = el('label')
  patternLabel.htmlFor = `${domId}-pattern`
  const patternLabelText = el('span')
  patternLabel.appendChild(patternLabelText)
  const pattern = el('input')
  pattern.type = 'text'
  pattern.id = `${domId}-pattern`
  pattern.className = 'sh-doc__mono'
  pattern.autocomplete = 'off'
  pattern.spellcheck = false
  patternField.append(patternLabel, pattern)

  const literalRow = el('div', 'sh-doc__inline')
  const literalLabel = el('label')
  literalLabel.htmlFor = `${domId}-literal`
  const literalLabelText = el('span')
  literalLabel.appendChild(literalLabelText)
  const literal = el('input')
  literal.type = 'text'
  literal.id = `${domId}-literal`
  literal.autocomplete = 'off'
  const literalInsert = el('button')
  literalInsert.type = 'button'
  literalRow.append(literalLabel, literal, literalInsert)

  const pieceList = el('ul', 'sh-doc__pieces')
  const pieceButtons: Array<{ button: HTMLButtonElement; piece: Piece }> = []
  for (const piece of PIECES) {
    const item = el('li')
    const button = el('button')
    button.type = 'button'
    button.addEventListener('click', () => insertAtCaret(piece.insert, piece.caret))
    item.appendChild(button)
    pieceList.appendChild(item)
    pieceButtons.push({ button, piece })
  }

  const flagsBox = el('fieldset', 'sh-doc__inline')
  const flagsLegend = el('legend')
  flagsBox.appendChild(flagsLegend)
  const flagInputs: Array<{ flag: string; key: string; input: HTMLInputElement; text: HTMLElement }> = []
  for (const [flag, key] of FLAG_KEYS) {
    const flagLabel = el('label')
    const flagInput = el('input')
    flagInput.type = 'checkbox'
    flagInput.id = `${domId}-flag-${flag}`
    const flagText = el('span')
    flagLabel.append(flagInput, flagText)
    flagsBox.appendChild(flagLabel)
    flagInputs.push({ flag, key, input: flagInput, text: flagText })
    flagInput.addEventListener('change', () => {
      if (regexToggle.checked) apply()
      updatePreview()
    })
  }

  const sampleField = el('div', 'sh-doc__field')
  const sampleLabel = el('label')
  sampleLabel.htmlFor = `${domId}-sample`
  const sampleLabelText = el('span')
  sampleLabel.appendChild(sampleLabelText)
  const sample = el('textarea')
  sample.id = `${domId}-sample`
  sample.className = 'sh-doc__mono'
  sample.maxLength = DEFAULT_LIMITS.maxSampleLength
  const sampleHint = el('p', 'sh-doc__hint')
  sampleField.append(sampleLabel, sample, sampleHint)

  const preview = el('p', 'sh-doc__hint')
  preview.setAttribute('role', 'status')
  const previewFirst = el('p', 'sh-doc__hint sh-doc__mono')
  const previewGroups = el('p', 'sh-doc__hint sh-doc__mono')

  const copyButton = el('button')
  copyButton.type = 'button'
  const copyRow = el('div', 'sh-doc__inline')
  copyRow.appendChild(copyButton)

  builder.append(
    builderHead,
    dialect,
    escapeNote,
    patternField,
    literalRow,
    pieceList,
    flagsBox,
    sampleField,
    preview,
    previewFirst,
    previewGroups,
    copyRow,
    persistNote,
  )

  root.append(row, hint, error, builder)

  // --- behaviour ----------------------------------------------------------

  function currentFlags(): string {
    let flags = ''
    for (const entry of flagInputs) if (entry.input.checked) flags = withFlag(flags, entry.flag, true)
    return sanitizeFlags(flags)
  }

  function insertAtCaret(text: string, caret?: number): void {
    const start = pattern.selectionStart ?? pattern.value.length
    const end = pattern.selectionEnd ?? start
    pattern.value = `${pattern.value.slice(0, start)}${text}${pattern.value.slice(end)}`
    const at = start + (caret ?? text.length)
    pattern.focus()
    pattern.setSelectionRange(at, at)
    onPatternEdited()
  }

  function onPatternEdited(): void {
    if (!regexToggle.checked) {
      regexToggle.checked = true
      syncMode()
    }
    input.value = pattern.value
    apply()
    updatePreview()
  }

  function syncMode(): void {
    const isRegex = regexToggle.checked
    input.classList.toggle('sh-doc__mono', isRegex)
    hint.textContent = isRegex
      ? `${docText(opts.scopeKey)} ${docText('regex.dialect', { dialect: DIALECT_LABEL })}`
      : `${docText(opts.scopeKey)} ${docText('search.mode.hint')}`
  }

  function build(): DocQuery {
    const raw = input.value
    if (raw.trim().length === 0) return EMPTY_QUERY
    const isRegex = regexToggle.checked
    const flags = withFlag(isRegex ? currentFlags() : 'i', 'g', true)
    const compiled = compile(isRegex ? raw : safePlainPattern(raw), flags)
    if (!compiled.ok) {
      const message =
        compiled.index === undefined
          ? docText('regex.error', { error: compiled.error })
          : docText('regex.error.at', { index: compiled.index, error: compiled.error })
      return { raw, active: true, regex: isRegex, error: message, test: () => false }
    }
    const re = compiled.re
    return {
      raw,
      active: true,
      regex: isRegex,
      error: null,
      test: (text: string) => summarise(re, text, 1).count > 0,
    }
  }

  function apply(): void {
    const query = build()
    error.hidden = query.error === null
    error.textContent = query.error ?? ''
    opts.onQuery(query)
  }

  function updatePreview(): void {
    if (builder.hidden) return
    const source = pattern.value
    if (source.length === 0) {
      preview.textContent = docText('regex.empty')
      previewFirst.textContent = ''
      previewGroups.textContent = ''
      return
    }
    const compiled = compile(source, withFlag(currentFlags(), 'g', true))
    if (!compiled.ok) {
      preview.textContent =
        compiled.index === undefined
          ? docText('regex.error', { error: compiled.error })
          : docText('regex.error.at', { index: compiled.index, error: compiled.error })
      previewFirst.textContent = ''
      previewGroups.textContent = ''
      return
    }
    const summary = summarise(compiled.re, sample.value, DEFAULT_LIMITS.maxMatches)
    const parts: string[] = [
      summary.count === 0 ? docText('regex.matches.none') : docText('regex.matches', { count: summary.count }),
    ]
    if (summary.truncated) {
      parts.push(docText('regex.matches.truncated', { shown: summary.count, limit: DEFAULT_LIMITS.maxMatches }))
    }
    if (summary.timedOut) parts.push(docText('regex.timeout', { ms: DEFAULT_LIMITS.timeBudgetMs }))
    if (summary.count > 0 && !summary.truncated && !summary.timedOut) parts.push(docText('regex.valid'))
    preview.textContent = parts.join(' ')

    const first = summary.first
    if (first === null) {
      previewFirst.textContent = ''
      previewGroups.textContent = ''
      return
    }
    previewFirst.textContent =
      first.value.length === 0
        ? docText('regex.match.empty', { index: first.index })
        : docText('regex.match.at', { index: first.index, text: first.value })
    previewGroups.textContent = first.groups
      .map((group) =>
        group.name === undefined
          ? docText('regex.group.numbered', { n: group.number, text: group.value ?? '' })
          : docText('regex.group.named', { name: group.name, text: group.value ?? '' }),
      )
      .join('   ')
  }

  function openBuilder(open: boolean): void {
    builder.hidden = !open
    builderButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    builderButton.textContent = docText(open ? 'search.builder.close' : 'search.builder.open')
    if (!open) return
    if (pattern.value.length === 0 && input.value.length > 0) {
      pattern.value = regexToggle.checked ? input.value : safePlainPattern(input.value)
    }
    updatePreview()
    pattern.focus()
    pattern.setSelectionRange(pattern.value.length, pattern.value.length)
  }

  input.addEventListener('input', () => {
    if (regexToggle.checked) pattern.value = input.value
    apply()
    updatePreview()
  })
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && input.value.length > 0) {
      event.stopPropagation()
      input.value = ''
      apply()
    }
  })
  regexToggle.addEventListener('change', () => {
    syncMode()
    if (regexToggle.checked && pattern.value.length === 0 && input.value.length > 0) pattern.value = input.value
    apply()
    updatePreview()
  })
  builderButton.addEventListener('click', () => openBuilder(builder.hidden))
  builderClose.addEventListener('click', () => {
    openBuilder(false)
    builderButton.focus()
  })
  clearButton.addEventListener('click', () => {
    input.value = ''
    pattern.value = ''
    apply()
    updatePreview()
    input.focus()
  })
  pattern.addEventListener('input', onPatternEdited)
  literalInsert.addEventListener('click', () => {
    if (literal.value.length === 0) {
      literal.focus()
      return
    }
    insertAtCaret(escapeLiteral(literal.value))
  })
  literal.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    literalInsert.click()
  })
  sample.addEventListener('input', updatePreview)
  copyButton.addEventListener('click', () => {
    void copyPattern(pattern, preview)
  })
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || builder.hidden) return
    event.stopPropagation()
    openBuilder(false)
    builderButton.focus()
  })
  document.addEventListener('pointerdown', onDocumentPointerDown, true)

  function onDocumentPointerDown(event: Event): void {
    if (builder.hidden) return
    const target = event.target
    if (target instanceof Node && root.contains(target)) return
    openBuilder(false)
  }

  function relabel(): void {
    const name = docText(opts.labelKey)
    labelText.textContent = name
    input.placeholder = docText(opts.placeholderKey)
    input.setAttribute('aria-label', name)
    regexText.textContent = docText('search.mode.regex')
    builderButton.textContent = docText(builder.hidden ? 'search.builder.open' : 'search.builder.close')
    clearButton.textContent = docText('search.clear')
    builderTitle.textContent = docText('regex.title')
    builder.setAttribute('aria-label', docText('regex.title'))
    builderClose.textContent = docText('common.close')
    dialect.textContent = docText('regex.dialect', { dialect: DIALECT_LABEL })
    escapeNote.textContent = docText('regex.escape.note', { chars: ESCAPED_CHARACTERS })
    persistNote.textContent = docText('regex.notPersisted')
    patternLabelText.textContent = docText('regex.pattern.label')
    pattern.placeholder = docText('regex.pattern.placeholder')
    literalLabelText.textContent = docText('regex.piece.literal')
    literalInsert.textContent = docText('regex.piece.add', { piece: docText('regex.piece.literal') })
    flagsLegend.textContent = docText('regex.flags.label')
    for (const entry of flagInputs) entry.text.textContent = docText(entry.key)
    for (const entry of pieceButtons) {
      const pieceName = docText(entry.piece.key, entry.piece.params)
      entry.button.textContent = pieceName
      entry.button.setAttribute('aria-label', docText('regex.piece.add', { piece: pieceName }))
    }
    sampleLabelText.textContent = docText('regex.sample.label')
    sample.placeholder = docText('regex.sample.placeholder')
    sampleHint.textContent = docText('regex.sample.limit', { max: DEFAULT_LIMITS.maxSampleLength })
    copyButton.textContent = docText('regex.copy')
    syncMode()
  }

  relabel()
  const stopLang = onLangChange(relabel)

  return {
    el: root,
    input,
    focus: () => input.focus(),
    destroy: () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      stopLang()
      root.remove()
    },
  }
}

/** `plainToPattern` is the shared translation; an escaped literal is the safety net. */
function safePlainPattern(query: string): string {
  try {
    const pattern = plainToPattern(query)
    if (typeof pattern === 'string' && pattern.length > 0) return pattern
  } catch {
    // fall through
  }
  return escapeLiteral(query)
}

/**
 * Copies the pattern. Where the clipboard is refused the pattern is selected
 * instead, so the keyboard route still works and the user is told which happened.
 */
async function copyPattern(field: HTMLInputElement, status: HTMLElement): Promise<void> {
  if (field.value.length === 0) return
  try {
    await navigator.clipboard.writeText(field.value)
    status.textContent = docText('common.copied')
  } catch {
    field.focus()
    field.select()
    status.textContent = docText('docs.search.copy.manual')
  }
}

// ---------------------------------------------------------------------------
// the panel shell shared by the almanac and the changelog
// ---------------------------------------------------------------------------

export interface DocPanel {
  /** The panel id, which is also the palette group and the target prefix. */
  id: string
  el: HTMLElement
  focusSearch(): void
  destroy(): void
}

export interface DocSectionSpec {
  id: string
  titleKey: string
  /** Facts folded into the heading — a version number, a date — never rewritten. */
  titleParams?: StringParams
  build(section: HTMLElement): void
}

interface BuiltSection extends DocSectionSpec {
  section: HTMLElement
  heading: HTMLHeadingElement
  tocItem: HTMLLIElement
  tocButton: HTMLButtonElement
}

export interface DocPanelSpec {
  /** Panel id, e.g. `almanac`. Section targets are `<id>.section.<sectionId>`. */
  id: string
  titleKey: string
  ledeKey: string
  /** Text carried verbatim from a rendered document, shown under the lede. */
  notes?: readonly string[]
  searchId: string
  searchLabelKey: string
  searchPlaceholderKey: string
  searchScopeKey: string
  searchCommandKey: string
  /** Accessible name for the contents nav. Defaults to the almanac's wording. */
  tocKey?: string
  sections: readonly DocSectionSpec[]
}

/**
 * Builds a documentation panel: display-type heading, lede, its own search field,
 * a contents list, the sections themselves, and a palette `Target` per section.
 */
export function createDocPanel(spec: DocPanelSpec): DocPanel {
  ensureDocStyles()

  const root = el('div', `sh-doc sh-doc--${spec.id}`)
  root.setAttribute('data-doc', spec.id)
  applyPaletteFallbacks(root)

  const head = el('header', 'sh-doc__head')
  const title = el('h2', 'sh-doc__title')
  const titleCanvas = el('canvas')
  titleCanvas.setAttribute('aria-hidden', 'true')
  const titleText = el('span')
  title.append(titleCanvas, titleText)

  const lede = el('p', 'sh-doc__lede')
  const status = el('p', 'sh-doc__status')
  status.setAttribute('role', 'status')

  const search = createDocSearchField({
    id: spec.searchId,
    labelKey: spec.searchLabelKey,
    placeholderKey: spec.searchPlaceholderKey,
    scopeKey: spec.searchScopeKey,
    onQuery: (query) => applyQuery(query),
  })

  head.append(title, lede)
  // Preamble, not content: the search leaves it alone, so the counts below only
  // ever talk about the sections.
  for (const note of spec.notes ?? []) head.appendChild(el('p', 'sh-doc__note', note))
  head.append(search.el, status)

  const toc = el('nav', 'sh-doc__toc')
  const tocList = el('ul')
  toc.appendChild(tocList)

  const body = el('div', 'sh-doc__body')

  const built: BuiltSection[] = []
  for (const sectionSpec of spec.sections) {
    const section = el('section', 'sh-doc__section')
    section.id = `${spec.id}-${sectionSpec.id}`
    section.tabIndex = -1
    const heading = el('h3')
    heading.id = `${section.id}-heading`
    section.setAttribute('aria-labelledby', heading.id)
    section.appendChild(heading)
    sectionSpec.build(section)
    body.appendChild(section)

    const tocItem = el('li')
    const tocButton = el('button')
    tocButton.type = 'button'
    tocButton.addEventListener('click', () => reveal(section))
    tocItem.appendChild(tocButton)
    tocList.appendChild(tocItem)

    built.push({ ...sectionSpec, section, heading, tocItem, tocButton })
  }

  root.append(head, toc, body)

  function reveal(section: HTMLElement): void {
    // Lets whoever owns the tab strip bring this panel forward before we focus.
    root.dispatchEvent(
      new CustomEvent('shell:reveal', { bubbles: true, detail: { panel: spec.id, section: section.id } }),
    )
    try {
      section.scrollIntoView({ block: 'start', behavior: motionAllowed() ? 'smooth' : 'auto' })
    } catch {
      section.scrollIntoView()
    }
    section.focus()
  }

  function applyQuery(query: DocQuery): void {
    let total = 0
    let shown = 0
    for (const entry of built) {
      const rows = Array.from(entry.section.querySelectorAll<HTMLElement>('[data-search-text]'))
      const heading = docText(entry.titleKey, entry.titleParams)
      // A query that names the section keeps the whole section, which is how a
      // reader gets from "seasons" to the season table in one keystroke.
      const titleHit = query.active && query.test(heading)
      let visible = 0
      for (const rowEl of rows) {
        total += 1
        const hit =
          !query.active ||
          titleHit ||
          query.test(`${rowEl.getAttribute('data-search-text') ?? ''} ${heading}`)
        rowEl.hidden = !hit
        if (hit) visible += 1
      }
      shown += visible
      const keep = !query.active || titleHit || visible > 0
      entry.section.hidden = !keep
      entry.tocItem.hidden = !keep
    }
    if (!query.active) status.textContent = docText('docs.search.showingAll', { count: total })
    else if (shown === 0) status.textContent = docText('search.results.none', { query: query.raw })
    else status.textContent = docText('search.results', { count: shown })
  }

  let unregister: Array<() => void> = []

  try {
    // Both documentation panels sit in one palette group, and the group needs words:
    // without a label the palette prints the raw id, which is not language.
    registerGroupLabel(spec.id, 'palette.group.docs', 40)
  } catch {
    // A registry that will not take a label still groups the entries correctly.
  }

  function registerEntries(): void {
    for (const off of unregister) off()
    unregister = []
    for (const entry of built) {
      // A heading that carries facts registers its rendered words, because
      // `Target` has nowhere to put parameters and `t()` echoes an unknown key.
      const target: Target = {
        id: `${spec.id}.section.${entry.id}`,
        titleKey: titleKeyOf(entry.titleKey, entry.titleParams),
        group: spec.id,
        teleport: () => reveal(entry.section),
      }
      try {
        unregister.push(registerTarget(target))
      } catch {
        // A palette that is not up yet must not stop the page rendering.
      }
    }
    const command: Command = {
      id: `${spec.id}.search`,
      titleKey: titleKeyOf(spec.searchCommandKey),
      group: spec.id,
      keywords: ['search', 'find', spec.id],
      run: () => {
        root.dispatchEvent(new CustomEvent('shell:reveal', { bubbles: true, detail: { panel: spec.id } }))
        search.focus()
      },
    }
    try {
      unregister.push(registerCommand(command))
    } catch {
      // As above.
    }
  }

  function relabel(): void {
    const titleString = docText(spec.titleKey)
    titleText.textContent = titleString
    paintDisplayTitle(titleCanvas, titleString, titleText)
    lede.textContent = docText(spec.ledeKey)
    toc.setAttribute('aria-label', docText(spec.tocKey ?? 'almanac.contents'))
    for (const entry of built) {
      const name = docText(entry.titleKey, entry.titleParams)
      entry.heading.textContent = name
      entry.tocButton.textContent = name
      entry.tocButton.setAttribute('aria-label', docText('almanac.jump', { section: name }))
    }
    registerEntries()
  }

  relabel()
  applyQuery(EMPTY_QUERY)
  const stopLang = onLangChange(relabel)

  return {
    id: spec.id,
    el: root,
    focusSearch: () => search.focus(),
    destroy: () => {
      for (const off of unregister) off()
      unregister = []
      stopLang()
      search.destroy()
      root.remove()
    },
  }
}

/**
 * Draws the panel title with the game's own 5x7 face so both surfaces are set in
 * the same letterforms. The face carries ASCII only, so a title in a script it
 * does not have falls back to the DOM heading rather than a row of hollow boxes.
 */
function paintDisplayTitle(canvas: HTMLCanvasElement, text: string, textNode: HTMLElement): void {
  const ctx = /^[\x20-\x7e]+$/.test(text) ? canvas.getContext('2d') : null
  if (ctx === null) {
    canvas.hidden = true
    textNode.classList.remove('sh-doc__vh')
    return
  }
  const scale = 3
  const w = textWidth(text) + 1
  const h = FONT_H + 1
  canvas.hidden = false
  canvas.width = w * scale
  canvas.height = h * scale
  canvas.style.width = `${w * scale}px`
  canvas.style.height = `${h * scale}px`
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, w, h)
  drawText(ctx, text, 0, 0, PAL.ink, { shadow: PAL.lantern })
  textNode.classList.add('sh-doc__vh')
}

// ---------------------------------------------------------------------------
// almanac content
// ---------------------------------------------------------------------------

export const ALMANAC_ID = 'almanac'
export const ALMANAC_SEARCH_ID = 'almanac.search'

export const ALMANAC_SECTION_IDS: readonly string[] = [
  'howto',
  'energy',
  'weather',
  'seasons',
  'crops',
  'quality',
  'money',
  'tools',
  'controls',
  'tips',
  'accessibility',
]

/** Key names exactly as the game reads them. Facts: they interpolate, never translate. */
const KEYS = {
  walk: 'Arrows / WASD',
  wasd: 'WASD',
  arrows: 'Arrows',
  use: 'Space / Enter',
  belt: '1 – 7',
  seed: 'Q / E',
  shop: 'B',
  bag: 'I',
  sleep: 'N',
  help: 'H / F1',
  mute: 'M',
  close: 'Esc',
  tab: 'Tab',
  enter: 'Enter',
} as const

const TOOL_ROWS: ReadonlyArray<{ tool: ToolId; key: string; cost: keyof typeof ENERGY_COST | null }> = [
  { tool: 'hoe', key: '1', cost: 'till' },
  { tool: 'can', key: '2', cost: 'water' },
  { tool: 'seeds', key: '3', cost: 'plant' },
  { tool: 'hand', key: '4', cost: 'harvest' },
  { tool: 'axe', key: '5', cost: null },
  { tool: 'sprinkler', key: '6', cost: 'sprinkler' },
  { tool: 'fertilizer', key: '7', cost: 'fertilize' },
]

const ENERGY_ROWS: ReadonlyArray<keyof typeof ENERGY_COST> = [
  'till',
  'water',
  'plant',
  'harvest',
  'clearWeeds',
  'clearRock',
  'clearLog',
  'sprinkler',
  'fertilize',
]

const QUALITIES: readonly Quality[] = ['normal', 'silver', 'gold']
const WEATHERS: readonly Weather[] = ['clear', 'rain', 'storm', 'snow']

const CONTROL_ROWS: ReadonlyArray<readonly [string, string]> = [
  [KEYS.walk, 'control.move'],
  [KEYS.use, 'control.use'],
  [KEYS.belt, 'control.tool'],
  [KEYS.seed, 'control.seed'],
  [KEYS.shop, 'control.shop'],
  [KEYS.bag, 'control.bag'],
  [KEYS.sleep, 'control.sleep'],
  [KEYS.help, 'control.help'],
  [KEYS.mute, 'control.mute'],
  [KEYS.close, 'control.close'],
]

function buildHowTo(section: HTMLElement): void {
  section.append(
    para('almanac.howto.intro.1', { gold: START_GOLD, w: FARM_W, h: FARM_H }),
    para('almanac.howto.intro.2'),
    para('almanac.howto.intro.3', { wasd: KEYS.wasd }),
    para('almanac.howto.steps'),
  )
  const steps = el('ol')
  for (let i = 1; i <= 6; i++) {
    const text = docText(`almanac.howto.${i}`)
    const item = el('li')
    item.textContent = text
    steps.appendChild(searchable(item, text))
  }
  section.append(steps, para('almanac.howto.outro'))
}

function buildEnergy(section: HTMLElement): void {
  const start = formatClock(DAY_START)
  const end = formatClock(DAY_END)
  section.append(
    para('almanac.energy.1', { start, end, minutes: ACTION_MINUTES }),
    para('almanac.energy.2', { energy: START_ENERGY, cap: ENERGY_CAP }),
    para('almanac.energy.3', { end }),
  )
  section.appendChild(
    table(
      docText('almanac.energy.caption'),
      [docText('almanac.energy.column.action'), docText('almanac.energy.column.cost')],
      ENERGY_ROWS.map((key) => {
        const name = docText(`almanac.energy.cost.${key}`)
        const cost = String(ENERGY_COST[key])
        return { cells: [rowHeader(name), cell(cost, true)], search: `${name} ${cost}` }
      }),
    ),
  )
}

function buildWeather(section: HTMLElement): void {
  section.append(
    para('almanac.weather.1'),
    para('almanac.weather.2', { dry: DRY_DAYS_TO_WITHER }),
    para('almanac.weather.3'),
  )
  section.appendChild(
    table(
      docText('almanac.weather.caption'),
      [docText('almanac.weather.column.weather'), docText('almanac.weather.column.effect')],
      WEATHERS.map((weather) => {
        const name = t(weatherKey(weather))
        const effect = docText(`almanac.weather.effect.${weather}`)
        return { cells: [rowHeader(name), cell(effect)], search: `${name} ${effect}` }
      }),
    ),
  )
}

function cropsInSeason(season: Season): number {
  let n = 0
  for (const crop of CROPS) if (crop.seasons.includes(season)) n += 1
  return n
}

function buildSeasons(section: HTMLElement): void {
  section.append(
    para('almanac.seasons.1', { days: DAYS_PER_SEASON, count: SEASONS.length }),
    para('almanac.seasons.2'),
    para('almanac.seasons.3'),
  )
  section.appendChild(
    table(
      null,
      [
        docText('almanac.seasons.column.season'),
        docText('almanac.seasons.column.crops'),
        docText('almanac.seasons.column.note'),
      ],
      SEASONS.map((season) => {
        const name = t(seasonKey(season))
        const count = String(cropsInSeason(season))
        const note = docText(`almanac.seasons.note.${season}`)
        return {
          cells: [rowHeader(name), cell(count, true), cell(note)],
          search: `${name} ${count} ${note}`,
        }
      }),
    ),
  )
}

// --- the crop table --------------------------------------------------------

type CropColumn = 'name' | 'season' | 'seed' | 'sell' | 'grow' | 'yield' | 'regrow'

interface CropColumnSpec {
  id: CropColumn
  labelKey: string
  numeric: boolean
  text(crop: CropDef): string
  sortValue(crop: CropDef): number | string
}

const CROP_COLUMNS: readonly CropColumnSpec[] = [
  {
    id: 'name',
    labelKey: 'almanac.crops.column.name',
    numeric: false,
    text: (crop) => t(cropNameKey(crop.id)),
    sortValue: (crop) => t(cropNameKey(crop.id)),
  },
  {
    id: 'season',
    labelKey: 'almanac.crops.column.season',
    numeric: false,
    text: (crop) => crop.seasons.map((season) => t(seasonKey(season))).join(', '),
    sortValue: (crop) => crop.seasons.map((season) => SEASONS.indexOf(season)).join(','),
  },
  {
    id: 'seed',
    labelKey: 'almanac.crops.column.seed',
    numeric: true,
    text: (crop) => docText('almanac.crops.value.gold', { gold: crop.seedCost }),
    sortValue: (crop) => crop.seedCost,
  },
  {
    id: 'sell',
    labelKey: 'almanac.crops.column.sell',
    numeric: true,
    text: (crop) => docText('almanac.crops.value.gold', { gold: crop.basePrice }),
    sortValue: (crop) => crop.basePrice,
  },
  {
    id: 'grow',
    labelKey: 'almanac.crops.column.grow',
    numeric: true,
    text: (crop) => docText('almanac.crops.value.days', { days: totalGrowDays(crop) }),
    sortValue: (crop) => totalGrowDays(crop),
  },
  {
    id: 'yield',
    labelKey: 'almanac.crops.column.yield',
    numeric: true,
    text: (crop) =>
      crop.yieldMin === crop.yieldMax
        ? String(crop.yieldMin)
        : docText('almanac.crops.value.yield', { min: crop.yieldMin, max: crop.yieldMax }),
    sortValue: (crop) => crop.yieldMax,
  },
  {
    id: 'regrow',
    labelKey: 'almanac.crops.column.regrow',
    numeric: false,
    text: (crop) =>
      crop.regrowDays === null
        ? docText('almanac.crops.value.once')
        : docText('almanac.crops.value.every', { days: crop.regrowDays }),
    sortValue: (crop) => (crop.regrowDays === null ? Number.MAX_SAFE_INTEGER : crop.regrowDays),
  },
]

function buildCrops(section: HTMLElement): void {
  section.appendChild(para('almanac.crops.intro', { count: CROPS.length }))

  const cropTable = el('table')
  const caption = el('caption')
  caption.textContent = docText('almanac.crops.caption')
  const thead = el('thead')
  const headRow = el('tr')
  const tbody = el('tbody')

  let sortColumn: CropColumn = 'name'
  let ascending = true

  const headers: Array<{ th: HTMLTableCellElement; button: HTMLButtonElement; spec: CropColumnSpec }> = []
  for (const spec of CROP_COLUMNS) {
    const th = el('th')
    th.scope = 'col'
    const button = el('button')
    button.type = 'button'
    button.addEventListener('click', () => {
      if (sortColumn === spec.id) ascending = !ascending
      else {
        sortColumn = spec.id
        ascending = true
      }
      renderBody()
    })
    th.appendChild(button)
    headRow.appendChild(th)
    headers.push({ th, button, spec })
  }
  thead.appendChild(headRow)
  cropTable.append(caption, thead, tbody)

  function renderBody(): void {
    const spec = CROP_COLUMNS.find((column) => column.id === sortColumn) ?? CROP_COLUMNS[0]
    const rows = CROPS.slice().sort((a, b) => {
      const av = spec.sortValue(a)
      const bv = spec.sortValue(b)
      let order =
        typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      if (order === 0) order = a.name.localeCompare(b.name)
      return ascending ? order : -order
    })

    tbody.textContent = ''
    for (const crop of rows) {
      const tr = el('tr')
      const parts: string[] = []
      for (let i = 0; i < CROP_COLUMNS.length; i++) {
        const column = CROP_COLUMNS[i]
        const text = column.text(crop)
        parts.push(text)
        tr.appendChild(i === 0 ? rowHeader(text) : cell(text, column.numeric))
      }
      tbody.appendChild(searchable(tr, `${crop.id} ${crop.name} ${parts.join(' ')}`))
    }

    for (const header of headers) {
      const label = docText(header.spec.labelKey)
      header.button.textContent = label
      header.button.setAttribute('aria-label', docText('almanac.crops.sort', { column: label }))
      header.th.setAttribute(
        'aria-sort',
        header.spec.id === sortColumn ? (ascending ? 'ascending' : 'descending') : 'none',
      )
    }
  }

  renderBody()
  section.appendChild(scroller(docText('almanac.crops.caption'), cropTable))
  section.append(para('almanac.crops.note.grow'), para('almanac.crops.note.regrow'))
}

function buildQuality(section: HTMLElement): void {
  section.appendChild(para('almanac.quality.intro'))
  section.appendChild(
    table(
      null,
      [docText('almanac.quality.column.quality'), docText('almanac.quality.column.price')],
      QUALITIES.map((quality) => {
        const name = t(qualityKey(quality))
        const value = docText('almanac.quality.value', { multiplier: QUALITY_MULTIPLIER[quality] })
        return { cells: [rowHeader(name), cell(value)], search: `${name} ${value}` }
      }),
    ),
  )
}

function buildMoney(section: HTMLElement): void {
  section.append(
    para('almanac.money.1', { gold: START_GOLD }),
    para('almanac.money.2'),
    para('almanac.money.3'),
    para('almanac.money.4'),
  )
}

function buildTools(section: HTMLElement): void {
  section.appendChild(para('almanac.tools.intro', { use: KEYS.use }))
  section.appendChild(
    table(
      null,
      [
        docText('almanac.tools.column.key'),
        docText('almanac.tools.column.tool'),
        docText('almanac.tools.column.does'),
        docText('almanac.tools.column.energy'),
      ],
      TOOL_ROWS.map((row) => {
        const name = t(toolKey(row.tool))
        const body = t(toolDescKey(row.tool))
        const cost =
          row.cost === null
            ? `${ENERGY_COST.clearWeeds}–${ENERGY_COST.clearLog}`
            : String(ENERGY_COST[row.cost])
        const keyCell = el('td')
        keyCell.appendChild(keycap(row.key))
        return {
          cells: [keyCell, rowHeader(name), cell(body), cell(cost, true)],
          search: `${row.key} ${name} ${body} ${cost}`,
        }
      }),
    ),
  )
}

function buildControls(section: HTMLElement): void {
  section.appendChild(para('almanac.controls.intro'))
  section.appendChild(
    table(
      docText('almanac.controls.caption'),
      [docText('almanac.controls.column.input'), docText('almanac.controls.column.action')],
      CONTROL_ROWS.map(([key, bodyKey]) => {
        const body = docText(bodyKey)
        const th = el('th')
        th.scope = 'row'
        th.appendChild(keycap(key))
        return { cells: [th, cell(body)], search: `${key} ${body}` }
      }),
    ),
  )
  section.appendChild(para('almanac.controls.shell', { tab: KEYS.tab, enter: KEYS.enter }))
}

function buildTips(section: HTMLElement): void {
  for (let i = 1; i <= 8; i++) section.appendChild(para(`almanac.tips.${i}`))
}

function buildAccessibility(section: HTMLElement): void {
  section.appendChild(para('almanac.access.intro'))
  section.append(
    para('almanac.accessibility.keyboard'),
    para('almanac.access.keyboard.detail', {
      arrows: KEYS.arrows,
      use: KEYS.use,
      close: KEYS.close,
      tab: KEYS.tab,
      enter: KEYS.enter,
    }),
    para('almanac.accessibility.reader'),
    para('almanac.access.reader.detail'),
    para('almanac.accessibility.focus'),
    para('almanac.accessibility.contrast', { ratio: 3 }),
    para('almanac.accessibility.motion'),
    para('almanac.access.motion.detail'),
    para('almanac.access.scale', { width: 640, target: 24 }),
    para('almanac.access.pixels'),
    para('almanac.access.offline'),
  )
}

const ALMANAC_SECTIONS: readonly DocSectionSpec[] = [
  { id: 'howto', titleKey: 'almanac.section.howto', build: buildHowTo },
  { id: 'energy', titleKey: 'almanac.section.energy', build: buildEnergy },
  { id: 'weather', titleKey: 'almanac.section.weather', build: buildWeather },
  { id: 'seasons', titleKey: 'almanac.section.seasons', build: buildSeasons },
  { id: 'crops', titleKey: 'almanac.section.crops', build: buildCrops },
  { id: 'quality', titleKey: 'almanac.section.quality', build: buildQuality },
  { id: 'money', titleKey: 'almanac.section.money', build: buildMoney },
  { id: 'tools', titleKey: 'almanac.section.tools', build: buildTools },
  { id: 'controls', titleKey: 'almanac.section.controls', build: buildControls },
  { id: 'tips', titleKey: 'almanac.section.tips', build: buildTips },
  { id: 'accessibility', titleKey: 'almanac.section.accessibility', build: buildAccessibility },
]

/** The Almanac panel. Put it in a tab panel; call `destroy` when the tab closes. */
export function createAlmanacPanel(): DocPanel {
  return createDocPanel({
    id: ALMANAC_ID,
    titleKey: 'almanac.title',
    ledeKey: 'almanac.intro',
    searchId: ALMANAC_SEARCH_ID,
    searchLabelKey: 'search.almanac.label',
    searchPlaceholderKey: 'search.almanac.placeholder',
    searchScopeKey: 'docs.search.scope.almanac',
    searchCommandKey: 'search.almanac.label',
    sections: ALMANAC_SECTIONS,
  })
}

/** Convenience for a host that would rather hand over a container than an element. */
export function mountAlmanac(host: HTMLElement): DocPanel {
  const panel = createAlmanacPanel()
  host.appendChild(panel.el)
  return panel
}
