import ts from 'typescript';
import { constDeclaration, type Declaration } from './member-acceptance-ast.test-support';
import type { SourceProgram } from './member-acceptance-program.test-support';

function delegateCall(decl: ts.Node) {
  if (
    !ts.isFunctionDeclaration(decl) ||
    decl.asteriskToken ||
    !decl.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    decl.body?.statements.length !== 1
  ) {
    return;
  }
  const [statement] = decl.body.statements;
  if (!ts.isReturnStatement(statement) || !statement.expression) return;
  const returned = statement.expression;
  const call = ts.isAwaitExpression(returned) ? returned.expression : returned;
  if (ts.isCallExpression(call) && !call.questionDotToken && ts.isIdentifier(call.expression)) {
    return { call, parameters: decl.parameters };
  }
}

function spreadsRestParameter(
  sources: SourceProgram,
  parameter: ts.ParameterDeclaration,
  argument: ts.Expression
) {
  return (
    Boolean(parameter.dotDotDotToken) &&
    parameter.type !== undefined &&
    !parameter.questionToken &&
    !parameter.initializer &&
    ts.isIdentifier(parameter.name) &&
    ts.isSpreadElement(argument) &&
    ts.isIdentifier(argument.expression) &&
    sources.symbolAt(argument.expression)?.valueDeclaration === parameter
  );
}

function privateWrapper(sources: SourceProgram, decl: ts.Node, callee: ts.Expression) {
  const binding = constDeclaration(sources.symbolAt(callee)?.valueDeclaration);
  if (!binding) return;
  const statement = binding.parent.parent;
  if (!ts.isVariableStatement(statement) || statement.parent !== decl.getSourceFile()) return;
  const file = sources.fileOf(binding);
  if (sources.exportsOf(file).some(symbol => sources.refOf(symbol)?.decl === binding)) return;
  return binding;
}

export function createDirectGuard(
  sources: SourceProgram,
  callsWrapper: (call: ts.CallExpression, name: string) => boolean
) {
  return function directGuard({ decl }: Declaration, name: string) {
    // Route modules can export the guarded handler itself. Server action exports are async functions.
    if (name === 'withMemberAcceptance' && ts.isVariableDeclaration(decl)) {
      return isWrapper(constDeclaration(decl)?.initializer, name);
    }
    const delegate = delegateCall(decl);
    if (!delegate) return false;
    const { call, parameters } = delegate;
    if (
      parameters.length !== 1 ||
      call.arguments.length !== 1 ||
      !spreadsRestParameter(sources, parameters[0], call.arguments[0])
    ) {
      return false;
    }
    return isWrapper(privateWrapper(sources, decl, call.expression)?.initializer, name);
  };

  function isWrapper(value: ts.Expression | undefined, name: string) {
    if (!value || !ts.isCallExpression(value) || value.questionDotToken) return false;
    const [handler, options] = value.arguments;
    if (!handler || ts.isSpreadElement(handler)) return false;
    if (value.arguments.length === 1) return callsWrapper(value, name);
    return (
      name === 'withMemberAcceptance' &&
      value.arguments.length === 2 &&
      ts.isObjectLiteralExpression(options) &&
      callsWrapper(value, name)
    );
  }
}
