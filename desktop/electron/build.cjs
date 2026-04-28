const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, 'dist-electron');

// Compile emits CommonJS to dist-electron, but package.json expects main.cjs.
const from = path.resolve(outDir, 'main.js');
const to = path.resolve(outDir, 'main.cjs');

if (!fs.existsSync(from)) {
  console.error(`Expected ${from} to exist. Did tsc run?`);
  process.exit(1);
}

fs.copyFileSync(from, to);
console.log(`Wrote ${to}`);

