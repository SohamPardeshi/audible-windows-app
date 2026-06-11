// Shared constants describing Audible marketplaces and the device profile we
// register as. These values mirror what the official iOS app sends so that the
// reverse-engineered API accepts our requests.

export interface Marketplace {
  countryCode: string
  // Top-level domain suffix, e.g. "com" for amazon.com / audible.com
  domain: string
  marketplaceId: string
  // Default locale string used by some endpoints
  locale: string
}

export const MARKETPLACES: Record<string, Marketplace> = {
  us: { countryCode: 'us', domain: 'com', marketplaceId: 'AN7V1F1VY261K', locale: 'en_US' },
  uk: { countryCode: 'uk', domain: 'co.uk', marketplaceId: 'A2I9A3Q2GNFNGQ', locale: 'en_GB' },
  de: { countryCode: 'de', domain: 'de', marketplaceId: 'AN7EY7DTAW63G', locale: 'de_DE' },
  fr: { countryCode: 'fr', domain: 'fr', marketplaceId: 'A2728XDNODOQ8T', locale: 'fr_FR' },
  ca: { countryCode: 'ca', domain: 'ca', marketplaceId: 'A2CQZ5RBY40XE', locale: 'en_CA' },
  au: { countryCode: 'au', domain: 'com.au', marketplaceId: 'AN7EY7DTAW63G', locale: 'en_AU' },
  jp: { countryCode: 'jp', domain: 'co.jp', marketplaceId: 'A1QAP3MOU4173J', locale: 'ja_JP' },
  in: { countryCode: 'in', domain: 'in', marketplaceId: 'AJO3FBRUE6J4S', locale: 'en_IN' }
}

export const DEFAULT_MARKETPLACE = 'us'

// The device type used by the Audible Android app. The auth flow is keyed to
// this. Amazon's device-auth OAuth path now rejects the older iOS profile
// (A2CZJZGLK2JJVM bounces to /ap/404); the actively-maintained Libation client
// switched to this Android device type, which we mirror.
export const DEVICE_TYPE = 'A10KISP2GWF0E4'

// Metadata reported during device registration (Android profile).
export const DEVICE_REGISTRATION = {
  appName: 'com.audible.application',
  appVersion: '2090253826',
  appVersionName: '25.38.26',
  softwareVersion: '130050002',
  // registration_data.os_version — the full Android build fingerprint.
  osVersion: 'google/sdk_gphone64_x86_64/emu64xa:14/UPB5.230623.003/10615560:userdebug/dev-keys',
  // device_metadata.os_version — the Android API level.
  osVersionNumber: '34',
  deviceModel: 'sdk_gphone64_x86_64',
  osFamily: 'android',
  manufacturer: 'Google',
  deviceProduct: 'sdk_phone64_x86_64',
  mapVersion: 'MAPAndroidLib-1.3.40908.0',
  deviceName:
    '%FIRST_NAME%%FIRST_NAME_POSSESSIVE_STRING%%DUPE_STRATEGY_1ST%Audible Desktop'
}

// Android Chrome (webview) user-agent. Being Chromium-based, it is consistent
// with Electron's rendering engine — the iOS UA/fingerprint mismatch is what
// made the device-auth OAuth path bounce to /ap/404.
export const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; sdk_gphone64_x86_64 Build/UPB5.230623.003; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/113.0.5672.136 Mobile Safari/537.36'

// User-agent used for content download requests.
export const DOWNLOAD_USER_AGENT =
  'com.audible.playersdk.player/3.96.1 (Linux;Android 14) AndroidXMedia3/1.3.0'

// A current desktop Chrome user-agent. Amazon's high-security device-auth OAuth
// path rejects a spoofed mobile UA running on Electron's desktop Chromium engine
// (the UA/fingerprint mismatch reads as a bot), so the interactive login window
// uses a UA that matches the actual rendering engine.
export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
