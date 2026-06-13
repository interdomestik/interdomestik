import fs from 'node:fs';

import { fetchRepositoryFileContent } from './github-pr-files-lib.mjs';
import { readPackageJsonFixture } from './package-json-fixture-lib.mjs';

export function fail(commandName, message) {
  process.stderr.write(`${commandName} failed: ${message}\n`);
  process.exit(1);
}

export function parsePolicyArgs(argv, commandName) {
  const parsed = {
    eventName: '',
    eventPath: '',
    changedFilesPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--event-name') {
      parsed.eventName = nextValue || '';
      index += 1;
    } else if (argument === '--event-path') {
      parsed.eventPath = nextValue || '';
      index += 1;
    } else if (argument === '--changed-files-path') {
      parsed.changedFilesPath = nextValue || '';
      index += 1;
    } else {
      fail(commandName, `unknown argument: ${argument}`);
    }
  }

  if (!parsed.eventName) {
    fail(commandName, '--event-name is required');
  }

  return parsed;
}

export function readEvent(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

export function readChangedFiles(changedFilesPath) {
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    return [];
  }

  return fs
    .readFileSync(changedFilesPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export async function readPackageJsonDiff({ event, changedFiles }) {
  if (!changedFiles.includes('package.json')) {
    return null;
  }

  const repositoryFullName = String(event?.repository?.full_name || '').trim();
  const baseRef = String(event?.pull_request?.base?.sha || '').trim();
  const headRef = String(event?.pull_request?.head?.sha || '').trim();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const beforeFixture = readPackageJsonFixture(baseRef);
  const afterFixture = readPackageJsonFixture(headRef);

  if (beforeFixture || afterFixture) {
    return {
      available: true,
      beforeContent: beforeFixture,
      afterContent: afterFixture,
    };
  }

  if (!repositoryFullName || !baseRef || !headRef || !token) {
    return { available: false, error: 'analysis_unavailable' };
  }

  try {
    const [beforeContent, afterContent] = await Promise.all([
      fetchRepositoryFileContent({
        repositoryFullName,
        filePath: 'package.json',
        ref: baseRef,
        token,
      }),
      fetchRepositoryFileContent({
        repositoryFullName,
        filePath: 'package.json',
        ref: headRef,
        token,
      }),
    ]);

    return { available: true, beforeContent, afterContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, error: `analysis_failed:${message}` };
  }
}
