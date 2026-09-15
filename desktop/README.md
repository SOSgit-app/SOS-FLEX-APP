# Desktop app (Electron + Vite)

This wraps the Flask FLEX Scheduler in a local Windows desktop app.

## Important: Python is NOT required for end users

The Windows installer ships a bundled `flex-backend.exe` (built with PyInstaller).  
Installed users do **not** need Python or Node.

Python is only needed on the **build machine** when creating the installer (`npm run package:win`).

## Run (developer mode)

Developer mode still uses a local Flask process, so Python is needed for `npm run dev`:

```bat
cd desktop
npm install
npm run dev
```

## Build a local installer (.exe)

On the build machine (Python required **only here**):

```bat
cd desktop
npm install
npm run package:win
```

Output goes to a timestamped folder under:

`desktop\release-builds\`

Install from:

`SOS FLEX Scheduler Setup 0.1.0.exe`

## What the installer includes

- Electron + Vite UI
- Bundled backend (`resources/backend/flex-backend.exe`)
- Templates / public assets

End-user machines need no Python or Node.
