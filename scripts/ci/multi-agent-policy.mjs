#!/usr/bin/env node

import fs from 'node:fs';

import { fetchRepositoryFileContent } from './github-pr-files-lib.mjs';
import { evaluateMultiAgentPolicy, evaluatePackageJsonRisk } from './multi-agent-policy-lib.mjs';

function fail(message) {
  process.stderr.write(`multi-agent-policy failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    eventName: '',
    eventPath: '',
    changedFilesPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    switch (argument) {
      case '--event-name':
        parsed.eventName = nextValue || '';
        index += 1;
        break;
      case '--event-path':
        parsed.eventPath = nextValue || '';
        index += 1;
        break;
      case '--changed-files-path':
        parsed.changedFilesPath = nextValue || '';
        index += 1;
        break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }

  if (!parsed.eventName) {
    fail('--event-name is required');
  }

  return parsed;
}

function readEvent(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

function readLabels(event) {
  return (event?.pull_request?.labels || []).map(label => label?.name || '');
}

function readChangedFiles(changedFilesPath) {
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    return [];
  }

  return fs
    .readFileSync(changedFilesPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

async function resolvePackageJsonRisk({ event, changedFiles }) {
  if (!changedFiles.includes('package.json')) {
    return null;
  }

  const repositoryFullName = String(event?.repository?.full_name || '').trim();
  const baseRef = String(event?.pull_request?.base?.sha || '').trim();
  const headRef = String(event?.pull_request?.head?.sha || '').trim();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const apiBaseUrl = process.env.GITHUB_API_URL || '';

  if (!repositoryFullName || !baseRef || !headRef || !token) {
    return {
      shouldRun: true,
      matchedPaths: ['package.json:analysis_unavailable'],
    };
  }

  try {
    const [beforeContent, afterContent] = await Promise.all([
      fetchRepositoryFileContent({
        apiBaseUrl,
        repositoryFullName,
        filePath: 'package.json',
        ref: baseRef,
        token,
      }),
      fetchRepositoryFileContent({
        apiBaseUrl,
        repositoryFullName,
        filePath: 'package.json',
        ref: headRef,
        token,
      }),
    ]);

    return evaluatePackageJsonRisk({ beforeContent, afterContent });
  } catch (error) {
    return {
      shouldRun: true,
      matchedPaths: [
        `package.json:analysis_failed:${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

const { eventName, eventPath, changedFilesPath } = parseArgs(process.argv.slice(2));
const event = readEvent(eventPath);
const changedFiles = readChangedFiles(changedFilesPath);
const result = evaluateMultiAgentPolicy({
  eventName,
  labels: readLabels(event),
  changedFiles,
  packageJsonRisk: await resolvePackageJsonRisk({
    event,
    changedFiles,
  }),
});

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`matched_paths=${JSON.stringify(result.matchedPaths)}\n`);
