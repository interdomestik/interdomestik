import fs from 'node:fs';
import path from 'node:path';
import { execAsync } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';

export async function projectMap(args?: { maxDepth?: number }) {
  const maxDepth = args?.maxDepth || 3;
  const { stdout } = await execAsync(
    {
      args: [
        '.',
        '-maxdepth',
        String(maxDepth),
        '-not',
        '-path',
        '*/.*',
        '-not',
        '-path',
        '*/node_modules*',
        '-not',
        '-path',
        '*/dist*',
      ],
      file: 'find',
    },
    { cwd: REPO_ROOT }
  );
  const sortedOutput = stdout
    .split('\n')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
  return {
    content: [{ type: 'text', text: `PROJECT MAP (Depth ${maxDepth}):\n\n${sortedOutput}` }],
  };
}

export async function readFiles(args: { files: string[] }) {
  const results = [];
  for (const file of args.files) {
    try {
      const filePath = path.join(REPO_ROOT, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
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

export async function gitStatus() {
  const { stdout } = await execAsync({ args: ['status'], file: 'git' }, { cwd: REPO_ROOT });
  return { content: [{ type: 'text', text: stdout }] };
}

export async function gitDiff(args?: { cached?: boolean }) {
  const command = args?.cached
    ? { args: ['diff', '--cached'], file: 'git' }
    : { args: ['diff'], file: 'git' };
  const { stdout } = await execAsync(command, { cwd: REPO_ROOT });
  return { content: [{ type: 'text', text: stdout || '(No changes)' }] };
}

export async function codeSearch(args: { query: string; filePattern?: string }) {
  const { query, filePattern } = args;
  const command = {
    args: ['grep', '-n', '-I', query, '--', filePattern || '.'],
    file: 'git',
  };
  try {
    const { stdout } = await execAsync(command, { cwd: REPO_ROOT });
    if (!stdout) return { content: [{ type: 'text', text: 'No matches found.' }] };
    return {
      content: [
        { type: 'text', text: `SEARCH RESULTS for "${query}":\n\n${stdout.slice(0, 10000)}` },
      ],
    };
  } catch (e: any) {
    if (e.exitCode === 1) return { content: [{ type: 'text', text: 'No matches found.' }] };
    return { content: [{ type: 'text', text: `Error searching: ${e.message}` }] };
  }
}
