import { mkdir, readFile, copyFile, rm, access, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { constants as fsConstants } from 'fs'
import type { AuthStatus, LibraryBook, LoginEvent, LoginPromptKind } from '@shared/types'
import {
  getConfigDir,
  getAuthFilePath,
  getConfigTomlPath,
  getDefaultCliConfigDir,
  getSignedOutMarkerPath,
  getCliPath,
  AUTH_FILE_NAME,
  PROFILE_NAME
} from './paths'
import { exportLibrary } from './library'
import { loginSession } from './login-session'

interface AuthFile {
  locale_code?: string
  customer_info?: {
    name?: string
    given_name?: string
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true })
}

// audible-cli's `manage auth-file add` refuses to run unless a config.toml
// already exists, and later commands (library export) need a profile that
// points at the auth file. Normally this is created by `audible quickstart`;
// since we drive auth-file add directly we write a minimal config ourselves.
export async function ensureConfigToml(countryCode: string): Promise<void> {
  await ensureConfigDir()
  if (await exists(getConfigTomlPath())) return
  const cc = /^[a-z]{2}$/.test(countryCode) ? countryCode : 'us'
  const toml =
    'title = "Audible Config File"\n\n' +
    '[APP]\n' +
    `primary_profile = "${PROFILE_NAME}"\n\n` +
    `[profile.${PROFILE_NAME}]\n` +
    `auth_file = "${AUTH_FILE_NAME}"\n` +
    `country_code = "${cc}"\n`
  await writeFile(getConfigTomlPath(), toml, 'utf-8')
}

// If the app has no auth yet but a manual `audible.exe` login left credentials
// in the default CLI location, adopt them so the user is signed in immediately.
// Skipped if the user explicitly signed out, so logout actually sticks.
export async function importDefaultAuthIfPresent(): Promise<boolean> {
  if (await exists(getAuthFilePath())) return false
  if (await exists(getSignedOutMarkerPath())) return false

  const defaultDir = getDefaultCliConfigDir()
  if (!defaultDir) return false

  const defaultAuth = join(defaultDir, AUTH_FILE_NAME)
  const defaultConfig = join(defaultDir, 'config.toml')
  if (!(await exists(defaultAuth)) || !(await exists(defaultConfig))) return false

  await ensureConfigDir()
  await copyFile(defaultAuth, getAuthFilePath())
  await copyFile(defaultConfig, getConfigTomlPath())
  return true
}

export async function getAuthStatus(): Promise<AuthStatus> {
  await importDefaultAuthIfPresent()

  if (!(await exists(getAuthFilePath()))) {
    return { authenticated: false }
  }

  try {
    const raw = await readFile(getAuthFilePath(), 'utf-8')
    const auth = JSON.parse(raw) as AuthFile
    return {
      authenticated: true,
      marketplace: auth.locale_code,
      customerName: auth.customer_info?.given_name || auth.customer_info?.name
    }
  } catch {
    return { authenticated: true }
  }
}

export async function getLibrary(): Promise<LibraryBook[]> {
  await ensureConfigDir()
  return exportLibrary()
}

export async function logout(): Promise<void> {
  loginSession.cancel()
  await rm(getConfigDir(), { recursive: true, force: true })
  // Mark an explicit sign-out so we don't silently re-import the global CLI
  // auth on the next status check.
  try {
    await writeFile(getSignedOutMarkerPath(), String(Date.now()), 'utf-8')
  } catch {
    // Non-fatal: worst case the user gets auto-imported again.
  }
}

// Clear the signed-out marker once the user has actively signed in again.
async function clearSignedOutMarker(): Promise<void> {
  await rm(getSignedOutMarkerPath(), { force: true })
}

// Wrap a login emit so a successful sign-in clears the signed-out marker.
function withMarkerClear(emit: (event: LoginEvent) => void): (event: LoginEvent) => void {
  return (event) => {
    if (event.type === 'done' && event.success) void clearSignedOutMarker()
    emit(event)
  }
}

export async function startLogin(
  opts: { countryCode: string; username: string; password: string; preAmazon?: boolean },
  emit: (event: LoginEvent) => void
): Promise<void> {
  await ensureConfigToml(opts.countryCode)
  loginSession.start(opts, withMarkerClear(emit))
}

export async function startExternalLogin(
  opts: { countryCode: string; username: string; password?: string; preAmazon?: boolean },
  emit: (event: LoginEvent) => void
): Promise<void> {
  await ensureConfigToml(opts.countryCode)
  // Start from a clean slate so a stale auth file can't make `auth-file add`
  // fail with "file already exists".
  await rm(getAuthFilePath(), { force: true })
  // External login authenticates entirely in the browser, so the username and
  // password are ignored by audible-cli — but the CLI still needs values for
  // its -au/-ap flags to avoid an interactive prompt. Fill in placeholders when
  // the UI didn't collect a password.
  loginSession.startExternal(
    {
      countryCode: opts.countryCode,
      username: opts.username || 'external',
      password: opts.password || 'external',
      preAmazon: opts.preAmazon
    },
    withMarkerClear(emit)
  )
}

export function submitLoginPrompt(kind: LoginPromptKind, value: string): void {
  loginSession.submit(kind, value)
}

export function cancelLogin(): void {
  cancelTerminalLogin()
  loginSession.cancel()
}

