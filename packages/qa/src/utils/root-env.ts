import fs from 'node:fs';
import dotenv from 'dotenv';
import { resolveToolRepoPath } from './tool-repo-root.js';

const ROOT_ENV_FILE_CANDIDATES = ['.env.local', '.env.development.local', '.env'] as const;
const SAFE_PROCESS_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'COLORTERM',
  'CI',
  'NO_COLOR',
  'FORCE_COLOR',
  'PNPM_HOME',
  'COREPACK_HOME',
] as const;

export function buildToolProcessEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): Partial<NodeJS.ProcessEnv> {
  const inherited: Partial<NodeJS.ProcessEnv> = {};
  for (const key of SAFE_PROCESS_ENV_KEYS) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  return { ...inherited, ...overrides };
}

export function loadToolEnv(repoRoot: string): Partial<NodeJS.ProcessEnv> {
  for (const candidate of ROOT_ENV_FILE_CANDIDATES) {
    const { resolvedPath } = resolveToolRepoPath(repoRoot, candidate);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) continue;
    return dotenv.parse(fs.readFileSync(resolvedPath));
  }
  return {};
}
