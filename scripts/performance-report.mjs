import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const assetsDir = path.join(root, 'dist', 'assets');
const outputDir = path.join(root, 'performance');

if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets غير موجود؛ شغّل npm run build أولاً.');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir)
  .filter((name) => /\.(js|css|svg|woff2?)$/i.test(name))
  .map((name) => {
    const filePath = path.join(assetsDir, name);
    const content = fs.readFileSync(filePath);
    return {
      file: name,
      bytes: content.byteLength,
      gzipBytes: gzipSync(content, { level: 9 }).byteLength
    };
  })
  .sort((a, b) => b.bytes - a.bytes);

const totals = files.reduce((acc, file) => ({
  bytes: acc.bytes + file.bytes,
  gzipBytes: acc.gzipBytes + file.gzipBytes
}), { bytes: 0, gzipBytes: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  assets: files,
  totals
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'bundle-report.json'), JSON.stringify(report, null, 2));
const rows = files.map((file) => `| ${file.file} | ${(file.bytes / 1024).toFixed(1)} KB | ${(file.gzipBytes / 1024).toFixed(1)} KB |`).join('\n');
const markdown = [
  '# Bundle Performance Report',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '| Asset | Raw | Gzip |',
  '|---|---:|---:|',
  rows,
  '',
  `**Total raw:** ${(totals.bytes / 1024).toFixed(1)} KB  `,
  `**Total gzip:** ${(totals.gzipBytes / 1024).toFixed(1)} KB`,
  ''
].join('\n');
fs.writeFileSync(path.join(outputDir, 'bundle-report.md'), markdown);
console.log(markdown);
