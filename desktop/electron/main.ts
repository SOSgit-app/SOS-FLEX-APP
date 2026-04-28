import { app, BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FLASK_PORT = Number(process.env.PORT ?? '5000');
const FLASK_URL = `http://127.0.0.1:${FLASK_PORT}/`;

let flaskProc: ChildProcessWithoutNullStreams | null = null;

function isDev() {
  return !app.isPackaged;
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'pipe' });
    child.stdout.on('data', (d) => console.log(`[py] ${String(d)}`));
    child.stderr.on('data', (d) => console.error(`[py] ${String(d)}`));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function ensurePackagedVenv(appRoot: string) {
  const reqFile = path.resolve(appRoot, 'requirements.txt');
  const appPy = path.resolve(appRoot, 'app.py');

  const userData = app.getPath('userData');
  const venvDir = path.resolve(userData, 'py');
  const pythonExe = path.resolve(venvDir, 'Scripts', 'python.exe');
  const marker = path.resolve(venvDir, '.deps-installed');

  ensureDir(venvDir);

  if (!fs.existsSync(pythonExe)) {
    await run('py', ['-3', '-m', 'venv', venvDir], userData);
  }

  if (!fs.existsSync(marker)) {
    await run(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip'], userData);
    await run(pythonExe, ['-m', 'pip', 'install', '-r', reqFile], appRoot);
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
  }

  if (!fs.existsSync(appPy)) throw new Error(`Missing packaged app.py at ${appPy}`);
  if (!fs.existsSync(reqFile)) throw new Error(`Missing packaged requirements.txt at ${reqFile}`);

  return { pythonExe, appPy };
}

async function startFlask() {
  if (flaskProc) return;

  if (isDev()) return;

  // Packaged app: run the bundled backend.exe (no Python install required).
  const backendExe = path.resolve(process.resourcesPath, 'backend', 'flex-backend.exe');
  const appRoot = path.resolve(process.resourcesPath, 'app');

  if (!fs.existsSync(backendExe)) {
    dialog.showErrorBox(
      'Backend missing',
      `Could not find bundled backend executable:\n${backendExe}`
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
    stdio: 'pipe'
  });

  flaskProc.stdout.on('data', (d) => console.log(`[flask] ${String(d)}`));
  flaskProc.stderr.on('data', (d) => console.error(`[flask] ${String(d)}`));
  flaskProc.on('exit', (code) => console.log(`[flask] exited ${code}`));
}

async function createWindow() {
  // In development, we run Flask via `npm run dev:flask` (venv + deps).
  // In packaged builds, Electron starts Flask itself.
  if (!isDev()) await startFlask();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1f3f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  if (isDev()) {
    await win.loadURL('http://127.0.0.1:5173/');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
    // If something goes wrong in production, allow forcing DevTools via env var.
    if (process.env.ELECTRON_DEBUG === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  // Helpful for debugging (shows where the embedded app is)
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`did-fail-load (${code}) ${desc} ${url}`);
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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

