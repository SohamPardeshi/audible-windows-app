import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import type { LocalBook, PlaybackPosition } from '@shared/types'
import { getServerPosition, getServerPositions, putServerPosition } from './sync'

// Directory holding decrypted audiobooks and their artwork.
export function getDownloadsDir(): string {
  return join(app.getPath('userData'), 'downloads')
}

function manifestPath(): string {
  return join(getDownloadsDir(), 'manifest.json')
}

function positionsPath(): string {
  return join(getDownloadsDir(), 'positions.json')
}

export async function ensureDownloadsDir(): Promise<string> {
  const dir = getDownloadsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await ensureDownloadsDir()
  await writeFile(path, JSON.stringify(value, null, 2), 'utf-8')
}

// ---- Manifest (downloaded books) ----

export async function readManifest(): Promise<Record<string, LocalBook>> {
  return readJsonFile<Record<string, LocalBook>>(manifestPath(), {})
}

export async function listLocalBooks(): Promise<LocalBook[]> {
  const manifest = await readManifest()
  return Object.values(manifest).sort((a, b) => b.addedAt - a.addedAt)
}

export async function getLocalBook(asin: string): Promise<LocalBook | undefined> {
  const manifest = await readManifest()
  return manifest[asin]
}

export async function upsertLocalBook(book: LocalBook): Promise<void> {
  const manifest = await readManifest()
  manifest[book.asin] = book
  await writeJsonFile(manifestPath(), manifest)
}

export async function removeLocalBook(asin: string): Promise<LocalBook | undefined> {
  const manifest = await readManifest()
  const existing = manifest[asin]
  if (existing) {
    delete manifest[asin]
    await writeJsonFile(manifestPath(), manifest)
  }
  return existing
}

// ---- Playback positions ----

export async function readPositions(): Promise<Record<string, PlaybackPosition>> {
  return readJsonFile<Record<string, PlaybackPosition>>(positionsPath(), {})
}

export async function getPosition(asin: string): Promise<PlaybackPosition | undefined> {
  const local = (await readPositions())[asin]
  // Reconcile with the position Audible has recorded (from the official apps or
  // another device) and resume from whichever is more recent. Falls back to the
  // local value if the account is signed out or the network is unavailable.
  const server = await getServerPosition(asin)
  if (!server) return local
  const serverPosition: PlaybackPosition = {
    asin,
    positionSec: server.positionSec,
    updatedAt: server.updatedAt
  }
  if (!local) return serverPosition
  return server.updatedAt > local.updatedAt ? serverPosition : local
}

// Push the position to Audible at most once every 15 seconds per book, with a
// trailing push so the final position still syncs after playback stops. Local
// writes happen immediately; the server upload is best-effort.
const SERVER_PUSH_INTERVAL_MS = 15000
const lastServerPush = new Map<string, number>()
const pendingPush = new Map<string, number>()
const pushTimers = new Map<string, NodeJS.Timeout>()

function flushServerPush(asin: string): void {
  const timer = pushTimers.get(asin)
  if (timer) {
    clearTimeout(timer)
    pushTimers.delete(asin)
  }
  const sec = pendingPush.get(asin)
  if (sec === undefined) return
  pendingPush.delete(asin)
  lastServerPush.set(asin, Date.now())
  void putServerPosition(asin, sec).catch(() => {})
}

function scheduleServerPush(asin: string, positionSec: number): void {
  pendingPush.set(asin, positionSec)
  const elapsed = Date.now() - (lastServerPush.get(asin) ?? 0)
  if (elapsed >= SERVER_PUSH_INTERVAL_MS) {
    flushServerPush(asin)
  } else if (!pushTimers.has(asin)) {
    pushTimers.set(
      asin,
      setTimeout(() => flushServerPush(asin), SERVER_PUSH_INTERVAL_MS - elapsed)
    )
  }
}

export async function setPosition(asin: string, positionSec: number): Promise<void> {
  const positions = await readPositions()
  positions[asin] = { asin, positionSec, updatedAt: Date.now() }
  await writeJsonFile(positionsPath(), positions)
  scheduleServerPush(asin, positionSec)
}

// Pull the latest position Audible has for a single book into the local store
// (without pushing back). Used right after a download so a book already started
// on another device resumes at the right spot and shows correct progress.
export async function pullServerPosition(asin: string): Promise<void> {
  const server = await getServerPosition(asin)
  if (!server) return
  const positions = await readPositions()
  const local = positions[asin]
  if (local && local.updatedAt >= server.updatedAt) return
  positions[asin] = { asin, positionSec: server.positionSec, updatedAt: server.updatedAt }
  await writeJsonFile(positionsPath(), positions)
}

// Pull Audible's positions for many books at once, merging any that are newer
// than the local copy. Returns the full local positions map afterwards so the
// library can render accurate progress without opening each book.
export async function syncLibraryPositions(
  asins: string[]
): Promise<Record<string, PlaybackPosition>> {
  const positions = await readPositions()
  if (asins.length === 0) return positions
  const serverMap = await getServerPositions(asins)
  let changed = false
  for (const [asin, server] of Object.entries(serverMap)) {
    const local = positions[asin]
    if (!local || server.updatedAt > local.updatedAt) {
      positions[asin] = { asin, positionSec: server.positionSec, updatedAt: server.updatedAt }
      changed = true
    }
  }
  if (changed) await writeJsonFile(positionsPath(), positions)
  return positions
}
