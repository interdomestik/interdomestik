import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_SCAN_ROOTS = ['apps/web/src'];
export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function parseScanArgs(argv, usage) {
  const options = {
    root: process.cwd(),
    scanRoots: DEFAULT_SCAN_ROOTS,
  };

  for (const arg of argv) {
    if (arg.startsWith('--root=')) {
      options.root = path.resolve(arg.slice('--root='.length));
      continue;
    }
    if (arg.startsWith('--scan-root=')) {
      options.scanRoots = arg
        .slice('--scan-root='.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function toPosixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

export function walkSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'coverage') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

export function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}
