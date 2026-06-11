import { runCliWithRetry } from './cli'

// Server-side "last position heard" sync with Audible. This lets the desktop
// app share its playback position with the official Audible apps and website,
// instead of keeping a position that only lives on this machine.
//
// Read:  GET  1.0/annotations/lastpositions?asins=<asin>
// Write: PUT  1.0/lastpositions/<asin>  body { acr, asin, position_ms }
//        (the acr comes from 1.0/content/<asin>/metadata?response_groups=content_reference)

export interface ServerPosition {
  positionSec: number
  // Epoch milliseconds the server last recorded a position for this book.
  updatedAt: number
}

// Audible returns timestamps like "2026-06-11 07:27:11.241" in UTC. Normalise
// to an ISO string so it parses as UTC rather than local time.
function parseAudibleDate(value: string | undefined): number {
  if (!value) return 0
  const iso = value.trim().replace(' ', 'T') + 'Z'
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

// Resolve after `ms` with `fallback` if `promise` has not settled yet, so a
// flaky network never blocks opening a book for more than a moment.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

async function fetchServerPosition(asin: string): Promise<ServerPosition | null> {
  const result = await runCliWithRetry(
    ['-v', 'error', 'api', '1.0/annotations/lastpositions', '-p', `asins=${asin}`],
    3
  )
  if (result.code !== 0) return null
  try {
    const data = JSON.parse(result.stdout) as {
      asin_last_position_heard_annots?: {
        asin: string
        last_position_heard?: { position_ms?: number; last_updated?: string; status?: string }
      }[]
    }
    const annot = data.asin_last_position_heard_annots?.find((a) => a.asin === asin)
    const lph = annot?.last_position_heard
    if (!lph || lph.status !== 'Exists') return null
    return {
      positionSec: (lph.position_ms ?? 0) / 1000,
      updatedAt: parseAudibleDate(lph.last_updated)
    }
  } catch {
    return null
  }
}

// Best-effort fetch of the server position. Returns null on any failure (signed
// out, network down, never listened) so callers fall back to the local value.
export function getServerPosition(asin: string): Promise<ServerPosition | null> {
  return withTimeout(fetchServerPosition(asin), 5000, null)
}

// The lastpositions endpoint accepts a comma-separated `asins` list, but rejects
// long requests (a few dozen ids), so fetch in modest chunks.
const POSITIONS_BATCH_SIZE = 25

async function fetchServerPositionsChunk(
  asins: string[]
): Promise<Record<string, ServerPosition>> {
  const result = await runCliWithRetry(
    ['-v', 'error', 'api', '1.0/annotations/lastpositions', '-p', `asins=${asins.join(',')}`],
    3
  )
  const map: Record<string, ServerPosition> = {}
  if (result.code !== 0) return map
  try {
    const data = JSON.parse(result.stdout) as {
      asin_last_position_heard_annots?: {
        asin: string
        last_position_heard?: { position_ms?: number; last_updated?: string; status?: string }
      }[]
    }
    for (const annot of data.asin_last_position_heard_annots ?? []) {
      const lph = annot.last_position_heard
      if (!lph || lph.status !== 'Exists') continue
      const positionSec = (lph.position_ms ?? 0) / 1000
      // Skip zero positions so we never overwrite a real local position with a
      // "started but at the very beginning" server entry.
      if (positionSec <= 0) continue
      map[annot.asin] = { positionSec, updatedAt: parseAudibleDate(lph.last_updated) }
    }
  } catch {
    // Ignore malformed chunk output and return whatever parsed.
  }
  return map
}

// Best-effort fetch of server positions for many books at once. Returns a map of
// asin → position for the books that have a non-zero recorded position. Missing
// or failed lookups are simply absent from the map.
export async function getServerPositions(
  asins: string[]
): Promise<Record<string, ServerPosition>> {
  const out: Record<string, ServerPosition> = {}
  for (let i = 0; i < asins.length; i += POSITIONS_BATCH_SIZE) {
    const chunk = asins.slice(i, i + POSITIONS_BATCH_SIZE)
    const map = await withTimeout(fetchServerPositionsChunk(chunk), 8000, {})
    Object.assign(out, map)
  }
  return out
}

// The acr (audio content reference) is stable per book, so cache it.
const acrCache = new Map<string, string>()

async function getAcr(asin: string): Promise<string | null> {
  const cached = acrCache.get(asin)
  if (cached) return cached
  const result = await runCliWithRetry([
    '-v',
    'error',
    'api',
    `1.0/content/${asin}/metadata`,
    '-p',
    'response_groups=content_reference'
  ])
  if (result.code !== 0) return null
  try {
    const acr = (
      JSON.parse(result.stdout) as {
        content_metadata?: { content_reference?: { acr?: string } }
      }
    ).content_metadata?.content_reference?.acr
    if (acr) {
      acrCache.set(asin, acr)
      return acr
    }
  } catch {
    // fall through
  }
  return null
}

// Upload the current position to Audible so other devices pick it up. Returns
// true on success; failures are non-fatal (the local position is still saved).
export async function putServerPosition(asin: string, positionSec: number): Promise<boolean> {
  const acr = await getAcr(asin)
  if (!acr) return false
  const body = JSON.stringify({
    acr,
    asin,
    position_ms: Math.max(0, Math.round(positionSec * 1000))
  })
  const result = await runCliWithRetry([
    '-v',
    'error',
    'api',
    '-m',
    'put',
    `1.0/lastpositions/${asin}`,
    '-b',
    body
  ])
  return result.code === 0
}
