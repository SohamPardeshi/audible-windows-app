import { join } from 'path'
import { rm, access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import type { MediaInfo } from '@shared/types'
import { getDownloadsDir, getLocalBook, removeLocalBook } from './store'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getAudioPath(asin: string): string {
  return join(getDownloadsDir(), `${asin}.m4b`)
}

// Resolve the on-disk cover for an asin, trying common extensions.
export async function getCoverPath(asin: string): Promise<string | undefined> {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const candidate = join(getDownloadsDir(), `${asin}${ext}`)
    if (await exists(candidate)) return candidate
  }
  return undefined
}

export async function getMediaInfo(asin: string): Promise<MediaInfo> {
  const book = await getLocalBook(asin)
  if (!book || book.state !== 'ready') {
    throw new Error('This title is not downloaded yet.')
  }
  if (!(await exists(getAudioPath(asin)))) {
    throw new Error('The downloaded audio file is missing.')
  }
  return {
    asin,
    title: book.title,
    authors: book.authors,
    // Streamed by the registered audible-media protocol handler.
    src: `audible-media://media/${asin}`,
    coverUrl: book.coverUrl,
    durationSec: book.durationSec,
    chapters: book.chapters
  }
}

export async function deleteLocalBook(asin: string): Promise<void> {
  await removeLocalBook(asin)
  await rm(getAudioPath(asin), { force: true }).catch(() => undefined)
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    await rm(join(getDownloadsDir(), `${asin}${ext}`), { force: true }).catch(() => undefined)
  }
}
