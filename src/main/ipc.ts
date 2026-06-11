import { ipcMain } from 'electron'
import { shell, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AuthStatus,
  LibraryBook,
  LoginCredentials,
  LoginEvent,
  LoginPromptKind,
  LocalBook,
  MediaInfo,
  PlaybackPosition
} from '@shared/types'
import {
  getAuthStatus,
  getLibrary,
  logout,
  startLogin,
  startExternalLogin,
  startTerminalLogin,
  submitLoginPrompt,
  cancelLogin
} from './audible-cli/service'
import { openLoginWindow, closeLoginWindow } from './audible-cli/login-window'
import {
  listLocalBooks,
  getPosition,
  setPosition,
  readPositions,
  syncLibraryPositions
} from './audible-cli/store'
import { downloadBook, cancelDownload } from './audible-cli/download'
import { getMediaInfo, deleteLocalBook } from './audible-cli/media'

export function registerIpcHandlers(): void {
  // ---- Auth ----
  ipcMain.handle(IPC.authStatus, (): Promise<AuthStatus> => getAuthStatus())

  ipcMain.handle(IPC.authLogout, (): Promise<void> => logout())

  ipcMain.on(IPC.loginStart, (event, creds: LoginCredentials) => {
    void startLogin(creds, (loginEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.loginEvent, loginEvent)
    })
  })

  ipcMain.on(
    IPC.loginExternalStart,
    (event, creds: { countryCode: string; username: string; preAmazon?: boolean }) => {
      const send = (loginEvent: LoginEvent): void => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.loginEvent, loginEvent)
      }
      void startExternalLogin(creds, (loginEvent) => {
        // When the CLI emits the Amazon sign-in URL, open it in a popup window
        // and auto-capture the post-login redirect URL (no copy/paste). We tell
        // the renderer to show a "complete sign-in in the popup" status instead
        // of the raw URL.
        if (loginEvent.type === 'external-url') {
          const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
          openLoginWindow(loginEvent.url, {
            parent,
            onRedirect: (redirectUrl) => submitLoginPrompt('redirect', redirectUrl),
            onCancel: () => {
              // User closed the popup before finishing — abort the CLI subprocess.
              cancelLogin()
              send({ type: 'done', success: false, error: 'Sign-in was cancelled.' })
            }
          })
          send({
            type: 'status',
            message:
              'Complete the Amazon sign-in in the popup window — it finishes automatically.'
          })
          return
        }
        if (loginEvent.type === 'done') closeLoginWindow()
        send(loginEvent)
      })
    }
  )

  ipcMain.on(
    IPC.loginTerminalStart,
    (event, opts: { countryCode: string; preAmazon?: boolean }) => {
      void startTerminalLogin(opts, (loginEvent) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.loginEvent, loginEvent)
      })
    }
  )

  ipcMain.on(IPC.loginOpenUrl, (_e, url: string) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.on(IPC.loginSubmit, (_e, kind: LoginPromptKind, value: string) => {
    submitLoginPrompt(kind, value)
  })

  ipcMain.on(IPC.loginCancel, () => cancelLogin())

  // ---- Library ----
  ipcMain.handle(IPC.libraryFetch, (): Promise<LibraryBook[]> => getLibrary())

  // ---- Downloads ----
  ipcMain.on(IPC.downloadStart, (event, book: LibraryBook) => {
    void downloadBook(book, (dlEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.downloadEvent, dlEvent)
    }).catch(() => {
      // Errors are already surfaced through the download event channel.
    })
  })

  ipcMain.on(IPC.downloadCancel, (_e, asin: string) => cancelDownload(asin))

  ipcMain.handle(IPC.downloadList, (): Promise<LocalBook[]> => listLocalBooks())

  ipcMain.handle(IPC.downloadDelete, (_e, asin: string): Promise<void> => deleteLocalBook(asin))

  // ---- Media + playback ----
  ipcMain.handle(IPC.mediaInfo, (_e, asin: string): Promise<MediaInfo> => getMediaInfo(asin))

  ipcMain.handle(
    IPC.positionGet,
    (_e, asin: string): Promise<PlaybackPosition | undefined> => getPosition(asin)
  )

  ipcMain.handle(IPC.positionSet, (_e, asin: string, positionSec: number): Promise<void> =>
    setPosition(asin, positionSec)
  )

  ipcMain.handle(
    IPC.positionList,
    (): Promise<Record<string, PlaybackPosition>> => readPositions()
  )

  ipcMain.handle(
    IPC.positionSyncLibrary,
    (_e, asins: string[]): Promise<Record<string, PlaybackPosition>> =>
      syncLibraryPositions(asins)
  )
}
