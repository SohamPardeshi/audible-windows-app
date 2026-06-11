import { join } from 'path'
import { mkdir, readdir, rename, rm, readFile, stat } from 'fs/promises'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { DownloadEvent, LibraryBook, LocalBook } from '@shared/types'
import { spawnCli, isNetworkError, getActivationBytes } from './cli'
import { ensureDownloadsDir, getDownloadsDir, upsertLocalBook, pullServerPosition } from './store'
import { extractKeyIv, decryptAaxc, decryptAax, readChaptersAndDuration } from './decrypt'

type Emit = (event: DownloadEvent) => void

const active = new Map<string, ChildProcessWithoutNullStreams>()

export function cancelDownload(asin: string): void {
  const child = active.get(asin)
  if (child) {
    try {
      child.kill()
    } catch {
      // ignore
    }
    active.delete(asin)
  }
}

async function findByExt(dir: string, exts: string[]): Promise<string | undefined> {
  const entries = await readdir(dir).catch(() => [] as string[])
  const lowerExts = exts.map((e) => e.toLowerCase())
  const match = entries.find((name) => lowerExts.some((e) => name.toLowerCase().endsWith(e)))
  return match ? join(dir, match) : undefined
}

interface DownloadResult {
  code: number
  networkError: boolean
}

// Run `audible download` for a single ASIN into a temp dir, emitting coarse
// progress. `formatFlag` selects the encrypted format (`--aaxc` or `--aax`).
function runDownload(
  asin: string,
  tmpDir: string,
  formatFlag: string,
  emit: Emit
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const child = spawnCli([
      '-v',
      'error',
      'download',
      '-a',
      asin,
      formatFlag,
      '--cover',
      '--cover-size',
      '500',
      '-q',
      'best',
      '-o',
      tmpDir,
      '--no-confirm',
      '--ignore-errors'
    ])
    active.set(asin, child)

    let output = ''
    const onData = (chunk: string): void => {
      output += chunk
      const pct = chunk.match(/(\d{1,3})%\|/)
      if (pct) {
        emit({ type: 'progress', asin, state: 'downloading', percent: Number(pct[1]) })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', reject)
    child.on('close', (code) => {
      active.delete(asin)
      resolve({ code: code ?? -1, networkError: isNetworkError(output) })
    })
  })
}

interface DownloadedFiles {
  aaxc?: string
  voucher?: string
  aax?: string
}

async function detectFiles(tmpDir: string): Promise<DownloadedFiles> {
  return {
    aaxc: await findByExt(tmpDir, ['.aaxc']),
    voucher: await findByExt(tmpDir, ['.voucher']),
    aax: await findByExt(tmpDir, ['.aax'])
  }
}

// Download a single book, trying AAXC first (high quality, newer titles) and
// falling back to legacy AAX for older titles that are not offered as AAXC.
// Each format attempt is retried a few times on transient network failures.
async function fetchEncrypted(
  asin: string,
  tmpDir: string,
  emit: Emit
): Promise<DownloadedFiles> {
  const formats = ['--aaxc', '--aax']
  let sawNetworkError = false

  for (const fmt of formats) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await rm(tmpDir, { recursive: true, force: true })
      await mkdir(tmpDir, { recursive: true })

      const result = await runDownload(asin, tmpDir, fmt, emit)
      const files = await detectFiles(tmpDir)

      if ((files.aaxc && files.voucher) || files.aax) return files

      if (result.networkError) {
        sawNetworkError = true
        emit({
          type: 'progress',
          asin,
          state: 'downloading',
          message: `Network hiccup — retrying (${attempt}/3)…`
        })
        continue
      }
      // Not a network problem: this format is unsupported for the title, so
      // move on to the next format rather than retrying.
      break
    }
  }

  if (sawNetworkError) {
    throw new Error('Network interrupted during download. Please try again.')
  }
  throw new Error('This title is not available to download in a supported format.')
}

export async function downloadBook(book: LibraryBook, emit: Emit): Promise<LocalBook> {
  const { asin } = book
  await ensureDownloadsDir()
  const downloadsDir = getDownloadsDir()
  const tmpDir = join(downloadsDir, `.tmp-${asin}`)
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })

  const base: LocalBook = {
    asin,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors.map((a) => a.name),
    narrators: book.narrators,
    coverUrl: book.coverUrl,
    state: 'downloading',
    addedAt: Date.now(),
    chapters: []
  }
  await upsertLocalBook(base)

  try {
    emit({ type: 'progress', asin, state: 'downloading', percent: 0 })
    const files = await fetchEncrypted(asin, tmpDir, emit)

    emit({ type: 'progress', asin, state: 'decrypting', message: 'Decrypting…' })
    await upsertLocalBook({ ...base, state: 'decrypting' })

    const m4bPath = join(downloadsDir, `${asin}.m4b`)
    if (files.aaxc && files.voucher) {
      const voucherJson = JSON.parse(await readFile(files.voucher, 'utf-8'))
      const keyIv = extractKeyIv(voucherJson)
      await decryptAaxc(files.aaxc, m4bPath, keyIv)
    } else if (files.aax) {
      const activationBytes = await getActivationBytes()
      await decryptAax(files.aax, m4bPath, activationBytes)
    } else {
      throw new Error('Download did not produce the expected encrypted files.')
    }

    const { chapters, durationSec } = await readChaptersAndDuration(m4bPath)

    // Move the cover next to the audio if one was downloaded.
    const coverFile = await findByExt(tmpDir, ['.jpg', '.jpeg', '.png'])
    let localCover: string | undefined
    if (coverFile) {
      const ext = coverFile.slice(coverFile.lastIndexOf('.'))
      const dest = join(downloadsDir, `${asin}${ext}`)
      await rename(coverFile, dest).catch(() => undefined)
      localCover = dest
    }

    const sizeBytes = (await stat(m4bPath).catch(() => null))?.size

    const done: LocalBook = {
      ...base,
      state: 'ready',
      chapters,
      durationSec,
      sizeBytes,
      // Prefer the locally cached cover (served via the media protocol so it
      // works offline), falling back to the remote URL.
      coverUrl: localCover ? `audible-media://cover/${asin}` : book.coverUrl
    }
    await upsertLocalBook(done)
    await rm(tmpDir, { recursive: true, force: true })

    // Pull Audible's recorded position so a book already started elsewhere
    // resumes at the right spot (best-effort; ignore network/auth failures).
    await pullServerPosition(asin).catch(() => undefined)

    emit({ type: 'done', asin, book: done })
    return done
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    const message = err instanceof Error ? err.message : 'Download failed.'
    await upsertLocalBook({ ...base, state: 'error' })
    emit({ type: 'error', asin, error: message })
    throw err
  }
}
