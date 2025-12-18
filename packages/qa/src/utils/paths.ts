import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// paths.ts is in packages/qa/src/utils
// REPO_ROOT: utils -> src -> qa -> packages -> root (4 levels up)
const defaultRoot = process.env.MCP_REPO_ROOT || path.resolve(__dirname, '../../../../');

// If the resolved root doesn't look like a repo (no package.json), fall back to cwd.
function resolveRepoRoot() {
  try {
    const pkgPath = path.join(defaultRoot, 'package.json');
    return fs.existsSync(pkgPath) ? defaultRoot : process.cwd();
  } catch {
    return process.cwd();
  }
}

export const REPO_ROOT = resolveRepoRoot();

export const WEB_APP = path.join(REPO_ROOT, 'apps/web');
