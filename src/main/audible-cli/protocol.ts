import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { getAudioPath, getCoverPath } from './media'

export const MEDIA_SCHEME = 'audible-media'

// Must be called before the app `ready` event.
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        bypassCSP: true
      }
    }
  ])
}

function contentTypeFor(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.m4b') || lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

// Parse an HTTP Range header of the form "bytes=start-end" against a known size.
function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header) return null
  const match = header.match(/bytes=(\d*)-(\d*)/)
  if (!match) return null
  const [, rawStart, rawEnd] = match
  let start = rawStart ? Number(rawStart) : 0
  let end = rawEnd ? Number(rawEnd) : size - 1
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (start > end || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
}

// Must be called after the app is ready. Serves decrypted audio and cover art
// from the downloads dir with proper HTTP range support so the <audio> element
// can seek.
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const kind = url.host // "media" | "cover"
    const asin = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!asin) return new Response('Not found', { status: 404 })

    let filePath: string | undefined
    if (kind === 'media') filePath = getAudioPath(asin)
    else if (kind === 'cover') filePath = await getCoverPath(asin)
    if (!filePath) return new Response('Not found', { status: 404 })

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) return new Response('Not found', { status: 404 })

    const size = fileStat.size
    const type = contentTypeFor(filePath)
    const range = parseRange(request.headers.get('range'), size)

    if (range) {
      const { start, end } = range
      const stream = createReadStream(filePath, { start, end })
      const body = Readable.toWeb(stream) as unknown as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }

    const stream = createReadStream(filePath)
    const body = Readable.toWeb(stream) as unknown as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      }
    })
  })
}
