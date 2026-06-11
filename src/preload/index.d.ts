import { ElectronAPI } from '@electron-toolkit/preload'
import type { AudibleApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    audible: AudibleApi
  }
}

export {}
