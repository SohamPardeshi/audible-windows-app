import { app, shell, BrowserWindow, globalShortcut, screen } from 'electron'
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
    // Center on the primary display so the window never opens off-screen or on
    // a secondary monitor the user isn't looking at, then bring it to front.
    const { workArea } = screen.getPrimaryDisplay()
    const [w, h] = mainWindow.getSize()
    mainWindow.setPosition(
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + (workArea.height - h) / 2)
    )
    mainWindow.show()
    mainWindow.focus()
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

// Only allow a single running instance. A second launch (e.g. double-clicking
// the exe again) focuses the existing window instead of silently spawning a
// hidden duplicate process.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
