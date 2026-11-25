import ts from 'typescript';
import { lineOf } from '../../../../../scripts/ci/server-mutation/ast.mjs';
import {
  constDeclaration,
  descendants,
  hasName,
  sourceFile,
} from './member-acceptance-ast.test-support';
import type { SourceProgram } from './member-acceptance-program.test-support';

export function unproven(file: string, node: ts.Node, form: string): never {
  throw new Error(`Unproven protected reader: ${form} in ${file}:${lineOf(node)}`);
}

function importLiteral(sources: SourceProgram, specifier: ts.Expression | undefined) {
  if (!specifier) return undefined;
  if (ts.isStringLiteralLike(specifier)) return specifier;
  if (!ts.isIdentifier(specifier)) return undefined;
  const decl = constDeclaration(sources.symbolAt(specifier)?.valueDeclaration);
  if (decl?.initializer && ts.isStringLiteralLike(decl.initializer)) return decl.initializer;
}

function isMessageImport(value: ts.Expression | undefined) {
  return (
    value &&
    ts.isTemplateExpression(value) &&
    /^(?:\.\.\/|@\/)messages\//u.test(value.head.text) &&
    value.templateSpans.at(-1)?.literal.text.endsWith('.json')
  );
}

function commonJsCall(sources: SourceProgram, call: ts.CallExpression) {
  const { expression } = call;
  if (!hasName(expression, 'require')) return false;
  const binding = sources.symbolAt(expression);
  return !binding || binding.declarations?.some(decl => decl.getSourceFile().isDeclarationFile);
}

function staticSpecifier(statement: ts.Node) {
  if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) return statement.moduleSpecifier;
  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return undefined;
  const clause = statement.importClause;
  if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    if (clause.namedBindings.elements.every(element => element.isTypeOnly)) return undefined;
  }
  return statement.moduleSpecifier;
}

export function createModuleGraph(sources: SourceProgram) {
  function source(file: string, specifier: string) {
    const target = sources.resolvePath(file, specifier);
    return target &&
      sourceFile.test(target) &&
      sources.getSource(target) &&
      !target.split('/').includes('node_modules') &&
      !target.startsWith('../')
      ? target
      : undefined;
  }

  type Load = { form: string; node: ts.Node; target?: string; nonliteral?: boolean };
  function indirectLoad(file: string, node: ts.Node): Load | undefined {
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = node.moduleReference.expression;
      if (node.isTypeOnly || !specifier || !ts.isStringLiteralLike(specifier)) return undefined;
      return { form: 'require', node, target: source(file, specifier.text) };
    }
    if (!ts.isCallExpression(node)) return undefined;
    const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    if (!dynamic && !commonJsCall(sources, node)) return undefined;
    const [specifier] = node.arguments;
    if (dynamic && isMessageImport(specifier)) return undefined;
    const literal = importLiteral(sources, specifier);
    const form = dynamic ? 'dynamic import' : 'require';
    return literal
      ? { form, node, target: source(file, literal.text) }
      : { form, node, nonliteral: true };
  }

  type Edges = { dependencies: string[]; loads: Load[] };
  const indexed = new Map<string, Edges>();
  function edges(file: string) {
    const existing = indexed.get(file);
    if (existing) return existing;
    const sf = sources.parse(file);
    const loads = descendants(sf).flatMap(node => indirectLoad(file, node) ?? []);
    const dependencies = sf.statements.flatMap(statement => {
      const specifier = staticSpecifier(statement);
      if (!specifier || !ts.isStringLiteralLike(specifier)) return [];
      return source(file, specifier.text) ?? [];
    });
    for (const load of loads) if (load.target) dependencies.push(load.target);
    const entry = { dependencies, loads };
    indexed.set(file, entry);
    return entry;
  }

  function reachable(roots: Iterable<string>) {
    const files = new Set(roots);
    for (const file of files) {
      for (const target of edges(file).dependencies) files.add(target);
    }
    return files;
  }

  function importersOf(target: string, files: Iterable<string>) {
    const reverse = new Map<string, Set<string>>();
    for (const file of files) {
      for (const dep of edges(file).dependencies) {
        const dependents = reverse.get(dep) ?? new Set<string>();
        dependents.add(file);
        reverse.set(dep, dependents);
      }
    }
    const result = new Set([target]);
    for (const file of result) {
      for (const importer of reverse.get(file) ?? []) result.add(importer);
    }
    return result;
  }

  function checkLoads(file: string, reachesReader: (file: string) => boolean) {
    for (const { form, node, target, nonliteral } of edges(file).loads) {
      if (nonliteral) unproven(file, node, `nonliteral ${form}`);
      if (target && reachesReader(target)) unproven(file, node, form);
    }
  }

  return { reachable, importersOf, checkLoads };
}
