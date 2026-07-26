#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

import { fetchPullRequestFiles, readPullRequestContext } from './github-pr-files-lib.mjs';
import { trustedRunnerFile } from './trusted-runner-file.mjs';

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
const eventPath = trustedRunnerFile(parsed.eventPath);
const { repositoryFullName } = parsed;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

let pullRequestContext;

try {
  pullRequestContext = readPullRequestContext(eventPath, repositoryFullName);
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
    appendFileSync(
      trustedRunnerFile(process.env.GITHUB_OUTPUT),
      `changed_file_count=${fileCount}\n`
    );
  }

  if (files.length > 0) {
    process.stdout.write(`${files.join('\n')}\n`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
