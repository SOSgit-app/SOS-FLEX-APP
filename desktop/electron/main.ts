import { app, BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const FLASK_PORT = Number(process.env.PORT ?? '5000');
const FLASK_URL = `http://127.0.0.1:${FLASK_PORT}/`;

let flaskProc: ChildProcessWithoutNullStreams | null = null;

function isDev() {
  return !app.isPackaged;
}

function waitForBackend(url: string, timeoutMs = 60000): Promise<void> {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Backend did not become ready at ${url} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tick, 400);
      });
    };

    tick();
  });
}

function startBundledBackend() {
  if (flaskProc) return;

  // Packaged installs ship a frozen backend.exe (Python runtime + deps included).
  // End users do NOT need Python installed.
  const backendExe = path.resolve(process.resourcesPath, 'backend', 'flex-backend.exe');
  const appRoot = path.resolve(process.resourcesPath, 'app');

  if (!fs.existsSync(backendExe)) {
    dialog.showErrorBox(
      'Backend missing',
      `Could not find bundled backend executable:\n${backendExe}\n\nRebuild with: npm run package:win`
    );
    throw new Error(`Missing backend exe at ${backendExe}`);
  }

  flaskProc = spawn(backendExe, [], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(FLASK_PORT),
      FLASK_DEBUG: '0'
    },
    stdio: 'pipe',
    windowsHide: true
  });

  flaskProc.on('error', (err) => {
    dialog.showErrorBox('Backend failed to start', String(err));
  });

  flaskProc.stdout.on('data', (d) => console.log(`[backend] ${String(d)}`));
  flaskProc.stderr.on('data', (d) => console.error(`[backend] ${String(d)}`));
  flaskProc.on('exit', (code) => console.log(`[backend] exited ${code}`));
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1f3f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`did-fail-load (${code}) ${desc} ${url}`);
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev()) {
    // Dev mode: Flask is started separately by `npm run dev:flask` (requires Python on the build machine).
    await win.loadURL('http://127.0.0.1:5173/');
    win.webContents.openDevTools({ mode: 'detach' });
    return win;
  }

  // Packaged mode: start bundled backend, wait until it's ready, then open it.
  startBundledBackend();

  try {
    await waitForBackend(FLASK_URL);
    await win.loadURL(FLASK_URL);
  } catch (e) {
    dialog.showErrorBox(
      'Backend failed to start',
      `The packaged backend did not start.\n\n${(e as Error).message}`
    );
    await win.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  }

  if (process.env.ELECTRON_DEBUG === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    flaskProc?.kill();
  } catch {
    // ignore
  }
});