// ---- Terminal (interactive) login -----------------------------------------
// The headless credential subprocess and the iOS device-auth browser flow both
// fail for this account: Amazon never delivers the OTP/CVF code to a piped,
// non-TTY child, and `manage auth-file add` forces username/password/CVF
// prompts. The approach the user wants is audible-cli's own `quickstart`
// utility with its "login with external browser" option, which calls
// Authenticator.from_login_external — it only prints the Amazon sign-in URL and
// waits for the post-login redirect URL (no username, password, or CVF). The
// real browser handles 2FA/CAPTCHA. We run that interactively in its own
// console window and watch the config dir for the auth file it writes.

let terminalLoginToken = 0

export function cancelTerminalLogin(): void {
  // Bumping the token makes any in-flight poll loop exit on its next tick.
  terminalLoginToken++
}

// quickstart's prompts, in order, with the answers we want the user to give:
//   profile name        -> Enter (default "audible")  => auth file audible.json
//   country code        -> the marketplace code (e.g. us)
//   auth file name       -> Enter (default audible.json)
//   encrypt auth file?   -> Enter (default no)
//   external browser?    -> y   (the CVF-free flow)
//   pre-amazon account?  -> y/n
//   continue summary?    -> y
// then it prints the Amazon URL and waits for the pasted redirect URL.
function buildLoginBat(cfgDir: string, exe: string, cc: string, preAmazon: boolean): string {
  const externalAnswer = 'y'
  const preAmazonAnswer = preAmazon ? 'y' : 'n'
  return (
    '@echo off\r\n' +
    'title Audible Sign-in\r\n' +
    `set "AUDIBLE_CONFIG_DIR=${cfgDir}"\r\n` +
    'set "PYTHONUTF8=1"\r\n' +
    'set "PYTHONIOENCODING=utf-8"\r\n' +
    'echo ================================================\r\n' +
    'echo     Audible Desktop  -  Sign in (quickstart)\r\n' +
    'echo ================================================\r\n' +
    'echo.\r\n' +
    'echo Answer the prompts below like this:\r\n' +
    'echo.\r\n' +
    'echo   * Primary profile name ........ press ENTER\r\n' +
    `echo   * Country code ................ type  ${cc}\r\n` +
    'echo   * Auth file name .............. press ENTER\r\n' +
    'echo   * Encrypt the auth file? ...... press ENTER (no)\r\n' +
    `echo   * Login with external browser? type  ${externalAnswer}\r\n` +
    `echo   * Pre-amazon Audible account? . type  ${preAmazonAnswer}\r\n` +
    'echo   * Do you want to continue? .... type  y\r\n' +
    'echo.\r\n' +
    'echo Then a long https://www.amazon... URL appears.\r\n' +
    'echo Copy it into your normal web browser, sign in\r\n' +
    'echo (this is where Amazon does any 2FA / captcha),\r\n' +
    'echo and when the page shows a "Not found" error,\r\n' +
    'echo copy that pages full address from the address\r\n' +
    'echo bar and paste it back here, then press ENTER.\r\n' +
    'echo.\r\n' +
    'echo When you see "Successfully registered", return\r\n' +
    'echo to the app - it signs you in automatically.\r\n' +
    'echo ------------------------------------------------\r\n' +
    'echo.\r\n' +
    `"${exe}" quickstart\r\n` +
    'echo.\r\n' +
    'echo You can close this window now.\r\n' +
    'pause\r\n'
  )
}

export async function startTerminalLogin(
  opts: { countryCode: string; preAmazon?: boolean },
  emit: (event: LoginEvent) => void
): Promise<void> {
  // quickstart refuses to run if config.toml already exists and loops if the
  // auth file exists, so hand it a clean config dir. quickstart will recreate
  // config.toml + the profile + the auth file itself.
  await ensureConfigDir()
  await rm(getConfigTomlPath(), { force: true })
  await rm(getAuthFilePath(), { force: true })

  const cc = /^[a-z]{2}$/.test(opts.countryCode) ? opts.countryCode : 'us'
  const batPath = join(tmpdir(), `audible-login-${Date.now()}.bat`)
  await writeFile(batPath, buildLoginBat(getConfigDir(), getCliPath(), cc, !!opts.preAmazon), 'utf-8')

  try {
    // `start` spawns a brand-new, interactive console window the user can type
    // into (a piped child can't satisfy Amazon's verification prompts).
    const child = spawn('cmd.exe', ['/c', 'start', 'Audible Sign-in', 'cmd', '/c', batPath], {
      windowsHide: false,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
  } catch (err) {
    emit({
      type: 'done',
      success: false,
      error: `Could not open a sign-in terminal: ${(err as Error).message}`
    })
    return
  }

  emit({
    type: 'status',
    message:
      'A terminal window opened with step-by-step instructions. Choose “login with external browser”, sign in, and paste the redirect URL back. This screen updates automatically once it says “Successfully registered”.'
  })

  const token = ++terminalLoginToken
  const deadline = Date.now() + 15 * 60 * 1000
  const poll = async (): Promise<void> => {
    if (token !== terminalLoginToken) return // cancelled or superseded
    if (await exists(getAuthFilePath())) {
      await clearSignedOutMarker()
      emit({ type: 'done', success: true })
      void rm(batPath, { force: true })
      return
    }
    if (Date.now() > deadline) {
      emit({
        type: 'done',
        success: false,
        error: 'Timed out waiting for the terminal sign-in. Please try again.'
      })
      void rm(batPath, { force: true })
      return
    }
    setTimeout(() => void poll(), 2000)
  }
  setTimeout(() => void poll(), 2500)
}
