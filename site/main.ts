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

async function loadRelease(): Promise<void> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return
    applyRelease((await response.json()) as Release)
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
