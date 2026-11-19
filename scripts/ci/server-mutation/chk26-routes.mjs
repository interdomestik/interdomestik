// CHK-26 machine routes (design §6.2, r5 B3, r6 B11): the authenticator runs before the protected
// effect with a denial return between them; a closed route is one literal 410 return.
import ts from 'typescript';

import { importsOf, resolveModule, textOf, topLevelDeclarations, unwrap } from './ast.mjs';

// Authenticator identifiers per label, inventoried from the code at adoption (WP-02 part 1).
export const AUTHENTICATORS = Object.freeze({
  'secret-header': Object.freeze(['authorizeCronRequest']),
  signature: Object.freeze(['verifyPaddleWebhook']),
  token: Object.freeze(['resolveNpsSurveyTokenTenant', 'resolveSponsorOptOutTenant']),
  library: Object.freeze(['serve', 'toNextJsHandler']),
});
const LIMITER_RE = /^enforceRateLimit\w*$/u;
const REQUEST_READ_RE =
  /(\.headers\.get|\.nextUrl(\.\w+)*\.searchParams\.get|\.searchParams\.get)$/u;

const calleeName = call => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
};

// The function that implements a route method: declaration, function initializer or a local alias.
export function methodFunction(target) {
  let decl = target?.decl;
  for (let hops = 0; decl && hops < 4; hops += 1) {
    if (ts.isFunctionDeclaration(decl)) return decl.body ? decl : null;
    if (!ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    const init = unwrap(decl.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
    if (!ts.isIdentifier(init)) return null;
    decl = topLevelDeclarations(decl.getSourceFile()).get(init.text);
  }
  return null;
}

function callsIn(node) {
  const out = [];
  node.forEachChild(function visit(child) {
    if (ts.isCallExpression(child) || ts.isNewExpression(child)) out.push(child);
    child.forEachChild(visit);
  });
  return out.sort((a, b) => a.getStart() - b.getStart());
}

function isLiteralValue(node) {
  const value = unwrap(node);
  if (!value) return false;
  if (
    [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
      value.kind
    )
  )
    return true;
  if (
    ts.isStringLiteral(value) ||
    ts.isNumericLiteral(value) ||
    ts.isNoSubstitutionTemplateLiteral(value)
  )
    return true;
  if (ts.isArrayLiteralExpression(value)) return value.elements.every(isLiteralValue);
  if (ts.isObjectLiteralExpression(value))
    return value.properties.every(
      p =>
        ts.isPropertyAssignment(p) &&
        !ts.isComputedPropertyName(p.name) &&
        isLiteralValue(p.initializer)
    );
  return false;
}

function isStatus410(node) {
  const value = unwrap(node);
  if (!value || !ts.isObjectLiteralExpression(value) || !isLiteralValue(value)) return false;
  return value.properties.some(
    p => p.name.getText() === 'status' && unwrap(p.initializer).getText() === '410'
  );
}

// closed-410: exactly one statement, `return NextResponse.json(<lit>, { status: 410 })` or
// `return new Response(<lit>, { status: 410 })`, and no parameter is read.
export function closed410Problem(fn) {
  const statements = ts.isBlock(fn.body) ? fn.body.statements : null;
  if (statements?.length !== 1 || !ts.isReturnStatement(statements[0]))
    return 'closed-410 body is not exactly one return';
  const value = unwrap(statements[0].expression);
  const isJson = ts.isCallExpression(value) && textOf(value.expression) === 'NextResponse.json';
  const isResponse = ts.isNewExpression(value) && textOf(value.expression) === 'Response';
  const args = value?.arguments ?? [];
  if (
    !(isJson || isResponse) ||
    args.length !== 2 ||
    !isLiteralValue(args[0]) ||
    !isStatus410(args[1])
  )
    return 'closed-410 return is not a literal 410 response';
  const params = new Set(
    fn.parameters.flatMap(p => (ts.isIdentifier(p.name) ? [p.name.text] : ['<pattern>']))
  );
  if (params.has('<pattern>')) return 'closed-410 destructures its parameters';
  let used = false;
  fn.body.forEachChild(function visit(node) {
    if (ts.isIdentifier(node) && params.has(node.text)) used = true;
    node.forEachChild(visit);
  });
  return used ? 'closed-410 reads a parameter' : null;
}

// Library-authenticated: the method is bound from, or delegates to, an inventoried library factory.
function libraryProblem(target, fn) {
  const decl = target?.decl;
  const libraries = AUTHENTICATORS.library;
  if (decl && ts.isVariableDeclaration(decl) && !ts.isIdentifier(decl.name)) {
    const init = unwrap(decl.initializer);
    return init && ts.isCallExpression(init) && libraries.includes(calleeName(init))
      ? null
      : 'no library authenticator';
  }
  const decls = fn ? topLevelDeclarations(fn.getSourceFile()) : new Map();
  const delegates =
    fn &&
    callsIn(fn.body).some(call => {
      const receiver = ts.isPropertyAccessExpression(call.expression) && call.expression.expression;
      const bound = receiver && ts.isIdentifier(receiver) && decls.get(receiver.text);
      const init = bound && ts.isVariableDeclaration(bound) && unwrap(bound.initializer);
      return init && ts.isCallExpression(init) && libraries.includes(calleeName(init));
    });
  return delegates ? null : 'no library authenticator';
}

// The function that calls the authenticator: the method itself, or a core function it calls
// directly (imported from a repository module); the ordering rule is judged in that function.
function authenticatedFunction({ root, file, fn, names, parse }) {
  const own = callsIn(fn.body).find(call => names.includes(calleeName(call)));
  if (own) return { fn, file, auth: own };
  const imports = importsOf(fn.getSourceFile());
  for (const call of callsIn(fn.body)) {
    const imported = ts.isIdentifier(call.expression) && imports.get(call.expression.text);
    const coreFile = imported && resolveModule(root, file, imported.specifier);
    const core =
      coreFile &&
      methodFunction({ decl: topLevelDeclarations(parse(coreFile)).get(imported.imported) });
    const auth = core && callsIn(core.body).find(inner => names.includes(calleeName(inner)));
    if (auth) return { fn: core, file: coreFile, auth };
  }
  return null;
}

// { problem, effect }: problem is null when the method passes; effect is the module the protected
// callee is imported from (for the denied test's mock), when it resolves.
export function routeProblem({ root, entry, target, parse }) {
  const method = methodFunction(target);
  const done = (problem, effect = null) => ({ problem, effect });
  if (entry.authentication === 'closed-410')
    return done(method ? closed410Problem(method) : 'method function not found');
  if (entry.authentication === 'library') return done(libraryProblem(target, method));
  if (!method) return done('method function not found');
  const names = AUTHENTICATORS[entry.authentication];
  const found = authenticatedFunction({ root, file: target.file, fn: method, names, parse });
  if (!found) {
    const own = effectModule(root, target.file, method, entry.effect);
    return done('authenticator not called in the method or its direct core', own);
  }
  const effect = effectModule(root, found.file, found.fn, entry.effect);
  const calls = callsIn(found.fn.body);
  const stray = calls.find(
    call =>
      call.getEnd() <= found.auth.getStart() &&
      !LIMITER_RE.test(calleeName(call) ?? '') &&
      !REQUEST_READ_RE.test(textOf(call.expression))
  );
  if (stray) return done(`call before the authenticator: ${textOf(stray.expression)}`, effect);
  const first = calls.find(
    call => call.getStart() > found.auth.getEnd() && calleeName(call) === entry.effect
  );
  if (!first) return done(`effect ${entry.effect} not called after the authenticator`, effect);
  if (!denialReturnBetween(found.fn.body, found.auth, first))
    return done('no denial return between authenticator and effect', effect);
  return done(null, effect);
}

function denialReturnBetween(body, auth, effect) {
  let found = false;
  body.forEachChild(function visit(node) {
    if (
      ts.isIfStatement(node) &&
      node.getStart() >= auth.getEnd() &&
      node.getEnd() <= effect.getStart()
    ) {
      node.thenStatement.forEachChild(function inner(child) {
        if (ts.isReturnStatement(child)) found = true;
        child.forEachChild(inner);
      });
      if (ts.isReturnStatement(node.thenStatement)) found = true;
    }
    node.forEachChild(visit);
  });
  return found;
}

// The module an effect identifier is imported from, as a repo path or the bare specifier.
export function effectModule(root, file, fn, effect) {
  const imported = importsOf(fn.getSourceFile()).get(effect);
  if (!imported) return null;
  return {
    module: resolveModule(root, file, imported.specifier) ?? imported.specifier,
    imported: imported.imported,
  };
}
