#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExactDelivery } from './exact-delivery-lib.mjs';

const GH_BINARY_CANDIDATES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find(item => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) throw new Error(`missing ${prefix}<value>`);
  return value;
}

function command(binary, args) {
  return execFileSync(binary, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
}

const git = (repo, args) => command('/usr/bin/git', ['-C', repo, ...args]);

function github(endpoint) {
  const binary = GH_BINARY_CANDIDATES.find(existsSync);
  if (!binary) throw new Error('trusted GitHub CLI unavailable');
  return JSON.parse(command(binary, ['api', endpoint]));
}

function commit(repo, sha) {
  const [parents, tree] = git(repo, ['show', '-s', '--format=%P%x00%T', sha]).split('\0');
  return { parents: parents ? parents.split(' ') : [], tree };
}

export function collectAuthority(repo, facts, githubCall = github) {
  const protection = githubCall(
    'repos/interdomestik/interdomestik/branches/main/protection/required_status_checks'
  );
  const pull = githubCall(`repos/interdomestik/interdomestik/pulls/${facts.pullRequest.number}`);
  const main = githubCall('repos/interdomestik/interdomestik/git/ref/heads/main');
  if (!Array.isArray(protection.checks)) throw new Error('branch protection checks unavailable');
  const commits = Object.fromEntries(
    [facts.base, facts.head, facts.testedMerge, facts.returnedMain].map(sha => [
      sha,
      commit(repo, sha),
    ])
  );
  return {
    projection: JSON.parse(
      readFileSync(join(repo, 'docs/plans/current-authority-v1.json'), 'utf8')
    ),
    origin: git(repo, ['remote', 'get-url', 'origin']),
    pullRequest: {
      number: pull.number,
      state: pull.merged ? 'MERGED' : pull.state.toUpperCase(),
      baseRef: pull.base.ref,
      headRef: pull.head.ref,
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
      mergeCommitSha: pull.merge_commit_sha,
    },
    worktree: {
      root: git(repo, ['rev-parse', '--show-toplevel']),
      commonDir: git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      head: git(repo, ['rev-parse', 'HEAD']),
      branch: git(repo, ['branch', '--show-current']),
    },
    commits,
    protectedMain: main.object.sha,
    changedPaths: git(repo, ['diff', '--name-only', facts.base, facts.head])
      .split('\n')
      .filter(Boolean),
    requiredChecks: protection.checks.map(check => ({
      context: check.context,
      appId: check.app_id,
    })),
  };
}

function main() {
  try {
    const repo = resolve(argument('repo'));
    const facts = JSON.parse(readFileSync(argument('input'), 'utf8'));
    const result = verifyExactDelivery(facts, collectAuthority(repo, facts));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`exact delivery verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
