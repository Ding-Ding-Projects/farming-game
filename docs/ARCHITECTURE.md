# Sprout Hollow — module contract

Three layers, strictly one-directional. Nothing lower may import from something higher.

```
  src/game/     pure rules. No canvas, no DOM, no window, no Date.now(), no Math.random().
      |         Fully unit-testable in a node environment.
      v
  src/engine/   generic pixel primitives: font, palette, immediate-mode UI, input, audio.
      |         Knows nothing about crops, seasons or farming.
      v
  src/art/      draws game concepts as pixels. Imports game *types* and engine primitives.
      |
      v
  src/renderer/ scenes, the frame loop, and the bridge to Electron.
```

`electron/` is its own process and imports none of the above.

Determinism rule: `src/game` never calls `Math.random()` or reads the clock. All randomness
comes from `rng.ts` seeded off `state.seed` plus a salt, so the same save always plays the
same. Tests depend on this.

---

## src/game/constants.ts — written, do not change

Exports the layout, calendar, clock, energy, economy and save-version constants.

## src/game/types.ts — written, do not change

Exports every shared type. Read it before implementing anything.

## src/game/rng.ts

```ts
export function mulberry32(seed: number): () => number
/** Deterministic generator for one (state, salt) pair. Same inputs, same stream. */
export function rngFor(seed: number, salt: string): () => number
/** Stable 32-bit hash of a string. Used to fold salts into the seed. */
export function hashString(s: string): number
export function pick<T>(rand: () => number, items: readonly T[]): T
export function randInt(rand: () => number, min: number, max: number): number
```

## src/game/time.ts

```ts
export function formatClock(minutes: number): string        // "6:00 AM", "11:40 PM", "1:20 AM"
export function formatDate(state: GameState): string        // "SPRING 4, YEAR 1"
export function seasonIndex(season: Season): number
export function nextSeason(season: Season): Season
export function isNight(minutes: number): boolean           // >= 20:00 or < 6:00
/** 0 = full daylight, 1 = deepest night. Drives the world tint. */
export function darkness(minutes: number): number
```

## src/game/crops.ts

```ts
export const CROPS: readonly CropDef[]
export function cropById(id: string): CropDef | undefined
/** Throws if the id is unknown. Use where a missing crop is a programming error. */
export function requireCrop(id: string): CropDef
export function cropsForSeason(season: Season): CropDef[]
export function totalGrowDays(crop: CropDef): number
export function isRipe(plant: Plant, crop: CropDef): boolean
/** Sale value of one produce item at a quality, rounded down. */
export function produceValue(crop: CropDef, quality: Quality): number
```

Twelve crops minimum, at least two per season including winter, spanning cheap-and-fast to
expensive-and-slow, with at least two regrowing crops. Every crop needs distinct `art`.

## src/game/state.ts

```ts
export function createState(seed: number): GameState
export function tileIndex(x: number, y: number): number
export function tileAt(state: GameState, x: number, y: number): Tile | undefined
export function inBounds(x: number, y: number): boolean
/** The tile the farmer is facing; where every tool acts. */
export function facingIndex(state: GameState): number
export function isWalkable(tile: Tile): boolean
export function countItem(state: GameState, item: ItemRef): number
export function addItem(state: GameState, item: ItemRef, count: number): GameState
/** Removes up to `count`; returns the state unchanged if not enough are held. */
export function removeItem(state: GameState, item: ItemRef, count: number): GameState | null
export function itemKey(item: ItemRef): string
export function itemName(item: ItemRef): string
export function cloneState(state: GameState): GameState
```

The opening farm: a cleared workable patch near the farmhouse, the rest strewn with weeds,
rocks and logs, a pond in one corner, deterministic from the seed. Start with a handful of
season-one seeds in the bag so the first day is playable without visiting the shop.

## src/game/actions.ts

```ts
export function movePlayer(state: GameState, dx: number, dy: number): GameState
export function setTool(state: GameState, tool: ToolId): GameState
export function selectSeed(state: GameState, cropId: string | null): GameState
/** Dispatches on state.tool to the right verb below, acting on facingIndex(state). */
export function useTool(state: GameState): ActionResult
export function till(state: GameState, index: number): ActionResult
export function water(state: GameState, index: number): ActionResult
export function sow(state: GameState, index: number, cropId: string): ActionResult
export function harvest(state: GameState, index: number): ActionResult
export function clearDebris(state: GameState, index: number): ActionResult
export function placeSprinkler(state: GameState, index: number): ActionResult
export function fertilize(state: GameState, index: number): ActionResult
/** Advances to 6:00 the next morning and returns what happened. */
export function sleep(state: GameState): { state: GameState; report: DayReport }
```

