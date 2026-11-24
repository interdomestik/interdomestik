// Bind every executable bundler config and its full local import closure by raw bytes.
//
// The closure admits a closed grammar only: `.mjs` ES modules that load other code solely through
// top-level static `import`/`export … from` statements with literal specifiers. A local specifier is
// a plain-character relative `.mjs` path resolved by path arithmetic alone; a bare specifier must be
// a proven external package (never a builtin, an alias, workspace code or a self-reference). Every
// other loader form refuses. The value binds file bytes, each import's exact target, the externals
// and each closure file's package scope, so any change to what the build executes changes it.

import { execFileSync } from 'node:child_process';
import path from 'node:path/posix';
import ts from 'typescript';
import { hasParallelTarget } from './modules.mjs';
import { pathRuleMatch } from './resolution.mjs';
import { byCodeUnit, sha256 } from './rules-digest.mjs';
import { APP_ALIASES } from './sources.mjs';
import { bundlerGrammarProblem, NODE_BUILTINS } from './bundler-closure-grammar.mjs';

export const BUNDLER_CONFIG_NAME = /^next\.config\.[cm]?[jt]s$/iu;
const WORKSPACE_DIR = /^(?:apps|packages)\/[^/]+$/iu;
const GENERATED = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/iu;
export const LOCAL =
  /^(?:\.\/|(?:\.\.\/)+)(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.mjs$/u;
const BARE =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/u;
const REGULAR = /^100(?:644|755)$/u;
const SPECIAL = new Map([
  ['package.json', 'package.json'],
  ['node_modules', 'node_modules'],
]);
const fold = value => value.replace(/[A-Z]/gu, letter => letter.toLowerCase());

const ancestors = file => {
  const dirs = [];
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    dirs.push(dir === '.' ? '' : dir);
    if (dir === '.') return dirs;
  }
};
const join = (dir, name) => (dir ? `${dir}/${name}` : name);
// Fixture images carry no `kind`; a Git listing names every directory `tree`.
const isBlob = (tree, file) => {
  const entry = tree.files.get(file);
  return !!entry && (entry.kind ?? 'blob') === 'blob' && REGULAR.test(entry.mode);
};

/** Every node of the tree listing (files and directories), indexed by its ASCII case fold. */
function foldIndex(tree) {
  const nodes = new Map();
  const add = node => {
    const key = fold(node);
    if (!nodes.has(key)) nodes.set(key, new Set());
    nodes.get(key).add(node);
  };
  for (const file of tree.files.keys()) {
    const parts = file.split('/');
    for (let end = 1; end <= parts.length; end += 1) add(parts.slice(0, end).join('/'));
  }
  return nodes;
}

// Any other spelling of a prefix of the file, at any depth (case-insensitive filesystems).
function prefixCollision(index, file) {
  const parts = file.split('/');
  for (let end = 1; end <= parts.length; end += 1) {
    const prefix = parts.slice(0, end).join('/');
    const other = [...(index.get(fold(prefix)) ?? [])].find(node => node !== prefix);
    if (other) return `case-fold collision ${other} with ${prefix}`;
  }
  return null;
}

// A package.json or node_modules beside an ancestor: non-canonical spellings and any tracked
// node_modules refuse, so Node's scope and module lookup cannot be redirected by tracked files.
function ancestorProblem(index, file, dir) {
  for (const [name, canonical] of SPECIAL) {
    const other = [...(index.get(fold(join(dir, name))) ?? [])].find(
      node => node !== join(dir, canonical)
    );
    if (other) return `non-canonical ${name} ${other}`;
  }
  return index.has(fold(join(dir, 'node_modules'))) ? `tracked node_modules above ${file}` : null;
}

function caseProblem(index, file) {
  return (
    prefixCollision(index, file) ??
    ancestors(file).reduce((found, dir) => found ?? ancestorProblem(index, file, dir), null)
  );
}

