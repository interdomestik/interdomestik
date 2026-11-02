import path from 'node:path/posix';
import ts from 'typescript';

// Closure-free helpers of the module graph: package `exports` targets and export modifiers.

// Every condition's target, not one preferred condition: a custom condition can select a
// different file, and which conditions a consumer enables is not known here.
export function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets);
  return [];
}

export function packageCandidates(pkg, sub) {
  const candidates = [];
  const key = `.${sub}`;
  if (pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)) {
    candidates.push(...exportMapCandidates(pkg, key));
  } else if (typeof pkg.exports === 'string' && sub === '') {
    candidates.push(path.join(pkg.dir, pkg.exports));
  } else if (sub === '' && pkg.main) {
    candidates.push(path.join(pkg.dir, pkg.main));
  }
  // tsconfig `paths` map every workspace package to its src tree, subpaths included.
  candidates.push(path.join(pkg.dir, 'src', sub));
  return candidates;
}

function exportMapCandidates(pkg, key) {
  const keyed = Object.keys(pkg.exports).some(entry => entry.startsWith('.'));
  const map = keyed ? pkg.exports : { '.': pkg.exports };
  if (key in map) return exportTargets(map[key]).map(target => path.join(pkg.dir, target));
  return Object.entries(map).flatMap(([pattern, value]) =>
    patternCandidates(pkg.dir, pattern, value, key)
  );
}

// As Node: a pattern key has exactly one `*`, and every `*` of a target takes the match
// literally (a function replacement, so `$` sequences in the match are not patterns).
function patternCandidates(dir, pattern, value, key) {
  if (pattern.split('*').length !== 2) return [];
  const [prefix, suffix] = pattern.split('*');
  if (
    !key.startsWith(prefix) ||
    !key.endsWith(suffix) ||
    key.length < prefix.length + suffix.length
  ) {
    return [];
  }
  const match = key.slice(prefix.length, key.length - suffix.length);
  return exportTargets(value).map(target =>
    path.join(
      dir,
      target.replaceAll('*', () => match)
    )
  );
}

export function hasExportModifier(node) {
  return Boolean(
    ts.getModifiers?.(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

export function hasDefaultModifier(node) {
  return Boolean(
    ts.getModifiers?.(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}
