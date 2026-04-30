import fs from 'node:fs';
import path from 'node:path';
import { execAsync } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';

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

function resolveRepoPath(file: string) {
  const resolvedPath = path.resolve(REPO_ROOT, file);
  const relativePath = path.relative(REPO_ROOT, resolvedPath);

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path escapes repository root: ${file}`);
  }

  return { relativePath, resolvedPath };
}

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

function isExpectedNoMatches(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'exitCode' in error && error.exitCode === 1);
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

export async function projectMap(args?: { maxDepth?: number }) {
  const maxDepth = args?.maxDepth || 3;
  let stdout = '';

  try {
    const result = await execAsync({ args: ['--files'], file: 'rg' }, { cwd: REPO_ROOT });
    stdout = result.stdout;
  } catch {
    const result = await execAsync({ args: ['ls-files'], file: 'git' }, { cwd: REPO_ROOT });
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
      tool: 'project_map',
    },
  };
}

export async function readFiles(args: { files: string[] }) {
  const results = [];
  for (const file of args.files) {
    try {
      const { resolvedPath } = resolveRepoPath(file);
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        results.push(`--- ${file} ---\n${content}\n`);
      } else {
        results.push(`--- ${file} ---\n(File not found)\n`);
      }
    } catch (e: any) {
      results.push(`--- ${file} ---\n(Error reading file: ${e.message})\n`);
    }
  }
  return { content: [{ type: 'text', text: results.join('\n') }] };
}

export async function readFileRange(args: {
  context?: number;
  endLine?: number;
  file: string;
  startLine?: number;
}): Promise<TextToolResult> {
  try {
    const { relativePath, resolvedPath } = resolveRepoPath(args.file);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return {
        content: [{ type: 'text', text: `File not found: ${relativePath}` }],
        isError: true,
        structuredContent: { file: relativePath, status: 'not_found', tool: 'read_file_range' },
      };
    }

    const context = normalizeNonNegativeInteger(args.context, 0);
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
    const startLine = Math.max(1, requestedStart - context);
    const endLine = Math.min(lines.length, Math.max(requestedStart, requestedEnd) + context);

    return {
      content: [{ type: 'text', text: formatReadRange(relativePath, lines, startLine, endLine) }],
      structuredContent: {
        endLine,
        file: relativePath,
        linesRead: endLine - startLine + 1,
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
      structuredContent: { status: 'error', tool: 'read_file_range' },
    };
  }
}

export async function gitStatus() {
  const { stdout } = await execAsync({ args: ['status'], file: 'git' }, { cwd: REPO_ROOT });
  return { content: [{ type: 'text', text: stdout }] };
}

export async function gitStatusCompact() {
  const { stdout } = await execAsync(
    { args: ['status', '--short', '--branch'], file: 'git' },
    { cwd: REPO_ROOT }
  );
  const lines = stdout.split('\n').filter(Boolean);

  return {
    content: [{ type: 'text', text: stdout || '## clean' }],
    structuredContent: {
      changedCount: Math.max(0, lines.length - 1),
      status: 'ok',
      tool: 'git_status_compact',
    },
  };
}

export async function gitDiff(args?: { cached?: boolean }) {
  const command = args?.cached
    ? { args: ['diff', '--cached'], file: 'git' }
    : { args: ['diff'], file: 'git' };
  const { stdout } = await execAsync(command, { cwd: REPO_ROOT });
  return { content: [{ type: 'text', text: stdout || '(No changes)' }] };
}

export async function gitBranchInfo(): Promise<TextToolResult> {
  const current = (
    await execAsync({ args: ['branch', '--show-current'], file: 'git' }, { cwd: REPO_ROOT })
  ).stdout.trim();
  const head = (
    await execAsync({ args: ['rev-parse', '--verify', 'HEAD'], file: 'git' }, { cwd: REPO_ROOT })
  ).stdout.trim();
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;

  try {
    upstream = (
      await execAsync(
        { args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], file: 'git' },
        { cwd: REPO_ROOT }
      )
    ).stdout.trim();
  } catch {
    upstream = null;
  }

  if (upstream) {
    const counts = (
      await execAsync(
        { args: ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], file: 'git' },
        { cwd: REPO_ROOT }
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
      head,
      status: 'ok',
      tool: 'git_branch_info',
      upstream,
    },
  };
}

export async function changedFiles(args?: { staged?: boolean }): Promise<TextToolResult> {
  const command = args?.staged
    ? { args: ['diff', '--cached', '--name-status'], file: 'git' }
    : { args: ['status', '--porcelain=v1'], file: 'git' };
  const { stdout } = await execAsync(command, { cwd: REPO_ROOT });
  const files = args?.staged ? parseNameStatus(stdout) : parsePorcelainStatus(stdout);
  const text = files.length
    ? files.map(file => `${file.status.padEnd(2)} ${file.path}`).join('\n')
    : '(No changed files)';

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      count: files.length,
      files,
      staged: Boolean(args?.staged),
      status: 'ok',
      tool: 'changed_files',
    },
  };
}

export async function scopeAudit(args?: {
  allowedPaths?: string[];
  forbiddenPaths?: string[];
}): Promise<TextToolResult> {
  const changed = await changedFiles();
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
      status: passed ? 'pass' : 'fail',
      tool: 'scope_audit',
    },
  };
}

export async function codeSearch(args: {
  after?: number;
  before?: number;
  filePattern?: string;
  maxResults?: number;
  query: string;
}) {
  const { query, filePattern } = args;
  const before = normalizeNonNegativeInteger(args.before, 0);
  const after = normalizeNonNegativeInteger(args.after, 0);
  const maxResults = normalizePositiveInteger(args.maxResults, 200);
  const rgArgs = [
    '--line-number',
    '--with-filename',
    '--no-heading',
    '--smart-case',
    '--max-count',
    String(maxResults),
  ];

  if (before > 0) {
    rgArgs.push('--before-context', String(before));
  }

  if (after > 0) {
    rgArgs.push('--after-context', String(after));
  }

  if (filePattern) {
    rgArgs.push('--glob', filePattern);
  }

  rgArgs.push(query);

  try {
    const { stdout } = await execAsync({ args: rgArgs, file: 'rg' }, { cwd: REPO_ROOT });
    if (!stdout) return { content: [{ type: 'text', text: 'No matches found.' }] };
    return {
      content: [
        { type: 'text', text: `SEARCH RESULTS for "${query}":\n\n${stdout.slice(0, 10000)}` },
      ],
      structuredContent: {
        engine: 'rg',
        filePattern: filePattern || null,
        status: 'ok',
        tool: 'code_search',
      },
    };
  } catch (e: any) {
    if (isExpectedNoMatches(e)) return { content: [{ type: 'text', text: 'No matches found.' }] };

    try {
      const gitGrepArgs = ['grep', '-n', '-I', query, '--', filePattern || '.'];
      const { stdout } = await execAsync({ args: gitGrepArgs, file: 'git' }, { cwd: REPO_ROOT });
      if (!stdout) return { content: [{ type: 'text', text: 'No matches found.' }] };

      return {
        content: [
          {
            type: 'text',
            text: `SEARCH RESULTS for "${query}" (git grep fallback):\n\n${stdout.slice(0, 10000)}`,
          },
        ],
        structuredContent: {
          engine: 'git grep',
          filePattern: filePattern || null,
          status: 'ok',
          tool: 'code_search',
        },
      };
    } catch (fallbackError: any) {
      if (isExpectedNoMatches(fallbackError)) {
        return { content: [{ type: 'text', text: 'No matches found.' }] };
      }

      return {
        content: [{ type: 'text', text: `Error searching: ${fallbackError.message}` }],
        isError: true,
        structuredContent: { status: 'error', tool: 'code_search' },
      };
    }
  }
}
