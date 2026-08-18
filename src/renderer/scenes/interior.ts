/**
 * Inside a building.
 *
 * This is not a panel over the farm — it is the farm's own scene loop, run against a room
 * instead of against the valley. The farmer walks with the same keys at the same speed,
 * faces things the same way, and uses them with the same button. `docs/INTERIORS.md` §1
 * explains why: a coop that opened a list would be the only place in the whole game where
 * the verb is chosen from a menu rather than by standing somewhere.
 *
 * The room is drawn with the farm's own band geometry — `WORLD_Y`, `TILE`, `FARM_W` — and
 * centred in it, so entering a building needs no camera and no second layout.
 *
 * The farmer's position on the *farm* is untouched while they are inside. Where they stand
 * in the room is local to this scene and deliberately not saved: you always come in at the
 * door, the way you would.
 */
import type { Facing } from '../../game/types'
import type { Interior, PanelRequest, Station } from '../../game/interiors'
import type { StationState } from '../../art/interiors'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { FARM_H, LOGICAL_H, LOGICAL_W, TILE, WORLD_Y } from '../../game/constants'
import {
  FARMHOUSE_ID,
  entryPoint,
  interiorFor,
  isFloor,
  stationAt,
  summarise,
  useStation,
} from '../../game/interiors'
import { animalsIn, isProduceReady } from '../../game/livestock'
import { speciesById } from '../../game/species'
import { machineStatus } from '../../game/production'
import { demolishBuilding, demolishPlan } from '../../game/placement'
import { PAL, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, textWidth } from '../../engine/font'
import { hline, rect, vline, woodPanel } from '../../engine/pixel'
import { playSound } from '../../engine/audio'
import { drawRoom, roomOrigin } from '../../art/interiors'
import { createBuildingScene } from './building'
import { createInventoryScene } from './inventory'
import { createMachineScene } from './machine'
import { createOrdersScene } from './orders'
import { armBuildingMove, createShopScene } from './shop'
import { createStallScene } from './stall'
import { createSleepScene } from './sleep'

/** The same walk speed as the farm, so stepping through a door changes nothing about it. */
const MOVE_MS = 180

/** How long a pull-down stays armed after the plan is read out. */
const DEMOLISH_CONFIRM_MS = 4000

const BAND_H = FARM_H * TILE

/* ------------------------------------------------------------------- helpers */

function facingDelta(facing: Facing): { dx: number; dy: number } {
  switch (facing) {
    case 'up':
      return { dx: 0, dy: -1 }
    case 'down':
      return { dx: 0, dy: 1 }
    case 'left':
      return { dx: -1, dy: 0 }
    case 'right':
      return { dx: 1, dy: 0 }
  }
}

/**
 * How full a station is, read from live state every frame so the art never disagrees with
 * the rules. Nothing here decides anything — it only asks.
 */
function stationState(
  ctx: SceneContext,
  interior: Interior,
  station: Station,
): StationState {
  const state = ctx.state
  switch (station.kind) {
    case 'pen': {
      if (station.ref === null) return { occupied: false, ready: false, wanting: false }
      const animal = state.animals.find((a) => a.id === station.ref)
      if (animal === undefined) return { occupied: false, ready: false, wanting: false }
      const species = speciesById(animal.species)
      return {
        occupied: true,
        ready: isProduceReady(state, animal),
        wanting: !animal.fedToday,
        // An animal let out to graze is genuinely not in its pen, so the pen shows empty.
        occupant: species === undefined || animal.outside ? null : { species, animal },
      }
    }
    case 'trough': {
      const hungry = animalsIn(state, interior.buildingId).some((a) => !a.fedToday)
      return { occupied: true, ready: false, wanting: hungry }
    }
    case 'nest': {
      const ready = animalsIn(state, interior.buildingId).some((a) => isProduceReady(state, a))
      return { occupied: true, ready, wanting: false }
    }
    case 'bench': {
      if (station.ref === null) return { occupied: false, ready: false, wanting: true }
      const status = machineStatus(state, station.ref)
      return {
        occupied: status !== null && status.active !== null,
        ready: status !== null && status.readyCount > 0,
        wanting: false,
      }
    }
    case 'counter': {
      const slot = station.ref === null ? undefined : state.stall[Number(station.ref)]
      return {
        occupied: slot !== undefined && slot.item !== null && slot.count > 0,
        ready: false,
        wanting: false,
      }
    }
    default:
      return { occupied: true, ready: false, wanting: false }
  }
}

