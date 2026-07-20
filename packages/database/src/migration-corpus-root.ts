import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_ROOT_URL = new URL('../drizzle/', import.meta.url);
export const CANONICAL_ROOT = resolve(fileURLToPath(CANONICAL_ROOT_URL));

export function corpusChild(root: string, name: string): string | null {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    isAbsolute(name)
  ) {
    return null;
  }
  const candidate = join(root, name);
  const child = relative(root, candidate);
  if (
    !child ||
    isAbsolute(child) ||
    child === '..' ||
    child.startsWith('../') ||
    child.startsWith('..\\')
  ) {
    return null;
  }
  return candidate;
}

export function isContained(realRoot: string, candidate: string): boolean {
  const child = relative(realRoot, candidate);
  return (
    Boolean(child) &&
    !isAbsolute(child) &&
    child !== '..' &&
    !child.startsWith('../') &&
    !child.startsWith('..\\')
  );
}
