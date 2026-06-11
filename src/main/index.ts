import { app, shell, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { registerMediaScheme, handleMediaProtocol } from './audible-cli/protocol'
import { IPC } from '../shared/ipc'
import icon from '../../resources/icon.png?asset'

// The custom media scheme must be registered before the app is ready.
registerMediaScheme()

// Forward hardware media-key presses to the focused (or only) window so the
// player can react even when it's minimized to the mini-player.
function registerMediaKeys(): void {
  const send = (action: string): void => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send(IPC.mediaKey, action)
  }
  globalShortcut.register('MediaPlayPause', () => send('playpause'))
  globalShortcut.register('MediaNextTrack', () => send('next'))
  globalShortcut.register('MediaPreviousTrack', () => send('previous'))
  globalShortcut.register('MediaStop', () => send('stop'))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121212',
    title: 'Audible Desktop',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.unofficial.audibledesktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  handleMediaProtocol()
  registerIpcHandlers()
  createWindow()
  registerMediaKeys()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
