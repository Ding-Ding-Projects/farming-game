import type { DayReport, GameState, Weather } from '../../game/types'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W } from '../../game/constants'
import { sleep } from '../../game/actions'
import { formatDate } from '../../game/time'
import { PAL, withAlpha } from '../../engine/palette'
import { drawText, drawTextCentered, wrapText } from '../../engine/font'
import { hline, rect } from '../../engine/pixel'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'

const PANEL_X = 22
const PANEL_Y = 10
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 196

const TEXT_X = PANEL_X + 12
const TEXT_W = PANEL_W - 24
const TEXT_Y = PANEL_Y + 22
const LINE_H = 9
/** Where the ruled page stops and the tin line begins. */
const TEXT_BOTTOM = PANEL_Y + PANEL_H - 34
const MAX_LINES = Math.floor((TEXT_BOTTOM - TEXT_Y) / LINE_H)

const RULE = mixHex(PAL.parchment, PAL.soil, 0.2)
const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)

interface Entry {
  text: string
  color: string
  /** A blank half-line before this entry, the way a diary breathes. */
  gap: boolean
}

function nightLine(weather: Weather): string {
  switch (weather) {
    case 'rain':
      return 'RAIN CAME IN THE NIGHT AND SOAKED EVERY ROW.'
    case 'storm':
      return 'A STORM ROLLED DOWN THE VALLEY. THE BEDS DRANK THEIR FILL.'
    case 'snow':
      return 'SNOW SETTLED OVER THE FIELD. NOTHING DRANK.'
    case 'clear':
      return 'THE NIGHT WAS CLEAR AND STILL.'
  }
}

function forecastLine(weather: Weather): string {
  switch (weather) {
    case 'rain':
      return 'THE AIR IS HEAVY. RAIN BEFORE THE DAY IS OUT.'
    case 'storm':
      return 'THE CROWS ARE LOW. A STORM IS COMING.'
    case 'snow':
      return 'THE SKY IS WHITE AND LOW. SNOW BY EVENING.'
    case 'clear':
      return 'CLEAR SKIES AHEAD. THE CANS WILL BE NEEDED.'
  }
}

function compose(state: GameState, report: DayReport): Entry[] {
  const out: Entry[] = []
  const add = (text: string, color = PAL.ink, gap = false): void => {
    out.push({ text, color, gap })
  }

  add(nightLine(report.weather))
  if (report.watered > 0) {
    add(`${report.watered} TILLED ROWS WENT TO BED WET.`, QUIET)
  }

  if (report.grew > 0) {
    add(`${report.grew} PLANTS PUT ON GROWTH.`, PAL.leaf, true)
  } else {
    add('NOTHING IN THE BEDS STIRRED.', QUIET, true)
  }
  if (report.ripened > 0) {
    add(
      report.ripened === 1
        ? 'ONE CROP STANDS RIPE AND READY TO PICK.'
        : `${report.ripened} CROPS STAND RIPE AND READY TO PICK.`,
      PAL.leaf,
    )
  }
  if (report.withered > 0) {
    add(`${report.withered} WITHERED FOR WANT OF WATER.`, PAL.berry)
  }

  if (report.seasonChanged) {
    add(`THE SEASON TURNS. IT IS ${state.season.toUpperCase()} NOW.`, PAL.ink, true)
    if (report.outOfSeason > 0) {
      add(
        `${report.outOfSeason} PLANTS COULD NOT FOLLOW IT AND WERE PULLED UP.`,
        PAL.berry,
      )
    }
  }

  if (report.passedOut) {
    add('YOU WERE FOUND ASLEEP IN THE DIRT WITH THE HOE STILL IN HAND.', PAL.berry, true)
    if (report.medicalFee > 0) {
      add(`THE DOCTOR CAME OUT AND TOOK ${report.medicalFee}G FOR IT.`, PAL.berry)
    }
    add('YOU WOKE SORE, AND NOT ALL THE WAY RESTED.', QUIET)
  } else {
    add('YOU SLEPT THROUGH AND WOKE RESTED.', QUIET, true)
  }

  add(forecastLine(state.tomorrow), PAL.ink, true)
  return out
}

/**
 * A day that changed season, killed crops and ended face down in the dirt has more to
 * say than the page holds. Breathing room goes first, then the middle — the forecast
 * is the one line a player acts on, so it is always the last thing left.
 */
function fit(all: Array<{ text: string; color: string }>): Array<{ text: string; color: string }> {
  if (all.length <= MAX_LINES) return all
  const dense = all.filter((line) => line.text.length > 0)
  if (dense.length <= MAX_LINES) return dense
  const kept = dense.slice(0, MAX_LINES - 1)
  kept.push(dense[dense.length - 1])
  return kept
}

/** A dawn sky behind the page: night at the top, the first warmth at the bottom. */
function dawn(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < LOGICAL_H; y++) {
    const t = y / (LOGICAL_H - 1)
    rect(ctx, 0, y, LOGICAL_W, 1, mixHex(PAL.shadow, mixHex(PAL.dusk, PAL.lantern, 0.35), t * t))
  }
  rect(ctx, 0, LOGICAL_H - 26, LOGICAL_W, 26, withAlpha(PAL.lantern, 0.12))
}

export function createSleepScene(): Scene {
  let entries: Entry[] | null = null
  let lines: Array<{ text: string; color: string }> = []
  let resolvedThisFrame = false

  return {
    id: 'sleep',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g

      if (entries === null) {
        const result = sleep(ctx.state)
        ctx.state = result.state
        ctx.report = result.report
        entries = compose(result.state, result.report)
        const all: Array<{ text: string; color: string }> = []
        for (const entry of entries) {
          if (entry.gap && all.length > 0) all.push({ text: '', color: entry.color })
          for (const wrapped of wrapText(entry.text, TEXT_W)) {
            all.push({ text: wrapped, color: entry.color })
          }
        }
        lines = fit(all)
        ctx.clearToasts()
        playSound('newday')
        ctx.announce(`${formatDate(result.state)}. ${entries.map((e) => e.text).join(' ')}`)
        resolvedThisFrame = true
      }

      dawn(g)
      ui.begin(g, input)
      ui.panel(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, formatDate(ctx.state))

      let y = TEXT_Y
      for (const line of lines) {
        hline(g, TEXT_X - 4, y + 8, TEXT_W + 8, RULE)
        if (line.text.length > 0) drawText(g, line.text, TEXT_X, y, line.color)
        y += LINE_H
      }
      // Rule the rest of the page so it reads as paper, not as a list that ran out.
      for (; y < TEXT_BOTTOM; y += LINE_H) hline(g, TEXT_X - 4, y + 8, TEXT_W + 8, RULE)

      drawTextCentered(
        g,
        `${ctx.state.gold}G IN THE TIN`,
        PANEL_X + PANEL_W / 2,
        PANEL_Y + PANEL_H - 30,
        QUIET,
      )

      const go = ui.button(
        'sleep.continue',
        'CONTINUE',
        PANEL_X + Math.floor((PANEL_W - 96) / 2),
        PANEL_Y + PANEL_H - 20,
        96,
        15,
      )
      ui.end()

      ctx.toastY = LOGICAL_H - 6

      if (resolvedThisFrame) {
        resolvedThisFrame = false
        // The night is spent: get it onto disk before anything else can happen.
        return { kind: 'save' }
      }
      if (go) {
        playSound('select')
        return { kind: 'pop' }
      }
      return null
    },
  }
}
