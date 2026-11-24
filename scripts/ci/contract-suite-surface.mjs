#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const ROOTS = ['apps', 'packages', 'docs'];
const DIFF_ARGS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '-z',
  '--name-status',
  '--no-renames',
  '--ignore-submodules=none',
  '--no-ext-diff',
  '--no-relative',
];

const isSha = value => typeof value === 'string' && value.length === 40 && SHA.test(value);
const full = (reason, firstPathOutside = null) => ({ lane: 'full', reason, firstPathOutside });

function nulFields(raw) {
  return typeof raw === 'string' && raw.endsWith('\0') ? raw.slice(0, -1).split('\0') : [];
}

function diffPaths(raw) {
  const fields = nulFields(raw);
  if (fields.length === 0 || fields.length % 2 !== 0) return null;

  const paths = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const file = fields[index + 1];
    if (!['A', 'D', 'M', 'T'].includes(status)) return null;
    if (file.split('/').some(part => part === '' || part === '.' || part === '..')) return null;
    paths.push(file);
  }
  return paths;
}

function evaluateSelection({ eventName, baseSha, headSha, draft }, evidence) {
  if (eventName !== 'pull_request') return full('non-pull-request');
  if (!isSha(baseSha) || !isSha(headSha)) return full('invalid-event-sha');

  const parents = evidence.parents();
  if (
    !Array.isArray(parents) ||
    parents.length !== 2 ||
    parents[0] !== baseSha ||
    parents[1] !== headSha
  ) {
    return full('merge-parents-mismatch');
  }

  const prPaths = diffPaths(evidence.prDiff());
  if (!prPaths) return full('invalid-pr-diff');
  const testedPaths = diffPaths(evidence.testedDiff());
  if (!testedPaths) return full('invalid-tested-tree-diff');

  for (const file of [...prPaths, ...testedPaths]) {
    if (!ROOTS.some(root => file.startsWith(`${root}/`)))
      return full('path-outside-product-roots', file);
  }

  if (evidence.baseHasRoots() !== true || evidence.testedHasRoots() !== true) {
    return full('missing-root-tree');
  }
  if (draft !== false) return full(draft === true ? 'draft-pr' : 'invalid-draft-flag');
  return { lane: 'product', reason: 'product-paths-only', firstPathOutside: null };
}

// The diff strings can use latin1 to carry arbitrary Git path bytes without replacement.
export function selectContractSuite(input) {
  input ??= {};
  return evaluateSelection(input, {
    parents: () => input.parents,
    prDiff: () => input.prDiff,
    testedDiff: () => input.testedDiff,
    baseHasRoots: () => input.baseHasRoots,
    testedHasRoots: () => input.testedHasRoots,
  });
}

function hasRootTrees(raw) {
  const fields = nulFields(raw);
  const names = fields.map(
    field => /^040000 tree [a-f0-9]{40}\t(apps|packages|docs)$/u.exec(field)?.[1]
  );
  return names.length === ROOTS.length && ROOTS.every(root => names.includes(root));
}

export function selectRepository({
  env = process.env,
  root = process.cwd(),
  exec = execFileSync,
} = {}) {
  const { EVENT_NAME: eventName, BASE_SHA: baseSha, HEAD_SHA: headSha, PR_DRAFT: draftText } = env;
  const draft = ['true', 'false'].includes(draftText) ? draftText === 'true' : undefined;
  const git = args =>
    exec('/usr/bin/git', args, {
      cwd: root,
      encoding: 'latin1',
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        GIT_NO_LAZY_FETCH: '1',
        GIT_NO_REPLACE_OBJECTS: '1',
      },
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
  const diff = range => git([...DIFF_ARGS, range, '--']);
  const hasRoots = ref => hasRootTrees(git(['ls-tree', '-z', '--full-tree', ref, '--', ...ROOTS]));

  try {
    let testedSha;
    return evaluateSelection(
      { eventName, baseSha, headSha, draft },
      {
        parents() {
          const output = git(['rev-list', '--parents', '-n', '1', 'HEAD']);
          if (typeof output !== 'string' || !output.endsWith('\n')) return [];
          const [commit, ...parents] = output.slice(0, -1).split(' ');
          if (!isSha(commit)) return [];
          testedSha = commit;
          return parents;
        },
        prDiff: () => diff(`${baseSha}...${headSha}`),
        testedDiff: () => diff(`${baseSha}..${testedSha}`),
        baseHasRoots: () => hasRoots(baseSha),
        testedHasRoots: () => hasRoots(testedSha),
      }
    );
  } catch (error) {
    return full(error?.code === 'ETIMEDOUT' ? 'git-timeout' : 'git-error');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Keep arbitrary path bytes printable, including C1 controls that JSON leaves literal. Each UTF-16
  // code unit is escaped on its own, so the output stays valid JSON for any input.
  const json = JSON.stringify(selectRepository()).replace(
    /[^ -~]/g,
    unit => String.raw`\u` + unit.codePointAt(0).toString(16).padStart(4, '0')
  );
  process.stdout.write(`${json}\n`);
}
