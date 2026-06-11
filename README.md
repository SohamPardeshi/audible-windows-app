# Audible Desktop (unofficial)

A desktop player for Audible audiobooks. It is a community
replacement for the official **Audible for Windows** app, which Amazon
[deprecated and removed from the Microsoft Store](https://help.audible.com/s/article/what-happened-to-the-audible-app-for-windows-10-11).
With the official app gone, there is no first-party way to listen to your
library on the desktop without using a browser — this app fills that gap.

> For personal use with content you have purchased. It plays your own books and
> stores nothing on Audible's servers beyond a virtual device registration you
> can remove at any time by signing out.

## How it works

Under the hood this app is a thin desktop wrapper around
[**audible-cli**](https://github.com/mkb79/audible-cli) by mkb79 (the companion
CLI to the [Audible](https://github.com/mkb79/Audible) Python library). The
CLI handles all the hard parts — device registration, login, signing API
requests, fetching your library, and downloading books — while this app drives
it as a subprocess and wraps it in an Electron + React UI.

- **Sign in** with your Amazon credentials (entered directly with Amazon).
- **Browse** your library, **download** books, and **play** them with chapter
  navigation and resume.
- **Position sync** keeps your place in step with Audible's servers, so you can
  pick up where you left off on any device.

A prebuilt `audible-cli` binary is bundled under `resources/audible-cli/` (not
committed — see below).

## Tech stack

- **Electron** + **electron-vite** (desktop shell / build)
- **React + TypeScript** (renderer UI)
- **electron-builder** (Windows installer)
- **[audible-cli](https://github.com/mkb79/audible-cli)** (Audible API access)

## Develop

```powershell
npm install
npm run dev        # launch with hot reload
npm run typecheck  # type-check both processes
```

The bundled `audible-cli` binary lives in `resources/audible-cli/` and is
gitignored. Download a Windows release from the
[audible-cli releases](https://github.com/mkb79/audible-cli/releases) and place
the executable at `resources/audible-cli/audible/audible.exe` before running.

## Build a standalone Windows app

```powershell
npm run build:win  # produces an NSIS installer under dist/
```

## Credits

This project would not exist without [audible-cli](https://github.com/mkb79/audible-cli)
and [Audible](https://github.com/mkb79/Audible) by **mkb79**.
