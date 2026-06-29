import fs from 'node:fs';
import path from 'node:path';
import { canonicalizeRepoRoot, resolveRepoPath } from '../../utils/paths.js';

const ROOT_ENV_FILE_CANDIDATES = ['.env.local', '.env.development.local', '.env'] as const;

export function checkFileExists(
  filePath: string,
  description: string
): { check: string | null; issue: string | null } {
  if (fs.existsSync(filePath)) {
    return { check: `✅ ${description} exists`, issue: null };
  }
  return { check: null, issue: `❌ Missing ${description} (${path.basename(filePath)})` };
}

export function checkFileContains(
  filePath: string,
  search: string,
  description: string
): { check: string | null; issue: string | null } {
  if (!fs.existsSync(filePath)) {
    return { check: null, issue: `❌ Missing file for ${description} check` };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes(search)) {
    return { check: `✅ ${description} configured`, issue: null };
  }
  return { check: null, issue: `⚠️ ${description} not found in ${path.basename(filePath)}` };
}

export function findRootEnvFile(repoRoot: string): string | null {
  const canonicalRoot = canonicalizeRepoRoot(repoRoot);
  if (!canonicalRoot) {
    return null;
  }

  for (const candidate of ROOT_ENV_FILE_CANDIDATES) {
    const candidatePath = resolveRepoPath(candidate, canonicalRoot).resolvedPath;
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return null;
}
