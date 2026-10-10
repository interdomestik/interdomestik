import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { ADOPTION } from './db-access-adoption.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const SOURCE = /\.[cm]?[jt]sx?$/u;
export const ROOT = /^(apps\/web\/src\/|packages\/)/u;
export const resolverFile = file =>
  /^(?:(?:apps|packages)\/.*\/)?(?:package\.json|tsconfig(?:\.[^/]*)?\.json|next\.config\.[cm]?[jt]s|\.pnpmfile\.cjs)$|^pnpm-workspace\.yaml$/u.test(
    file
  );
const GENERATED = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u;
export const historicalExclusion = file =>
  /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$|\.d\.ts$|^apps\/web\/src\/app\/api\/e2e\/|^packages\/database\//u.test(
    file
  );

function git(repoRoot, args, input) {
  return execFileSync('git', ['--no-replace-objects', '-C', repoRoot, ...args], {
    input,
    maxBuffer: 96 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

// Exported for the test-only harness. Production CLI always passes ADOPTION.
export function authenticateSnapshot(repoRoot, adoption = ADOPTION) {
  if (!/^[a-f0-9]{40}$/u.test(adoption.commit) || !/^[a-f0-9]{40}$/u.test(adoption.tree)) {
    throw new Error('incomplete: invalid trusted identity');
  }
  const tree = git(repoRoot, ['show', '-s', '--format=%T', adoption.commit]).toString().trim();
  if (tree !== adoption.tree) throw new Error('incomplete: trusted tree mismatch');
  const listing = git(repoRoot, ['ls-tree', '-rz', adoption.commit])
    .toString()
    .split('\0')
    .filter(Boolean);
  const blobs = new Map(
    listing.map(row => {
      const [metadata, file] = row.split('\t');
      const [mode, kind, oid] = metadata.split(' ');
      return [file, { mode, kind, oid }];
    })
  );
  const validatedPolicy = new Map();
  // Authenticate policy/closure first, before source exclusion decisions.
  for (const [file, expected] of Object.entries(adoption.files)) {
    const item = blobs.get(file);
    if (!item || item.kind !== 'blob' || item.mode === '120000')
      throw new Error(`incomplete: missing trusted blob ${file}`);
    const content = git(repoRoot, ['cat-file', 'blob', item.oid]);
    if (digest(content) !== expected)
      throw new Error(`incomplete: trusted digest mismatch ${file}`);
    validatedPolicy.set(file, content.toString());
  }
  const selected = [...blobs].filter(
    ([file]) =>
      ((ROOT.test(file) && SOURCE.test(file)) || resolverFile(file)) && !GENERATED.test(file)
  );
  const output = git(
    repoRoot,
    ['cat-file', '--batch'],
    selected.map(([, item]) => item.oid).join('\n') + '\n'
  );
  const sources = new Map();
  let offset = 0;
  for (const [file, item] of selected) {
    const end = output.indexOf(10, offset);
    const [oid, kind, length] = output.subarray(offset, end).toString().split(' ');
    if (oid !== item.oid || kind !== 'blob' || !/^\d+$/u.test(length))
      throw new Error('incomplete: invalid trusted materialization');
    offset = end + 1;
    const bytes = output.subarray(offset, offset + Number(length));
    if (item.mode === '120000') throw new Error(`incomplete: trusted source symlink ${file}`);
    sources.set(file, bytes.toString());
    offset += Number(length) + 1;
  }
  for (const [file, content] of validatedPolicy)
    if (file.endsWith('/tsconfig.json')) sources.set(file, content);
  return sources;
}

export function candidateSources(repoRoot) {
  const sources = new Map();
  function walk(relative) {
    const full = path.join(repoRoot, relative);
    if (!fs.existsSync(full)) return;
    if (
      fs.lstatSync(full).isSymbolicLink() ||
      !fs.realpathSync(full).startsWith(fs.realpathSync(repoRoot) + path.sep)
    )
      throw new Error(`incomplete: candidate path escape ${relative}`);
    if (relative.split('/').length > 80) throw new Error('incomplete: source depth bound exceeded');
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const file = `${relative}/${item.name}`;
      if (GENERATED.test(file)) continue;
      if (item.isSymbolicLink()) throw new Error(`incomplete: candidate source symlink ${file}`);
      if (item.isDirectory()) walk(file);
      else if (SOURCE.test(file))
        sources.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8'));
    }
  }
  walk('apps/web/src');
  walk('packages');
  if (
    sources.size > 15000 ||
    [...sources.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0) >
      64 * 1024 * 1024
  )
    throw new Error('incomplete: source bound exceeded');
  const folded = new Set();
  for (const file of sources.keys()) {
    const key = file.normalize('NFC').toLowerCase();
    if (folded.has(key)) throw new Error(`incomplete: source path collision ${file}`);
    folded.add(key);
  }
  return sources;
}

export function boundaryChanges(repoRoot, adoption) {
  return Object.entries(adoption.files)
    .filter(([file, hash]) => {
      const full = path.join(repoRoot, file);
      return (
        !fs.existsSync(full) ||
        fs.lstatSync(full).isSymbolicLink() ||
        digest(fs.readFileSync(full)) !== hash
      );
    })
    .map(([file]) => file);
}

export function verifyResolverBoundary(repoRoot, trusted) {
  const candidates = new Map();
  function collect(relative, depth = 0) {
    const full = path.join(repoRoot, relative);
    if (!fs.existsSync(full)) return;
    if (depth > 80 || fs.lstatSync(full).isSymbolicLink())
      throw new Error('incomplete: resolver path escape');
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const file = relative ? relative + '/' + item.name : item.name;
      if (GENERATED.test(file) || ['.git', 'tmp', '.codex', '.agents'].includes(item.name))
        continue;
      if (item.isDirectory()) {
        if (relative || ['apps', 'packages'].includes(item.name)) collect(file, depth + 1);
      } else if (resolverFile(file)) {
        if (item.isSymbolicLink()) throw new Error('incomplete: resolver symlink');
        candidates.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8'));
      }
    }
  }
  collect('');
  const fields = [
    'name',
    'exports',
    'main',
    'module',
    'imports',
    'browser',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'pnpm',
  ];
  const stable = value =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item
    );
  for (const file of new Set([...candidates.keys(), ...[...trusted.keys()].filter(resolverFile)])) {
    const before = trusted.get(file),
      after = candidates.get(file);
    if (before === undefined || after === undefined)
      throw new Error('incomplete: resolver boundary changed ' + file);
    if (file.endsWith('package.json')) {
      const original = JSON.parse(before),
        candidate = JSON.parse(after);
      for (const key of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ])
        for (const [name, spec] of Object.entries(candidate[key] ?? {}))
          if (name.startsWith('@interdomestik/') && !spec.startsWith('workspace:'))
            throw new Error('incomplete: workspace dependency boundary ' + file);
      if (stable(fields.map(key => original[key])) !== stable(fields.map(key => candidate[key])))
        throw new Error('incomplete: resolver boundary changed ' + file);
    } else if (file.includes('tsconfig') && file.endsWith('.json')) {
      const original = ts.parseConfigFileTextToJson(file, before),
        candidate = ts.parseConfigFileTextToJson(file, after);
      if (original.error || candidate.error || stable(original.config) !== stable(candidate.config))
        throw new Error('incomplete: resolver boundary changed ' + file);
      for (const base of [original.config.extends ?? []].flat()) {
        if (typeof base !== 'string' || !base.startsWith('.'))
          throw new Error('incomplete: unsupported trusted tsconfig extends ' + file);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), base));
        if (!trusted.has(target) && !trusted.has(target + '.json'))
          throw new Error('incomplete: unmaterialized trusted tsconfig extends ' + file);
      }
    } else if (before !== after) throw new Error('incomplete: resolver boundary changed ' + file);
  }
}
