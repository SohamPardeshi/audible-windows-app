import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

// Resolves the bundled audible-cli executable. In development the onedir build
// lives under the project's resources/ folder; in a packaged app it is copied
// next to the app via electron-builder's extraResources into resourcesPath.
export function getCliPath(): string {
  const relative = join('audible-cli', 'audible', 'audible.exe')
  if (is.dev) {
    return join(app.getAppPath(), 'resources', relative)
  }
  return join(process.resourcesPath, relative)
}

// The directory audible-cli reads its config.toml and auth file from. We keep
// our own copy inside the app's userData so the app is self-contained and does
// not depend on a globally-installed CLI configuration.
export function getConfigDir(): string {
  return join(app.getPath('userData'), 'audible-config')
}

// Name of the auth file stored inside the config dir.
export const AUTH_FILE_NAME = 'audible.json'

// Name of the profile written into config.toml.
export const PROFILE_NAME = 'audible'

export function getAuthFilePath(): string {
  return join(getConfigDir(), AUTH_FILE_NAME)
}

export function getConfigTomlPath(): string {
  return join(getConfigDir(), 'config.toml')
}

// The default location audible-cli uses on Windows. A manual `audible.exe`
// login (outside this app) writes here, so we can import it on first run.
export function getDefaultCliConfigDir(): string {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return ''
  return join(localAppData, 'Audible')
}

// Marker written when the user explicitly signs out. While it exists we do NOT
// silently re-import the global audible-cli auth, so sign-out actually sticks.
// It lives outside the config dir (which logout wipes) so it survives.
export function getSignedOutMarkerPath(): string {
  return join(app.getPath('userData'), '.signed-out')
}
