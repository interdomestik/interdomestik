import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths.js';

export type ToolRepoArgs = { repoRoot?: string };

export type ToolRepoContext = {
  repoRoot: string;
  repoRootSource: 'tool-argument';
  serverSourceHead: string;
  serverSourceRoot: string;
  targetBranch: string | null;
  targetHead: string;
  targetRepoRoot: string;
};

export type ToolRepoErrorContext = {
  repoRootSource: 'tool-argument';
  serverSourceHead: string | null;
  serverSourceRoot: string | null;
  targetBranch: null;
  targetHead: null;
  targetRepoRoot: null;
};

const REPO_MARKERS = ['turbo.json', 'pnpm-workspace.yaml'] as const;
const GIT_BIN = '/usr/bin/git';

function gitPath(repoRoot: string, ...args: string[]): string {
  return execFileSync(GIT_BIN, ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  }).trim();
}

function observedServerSourceIdentity() {
  let serverSourceRoot: string | null = null;
  let serverSourceHead: string | null = null;
  try {
    serverSourceRoot = canonicalDirectory(process.env.MCP_SERVER_SOURCE_ROOT || REPO_ROOT);
    serverSourceHead = gitPath(serverSourceRoot, 'rev-parse', '--verify', 'HEAD');
  } catch {
    // Preserve explicit nulls when even the observed source identity is unavailable.
  }
  return { serverSourceHead, serverSourceRoot };
}

function serverSourceIdentity() {
  const { serverSourceHead, serverSourceRoot } = observedServerSourceIdentity();
  if (!serverSourceRoot || !serverSourceHead) {
    throw new Error('MCP server source identity is unavailable');
  }
  if (serverSourceRoot !== REPO_ROOT) {
    throw new Error('MCP server source must match the loaded QA package root');
  }
  const expectedHead = process.env.MCP_SERVER_SOURCE_HEAD;
  const launchedServer = process.env.MCP_SERVER_NAME === 'interdomestik_qa';
  if (launchedServer && !expectedHead) {
    throw new Error('MCP server source head attestation is required');
  }
  if (expectedHead && expectedHead !== serverSourceHead) {
    throw new Error('MCP server source head does not match the launcher attestation');
  }
  if (expectedHead && gitPath(serverSourceRoot, 'status', '--porcelain=v1') !== '') {
    throw new Error('MCP server source must remain clean');
  }
  const branch = gitPath(serverSourceRoot, 'branch', '--show-current');
  const testMode =
    process.env.NODE_ENV === 'test' && process.env.INTERDOMESTIK_QA_CONTROL_TEST_MODE === '1';
  if (expectedHead && branch && !testMode) {
    throw new Error('MCP server source must remain detached');
  }
  return { serverSourceHead, serverSourceRoot };
}

function canonicalDirectory(candidate: string): string {
  if (!candidate || candidate.includes('\0') || !path.isAbsolute(candidate)) {
    throw new Error('repoRoot must be an absolute worktree root');
  }

  let canonical: string;
  try {
    canonical = fs.realpathSync.native(candidate);
  } catch {
    throw new Error('repoRoot must be an existing worktree root');
  }

  if (!fs.statSync(canonical).isDirectory()) {
    throw new Error('repoRoot must be an existing worktree root');
  }
  return canonical;
}

function registeredWorktrees(): Set<string> {
  const records = gitPath(REPO_ROOT, 'worktree', 'list', '--porcelain').split('\n\n');
  const roots = new Set<string>();
  for (const record of records) {
    const lines = record.split('\n');
    if (lines.some(line => line.startsWith('prunable'))) continue;
    const entry = lines.find(line => line.startsWith('worktree '));
    if (!entry) continue;
    try {
      roots.add(fs.realpathSync.native(entry.slice('worktree '.length)));
    } catch {
      // A missing registered path is not selectable.
    }
  }
  return roots;
}

function realpathWithExistingParent(resolvedPath: string): string {
  const missingSegments: string[] = [];
  let current = resolvedPath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return resolvedPath;
    missingSegments.push(path.basename(current));
    current = parent;
  }
  const orderedSegments: string[] = [];
  for (let index = missingSegments.length - 1; index >= 0; index -= 1) {
    orderedSegments.push(missingSegments[index]);
  }
  return path.join(fs.realpathSync.native(current), ...orderedSegments);
}

export function resolveToolRepoRoot(args: ToolRepoArgs): ToolRepoContext {
  const source = serverSourceIdentity();
  if (typeof args.repoRoot !== 'string' || !args.repoRoot.trim()) {
    throw new Error('repoRoot is required for repo-bound MCP tools');
  }

  const repoRoot = canonicalDirectory(args.repoRoot);
  if (!registeredWorktrees().has(repoRoot)) {
    throw new Error('repoRoot must be a registered worktree of the MCP server repository');
  }
  if (!REPO_MARKERS.every(marker => fs.existsSync(path.join(repoRoot, marker)))) {
    throw new Error('repoRoot must contain the required Interdomestik repository markers');
  }

  const targetHead = gitPath(repoRoot, 'rev-parse', '--verify', 'HEAD');
  const targetBranch = gitPath(repoRoot, 'branch', '--show-current') || null;
  return {
    repoRoot,
    repoRootSource: 'tool-argument',
    ...source,
    targetBranch,
    targetHead,
    targetRepoRoot: repoRoot,
  };
}

export function unresolvedToolRepoContext(): ToolRepoErrorContext {
  return {
    repoRootSource: 'tool-argument',
    ...observedServerSourceIdentity(),
    targetBranch: null,
    targetHead: null,
    targetRepoRoot: null,
  };
}

export function resolveToolRepoPath(repoRoot: string, relativeInput: string) {
  if (!relativeInput || relativeInput.includes('\0') || path.isAbsolute(relativeInput)) {
    throw new Error('Path must be a non-empty repository-relative path');
  }

  const resolvedPath = path.resolve(repoRoot, relativeInput);
  const relativePath = path.relative(repoRoot, resolvedPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path escapes repository root: ${relativeInput}`);
  }

  const canonicalPath = realpathWithExistingParent(resolvedPath);
  const canonicalRelative = path.relative(repoRoot, canonicalPath);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
    throw new Error(`Path escapes repository root: ${relativeInput}`);
  }

  return {
    relativePath,
    resolvedPath: fs.existsSync(resolvedPath) ? canonicalPath : resolvedPath,
  };
}
