#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GIT = '/usr/bin/git';
const ORIGIN = 'https://github.com/interdomestik/interdomestik';
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROOT = path.join(os.homedir(), '.codex/mcp-runtimes/interdomestik-qa');
const SHA40 = /^[a-f0-9]{40}$/u;

function must(value, message) {
  if (!value) throw new Error(message);
}

function git(root, args) {
  return execFileSync(GIT, ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  }).trim();
}

function normalizeOrigin(value) {
  return value
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/\.git$/u, '')
    .replace(/\/$/u, '');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalDirectory(candidate) {
  must(
    typeof candidate === 'string' && path.isAbsolute(candidate),
    'control root must be absolute'
  );
  const root = fs.realpathSync.native(candidate);
  must(fs.statSync(root).isDirectory(), 'control root must be a directory');
  return root;
}

function selectedRoot(explicitRoot) {
  if (explicitRoot) return explicitRoot;
  if (process.env.INTERDOMESTIK_QA_CONTROL_ROOT) {
    must(
      attachedTestMode() ||
        path.resolve(process.env.INTERDOMESTIK_QA_CONTROL_ROOT) === path.resolve(DEFAULT_ROOT),
      'control root override is restricted to the canonical runtime'
    );
    return process.env.INTERDOMESTIK_QA_CONTROL_ROOT;
  }
  if (fs.existsSync(DEFAULT_ROOT)) return DEFAULT_ROOT;
  must(process.env.CI === 'true', 'canonical interdomestik_qa control runtime is unavailable');
  return SCRIPT_ROOT;
}

function attachedTestMode() {
  return process.env.NODE_ENV === 'test' && process.env.INTERDOMESTIK_QA_CONTROL_TEST_MODE === '1';
}

export function resolveQaControlRuntime(options = {}) {
  const root = canonicalDirectory(selectedRoot(options.root));
  must(git(root, ['rev-parse', '--show-toplevel']) === root, 'control source root mismatch');
  must(git(root, ['status', '--porcelain=v1']) === '', 'control source must be clean');
  const branch = git(root, ['branch', '--show-current']);
  must(
    branch === '' || options.allowAttached === true || attachedTestMode(),
    'control source attached'
  );
  const head = git(root, ['rev-parse', '--verify', 'HEAD']);
  must(SHA40.test(head), 'control source head is invalid');
  const commonDir = fs.realpathSync.native(
    git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  );
  must(path.basename(commonDir) === '.git', 'control source common directory is invalid');
  must(normalizeOrigin(git(root, ['remote', 'get-url', 'origin'])) === ORIGIN, 'origin mismatch');
  for (const required of [
    'pnpm-workspace.yaml',
    'turbo.json',
    'packages/qa/src/index.ts',
    'scripts/start-repo-qa.sh',
  ]) {
    must(fs.existsSync(path.join(root, required)), `control source missing ${required}`);
  }
  const dependencyRoot = [root, path.dirname(commonDir)].find(candidate =>
    fs.existsSync(path.join(candidate, 'node_modules/.bin/tsx'))
  );
  must(dependencyRoot, 'control source dependencies are unavailable');
  return {
    branch: branch || null,
    commonDir,
    dependencyRoot: fs.realpathSync.native(dependencyRoot),
    head,
    origin: ORIGIN,
    root,
  };
}

export function advanceQaControlRuntime({ expectedHead, nextHead, root }) {
  const before = resolveQaControlRuntime({ root });
  must(before.head === expectedHead && SHA40.test(nextHead), 'runtime CAS preimage mismatch');
  git(before.root, ['cat-file', '-e', `${nextHead}^{commit}`]);
  try {
    git(before.root, ['merge-base', '--is-ancestor', expectedHead, nextHead]);
  } catch {
    throw new Error('runtime next head must descend from the preimage');
  }
  try {
    git(before.root, ['checkout', '--detach', nextHead]);
    const after = resolveQaControlRuntime({ root: before.root });
    must(after.head === nextHead, 'runtime CAS postimage mismatch');
    return { before, after };
  } catch (error) {
    const observed = git(before.root, ['rev-parse', '--verify', 'HEAD']);
    if (observed === nextHead && git(before.root, ['status', '--porcelain=v1']) === '') {
      git(before.root, ['checkout', '--detach', expectedHead]);
    }
    throw error;
  }
}

function canonicalFilePath(pathname) {
  must(typeof pathname === 'string' && path.isAbsolute(pathname), 'registration path is unsafe');
  const parent = fs.realpathSync.native(path.dirname(pathname));
  must(fs.statSync(parent).isDirectory(), 'registration path is unsafe');
  return path.join(parent, path.basename(pathname));
}

function secureFile(pathname) {
  const stat = fs.lstatSync(pathname);
  must(stat.isFile() && stat.nlink === 1, 'registration path is unsafe');
  return fs.readFileSync(pathname);
}

export function writeRegistrationCas({ expectedSha256, nextBytes, pathname }) {
  const canonicalPath = canonicalFilePath(pathname);
  const before = secureFile(canonicalPath);
  must(sha256(before) === expectedSha256, 'registration CAS preimage mismatch');
  const temporary = `${canonicalPath}.tmp-${sha256(nextBytes)}`;
  const descriptor = fs.openSync(
    temporary,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    fs.writeFileSync(descriptor, nextBytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    must(
      sha256(secureFile(canonicalPath)) === expectedSha256,
      'registration CAS changed concurrently'
    );
    fs.renameSync(temporary, canonicalPath);
    const directory = fs.openSync(path.dirname(canonicalPath), 'r');
    fs.fsyncSync(directory);
    fs.closeSync(directory);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
  return { beforeSha256: expectedSha256, afterSha256: sha256(nextBytes) };
}

export function rollbackRegistrationCas({ expectedPostimageSha256, pathname, preimageBytes }) {
  return writeRegistrationCas({
    expectedSha256: expectedPostimageSha256,
    nextBytes: preimageBytes,
    pathname,
  });
}

function printField(runtime, field) {
  const fields = {
    root: runtime.root,
    head: runtime.head,
    'dependency-root': runtime.dependencyRoot,
  };
  must(Object.hasOwn(fields, field), `unknown field: ${field}`);
  process.stdout.write(`${fields[field]}\n`);
}

if (process.argv[1] && fs.realpathSync.native(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const field = process.argv.find(argument => argument.startsWith('--field='))?.slice(8);
  try {
    const runtime = resolveQaControlRuntime();
    if (field) printField(runtime, field);
    else process.stdout.write(`${JSON.stringify(runtime)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
