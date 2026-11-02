import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { byCodeUnit } from './rules-digest.mjs';

const GIT = '/usr/bin/git';

// Module resolution inputs are candidate data, not guard authority. Every tsconfig/jsconfig in the
// workspace is parsed as data (never executed) and its `baseUrl` and `paths` become resolution
// alternatives, so an alias cannot hide a privileged module as an external package. Resolver
// options the guard does not model are refused, and the JavaScript bundler configuration, which
// can only be executed, is admitted only unchanged from the trusted tree.

const CONFIG = /^[jt]sconfig(?:\..+)?\.json$/u;
const BUNDLER_CONFIG = /^next\.config\.[cm]?[jt]s$/u;
const GENERATED = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u;
const UNMODELED_OPTIONS = ['rootDirs', 'moduleSuffixes'];
const WORKSPACE_GLOBS = ['apps/*', 'packages/*'];
const toPosix = value => value.split(path.sep).join('/');

function violation(file, detail) {
  return { rule: 'resolution-config', file, line: 1, unit: '<config>', detail };
}

/** Workspace directories named by the repository's pnpm workspace globs (apps/*, packages/*). */
export function workspaceDirs(repoRoot) {
  const dirs = [];
  for (const parent of ['apps', 'packages']) {
    const full = path.join(repoRoot, parent);
    if (!fs.existsSync(full)) continue;
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      if (item.isDirectory()) dirs.push(`${parent}/${item.name}`);
    }
  }
  return dirs.sort(byCodeUnit);
}

function configFiles(repoRoot) {
  const files = [];
  const visit = (relative, recurse) => {
    const full = path.join(repoRoot, relative);
    if (!fs.existsSync(full)) return;
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const file = relative ? `${relative}/${item.name}` : item.name;
      if (GENERATED.test(file)) continue;
      if (CONFIG.test(item.name)) {
        if (!item.isFile()) throw new Error(`incomplete: resolution config ${file} is not a file`);
        files.push(file);
      } else if (recurse && item.isDirectory() && !item.isSymbolicLink()) visit(file, true);
    }
  };
  visit('', false);
  visit('apps', true);
  visit('packages', true);
  return files.sort(byCodeUnit);
}

function readConfig(repoRoot, file) {
  const parsed = ts.parseConfigFileTextToJson(
    file,
    fs.readFileSync(path.join(repoRoot, file), 'utf8')
  );
  if (parsed.error || !parsed.config || typeof parsed.config !== 'object') {
    throw new Error(`incomplete: resolution config ${file} is not valid JSON`);
  }
  return parsed.config;
}

/**
 * The resolution alternatives every workspace config declares: `paths` rules ({ pattern, targets })
 * with repository-relative targets and `baseUrl` roots, plus violations for unsupported configs.
 */
