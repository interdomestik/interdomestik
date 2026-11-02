import path from 'node:path/posix';
import ts from 'typescript';
import { parseSource } from './syntax.mjs';

// Static module resolution over the workspace. A specifier can reach a different file under the
// package `exports` map (Node, bundlers) than under the tsconfig `paths` aliases (tsc, vitest, and
// Next for app code), so every specifier resolves to the UNION of both. A privileged export is
// identified by the file that declares it, never by the specifier used to reach it.

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
// Data and style imports carry no executable code.
const ASSET =
  /\.(?:json|css|scss|sass|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|md|txt|html)(?:\?.*)?$/u;

// `resolution` carries the candidate configs' tsconfig `paths` rules and `baseUrl` roots
// (resolution.mjs); `appAliases` are fixed prefix aliases.
export function createModuleGraph({
  sources,
  packages,
  appAliases = [],
  resolution = { pathRules: [], baseRoots: [] },
}) {
  const parsed = new Map();
  const tables = new Map();

  const sourceFileOf = file => {
    let sourceFile = parsed.get(file);
    if (!sourceFile && sources.has(file)) {
      sourceFile = parseSource(file, sources.get(file));
      parsed.set(file, sourceFile);
    }
    return sourceFile ?? null;
  };

  function resolveFile(base) {
    const normalized = path.normalize(base);
    if (sources.has(normalized)) return normalized;
    const stripped = normalized.replace(/\.(?:[cm]?js|jsx)$/u, '');
    for (const candidate of [normalized, stripped]) {
      for (const extension of EXTENSIONS)
        if (sources.has(candidate + extension)) return candidate + extension;
      for (const extension of EXTENSIONS) {
        if (sources.has(`${candidate}/index${extension}`)) return `${candidate}/index${extension}`;
      }
    }
    return null;
  }

  // Every condition's target, not one preferred condition: a custom condition can select a
  // different file, and which conditions a consumer enables is not known here.
  function exportTargets(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(exportTargets);
    if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets);
    return [];
  }

  function packageCandidates(pkg, sub) {
    const candidates = [];
    const key = `.${sub}`;
    if (pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)) {
      const keyed = Object.keys(pkg.exports).some(entry => entry.startsWith('.'));
      const map = keyed ? pkg.exports : { '.': pkg.exports };
      if (key in map) {
        for (const target of exportTargets(map[key])) candidates.push(path.join(pkg.dir, target));
      } else {
        for (const [pattern, value] of Object.entries(map)) {
          if (!pattern.includes('*')) continue;
          const [prefix, suffix] = pattern.split('*');
          if (
            key.startsWith(prefix) &&
            key.endsWith(suffix) &&
            key.length >= prefix.length + suffix.length
          ) {
            const match = key.slice(prefix.length, key.length - suffix.length);
            for (const target of exportTargets(value)) {
              candidates.push(path.join(pkg.dir, target.replace('*', match)));
            }
          }
        }
      }
    } else if (typeof pkg.exports === 'string' && sub === '') {
      candidates.push(path.join(pkg.dir, pkg.exports));
    } else if (sub === '' && pkg.main) {
      candidates.push(path.join(pkg.dir, pkg.main));
    }
    // tsconfig `paths` map every workspace package to its src tree, subpaths included.
    candidates.push(path.join(pkg.dir, 'src', sub));
    return candidates;
  }

  const resolutionCache = new Map();
  /** { files: string[], external: string|null, unresolved: boolean } */
  function resolveSpecifier(fromFile, specifier) {
    const cacheKey = `${path.dirname(fromFile)}\u0000${specifier}`;
    const cached = resolutionCache.get(cacheKey);
    if (cached) return cached;
    let bases = null;
    let workspace = false;
    if (
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier === '.' ||
      specifier === '..'
    ) {
      bases = [path.join(path.dirname(fromFile), specifier)];
      workspace = true;
    } else {
      // The union of every alternative a configured resolver could take. A match that points into
      // the workspace makes the specifier workspace code (unresolved if no file exists); a baseUrl
      // root only counts where it reaches a file, since tsc then falls back to node_modules.
      bases = [];
      for (const [prefix, target] of appAliases) {
        if (specifier.startsWith(prefix)) {
          bases.push(target + specifier.slice(prefix.length));
          workspace = true;
        }
      }
      for (const { pattern, targets } of resolution.pathRules) {
        const star = pattern.indexOf('*');
        let match = null;
        if (star < 0) match = specifier === pattern ? '' : null;
        else {
          const prefix = pattern.slice(0, star);
          const suffix = pattern.slice(star + 1);
          if (
            specifier.startsWith(prefix) &&
            specifier.endsWith(suffix) &&
            specifier.length >= prefix.length + suffix.length
          ) {
            match = specifier.slice(prefix.length, specifier.length - suffix.length);
          }
        }
        if (match === null) continue;
        for (const target of targets) {
          if (!/^(?:apps|packages)\//u.test(target)) continue;
          bases.push(target.replace('*', match));
          workspace = true;
        }
      }
      const pkg = [...packages.values()]
        .filter(entry => specifier === entry.name || specifier.startsWith(`${entry.name}/`))
        .sort((left, right) => right.name.length - left.name.length)[0];
      if (pkg) {
        bases.push(...packageCandidates(pkg, specifier.slice(pkg.name.length)));
        workspace = true;
      }
      for (const root of resolution.baseRoots) {
        const base = path.join(root || '.', specifier);
        if (resolveFile(base)) {
          bases.push(base);
          workspace = true;
        }
      }
    }
    let result;
    if (ASSET.test(specifier)) result = { files: [], external: specifier, unresolved: false };
    else if (!workspace) result = { files: [], external: specifier, unresolved: false };
    else {
      const files = [...new Set(bases.map(resolveFile).filter(Boolean))];
      result = { files, external: null, unresolved: files.length === 0 };
    }
    resolutionCache.set(cacheKey, result);
    return result;
  }

  function hasExportModifier(node) {
    return Boolean(
      ts.getModifiers?.(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    );
  }

  function hasDefaultModifier(node) {
    return Boolean(
      ts.getModifiers?.(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    );
  }

  /** Per-file export table: name -> entry, plus star re-exports and value imports. */
  function tableOf(file) {
    let table = tables.get(file);
    if (table) return table;
    table = { named: new Map(), stars: [], imports: new Map() };
    tables.set(file, table);
    const sourceFile = sourceFileOf(file);
    if (!sourceFile) return table;
    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause &&
        !statement.importClause.isTypeOnly
      ) {
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (clause.name) table.imports.set(clause.name.text, { specifier, imported: 'default' });
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          table.imports.set(bindings.name.text, { specifier, imported: '*' });
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (!element.isTypeOnly) {
              table.imports.set(element.name.text, {
                specifier,
                imported: (element.propertyName ?? element.name).text,
              });
            }
          }
        }
      } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        const specifier =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null;
        const clause = statement.exportClause;
        if (!clause && specifier) table.stars.push(specifier);
        else if (clause && ts.isNamespaceExport(clause) && specifier) {
          table.named.set(clause.name.text, { kind: 'namespace', specifier });
        } else if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            if (element.isTypeOnly) continue;
            const local = (element.propertyName ?? element.name).text;
            table.named.set(
              element.name.text,
              specifier ? { kind: 'reexport', specifier, name: local } : { kind: 'local', local }
            );
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        const local = ts.isIdentifier(statement.expression) ? statement.expression.text : null;
        table.named.set('default', local ? { kind: 'local', local } : { kind: 'expression' });
      } else if (hasExportModifier(statement)) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            const names = [];
            const collect = name => {
              if (ts.isIdentifier(name)) names.push(name.text);
              else
                for (const element of name.elements)
                  if (ts.isBindingElement(element)) collect(element.name);
            };
            collect(declaration.name);
            for (const name of names) table.named.set(name, { kind: 'local', local: name });
          }
        } else if (statement.name && ts.isIdentifier(statement.name)) {
          if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
            continue;
          const exported = hasDefaultModifier(statement) ? 'default' : statement.name.text;
          table.named.set(exported, { kind: 'local', local: statement.name.text });
        } else if (hasDefaultModifier(statement)) {
          table.named.set('default', { kind: 'expression' });
        }
      }
    }
    return table;
  }

  /**
   * Resolves an export to its declaring origins:
   *   { file, name } for a declaration, { namespace: files } for a module object,
   *   { external, name } outside the workspace, { unresolved: specifier } when a workspace
   *   specifier reaches no file.
   */
  function resolveExport(file, name, seen = new Set()) {
    const key = `${file}#${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const table = tableOf(file);
    const entry = table.named.get(name);
    if (entry) {
      if (entry.kind === 'local') {
        const imported = table.imports.get(entry.local);
        if (imported) return resolveImport(file, imported.specifier, imported.imported, seen);
        return [{ file, name: entry.local }];
      }
      if (entry.kind === 'expression') return [{ file, name }];
      if (entry.kind === 'namespace') return [moduleObject(file, entry.specifier)];
      return resolveImport(file, entry.specifier, entry.name, seen);
    }
    if (name === 'default') return [];
    const origins = [];
    for (const specifier of table.stars)
      origins.push(...resolveImport(file, specifier, name, seen, true));
    return origins;
  }

  function moduleObject(fromFile, specifier) {
    const resolved = resolveSpecifier(fromFile, specifier);
    if (resolved.external) return { external: resolved.external, name: '*' };
    if (resolved.unresolved) return { unresolved: specifier };
    return { namespace: resolved.files };
  }

  function resolveImport(fromFile, specifier, imported, seen = new Set(), viaStar = false) {
    if (imported === '*') return [moduleObject(fromFile, specifier)];
    const resolved = resolveSpecifier(fromFile, specifier);
    if (resolved.external) return viaStar ? [] : [{ external: resolved.external, name: imported }];
    if (resolved.unresolved) return [{ unresolved: specifier }];
    const origins = [];
    for (const target of resolved.files)
      origins.push(...resolveExport(target, imported, new Set(seen)));
    return origins;
  }

  /** Every name a module exports, following star re-exports. */
  function exportNames(file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const table = tableOf(file);
    const names = new Set(table.named.keys());
    for (const specifier of table.stars) {
      const resolved = resolveSpecifier(file, specifier);
      for (const target of resolved.files) {
        for (const name of exportNames(target, seen)) if (name !== 'default') names.add(name);
      }
    }
    return names;
  }

  return { sourceFileOf, resolveSpecifier, resolveExport, resolveImport, exportNames, tableOf };
}

export const originKey = origin => (origin.file ? `${origin.file}#${origin.name}` : null);
