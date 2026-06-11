import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { LibraryBook } from '@shared/types'
import { getConfigDir } from './paths'
import { runCliWithRetry, isNetworkError } from './cli'

// Shape of a single item in audible-cli's flat `library export -f json` output.
interface RawLibraryItem {
  asin: string
  title: string
  subtitle?: string
  authors?: string
  narrators?: string
  cover_url?: string
  runtime_length_min?: number | string
  release_date?: string
  purchase_date?: string
  percent_complete?: number | string
  is_finished?: boolean
  series_title?: string
  series_sequence?: string
}

function splitNames(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function mapItem(raw: RawLibraryItem): LibraryBook {
  const percent = toNumber(raw.percent_complete)
  const series =
    raw.series_title && raw.series_title.trim()
      ? [{ title: raw.series_title.trim(), sequence: raw.series_sequence?.trim() || undefined }]
      : undefined

  return {
    asin: raw.asin,
    title: raw.title,
    subtitle: raw.subtitle?.trim() || undefined,
    authors: splitNames(raw.authors).map((name) => ({ name })),
    narrators: splitNames(raw.narrators),
    coverUrl: raw.cover_url?.trim() || undefined,
    runtimeLengthMin: toNumber(raw.runtime_length_min),
    releaseDate: raw.release_date?.trim() || undefined,
    purchaseDate: raw.purchase_date?.trim() || undefined,
    percentComplete: percent,
    isFinished: Boolean(raw.is_finished),
    series
  }
}

// Export the full library through audible-cli to a JSON file, then read and map
// it. The CLI handles pagination internally, so this returns every owned title.
export async function exportLibrary(): Promise<LibraryBook[]> {
  const outFile = join(getConfigDir(), 'library-export.json')
  const result = await runCliWithRetry([
    '-v',
    'error',
    'library',
    'export',
    '-f',
    'json',
    '-o',
    outFile
  ])

  if (result.code !== 0) {
    const combined = result.stderr + result.stdout
    if (isNetworkError(combined)) {
      throw new Error(
        'Network connection to Audible was interrupted. Please check your connection (or pause any VPN/antivirus HTTPS scanning) and try again.'
      )
    }
    const detail = (result.stderr || result.stdout).trim().split('\n').pop() || 'unknown error'
    throw new Error(`Failed to load library: ${detail}`)
  }

  const json = await readFile(outFile, 'utf-8')
  await unlink(outFile).catch(() => undefined)
  const items = JSON.parse(json) as RawLibraryItem[]
  return items.map(mapItem)
}
