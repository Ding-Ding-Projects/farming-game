# Progression contract — experience, storage and land

The third pillar alongside `docs/GAMEPLAY.md` and `docs/ECONOMY.md`. Same purity rule:
`src/game/progression.ts` is deterministic and clock-free.

Without this, a player with enough gold buys everything on day three and the game has no
shape. Levels pace the unlocks; storage and land pace the scale.

## 1. Experience and levels

Experience is earned for **doing**, not for owning:

| Action | XP |
|---|---|
| Harvest a crop | 2 per unit |
| Collect animal produce | 5 |
| Finish a machine job | 8 + 2 per ingredient |
| Fulfil a delivery order | 40 |
| Fulfil a boat crate | 150 |
| Clear a rock or log | 3 |
| Place a building | 25 |

Levels use a smooth curve — roughly `100 × level^1.4` to the next — and the ladder runs to
**at least 100 levels**. Each level grants a gold gift, and every level up to 100 unlocks
something real.

**One hundred levels only works if there are one hundred things to unlock.** That is why
`docs/CATALOG.md` exists: 26 crops, 14 trees, 12 animals, 30 factories, 20 buildings and 120
products. Count them and the ladder fills itself with room to spare. A level that unlocks
nothing is a defect — if the content runs out before 100, add content, do not pad the curve.

**Unlocks gate the shop.** Anything the player has not reached shows greyed with its required
level stated plainly, never hidden. Seeing what is coming is half of what makes a level feel
earned.

### Ladder shape

| Band | Roughly unlocks |
|---|---|
| 1–10 | The staple crops, the Coop, the Feed Mill, the Silo, the roadside stall |
| 11–25 | The Barn, Dairy, Mill, Bakery, the first trees, storage expansions |
| 26–45 | Loom and Sewing, Juice Press, Sugar Mill, Jam Maker, tier-2 buildings, the Apiary |
| 46–65 | BBQ, Soup, Salad, Sauce, Pasta, the Pond, the Greenhouse, mid trees |
| 66–85 | Ice Cream, Candy, Chocolate, Coffee, Tea, the Mine and Smelter, tier-3 buildings |
| 86–100 | The Keg, the deep four-step chains, the last regions, the prestige buildings |

Past 100 the curve continues and levels still grant gold and materials, so a long-running
farm is never capped — it simply stops unlocking new kinds of thing.

## 2. Storage

Two stores, both capped, both expandable. A cap the player runs into is the moment the game
asks them to make a choice, so the caps start genuinely tight.

| Store | Holds | Starting cap |
|---|---|---|
| **Silo** | Crops, seeds, hay | 150 |
| **Barn store** | Animal produce, artisan goods, materials | 200 |

Expanding either takes gold **and materials** — planks, bolts and screws, which are not
purchasable. They come from clearing land, from boat crates, and as rewards for delivery
orders. That is the loop: clearing land yields materials, materials expand storage, storage
lets you hold more of what the land produces.

An expansion adds 25 capacity and costs progressively more of each material. When a store is
full, the UI says which store, what is being refused and what the player might sell or use —
never a silent drop, and never a harvest that quietly evaporates.

## 3. Land

The valley starts largely unusable. Beyond the tilled starting plot it is rock, log and
weed, and past the fence it is not yours yet.

- **Clearing** a rock, log or weed costs energy and yields a material: stone, wood or fibre,
  with an occasional plank, bolt or screw.
- **Expansion plots** — the farm is divided into regions. Each is bought with gold **and** a
  land deed, deeds coming from boat crates and level rewards. Buying a region reveals it and
  makes its tiles clearable.
- Cleared land is the constraint everything else competes for: crop plots, buildings,
  machines and the stall all want the same ground. That competition is the point, and it is
  why free-form placement matters.

## 4. New state

```ts
progression: {
  level: number
  xp: number
  unlockedRegions: string[]
  materials: Record<MaterialId, number>
  siloCap: number
  barnCap: number
}
```

## 5. Verbs

```ts
export function grantXp(state, amount: number, source: XpSource): { state: GameState; leveled: number[] }
export function isUnlocked(state, thing: UnlockId): boolean
export function requiredLevel(thing: UnlockId): number
export function storeSpace(state, store: StoreId): { used: number; cap: number }
export function expandStore(state, store: StoreId): ActionResult
export function buyRegion(state, regionId: string): ActionResult
```

`addItem` must consult `storeSpace` and refuse a deposit that would exceed the cap, returning
a refusal that names the store and the shortfall. Every caller has to handle a full store —
including the overnight pass, where a machine finishing into a full barn must hold its output
in the machine and say so in the morning report rather than destroying it.

## 6. Balance intent

- The first storage wall should arrive in the first season, and be solvable by selling rather
  than only by expanding.
- Levels should never be the *only* thing gating progress — gold and materials matter too, so
  a player can push on any of three axes.
- Reaching the Keg should feel like an achievement in the second year, not a formality in the
  first.
