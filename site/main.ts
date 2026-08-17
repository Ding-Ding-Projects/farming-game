/**
 * Landing page behaviour.
 *
 * The wordmark is drawn with the game's own 7x9 body bitmap face rather than a web font,
 * so the page and the game are literally set in the same type. It reads the face straight
 * out of `src/engine/font.ts`, so the framebuffer doubling flowed through here with no
 * hand editing. Everything else is progressive enhancement: with scripting off, the page
 * still describes the game and every download button still resolves to the latest release
 * on GitHub.
 */
import { drawText, textWidth, FONT_H } from '../src/engine/font'
import { PAL } from '../src/engine/palette'

const REPO = 'Ding-Ding-Projects/farming-game'

/* ---------------------------------------------------------------- wordmark */

function paintWordmark(canvas: HTMLCanvasElement): void {
  const lines = ['SPROUT', 'HOLLOW']
  const scale = window.innerWidth < 640 ? 6 : 10
  const gap = 2
  const logicalW = Math.max(...lines.map((line) => textWidth(line)))
  const logicalH = lines.length * FONT_H + (lines.length - 1) * gap

  // One extra pixel each side for the hard shadow.
  canvas.width = (logicalW + 1) * scale
  canvas.height = (logicalH + 1) * scale
  canvas.style.width = `${canvas.width}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  lines.forEach((line, i) => {
    const x = Math.floor((logicalW - textWidth(line)) / 2)
    drawText(ctx, line, x, i * (FONT_H + gap), PAL.lantern, { shadow: PAL.ink })
  })
}

/* ------------------------------------------------------------- screenshots */

/** A shot that has not been captured yet should vanish, not show a broken icon. */
function hideMissingShots(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>('.shots img')) {
    img.addEventListener('error', () => {
      img.closest('figure')?.setAttribute('hidden', '')
    })
    if (img.complete && img.naturalWidth === 0) {
      img.closest('figure')?.setAttribute('hidden', '')
    }
  }
}

/* ----------------------------------------------------------------- release */

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  published_at: string
  assets: ReleaseAsset[]
}

// Windows only, deliberately. See the release workflow.
const PLATFORMS = [
  { id: 'win', test: (n: string) => n.endsWith('.exe'), label: 'Installer' },
] as const

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function applyRelease(release: Release): void {
  for (const platform of PLATFORMS) {
    const asset = release.assets.find((a) => platform.test(a.name.toLowerCase()))
    if (!asset) continue

    const link = document.getElementById(`dl-${platform.id}`)
    const sub = document.getElementById(`sub-${platform.id}`)
    if (link instanceof HTMLAnchorElement) link.href = asset.browser_download_url
    if (sub) sub.textContent = `${platform.label} — ${megabytes(asset.size)}`
  }

  const line = document.getElementById('release-line')
  if (!line) return

  const published = new Date(release.published_at)
  const when = Number.isNaN(published.valueOf())
    ? ''
    : ` — released ${published.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`
  line.textContent = `${release.tag_name}${when}. Free and open source. No account, no telemetry.`
}

/* ------------------------------------------------------- dim sum code name */

const CATALOG =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json'

interface Dish {
  id?: string
  name?: { en?: string; zhHant?: string }
  jyutping?: string
  image?: { path?: string; alt?: { en?: string } }
}

/** Must match scripts/dish-name.mjs exactly, or the site and the notes disagree. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** The photos are published as release assets, split into volumes by dish number. */
function photoUrl(dish: Dish): string {
  const n = Number(/(\d+)$/.exec(String(dish.id ?? ''))?.[1] ?? 1)
  const part = n <= 995 ? 1 : Math.floor((n - 996) / 990) + 2
  const tag = part === 1 ? 'catalog-v1' : `catalog-v1-part-${String(part).padStart(3, '0')}`
  const file = String(dish.image?.path ?? '').split('/').pop() ?? ''
  return `https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${tag}/${file}`
}

async function showDish(version: string): Promise<void> {
  const section = document.getElementById('dish-section')
  const nameEl = document.getElementById('dish-name')
  const photo = document.getElementById('dish-photo')
  const link = document.getElementById('dish-link')
  if (!section || !nameEl || !(photo instanceof HTMLImageElement) || !(link instanceof HTMLAnchorElement)) return

  try {
    const response = await fetch(CATALOG, { headers: { Accept: 'application/json' } })
    if (!response.ok) return
    const catalog = (await response.json()) as { dishes?: Dish[] }
    const dishes = (catalog.dishes ?? []).filter((d) => d?.name?.en && d?.image?.path)
    if (dishes.length === 0) return

    const dish = dishes[hash(`sprout-hollow@${version}`) % dishes.length]
    const zh = dish.name?.zhHant
    nameEl.textContent = zh ? `${dish.name?.en} · ${zh}` : (dish.name?.en ?? '')
    photo.src = photoUrl(dish)
    photo.alt = dish.image?.alt?.en ?? `Photograph of ${dish.name?.en ?? 'the dish'}`
    link.href = photoUrl(dish)
    // A dish whose photo has not been published yet should not leave a broken frame.
    photo.addEventListener('error', () => section.setAttribute('hidden', ''))
    section.removeAttribute('hidden')
  } catch {
    // Offline or rate-limited. The section simply stays hidden.
  }
}

async function loadRelease(): Promise<void> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return
    const release = (await response.json()) as Release
    applyRelease(release)
    void showDish(release.tag_name.replace(/^v/, ''))
  } catch {
    // Offline, rate-limited, or no release cut yet. The static links already point
    // at /releases/latest, so there is nothing to recover from.
  }
}

/* -------------------------------------------------------------------- boot */

const wordmark = document.getElementById('wordmark')
if (wordmark instanceof HTMLCanvasElement) {
  paintWordmark(wordmark)

  let last = window.innerWidth < 640
  window.addEventListener('resize', () => {
    const small = window.innerWidth < 640
    if (small !== last) {
      last = small
      paintWordmark(wordmark)
    }
  })
}

hideMissingShots()
void loadRelease()
