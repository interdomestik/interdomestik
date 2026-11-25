import ts from 'typescript';
import {
  isUseClientModule,
  isUseServerModule,
} from '../../../../../scripts/ci/server-mutation/ast.mjs';
import {
  callableDeclaration,
  constDeclaration,
  descendants,
  isValueUse,
} from './member-acceptance-ast.test-support';
import { unproven } from './member-acceptance-module-uses.test-support';
import { importBinding, type SourceProgram } from './member-acceptance-program.test-support';
import { directCall, isComponentTag } from './member-acceptance-reader-uses.test-support';

function enclosingBinding(fn: ts.SignatureDeclaration) {
  if (ts.isFunctionDeclaration(fn)) return fn;
  if (ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)) {
    const decl = constDeclaration(fn.parent);
    if (decl?.initializer === fn) return decl;
  }
}

function namedUse(sources: SourceProgram, node: ts.Node) {
  if (ts.isIdentifier(node) && isValueUse(node)) return sources.symbolAt(node);
  if (ts.isPropertyAccessExpression(node)) return sources.symbolAt(node.name);
}

// This wrapper awaits its inline work inside the action span with response capture disabled.
function isTracingCallback(sources: SourceProgram, fn: ts.SignatureDeclaration) {
  const call = fn.parent;
  if (!ts.isCallExpression(call) || call.arguments[2] !== fn || call.questionDotToken) return false;
  const callee = call.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.questionDotToken ||
    callee.name.text !== 'withServerActionInstrumentation'
  )
    return false;
  const binding = importBinding(sources.symbolAt(callee.expression));
  const options = call.arguments[1];
  return (
    binding?.imported === '*' &&
    ts.isStringLiteral(binding.specifier) &&
    binding.specifier.text === '@sentry/nextjs' &&
    ts.isObjectLiteralExpression(options) &&
    options.properties.length === 1 &&
    options.properties.some(
      prop =>
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'recordResponse' &&
        prop.initializer.kind === ts.SyntaxKind.FalseKeyword
    )
  );
}

function indexCallableUses(sources: SourceProgram, files: Iterable<string>) {
  const uses = new Map<ts.Node, ts.Expression[]>();
  for (const file of files) {
    for (const node of descendants(sources.parse(file))) {
      const decl = sources.refOf(namedUse(sources, node))?.decl;
      if (!decl || !callableDeclaration(decl)) continue;
      const references = uses.get(decl) ?? [];
      references.push(node as ts.Expression);
      uses.set(decl, references);
    }
  }
  return uses;
}

export function createReaderContext(sources: SourceProgram, files: () => Iterable<string>) {
  let uses: ReturnType<typeof indexCallableUses> | undefined;

  function directCallers(binding: ts.Node) {
    const source = binding.getSourceFile();
    const isServerAction =
      isUseServerModule(source) &&
      sources
        .exportsOf(sources.fileOf(binding))
        .some(symbol => sources.refOf(symbol)?.decl === binding);
    uses ??= indexCallableUses(sources, files());
    return (uses.get(binding) ?? []).flatMap(reference => {
      if (isComponentTag(reference)) return [];
      const call = directCall(reference);
      if (!call) {
        unproven(
          sources.fileOf(reference),
          reference,
          'indirect use of a function containing a reader call'
        );
      }
      // A client call to an exported server action starts a separate server request.
      return isServerAction && isUseClientModule(reference.getSourceFile()) ? [] : [call];
    });
  }

  return function assertReaderContext(
    call: ts.CallExpression,
    permitsTransaction: (fn: ts.SignatureDeclaration, use: ts.CallExpression) => boolean
  ) {
    const queue = new Set<ts.CallExpression>([call]);
    const seen = new Set<ts.SignatureDeclaration>();
    for (const use of queue) {
      for (let node: ts.Node | undefined = use.parent; node; node = node.parent) {
        if (!ts.isFunctionLike(node) || seen.has(node)) continue;
        seen.add(node);
        if (permitsTransaction(node, use) || isTracingCallback(sources, node)) continue;
        const binding = enclosingBinding(node);
        if (!binding) unproven(sources.fileOf(node), node, 'callback containing a reader call');
        for (const caller of directCallers(binding)) queue.add(caller);
      }
    }
  };
}
