#!/usr/bin/env node

import { fetchPullRequestFiles, readPullRequestContext } from './github-pr-files-lib.mjs';

function fail(message) {
  process.stderr.write(`github-pr-files failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    eventPath: '',
    repositoryFullName: process.env.GITHUB_REPOSITORY || '',
    apiBaseUrl: process.env.GITHUB_API_URL || '',
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
      case '--api-base-url':
        parsed.apiBaseUrl = nextValue || '';
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

const { eventPath, repositoryFullName, apiBaseUrl } = parseArgs(process.argv.slice(2));
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
  const files = await fetchPullRequestFiles({
    apiBaseUrl,
    repositoryFullName: pullRequestContext.repositoryFullName,
    pullRequestNumber: pullRequestContext.pullRequestNumber,
    token,
  });

  if (files.length > 0) {
    process.stdout.write(`${files.join('\n')}\n`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
