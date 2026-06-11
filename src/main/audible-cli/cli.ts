import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { getCliPath, getConfigDir } from './paths'

export interface CliResult {
  code: number
  stdout: string
  stderr: string
}

// Build the environment every audible-cli invocation runs with. PYTHONUTF8 and
// PYTHONIOENCODING force UTF-8 so non-Latin book titles do not crash the bundled
// Python with a cp1252 charmap error on Windows.
function cliEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AUDIBLE_CONFIG_DIR: getConfigDir(),
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    // Force unbuffered stdout/stderr so the interactive login prompts and the
    // external sign-in URL arrive immediately instead of stuck in a pipe buffer.
    PYTHONUNBUFFERED: '1'
  }
}

// audible-cli surfaces transient TLS interruptions (VPN / antivirus HTTPS
// scanning) as this error. They are not fatal — a retry usually succeeds.
const NETWORK_ERROR_PATTERN = /NetworkError: Network down|Network down\.|ConnectError|ReadTimeout|10053/i

export function isNetworkError(output: string): boolean {
  return NETWORK_ERROR_PATTERN.test(output)
}

// Spawn the CLI with a fixed argument list and collect its output. Used for
// non-interactive commands (library export, deregister, etc.).
export function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(getCliPath(), args, { env: cliEnv(), windowsHide: true })
    } catch (err) {
      reject(err)
      return
    }

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (d: string) => (stdout += d))
    child.stderr.on('data', (d: string) => (stderr += d))

    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

// Run a command, retrying when the failure looks like transient local network
// interference rather than a real error. Uses an increasing backoff between
// attempts so a brief TLS interruption (VPN / antivirus scanning) has time to
// clear instead of all retries firing back-to-back.
export async function runCliWithRetry(args: string[], attempts = 6): Promise<CliResult> {
  let last: CliResult | null = null
  for (let i = 0; i < attempts; i++) {
    const result = await runCli(args)
    if (result.code === 0) return result
    last = result
    if (!isNetworkError(result.stdout + result.stderr)) break
    if (i < attempts - 1) {
      // 1s, 2s, 3s … capped at 5s.
      await new Promise((r) => setTimeout(r, Math.min((i + 1) * 1000, 5000)))
    }
  }
  return last as CliResult
}

// Spawn the CLI for an interactive flow (the credential login that prompts for
// a CVF / OTP code on stdin). The caller drives stdin and watches stdout/stderr.
export function spawnCli(args: string[]): ChildProcessWithoutNullStreams {
  const child = spawn(getCliPath(), args, { env: cliEnv(), windowsHide: true })
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')
  return child
}

let cachedActivationBytes: string | null = null

// Fetch the account's AAX activation bytes (a short hex string). Required to
// decrypt legacy AAX downloads. The value is stable per account, so cache it.
export async function getActivationBytes(): Promise<string> {
  if (cachedActivationBytes) return cachedActivationBytes
  const result = await runCliWithRetry(['-v', 'error', 'activation-bytes'])
  const hex = (result.stdout + '\n' + result.stderr)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .reverse()
    .find((l) => /^[0-9a-fA-F]{8}$/.test(l))
  if (!hex) {
    throw new Error('Could not obtain activation bytes for AAX decryption.')
  }
  cachedActivationBytes = hex
  return hex
}
