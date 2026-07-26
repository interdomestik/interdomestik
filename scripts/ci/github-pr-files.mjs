#!/usr/bin/env node

import { fetchPullRequestFiles } from './github-pr-files-lib.mjs';
import { appendTrustedRunnerFile, readTrustedRunnerFile } from './trusted-runner-file.mjs';

function fail(message) {
  process.stderr.write(`github-pr-files failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    eventPath: '',
    repositoryFullName: process.env.GITHUB_REPOSITORY || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    switch (argument) {
      case '--event-path':
        parsed.eventPath = nextValue || '';
        index += 1;
        break;
      case '--repository':
        parsed.repositoryFullName = nextValue || '';
        index += 1;
        break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }

  if (!parsed.eventPath) {
    fail('--event-path is required');
  }

  return parsed;
}

const parsed = parseArgs(process.argv.slice(2));
const { repositoryFullName } = parsed;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

let pullRequestContext;

try {
  const event = JSON.parse(readTrustedRunnerFile(parsed.eventPath));
  const pullRequestNumber = event.pull_request?.number;
  const resolvedRepository =
    repositoryFullName.trim() || String(event.repository?.full_name || '').trim();

  pullRequestContext = Number.isInteger(pullRequestNumber)
    ? { repositoryFullName: resolvedRepository, pullRequestNumber }
    : null;
  if (pullRequestContext && !pullRequestContext.repositoryFullName.includes('/')) {
    throw new TypeError('repository full name is required for pull request file discovery');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (!pullRequestContext) {
  process.exit(0);
}

try {
  const evidence = await fetchPullRequestFiles({
    repositoryFullName: pullRequestContext.repositoryFullName,
    pullRequestNumber: pullRequestContext.pullRequestNumber,
    token,
  });
  const { files, fileCount } = evidence;

  if (process.env.GITHUB_OUTPUT) {
    appendTrustedRunnerFile(process.env.GITHUB_OUTPUT, `changed_file_count=${fileCount}\n`);
  }

  if (files.length > 0) {
    process.stdout.write(`${files.join('\n')}\n`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