function scopeOf(tree, file) {
  for (const dir of ancestors(file)) {
    const manifest = join(dir, 'package.json');
    if (!tree.files.has(manifest)) continue;
    if (!isBlob(tree, manifest) || !tree.blobs.has(manifest))
      return { reason: `unreadable package scope ${manifest}` };
    let parsed;
    try {
      parsed = JSON.parse(tree.blobs.get(manifest));
    } catch {
      return { reason: `unparseable package scope ${manifest}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { reason: `unparseable package scope ${manifest}` };
    const pick = key => (Object.hasOwn(parsed, key) ? parsed[key] : null);
    const fields = {
      name: pick('name'),
      exports: pick('exports'),
      imports: pick('imports'),
      type: pick('type'),
    };
    return { record: [file, manifest, fields] };
  }
  return { record: [file, null, null] };
}

const packageName = specifier =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

function externalProblem(tree, importer, specifier, scope) {
  const name = packageName(specifier);
  if (!BARE.test(specifier) || specifier.split('/').some(part => part === '..' || part === '.'))
    return `unsupported specifier ${specifier}`;
  if (NODE_BUILTINS.has(name) || NODE_BUILTINS.has(specifier)) return `builtin ${specifier}`;
  if (tree.resolution.pathRules.some(({ pattern }) => pathRuleMatch(pattern, specifier) !== null))
    return `path rule matches ${specifier}`;
  if (APP_ALIASES.some(([prefix]) => specifier.startsWith(prefix)))
    return `app alias matches ${specifier}`;
  if (tree.packages.has(name)) return `workspace package ${specifier}`;
  if (tree.inventory.resolveSpecifier(importer, specifier).external !== specifier)
    return `workspace resolution of ${specifier}`;
  for (const root of tree.resolution.baseRoots) {
    const stem = path.join(root || '.', specifier);
    if (tree.files.has(`${stem}.ts`) || hasParallelTarget(tree.files, stem))
      return `workspace candidate ${specifier}`;
  }
  if (scope[2]?.name === name) return `self-reference ${specifier}`;
  return null;
}

function moduleOf(tree, file) {
  if (!file.endsWith('.mjs')) return { reason: `non-module closure file ${file}` };
  if (!isBlob(tree, file) || !tree.allSources.has(file))
    return { reason: `missing closure file ${file}` };
  const text = tree.allSources.get(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) return { reason: `unparseable closure file ${file}` };
  const grammar = bundlerGrammarProblem(source);
  if (grammar) return { reason: `${grammar} in ${file}` };
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check', '-'], {
      input: text,
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 10000,
    });
  } catch {
    return { reason: `invalid ES module ${file}` };
  }
  return { source, text };
}

function localTargetOf(tree, file, specifier) {
  if (!LOCAL.test(specifier)) return { reason: `unsupported local specifier ${specifier}` };
  const target = path.normalize(path.join(path.dirname(file), specifier));
  if (BUNDLER_CONFIG_NAME.test(path.basename(target)))
    return { reason: `bundler config imported by ${file}` };
  if (target.startsWith('../') || !isBlob(tree, target))
    return { reason: `missing local target ${specifier} from ${file}` };
  return { target };
}

function edgesOf(tree, file, source, scope) {
  const edges = [];
  const seen = new Set();
  for (const statement of source.statements) {
    const specifier = statement.moduleSpecifier?.text;
    if (specifier === undefined || seen.has(specifier)) continue;
    seen.add(specifier);
    if (specifier.startsWith('.')) {
      const local = localTargetOf(tree, file, specifier);
      if (local.reason) return local;
      edges.push([file, specifier, local.target]);
      continue;
    }
    const problem = externalProblem(tree, file, specifier, scope);
    if (problem) return { reason: `${problem} from ${file}` };
    edges.push([file, specifier, `external:${specifier}`]);
  }
  return { edges };
}

export function isRoot(file) {
  // Direct workspace configs stay visible so a generated-looking workspace cannot hide one.
  return (
    BUNDLER_CONFIG_NAME.test(path.basename(file)) &&
    (!GENERATED.test(file) || WORKSPACE_DIR.test(path.dirname(file)))
  );
}

// One closure file: its case and grammar proofs, package scope and import edges.
function closureEntry(tree, index, file) {
  if (GENERATED.test(file)) return { reason: `bundler config under a generated directory ${file}` };
  const name = path.basename(file);
  if (BUNDLER_CONFIG_NAME.test(name) && name !== fold(name))
    return { reason: `non-canonical config ${file}` };
  const problem = caseProblem(index, file);
  if (problem) return { reason: problem };
  const module = moduleOf(tree, file);
  if (module.reason) return module;
  const scope = scopeOf(tree, file);
  if (scope.reason) return scope;
  const found = edgesOf(tree, file, module.source, scope.record);
  if (found.reason) return found;
  return { digest: sha256(module.text), scope: scope.record, edges: found.edges };
}

function walk(tree) {
  const index = foldIndex(tree);
  const files = new Map();
  const edges = [];
  const scopes = [];
  const queue = [...tree.files.keys()]
    .filter(file => isRoot(file))
    .sort((a, b) => byCodeUnit(a, b));
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    const entry = closureEntry(tree, index, file);
    if (entry.reason) return entry;
    files.set(file, entry.digest);
    scopes.push(entry.scope);
    edges.push(...entry.edges);
    queue.push(
      ...entry.edges.map(edge => edge[2]).filter(target => !target.startsWith('external:'))
    );
  }
  return { files, edges, scopes };
}

/** The canonical bundler closure of an authenticated tree image, or the reason it is unbindable. */
export function bundlerClosure(tree) {
  const { files, edges, scopes, reason } = walk(tree);
  if (reason) return { reason: `unbindable bundler closure: ${reason}` };
  const key = value => JSON.stringify(value);
  const sorted = list => [...list].sort((left, right) => byCodeUnit(key(left), key(right)));
  return {
    value: {
      files: sorted([...files]),
      edges: sorted(edges),
      externals: [
        ...new Set(edges.filter(edge => edge[2].startsWith('external:')).map(edge => edge[1])),
      ].sort((a, b) => byCodeUnit(a, b)),
      scopes: sorted(scopes),
    },
  };
}
