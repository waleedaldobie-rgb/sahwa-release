import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_METHODS = Object.freeze([
  'addPayment',
  'adjustStock',
  'returnPurchase',
  'sendWhatsAppNotice',
  'updateOrderStatus',
  'updateSetting',
]);

export const TARGET_CHANNELS = Object.freeze([
  'invoices:addPayment',
  'orders:updateStatus',
  'settings:update',
  'stock:adjust',
  'stock:returnPurchase',
  'whatsapp:send',
]);

const TARGET_NAMES = new Set([...TARGET_METHODS, ...TARGET_CHANNELS]);
const SCANNABLE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const SCANNED_ROOTS = Object.freeze(['src', 'scripts']);
const EXCLUDED_FILES = new Set(['scripts/check-legacy-ipc.smoke.mjs']);

function skipTrivia(source, index) {
  let cursor = index;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) {
      cursor += 1;
      continue;
    }
    if (source.startsWith('//', cursor)) {
      const newline = source.indexOf('\n', cursor + 2);
      cursor = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2);
      cursor = end === -1 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index);
  const line = prefix.split('\n').length;
  const lastNewline = prefix.lastIndexOf('\n');
  return { line, column: index - lastNewline };
}

function hasTopLevelComma(source, argumentStart) {
  let depth = 0;
  let quote = null;
  for (let cursor = argumentStart; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === '\\\\') cursor += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) return false;
      depth -= 1;
      continue;
    }
    if (character === ',' && depth === 0) return true;
  }
  return false;
}

function violationForArgument(source, argumentStart, file, name, kind) {
  const firstArgument = skipTrivia(source, argumentStart);
  if (source[firstArgument] === ')' || !hasTopLevelComma(source, firstArgument)) return null;
  const position = lineAndColumn(source, firstArgument);
  return {
    file,
    line: position.line,
    column: position.column,
    name,
    kind,
    message: `IPC call '${name}' must pass one payload argument; positional arguments are not allowed here.`,
  };
}

function collectDirectCalls(source, file, violations) {
  const directCallPattern = /\bwindow\.electronAPI(?:\?\.)?\.(addPayment|adjustStock|returnPurchase|sendWhatsAppNotice|updateOrderStatus|updateSetting)\s*\(/g;
  for (const match of source.matchAll(directCallPattern)) {
    const openParen = source.indexOf('(', match.index);
    const violation = violationForArgument(source, openParen + 1, file, match[1], 'public-api');
    if (violation) violations.push(violation);
  }

  const aliasedCallPattern = /\bapi\.(addPayment|adjustStock|returnPurchase|sendWhatsAppNotice|updateOrderStatus|updateSetting)\s*\(/g;
  for (const match of source.matchAll(aliasedCallPattern)) {
    const openParen = source.indexOf('(', match.index);
    const violation = violationForArgument(source, openParen + 1, file, match[1], 'aliased-api');
    if (violation) violations.push(violation);
  }
}

function collectHelperCalls(source, file, violations) {
  const helperCallPattern = /\bcall\s*\(\s*(['"])([^'"]+)\1\s*,/g;
  for (const match of source.matchAll(helperCallPattern)) {
    if (!TARGET_NAMES.has(match[2])) continue;
    const comma = source.indexOf(',', match.index);
    const violation = violationForArgument(source, comma + 1, file, match[2], 'integration-helper');
    if (violation) violations.push(violation);
  }
}

export function findLegacyIpcViolations(source, file = '<inline>') {
  const violations = [];
  collectDirectCalls(source, file, violations);
  collectHelperCalls(source, file, violations);
  return violations;
}

function collectFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return SCANNABLE_EXTENSIONS.has(path.extname(absolutePath)) ? [absolutePath] : [];
  const files = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(root, path.relative(root, child)));
    else if (SCANNABLE_EXTENSIONS.has(path.extname(child))) files.push(child);
  }
  return files;
}

export function scanRepository(root = process.cwd()) {
  const violations = [];
  const files = SCANNED_ROOTS.flatMap((relativePath) => collectFiles(root, relativePath));
  for (const file of files) {
    const relativeFile = path.relative(root, file).split(path.sep).join('/');
    if (EXCLUDED_FILES.has(relativeFile)) continue;
    const source = fs.readFileSync(file, 'utf8');
    violations.push(...findLegacyIpcViolations(source, relativeFile));
  }
  return violations.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column);
}

export function formatViolations(violations) {
  return violations.map((violation) => `${violation.file}:${violation.line}:${violation.column} ${violation.message}`).join('\n');
}

function isMainModule() {
  const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return invokedFile === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const violations = scanRepository(process.cwd());
  if (violations.length > 0) {
    console.error(`Legacy IPC static guard failed with ${violations.length} violation(s):`);
    console.error(formatViolations(violations));
    process.exitCode = 1;
  } else {
    console.log(`Legacy IPC static guard passed: scanned ${SCANNED_ROOTS.join(', ')} with no positional callers.`);
  }
}