Rules every verb obeys:

- Refuse (`ok: false`, `sound: 'deny'`, unchanged state) when energy is short, the tile is
  wrong for the tool, the seed is out of season, or the item is not held.
- On success, spend `ENERGY_COST[...]` and `ACTION_MINUTES`. Reaching `DAY_END` or zero
  energy sets `passedOut` — the renderer forces a sleep.
- Watering can range comes from `upgrades.canRange` and waters every tilled tile in reach.
- Overnight: sprinklers water their four neighbours, rain and storms water everything, snow
  waters nothing. Watered plants advance; fertilized plants advance 1 extra progress every
  other day. Sprouted plants dry for `DRY_DAYS_TO_WITHER` consecutive days then wither.
  Turning the season clears live crops that cannot grow in the new one.
- Harvest yields `yieldMin..yieldMax` at a quality rolled from fertilizer and luck; a crop
  with `regrowDays` returns to the stage that re-ripens instead of clearing the tile.

## src/game/shop.ts

```ts
export interface ShopEntry { item: ItemRef; price: number; stock: number | null; note: string }
/** Seeds for the current season plus the permanent goods. */
export function shopStock(state: GameState): ShopEntry[]
export function buy(state: GameState, item: ItemRef, qty: number): ActionResult
export function sell(state: GameState, item: ItemRef, qty: number): ActionResult
export function sellAllProduce(state: GameState): ActionResult
export function sellValue(item: ItemRef): number
```

## src/game/save.ts

```ts
export function serialize(state: GameState): string
/** Returns null on malformed or unmigratable input. Never throws. */
export function deserialize(json: string): GameState | null
```

---

## src/engine/palette.ts

```ts
export const PAL: Record<PaletteName, string>   // exactly the DESIGN.md table
export type PaletteName =
  | 'ink' | 'shadow' | 'bark' | 'soil' | 'soilWet' | 'grass' | 'grassLit' | 'leaf'
  | 'parchment' | 'cream' | 'lantern' | 'berry' | 'sky' | 'dusk'
export function withAlpha(hex: string, alpha: number): string
export function shade(hex: string, amount: number): string   // -1..1, toward ink or cream
```

## src/engine/font.ts

A hand-authored 5x7 bitmap face. Glyph data is a string per character, rows separated by
`/`, `#` for on and `.` for off. Uppercase-led: lowercase input renders as uppercase.

```ts
export const FONT_W = 5
export const FONT_H = 7
export interface TextOpts { shadow?: string; spacing?: number; maxWidth?: number }
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, opts?: TextOpts): void
export function textWidth(text: string, spacing?: number): number
export function drawTextCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, opts?: TextOpts): void
/** Greedy word wrap to a pixel width. */
export function wrapText(text: string, maxWidth: number, spacing?: number): string[]
```

Cover at minimum: space `!"#$%&'()*+,-./`, `0-9`, `:;<=>?@`, `A-Z`, `[\]^_`, and render an
unknown character as a hollow box rather than crashing.

## src/engine/pixel.ts

```ts
export function px(ctx, x, y, color): void
export function rect(ctx, x, y, w, h, color): void
export function outline(ctx, x, y, w, h, color): void
export function hline(ctx, x, y, w, color): void
export function vline(ctx, x, y, h, color): void
/** 50% checker fill, used for shading and disabled states. */
export function dither(ctx, x, y, w, h, color, phase?: number): void
/** The carved-wood frame from DESIGN.md section 6. */
export function woodPanel(ctx, x, y, w, h, opts?: { thin?: boolean }): void
export type Sprite = { w: number; h: number; rows: string[]; palette: Record<string, string> }
export function makeSprite(rows: string[], palette: Record<string, string>): Sprite
export function drawSprite(ctx, sprite: Sprite, x: number, y: number, flipX?: boolean): void
```

## src/engine/input.ts