/* --------------------------------------------------------------------- HUD */

const INFO_Y = LOGICAL_H - 40

function drawRoomHud(ctx: SceneContext, interior: Interior, ahead: string): void {
  const g = ctx.g
  const state = ctx.state

  // The top strip carries the same gold, time and energy the farm does. Rather than
  // duplicate that whole readout here, the room shows what a room is about: where you
  // are, and who is in it.
  rect(g, 0, 0, LOGICAL_W, WORLD_Y, PAL.ink)
  hline(g, 0, WORLD_Y - 1, LOGICAL_W, PAL.shadow)

  const title = `INSIDE THE ${interior.name}`
  drawText(g, title, 10, 8, PAL.lantern)

  const s = summarise(state, interior)
  const parts: string[] = []
  if (s.capacity > 0) parts.push(`${s.occupants}/${s.capacity} HOUSED`)
  if (s.hungry > 0) parts.push(`${s.hungry} HUNGRY`)
  if (s.ready > 0) parts.push(`${s.ready} READY`)
  if (s.benches > 0) parts.push(`${s.benches} BENCHES`)
  if (parts.length > 0) drawText(g, parts.join('   '), 10, 8 + FONT_H + 4, PAL.parchment)

  const gold = `${state.gold}G`
  drawText(g, gold, LOGICAL_W - 10 - textWidth(gold), 8, PAL.lantern)
  const energy = `ENERGY ${Math.max(0, Math.round(state.energy))}`
  drawText(g, energy, LOGICAL_W - 10 - textWidth(energy), 8 + FONT_H + 4, PAL.parchment)

  // The band below the room: what is ahead, and how to get out.
  rect(g, 0, WORLD_Y + BAND_H, LOGICAL_W, LOGICAL_H - WORLD_Y - BAND_H, PAL.ink)
  woodPanel(g, 6, INFO_Y, LOGICAL_W - 12, 32, { thin: true })
  drawText(g, `AHEAD: ${ahead}`, 14, INFO_Y + 5, PAL.ink, { maxWidth: LOGICAL_W - 150 })
  const out = 'ESC TO LEAVE'
  drawText(g, out, LOGICAL_W - 18 - textWidth(out), INFO_Y + 5, PAL.ink)
  const parts2 = ['SPACE TO USE']
  if (s.capacity > 0) parts2.push('L FOR THE LIST')
  parts2.push('M MOVE', 'X PULL DOWN')
  drawText(g, parts2.join('   '), 14, INFO_Y + 5 + FONT_H + 3, withAlpha(PAL.ink, 0.7))
}

/* ------------------------------------------------------------------- scene */

/**
 * Walk about the inside of a building. `buildingId` is re-resolved from live state every
 * frame, so a building pulled down while the player is standing in it puts them back
 * outside rather than leaving them in a room that no longer exists.
 */
