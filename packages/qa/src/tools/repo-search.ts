import { execAsync } from '../utils/exec.js';
import {
  resolveToolRepoRoot,
  type ToolRepoArgs,
  type ToolRepoContext,
} from '../utils/tool-repo-root.js';

const MAX_OUTPUT_CHARS = 10_000;

type CodeSearchArgs = ToolRepoArgs & {
  after?: number;
  before?: number;
  filePattern?: string;
  maxResults?: number;
  query: string;
};

function nonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function positiveInteger(value: unknown, fallback: number) {
  return Math.max(1, nonNegativeInteger(value, fallback));
}

function noMatches(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'exitCode' in error && error.exitCode === 1);
}

function cappedOutput(stdout: string) {
  if (stdout.length <= MAX_OUTPUT_CHARS) return stdout;
  const capped = stdout.slice(0, MAX_OUTPUT_CHARS);
  const lastLineBreak = capped.lastIndexOf('\n');
  return lastLineBreak > 0 ? capped.slice(0, lastLineBreak) : capped;
}

function searchResult(
  stdout: string,
  stdoutTruncated: boolean,
  engine: string,
  args: CodeSearchArgs,
  context: ToolRepoContext
) {
  const output = cappedOutput(stdout);
  return {
    content: [{ type: 'text', text: `SEARCH RESULTS for "${args.query}":\n\n${output}` }],
    structuredContent: {
      engine,
      filePattern: args.filePattern || null,
      matches: output.split('\n').filter(Boolean),
      matchesTruncated: stdoutTruncated || stdout.length > MAX_OUTPUT_CHARS,
      outputLines: output.split('\n'),
      ...context,
      status: 'ok',
      stdoutTruncated,
      tool: 'code_search',
    },
  };
}

function noMatchResult(context: ToolRepoContext) {
  return {
    content: [{ type: 'text', text: 'No matches found.' }],
    structuredContent: { ...context, status: 'ok', tool: 'code_search' },
  };
}

export async function codeSearch(args: CodeSearchArgs) {
  const context = resolveToolRepoRoot(args);
  const before = nonNegativeInteger(args.before, 0);
  const after = nonNegativeInteger(args.after, 0);
  const rgArgs = [
    '--line-number',
    '--with-filename',
    '--no-heading',
    '--smart-case',
    '--max-count',
    String(positiveInteger(args.maxResults, 200)),
  ];
  if (before) rgArgs.push('--before-context', String(before));
  if (after) rgArgs.push('--after-context', String(after));
  if (args.filePattern) rgArgs.push('--glob', args.filePattern);
  rgArgs.push('--regexp', args.query, '--');

  try {
    const result = await execAsync({ args: rgArgs, file: 'rg' }, { cwd: context.repoRoot });
    return result.stdout
      ? searchResult(result.stdout, result.stdoutTruncated, 'rg', args, context)
      : noMatchResult(context);
  } catch (error: any) {
    if (noMatches(error)) return noMatchResult(context);
    try {
      const gitArgs = ['grep', '-n', '-I', '-e', args.query, '--', args.filePattern || '.'];
      const result = await execAsync({ args: gitArgs, file: 'git' }, { cwd: context.repoRoot });
      return result.stdout
        ? searchResult(result.stdout, result.stdoutTruncated, 'git grep', args, context)
        : noMatchResult(context);
    } catch (fallbackError: any) {
      if (noMatches(fallbackError)) return noMatchResult(context);
      return {
        content: [{ type: 'text', text: `Error searching: ${fallbackError.message}` }],
        isError: true,
        structuredContent: { ...context, status: 'error', tool: 'code_search' },
      };
    }
  }
}
