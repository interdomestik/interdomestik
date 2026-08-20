import fs from 'node:fs';
import path from 'node:path';
import { execAsync } from '../utils/exec.js';
import {
  resolveToolRepoPath,
  resolveToolRepoRoot,
  type ToolRepoArgs,
  type ToolRepoContext,
} from '../utils/tool-repo-root.js';

type TextToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

type ChangedFile = {
  path: string;
  status: string;
};

const DEFAULT_SCOPE_FORBIDDEN_PATHS = [
  'apps/web/src/proxy.ts',
  'AGENTS.md',
  'README.md',
  'docs/architecture',
  'docs/architecture.md',
];

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function isNonEmptyFilePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatReadRange(file: string, lines: string[], startLine: number, endLine: number) {
  const width = String(endLine).length;
  const body = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => `${String(startLine + index).padStart(width, ' ')} | ${line}`)
    .join('\n');

  return `--- ${file}:${startLine}-${endLine} ---\n${body}`;
}

function parsePorcelainStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const hasPorcelainSeparator = line[2] === ' ';
      const status = hasPorcelainSeparator
        ? line.slice(0, 2).trim() || 'unknown'
        : line.slice(0, 1).trim() || 'unknown';
      const rawPath = hasPorcelainSeparator ? line.slice(3) : line.slice(2);
      const parsedPath = rawPath.includes(' -> ')
        ? rawPath.split(' -> ').at(-1) || rawPath
        : rawPath;

      return {
        path: parsedPath,
        status,
      };
    });
}

function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, ...paths] = line.split('\t');
      return {
        path: paths.at(-1) || '',
        status,
      };
    })
    .filter(file => file.path);
}

function trimTrailingSlashes(value: string) {
  let result = value;

  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

function pathMatchesPrefix(filePath: string, prefix: string) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const normalizedPrefix = trimTrailingSlashes(prefix.replaceAll('\\', '/'));

  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function repoIdentityFields(context: ToolRepoContext) {
  return context;
}

export { codeSearch } from './repo-search.js';

export async function projectMap(args: ToolRepoArgs & { maxDepth?: number }) {
  const context = resolveToolRepoRoot(args);
  const { repoRoot } = context;
  const maxDepth = args?.maxDepth || 3;
  let stdout = '';

  try {
    const result = await execAsync({ args: ['--files'], file: 'rg' }, { cwd: repoRoot });
    stdout = result.stdout;
  } catch {
    const result = await execAsync({ args: ['ls-files'], file: 'git' }, { cwd: repoRoot });
    stdout = result.stdout;
  }

  const sortedOutput = stdout
    .split('\n')
    .filter(Boolean)
    .filter(file => file.split('/').length <= maxDepth)
    .sort((left, right) => left.localeCompare(right))
    .join('\n');

  return {
    content: [{ type: 'text', text: `PROJECT MAP (Depth ${maxDepth}):\n\n${sortedOutput}` }],
    structuredContent: {
      depth: maxDepth,
      entries: sortedOutput ? sortedOutput.split('\n').length : 0,
      ...repoIdentityFields(context),
      tool: 'project_map',
    },
  };
}

export async function readFiles(args: ToolRepoArgs & { files: string[] }) {
  const context = resolveToolRepoRoot(args);
  if (!Array.isArray(args.files)) {
    return {
      content: [{ type: 'text', text: 'files must be an array of repository-relative paths' }],
      isError: true,
      structuredContent: { ...repoIdentityFields(context), status: 'error', tool: 'read_files' },
    };
  }
  const results = [];
  let failures = 0;
  for (const file of args.files) {
    if (!isNonEmptyFilePath(file)) {
      failures += 1;
      results.push(
        `--- ${String(file)} ---\n(Error reading file: Path must be a non-empty string)\n`
      );
      continue;
    }
    try {
      const { resolvedPath } = resolveToolRepoPath(context.repoRoot, file);
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        results.push(`--- ${file} ---\n${content}\n`);
      } else {
        failures += 1;
        results.push(`--- ${file} ---\n(File not found)\n`);
      }
    } catch (e: any) {
      failures += 1;
      results.push(`--- ${file} ---\n(Error reading file: ${e.message})\n`);
    }
  }
  const status = failures === 0 ? 'ok' : failures === args.files.length ? 'error' : 'partial_error';
  return {
    content: [{ type: 'text', text: results.join('\n') }],
    isError: failures > 0,
    structuredContent: {
      failures,
      ...repoIdentityFields(context),
      status,
      tool: 'read_files',
    },
  };
}

