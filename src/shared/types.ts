// Types shared between the main and renderer processes.

export interface DeviceInfo {
  device_name?: string
  device_serial_number?: string
  device_type?: string
}

export interface CustomerInfo {
  account_pool?: string
  user_id?: string
  home_region?: string
  name?: string
  given_name?: string
}

// The full set of credentials produced by a successful device registration.
export interface AuthData {
  marketplace: string
  deviceSerial: string
  adpToken: string
  devicePrivateKey: string
  accessToken: string
  refreshToken: string
  // Epoch milliseconds when the access token expires.
  expires: number
  storeAuthenticationCookie?: unknown
  websiteCookies?: Record<string, string> | null
  deviceInfo?: DeviceInfo
  customerInfo?: CustomerInfo
}

export interface LibraryBookAuthor {
  asin?: string
  name: string
}

export interface LibraryBook {
  asin: string
  title: string
  subtitle?: string
  authors: LibraryBookAuthor[]
  narrators: string[]
  coverUrl?: string
  runtimeLengthMin?: number
  releaseDate?: string
  purchaseDate?: string
  percentComplete?: number
  isFinished?: boolean
  series?: { title: string; sequence?: string }[]
}

export interface LibraryPage {
  books: LibraryBook[]
  // Total number of items if the server reports it.
  total?: number
}

export interface AccountSummary {
  name?: string
  email?: string
  marketplace: string
}

export interface AuthStatus {
  authenticated: boolean
  marketplace?: string
  customerName?: string
}

// Kinds of security prompt the audible-cli login can ask for mid-flow.
// 'redirect' is the post-browser step of external login where the user pastes
// the Amazon redirect URL back to the CLI.
export type LoginPromptKind = 'cvf' | 'otp' | 'captcha' | 'redirect'

export interface LoginCredentials {
  countryCode: string
  username: string
  password: string
  // True for legacy pre-Amazon Audible accounts (audible-cli --with-username).
  preAmazon?: boolean
}

// Events main pushes to the renderer over IPC.loginEvent while a login runs.
export type LoginEvent =
  | { type: 'prompt'; kind: LoginPromptKind; captchaUrl?: string; message?: string }
  | { type: 'status'; message: string }
  // External (browser) login: the Amazon URL the user must open and complete.
  | { type: 'external-url'; url: string }
  | { type: 'done'; success: boolean; error?: string }

// A chapter within a downloaded audiobook.
export interface Chapter {
  title: string
  // Start offset in seconds from the beginning of the book.
  startSec: number
  // Length of the chapter in seconds.
  lengthSec: number
}

// State of a locally downloaded book.
export type DownloadState = 'idle' | 'downloading' | 'decrypting' | 'ready' | 'error'

// A book that has been downloaded (or is being downloaded) to local storage.
export interface LocalBook {
  asin: string
  title: string
  subtitle?: string
  authors: string[]
  narrators: string[]
  coverUrl?: string
  // Total audio length in seconds (from the decrypted file / chapters).
  durationSec?: number
  // Bytes the decrypted file occupies on disk.
  sizeBytes?: number
  state: DownloadState
  addedAt: number
  chapters: Chapter[]
}

// Progress events main pushes while a download/decrypt runs.
export type DownloadEvent =
  | { type: 'progress'; asin: string; state: DownloadState; percent?: number; message?: string }
  | { type: 'done'; asin: string; book: LocalBook }
  | { type: 'error'; asin: string; error: string }

// Everything the player needs to start playback of a local book.
export interface MediaInfo {
  asin: string
  title: string
  authors: string[]
  // URL the renderer's <audio> element can load (custom streaming protocol).
  src: string
  coverUrl?: string
  durationSec?: number
  chapters: Chapter[]
}

// Saved playback position for a book.
export interface PlaybackPosition {
  asin: string
  positionSec: number
  updatedAt: number
}
