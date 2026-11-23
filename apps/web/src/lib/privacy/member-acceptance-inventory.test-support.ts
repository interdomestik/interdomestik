import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  isTestFile,
  isUseServerModule,
  listSourceFiles,
  scanRoots,
} from '../../../../../scripts/ci/server-mutation/ast.mjs';
import { collectUnits } from '../../../../../scripts/ci/server-mutation/units.mjs';
import {
  descendants,
  isValueUse,
  sourceFile,
  type Declaration,
} from './member-acceptance-ast.test-support';
import {
  createSourceProgram,
  importBinding,
  type SourceProgram,
} from './member-acceptance-program.test-support';
import { createReaderContext } from './member-acceptance-reader-context.test-support';
import { createReaderScanner } from './member-acceptance-reader-uses.test-support';
import {
  deferredUnits,
  member,
  protectedLoaderIds,
  sessionModules,
  sessionNames,
  web,
} from './member-acceptance-entry-scope.test-support';

export { descendants, keyOf, type Declaration } from './member-acceptance-ast.test-support';
export {
  deferredReason,
  deferredUnits,
  member,
  web,
} from './member-acceptance-entry-scope.test-support';

export const root = fileURLToPath(new URL('../../../../../', import.meta.url));
export const guardModule = `${web}lib/privacy/require-member-acceptance.ts`;
const pageFiles = /(?:^|\/)(?:page|_core\.entry|layout|template|default)\.tsx$/u;

export type SourceUnit = Declaration & {
  id: string;
  category: 'action' | 'route' | 'page' | 'helper';
};

function allImports(source: ts.SourceFile) {
  return source.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return [];
    const clause = statement.importClause;
    const imports = clause?.name ? [clause.name] : [];
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) imports.push(bindings.name);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) if (!element.isTypeOnly) imports.push(element.name);
    }
    return imports;
  });
}

function usedImports(sources: SourceProgram, decl: ts.Node) {
  const seen = new Set<ts.Symbol>();
  return descendants(decl).flatMap(node => {
    if (!ts.isIdentifier(node) || !isValueUse(node)) return [];
    const symbol = sources.symbolAt(node);
    if (!symbol || seen.has(symbol)) return [];
    seen.add(symbol);
    return importBinding(symbol) ?? [];
  });
}

function isTopLevel(decl: ts.Node) {
  if (ts.isVariableDeclaration(decl)) return ts.isSourceFile(decl.parent.parent.parent);
  return Boolean(decl.parent && ts.isSourceFile(decl.parent));
}

function runtimeReference(sources: SourceProgram, node: ts.Node) {
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = sources.unalias(sources.symbolAt(node.expression));
    if (receiver && receiver.flags & ts.SymbolFlags.Module) {
      return sources.refOf(sources.symbolAt(node.name));
    }
  }
  if (!ts.isIdentifier(node) || !isValueUse(node)) return undefined;
  const symbol = sources.symbolAt(node);
  const binding = importBinding(symbol);
  if (
    binding &&
    ts.isStringLiteralLike(binding.specifier) &&
    /^@interdomestik\/database(?:\/|$)/u.test(binding.specifier.text)
  )
    return undefined;
  const ref = sources.refOf(symbol);
  if (!ref) return undefined;
  let { decl } = ref;
  while (ts.isBindingElement(decl)) decl = decl.parent.parent;
  return isTopLevel(decl) ? { file: ref.file, decl } : undefined;
}

function validateStaticPaths(sources: SourceProgram, file: string) {
  for (const statement of sources.parse(file).statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      sources.resolvePath(file, statement.moduleSpecifier.text);
    }
  }
}

function discoverUnits(
  directory: string,
  files: string[],
  sources: SourceProgram,
  helpers: readonly string[]
) {
  const { actions, routes, inline } = collectUnits({
    root: directory,
    files,
    parse: sources.getSource,
  });
  function getExport(id: string) {
    const [file, name] = id.split('#');
    const ref = sources.exportRef(web + file, name);
    if (!ref) throw new Error(`Unresolved export: ${id}`);
    return ref;
  }
  const units: SourceUnit[] = [
    ...actions.map(unit => {
      const id = unit.id.slice(web.length);
      return { id, category: 'action' as const, ...getExport(id) };
    }),
    ...routes.map(unit => {
      const id = unit.id.slice(web.length);
      return { id, category: 'route' as const, ...getExport(id) };
    }),
    ...inline.map(unit => ({
      id: unit.id.slice(web.length),
      category: 'action' as const,
      file: unit.file,
      decl: unit.node,
    })),
  ];

  const memberFiles = files.filter(file => file.startsWith(web + member));
  for (const file of memberFiles) {
    const path = file.slice(web.length);
    if (!pageFiles.test(path) && !path.slice(member.length).includes('@')) continue;
    const id = `${path}#default`;
    units.push({ id, category: 'page', ...getExport(id) });
  }
  for (const id of helpers.filter(id => !units.some(found => found.id === id))) {
    units.push({ id, category: 'helper', ...getExport(id) });
  }
  appendMemberLoaders(sources, memberFiles, units);
  return { units, getExport };
}

