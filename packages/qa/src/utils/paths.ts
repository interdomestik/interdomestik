import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RepoRootSource = 'MCP_REPO_ROOT' | 'module-relative' | 'cwd-search';

const REPO_MARKERS = ['turbo.json', 'pnpm-workspace.yaml'] as const;

function realpathIfPossible(resolvedPath: string): string {
  try {
    return fs.realpathSync.native(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function canonicalizeAbsoluteCandidate(candidate: string): string | null {
  if (!candidate || candidate.includes('\0') || !path.isAbsolute(candidate)) {
    return null;
  }

  return realpathIfPossible(candidate);
}

function realpathWithExistingParent(resolvedPath: string): string {
  const missingSegments: string[] = [];
  let currentPath = resolvedPath;
  while (true) {
    try {
      const canonicalCurrent = fs.realpathSync.native(currentPath);
      return path.join(canonicalCurrent, ...missingSegments.reverse());
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return resolvedPath;
      }
      missingSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

function hasRepoMarker(dir: string): boolean {
  return REPO_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)));
}

export function canonicalizeRepoRoot(candidate: string): string | null {
  const canonicalCandidate = canonicalizeAbsoluteCandidate(candidate);
  return canonicalCandidate === REPO_ROOT ? REPO_ROOT : null;
}

function findRepoRoot(startDir: string): string | null {
  let currentDir = realpathIfPossible(path.resolve(startDir));

  while (true) {
    if (hasRepoMarker(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function selectTrustedEnvRoot(candidate: string | undefined, trustedRoots: Array<string | null>) {
  if (!candidate) {
    return null;
  }

  const canonicalCandidate = canonicalizeAbsoluteCandidate(candidate);
  for (const trustedRoot of trustedRoots) {
    if (trustedRoot && canonicalCandidate === trustedRoot) {
      return trustedRoot;
    }
  }

  return null;
}

function resolveRepoRoot(): { repoRoot: string; source: RepoRootSource } {
  const cwdRoot = findRepoRoot(process.cwd());
  const moduleRoot = findRepoRoot(path.resolve(__dirname, '../../../..'));
  const envRoot = selectTrustedEnvRoot(process.env.MCP_REPO_ROOT, [cwdRoot, moduleRoot]);
  if (envRoot) {
    return { repoRoot: envRoot, source: 'MCP_REPO_ROOT' };
  }

  if (moduleRoot) {
    return { repoRoot: moduleRoot, source: 'module-relative' };
  }

  if (cwdRoot) {
    return { repoRoot: cwdRoot, source: 'cwd-search' };
  }

  throw new Error('Unable to resolve a repository root with required repo markers');
}

function assertRelativeInput(relativePath: string): void {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Path must be a non-empty repository-relative path');
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error(`Path must be repository-relative: ${relativePath}`);
  }
}

function isWithin(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function resolveRepoPath(relativePath: string, repoRoot = REPO_ROOT) {
  const canonicalRoot = canonicalizeRepoRoot(repoRoot);
  if (!canonicalRoot) {
    throw new Error(`Repository root must be the canonical trusted repo root: ${repoRoot}`);
  }

  assertRelativeInput(relativePath);
  const resolvedPath = path.resolve(canonicalRoot, relativePath);
  if (!isWithin(resolvedPath, canonicalRoot)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }

  const canonicalPath = realpathWithExistingParent(resolvedPath);
  if (!isWithin(canonicalPath, canonicalRoot)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }

  return {
    relativePath: path.relative(canonicalRoot, resolvedPath),
    resolvedPath,
  };
}

const resolvedRoot = resolveRepoRoot();

export const REPO_ROOT = resolvedRoot.repoRoot;
export const REPO_ROOT_SOURCE = resolvedRoot.source;

export const WEB_APP = resolveRepoPath('apps/web').resolvedPath;
