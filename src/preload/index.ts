import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc'
import type {
  AuthStatus,
  LibraryBook,
  LocalBook,
  LoginCredentials,
  LoginEvent,
  LoginPromptKind,
  DownloadEvent,
  MediaInfo,
  PlaybackPosition
} from '../shared/types'

// The typed API surface exposed to the renderer. Everything privileged stays
// in the main process; the renderer only sends intents over IPC.
const api = {
  // Auth
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.authStatus),
  logout: (): Promise<void> => ipcRenderer.invoke(IPC.authLogout),
  // Interactive login
  startLogin: (creds: LoginCredentials): void => ipcRenderer.send(IPC.loginStart, creds),
  startExternalLogin: (opts: {
    countryCode: string
    username: string
    preAmazon?: boolean
  }): void => ipcRenderer.send(IPC.loginExternalStart, opts),
  startTerminalLogin: (opts: { countryCode: string; preAmazon?: boolean }): void =>
    ipcRenderer.send(IPC.loginTerminalStart, opts),
  submitLoginPrompt: (kind: LoginPromptKind, value: string): void =>
    ipcRenderer.send(IPC.loginSubmit, kind, value),
  cancelLogin: (): void => ipcRenderer.send(IPC.loginCancel),
  openLoginUrl: (url: string): void => ipcRenderer.send(IPC.loginOpenUrl, url),
  onLoginEvent: (cb: (event: LoginEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: LoginEvent): void => cb(event)
    ipcRenderer.on(IPC.loginEvent, listener)
    return () => ipcRenderer.removeListener(IPC.loginEvent, listener)
  },
  // Library
  fetchLibrary: (): Promise<LibraryBook[]> => ipcRenderer.invoke(IPC.libraryFetch),
  // Downloads
  startDownload: (book: LibraryBook): void => ipcRenderer.send(IPC.downloadStart, book),
  cancelDownload: (asin: string): void => ipcRenderer.send(IPC.downloadCancel, asin),
  listDownloads: (): Promise<LocalBook[]> => ipcRenderer.invoke(IPC.downloadList),
  deleteDownload: (asin: string): Promise<void> => ipcRenderer.invoke(IPC.downloadDelete, asin),
  onDownloadEvent: (cb: (event: DownloadEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: DownloadEvent): void => cb(event)
    ipcRenderer.on(IPC.downloadEvent, listener)
    return () => ipcRenderer.removeListener(IPC.downloadEvent, listener)
  },
  // Media + playback
  getMediaInfo: (asin: string): Promise<MediaInfo> => ipcRenderer.invoke(IPC.mediaInfo, asin),
  getPosition: (asin: string): Promise<PlaybackPosition | undefined> =>
    ipcRenderer.invoke(IPC.positionGet, asin),
  setPosition: (asin: string, positionSec: number): Promise<void> =>
    ipcRenderer.invoke(IPC.positionSet, asin, positionSec),
  listPositions: (): Promise<Record<string, PlaybackPosition>> =>
    ipcRenderer.invoke(IPC.positionList),
  syncLibraryPositions: (asins: string[]): Promise<Record<string, PlaybackPosition>> =>
    ipcRenderer.invoke(IPC.positionSyncLibrary, asins),
  // Hardware media keys (play/pause/next/previous/stop) forwarded from main.
  onMediaKey: (cb: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string): void => cb(action)
    ipcRenderer.on(IPC.mediaKey, listener)
    return () => ipcRenderer.removeListener(IPC.mediaKey, listener)
  }
}

export type AudibleApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('audible', api)
} else {
  // @ts-ignore - fallback when context isolation is disabled
  window.electron = electronAPI
  // @ts-ignore
  window.audible = api
}