function appendMemberLoaders(sources: SourceProgram, memberFiles: string[], units: SourceUnit[]) {
  for (const file of memberFiles.filter(file => /\/(?:_core|[^/]*loader)\.tsx?$/u.test(file))) {
    for (const symbol of sources.exportsOf(file)) {
      const id = `${file.slice(web.length)}#${symbol.name}`;
      if (units.some(unit => unit.id === id)) continue;
      const ref = sources.refOf(symbol);
      if (!ref) continue;
      if (usedImports(sources, ref.decl).some(isLoaderReader)) {
        units.push({ id, category: 'helper', ...ref });
      }
    }
  }
}

function isLoaderReader(binding: NonNullable<ReturnType<typeof importBinding>>) {
  return (
    binding.imported === 'withTenantAuthority' ||
    (ts.isStringLiteralLike(binding.specifier) &&
      binding.specifier.text.startsWith('@interdomestik/domain-') &&
      /^(?:get|list|read|load|find|resolve)[A-Z]/u.test(binding.imported))
  );
}

export function loadInventory(
  directory = root,
  helpers: readonly string[] = [...deferredUnits, ...protectedLoaderIds]
) {
  const roots = listSourceFiles(directory, scanRoots(directory)).filter(
    file => !isTestFile(file) && !/\.test-(?:bootstrap|fixture)\./u.test(file)
  );
  const files = roots.filter(file => file.startsWith(web));
  const sources = createSourceProgram(directory, roots);
  const { parse, symbolAt } = sources;
  const { units, getExport } = discoverUnits(directory, files, sources, helpers);
  const scanner = createReaderScanner(sources);
  const production = () => scanner.reachable(files);
  const assertReaderContext = createReaderContext(sources, production);

  for (const file of new Set([
    ...files.filter(file => file.endsWith('/route.ts') || isUseServerModule(parse(file))),
    ...units.flatMap(unit => [unit.file, web + unit.id.split('#')[0]]),
  ])) {
    validateStaticPaths(sources, file);
  }

  function references({ decl }: Declaration) {
    return descendants(decl).flatMap(node => runtimeReference(sources, node) ?? []);
  }

  function callsExport(
    node: ts.CallExpression,
    target: string,
    name: string,
    { allowNamespace = false } = {}
  ) {
    const { expression } = node;
    const member =
      allowNamespace &&
      ts.isPropertyAccessExpression(expression) &&
      !expression.questionDotToken &&
      !node.questionDotToken;
    const binding = importBinding(symbolAt(member ? expression.expression : expression));
    if (!binding || (member ? binding.imported !== '*' : !ts.isIdentifier(expression)))
      return false;
    const actual = sources.refOf(symbolAt(member ? expression.name : expression));
    return Boolean(
      actual && sources.getSource(target) && actual.decl === sources.exportRef(target, name)?.decl
    );
  }

  function hasCall(ref: Declaration, target: string, name: string) {
    return descendants(ref.decl).some(
      node => ts.isCallExpression(node) && callsExport(node, target, name)
    );
  }

  function directGuard({ decl }: Declaration, name: string) {
    if (!ts.isVariableDeclaration(decl)) return false;
    const value = decl.initializer;
    return Boolean(
      value &&
      ts.isCallExpression(value) &&
      (value.arguments.length === 1 ||
        (name === 'withMemberAcceptance' &&
          value.arguments.length === 2 &&
          ts.isObjectLiteralExpression(value.arguments[1]))) &&
      !ts.isSpreadElement(value.arguments[0]) &&
      callsExport(value, guardModule, name)
    );
  }

  function sourceImports({ file, decl }: Declaration, wholeFile = false) {
    const imports = wholeFile
      ? allImports(parse(file)).flatMap(node => importBinding(symbolAt(node)) ?? [])
      : usedImports(sources, decl);
    return imports.flatMap(binding => {
      if (!binding.node.name || !ts.isStringLiteralLike(binding.specifier)) return [];
      const target = sources.resolvePath(file, binding.specifier.text);
      if (!target || target === guardModule || !sourceFile.test(target)) return [];
      const ref = sources.refOf(symbolAt(binding.node.name));
      const name = sources.unalias(symbolAt(binding.node.name))?.name;
      return sessionModules.has(target) ||
        (ref && sessionModules.has(ref.file)) ||
        sessionNames.has(binding.imported) ||
        (name && sessionNames.has(name))
        ? [binding.node.name.text]
        : [];
    });
  }

  function webCallsTo(target: string, name: string) {
    const expected = sources.exportRef(target, name);
    if (!expected) throw new Error(`Unresolved export: ${target}#${name}`);
    const matches = (ref: Declaration) => ref.decl === expected.decl;
    const scanned = production();
    const candidates = scanner.importersOf(target, scanned);
    for (const file of new Set([...files, ...candidates])) {
      scanner.checkLoads(file, dependency => candidates.has(dependency));
    }
    return [...candidates].flatMap(file => {
      scanner.inspectExports(file, matches);
      return scanner.readerCalls({ file, decl: parse(file) }, matches, 'global');
    });
  }

  return {
    units,
    references,
    readerCalls: scanner.readerCalls,
    callsExport,
    webCallsTo,
    hasCall,
    directGuard,
    getExport,
    sourceImports,
    symbolAt,
    resolvedSymbol: (node: ts.Node) => sources.unalias(symbolAt(node)),
    assertReaderContext,
  };
}