export async function readFileRange(
  args: ToolRepoArgs & {
    context?: number;
    endLine?: number;
    file: string;
    startLine?: number;
  }
): Promise<TextToolResult> {
  let toolContext: ToolRepoContext | undefined;
  try {
    const context = resolveToolRepoRoot(args);
    toolContext = context;
    if (!isNonEmptyFilePath(args.file)) {
      return {
        content: [{ type: 'text', text: 'file must be a non-empty string' }],
        isError: true,
        structuredContent: {
          ...repoIdentityFields(context),
          status: 'error',
          tool: 'read_file_range',
        },
      };
    }
    const { relativePath, resolvedPath } = resolveToolRepoPath(context.repoRoot, args.file);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return {
        content: [{ type: 'text', text: `File not found: ${relativePath}` }],
        isError: true,
        structuredContent: {
          file: relativePath,
          ...repoIdentityFields(context),
          status: 'not_found',
          tool: 'read_file_range',
        },
      };
    }

    const surroundingContext = normalizeNonNegativeInteger(args.context, 0);
    const lines = fs.readFileSync(resolvedPath, 'utf-8').split('\n');
    const requestedStart = normalizePositiveInteger(args.startLine, 1);

    if (requestedStart > lines.length) {
      return {
        content: [
          {
            type: 'text',
            text: `Requested start line ${requestedStart} is outside ${relativePath}; file has ${lines.length} lines.`,
          },
        ],
        isError: true,
        structuredContent: {
          endLine: lines.length,
          file: relativePath,
          linesRead: 0,
          ...repoIdentityFields(context),
          startLine: lines.length,
          status: 'out_of_bounds',
          tool: 'read_file_range',
          totalLines: lines.length,
        },
      };
    }

    const requestedEnd = normalizePositiveInteger(
      args.endLine,
      Math.min(lines.length, requestedStart + 199)
    );
    const startLine = Math.max(1, requestedStart - surroundingContext);
    const endLine = Math.min(
      lines.length,
      Math.max(requestedStart, requestedEnd) + surroundingContext
    );

    return {
      content: [{ type: 'text', text: formatReadRange(relativePath, lines, startLine, endLine) }],
      structuredContent: {
        endLine,
        file: relativePath,
        linesRead: endLine - startLine + 1,
        ...repoIdentityFields(context),
        startLine,
        status: 'ok',
        tool: 'read_file_range',
        totalLines: lines.length,
      },
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error reading file range: ${error.message}` }],
      isError: true,
      structuredContent: {
        ...(toolContext ? repoIdentityFields(toolContext) : {}),
        status: 'error',
        tool: 'read_file_range',
      },
    };
  }
}

export async function gitStatus(args: ToolRepoArgs) {
  const context = resolveToolRepoRoot(args);
  const { stdout } = await execAsync({ args: ['status'], file: 'git' }, { cwd: context.repoRoot });
  return {
    content: [
      {
        type: 'text',
        text: [
          `repoRoot: ${context.repoRoot}`,
          `repoRootSource: ${context.repoRootSource}`,
          stdout,
        ].join('\n'),
      },
    ],
    structuredContent: {
      status: 'ok',
      ...repoIdentityFields(context),
      tool: 'git_status',
    },
  };
}

export async function gitStatusCompact(args: ToolRepoArgs) {
  const context = resolveToolRepoRoot(args);
  const { stdout } = await execAsync(
    { args: ['status', '--short', '--branch'], file: 'git' },
    { cwd: context.repoRoot }
  );
  const lines = stdout.split('\n').filter(Boolean);

  return {
    content: [
      {
        type: 'text',
        text: [
          `repoRoot: ${context.repoRoot}`,
          `repoRootSource: ${context.repoRootSource}`,
          stdout || '## clean',
        ].join('\n'),
      },
    ],
    structuredContent: {
      changedCount: Math.max(0, lines.length - 1),
      isClean: lines.length <= 1,
      ...repoIdentityFields(context),
      status: 'ok',
      tool: 'git_status_compact',
    },
  };
}

export async function gitDiff(args: ToolRepoArgs & { cached?: boolean }) {
  const context = resolveToolRepoRoot(args);
  const command = args?.cached
    ? { args: ['diff', '--cached'], file: 'git' }
    : { args: ['diff'], file: 'git' };
  const { stdout } = await execAsync(command, { cwd: context.repoRoot });
  return {
    content: [{ type: 'text', text: stdout || '(No changes)' }],
    structuredContent: { ...repoIdentityFields(context), status: 'ok', tool: 'git_diff' },
  };
}

export async function gitBranchInfo(args: ToolRepoArgs): Promise<TextToolResult> {
  const context = resolveToolRepoRoot(args);
  const { repoRoot } = context;
  const current = (
    await execAsync({ args: ['branch', '--show-current'], file: 'git' }, { cwd: repoRoot })
  ).stdout.trim();
  const head = (
    await execAsync({ args: ['rev-parse', '--verify', 'HEAD'], file: 'git' }, { cwd: repoRoot })
  ).stdout.trim();
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;

  try {
    upstream = (
      await execAsync(
        { args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], file: 'git' },
        { cwd: repoRoot }
      )
    ).stdout.trim();
  } catch {
    upstream = null;
  }

  if (upstream) {
    const counts = (
      await execAsync(
        { args: ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], file: 'git' },
        { cwd: repoRoot }
      )
    ).stdout
      .trim()
      .split(/\s+/)
      .map(Number);

    behind = counts[0] || 0;
    ahead = counts[1] || 0;
  }

  return {
    content: [
      {
        type: 'text',
        text: [
          `repoRoot: ${context.repoRoot}`,
          `repoRootSource: ${context.repoRootSource}`,
          `branch: ${current || '(detached)'}`,
          `head: ${head}`,
          `upstream: ${upstream || '(none)'}`,
          `ahead: ${ahead}`,
          `behind: ${behind}`,
        ].join('\n'),
      },
    ],
    structuredContent: {
      ahead,
      behind,
      branch: current || null,
      isDetached: !current,
      head,
      ...repoIdentityFields(context),
      status: 'ok',
      tool: 'git_branch_info',
      upstream,
    },
  };
}

export async function changedFiles(
  args: ToolRepoArgs & { staged?: boolean }
): Promise<TextToolResult> {
  const context = resolveToolRepoRoot(args);
  const command = args?.staged
    ? { args: ['diff', '--cached', '--name-status'], file: 'git' }
    : { args: ['status', '--porcelain=v1'], file: 'git' };
  const { stdout } = await execAsync(command, { cwd: context.repoRoot });
  const files = args?.staged ? parseNameStatus(stdout) : parsePorcelainStatus(stdout);
  const text = files.length
    ? files.map(file => `${file.status.padEnd(2)} ${file.path}`).join('\n')
    : '(No changed files)';

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      count: files.length,
      files,
      ...repoIdentityFields(context),
      staged: Boolean(args?.staged),
      status: 'ok',
      tool: 'changed_files',
    },
  };
}

export async function scopeAudit(
  args: ToolRepoArgs & {
    allowedPaths?: string[];
    forbiddenPaths?: string[];
  }
): Promise<TextToolResult> {
  const context = resolveToolRepoRoot(args);
  const changed = await changedFiles({ repoRoot: context.repoRoot });
  const files = ((changed.structuredContent?.files as ChangedFile[]) ?? []).map(file => file.path);
  const allowedPaths = args?.allowedPaths ?? [];
  const forbiddenPaths = args?.forbiddenPaths ?? DEFAULT_SCOPE_FORBIDDEN_PATHS;
  const outsideAllowed = allowedPaths.length
    ? files.filter(file => !allowedPaths.some(allowedPath => pathMatchesPrefix(file, allowedPath)))
    : [];
  const forbiddenChanged = files.filter(file =>
    forbiddenPaths.some(forbiddenPath => pathMatchesPrefix(file, forbiddenPath))
  );
  const passed = outsideAllowed.length === 0 && forbiddenChanged.length === 0;

  return {
    content: [
      {
        type: 'text',
        text: [
          passed ? 'SCOPE AUDIT PASSED' : 'SCOPE AUDIT FAILED',
          `Changed files: ${files.length}`,
          allowedPaths.length
            ? `Allowed paths: ${allowedPaths.join(', ')}`
            : 'Allowed paths: unrestricted',
          `Forbidden paths: ${forbiddenPaths.join(', ')}`,
          forbiddenChanged.length ? `Forbidden changed:\n${forbiddenChanged.join('\n')}` : null,
          outsideAllowed.length ? `Outside allowed:\n${outsideAllowed.join('\n')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    isError: !passed,
    structuredContent: {
      allowedPaths,
      changedFiles: files,
      forbiddenChanged,
      forbiddenPaths,
      outsideAllowed,
      ...repoIdentityFields(context),
      status: passed ? 'pass' : 'fail',
      tool: 'scope_audit',
    },
  };
}
