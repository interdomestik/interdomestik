import path from 'node:path/posix';
import { seedPackageViolations } from './seed-tls-package-policy.mjs';
import { exportTargets, packageCandidates } from './package-exports.mjs';
import { parseSource } from './syntax.mjs';
import { SOURCE } from './sources.mjs';
import { seedRepository } from './seed-tls-repository.mjs';
import { packageTargetPaths } from './seed-tls-package-targets.mjs';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
function match(pattern, value) {
  const at = pattern.indexOf('*');
  if (at < 0) return pattern === value ? '' : null;
  const prefix = pattern.slice(0, at),
    suffix = pattern.slice(at + 1);
  return value.startsWith(prefix) &&
    value.endsWith(suffix) &&
    value.length >= prefix.length + suffix.length
    ? value.slice(prefix.length, value.length - suffix.length || undefined)
    : null;
}
function mappedTargets(map, key, exports = false) {
  if (!map) return [];
  if (typeof map === 'string' || Array.isArray(map))
    return exports && key === '.' ? exportTargets(map) : [];
  if (exports && !Object.keys(map).some(name => name.startsWith('.')))
    return key === '.' ? exportTargets(map) : [];
  return Object.entries(map).flatMap(([pattern, value]) => {
    const capture = match(pattern, key);
    return capture === null
      ? []
      : exportTargets(value).map(target => target.replaceAll('*', () => capture));
  });
}

/** A separate union resolver: package mappings precede asset classification, with lazy sources. */
export function createSeedTlsContext({
  repoRoot,
  sources,
  graph,
  resolution = {},
  appAliases = [],
}) {
  const repository = seedRepository(repoRoot, sources);
  const parsed = new Map();
  const resolved = new Map();
  function sourceFileOf(file) {
    if (sources.has(file)) return graph.sourceFileOf(file); // identical AST nodes for scanFiles
    if (!parsed.has(file)) {
      const text = repository.read(file);
      parsed.set(file, text === null ? null : parseSource(file, text));
    }
    return parsed.get(file);
  }
  function resolveFiles(base) {
    const normalized = path.normalize(base);
    const candidates = [...new Set([normalized, normalized.replace(/\.(?:[cm]?js|jsx)$/u, '')])];
    const found = suffixes =>
      candidates
        .flatMap(candidate => suffixes.map(suffix => candidate + suffix))
        .filter(file => SOURCE.test(file) && sourceFileOf(file));
    const files = found(['', ...EXTENSIONS]);
    return files.length ? files : found(EXTENSIONS.map(ext => `/index${ext}`));
  }
  function resolveSpecifier(from, specifier, seen = new Set()) {
    const key = `${from}\0${specifier}`;
    if (seen.has(key)) return { files: [] };
    if (seen.size >= 128) throw new Error('incomplete: seed package resolution bound exceeded');
    if (resolved.has(key)) return resolved.get(key);
    const next = new Set(seen).add(key);
    const bases = [];
    const files = [...graph.resolveSpecifier(from, specifier).files];
    const target = (pkg, value) => {
      if (value.startsWith('.')) bases.push(...packageTargetPaths(pkg, value));
      else files.push(...resolveSpecifier(pkg.file, value, next).files);
    };
    if (specifier.startsWith('.')) bases.push(path.join(path.dirname(from), specifier));
    else if (specifier.startsWith('#')) {
      const owner = repository.manifests
        .filter(pkg => !pkg.dir || from.startsWith(`${pkg.dir}/`))
        .sort((a, b) => b.dir.length - a.dir.length)[0];
      if (owner) mappedTargets(owner.imports, specifier).forEach(value => target(owner, value));
    } else {
      for (const pkg of repository.manifests) {
        if (!pkg.name || !(specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)))
          continue;
        const sub = specifier.slice(pkg.name.length);
        mappedTargets(pkg.exports, `.${sub}`, true).forEach(value => target(pkg, value));
        bases.push(...packageCandidates(pkg, sub));
      }
      for (const [prefix, base] of appAliases)
        if (specifier.startsWith(prefix)) bases.push(base + specifier.slice(prefix.length));
      for (const { pattern, targets } of resolution.pathRules ?? []) {
        const capture = match(pattern, specifier);
        if (capture !== null)
          bases.push(...targets.map(base => base.replaceAll('*', () => capture)));
      }
      for (const base of resolution.baseRoots ?? []) bases.push(path.join(base, specifier));
    }
    files.push(...bases.flatMap(resolveFiles));
    const result = { files: [...new Set(files)] };
    // Recursive cycles must not leave a cached partial result.
    if (seen.size === 0) resolved.set(key, result);
    return result;
  }
  const seedGraph = { ...graph, sourceFileOf, resolveSpecifier };
  const violations = seedPackageViolations(repository.manifests, resolveSpecifier, {
    ...resolution,
    appAliases,
  });
  return { graph: seedGraph, runtimeEntries: repository.runtimeEntries, violations };
}
