import { build } from 'esbuild';
import { mkdir } from 'fs/promises';
import path from 'path';

const SRC_DIR = path.resolve('src/electron');
const OUT_DIR = path.resolve('dist-electron');

const entryPoints = ['main', 'preload', 'db', 'ipcHandlers', 'errorHandler', 'schema'].map(
  (name) => path.join(SRC_DIR, `${name}.ts`)
);

await mkdir(OUT_DIR, { recursive: true });

await build({
  entryPoints,
  outdir: OUT_DIR,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Electron and native module are resolved at runtime from node_modules,
  // never bundled into the output.
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
  minify: false,
  logLevel: 'info'
});

console.log(`Electron build complete -> ${OUT_DIR}/`);
