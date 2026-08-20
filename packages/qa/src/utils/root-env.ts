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

const BLOCKED_TOOL_ENV_KEYS = new Set([
  ...SAFE_PROCESS_ENV_KEYS,
  'ALL_PROXY',
  'BASH_ENV',
  'CDPATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ENV',
  'GIT_ASKPASS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GLOBIGNORE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NO_PROXY',
  'PS4',
  'SHELLOPTS',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'SSH_ASKPASS',
]);

function isBlockedToolEnvKey(key: string) {
  const normalized = key.toUpperCase();
  return (
    BLOCKED_TOOL_ENV_KEYS.has(normalized) ||
    normalized.startsWith('COREPACK_') ||
    normalized.startsWith('NPM_CONFIG_') ||
    normalized.startsWith('PNPM_CONFIG_')
  );
}

export function buildToolProcessEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const inherited = {} as NodeJS.ProcessEnv;
  for (const key of SAFE_PROCESS_ENV_KEYS) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && !isBlockedToolEnvKey(key)) inherited[key] = value;
  }
  return inherited;
}

export function loadToolEnv(repoRoot: string): Partial<NodeJS.ProcessEnv> {
  for (const candidate of ROOT_ENV_FILE_CANDIDATES) {
    const { resolvedPath } = resolveToolRepoPath(repoRoot, candidate);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) continue;
    return dotenv.parse(fs.readFileSync(resolvedPath));
  }
  return {};
}
