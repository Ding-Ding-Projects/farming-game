# Economy contract

Lives in `src/game/economy.ts` and `src/game/market.ts`, plus a Ledger surface in the shell.
Same purity rule as the rest of `src/game`: deterministic from `state.seed`, no clock, no
`Math.random`.

The goal is that **what you grow stops being the only decision**. When you sell, where you
sell, and whether you sell at all become decisions too.

## 1. Prices move

Every sellable good carries a base price and a live **supply index** starting at 1.0.

```
price = round(base × qualityMultiplier × supplyFactor × seasonalDemand × reputationBonus)
supplyFactor = clamp(1 / supplyIndex ^ elasticity, 0.4, 1.8)
```

- Selling `n` units raises that good's supply index. Dumping 200 parsnips tanks parsnips.
- The index **decays back toward 1.0** each day at a per-good recovery rate, so a flooded
  market heals over about a week.
- `elasticity` is per-good. Staples (parsnip, egg, milk) are stiff and barely move.
  Luxuries (wine, truffle, cheese) swing hard — the high-margin goods are also the volatile
  ones, which is the whole tension.
- The floor and ceiling are hard clamps. A price can never reach zero and never runs away.

## 2. Seasonal demand

A per-good, per-season multiplier in the 0.8–1.3 band. Wine and cheese sell high in winter;
fresh produce sells high at harvest. It is published in the Almanac — this is a system the
player is meant to plan around, not a hidden hand.

## 3. Market events

One roll per week, deterministic from the seed and the week number:

| Event | Effect |
|---|---|
| Bumper harvest | One crop's price collapses to 0.5× for 5 days |
| Shortage | One good spikes to 1.6× for 4 days |
| Festival | A whole category (produce, artisan, animal) lifts 1.3× for 3 days |
| Trade caravan | Every price +10 % for 2 days, and a rare seed appears in the shop |
| Quiet week | Nothing. Roughly a third of weeks, so events stay events |

Announced in the morning report the day they begin, and visible in the Ledger.

## 4. Five ways to sell

| Channel | Price | Cost |
|---|---|---|
| **Shipping bin** | Closing price that evening | None. Drop and forget. |
| **Town market** | +10 %, live price shown before committing | Travel time and energy |
| **Roadside stall** | **The player sets the price** | Stock sells over time, not instantly |
| **Delivery orders** | Agreed premium, immune to price swings | Quantity and deadline |
| **Boat crates** | Large multi-item premium | Several goods at once, long deadline |

The shipping bin is the safe default. The market rewards attention. The stall rewards
judgement. Orders reward planning — and only an accepted order protects you from a crash.

### The roadside stall

A building the player places, holding a handful of slots. Stock a slot with a quantity and
**name your own price**, anywhere from half to double the current market price.

- The closer to (or below) market, the faster it sells. Priced at double, it may sit all
  season. The sell rate is a published curve, not a hidden roll.
- Sales tick through the overnight pass, so a well-stocked stall is passive income earned by
  pricing well rather than by clicking.
- The stall is where a player *feels* the market: they have to form a view on what a thing is
  worth, and the market tells them if they were wrong.

### Delivery orders and boat crates

Two tiers of the same idea. A **delivery order** is one item type, a modest premium, a short
deadline — the bread and butter. A **boat crate** asks for three or four different goods in
quantity, pays a large premium plus a reputation bump, and gives a long deadline precisely
because it is meant to be *planned for*, not stumbled into.

Orders scale to what the player can actually produce. No crate asks for cheese before the
player owns a dairy.

## 5. Contracts

```ts
interface Contract {
  id: string
  item: ItemRef
  quantity: number
  minQuality: Quality
  pricePerUnit: number      // premium over base, fixed at issue
  issuedDay: number
  dueDay: number
  reputationReward: number
  reputationPenalty: number
}
```

Two or three are available at a time, refreshed as they are taken or expire, scaled to what
the player can actually produce — never a contract for truffles before the player owns a pig.
Accepting is a commitment: **failing one costs reputation**, so the refusal to over-commit is
itself a decision.

## 6. Reputation

`0..1000`, starting at 250. Rises on fulfilled contracts and steady trade, falls on failed
contracts and missed loan payments.

- Gates contract tier — the lucrative ones need standing.
- Applies a `reputationBonus` of 0.95× to 1.08× on every sale.
- Shown as a named rank, with the exact number beside it. Never a bare star rating.

## 7. Credit

Buildings are expensive on purpose, and a loan is how a first-year player gets a barn.

```ts
interface Loan { id: string; principal: number; outstanding: number; ratePerSeason: number; dueSeason: number }
```

- Borrowing limit scales with reputation and assets.
- Interest accrues at the **end of each season**, added to the outstanding balance.
- A missed payment costs reputation and raises the rate on that loan. There is no
  repossession and no game over — this is a farming game, not a foreclosure simulator.
- Repay any amount at any time from the Ledger.

## 8. Tax

An end-of-season levy on that season's **net** earnings, itemised in the seasonal report:
gross income, expenses, taxable amount, rate, amount due. The rate is flat and published.
Nothing here is a surprise deduction — a tax the player cannot predict is just a bug with a
story attached.

## 9. The Ledger tab

A shell tab, DOM, in the game's design language.

- **Price history** per good, with the current supply index and any active event marked.
- **Income and expenses** by source and by season.
- **Contracts** — available, accepted, completed, failed.
- **Loans** — outstanding, rate, next accrual, repay control.
- **Reputation** — current rank and what moved it.

Every table gets its own search field with its own anchored regex builder and a catalogue
entry, per `docs/SHELL-CONTRACT.md`. The whole ledger is exportable as JSON, CSV and
Markdown.

> **The price history is a chart.** The lane that builds it must invoke the `dataviz` skill
> before writing a line of chart code, and reconcile its guidance against `docs/GRAPHICS.md`
> — where the two differ on colour, the game palette wins, because a chart that does not
> look like the rest of the game is a worse chart here.

## 10. Balance intent

- Selling everything the instant it is harvested should be visibly worse than spreading it
  out, but never *punishing* — a player who ignores the whole system still finishes the year.
- Contracts should be the most profitable route for a player who plans, and the most costly
  for one who over-commits.
- A loan taken in year one to buy a barn should be repayable by the end of year two on
  competent play.
- No single good should be the answer. If wine is always correct, the keg is mispriced and
  the fix is the keg, not the wine.
