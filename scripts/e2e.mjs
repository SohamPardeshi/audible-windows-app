// End-to-end smoke test driving the real Electron app via Playwright.
// Verifies: auth auto-import, library render, download, decrypt, playback,
// chapters, and 30s skip. Run with: node scripts/e2e.mjs
import { _electron as electron } from 'playwright-core'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { rmSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const SHORT_ASIN = 'B0716H7M7K' // "The Egg and Other Stories" by Andy Weir, ~77 min
const log = (...a) => console.log('[e2e]', ...a)

// Clear any explicit sign-out marker so the app auto-imports auth for the test.
// (A real user sign-out writes this; it would otherwise block auto-import.)
try {
  const marker = join(process.env.APPDATA || '', 'audible-desktop', '.signed-out')
  rmSync(marker, { force: true })
} catch {
  // ignore
}

function fail(msg) {
  console.error('[e2e] FAIL:', msg)
  process.exitCode = 1
}

const app = await electron.launch({
  args: [projectRoot],
  cwd: projectRoot
})

try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')

  win.on('console', (m) => {
    if (m.type() === 'error') log('renderer error:', m.text())
  })

  // 1. Auth should auto-import -> library renders (not the login screen).
  log('waiting for library to load…')
  const loginVisible = await win.locator('.login-card').count()
  if (loginVisible) {
    // Auth not imported; that is still a valid state but we cannot continue.
    fail('login screen shown — expected auto-imported auth')
    throw new Error('not authenticated')
  }

  await win.waitForSelector('.book-card', { timeout: 60000 })
  const cardCount = await win.locator('.book-card').count()
  log('library cards rendered:', cardCount)
  if (cardCount < 1) fail('no book cards rendered')

  // 2. Filter to the short book and download it.
  await win.fill('.search-input', 'The Egg and Other Stories')
  await win.waitForTimeout(300)
  const card = win.locator('.book-card', { hasText: 'The Egg and Other Stories' }).first()
  await card.waitFor({ timeout: 10000 })

  const alreadyReady = await card.locator('button', { hasText: 'Play' }).count()
  if (!alreadyReady) {
    log('starting download…')
    await card.locator('button', { hasText: 'Download' }).click()
    // Wait for the Play button to appear (download + decrypt complete).
    await card.locator('button', { hasText: 'Play' }).waitFor({ timeout: 240000 })
  }
  log('book is downloaded and ready')

  // 3. Play it.
  await card.locator('button', { hasText: 'Play' }).click()
  await win.waitForSelector('.player-fs', { timeout: 10000 })
  log('player opened')

  // Wait for audio metadata + advance a little.
  await win.waitForTimeout(2500)
  const state = await win.evaluate(() => {
    const audio = document.querySelector('audio')
    return audio
      ? { duration: audio.duration, currentTime: audio.currentTime, paused: audio.paused, src: audio.currentSrc }
      : null
  })
  log('audio state:', JSON.stringify(state))
  if (!state || !state.src) fail('audio element has no source')
  if (!state || !(state.duration > 0)) fail('audio duration not detected')

  // Ensure it is actually progressing.
  await win.waitForTimeout(2500)
  const t2 = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  log('currentTime after wait:', t2)
  if (!(t2 > 0)) fail('playback did not advance')

  // 4. Skip forward 30s, then back 30s.
  const before = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  await win.locator('button[title="Forward 30 seconds"]').click()
  await win.waitForTimeout(600)
  const after = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  log(`skip forward: ${before.toFixed(1)} -> ${after.toFixed(1)}`)
  if (!(after - before > 20)) fail('forward skip did not advance ~30s')

  const beforeBack = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  await win.locator('button[title="Back 30 seconds"]').click()
  await win.waitForTimeout(600)
  const afterBack = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  log(`skip back: ${beforeBack.toFixed(1)} -> ${afterBack.toFixed(1)}`)
  if (!(beforeBack - afterBack > 20)) fail('back skip did not rewind ~30s')

  // 5. Chapters available and panel opens.
  const chapterBtn = win.locator('button', { hasText: 'Chapters' })
  const hasChapters = await chapterBtn.count()
  log('chapters button present:', !!hasChapters)
  if (hasChapters) {
    await chapterBtn.click()
    await win.waitForSelector('.player-fs-chapters', { timeout: 5000 })
    const chapterItems = await win.locator('.chapter-item').count()
    log('chapter items listed:', chapterItems)
    if (chapterItems < 1) fail('chapter panel opened but listed no chapters')
  }

  // 6. Minimizing keeps playback going in a mini-player, and position persists.
  await win.evaluate(() => {
    const a = document.querySelector('audio')
    if (a) a.currentTime = 120
  })
  await win.waitForTimeout(800)
  await win.locator('.player-fs-back').click()
  await win.waitForSelector('.mini-player', { timeout: 5000 })
  log('minimized to mini-player')
  // Audio should NOT have reset — same element keeps playing.
  await win.waitForTimeout(1500)
  const miniTime = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  log('mini-player currentTime:', miniTime.toFixed(1))
  if (!(miniTime > 118)) fail('playback did not continue in mini-player')
  // Expanding from the mini-player returns to the full-screen view.
  await win.locator('.mini-open').click()
  await win.waitForSelector('.player-fs', { timeout: 10000 })
  await win.waitForTimeout(1000)
  const resumed = await win.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
  log('resumed position:', resumed.toFixed(1))
  if (!(resumed > 118)) fail('playback position was not preserved across minimize/expand')

  log(process.exitCode ? 'COMPLETED WITH FAILURES' : 'ALL CHECKS PASSED')
} catch (err) {
  fail(err?.message || String(err))
} finally {
  await app.close()
}
