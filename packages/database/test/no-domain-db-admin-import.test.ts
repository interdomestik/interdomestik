import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd(), '../..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const WEB_SRC_DIR = path.join(REPO_ROOT, 'apps', 'web', 'src');

const FORBIDDEN_PATTERNS = [
  /from\s+['"]@interdomestik\/database['"][^\n]*\bdbAdmin\b/u,
  /from\s+['"]@interdomestik\/database\/db['"][^\n]*\bdbAdmin\b/u,
];

async function getDomainSourceFiles(): Promise<string[]> {
  const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
  const domainDirs = entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('domain-'))
    .map(entry => path.join(PACKAGES_DIR, entry.name, 'src'));

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let dirEntries: Array<{ isDirectory: () => boolean; name: string }>;
    try {
      const rawEntries = await fs.readdir(dir, { withFileTypes: true });
      dirEntries = rawEntries.map(entry => ({
        isDirectory: entry.isDirectory.bind(entry),
        name: String(entry.name),
      }));
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of domainDirs) {
    await walk(dir);
  }

  return files;
}

async function getSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let dirEntries: Array<{ isDirectory: () => boolean; name: string }>;
    try {
      const rawEntries = await fs.readdir(dir, { withFileTypes: true });
      dirEntries = rawEntries.map(entry => ({
        isDirectory: entry.isDirectory.bind(entry),
        name: String(entry.name),
      }));
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

test('domain packages do not import privileged dbAdmin client', async () => {
  const files = await getDomainSourceFiles();
  const violations: string[] = [];

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    if (FORBIDDEN_PATTERNS.some(pattern => pattern.test(text))) {
      violations.push(path.relative(REPO_ROOT, file));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Forbidden dbAdmin imports found in domain packages:\n${violations.join('\n')}`
  );
});

test('apps/web uses dbAdmin only in /app/api routes', async () => {
  const files = await getSourceFiles(WEB_SRC_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    if (!FORBIDDEN_PATTERNS.some(pattern => pattern.test(text))) {
      continue;
    }

    const relativePath = path.relative(REPO_ROOT, file);
    const isAllowedApiPath = relativePath.startsWith('apps/web/src/app/api/');
    if (!isAllowedApiPath) {
      violations.push(relativePath);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Forbidden dbAdmin imports found outside apps/web/src/app/api:\n${violations.join('\n')}`
  );
});