export function createInteriorScene(buildingId: string): Scene {
  let pos: { x: number; y: number } | null = null
  let facing: Facing = 'up'
  let moveCooldown = 0
  let steps = 0
  /** Tween, so a step inside is as smooth as a step outside. */
  let fromX = 0
  let fromY = 0
  let drawX = 0
  let drawY = 0
  let moveT = MOVE_MS
  let spoken = ''
  /**
   * Milliseconds left on the pull-down confirmation. Tearing a building down sells its
   * occupants and returns nothing, so the first press only ever states the plan and the
   * second press inside this window is what actually does it.
   */
  let demolishArmed = 0

  return {
    id: 'building',

    update(ctx: SceneContext, input, _ui, dt: number, frame: number): SceneCommand | null {
      ctx.tick(dt, frame)

      const interior = interiorFor(ctx.state, buildingId)
      if (interior === null) {
        ctx.say('THAT BUILDING IS NO LONGER THERE.', 'bad')
        return { kind: 'pop' }
      }

      if (pos === null) {
        const at = entryPoint(interior)
        pos = { x: at.x, y: at.y }
        fromX = at.x
        fromY = at.y
        drawX = at.x
        drawY = at.y
        ctx.announce(`INSIDE THE ${interior.name}.`)
      }

      /* ---- walking ---------------------------------------------------- */
      const held = (a: string, b: string): boolean => input.down(a) || input.down(b)
      let dx = 0
      let dy = 0
      if (held('ArrowLeft', 'KeyA')) dx -= 1
      if (held('ArrowRight', 'KeyD')) dx += 1
      if (held('ArrowUp', 'KeyW')) dy -= 1
      if (held('ArrowDown', 'KeyS')) dy += 1

      moveCooldown -= dt
      if (dx === 0 && dy === 0) {
        moveCooldown = 0
      } else if (moveCooldown <= 0) {
        // Turning is free; a step costs the cooldown. Same bargain as the farm.
        facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right'
        const nx = pos.x + (dx === 0 ? 0 : dx > 0 ? 1 : -1)
        const ny = pos.y + (dy === 0 ? 0 : dy > 0 ? 1 : -1)

        // Walking down off the mat is walking out of the door. It is the way in reversed,
        // which is what makes a door feel like a door rather than a keyboard shortcut.
        if (nx === interior.door.x && ny === interior.door.y) {
          playSound('select')
          return { kind: 'pop' }
        }
        if (isFloor(interior, nx, ny)) {
          fromX = drawX
          fromY = drawY
          pos = { x: nx, y: ny }
          moveT = 0
          steps += 1
        }
        moveCooldown = MOVE_MS
      }

      /* ---- what is ahead ---------------------------------------------- */
      const step = facingDelta(facing)
      const ax = pos.x + step.dx
      const ay = pos.y + step.dy
      const facedStation =
        ax === interior.door.x && ay === interior.door.y
          ? (interior.stations.find((s) => s.kind === 'exit') ?? null)
          : stationAt(interior, ax, ay)
      const ahead =
        facedStation !== null
          ? facedStation.label
          : isFloor(interior, ax, ay)
            ? 'THE FLOOR'
            : 'THE WALL'

      if (ahead !== spoken) {
        spoken = ahead
        ctx.announce(ahead)
      }

      /* ---- using ------------------------------------------------------- */
      let command: SceneCommand | null = null
      if (
        facedStation !== null &&
        (input.pressed('Space') || input.pressed('Enter') || input.pressed('NumpadEnter'))
      ) {
        const use = useStation(ctx.state, interior, facedStation)
        ctx.state = use.result.state
        playSound(use.result.sound)
        ctx.say(use.result.message, use.result.ok ? 'good' : 'bad')
        command = honour(use.panel)
      }

      // The room is the game; the list is its companion. Walking a screen-reader user
      // around a grid to find the one hungry bird is worse than handing them a list, so
      // an animal building offers both and neither is the poor relation.
      if (input.pressed('KeyL') && summarise(ctx.state, interior).capacity > 0) {
        playSound('select')
        command = { kind: 'push', scene: createBuildingScene(interior.buildingId) }
      }

      /* ---- managing the building you are standing in -------------------- */
      demolishArmed = Math.max(0, demolishArmed - dt)

      // The farmhouse is part of the valley rather than something the player put up: it
      // is not in `state.buildings`, so moving or pulling it down would act on an id
      // nothing owns. Refuse plainly here rather than letting the placement layer fail
      // with a message about a building it cannot find.
      const isHome = interior.buildingId === FARMHOUSE_ID

      if (input.pressed('KeyM')) {
        if (isHome) {
          playSound('deny')
          ctx.say('THE FARMHOUSE STAYS WHERE IT IS.', 'bad')
        } else {
          // Moving needs a tile to move to, which only exists outside, so this arms the
          // farm's own placing mode and walks the player back out to use it.
          armBuildingMove(interior.buildingId, interior.kind)
          playSound('select')
          ctx.say(`PICK A NEW PLACE FOR THE ${interior.name}.`, 'good')
          command = { kind: 'pop' }
        }
      }

      if (input.pressed('KeyX') && isHome) {
        playSound('deny')
        ctx.say('YOU ARE NOT PULLING DOWN YOUR OWN HOUSE.', 'bad')
      } else if (input.pressed('KeyX')) {
        const plan = demolishPlan(ctx.state, interior.buildingId)
        if (!plan.ok) {
          playSound('deny')
          ctx.say(plan.message, 'bad')
          demolishArmed = 0
        } else if (demolishArmed > 0) {
          const result = demolishBuilding(ctx.state, interior.buildingId)
          ctx.state = result.state
          playSound(result.sound)
          ctx.say(result.message, result.ok ? 'good' : 'bad')
          demolishArmed = 0
          if (result.ok) command = { kind: 'pop' }
        } else {
          // The plan states what will happen to every occupant before a coin moves.
          demolishArmed = DEMOLISH_CONFIRM_MS
          playSound('deny')
          ctx.say(`${plan.message} PRESS X AGAIN TO DO IT.`, 'bad')
        }
      }

      if (input.pressed('Escape')) command = { kind: 'pop' }

      /* ---- the tween --------------------------------------------------- */
      moveT += dt
      const k = Math.min(1, moveT / MOVE_MS)
      drawX = fromX + (pos.x - fromX) * k
      drawY = fromY + (pos.y - fromY) * k

      /* ---- drawing ----------------------------------------------------- */
      const g = ctx.g
      const origin = roomOrigin(interior)

      // The room is painted by `src/art/interiors.ts`, the same call the screenshot
      // renderer makes, so the pictures in docs/shots are of this and not of a second
      // drawing that could drift away from it.
      drawRoom(g, interior, frame, (s) => stationState(ctx, interior, s), {
        x: drawX,
        y: drawY,
        facing,
        tool: ctx.state.tool,
        walkFrame: k < 1 ? steps : null,
      })

      // The faced station gets a hard bracket, never a glow: DESIGN section 6 has no blur.
      if (facedStation !== null && facedStation.kind !== 'exit') {
        const bx = origin.x + facedStation.x * TILE
        const by = origin.y + facedStation.y * TILE
        const bw = facedStation.w * TILE
        const bh = facedStation.h * TILE
        bracket(g, bx, by, bw, bh)
      }

      drawRoomHud(ctx, interior, ahead)
      ctx.toastY = INFO_Y - 4
      return command
    },
  }
}

