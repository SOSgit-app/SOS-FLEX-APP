const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');

try {
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    console.log(`Removed ${releaseDir}`);
  }
} catch (e) {
  console.warn(`Could not remove ${releaseDir}: ${e?.message ?? e}`);
}

