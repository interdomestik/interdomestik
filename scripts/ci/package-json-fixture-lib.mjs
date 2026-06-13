import fs from 'node:fs';
import path from 'node:path';

export function readPackageJsonFixture(ref) {
  const root = process.env.GITHUB_PACKAGE_JSON_FIXTURE_DIR || '';
  const normalizedRef = String(ref || '').trim();

  if (process.env.NODE_ENV !== 'test' || !root || !/^[A-Za-z0-9_.-]+$/u.test(normalizedRef)) {
    return '';
  }

  const rootPath = path.resolve(root);
  const fixturePath = path.resolve(rootPath, normalizedRef, 'package.json');
  if (!fixturePath.startsWith(`${rootPath}${path.sep}`) || !fs.existsSync(fixturePath)) {
    return '';
  }

  return fs.readFileSync(fixturePath, 'utf8');
}
