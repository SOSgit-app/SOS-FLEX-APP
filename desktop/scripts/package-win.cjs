const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'release-builds');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, stamp);

fs.mkdirSync(outDir, { recursive: true });

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Build backend + renderer + electron main
run('npm', ['run', 'build:backend']);

const backendExe = path.join(root, 'backend-dist', 'flex-backend.exe');
if (!fs.existsSync(backendExe)) {
  console.error(`Missing bundled backend at ${backendExe}`);
  console.error('Packaging aborted: Python must be available on the BUILD machine to create flex-backend.exe, but end users do not need Python.');
  process.exit(1);
}

run('npm', ['run', 'build']);

// Package to a fresh folder to avoid Windows file-lock issues
run('npx', [
  'electron-builder',
  '--win',
  '--x64',
  `--config.directories.output=${outDir}`
]);

console.log(`\nInstaller output folder:\n  ${outDir}`);
console.log('This installer includes a bundled backend (no Python required on end-user PCs).\n');

