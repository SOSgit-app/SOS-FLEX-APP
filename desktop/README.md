# Desktop app (Electron + Vite)

## Run (developer mode)

From the `desktop` folder:

```bat
npm install
npm run dev
```

## Build a clickable Windows installer (.exe)

From the `desktop` folder:

```bat
npm install
npm run package:win
```

Output goes to `desktop\release\` (look for the installer `.exe`).

## Note about Python

This desktop wrapper runs your existing Flask app locally. The packaged `.exe` **still requires Python 3 installed** on the machine (because the Flask backend is Python).

