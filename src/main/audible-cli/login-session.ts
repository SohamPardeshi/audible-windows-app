import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { LoginEvent, LoginPromptKind } from '@shared/types'
import { spawnCli, isNetworkError } from './cli'
import { AUTH_FILE_NAME } from './paths'

type Emit = (event: LoginEvent) => void

// Prompt patterns the audible-cli credential login emits on stdout/stderr.
const PROMPT_PATTERNS: { kind: LoginPromptKind; pattern: RegExp }[] = [
  { kind: 'cvf', pattern: /CVF Code/i },
  { kind: 'otp', pattern: /OTP Code|one[- ]time password/i },
  { kind: 'captcha', pattern: /Answer for (the )?CAPTCHA|Answer for Captcha/i }
]

const URL_PATTERN = /(https?:\/\/\S+)/
// External login prints the Amazon sign-in URL on its own line; require a
// trailing newline so we never emit a half-buffered (truncated) URL.
const EXTERNAL_URL_PATTERN = /(https?:\/\/\S+)\r?\n/

// Drives a single interactive `manage auth-file add` subprocess. Username and
// password are passed as flags (so the Windows getpass prompts never appear);
// only the security prompts (CVF / OTP / CAPTCHA) are answered over stdin, which
// the renderer collects from the user one at a time.
class LoginSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private emit: Emit | null = null
  private buffer = ''
  private awaiting: LoginPromptKind | null = null
  private succeeded = false
  private finished = false
  private mode: 'credentials' | 'external' = 'credentials'

  get active(): boolean {
    return this.child !== null
  }

  start(
    opts: { countryCode: string; username: string; password: string; preAmazon?: boolean },
    emit: Emit
  ): void {
    const args = [
      '-v',
      'error',
      'manage',
      'auth-file',
      'add',
      '-f',
      AUTH_FILE_NAME,
      '-cc',
      opts.countryCode,
      '-au',
      opts.username,
      '-ap',
      opts.password
    ]
    if (opts.preAmazon) args.push('--with-username')
    this.run('credentials', args, emit)
  }

  // External (browser) login: the CLI prints an Amazon sign-in URL and then
  // blocks waiting for the redirect URL the user pastes back after logging in.
  // NOTE: audible-cli 0.3.3 still prompts for the username AND password on
  // stdin even with --external-login (the actual auth happens in the browser,
  // but the CLI refuses to continue without them). We pass them as flags so the
  // hidden getpass prompts never block the subprocess.
  startExternal(
    opts: { countryCode: string; username: string; password: string; preAmazon?: boolean },
    emit: Emit
  ): void {
    const args = [
      '-v',
      'error',
      'manage',
      'auth-file',
      'add',
      '-f',
      AUTH_FILE_NAME,
      '-cc',
      opts.countryCode,
      '-au',
      opts.username,
      '-ap',
      opts.password,
      '--external-login'
    ]
    if (opts.preAmazon) args.push('--with-username')
    this.run('external', args, emit)
  }

  private run(mode: 'credentials' | 'external', args: string[], emit: Emit): void {
    this.cancel()
    this.mode = mode
    this.emit = emit
    this.buffer = ''
    this.awaiting = null
    this.succeeded = false
    this.finished = false

    const child = spawnCli(args)
    this.child = child

    const onData = (chunk: string): void => this.handleData(chunk)
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (err) => this.finish(false, err.message))
    child.on('close', (code) => {
      if (this.finished) return
      if (this.succeeded || code === 0) {
        this.finish(true)
      } else {
        const tail = this.buffer.trim().split('\n').filter(Boolean).pop() || ''
        const reason = isNetworkError(this.buffer)
          ? 'Network interrupted during sign-in (likely a VPN or antivirus blocking the connection). Please try again.'
          : tail || `Sign-in failed (exit ${code}).`
        // Surface the full CLI output to the main-process console so login
        // failures are diagnosable (the renderer only gets a short message).
        console.error(
          `[login] ${this.mode} sign-in failed (exit ${code}). CLI output:\n${this.buffer.trim()}`
        )
        this.finish(false, reason)
      }
    })
  }

  submit(kind: LoginPromptKind, value: string): void {
    if (!this.child || this.awaiting !== kind) return
    this.awaiting = null
    this.buffer = ''
    this.child.stdin.write(value + '\n')
  }

  cancel(): void {
    if (this.child) {
      try {
        this.child.removeAllListeners()
        this.child.kill()
      } catch {
        // ignore
      }
    }
    this.child = null
    this.emit = null
    this.awaiting = null
    this.finished = true
  }

  private handleData(chunk: string): void {
    this.buffer += chunk

    if (/Successfully registered/i.test(this.buffer)) {
      this.succeeded = true
    }

    if (this.awaiting) return

    // External login: surface the Amazon sign-in URL, then wait for the user to
    // paste back the redirect URL (handled as the 'redirect' prompt).
    if (this.mode === 'external') {
      const match = this.buffer.match(EXTERNAL_URL_PATTERN)
      if (match) {
        this.awaiting = 'redirect'
        this.emit?.({ type: 'external-url', url: match[1] })
        return
      }
    }

    for (const { kind, pattern } of PROMPT_PATTERNS) {
      if (pattern.test(this.buffer)) {
        this.awaiting = kind
        const captchaUrl = kind === 'captcha' ? this.buffer.match(URL_PATTERN)?.[1] : undefined
        this.emit?.({ type: 'prompt', kind, captchaUrl })
        return
      }
    }
  }

  private finish(success: boolean, error?: string): void {
    if (this.finished && !this.child) {
      // already finalized
    }
    this.finished = true
    const emit = this.emit
    this.child = null
    this.awaiting = null
    emit?.({ type: 'done', success, error })
    this.emit = null
  }
}

export const loginSession = new LoginSession()
