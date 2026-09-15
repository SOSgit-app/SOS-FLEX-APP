# FLEX Scheduler — GitHub Pages instance

This is a **separate browser-only** version of the FLEX scheduler for GitHub Pages.
It does **not** replace the Flask app (`app.py`) or the Electron desktop app (`desktop/`).

## Local development

```bat
cd web
npm install
npm run dev
```

## Build

```bat
cd web
npm run build
```

## Deploy

Push to `main` (or run the **Deploy GitHub Pages** workflow).

After enabling Pages in the SOS repo settings (Source: **GitHub Actions**), the site will be at:

https://sosgit-app.github.io/SOS-FLEX-APP/

## Notes

- All scheduling runs in the browser (localStorage + JS).
- Excel download uses SheetJS in the browser.
- Referee lines accept tab **or** spaces: `A08 Maj Name`.
