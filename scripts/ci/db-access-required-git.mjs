import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADOPTION_COMMIT = '278e33ab0dd448547fa81d4b0ff122b4d69c901e';
export const ADOPTION_TREE = '4f9330417466b4f7bee68349e7183db22a5260ff';
export const SOURCE_COMMIT = 'e113a98f4ec33093986cb4bb5e3ac77fcde856fa';
export const SOURCE_TREE = 'd201a534ed5f6cf06dab87268b9ccb6068908b47';
export const TS = '5.9.3';

const temporary = new Set();
function unlock(current) {
  const stat = fs.lstatSync(current, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink()) return;
  fs.chmodSync(current, stat.isDirectory() ? 0o700 : 0o600);
  if (stat.isDirectory())
    for (const name of fs.readdirSync(current)) unlock(path.join(current, name));
}
process.on('exit', () => {
  for (const dir of temporary) {
    unlock(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
export function tmp(label) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `db-required-${label}-`)));
  temporary.add(dir);
  return dir;
}

// Host Git is a fixed absolute executable with a sanitized environment; candidate PATH never selects it.
const HOST_GIT = '/usr/bin/git';
const gitEnv = Object.freeze({
  PATH: '/usr/bin:/bin',
  HOME: tmp('git-home'),
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_TERMINAL_PROMPT: '0',
});
const fixtureConfig = [
  '-c',
  'user.name=Fixture',
  '-c',
  'user.email=fixture@invalid.test',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'protocol.file.allow=always',
];
function runHostGit(cwd, args, encoding) {
  return spawnSync(HOST_GIT, ['-C', cwd, ...fixtureConfig, ...args], {
    env: gitEnv,
    encoding,
    maxBuffer: 512 * 1024 * 1024,
  });
}
export function gitBytes(cwd, ...args) {
  const result = runHostGit(cwd, args, 'buffer');
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
export function git(cwd, ...args) {
  return gitBytes(cwd, ...args)
    .toString('utf8')
    .trim();
}
export function requireCommit(revision, purpose) {
  const kind = runHostGit(rootDir, ['cat-file', '-t', revision], 'utf8').stdout?.trim();
  if (kind !== 'commit')
    throw new Error(
      `${purpose} needs commit ${revision} in local history; fetch it before running`
    );
}
export function showAt(revision, file) {
  return gitBytes(rootDir, 'show', `${revision}:${file}`);
}
export function writeFile(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { force: true });
  fs.writeFileSync(target, Array.isArray(content) ? [...content, ''].join('\n') : content);
}
export function commit(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', message, '--allow-empty');
  return git(cwd, 'rev-parse', 'HEAD');
}
