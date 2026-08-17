/**
 * The band contract of `docs/GRAPHICS.md` section 3.
 *
 * "Light and weather composite over the world band only. Both install exactly one clip
 * of the world rectangle and always close it again, so the HUD and the belt are never
 * dimmed and never rained on."
 *
 * That sentence is the whole reason the HUD is legible at midnight in a storm, and it is
 * one `ctx.restore()` away from being false at any time. It is checked here rather than
 * left to the eye, because a dimmed HUD looks like a colour choice, not a bug.
 */
import { describe, expect, it } from 'vitest'

import { BELT_Y, HUD_H, LOGICAL_H, LOGICAL_W, WORLD_H, WORLD_Y } from '../src/game/constants'
import { drawLightLayer, drawWeatherLayer } from '../src/art/scenery'
import { rect } from '../src/engine/pixel'
import { PAL } from '../src/engine/palette'
import { Recorder, recorderCtx } from './recorder'
import type { Weather } from '../src/game/types'

const WEATHERS: Weather[] = ['clear', 'rain', 'storm', 'snow']

/** Every hour of the day, plus the small hours a loaded save can sit in. */
const HOURS = Array.from({ length: 24 }, (_, h) => h * 60)

describe('the light layer', () => {
  it('never paints outside the world band, at any hour or weather', () => {
    const r = new Recorder()
    const ctx = recorderCtx(r)

    for (const weather of WEATHERS) {
      for (const minutes of HOURS) {
        r.reset()
        drawLightLayer(ctx, minutes, weather)
        if (r.area === 0) continue
        const where = `${weather} at ${minutes / 60}:00`
        expect(r.bounds.y0, `${where} reached up into the HUD`).toBeGreaterThanOrEqual(WORLD_Y)
        expect(r.bounds.y1, `${where} reached down into the belt`).toBeLessThanOrEqual(
          WORLD_Y + WORLD_H,
        )
        expect(r.bounds.x0, `${where} reached off the left edge`).toBeGreaterThanOrEqual(0)
        expect(r.bounds.x1, `${where} reached off the right edge`).toBeLessThanOrEqual(LOGICAL_W)
      }
    }
  })

  it('does dim the world band at night, so the check above cannot pass by drawing nothing', () => {
    const r = new Recorder()
    r.reset()
    drawLightLayer(recorderCtx(r), 23 * 60, 'clear')
    // A full-width wash at least once over the band.
    expect(r.area).toBeGreaterThanOrEqual(LOGICAL_W * WORLD_H)
    expect(r.bounds.y0).toBe(WORLD_Y)
    expect(r.bounds.y1).toBe(WORLD_Y + WORLD_H)
  })

  it('leaves the clip stack as it found it, so the HUD drawn after it is not clipped', () => {
    const r = new Recorder()
    const ctx = recorderCtx(r)
    r.reset()
    drawLightLayer(ctx, 23 * 60, 'storm')
    drawWeatherLayer(ctx, 'storm', 40)

    // The HUD and the belt are painted after both layers, in the same context. If either
    // layer left its clip installed, these two would be swallowed whole.
    const before = r.area
    rect(ctx, 0, 0, LOGICAL_W, HUD_H, PAL.parchment)
    rect(ctx, 0, BELT_Y, LOGICAL_W, LOGICAL_H - BELT_Y, PAL.parchment)
    expect(r.area - before).toBe(LOGICAL_W * HUD_H + LOGICAL_W * (LOGICAL_H - BELT_Y))
    expect(r.bounds.y0).toBe(0)
    expect(r.bounds.y1).toBe(LOGICAL_H)
  })
})

describe('the weather layer', () => {
  it('never paints outside the world band, in any weather', () => {
    const r = new Recorder()
    const ctx = recorderCtx(r)

    for (const weather of WEATHERS) {
      // Several frames, because rain, snow and the lightning flash are all frame-driven
      // and a particle that walks off the band only does so on some of them.
      for (let frame = 0; frame < 600; frame += 7) {
        r.reset()
        drawWeatherLayer(ctx, weather, frame)
        if (r.area === 0) continue
        const where = `${weather} on frame ${frame}`
        expect(r.bounds.y0, `${where} reached up into the HUD`).toBeGreaterThanOrEqual(WORLD_Y)
        expect(r.bounds.y1, `${where} reached down into the belt`).toBeLessThanOrEqual(
          WORLD_Y + WORLD_H,
        )
      }
    }
  })

  it('draws nothing at all in clear weather', () => {
    const r = new Recorder()
    r.reset()
    drawWeatherLayer(recorderCtx(r), 'clear', 12)
    expect(r.area).toBe(0)
  })

  it('actually falls, so the band check cannot pass on an empty sky', () => {
    for (const weather of ['rain', 'storm', 'snow'] as const) {
      const r = new Recorder()
      r.reset()
      drawWeatherLayer(recorderCtx(r), weather, 12)
      expect(r.area, `${weather} drew nothing`).toBeGreaterThan(0)
    }
  })
})
