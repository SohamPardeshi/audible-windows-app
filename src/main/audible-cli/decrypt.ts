import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import type { Chapter } from '@shared/types'

// ffmpeg-static resolves to a path inside node_modules. When packaged into an
// asar archive the binary must be run from the unpacked copy.
export function getFfmpegPath(): string {
  const raw = ffmpegStatic as unknown as string
  if (!raw) throw new Error('Bundled ffmpeg binary not found.')
  return raw.replace('app.asar', 'app.asar.unpacked')
}

interface DecryptKey {
  key: string
  iv: string
}

// The audible-cli `.voucher` file is a JSON document whose decrypted license
// response contains the AES key and IV. The exact nesting has varied between
// versions, so we search the tree for an object that carries both a `key` and
// an `iv` that look like hex strings.
export function extractKeyIv(voucherJson: unknown): DecryptKey {
  const isHex = (v: unknown): v is string =>
    typeof v === 'string' && /^[0-9a-fA-F]{16,}$/.test(v)

  let found: DecryptKey | null = null
  const visit = (node: unknown): void => {
    if (found || node === null || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (isHex(obj.key) && isHex(obj.iv)) {
      found = { key: obj.key as string, iv: obj.iv as string }
      return
    }
    for (const value of Object.values(obj)) visit(value)
  }
  visit(voucherJson)

  if (!found) throw new Error('Could not find decryption key in voucher file.')
  return found
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderr = ''
    let stdout = ''
    child.stderr.setEncoding('utf-8')
    child.stdout.setEncoding('utf-8')
    child.stderr.on('data', (d: string) => (stderr += d))
    child.stdout.on('data', (d: string) => (stdout += d))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stderr, stdout }))
  })
}

// Decrypt an AAXC file into an m4b using the key/iv from its voucher.
export async function decryptAaxc(input: string, output: string, k: DecryptKey): Promise<void> {
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-audible_key',
    k.key,
    '-audible_iv',
    k.iv,
    '-i',
    input,
    '-map_metadata',
    '0',
    '-c',
    'copy',
    output
  ])
  if (code !== 0) {
    const tail = stderr.trim().split('\n').slice(-3).join(' ')
    throw new Error(`ffmpeg decryption failed: ${tail}`)
  }
}

// Decrypt a legacy AAX file into an m4b using the account's activation bytes.
// Older Audible titles are only offered as AAX (not AAXC); these have no
// voucher and instead use a 4-byte activation key tied to the account.
export async function decryptAax(
  input: string,
  output: string,
  activationBytes: string
): Promise<void> {
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-activation_bytes',
    activationBytes,
    '-i',
    input,
    '-map_metadata',
    '0',
    '-c',
    'copy',
    output
  ])
  if (code !== 0) {
    const tail = stderr.trim().split('\n').slice(-3).join(' ')
    throw new Error(`ffmpeg decryption failed: ${tail}`)
  }
}

function parseTimecode(value: string): number {
  const m = value.match(/(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/)
  if (!m) return 0
  const [, h, min, s, frac] = m
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(`0.${frac || 0}`)
}

// Read embedded chapter markers and total duration from a decrypted m4b by
// dumping ffmetadata. Audible files carry chapter markers that survive a
// stream copy, so this is the single source of truth for chapters.
export async function readChaptersAndDuration(
  file: string
): Promise<{ chapters: Chapter[]; durationSec?: number }> {
  const { stderr, stdout, code } = await runFfmpeg(['-i', file, '-f', 'ffmetadata', '-'])
  // ffmpeg writes ffmetadata to stdout and the Duration banner to stderr. It may
  // exit non-zero because there is no output file, which is fine here.
  void code

  let durationSec: number | undefined
  const durMatch = stderr.match(/Duration:\s*([0-9:.]+)/)
  if (durMatch) durationSec = parseTimecode(durMatch[1])

  const chapters: Chapter[] = []
  // ffmetadata chapters look like:
  //   [CHAPTER]
  //   TIMEBASE=1/1000
  //   START=0
  //   END=123456
  //   title=Chapter 1
  const blocks = stdout.split('[CHAPTER]').slice(1)
  for (const block of blocks) {
    const timebase = block.match(/TIMEBASE=(\d+)\/(\d+)/)
    const startM = block.match(/START=(\d+)/)
    const endM = block.match(/END=(\d+)/)
    const titleM = block.match(/title=(.*)/)
    if (!startM || !endM) continue
    const num = timebase ? Number(timebase[1]) : 1
    const den = timebase ? Number(timebase[2]) : 1000
    const scale = num / den
    const startSec = Number(startM[1]) * scale
    const endSec = Number(endM[1]) * scale
    chapters.push({
      title: titleM ? titleM[1].trim() : `Chapter ${chapters.length + 1}`,
      startSec,
      lengthSec: Math.max(0, endSec - startSec)
    })
  }

  if (chapters.length && durationSec === undefined) {
    const last = chapters[chapters.length - 1]
    durationSec = last.startSec + last.lengthSec
  }

  return { chapters, durationSec }
}
