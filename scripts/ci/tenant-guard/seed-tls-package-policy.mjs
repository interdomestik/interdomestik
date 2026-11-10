// Invert finite package mappings from the closure outwards, even when nobody imports the key.
// All conditions/array alternatives matter; an asset-looking key is still a module alias.
import path from 'node:path/posix';
import { patternsOverlap } from './seed-tls-patterns.mjs';
import { SEED_TLS_CLOSURE } from './manifest.mjs';
import { exportTargets } from './package-exports.mjs';
import { packageTargetPaths, unsupportedPackageTarget } from './seed-tls-package-targets.mjs';

function capture(pattern, value) {
  const parts = pattern
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`));
  const regex =
    parts.length === 1 ? parts[0] : parts[0] + '(.*)' + parts.slice(1).join(String.raw`\1`);
  const result = new RegExp(`^${regex}$`, 'u').exec(value);
  return result ? (result[1] ?? '') : null;
}
function entries(pkg, field) {
  const value = pkg[field];
  const keyed =
    value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    (field === 'imports' || Object.keys(value).some(key => key.startsWith('.')));
  return Object.entries(keyed ? value : { '.': value }).flatMap(([key, targets]) =>
    exportTargets(targets).map(target => ({ pkg, field, key, target }))
  );
}
const closureSpellings = [...SEED_TLS_CLOSURE].flatMap(file => {
  const stem = file.replace(/\.[cm]?tsx?$/u, '');
  return [
    file,
    stem,
    ...['.js', '.jsx', '.mjs', '.cjs'].map(ext => stem + ext),
    ...(stem.endsWith('/index') ? [path.dirname(stem)] : []),
  ];
});

// Seed inverse resolution with every workspace fallback and configured path spelling, not
// merely exported keys: imports patterns may point at these aliases without any source use.
function initialAliases(manifests, resolveSpecifier, config) {
  const aliases = new Set();
  const rules = [...(config.pathRules ?? [])];
  for (const [prefix, base] of config.appAliases ?? [])
    rules.push({ pattern: `${prefix}*`, targets: [`${base}*`] });
  for (const base of config.baseRoots ?? [])
    rules.push({ pattern: '*', targets: [path.join(base, '*')] });
  for (const pkg of manifests) {
    if (!pkg.name) continue;
    rules.push({ pattern: `${pkg.name}/*`, targets: [path.join(pkg.dir, 'src/*')] });
    if (resolveSpecifier(pkg.file, pkg.name).files.some(file => SEED_TLS_CLOSURE.has(file)))
      aliases.add(pkg.name);
  }
  for (const { pattern, targets } of rules)
    for (const target of targets) addInitialAliases(aliases, pattern, target);
  return aliases;
}

function addInitialAliases(aliases, pattern, target) {
  for (const file of closureSpellings) {
    const value = capture(path.normalize(target), file);
    if (value !== null)
      aliases.add(target.includes('*') ? pattern.replaceAll('*', () => value) : pattern);
  }
}

function mappingValues(target, pkg, publicAliases, privateAliases) {
  if (target.startsWith('.')) return closureSpellings;
  if (target.startsWith('#')) return privateAliases.get(pkg.file);
  return publicAliases;
}

function aliasCapture(pattern, value) {
  if (value.includes('*')) return patternsOverlap(pattern, value) ? '*' : null;
  return capture(pattern, value);
}

function mappingCaptures(mapping, publicAliases, privateAliases, resolveSpecifier) {
  const { pkg, target } = mapping;
  const relative = target.startsWith('.');
  const patterns = relative ? packageTargetPaths(pkg, target) : [target];
  const values = mappingValues(target, pkg, publicAliases, privateAliases);
  const captures = patterns
    .flatMap(pattern => [...values].map(value => aliasCapture(pattern, value)))
    .filter(value => value !== null);
  if (
    !target.includes('*') &&
    resolveSpecifier(pkg.file, target).files.some(file => SEED_TLS_CLOSURE.has(file))
  )
    captures.push('');
  return captures;
}

function propagateAliases(mapping, captures, publicAliases, privateAliases) {
  const { pkg, field, key, target } = mapping;
  let changed = false;
  for (const value of captures) {
    // A constant target leaves every key capture unconstrained; retain the pattern.
    const alias = target.includes('*') ? key.replaceAll('*', () => value) : key;
    const aliases = field === 'imports' ? privateAliases.get(pkg.file) : publicAliases;
    if (field === 'exports' && !pkg.name) continue;
    let name = alias;
    if (field !== 'imports') name = pkg.name + (alias === '.' ? '' : alias.slice(1));
    if (!aliases.has(name)) {
      aliases.add(name);
      changed = true;
    }
  }
  return changed;
}

function checkAliasBounds(rounds, publicAliases, privateAliases) {
  if (
    rounds > 128 ||
    publicAliases.size > 20000 ||
    [...privateAliases.values()].reduce((sum, aliases) => sum + aliases.size, 0) > 20000
  )
    throw new Error('incomplete: seed package alias bound exceeded');
}

export function seedPackageViolations(manifests, resolveSpecifier, config = {}) {
  const mappings = manifests.flatMap(pkg =>
    ['exports', 'imports'].flatMap(field => entries(pkg, field))
  );
  const publicAliases = initialAliases(manifests, resolveSpecifier, config);
  const privateAliases = new Map(manifests.map(pkg => [pkg.file, new Set()]));
  const refused = new Set(mappings.filter(({ target }) => unsupportedPackageTarget(target)));
  let changed = true;
  let rounds = 0;
  while (changed) {
    checkAliasBounds(++rounds, publicAliases, privateAliases);
    changed = false;
    for (const mapping of mappings) {
      const captures = mappingCaptures(mapping, publicAliases, privateAliases, resolveSpecifier);
      if (!captures.length) continue;
      refused.add(mapping);
      if (propagateAliases(mapping, captures, publicAliases, privateAliases)) changed = true;
    }
  }

  return [...refused].map(({ pkg, field, target }) => ({
    rule: 'R-a',
    file: pkg.file,
    line: 1,
    unit: '<package>',
    detail: unsupportedPackageTarget(target)
      ? `${field} mapping has unsupported seed-only target ${target}`
      : `${field} mapping exposes seed-only closure ${target}`,
  }));
}
