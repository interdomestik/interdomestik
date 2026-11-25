import ts from 'typescript';
import { descendants, isValueUse, type Declaration } from './member-acceptance-ast.test-support';
import { createModuleGraph, unproven } from './member-acceptance-module-uses.test-support';
import { importBinding, type SourceProgram } from './member-acceptance-program.test-support';

type Reader = (ref: Declaration) => boolean;
type Scan = 'global' | 'page' | 'loader';

export function directCall(value: ts.Expression) {
  const parent = value.parent;
  return ts.isCallExpression(parent) && parent.expression === value && !parent.questionDotToken
    ? parent
    : undefined;
}

export function isComponentTag(node: ts.Node) {
  const { parent } = node;
  return (
    (ts.isJsxOpeningElement(parent) ||
      ts.isJsxSelfClosingElement(parent) ||
      ts.isJsxClosingElement(parent)) &&
    parent.tagName === node
  );
}

function originalName(decl: ts.Node) {
  if (ts.isFunctionDeclaration(decl) || ts.isVariableDeclaration(decl)) {
    return decl.name?.getText();
  }
}

function sameNameExport(node: ts.ExportSpecifier, name: string) {
  return (
    node.name.text === name &&
    (!node.propertyName || node.propertyName.text === name) &&
    !node.isTypeOnly &&
    !node.parent.parent.isTypeOnly
  );
}

export function createReaderScanner(sources: SourceProgram) {
  const { symbolAt, refOf, moduleExports } = sources;
  const graph = createModuleGraph(sources);

  function matchesSymbol(symbol: ts.Symbol | undefined, matches: Reader) {
    const ref = refOf(symbol);
    return ref && matches(ref) ? ref : undefined;
  }

  function moduleHasReader(
    symbol: ts.Symbol | undefined,
    matches: Reader,
    seen = new Set<ts.Symbol>()
  ): boolean {
    const actual = sources.unalias(symbol);
    if (!actual || seen.has(actual)) return false;
    seen.add(actual);
    return moduleExports(actual).some(
      member => matchesSymbol(member, matches) || moduleHasReader(member, matches, seen)
    );
  }

  function proveExport(
    symbol: ts.Symbol | undefined,
    name: string,
    target: Declaration,
    at: ts.Node
  ) {
    const seen = new Set<ts.Symbol>();
    let moduleSymbol = sources.unalias(symbol);
    while (moduleSymbol && !seen.has(moduleSymbol)) {
      seen.add(moduleSymbol);
      const sf = moduleSymbol.valueDeclaration;
      if (!sf || !ts.isSourceFile(sf)) break;
      if (sf === target.decl.getSourceFile() && originalName(target.decl) === name) return;
      const exported = moduleExports(moduleSymbol).find(entry => entry.name === name);
      const node = exported?.declarations?.[0];
      if (
        !node ||
        !ts.isExportSpecifier(node) ||
        node.getSourceFile() !== sf ||
        !sameNameExport(node, name) ||
        refOf(exported)?.decl !== target.decl
      )
        break;
      const from = node.parent.parent.moduleSpecifier;
      const binding = from ?? importBinding(sources.localExportBinding(node))?.specifier;
      if (!binding) break;
      moduleSymbol = sources.unalias(symbolAt(binding));
    }
    unproven(sources.fileOf(at), at, `re-export must preserve the name of ${name}`);
  }

  function inspectExports(file: string, matches: Reader) {
    const source = sources.parse(file);
    for (const exported of sources.exportsOf(file)) {
      const node = exported.declarations?.[0] ?? source;
      if (moduleHasReader(exported, matches)) unproven(file, node, 'namespace re-export');
      const target = matchesSymbol(exported, matches);
      if (target) proveExport(symbolAt(source), exported.name, target, source);
    }
  }

  function importedUse(file: string, node: ts.Identifier, matches: Reader, scan: Scan) {
    const symbol = symbolAt(node);
    const binding = importBinding(symbol);
    if (binding?.imported === '*') return namespaceUse(file, node, binding.specifier, matches);
    if (binding && moduleHasReader(symbol, matches)) unproven(file, node, 'namespace re-export');
    const target = matchesSymbol(symbol, matches);
    if (!target) return undefined;
    if (!binding) unproven(file, node, 'reader must be imported');
    if (!ts.isImportSpecifier(binding.node) || node.text !== binding.imported) {
      unproven(file, node, 'aliased reader import');
    }
    proveExport(symbolAt(binding.specifier), binding.imported, target, node);
    if (scan === 'loader' && isComponentTag(node)) return undefined;
    const call = directCall(node);
    if (!call) unproven(file, node, 'reader must be called directly');
    return { file, call, target };
  }

  function namespaceUse(file: string, node: ts.Identifier, specifier: ts.Node, matches: Reader) {
    const moduleSymbol = symbolAt(specifier);
    const member = node.parent;
    if (!ts.isPropertyAccessExpression(member) || member.expression !== node) {
      if (moduleHasReader(moduleSymbol, matches)) unproven(file, node, 'indirect namespace use');
      return undefined;
    }
    const symbol = symbolAt(member.name);
    if (moduleHasReader(symbol, matches)) unproven(file, node, 'namespace re-export');
    const target = matchesSymbol(symbol, matches);
    if (!target) return undefined;
    proveExport(moduleSymbol, member.name.text, target, member);
    const call = directCall(member);
    if (!call || member.questionDotToken) unproven(file, member, 'reader must be called directly');
    return { file, call, target };
  }

  function readerCalls({ file, decl }: Declaration, matches: Reader, scan: Scan = 'page') {
    const reachesReader = (target: string) =>
      [...graph.reachable([target])].some(dependency => {
        const source = sources.parse(dependency);
        return moduleHasReader(symbolAt(source), matches);
      });
    if (scan !== 'global') graph.checkLoads(file, reachesReader);
    return descendants(decl).flatMap(node => {
      if (!ts.isIdentifier(node) || !isValueUse(node)) return [];
      return importedUse(file, node, matches, scan) ?? [];
    });
  }

  return {
    readerCalls,
    inspectExports,
    reachable: graph.reachable,
    importersOf: graph.importersOf,
    checkLoads: graph.checkLoads,
  };
}
