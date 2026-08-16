# Content catalogue

The required **breadth** of the game. `docs/GAMEPLAY.md` defines how the systems work; this
defines how much of the world exists. A lane implementing this fills in exact numbers, but
may not drop a row — if something here is genuinely unbalanceable, say so in the report
rather than quietly omitting it.

Every entry needs: a unique id, a display name, a level requirement, real economics, and
distinct art. **No two entries may share a silhouette or a fruit colour.**

## 1. Field crops — 26

Fast staples through slow cash crops. Season-gated per `docs/GAMEPLAY.md`.

| | |
|---|---|
| **Spring** | wheat, carrot, potato, lettuce, radish, cabbage, onion, strawberry, peas |
| **Summer** | corn, tomato, cucumber, chilli, sugarcane, cotton, melon, soybean, pepper |
| **Autumn** | pumpkin, squash, garlic, spinach, rice, indigo |
| **Winter** | winter root, snow cabbage |
| **Multi-season** | wheat (spring + autumn), corn (summer + autumn) |

Wheat and corn are the backbone — cheap, fast, and the input to half the chains. They should
be individually unprofitable to sell raw and essential to hold.

## 2. Trees and bushes — 14

Planted once, fruit repeatedly on a cycle, never need replanting. They occupy a tile
permanently, which is the trade.

apple, cherry, peach, orange, lemon, plum, olive, coconut, banana, mango, cacao, coffee,
blackberry bush, raspberry bush.

## 3. Animals — 12

Per `docs/GAMEPLAY.md` §2, extended.

| Animal | Building | Produces |
|---|---|---|
| Chicken | Coop | Egg |
| Duck | Coop | Duck egg, feather |
| Goose | Coop | Goose egg, down |
| Turkey | Coop | Turkey egg |
| Rabbit | Coop | Angora wool |
| Cow | Barn | Milk |
| Goat | Barn | Goat milk |
| Sheep | Barn | Wool |
| Pig | Barn | Bacon, truffle |
| Bee | Apiary | Honeycomb |
| Fish | Pond | Fish, roe |
| Horse | Stable | Cannot be sold; speeds movement |

## 4. Factories — 30

Every one takes a recipe of one or more ingredients and holds a queue.

| # | Factory | Makes |
|---|---|---|
| 1 | Feed Mill | Animal feed |
| 2 | Sawmill | Planks, from wood |
| 3 | Mill | Flour, cornmeal |
| 4 | Dairy | Cream, butter, cheese, yoghurt |
| 5 | Bakery | Bread, cookies, cake, donut, pizza |
| 6 | Pie Oven | Fruit pies, savoury pies |
| 7 | Sugar Mill | Sugar, syrup, molasses |
| 8 | Jam Maker | Jams, named for the fruit |
| 9 | Juice Press | Juices, smoothies |
| 10 | Oil Press | Cooking oil, olive oil |
| 11 | Loom | Cloth |
| 12 | Sewing Machine | Clothing, hats, bags |
| 13 | Dye Vat | Dyes, from indigo and flowers |
| 14 | BBQ Grill | Skewers, roasts, bacon and eggs |
| 15 | Soup Kitchen | Soups, stews |
| 16 | Salad Bar | Salads |
| 17 | Sauce Maker | Pasta sauce, ketchup, salsa |
| 18 | Pasta Maker | Pasta, noodles |
| 19 | Popcorn Pot | Popcorn, kettle corn |
| 20 | Ice Cream Maker | Ice creams, sorbets |
| 21 | Candy Machine | Sweets, toffee, lollipops |
| 22 | Chocolate Works | Chocolate bars, truffles |
| 23 | Coffee Kiosk | Coffee, espresso, latte |
| 24 | Tea House | Teas, infusions |
| 25 | Honey Extractor | Honey, beeswax |
| 26 | Candle Maker | Candles, from beeswax |
| 27 | Soap Maker | Soaps, from oil and lye |
| 28 | Preserves Jar | Pickles, preserves |
| 29 | Keg | Wines, ciders |
| 30 | Smelter | Metal bars, from ore |

## 5. Products — 120 minimum

Every factory carries **at least three** recipes, and the catalogue must reach 120 distinct
sellable products. Chains run three to four deep:

```
wheat -> flour -> bread -> sandwich
milk  -> cream -> butter -> cake
wool  -> cloth -> clothing
sugarcane -> syrup -> sugar -> candy
cacao -> chocolate -> truffles
olive -> olive oil -> soap
```

A product's price must exceed the sum of its inputs' prices by a real margin, and a deeper
chain must pay better per unit of input than a shallow one. Otherwise the chain is decoration.

## 6. Materials — 12

Not purchasable. They come from clearing, orders and crates, and they gate expansion.

wood, stone, fibre, plank, bolt, screw, nail, duct tape, land deed, mallet, axe, saw.

## 7. Buildings — 20

Coop ×3 tiers, Barn ×3 tiers, Silo, Barn store, Apiary, Pond, Stable, Roadside stall,
Well, Greenhouse, Mine, Sawmill yard, Bakery building, Workshop, Farmhouse upgrade.

## 8. Coverage rules

- Every factory must be **reachable and useful** — a factory nothing feeds is a defect.
- Every crop must be an input to at least one recipe, or be a top-tier cash crop sold raw.
- Every animal product must feed at least one chain.
- The Almanac renders this entire catalogue from the real data at runtime. Nothing here is
  retyped into documentation; if the numbers drift, the documentation was wrong by design.