/** Four corner brackets, two pixels thick — the game's one selection mark. */
function bracket(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const c = PAL.cream
  const len = 7
  hline(g, x, y, len, c)
  hline(g, x + w - len, y, len, c)
  hline(g, x, y + h - 1, len, c)
  hline(g, x + w - len, y + h - 1, len, c)
  vline(g, x, y, len, c)
  vline(g, x, y + h - len, len, c)
  vline(g, x + w - 1, y, len, c)
  vline(g, x + w - 1, y + h - len, len, c)
}

/**
 * Turns the pure layer's panel *request* into a shell command. The rules layer never
 * knows a scene exists, so this is the one place the two meet.
 */
function honour(panel: PanelRequest | null): SceneCommand | null {
  if (panel === null) return null
  switch (panel.open) {
    case 'leave':
      return { kind: 'pop' }
    case 'sleep':
      return { kind: 'push', scene: createSleepScene() }
    case 'bag':
      return { kind: 'push', scene: createInventoryScene() }
    case 'recipes':
      return { kind: 'push', scene: createMachineScene(panel.ref) }
    case 'buy-animal':
      return { kind: 'push', scene: createShopScene() }
    case 'price':
      // The counter that was used is the slot the panel opens on, so walking down the
      // stall and pricing one thing is one move rather than two.
      return { kind: 'push', scene: createStallScene(Number(panel.ref)) }
    case 'orders':
      return { kind: 'push', scene: createOrdersScene() }
  }
}
