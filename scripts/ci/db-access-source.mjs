import path from 'node:path';
import ts from 'typescript';
import { digest, SOURCE, ROOT } from './db-access-trust.mjs';

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '/index.ts', '/index.tsx'];
const SUBSTITUTIONS = new Map([
  ['.js', ['.ts', '.tsx', '.js', '.jsx']],
  ['.jsx', ['.tsx', '.ts', '.jsx', '.js']],
  ['.mjs', ['.mts', '.mjs']],
  ['.cjs', ['.cts', '.cjs']],
]);
const VIRTUAL = '/__db_guard__/';
const normalize = name => path.posix.normalize(name).replace(/^\/__db_guard__\//u, '');
export const unwrap = raw => {
  let node = raw;
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression(node))
  )
    node = node.expression;
  return node;
};
export const isFunction = node => ts.isFunctionLike(node) && Boolean(node.body);
export function ownerOf(node) {
  while (node.parent && !isFunction(node) && !ts.isSourceFile(node)) node = node.parent;
  return node;
}
export function runtimeFingerprint(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      verbatimModuleSyntax: true,
      removeComments: true,
    },
  }).outputText;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, js);
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push([token, scanner.getTokenText()]);
  }
  return digest(JSON.stringify(tokens));
}

export function createSourceModel(sources, approvedSources = sources) {
  const packages = new Map();
  for (const [file, source] of approvedSources) {
    if (!file.endsWith('/package.json')) continue;
    const manifest = JSON.parse(source);
    if (manifest.name) packages.set(manifest.name, { base: path.posix.dirname(file), ...manifest });
  }
  function exists(base) {
    const executable = file => sources.has(file) && !/\.d\.[cm]?ts$/u.test(file);
    const extension = path.posix.extname(base);
    const substitutes = SUBSTITUTIONS.get(extension);
    if (substitutes)
      return substitutes.map(ext => base.slice(0, -extension.length) + ext).find(executable);
    return EXTENSIONS.map(ext => base + ext).find(executable);
  }
  function moduleFile(name, from) {
    if (name.startsWith('.')) return exists(path.posix.join(path.posix.dirname(from), name));
    if (name.startsWith('@/')) return exists('apps/web/src/' + name.slice(2));
    if (!name.startsWith('@interdomestik/')) {
      const base = exists('apps/web/' + name);
      return base;
    }
    const [scope, pkg, ...subpath] = name.split('/');
    const manifest = packages.get(`${scope}/${pkg}`);
    if (!manifest) return undefined;
    const key = subpath.length ? './' + subpath.join('/') : '.';
    let target = manifest.exports?.[key];
    if (!target && manifest.exports) {
      for (const [pattern, value] of Object.entries(manifest.exports)) {
        if (!pattern.includes('*')) continue;
        const [prefix, suffix] = pattern.split('*');
        if (key.startsWith(prefix) && key.endsWith(suffix)) {
          const part = key.slice(prefix.length, key.length - suffix.length);
          target = typeof value === 'string' ? value.replaceAll('*', () => part) : undefined;
        }
      }
    }
    if (target && typeof target === 'object') {
      const runtime = target['react-server'] ?? target.node ?? target.import ?? target.default;
      if (target.types && runtime && target.types !== runtime) return undefined;
      target = runtime ?? target.types;
    }
    if (!target && key === '.' && !manifest.exports) target = manifest.main ?? './src/index.ts';
    return typeof target === 'string' ? exists(path.posix.join(manifest.base, target)) : undefined;
  }
  const parsed = new Map();
  for (const [file, source] of sources) {
    if (!SOURCE.test(file) || !ROOT.test(file)) continue;
    parsed.set(
      file,
      ts.createSourceFile(
        VIRTUAL + file,
        source,
        ts.ScriptTarget.Latest,
        true,
        /[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      )
    );
  }
  const host = {
    getSourceFile: file => parsed.get(normalize(file)),
    getDefaultLibFileName: () => '',
    writeFile() {},
    getCurrentDirectory: () => VIRTUAL,
    getDirectories: () => [],
    fileExists: file => sources.has(normalize(file)),
    readFile: file => sources.get(normalize(file)),
    getCanonicalFileName: file => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNames: (names, from) =>
      names.map(name => {
        const file = moduleFile(name, normalize(from));
        return file
          ? { resolvedFileName: VIRTUAL + file, isExternalLibraryImport: false }
          : undefined;
      }),
  };
  const program = ts.createProgram(
    [...parsed.keys()].map(file => VIRTUAL + file),
    {
      noLib: true,
      noResolve: false,
      allowJs: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      types: [],
    },
    host
  );
  const checker = program.getTypeChecker();
  const fileOf = node => normalize(node.getSourceFile().fileName);
  function symbol(node) {
    let result = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    const seen = new Set();
    while (result && result.flags & ts.SymbolFlags.Alias) {
      if (seen.has(result)) return undefined;
      seen.add(result);
      result = checker.getAliasedSymbol(result);
    }
    return result;
  }
  function declaration(node) {
    if (isFunction(node)) return node;
    const resolved = symbol(node);
    const decl = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
    if (decl && ts.isVariableDeclaration(decl)) {
      return decl.initializer && isFunction(decl.initializer) ? decl.initializer : decl;
    }
    return decl;
  }
  function exportDeclaration(file, name) {
    const sf = parsed.get(file);
    const module = sf && checker.getSymbolAtLocation(sf);
    const exported = module && checker.getExportsOfModule(module).find(item => item.name === name);
    if (!exported) return undefined;
    const resolved =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
    return decl && ts.isVariableDeclaration(decl) && decl.initializer ? decl.initializer : decl;
  }
  function walk(node, callback) {
    callback(node);
    ts.forEachChild(node, child => walk(child, callback));
  }
  const rawDeclaration = node => checker.getSymbolAtLocation(node)?.declarations?.[0];
  function externalName(node, seen = new Set()) {
    if (!node || seen.has(node) || seen.size > 64) return undefined;
    seen = new Set(seen).add(node);
    let current = checker.getSymbolAtLocation(node);
    while (current) {
      for (const decl of current.declarations ?? []) {
        let ancestor = decl;
        while (
          ancestor &&
          !ts.isImportDeclaration(ancestor) &&
          !ts.isExportDeclaration(ancestor) &&
          !ts.isSourceFile(ancestor)
        )
          ancestor = ancestor.parent;
        if (ancestor?.moduleSpecifier && ts.isStringLiteral(ancestor.moduleSpecifier)) {
          const name = ancestor.moduleSpecifier.text;
          if (
            !name.startsWith('.') &&
            !name.startsWith('@/') &&
            !name.startsWith('@interdomestik/') &&
            !name.startsWith('#') &&
            !moduleFile(name, fileOf(decl))
          ) {
            const packageName = name.startsWith('@')
              ? name.split('/').slice(0, 2).join('/')
              : name.split('/')[0];
            const manifest = [...packages.values()]
              .filter(item => fileOf(decl).startsWith(item.base + '/'))
              .sort((a, b) => b.base.length - a.base.length)[0];
            if (
              name.startsWith('node:') ||
              [
                'fs',
                'path',
                'crypto',
                'util',
                'assert',
                'events',
                'os',
                'stream',
                'buffer',
              ].includes(name) ||
              ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
                key => manifest?.[key]?.[packageName]
              )
            )
              return { module: name, name: (decl.propertyName ?? decl.name)?.text };
          }
        }
      }
      if (!(current.flags & ts.SymbolFlags.Alias)) break;
      const next = checker.getImmediateAliasedSymbol(current);
      if (!next || next === current) break;
      current = next;
    }
    if (ts.isPropertyAccessExpression(node)) return externalName(node.expression, seen);
    return undefined;
  }
  const externalBinding = node => Boolean(externalName(node));
  function externalModule(name, from) {
    if (
      name.startsWith('.') ||
      name.startsWith('@/') ||
      name.startsWith('@interdomestik/') ||
      name.startsWith('#') ||
      moduleFile(name, from)
    )
      return false;
    const packageName = name.startsWith('@')
      ? name.split('/').slice(0, 2).join('/')
      : name.split('/')[0];
    const manifest = [...packages.values()]
      .filter(item => from.startsWith(item.base + '/'))
      .sort((a, b) => b.base.length - a.base.length)[0];
    return (
      name.startsWith('node:') ||
      ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
        key => manifest?.[key]?.[packageName]
      )
    );
  }
  // Only direct imported bindings; member hops reach Function/Object prototype methods.
  const isQueryOperator = raw => {
    const node = unwrap(raw);
    if (!node || !ts.isIdentifier(node)) return false;
    const binding = externalName(node);
    return (
      binding?.module === 'drizzle-orm' &&
      ['eq', 'and', 'or', 'asc', 'desc', 'ilike', 'inArray', 'isNull'].includes(binding.name)
    );
  };
  function exportedDeclarations(file) {
    const sf = parsed.get(file),
      module = sf && checker.getSymbolAtLocation(sf);
    return module
      ? checker
          .getExportsOfModule(module)
          .map(item => exportDeclaration(file, item.name))
          .filter(Boolean)
      : [];
  }
  return {
    parsed,
    sources,
    approvedSources,
    symbol,
    declaration,
    rawDeclaration,
    externalBinding,
    externalModule,
    externalName,
    isQueryOperator,
    exportedDeclarations,
    fileOf,
    moduleFile,
    exportDeclaration,
    walk,
  };
}
