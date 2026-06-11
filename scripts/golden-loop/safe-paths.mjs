import fs from 'node:fs';
import path from 'node:path';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/u;

function inside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function safeName(value, label) {
  if (!SAFE_NAME.test(value || '')) throw new Error(`${label} must be a safe id`);
  return value;
}

export function safeRoot(input, cwd = process.cwd()) {
  const root = path.resolve(cwd, input || 'tmp/golden-loop');
  const base = path.resolve(cwd);
  if (!inside(base, root)) throw new Error('root must stay inside the repository checkout');
  return root;
}

export function safeJoin(root, ...segments) {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  if (!inside(base, target)) throw new Error('resolved path escapes root');
  return target;
}

export function safeReadText(filePath, cwd = process.cwd()) {
  const target = safeJoin(cwd, filePath);
  return fs.readFileSync(target, 'utf8');
}

export function safeReadJson(filePath, cwd = process.cwd()) {
  return JSON.parse(safeReadText(filePath, cwd));
}
