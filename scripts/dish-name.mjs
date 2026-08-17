/**
 * Picks this release's dim-sum code name from the public catalogue.
 *
 * The catalogue is fetched at release time and the photo is linked by its public
 * URL. Nothing is copied into this repository, no duplicate asset is attached, and
 * no dish is invented — if the catalogue cannot be reached, this exits non-zero and
 * says so rather than making one up.
 *
 *   node scripts/dish-name.mjs            # markdown for the release notes
 *   node scripts/dish-name.mjs --json     # machine-readable
 *   node scripts/dish-name.mjs --version 1.2.0
 */
import { readFileSync } from 'node:fs'

const CATALOG =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json'

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const version = flag('version') ?? JSON.parse(readFileSync('package.json', 'utf8')).version

/** Stable 32-bit hash, so a given version always names the same dish. */
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * The photos are published as GitHub release assets, split into volumes. This
 * mirrors the catalogue site's own tag calculation so the URL resolves.
 */
function photoUrl(dish) {
  const n = Number(String(dish.id ?? '').match(/(\d+)$/)?.[1] ?? 1)
  const part = n <= 995 ? 1 : Math.floor((n - 996) / 990) + 2
  const tag = part === 1 ? 'catalog-v1' : `catalog-v1-part-${String(part).padStart(3, '0')}`
  const file = String(dish.image?.path ?? '').split('/').pop()
  return `https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${tag}/${file}`
}

const response = await fetch(CATALOG, { headers: { Accept: 'application/json' } })
if (!response.ok) {
  console.error(`could not read the public dim-sum catalogue: HTTP ${response.status}`)
  console.error('refusing to invent a dish name')
  process.exit(1)
}

const catalog = await response.json()
const dishes = (catalog.dishes ?? []).filter((d) => d?.name?.en && d?.image?.path)
if (dishes.length === 0) {
  console.error('the public catalogue returned no usable dishes; refusing to invent one')
  process.exit(1)
}

const dish = dishes[hash(`sprout-hollow@${version}`) % dishes.length]
const url = photoUrl(dish)
const name = dish.name.en
const zh = dish.name.zhHant ?? ''

if (argv.includes('--json')) {
  console.log(JSON.stringify({ version, id: dish.id, name, zhHant: zh, jyutping: dish.jyutping, url }, null, 2))
} else {
  console.log(`This release is **${name}**${zh ? ` · ${zh}` : ''}${dish.jyutping ? ` (${dish.jyutping})` : ''}.`)
  console.log('')
  console.log(`[![${name}](${url})](${url})`)
  console.log('')
  console.log(
    `Every release takes its code name from the public [dim sum catalogue](https://github.com/Ding-Ding-Projects/dim-sum-photos). ` +
      `The photo is linked from that catalogue, not copied here.`,
  )
}
