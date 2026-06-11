export const IPC = {
  // Auth
  authStatus: 'auth:status',
  authLogout: 'auth:logout',
  // Interactive credential login (audible-cli subprocess)
  loginStart: 'login:start',
  loginExternalStart: 'login:external-start',
  loginTerminalStart: 'login:terminal-start',
  loginSubmit: 'login:submit',
  loginCancel: 'login:cancel',
  loginOpenUrl: 'login:open-url',
  // Channel main uses to push login progress to the renderer
  loginEvent: 'login:event',
  // Library (remote, owned titles)
  libraryFetch: 'library:fetch',
  // Downloads (local copies)
  downloadStart: 'download:start',
  downloadCancel: 'download:cancel',
  downloadList: 'download:list',
  downloadDelete: 'download:delete',
  // Channel main uses to push download progress to the renderer
  downloadEvent: 'download:event',
  // Media + playback
  mediaInfo: 'media:info',
  positionGet: 'position:get',
  positionSet: 'position:set',
  positionList: 'position:list',
  positionSyncLibrary: 'position:sync-library',
  // Channel main uses to push hardware media-key presses to the renderer
  mediaKey: 'media:key'
} as const
