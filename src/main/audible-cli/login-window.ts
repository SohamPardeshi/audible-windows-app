import { BrowserWindow } from 'electron'

// A realistic desktop Chrome UA. Amazon's device-auth sign-in page is sensitive
// to the client; using a normal desktop browser UA (rather than Electron's
// default) gives the most reliable rendering of the sign-in form.
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// The audible-cli external login's return_to is .../ap/maplanding; after a
// successful sign-in Amazon redirects there with the authorization code in the
// query string. That page itself shows a harmless "page not found" — we only
// need its URL.
function isRedirectUrl(url: string): boolean {
  return /\/ap\/maplanding/i.test(url) && /openid\.oa2\.authorization_code=/i.test(url)
}

interface LoginWindowHandlers {
  parent?: BrowserWindow
  onRedirect: (url: string) => void
  onCancel: () => void
}

let current: BrowserWindow | null = null

// Open the Amazon sign-in URL in a dedicated popup window and automatically
// capture the post-login redirect URL (no copy/paste). The window closes itself
// once the redirect is seen. If the user closes it first, onCancel fires.
export function openLoginWindow(url: string, handlers: LoginWindowHandlers): void {
  // Only one login window at a time.
  closeLoginWindow()

  const win = new BrowserWindow({
    width: 480,
    height: 760,
    parent: handlers.parent,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Sign in to Amazon',
    webPreferences: {
      // A clean, isolated session so a stale Amazon cookie can't interfere; no
      // Node access in the Amazon page.
      partition: 'audible-login',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  current = win

  let captured = false
  const capture = (candidate: string): void => {
    if (captured || !isRedirectUrl(candidate)) return
    captured = true
    handlers.onRedirect(candidate)
    // Let the redirect finish, then tear the window down.
    setTimeout(() => closeLoginWindow(), 150)
  }

  win.webContents.setUserAgent(DESKTOP_UA)

  win.webContents.on('will-redirect', (_e, target) => capture(target))
  win.webContents.on('did-redirect-navigation', (_e, target) => capture(target))
  win.webContents.on('did-navigate', (_e, target) => capture(target))
  win.webContents.on('did-navigate-in-page', (_e, target) => capture(target))

  win.on('closed', () => {
    if (current === win) current = null
    if (!captured) handlers.onCancel()
  })

  win.once('ready-to-show', () => win.show())
  void win.loadURL(url, { userAgent: DESKTOP_UA })
}

export function closeLoginWindow(): void {
  const win = current
  current = null
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('closed')
    win.close()
  }
}
