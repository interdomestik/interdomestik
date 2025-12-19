import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isRepoRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'turbo.json')) ||
    fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
  );
}

// Find repo root by walking up from a starting point.
function findRepoRoot(currentDir: string): string {
  if (isRepoRoot(currentDir)) {
    return currentDir;
  }

  const parentDir = path.dirname(currentDir);
  if (parentDir === currentDir) {
    // Reached system root, fallback to CWD
    return process.cwd();
  }

  return findRepoRoot(parentDir);
}

function isWithin(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

const cwdRoot = findRepoRoot(process.cwd());
const envRoot = process.env.MCP_REPO_ROOT
  ? path.resolve(process.env.MCP_REPO_ROOT)
  : null;

const resolvedEnvRoot =
  envRoot && isRepoRoot(envRoot) && isWithin(cwdRoot, envRoot)
    ? envRoot
    : null;

export const REPO_ROOT = resolvedEnvRoot ?? cwdRoot;

export const WEB_APP = path.join(REPO_ROOT, 'apps/web');