```ts
export interface PointerState { x: number; y: number; down: boolean; pressed: boolean; released: boolean }
export class Input {
  constructor(target: HTMLCanvasElement, toLogical: (cx: number, cy: number) => { x: number; y: number })
  readonly pointer: PointerState
  down(code: string): boolean
  pressed(code: string): boolean      // this frame only
  repeated(code: string): boolean     // press, then autorepeat after 300ms every 90ms
  anyPressed(): boolean
  /** Call once at the end of every frame. */
  endFrame(): void
  dispose(): void
}
```

Key codes are `KeyboardEvent.code`. The renderer maps them; `Input` stays generic.

## src/engine/ui.ts

Immediate mode. One `UI` instance is reused every frame.

```ts
export class UI {
  begin(ctx: CanvasRenderingContext2D, input: Input): void
  panel(x, y, w, h, title?: string): void
  label(text: string, x: number, y: number, color?: string): void
  /** Returns true on the frame it is activated, by click or by keyboard focus + Enter. */
  button(id: string, label: string, x: number, y: number, w: number, h: number, opts?: { disabled?: boolean; selected?: boolean }): boolean
  /** Moves keyboard focus between registered buttons. */
  focusNext(delta: number): void
  focusedId(): string | null
  end(): void
}
```

## src/engine/audio.ts

```ts
export function unlockAudio(): void          // call on first input
export function playSound(id: SoundId): void
export function setMuted(muted: boolean): void
export function isMuted(): boolean
```

WebAudio oscillators only. No files, no network. Silent and non-throwing if the context is
unavailable.

---

## src/art/tiles.ts

```ts
export function drawGround(ctx, tile: Tile, sx: number, sy: number, season: Season, frame: number): void
export function drawTileOverlay(ctx, tile: Tile, sx: number, sy: number, frame: number): void  // sprinkler, fertilizer speckle
```

## src/art/plants.ts

```ts
/** Parametric: builds the plant from CropDef.art, so twelve crops need no hand-drawn sheets. */
export function drawPlant(ctx, crop: CropDef, plant: Plant, sx: number, sy: number, frame: number): void
/** The little bagged-seed icon used in the shop and inventory. */
export function drawSeedIcon(ctx, crop: CropDef, sx: number, sy: number): void
export function drawProduceIcon(ctx, crop: CropDef, quality: Quality, sx: number, sy: number): void
```

## src/art/actors.ts

```ts
export function drawFarmer(ctx, facing: Facing, sx: number, sy: number, walkFrame: number, tool: ToolId): void
export function drawToolIcon(ctx, tool: ToolId, sx: number, sy: number): void
export function drawGoodIcon(ctx, good: GoodId, sx: number, sy: number): void
```

## src/art/scenery.ts

```ts
export function drawFarmhouse(ctx, sx: number, sy: number, season: Season, lit: boolean): void
export function drawTree(ctx, sx: number, sy: number, season: Season, variant: number): void
export function drawFencePost(ctx, sx: number, sy: number): void
export function drawWeatherLayer(ctx, weather: Weather, frame: number): void
export function drawLightLayer(ctx, minutes: number, weather: Weather): void
```

---

## src/renderer/*

`main.ts` owns the frame loop, the integer-scaled canvas, the scene stack and persistence.
`scenes/` holds `world.ts` (farm + HUD + belt), `shop.ts`, `inventory.ts`, `sleep.ts`,
`title.ts`, `help.ts`. `announce.ts` mirrors state changes into a visually hidden live
region for screen readers.

Controls, which the help scene must document:

| Input | Does |
|---|---|
| Arrows / WASD | Walk, and face that way |
| Space / Enter | Use the held tool on the faced tile |
| 1 – 7 | Pick hoe, can, seeds, hand, axe, sprinkler, fertilizer |
| Q / E | Cycle the selected seed |
| B | Shop | 
| I | Bag |
| N | Sleep |
| H / F1 | Help |
| M | Mute |
| Esc | Close the top panel |

## electron/

`main.ts` creates a 1280×896 window (4× logical) with `contextIsolation`, `nodeIntegration`
off and a strict CSP, loads the Vite dev server when `VITE_DEV_SERVER_URL` is set and the
built `dist/index.html` otherwise, and handles `save:read` / `save:write` / `save:clear` IPC
against `app.getPath('userData')/save.json`. `preload.ts` exposes exactly that as
`window.sprout`.