export function resolutionConfig(repoRoot) {
  const realRoot = fs.realpathSync(repoRoot);
  const files = configFiles(repoRoot);
  const known = new Set(files);
  const violations = [];
  const effective = new Map();

  const repoPath = (fromDir, value) => {
    const joined = path.posix.normalize(path.posix.join(fromDir, toPosix(value)));
    return joined === '.' ? '' : joined;
  };

  // The effective baseUrl and paths of one config, following relative `extends` within the repository.
  function load(file, seen) {
    if (effective.has(file)) return effective.get(file);
    if (seen.has(file)) throw new Error(`incomplete: resolution config cycle at ${file}`);
    seen.add(file);
    const config = readConfig(repoRoot, file);
    const dir = path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file);
    let result = { baseUrl: null, paths: null, pathsBase: null };
    const parents = config.extends === undefined ? [] : [config.extends].flat();
    for (const parent of parents) {
      const target = typeof parent === 'string' ? repoPath(dir, parent) : null;
      const real =
        target && fs.existsSync(path.join(repoRoot, target))
          ? fs.realpathSync(path.join(repoRoot, target))
          : null;
      if (
        typeof parent !== 'string' ||
        !/^\.\.?\//u.test(parent) ||
        !known.has(target) ||
        !real?.startsWith(realRoot + path.sep)
      ) {
        violations.push(violation(file, `unsupported extends ${JSON.stringify(parent)}`));
        continue;
      }
      const inherited = load(target, seen);
      result = {
        baseUrl: inherited.baseUrl ?? result.baseUrl,
        paths: inherited.paths ?? result.paths,
        pathsBase: inherited.paths ? inherited.pathsBase : result.pathsBase,
      };
    }
    const options = config.compilerOptions ?? {};
    for (const option of UNMODELED_OPTIONS) {
      if (option in options)
        violations.push(violation(file, `unmodeled resolver option ${option}`));
    }
    if (options.baseUrl !== undefined) {
      if (typeof options.baseUrl !== 'string') {
        violations.push(violation(file, 'baseUrl is not a string'));
      } else result.baseUrl = repoPath(dir, options.baseUrl);
    }
    if (options.paths !== undefined) {
      if (!options.paths || typeof options.paths !== 'object' || Array.isArray(options.paths)) {
        violations.push(violation(file, 'paths is not an object'));
      } else {
        result.paths = options.paths;
        result.pathsBase = dir;
      }
    }
    effective.set(file, result);
    return result;
  }

  const pathRules = [];
  const baseRoots = new Set();
  for (const file of files) {
    const { baseUrl, paths, pathsBase } = load(file, new Set());
    if (baseUrl !== null) baseRoots.add(baseUrl);
    if (!paths) continue;
    const base = baseUrl ?? pathsBase;
    for (const [pattern, targets] of Object.entries(paths)) {
      if (
        (pattern.match(/\*/gu) ?? []).length > 1 ||
        !Array.isArray(targets) ||
        targets.some(
          target => typeof target !== 'string' || (target.match(/\*/gu) ?? []).length > 1
        )
      ) {
        violations.push(violation(file, `unsupported paths entry ${JSON.stringify(pattern)}`));
        continue;
      }
      pathRules.push({ pattern, targets: targets.map(target => repoPath(base, target)) });
    }
  }
  for (const root of baseRoots) {
    if (root.startsWith('../') || root === '..') {
      violations.push(violation('tsconfig', `baseUrl ${root} is outside the repository`));
      baseRoots.delete(root);
    }
  }
  return { pathRules, baseRoots: [...baseRoots].sort(byCodeUnit), violations };
}

/** The pnpm workspace globs must stay the two the guard enumerates. */
export function workspaceGlobViolations(repoRoot) {
  const file = 'pnpm-workspace.yaml';
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) return [violation(file, 'workspace manifest is missing')];
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/u);
  const start = lines.findIndex(line => /^packages:\s*$/u.test(line));
  const globs = [];
  for (let index = start + 1; start >= 0 && index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/u.test(line)) break;
    const entry = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/u);
    if (entry) globs.push(entry[1]);
    else if (line.trim() && !line.trim().startsWith('#')) {
      return [violation(file, `unsupported workspace entry ${JSON.stringify(line.trim())}`)];
    }
  }
  return JSON.stringify(globs) === JSON.stringify(WORKSPACE_GLOBS)
    ? []
    : [
        violation(
          file,
          `workspace globs ${JSON.stringify(globs)} are not ${JSON.stringify(WORKSPACE_GLOBS)}`
        ),
      ];
}

/** Executable bundler configs (next.config.*) must equal the trusted tree's bytes. */
export function bundlerConfigViolations(repoRoot, commit) {
  const violations = [];
  for (const dir of workspaceDirs(repoRoot)) {
    for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
      if (!BUNDLER_CONFIG.test(name)) continue;
      const file = `${dir}/${name}`;
      const current = fs.readFileSync(path.join(repoRoot, file));
      let trusted = null;
      try {
        trusted = execFileSync(GIT, ['cat-file', 'blob', `${commit}:${file}`], {
          cwd: repoRoot,
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 16 * 1024 * 1024,
        });
      } catch {
        trusted = null;
      }
      if (!trusted || !trusted.equals(current)) {
        violations.push(
          violation(
            file,
            'bundler configuration differs from the trusted tree; review and move the pin'
          )
        );
      }
    }
  }
  return violations;
}
