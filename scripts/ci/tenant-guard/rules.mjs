import { createHash } from 'node:crypto';
import ts from 'typescript';
import {
  CONNECTION_CONTROL,
  CONNECTION_CONTROL_MODULES,
  CONTRACTS,
  DRIVER_MODULES,
  DRIVER_SPECIFIERS,
  KERNEL,
  LEGACY,
  LEGACY_PINS,
  PRIVILEGED,
  STATE_CONTRACTS,
  TEST_SOURCE,
} from './manifest.mjs';
import { originKey } from './modules.mjs';
import {
  analyzeScopes,
  callArguments,
  collectUnits,
  fingerprint,
  isFunctionLike,
  memberUse,
  parseSource,
  referenceForm,
  unitName,
  unitOf,
} from './syntax.mjs';

export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

const within = (node, outer) => node.pos >= outer.pos && node.end <= outer.end;

/**
 * Evaluates the tenant guard over the current sources against the trusted tree.
 * Returns { violations, accepted, telemetry }.
 */
export function evaluate({
  sources,
  trusted,
  graph,
  contracts = CONTRACTS,
  legacyPins = LEGACY_PINS,
  stateContracts = STATE_CONTRACTS,
}) {
  const violations = [];
  const accepted = [];
  const telemetry = { legacyAccepted: 0, legacySinks: 0, files: 0, contractsUsed: 0 };
  const violate = (file, node, sourceFile, rule, detail) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      rule,
      file,
      line: line + 1,
      unit: unitName(unitOf(node) ?? node, sourceFile),
      detail,
    });
  };

  // ---- trusted fingerprints, per file ------------------------------------------------------
  const trustedPrints = new Map();
  const trustedPrintsOf = file => {
    let prints = trustedPrints.get(file);
    if (!prints) {
      prints = new Set();
      const text = trusted.get(file);
      if (text !== undefined) {
        const sourceFile = parseSource(file, text);
        for (const unit of collectUnits(sourceFile)) prints.add(fingerprint(unit, sourceFile));
      }
      trustedPrints.set(file, prints);
    }
    return prints;
  };

  // ---- per-file facts, computed lazily -----------------------------------------------------
  const facts = new Map();
  const factsOf = file => {
    let fact = facts.get(file);
    if (fact) return fact;
    const sourceFile = graph.sourceFileOf(file);
    if (!sourceFile) return null;
    const { references } = analyzeScopes(sourceFile);
    const printCache = new Map();
    const unchanged = unit => {
      let state = printCache.get(unit);
      if (state === undefined) {
        state = trustedPrintsOf(file).has(fingerprint(unit, sourceFile));
        printCache.set(unit, state);
      }
      return state;
    };
    // Top-level declarations by name, so an origin { file, name } maps to its unit.
    // `statements` maps each name to its whole top-level statement, which is what a closure
    // comparison binds (a wrapper and its arguments included).
    const declarations = new Map();
    const statements = new Map();
    for (const statement of sourceFile.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        declarations.set(statement.name.text, statement);
        statements.set(statement.name.text, statement);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          statements.set(declaration.name.text, statement);
          let initializer = declaration.initializer;
          // `const f = cache(async (...) => ...)`: an argument-forwarding wrapper around one function
          // declares f as that function, so its callers stay resolvable.
          if (
            initializer &&
            ts.isCallExpression(initializer) &&
            initializer.arguments.length === 1 &&
            (ts.isArrowFunction(initializer.arguments[0]) ||
              ts.isFunctionExpression(initializer.arguments[0]))
          ) {
            initializer = initializer.arguments[0];
          }
          const unit =
            initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
              ? initializer
              : statement;
          declarations.set(declaration.name.text, unit);
        }
      }
    }
    fact = { file, sourceFile, references, unchanged, declarations, statements };
    facts.set(file, fact);
    return fact;
  };

  const isTest = file => TEST_SOURCE.test(file);

  // ---- origin resolution for a reference ---------------------------------------------------
  function originsOf(fact, reference) {
    const { binding, node } = reference;
    if (!binding) return { origins: [], form: referenceForm(node) };
    if (binding.kind === 'import') {
      if (binding.specifier === null)
        return { origins: [{ unresolved: '<import=>' }], form: referenceForm(node) };
      if (binding.imported === '*') {
        const [moduleObject] = graph.resolveImport(fact.file, binding.specifier, '*');
        const member = memberUse(node);
        if (!moduleObject?.namespace)
          return { origins: [moduleObject].filter(Boolean), form: referenceForm(node) };
        if (member) {
          const origins = moduleObject.namespace.flatMap(target =>
            graph.resolveExport(target, member.name)
          );
          return { origins, form: member.form, namespace: moduleObject.namespace };
        }
        return { origins: [], form: 'namespace-value', namespace: moduleObject.namespace };
      }
      const origins = graph.resolveImport(fact.file, binding.specifier, binding.imported);
      if (binding.imported === 'default' && origins.length === 0) {
        // No declared default: under CJS interop the binding is the module object itself.
        const { files } = graph.resolveSpecifier(fact.file, binding.specifier);
        return { origins: [], form: 'namespace-value', namespace: files };
      }
      return { origins, form: referenceForm(node) };
    }
    if (
      binding.scope === fact.sourceFile &&
      ['var', 'function', 'class', 'enum'].includes(binding.kind)
    ) {
      return {
        origins: [{ file: fact.file, name: binding.name, local: true }],
        form: referenceForm(node),
      };
    }
    return { origins: [], form: referenceForm(node), local: true };
  }

  const privilegedModule = new Map();
  function isPrivilegedModule(file) {
    if (privilegedModule.has(file)) return privilegedModule.get(file);
    privilegedModule.set(file, false);
    let result = false;
    for (const name of graph.exportNames(file)) {
      for (const origin of graph.resolveExport(file, name)) {
        const key = originKey(origin);
        if ((key && (LEGACY.has(key) || PRIVILEGED.has(key))) || origin.unresolved) result = true;
      }
    }
    privilegedModule.set(file, result);
    return result;
  }

  // ---- reviewed legacy kernel contract ------------------------------------------------------
  // A legacy entry is trusted only as the exact reviewed kernel implementation. Its digest binds
  // every complete workspace module in the runtime import closure of its declaring module (module
  // initialization, wrappers and effects included) plus the external specifiers that closure
  // names; package resolution and external implementations stay separately fixed inputs. A closure
  // edge that cannot be resolved, or a dynamic import with a non-literal specifier, makes the
  // entry unpinnable. A null pin map (fixture setup only) computes digests without enforcing them.
  const legacyDigests = new Map();
  const legacyClosureProblems = new Map();
  function moduleEdges(file, sourceFile) {
    const edges = [];
    const problems = [];
    const visit = node => {
      let specifier = null;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const typeOnly = ts.isImportDeclaration(node)
          ? node.importClause?.isTypeOnly
          : node.isTypeOnly;
        if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier))
          specifier = node.moduleSpecifier.text;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        specifier = ts.isStringLiteral(node.moduleReference.expression)
          ? node.moduleReference.expression.text
          : null;
        if (specifier === null) problems.push(`${file}: opaque import-equals`);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const loader =
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === 'require');
        if (loader) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) specifier = argument.text;
          else problems.push(`${file}: dynamic import with a non-literal specifier`);
        }
      }
      if (specifier !== null) edges.push(specifier);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { edges, problems };
  }
  function legacyDigest(key) {
    if (legacyDigests.has(key)) return legacyDigests.get(key);
    const start = key.slice(0, key.lastIndexOf('#'));
    const lines = [`entry=${key}`];
    const problems = [];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const file = queue.shift();
      const fact = factsOf(file);
      if (!fact) {
        problems.push(`${file}: missing module`);
        continue;
      }
      // Exact bytes: a finite reviewed kernel module is bound as written, layout included.
      lines.push(`module:${file}=${sha256(fact.sourceFile.text)}`);
      const { edges, problems: edgeProblems } = moduleEdges(file, fact.sourceFile);
      problems.push(...edgeProblems);
      for (const specifier of edges) {
        const resolved = graph.resolveSpecifier(file, specifier);
        if (resolved.external) lines.push(`external:${resolved.external}`);
        else if (resolved.unresolved) problems.push(`${file}: unresolved import ${specifier}`);
        for (const target of resolved.files) {
          if (seen.has(target)) continue;
          seen.add(target);
          queue.push(target);
        }
      }
    }
    for (const file of seen) pinnedModules.add(file);
    for (const problem of problems) lines.push(`problem:${problem}`);
    const digest = sha256([...new Set(lines)].sort().join('\n'));
    legacyDigests.set(key, digest);
    legacyClosureProblems.set(key, [...new Set(problems)]);
    return digest;
  }
  const legacyPinned = key =>
    legacyPins === null ||
    (legacyPins.get(key) === legacyDigest(key) && legacyClosureProblems.get(key).length === 0);

  // ---- closure-unchanged: a workspace declaration and everything it references -------------
  const closureMemo = new Map();
  function closureUnchanged(origin) {
    if (origin.external) return true;
    if (origin.unresolved) return false;
    if (origin.namespace) return true; // a module object carries no code of its own
    const key = originKey(origin);
    // A legacy entry is judged where it is called (C1 admits the operation only in an unchanged
    // unit with an unchanged tenant closure). The entry itself is not compared with the trusted
    // tree: it is held to the pinned digest of its reviewed kernel implementation instead.
    if (LEGACY.has(key)) return legacyPinned(key);
    if (closureMemo.has(key)) return closureMemo.get(key) !== false;
    closureMemo.set(key, 'pending');
    const fact = factsOf(origin.file);
    let result = true;
    if (!fact) result = false;
    else {
      const unit = fact.statements.get(origin.name);
      if (!unit)
        result = true; // re-export or type-only name; resolution already followed it
      else if (!fact.unchanged(unit)) result = false;
      else {
        for (const reference of fact.references) {
          if (!within(reference.node, unit) || !reference.binding) continue;
          const { origins } = originsOf(fact, reference);
          for (const dependency of origins) {
            if (dependency.local && dependency.name === origin.name) continue;
            if (!closureUnchanged(dependency)) {
              result = false;
              break;
            }
          }
          if (!result) break;
        }
      }
    }
    closureMemo.set(key, result);
    return result;
  }

  // ---- intra-unit def-use closure of an expression -----------------------------------------
  function expressionDependencies(fact, unit, roots) {
    const unitReferences = fact.references.filter(reference => within(reference.node, unit));
    const params = new Set();
    const external = [];
    const seenBindings = new Set();
    const queue = unitReferences.filter(reference =>
      roots.some(root => within(reference.node, root))
    );
    while (queue.length > 0) {
      const reference = queue.shift();
      const { binding } = reference;
      if (!binding || seenBindings.has(binding)) continue;
      seenBindings.add(binding);
      if (binding.kind === 'param') {
        if (binding.decl === unit) params.add(binding.name);
        continue; // parameters of nested callbacks receive values produced inside the unit
      }
      if (binding.kind === 'import' || binding.scope === fact.sourceFile) {
        external.push(reference);
        continue;
      }
      // A local declared inside the unit: follow its initializer and every assignment to it.
      const sources = [];
      if (ts.isVariableDeclaration(binding.decl) && binding.decl.initializer)
        sources.push(binding.decl.initializer);
      if (binding.kind === 'function' && binding.decl.body) sources.push(binding.decl.body);
      const loop = binding.decl.parent?.parent;
      if (loop && (ts.isForOfStatement(loop) || ts.isForInStatement(loop)))
        sources.push(loop.expression);
      for (const other of unitReferences) {
        if (other.binding !== binding) continue;
        const parent = other.node.parent;
        if (
          parent &&
          ts.isBinaryExpression(parent) &&
          parent.left === other.node &&
          parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
          sources.push(parent.right);
        }
      }
      for (const reference2 of unitReferences) {
        if (sources.some(source => within(reference2.node, source))) queue.push(reference2);
      }
    }
    return { params, external };
  }

  function dependenciesUnchanged(fact, references) {
    for (const reference of references) {
      for (const origin of originsOf(fact, reference).origins) {
        if (!closureUnchanged(origin))
          return { ok: false, witness: reference.node.getText(fact.sourceFile) };
      }
    }
    return { ok: true };
  }

  const WRAPPERS = node =>
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node);
  const unwrap = node => {
    let current = node;
    while (current && WRAPPERS(current)) current = current.expression;
    return current;
  };
  const outermost = node => {
    let current = node;
    while (current.parent && WRAPPERS(current.parent)) current = current.parent;
    return current;
  };

  /** The call (or construction) a value is an argument of, directly or nested in object and array literals. */
  function argumentCall(value) {
    let current = value;
    for (;;) {
      const parent = current.parent;
      if (
        ts.isShorthandPropertyAssignment(parent) ||
        (ts.isPropertyAssignment(parent) && parent.initializer === current)
      ) {
        current = outermost(parent.parent);
      } else if (
        ts.isArrayLiteralExpression(parent) ||
        (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent))
      ) {
        current = outermost(ts.isSpreadElement(parent) ? parent.parent : parent);
      } else break;
    }
    const call = current.parent;
    return call &&
      (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
      call.arguments?.includes(current)
      ? call
      : null;
  }

  /** Why a callee (a function value) cannot be trusted as unchanged, or null when it can. */
  function calleeProblem(fact, unit, callee) {
    const { params, external } = expressionDependencies(fact, unit, [callee]);
    if (params.size > 0)
      return `a callee taken from the parameters of ${unitName(unit, fact.sourceFile)}`;
    const dependencies = dependenciesUnchanged(fact, external);
    return dependencies.ok ? null : `changed code (${dependencies.witness})`;
  }

  // ---- transaction transfers (A5-r2 B) -------------------------------------------------------
  // The transaction a retained legacy context hands its callback is a capability. The callback may
  // use it directly (`tx.select()…`, a nested `tx.transaction(cb)` held to the same rule) or pass
  // it as a call argument, alone or inside object and array literals, to a callee whose closure is
  // unchanged. Any other use (returned, stored, aliased, awaited), and a callback given by
  // reference whose closure changed, is refused.
  function transactionUseProblem(fact, unit, node) {
    const value = outermost(node);
    const parent = value.parent;
    if (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === value
    ) {
      const call = outermost(parent).parent;
      const nested = ts.isPropertyAccessExpression(parent) && parent.name.text === 'transaction';
      if (nested && call && ts.isCallExpression(call) && call.expression === outermost(parent)) {
        for (const argument of call.arguments) {
          const problem = transferProblem(fact, unit, argument);
          if (problem) return problem;
        }
      }
      return null;
    }
    const call = argumentCall(value);
    if (call) return calleeProblem(fact, unit, call.expression);
    return `an unsupported transfer (${parent.getText(fact.sourceFile).slice(0, 60)})`;
  }

  function transferProblem(fact, unit, callback) {
    const target = unwrap(callback);
    if (!isFunctionLike(target)) return calleeProblem(fact, unit, target);
    const [first] = target.parameters;
    if (!first) return null;
    if (!ts.isIdentifier(first.name)) return 'a destructured transaction parameter';
    for (const reference of fact.references) {
      const { binding } = reference;
      if (binding?.kind !== 'param' || binding.decl !== target || binding.name !== first.name.text)
        continue;
      const problem = transactionUseProblem(fact, unit, reference.node);
      if (problem) return problem;
    }
    return null;
  }

  // ---- module state read by a retained tenant input (A5-r2 A) -------------------------------
  // A module binding that a retained tenant argument (or an unchanged caller's argument to a legacy
  // sink) reads directly, or through the initializers that alias it, is safe only if its value
  // cannot change: a const bound to a primitive. Any other binding (let/var, or a const object,
  // array or call result) is tenant state, accepted only in the finite forms of stateUseProblem.
  const PRIMITIVE_OPERATORS = new Set([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.CommaToken,
  ]);
  function holdsPrimitive(statement, declaration) {
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return false;
    const initializer = unwrap(declaration.initializer);
    if (!initializer) return false;
    if (ts.isBinaryExpression(initializer)) {
      const operator = initializer.operatorToken.kind;
      return (
        !PRIMITIVE_OPERATORS.has(operator) &&
        !(operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment)
      );
    }
    return (
      ts.isStringLiteral(initializer) ||
      ts.isNumericLiteral(initializer) ||
      ts.isBigIntLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer) ||
      ts.isTemplateExpression(initializer) ||
      ts.isPrefixUnaryExpression(initializer) ||
      ts.isTypeOfExpression(initializer) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        initializer.kind
      )
    );
  }

  // Discovery follows module bindings through the initializers that alias them and, for a function
  // (declared or bound to a const), through the def-use closure of its return expressions: the
  // module state a retained tenant input is computed from, however many unchanged functions sit in
  // between (A5-r2 Q1). Modules bound by a legacy pin are not entered; their exported values are
  // seeded as kernel state instead (Q2).
  const tenantState = new Map(); // origin key -> { origin, kind: 'value' | 'function' | 'kernel' }
  const stateVisited = new Set();
  function returnRoots(unit) {
    if (ts.isArrowFunction(unit) && !ts.isBlock(unit.body)) return [unit.body];
    const roots = [];
    const visit = node => {
      if (node !== unit && isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) roots.push(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(unit);
    return roots;
  }
  function collectTenantState(fact, references) {
    const queue = references.flatMap(reference => originsOf(fact, reference).origins);
    while (queue.length > 0) {
      const origin = queue.shift();
      if (origin.external || origin.unresolved || origin.namespace) continue;
      const key = originKey(origin);
      if (!key || LEGACY.has(key) || PRIVILEGED.has(key) || stateVisited.has(key)) continue;
      stateVisited.add(key);
      if (pinnedModules.has(origin.file)) continue;
      const owner = factsOf(origin.file);
      const statement = owner?.statements.get(origin.name);
      if (!statement) continue;
      let followed = [];
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        tenantState.set(key, { origin, kind: 'function' });
        followed = ts.isFunctionDeclaration(statement) ? [statement] : [];
      } else if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations.find(
          candidate => ts.isIdentifier(candidate.name) && candidate.name.text === origin.name
        );
        if (!declaration || holdsPrimitive(statement, declaration)) continue;
        const unit = owner.declarations.get(origin.name);
        const functionValue = unit !== statement && isFunctionLike(unit);
        tenantState.set(key, { origin, kind: functionValue ? 'function' : 'value' });
        // The whole initializer (a wrapper and its arguments included) is followed as an alias.
        for (const reference of owner.references) {
          if (
            within(reference.node, statement) &&
            reference.binding &&
            !(functionValue && within(reference.node, unit))
          ) {
            queue.push(...originsOf(owner, reference).origins);
          }
        }
        if (functionValue) followed = [unit];
      }
      for (const unit of followed) {
        const { external } = expressionDependencies(owner, unit, returnRoots(unit));
        for (const reference of external) queue.push(...originsOf(owner, reference).origins);
      }
    }
  }

  const pinnedModules = new Set();
  function seedPinnedState() {
    for (const file of [...pinnedModules].sort()) {
      const fact = factsOf(file);
      if (!fact) continue;
      for (const name of graph.exportNames(file)) {
        for (const origin of graph.resolveExport(file, name)) {
          if (origin.file !== file) continue;
          const key = originKey(origin);
          if (!key || LEGACY.has(key) || PRIVILEGED.has(key) || tenantState.has(key)) continue;
          const statement = fact.statements.get(origin.name);
          if (!statement || !ts.isVariableStatement(statement)) continue;
          const declaration = statement.declarationList.declarations.find(
            candidate => ts.isIdentifier(candidate.name) && candidate.name.text === origin.name
          );
          if (!declaration || holdsPrimitive(statement, declaration)) continue;
          if (isFunctionLike(fact.declarations.get(origin.name))) continue;
          tenantState.set(key, { origin, kind: 'kernel' });
        }
      }
    }
  }

  // Methods that mutate their receiver in place (Array, Map, Set, Object, Reflect).
  const MUTATORS = new Set([
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse',
    'fill',
    'copyWithin',
    'set',
    'delete',
    'clear',
    'add',
    'assign',
    'defineProperty',
    'defineProperties',
    'setPrototypeOf',
    'deleteProperty',
  ]);
  // Query-builder methods a reviewed schema value may be handed to (Q2). The schema value is the
  // argument, never the receiver.
  const BUILDER_METHODS = new Set([
    'select',
    'selectDistinct',
    'selectDistinctOn',
    'from',
    'insert',
    'update',
    'delete',
    'values',
    'set',
    'where',
    'having',
    'orderBy',
    'groupBy',
    'returning',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'innerJoin',
    'leftJoin',
    'rightJoin',
    'fullJoin',
    'crossJoin',
    'with',
    'as',
  ]);
  const DB_SRC = 'packages/database/src';
  const SCHEMA = /^packages\/database\/src\/schema(?:\.ts$|\/)/u;
  const isWriteTarget = node => {
    const parent = node.parent;
    if (ts.isBinaryExpression(parent) && parent.left === node) {
      const operator = parent.operatorToken.kind;
      return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
    }
    if (
      (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)
    )
      return true;
    if (ts.isDeleteExpression(parent)) return true;
    // Destructuring assignment targets: `[state.x] = …`, `({ a: state.x } = …)`.
    let current = node;
    while (
      current.parent &&
      (ts.isArrayLiteralExpression(current.parent) ||
        ts.isSpreadElement(current.parent) ||
        ts.isShorthandPropertyAssignment(current.parent) ||
        (ts.isPropertyAssignment(current.parent) && current.parent.initializer === current) ||
        ts.isObjectLiteralExpression(current.parent))
    ) {
      current = current.parent;
    }
    return (
      current !== node &&
      ts.isBinaryExpression(current.parent) &&
      current.parent.left === current &&
      current.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    );
  };

  /** Whether a binary expression can evaluate to `operand` itself. */
  function yieldsOperand(binary, operand) {
    const operator = binary.operatorToken.kind;
    if (operator === ts.SyntaxKind.CommaToken) return binary.right === operand;
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return true;
    }
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return binary.right === operand;
    return false;
  }

  /** Whether a state binding is a const literal whose every member is a primitive literal. */
  function shallowPrimitive(origin) {
    const fact = factsOf(origin.file);
    const statement = fact?.statements.get(origin.name);
    if (!statement || !ts.isVariableStatement(statement)) return false;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return false;
    const declaration = statement.declarationList.declarations.find(
      each => ts.isIdentifier(each.name) && each.name.text === origin.name
    );
    const literal = declaration?.initializer && unwrap(declaration.initializer);
    const primitive = node => {
      const inner = unwrap(node);
      return (
        ts.isStringLiteralLike(inner) ||
        ts.isNumericLiteral(inner) ||
        inner.kind === ts.SyntaxKind.TrueKeyword ||
        inner.kind === ts.SyntaxKind.FalseKeyword ||
        inner.kind === ts.SyntaxKind.NullKeyword
      );
    };
    if (literal && ts.isArrayLiteralExpression(literal)) return literal.elements.every(primitive);
    if (literal && ts.isObjectLiteralExpression(literal))
      return literal.properties.every(
        property => ts.isPropertyAssignment(property) && primitive(property.initializer)
      );
    return false;
  }

  /** The read-only state contract that admits a changed-code call of `path` on `key`, if any. */
  function readContract(key, path) {
    const contract = stateContracts.find(entry => entry.key === key && entry.paths?.includes(path));
    if (!contract) return false;
    const separator = key.lastIndexOf('#');
    const fact = factsOf(key.slice(0, separator));
    const statement = fact?.statements.get(key.slice(separator + 1));
    return (
      Boolean(statement) && contract.sha256 === sha256(fingerprint(statement, fact.sourceFile))
    );
  }

  /** Whether a reviewed state contract admits an escape of `key` from this exact unit. */
  function escapeContract(key, fact, unit) {
    if (!unit) return false;
    const name = unitName(unit, fact.sourceFile);
    const print = sha256(fingerprint(unit, fact.sourceFile));
    return stateContracts.some(
      entry =>
        entry.key === key &&
        entry.escapes?.some(
          escape =>
            escape.file === fact.file &&
            escape.unit === name &&
            escape.sha256 === print &&
            escapeConsumed(escape)
        )
    );
  }

  /**
   * Whether the escaping unit's output reaches only its reviewed consumers: every reference to it
   * is a direct call inside a listed consumer unit whose text matches its reviewed digest. An
   * escape that names no consumer is never admitted.
   */
  function escapeConsumed(escape) {
    if (!Array.isArray(escape.consumers) || escape.consumers.length === 0) return false;
    for (const { fact, reference, form } of referencesTo(`${escape.file}#${escape.unit}`)) {
      if (form === 'export') continue;
      const use = outermost(reference.node);
      if (form !== 'call' || !ts.isCallExpression(use.parent) || use.parent.expression !== use)
        return false;
      const consumer = unitOf(reference.node);
      if (!consumer) return false;
      const consumerName = unitName(consumer, fact.sourceFile);
      const consumerPrint = sha256(fingerprint(consumer, fact.sourceFile));
      if (
        !escape.consumers.some(
          entry =>
            entry.file === fact.file &&
            entry.unit === consumerName &&
            entry.sha256 === consumerPrint
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Why a reference to tenant state is not an accepted form, or null when it is. Refused from any
   * code: a write (assignment, update, delete, destructuring target), a call through a computed
   * member that is not a literal, a known mutating method, and an escape (stored, returned,
   * aliased, passed to a callee whose closure changed). Changed code may in addition call no method
   * on the state at all unless a source-bound read-only contract names that member path (Q3).
   * Accepted: member reads, iteration, operators and conditions, calls into unchanged closures,
   * and, for reviewed schema values only, being handed to a finite query-builder method (Q2). A
   * function binding is refused only when it is reassigned.
   */
  function stateUseProblem(fact, node, entry, note) {
    const { origin, kind } = entry;
    const unit = unitOf(node);
    const changed = !unit || !fact.unchanged(unit);
    let value = outermost(node);
    const path = [];
    let member = false;
    let computed = false;
    while (
      (ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent)) &&
      value.parent.expression === value
    ) {
      const access = value.parent;
      member = true;
      if (ts.isPropertyAccessExpression(access)) path.push(access.name.text);
      else {
        const argument = unwrap(access.argumentExpression);
        if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument))
          path.push(argument.text);
        else computed = true;
      }
      value = outermost(access);
    }
    const parent = value.parent;
    // Unchanged code that writes or mutates state keeps doing so; when what it writes depends on
    // the unit's own parameters the unit is a writer, held to the legacy-sink caller rules.
    const writer = target => {
      if (changed) return null;
      note.writer(fact, unit, target);
      return null;
    };
    if (isWriteTarget(value)) return changed ? 'is written by changed code' : writer(value.parent);
    if (kind === 'function') return null;
    if (
      (ts.isCallExpression(parent) || ts.isTaggedTemplateExpression(parent)) &&
      (parent.expression ?? parent.tag) === value
    ) {
      if (!member) return closureUnchanged(origin) ? null : 'is called while its closure changed';
      if (computed) return changed ? 'is called through a computed member' : writer(parent);
      const method = path[path.length - 1];
      if (MUTATORS.has(method))
        return changed ? `is mutated by changed code (${method})` : writer(parent);
      if (changed && !readContract(entry.root ?? originKey(origin), path.join('.'))) {
        return `is called by changed code (${path.join('.')}) without a read-only contract`;
      }
      return null;
    }
    const schema = kind === 'kernel' && SCHEMA.test(origin.file);
    const call = argumentCall(value);
    if (call) {
      const callee = unwrap(call.expression);
      if (
        schema &&
        ts.isPropertyAccessExpression(callee) &&
        BUILDER_METHODS.has(callee.name.text)
      ) {
        const receiver = receiverProblem(fact, callee.expression);
        return receiver ? `is handed to ${receiver}` : null;
      }
      const problem = stateCalleeProblem(fact, unit, call.expression, changed);
      return problem ? `is passed to ${problem}` : null;
    }
    if (schema && member && builderProjection(fact, value)) return null;
    if (
      ts.isSpreadElement(parent) &&
      (ts.isCallExpression(parent.parent) || ts.isNewExpression(parent.parent))
    ) {
      const problem = stateCalleeProblem(fact, unit, parent.parent.expression, changed);
      return problem ? `is spread into ${problem}` : null;
    }
    // A shallow copy or an iteration hands out the members themselves: from changed code only
    // when every member of the state is a primitive (a const literal of primitives).
    if (
      (ts.isForOfStatement(parent) && parent.expression === value) ||
      (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent)) ||
      ts.isSpreadAssignment(parent)
    ) {
      return !changed || (!member && shallowPrimitive(origin))
        ? null
        : 'is copied or iterated by changed code while its members are not primitives';
    }
    // Reads that yield a primitive: key iteration, operators whose result is not an operand,
    // conditions, template text, computed keys. (`a ?? b`, `a || b`, `a && b` and `a, b` can
    // yield the operand itself.)
    if (
      (ts.isForInStatement(parent) && parent.expression === value) ||
      (ts.isBinaryExpression(parent) &&
        !isWriteTarget(parent.left) &&
        !yieldsOperand(parent, value)) ||
      ts.isPrefixUnaryExpression(parent) ||
      ts.isTypeOfExpression(parent) ||
      ts.isTemplateSpan(parent) ||
      (ts.isElementAccessExpression(parent) && parent.argumentExpression === value) ||
      (ts.isConditionalExpression(parent) && parent.condition === value) ||
      ((ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isSwitchStatement(parent)) &&
        parent.expression === value)
    ) {
      return null;
    }
    if (member && !changed) return null; // a member read in unchanged code
    // `const ALIAS = state` at module scope: the alias is the same state, judged at its own uses.
    if (
      !member &&
      ts.isVariableDeclaration(parent) &&
      parent.initializer === value &&
      ts.isIdentifier(parent.name)
    ) {
      const statement = parent.parent?.parent;
      if (
        statement &&
        ts.isVariableStatement(statement) &&
        statement.parent === fact.sourceFile &&
        parent.parent.flags & ts.NodeFlags.Const
      ) {
        note.alias({ file: fact.file, name: parent.name.text }, entry);
        return null;
      }
    }
    if (escapeContract(entry.root ?? originKey(origin), fact, unit)) return null;
    return `escapes (${parent?.getText(fact.sourceFile).slice(0, 60)})`;
  }

  /**
   * Why tenant state may not be handed to `callee`, or null. Beyond the unchanged-closure rule,
   * changed code may hand it only to a function it does not itself build: one named by an import
   * or module binding. A method of a local container (`seen.add(state)`), a call result and any
   * global (`Object.assign`, `Array.from` with a mapping callback, `Object.values` whose result
   * aliases the elements) are refused: no global is assumed to be a read-only contract.
   */
  function stateCalleeProblem(fact, unit, callee, changed) {
    const problem = calleeProblem(fact, unit, callee);
    if (problem || !changed) return problem;
    let root = unwrap(callee);
    const path = [];
    while (ts.isPropertyAccessExpression(root)) {
      path.unshift(root.name.text);
      root = unwrap(root.expression);
    }
    if (!ts.isIdentifier(root))
      return `a callee built by changed code (${callee.getText(fact.sourceFile).slice(0, 40)})`;
    const binding = referenceAt(fact, root)?.binding;
    if (!binding)
      return `a global callee that may keep or change it (${[root.text, ...path].join('.')})`;
    if (binding.kind === 'import' || binding.scope === fact.sourceFile) return null;
    return `a callee built by changed code (${callee.getText(fact.sourceFile).slice(0, 40)})`;
  }

  // ---- query-builder receivers (Q2-r) -------------------------------------------------------
  // A schema value may be handed to a builder method only on a recognized receiver: a kernel
  // client, or the transaction a kernel entry (or a recognized receiver's `.transaction`) hands
  // the callback it runs. Receivers are followed through builder calls, const bindings, `let`
  // bindings (every assignment), `??`/`||`/`?:`, object properties (last writer, spreads
  // followed) and function results (every return). Parameters are bound to their callers:
  //   - a receiver read from a declared function's parameter makes it a receiver sink: every
  //     caller passes a recognized receiver there, and a default must be one;
  //   - a receiver read from the parameter of a function value (an inline callback, a function
  //     passed by name or in an object property) binds the function it is handed to: every
  //     invocation there passes a recognized receiver, and every further hand-off is followed.
  // Anything else is an unknown receiver and is refused.
  const BUILDER_CLIENTS = new Set([
    `${DB_SRC}/db.ts#db`,
    `${DB_SRC}/db.ts#dbAdmin`,
    `${DB_SRC}/db.ts#dbRls`,
  ]);
  const TRANSACTION_ENTRIES = new Set([
    `${DB_SRC}/tenant-authority-context.ts#withTenantAuthority`,
    `${DB_SRC}/tenant.ts#withTenantContext`,
    `${DB_SRC}/tenant.ts#withTenantDb`,
  ]);
  const referenceIndex = new WeakMap();
  function referenceAt(fact, identifier) {
    let index = referenceIndex.get(fact);
    if (!index) {
      index = new Map(fact.references.map(reference => [reference.node, reference]));
      referenceIndex.set(fact, index);
    }
    return index.get(identifier);
  }
  function identifierOrigins(fact, identifier) {
    const reference = referenceAt(fact, identifier);
    return reference?.binding ? originsOf(fact, reference).origins.map(originKey) : [];
  }
  const allIn = (keys, set) => keys.length > 0 && keys.every(key => set.has(key));
  const propertyNameOf = name =>
    name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ? name.text : null;
  // The key an object-literal member writes: its name, SPREAD, or UNKNOWN_KEY for a computed key
  // that is not a literal (it may write any property).
  const SPREAD = Symbol('spread');
  const UNKNOWN_KEY = Symbol('unknown key');
  const keyOf = property => {
    if (ts.isSpreadAssignment(property)) return SPREAD;
    const name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      const expression = unwrap(name.expression);
      return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)
        ? expression.text
        : UNKNOWN_KEY;
    }
    return propertyNameOf(name) ?? (ts.isNumericLiteral(name) ? name.text : UNKNOWN_KEY);
  };
  /** The property a binding element reads (its name, or UNKNOWN_KEY for a computed one). */
  const elementKey = element => {
    const name = element.propertyName ?? element.name;
    if (ts.isComputedPropertyName(name)) {
      const expression = unwrap(name.expression);
      return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)
        ? expression.text
        : UNKNOWN_KEY;
    }
    return propertyNameOf(name) ?? UNKNOWN_KEY;
  };
  const usesOf = (fact, binding) =>
    fact.references.filter(reference => reference.binding === binding);

  /** The property an object binding pattern binds to `id` ('...' for a rest element). */
  function boundProperty(pattern, id) {
    if (!ts.isObjectBindingPattern(pattern)) return null;
    for (const element of pattern.elements) {
      if (element.name !== id) continue;
      if (element.dotDotDotToken) return '...';
      return element.propertyName ? propertyNameOf(element.propertyName) : id.text;
    }
    return null;
  }

  /** The expressions a function returns (an expression body, or its own return statements). */
  function returnsOf(fn) {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const found = [];
    const visit = node => {
      if (node !== fn.body && isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
    return found;
  }

  /** The functions an expression may evaluate to, or null when they cannot all be resolved. */
  function functionTargets(fact, expression, path = [], seen = new Set()) {
    const node = unwrap(expression);
    const union = (...parts) => {
      const results = parts.map(part => functionTargets(fact, part, path, seen));
      return results.includes(null) ? null : results.flat();
    };
    if (isFunctionLike(node)) return path.length === 0 ? [{ fact, fn: node }] : null;
    if (ts.isConditionalExpression(node)) return union(node.whenTrue, node.whenFalse);
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      return union(node.left, node.right);
    }
    if (ts.isPropertyAccessExpression(node))
      return functionTargets(fact, node.expression, [node.name.text, ...path], seen);
    if (ts.isObjectLiteralExpression(node) && path.length > 0) {
      const [name, ...rest] = path;
      // Walking back from the last member: a spread may or may not carry the property, so its
      // contribution is collected and the walk continues; an explicit member ends it.
      const targets = [];
      for (const property of [...node.properties].reverse()) {
        const key = keyOf(property);
        if (key === UNKNOWN_KEY) return null;
        if (key === SPREAD) {
          const spread = functionTargets(fact, property.expression, path, seen);
          if (!spread) return null;
          targets.push(...spread);
          continue;
        }
        if (key !== name) continue;
        const own = ts.isShorthandPropertyAssignment(property)
          ? functionTargets(fact, property.name, rest, seen)
          : ts.isPropertyAssignment(property)
            ? functionTargets(fact, property.initializer, rest, seen)
            : rest.length === 0 && ts.isMethodDeclaration(property)
              ? [{ fact, fn: property }]
              : null;
        return own ? [...targets, ...own] : null;
      }
      return targets; // otherwise never set: nothing to invoke
    }
    if (ts.isCallExpression(node)) {
      const callees = functionTargets(fact, node.expression, [], seen);
      if (!callees) return null;
      const targets = [];
      for (const callee of callees) {
        const returns = returnsOf(callee.fn);
        if (returns.length === 0) return null;
        for (const returned of returns) {
          const inner = functionTargets(callee.fact, returned, path, seen);
          if (!inner) return null;
          targets.push(...inner);
        }
      }
      return targets;
    }
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) return [];
    if (!ts.isIdentifier(node)) return null;
    if (node.text === 'undefined') return [];
    const reference = referenceAt(fact, node);
    const binding = reference?.binding;
    if (!binding) return null;
    const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
    if (seen.has(mark)) return [];
    seen.add(mark);
    if (binding.kind === 'function') return path.length === 0 ? [{ fact, fn: binding.decl }] : null;
    if (binding.kind === 'var') {
      const declaration = binding.decl;
      if (!declaration.initializer || !(declaration.parent.flags & ts.NodeFlags.Const)) return null;
      if (declaration.name !== binding.id) {
        const property = boundProperty(declaration.name, binding.id);
        if (property === null) return null;
        const at = property === '...' ? path : [property, ...path];
        return functionTargets(fact, declaration.initializer, at, seen);
      }
      const top = fact.declarations.get(binding.name);
      if (
        path.length === 0 &&
        top &&
        isFunctionLike(top) &&
        declaration.parent.parent?.parent === fact.sourceFile
      ) {
        return [{ fact, fn: top }];
      }
      return functionTargets(fact, declaration.initializer, path, seen);
    }
    if (binding.kind === 'param') {
      const fn = binding.decl;
      // `import('<module>').then(({ name }) => …)`: an export of that module.
      const callback = outermost(fn);
      const then = callback.parent;
      const loader =
        ts.isCallExpression(then) &&
        then.arguments[0] === callback &&
        ts.isPropertyAccessExpression(unwrap(then.expression)) &&
        unwrap(then.expression).name.text === 'then'
          ? unwrap(unwrap(then.expression).expression)
          : null;
      if (
        loader &&
        ts.isCallExpression(loader) &&
        loader.expression.kind === ts.SyntaxKind.ImportKeyword &&
        loader.arguments.length === 1 &&
        ts.isStringLiteralLike(loader.arguments[0]) &&
        fn.parameters[0] &&
        ts.isObjectBindingPattern(fn.parameters[0].name)
      ) {
        const name = boundProperty(fn.parameters[0].name, binding.id);
        if (!name || name === '...' || path.length > 0) return null;
        const origins = graph.resolveImport(fact.file, loader.arguments[0].text, name);
        if (origins.length !== 1 || !origins[0].file) return null;
        const owner = factsOf(origins[0].file);
        const target = owner?.declarations.get(origins[0].name);
        return target && isFunctionLike(target) ? [{ fact: owner, fn: target }] : null;
      }
      // A function supplied by the callers of a declared function: every value they pass.
      const index = fn.parameters.findIndex(
        parameter => parameter.name === binding.id || boundProperty(parameter.name, binding.id)
      );
      const parameter = fn.parameters[index];
      const declared = parameter && !parameter.dotDotDotToken && declaredFunction(fact, fn);
      if (!declared) return null;
      const property =
        parameter.name === binding.id ? null : boundProperty(parameter.name, binding.id);
      const at = property === null || property === '...' ? path : [property, ...path];
      const targets = parameter.initializer
        ? functionTargets(fact, parameter.initializer, at, seen)
        : [];
      if (!targets) return null;
      for (const { fact: caller, reference: use, form } of callersOf(fact, declared)) {
        if (form === 'export') continue;
        const value = outermost(use.node);
        const call = value.parent;
        if (form !== 'call' || !ts.isCallExpression(call) || call.expression !== value) return null;
        const spread = call.arguments.findIndex(argument => ts.isSpreadElement(argument));
        if (spread !== -1 && spread <= index) return null;
        const argument = call.arguments[index];
        if (!argument) continue;
        const passed = functionTargets(caller, argument, at, seen);
        if (!passed) return null;
        targets.push(...passed);
      }
      return targets;
    }
    if (binding.kind !== 'import' || path.length > 0) return null;
    const { origins } = originsOf(fact, reference);
    if (origins.length !== 1 || !origins[0].file) return null;
    const owner = factsOf(origins[0].file);
    const fn = owner?.declarations.get(origins[0].name);
    return fn && isFunctionLike(fn) ? [{ fact: owner, fn }] : null;
  }

  /** Whether a resolved function is a kernel transaction entry (its body is pinned, not walked). */
  const kernelEntry = target =>
    TRANSACTION_ENTRIES.has(declaredFunction(target.fact, target.fn)?.key ?? '');
  // Kernel entries take their callback as the last parameter.
  const kernelCallback = (target, position) => position === target.fn.parameters.length - 1;

  /** Whether a rest element of `pattern` still carries property `name`. */
  const restCarries = (pattern, name) =>
    !pattern.elements.some(
      element =>
        !element.dotDotDotToken && propertyNameOf(element.propertyName ?? element.name) === name
    );

  /** Every reference to a declared function, with the fact it is in and its form. */
  function callersOf(fact, declared) {
    return declared.key
      ? referencesTo(declared.key)
      : fact.references
          .filter(reference => reference.binding?.decl === declared.local)
          .map(reference => ({ fact, reference, form: referenceForm(reference.node) }));
  }

  const receiverSinks = new Map();
  const receiverQueue = [];
  function receiverSink(sink) {
    const key = [
      sink.kind,
      sink.fact.file,
      sink.fn.pos,
      sink.index,
      sink.member ?? '',
      sink.param ?? '',
      sink.path.join('.'),
    ].join(':');
    if (!receiverSinks.has(key)) {
      receiverSinks.set(key, sink);
      receiverQueue.push(sink);
    }
    return null;
  }

  /**
   * A function value at `node` is handed on; when invoked, its parameter `param` (at `path`) is a
   * receiver. Null when every way it can be invoked passes a recognized receiver (or is queued as a
   * sink to be checked), else why not.
   */
  function handOffProblem(fact, node, param, path) {
    const value = outermost(node);
    const parent = value.parent;
    if (ts.isCallExpression(parent) && parent.expression === value) {
      const spread = parent.arguments.findIndex(argument => ts.isSpreadElement(argument));
      if (spread !== -1 && spread <= param) return 'a spread receiver argument';
      const argument = parent.arguments[param];
      return argument ? receiverProblem(fact, argument, path) : null;
    }
    // Truthiness tests of the function do not invoke it.
    if (
      (ts.isConditionalExpression(parent) && parent.condition === value) ||
      (ts.isIfStatement(parent) && parent.expression === value) ||
      (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) ||
      ts.isTypeOfExpression(parent)
    ) {
      return null;
    }
    let member = null;
    let carried = value;
    if (ts.isMethodDeclaration(value) || ts.isShorthandPropertyAssignment(value)) {
      member = propertyNameOf(value.name);
      carried = outermost(value.parent);
    } else if (ts.isPropertyAssignment(parent) && parent.initializer === value) {
      member = propertyNameOf(parent.name);
      carried = outermost(parent.parent);
    } else if (ts.isShorthandPropertyAssignment(parent)) {
      member = propertyNameOf(parent.name);
      carried = outermost(parent.parent);
    }
    if (member === null && carried !== value) return 'a computed callback property';
    const call = carried.parent;
    if (!call || !ts.isCallExpression(call) || !call.arguments.includes(carried))
      return `a callback handed on (${parent.getText(fact.sourceFile).slice(0, 40)})`;
    const position = call.arguments.indexOf(carried);
    const opener = unwrap(call.expression);
    if (member === null && param === 0 && path.length === 0) {
      if (ts.isIdentifier(opener) && allIn(identifierOrigins(fact, opener), TRANSACTION_ENTRIES))
        return null;
      if (ts.isPropertyAccessExpression(opener) && opener.name.text === 'transaction')
        return receiverProblem(fact, opener.expression);
    }
    const targets = functionTargets(fact, call.expression);
    if (!targets) return 'a callback handed to an unresolved function';
    for (const target of targets) {
      if (kernelEntry(target)) {
        if (member !== null || param !== 0 || path.length > 0 || !kernelCallback(target, position))
          return 'a callback handed to a kernel entry in an unsupported position';
        continue;
      }
      receiverSink({
        kind: 'callback',
        fact: target.fact,
        fn: target.fn,
        index: position,
        member,
        param,
        path,
      });
    }
    return null;
  }

  /** Null when `expression` (read at `path`) is a recognized receiver, else why it is not. */
  function receiverProblem(fact, expression, path = [], seen = new Set()) {
    const node = unwrap(expression);
    const unknown = `an unknown receiver (${node.getText(fact.sourceFile).slice(0, 40)})`;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (
        path.length === 0 &&
        ts.isPropertyAccessExpression(callee) &&
        BUILDER_METHODS.has(callee.name.text)
      ) {
        return receiverProblem(fact, callee.expression, [], seen);
      }
      // A function result: every value it can return.
      const targets = functionTargets(fact, node.expression);
      if (!targets || targets.length === 0) return unknown;
      for (const target of targets) {
        for (const returned of returnsOf(target.fn)) {
          const problem = receiverProblem(target.fact, returned, path, seen);
          if (problem) return problem;
        }
      }
      return null;
    }
    if (ts.isAwaitExpression(node)) return receiverProblem(fact, node.expression, path, seen);
    if (ts.isPropertyAccessExpression(node))
      return receiverProblem(fact, node.expression, [node.name.text, ...path], seen);
    if (ts.isConditionalExpression(node))
      return (
        receiverProblem(fact, node.whenTrue, path, seen) ??
        receiverProblem(fact, node.whenFalse, path, seen)
      );
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      return (
        receiverProblem(fact, node.left, path, seen) ??
        receiverProblem(fact, node.right, path, seen)
      );
    }
    // A facade of bound builder methods, `{ insert: tx.insert.bind(tx), … }`, on a recognized tx.
    if (ts.isObjectLiteralExpression(node) && path.length === 0) {
      if (node.properties.length === 0) return unknown;
      for (const property of node.properties) {
        const name = ts.isPropertyAssignment(property) ? propertyNameOf(property.name) : null;
        const bound = name && unwrap(property.initializer);
        const bind = bound && ts.isCallExpression(bound) && unwrap(bound.expression);
        const method =
          bind && ts.isPropertyAccessExpression(bind) && bind.name.text === 'bind'
            ? unwrap(bind.expression)
            : null;
        const self = method && ts.isPropertyAccessExpression(method) && unwrap(method.expression);
        const thisArgument = bound?.arguments?.length === 1 && unwrap(bound.arguments[0]);
        if (
          !BUILDER_METHODS.has(name) ||
          !self ||
          method.name.text !== name ||
          !ts.isIdentifier(self) ||
          !thisArgument ||
          !ts.isIdentifier(thisArgument) ||
          self.text !== thisArgument.text
        ) {
          return unknown;
        }
        const problem = receiverProblem(fact, self, [], seen);
        if (problem) return problem;
      }
      return null;
    }
    if (ts.isObjectLiteralExpression(node) && path.length > 0) {
      const [name, ...rest] = path;
      // Walking back from the last member: a spread may or may not carry the property, so what it
      // carries is checked and the walk continues to the earlier members; an explicit member ends
      // it, and a computed key that is not a literal may write the property and is refused.
      for (const property of [...node.properties].reverse()) {
        const key = keyOf(property);
        if (key === UNKNOWN_KEY) return unknown;
        if (key === SPREAD) {
          const problem = receiverProblem(fact, property.expression, path, seen);
          if (problem) return problem;
          continue;
        }
        if (key !== name) continue;
        if (ts.isShorthandPropertyAssignment(property))
          return receiverProblem(fact, property.name, rest, seen);
        if (ts.isPropertyAssignment(property))
          return receiverProblem(fact, property.initializer, rest, seen);
        return unknown;
      }
      return null; // otherwise never set: the receiver is undefined, which no builder call accepts
    }
    if (!ts.isIdentifier(node)) return unknown;
    const reference = referenceAt(fact, node);
    const binding = reference?.binding;
    if (!binding) return unknown;
    if (binding.kind === 'import')
      return path.length === 0 && allIn(identifierOrigins(fact, node), BUILDER_CLIENTS)
        ? null
        : unknown;
    // A cycle adds no value source of its own: the other sources decide.
    const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
    if (seen.has(mark)) return null;
    seen.add(mark);
    if (binding.kind === 'var') {
      const declaration = binding.decl;
      const property =
        declaration.name === binding.id ? null : boundProperty(declaration.name, binding.id);
      if (declaration.name !== binding.id && property === null) return unknown;
      if (property === '...' && path.length > 0 && !restCarries(declaration.name, path[0]))
        return null; // the rest omits it: undefined
      const at = property === null || property === '...' ? path : [property, ...path];
      if (declaration.parent.flags & ts.NodeFlags.Const) {
        return declaration.initializer
          ? receiverProblem(fact, declaration.initializer, at, seen)
          : unknown;
      }
      if (!(declaration.parent.flags & ts.NodeFlags.Let) || property !== null) return unknown;
      // `let`: the initializer and every plain assignment.
      if (declaration.initializer) {
        const problem = receiverProblem(fact, declaration.initializer, path, seen);
        if (problem) return problem;
      }
      for (const use of usesOf(fact, binding)) {
        const target = outermost(use.node);
        if (!isWriteTarget(target)) continue;
        const assignment = target.parent;
        if (
          !ts.isBinaryExpression(assignment) ||
          assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        ) {
          return unknown;
        }
        const problem = receiverProblem(fact, assignment.right, path, seen);
        if (problem) return problem;
      }
      return null;
    }
    if (binding.kind !== 'param') return unknown;
    const fn = binding.decl;
    const index = fn.parameters.findIndex(
      parameter => parameter.name === binding.id || boundProperty(parameter.name, binding.id)
    );
    const parameter = fn.parameters[index];
    if (!parameter || parameter.dotDotDotToken) return unknown;
    const property =
      parameter.name === binding.id ? null : boundProperty(parameter.name, binding.id);
    if (property === '...' && path.length > 0 && !restCarries(parameter.name, path[0])) return null;
    const at = property === null || property === '...' ? path : [property, ...path];
    const declared = declaredFunction(fact, fn);
    if (declared) receiverSink({ kind: 'param', fact, fn, index, path: at, declared });
    // A function that is also a call argument (`const f = wrap(fn)`) is handed on as well.
    const wrapped = outermost(fn).parent;
    if (declared && !(ts.isCallExpression(wrapped) && wrapped.arguments.includes(outermost(fn))))
      return null;
    const handOff = handOffProblem(fact, fn, index, at);
    return handOff ? `${unknown}: ${handOff}` : null;
  }

  /** How callers reach `fn`: its top-level key, or its local binding declaration. */
  function declaredFunction(fact, fn) {
    for (const [name, unit] of fact.declarations) {
      if (unit === fn) return { key: `${fact.file}#${name}` };
    }
    if (ts.isFunctionDeclaration(fn) && fn.name) return { local: fn };
    const declaration = outermost(fn).parent;
    if (
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name) &&
      declaration.parent.flags & ts.NodeFlags.Const
    ) {
      return { local: declaration };
    }
    return null;
  }

  let originIndex = null;
  function referencesTo(key) {
    if (!originIndex) {
      originIndex = new Map();
      for (const file of [...sources.keys()].sort()) {
        if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
        const fact = factsOf(file);
        if (!fact) continue;
        for (const reference of fact.references) {
          if (!reference.binding) continue;
          const { origins, form } = originsOf(fact, reference);
          for (const origin of origins) {
            const originName = originKey(origin);
            if (!originName) continue;
            if (!originIndex.has(originName)) originIndex.set(originName, []);
            originIndex.get(originName).push({ fact, reference, form });
          }
        }
      }
    }
    return originIndex.get(key) ?? [];
  }

  /** Checks one receiver sink; returns the violations as { fact, node, detail }. */
  function receiverSinkProblems(sink) {
    const problems = [];
    const label = `${sink.fact.file}#${unitName(sink.fn, sink.fact.sourceFile)}`;
    const report = (fact, node, problem) => {
      if (problem) problems.push({ fact, node, detail: `${problem} reaches ${label}` });
    };
    if (sink.kind === 'param') {
      const parameter = sink.fn.parameters[sink.index];
      if (parameter.initializer)
        report(
          sink.fact,
          parameter.initializer,
          receiverProblem(sink.fact, parameter.initializer, sink.path)
        );
      const callers = callersOf(sink.fact, sink.declared);
      for (const { fact, reference, form } of callers) {
        if (form === 'export') continue;
        report(fact, reference.node, handOffProblem(fact, reference.node, sink.index, sink.path));
      }
      return problems;
    }
    // A callback sink: the function value at parameter `index` (or its property `member`) of
    // `fn` is invoked with a receiver at `param`.
    const parameter = sink.fn.parameters[sink.index];
    if (!parameter || parameter.dotDotDotToken) {
      report(sink.fact, sink.fn, 'a callback in an unsupported parameter');
      return problems;
    }
    const objectUses = (binding, member) => {
      for (const use of usesOf(sink.fact, binding)) {
        const value = outermost(use.node);
        const parent = value.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
          if (parent.name.text === member)
            report(sink.fact, parent, handOffProblem(sink.fact, parent, sink.param, sink.path));
          continue;
        }
        if (
          ts.isVariableDeclaration(parent) &&
          parent.initializer === value &&
          ts.isObjectBindingPattern(parent.name)
        ) {
          for (const element of parent.name.elements) {
            const property = element.dotDotDotToken ? '...' : elementKey(element);
            if (property === UNKNOWN_KEY) {
              report(sink.fact, element, 'a callback read through a computed key');
              continue;
            }
            if (property !== member && property !== '...') continue;
            if (property === '...' && !restCarries(parent.name, member)) continue;
            const inner = sink.fact.references.find(
              reference => reference.binding?.id === element.name
            )?.binding;
            if (!inner) continue;
            if (property === '...') objectUses(inner, member);
            else functionUses(inner);
          }
          continue;
        }
        // Truthiness tests of the carrier do not reach the callback.
        if (
          (ts.isConditionalExpression(parent) && parent.condition === value) ||
          (ts.isIfStatement(parent) && parent.expression === value) ||
          (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken)
        ) {
          continue;
        }
        // The whole object, or a spread of it, handed to another function keeps the member.
        const carried = ts.isSpreadAssignment(parent) ? outermost(parent.parent) : value;
        const call = carried.parent;
        const targets =
          call && ts.isCallExpression(call) && call.arguments.includes(carried)
            ? functionTargets(sink.fact, call.expression)
            : null;
        if (!targets || targets.length === 0) {
          report(
            sink.fact,
            use.node,
            `a callback carrier handed on (${parent.getText(sink.fact.sourceFile).slice(0, 40)})`
          );
          continue;
        }
        for (const target of targets) {
          receiverSink({
            ...sink,
            fact: target.fact,
            fn: target.fn,
            index: call.arguments.indexOf(carried),
          });
        }
      }
    };
    const functionUses = binding => {
      for (const use of usesOf(sink.fact, binding))
        report(sink.fact, use.node, handOffProblem(sink.fact, use.node, sink.param, sink.path));
    };
    const ids = [];
    const collect = (name, member) => {
      if (ts.isIdentifier(name)) ids.push({ id: name, member });
      else if (ts.isObjectBindingPattern(name) && member !== null) {
        for (const element of name.elements) {
          if (element.dotDotDotToken) {
            if (restCarries(name, member)) ids.push({ id: element.name, member });
          } else if (elementKey(element) === UNKNOWN_KEY) {
            report(sink.fact, element, 'a callback read through a computed key');
          } else if (elementKey(element) === member) ids.push({ id: element.name, member: null });
        }
      } else report(sink.fact, name, 'a callback in a destructured parameter');
    };
    collect(parameter.name, sink.member);
    for (const { id, member } of ids) {
      const binding = sink.fact.references.find(reference => reference.binding?.id === id)?.binding;
      if (!binding) continue;
      if (member === null) functionUses(binding);
      else objectUses(binding, member);
    }
    return problems;
  }

  /**
   * A schema column read stored as a property of a const object literal whose every use is a
   * direct argument of a query-builder method: `const columns = { id: t.id }; tx.select(columns)`.
   */
  function builderProjection(fact, value) {
    const property = value.parent;
    if (!ts.isPropertyAssignment(property) || property.initializer !== value) return false;
    const literal = outermost(property.parent);
    const declaration = literal.parent;
    if (
      !ts.isVariableDeclaration(declaration) ||
      declaration.initializer !== literal ||
      !ts.isIdentifier(declaration.name)
    ) {
      return false;
    }
    if (!(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    const uses = fact.references.filter(reference => reference.binding?.decl === declaration);
    return (
      uses.length > 0 &&
      uses.every(reference => {
        const use = outermost(reference.node);
        const call = use.parent;
        if (!call || !ts.isCallExpression(call) || !call.arguments.includes(use)) return false;
        const callee = unwrap(call.expression);
        return (
          ts.isPropertyAccessExpression(callee) &&
          BUILDER_METHODS.has(callee.name.text) &&
          !receiverProblem(fact, callee.expression)
        );
      })
    );
  }

  /** The expression a legacy operation takes its tenant from. */
  function tenantExpressionOf(node, form) {
    if (form === 'call') {
      const call = node.parent;
      return call && ts.isCallExpression(call) && call.arguments[0] ? [call.arguments[0]] : [];
    }
    // Ambient client: the whole statement or initializer the query chain lives in.
    let current = node;
    while (current.parent && !ts.isStatement(current.parent) && !isFunctionLike(current.parent)) {
      current = current.parent;
    }
    return [current];
  }

  // ---- contracts (C3 and connection control) -----------------------------------------------
  const contractUse = new Map();
  function covered(fact, node, kind) {
    const unit = unitOf(node);
    const name = unitName(unit, fact.sourceFile);
    const contract = contracts.find(entry => entry.file === fact.file && entry.unit === name);
    if (!contract || !(kind in contract.kinds)) return false;
    const digest = sha256(fingerprint(unit, fact.sourceFile));
    if (contract.sha256 !== digest) return false;
    const key = `${fact.file}#${name}#${kind}`;
    contractUse.set(key, (contractUse.get(key) ?? 0) + 1);
    return contractUse.get(key) <= contract.kinds[kind];
  }

  // ---- pass 1: per-file rules ---------------------------------------------------------------
  const legacySinks = new Map(); // `${file}#${name}` -> { file, unit, params }
  const legacyOps = [];
  const connectionControlUnits = [];

  for (const file of [...sources.keys()].sort()) {
    if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
    const fact = factsOf(file);
    if (!fact) continue;
    telemetry.files += 1;
    const { sourceFile } = fact;
    const kernel = KERNEL.test(file);

    for (const reference of fact.references) {
      const { origins, form, namespace } = originsOf(fact, reference);
      if (form === 'namespace-value' && namespace?.some(isPrivilegedModule)) {
        violate(
          file,
          reference.node,
          sourceFile,
          'R-a',
          `opaque use of a privileged module object ${reference.node.text}`
        );
        continue;
      }
      for (const origin of origins) {
        if (origin.unresolved && !kernel) {
          violate(
            file,
            reference.node,
            sourceFile,
            'C3',
            `unresolved workspace import ${origin.unresolved}`
          );
          continue;
        }
        const key = originKey(origin);
        if (!key || origin.file === file) continue;
        const privileged = PRIVILEGED.get(key);
        if (privileged) {
          const allowedForm =
            form === privileged.form || (form === 'export' && privileged.reexports.includes(file));
          if (
            !privileged.callers.includes(file) &&
            !(form === 'export' && privileged.reexports.includes(file))
          ) {
            violate(
              file,
              reference.node,
              sourceFile,
              'R-a',
              `${key} is not available to this file`
            );
          } else if (!allowedForm && !covered(fact, reference.node, `value:${origin.name}`)) {
            violate(
              file,
              reference.node,
              sourceFile,
              'R-a',
              `${key} used as ${form}; only a direct ${privileged.form} is allowed`
            );
          }
          continue;
        }
        if (LEGACY.has(key) && !kernel) {
          const unit = unitOf(reference.node);
          const expected = key.endsWith('#db') ? 'member' : 'call';
          if (form === 'export') continue; // importers resolve through the re-export to the origin
          if (form !== expected) {
            if (covered(fact, reference.node, `value:${origin.name}`)) continue;
            violate(
              file,
              reference.node,
              sourceFile,
              'C1',
              `${key} used as ${form}; legacy operations admit only a direct ${expected}`
            );
          } else if (!fact.unchanged(unit)) {
            violate(
              file,
              reference.node,
              sourceFile,
              'C1',
              `${key} in a changed unit; use withTenantAuthority`
            );
          } else {
            legacyOps.push({ fact, unit, node: reference.node, form, key });
          }
        }
      }
    }

    ts.forEachChild(sourceFile, function visit(node) {
      // Re-exports with a module specifier.
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.isTypeOnly
      ) {
        const specifier = node.moduleSpecifier.text;
        const names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements
                .filter(element => !element.isTypeOnly)
                .map(element => (element.propertyName ?? element.name).text)
            : null;
        const origins = names
          ? names.flatMap(name => graph.resolveImport(file, specifier, name))
          : graph
              .resolveSpecifier(file, specifier)
              .files.flatMap(target =>
                [...graph.exportNames(target)].flatMap(name => graph.resolveExport(target, name))
              );
        for (const origin of origins) {
          const key = originKey(origin);
          const privileged = key && PRIVILEGED.get(key);
          if (privileged && !privileged.reexports.includes(file)) {
            violate(file, node, sourceFile, 'R-a', `re-export of ${key}`);
          }
        }
      }
      // Static imports: drivers and test modules.
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (DRIVER_SPECIFIERS.test(specifier) && !DRIVER_MODULES.has(file)) {
          violate(file, node, sourceFile, 'R-d', `driver import ${specifier}`);
        }
        if (!node.importClause?.isTypeOnly) {
          const resolved = graph.resolveSpecifier(file, specifier);
          if (resolved.files.some(isTest))
            violate(file, node, sourceFile, 'R-a', `runtime import of test module ${specifier}`);
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        // Dynamic import and require.
        const loader =
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) &&
            callee.text === 'require' &&
            !fact.references.find(reference => reference.node === callee)?.binding);
        if (loader && !kernel) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteralLike(argument)) {
            if (!covered(fact, node, 'dynamic-import'))
              violate(file, node, sourceFile, 'R-e', 'opaque dynamic import');
          } else {
            const specifier = argument.text;
            const resolved = graph.resolveSpecifier(file, specifier);
            if (DRIVER_SPECIFIERS.test(specifier) && !DRIVER_MODULES.has(file))
              violate(file, node, sourceFile, 'R-d', `driver import ${specifier}`);
            if (resolved.files.some(isPrivilegedModule) && !covered(fact, node, 'dynamic-import')) {
              violate(
                file,
                node,
                sourceFile,
                'R-e',
                `dynamic import of privileged module ${specifier}`
              );
            }
            if (resolved.files.some(isTest))
              violate(file, node, sourceFile, 'R-a', `runtime import of test module ${specifier}`);
          }
        }
        // eval / Function.
        if (
          ts.isIdentifier(callee) &&
          ['eval', 'Function'].includes(callee.text) &&
          !fact.references.find(reference => reference.node === callee)?.binding
        ) {
          if (!covered(fact, node, 'eval'))
            violate(file, node, sourceFile, 'R-e', `${callee.text}() evaluates opaque code`);
        }
        // C3: raw execution outside the database package.
        if (!kernel && ts.isPropertyAccessExpression(callee)) {
          const name = callee.name.text;
          // `.execute(callback)` (circuit breakers, idempotency wrappers) runs no SQL.
          const first = node.arguments[0];
          const sqlArgument =
            first && !ts.isArrowFunction(first) && !ts.isFunctionExpression(first);
          const kind =
            name === 'execute' && sqlArgument
              ? 'execute'
              : name === 'raw' && callee.expression.getText(sourceFile) === 'sql'
                ? 'sql.raw'
                : null;
          if (kind && !covered(fact, node, kind))
            violate(file, node, sourceFile, 'C3', `${kind} needs a source-bound contract`);
        }
        // drizzle() construction.
        if (ts.isIdentifier(callee) && callee.text === 'drizzle' && !DRIVER_MODULES.has(file)) {
          violate(file, node, sourceFile, 'R-d', 'drizzle() client construction');
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Function'
      ) {
        if (!covered(fact, node, 'eval'))
          violate(file, node, sourceFile, 'R-e', 'new Function() evaluates opaque code');
      }
      if (!kernel && ts.isPropertyAccessExpression(node) && node.name.text === '$client') {
        if (!covered(fact, node, '$client'))
          violate(file, node, sourceFile, 'C3', '$client needs a source-bound contract');
      }
      // Connection-control SQL text.
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)) &&
        CONNECTION_CONTROL.test(node.text) &&
        !CONNECTION_CONTROL_MODULES.has(file)
      ) {
        if (!covered(fact, node, 'connection-control'))
          violate(file, node, sourceFile, 'R-d', 'connection-control SQL outside tenant.ts');
        else connectionControlUnits.push({ fact, unit: unitOf(node) });
      }
      ts.forEachChild(node, visit);
    });
  }

  // ---- pass 2: dependencies of accepted legacy operations, and legacy tenant sinks ----------
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  if (legacyOps.length > 0) seedPinnedState();
  for (const op of legacyOps) {
    const { fact, unit, node, form, key } = op;
    const roots = tenantExpressionOf(node, form);
    const { params, external } = expressionDependencies(fact, unit, roots);
    const dependencies = dependenciesUnchanged(fact, external);
    if (!dependencies.ok) {
      violate(
        fact.file,
        node,
        fact.sourceFile,
        'C1',
        `${key} depends on changed code (${dependencies.witness})`
      );
      continue;
    }
    if (form === 'call') {
      const call = node.parent;
      const problem = call.arguments
        .slice(1)
        .map(argument => transferProblem(fact, unit, argument))
        .find(Boolean);
      if (problem) {
        violate(
          fact.file,
          node,
          fact.sourceFile,
          'C1',
          `${key} hands its transaction to ${problem}`
        );
        continue;
      }
      collectTenantState(fact, external);
    }
    telemetry.legacyAccepted += 1;
    accepted.push({ file: fact.file, unit: unitName(unit, fact.sourceFile), key });
    if (params.size > 0) markSink(fact, unit, params);
  }

  // A contracted unit that pins tenant GUCs takes its tenant from its parameters: its callers are
  // held to the same edge rule as any legacy sink.
  for (const { fact, unit } of connectionControlUnits) {
    const params = new Set();
    if (isFunctionLike(unit)) {
      for (const parameter of unit.parameters)
        if (ts.isIdentifier(parameter.name)) params.add(parameter.name.text);
    }
    if (params.size > 0) markSink(fact, unit, params);
  }

  function markSink(fact, unit, params, writer = false) {
    const name = unitName(unit, fact.sourceFile);
    const sinkKey = `${fact.file}#${name}`;
    const existing = legacySinks.get(sinkKey);
    if (existing) {
      for (const param of params) existing.params.add(param);
      if (!writer) existing.writer = false;
      return false;
    }
    legacySinks.set(sinkKey, {
      file: fact.file,
      unit,
      name,
      params: new Set(params),
      writer,
      topLevel: fact.declarations.get(name) === unit,
    });
    return true;
  }

  /** The arguments of a call into a sink that bind its tenant parameters (all, when unknowable). */
  function sinkArguments(sink, node) {
    const all = callArguments(node);
    const call = outermost(node).parent;
    if (!call || !ts.isCallExpression(call) || !isFunctionLike(sink.unit)) return all;
    const spreadAt = call.arguments.findIndex(argument => ts.isSpreadElement(argument));
    const chosen = new Set();
    sink.unit.parameters.forEach((parameter, index) => {
      const names = [];
      const collect = name => {
        if (ts.isIdentifier(name)) names.push(name.text);
        else
          for (const element of name.elements)
            if (ts.isBindingElement(element)) collect(element.name);
      };
      collect(parameter.name);
      if (!names.some(name => sink.params.has(name))) return;
      const last = parameter.dotDotDotToken ? call.arguments.length : index + 1;
      for (let at = index; at < last; at += 1) chosen.add(at);
    });
    if (spreadAt !== -1 && [...chosen].some(at => at >= spreadAt)) return all;
    return call.arguments.filter((_, index) => chosen.has(index));
  }

  // Callers of sinks: a changed caller may not hand a tenant to an unchanged legacy function; an
  // unchanged caller that forwards its own parameters becomes a sink itself. Tenant state and its
  // writers (A5-r2) can add sinks, so the two analyses run to a common fixpoint.
  const reportedEdges = new Set();
  const reportedState = new Set();
  const analysisSize = () =>
    tenantState.size +
    [...legacySinks.values()].reduce((total, sink) => total + 1 + sink.params.size, 0);
  for (let round = 0; ; round += 1) {
    let grew = true;
    while (grew) {
      grew = false;
      for (const file of [...sources.keys()].sort()) {
        if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
        const fact = factsOf(file);
        if (!fact) continue;
        for (const reference of fact.references) {
          if (!reference.binding) continue;
          const { origins, form } = originsOf(fact, reference);
          for (const origin of origins) {
            const key = originKey(origin);
            const sink = key && legacySinks.get(key);
            if (!sink) continue;
            const caller = unitOf(reference.node);
            if (sink.file === file && caller === sink.unit) continue;
            const edge = `${file}:${reference.node.pos}->${key}`;
            if (form === 'export') continue;
            if (form !== 'call' && form !== 'jsx') {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `legacy tenant sink ${key} used as ${form}`
                );
              }
              continue;
            }
            // A state writer (A5-r2) admits a changed caller whose arguments are fixed: built
            // without the caller's parameters and from unchanged code only.
            if (!fact.unchanged(caller) && sink.writer) {
              const fixed = expressionDependencies(
                fact,
                caller,
                sinkArguments(sink, reference.node)
              );
              const dependencies = dependenciesUnchanged(fact, fixed.external);
              if ((fixed.params.size > 0 || !dependencies.ok) && !reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `changed caller hands an input to the tenant-state writer ${key}`
                );
              }
              continue;
            }
            if (!fact.unchanged(caller)) {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `changed caller hands a tenant to unchanged legacy ${key}`
                );
              }
              continue;
            }
            const { params, external } = expressionDependencies(
              fact,
              caller,
              sinkArguments(sink, reference.node)
            );
            const dependencies = dependenciesUnchanged(fact, external);
            if (!dependencies.ok) {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `call into legacy ${key} depends on changed code (${dependencies.witness})`
                );
              }
              continue;
            }
            collectTenantState(fact, external);
            if (params.size > 0 && markSink(fact, caller, params)) grew = true;
          }
        }
      }
    }

    // Every workspace reference to tenant state must be an accepted form. The text of a pinned
    // kernel module is bound by its pin and is not re-judged here.
    const before = analysisSize();
    const note = {
      writer(fact, unit, target) {
        const { params } = expressionDependencies(fact, unit, [target]);
        if (params.size > 0) markSink(fact, unit, params, true);
      },
      alias(origin, entry) {
        const key = originKey(origin);
        if (key && !tenantState.has(key)) {
          tenantState.set(key, {
            origin,
            kind: entry.kind,
            root: entry.root ?? originKey(entry.origin),
            alias: entry,
          });
        }
      },
    };
    for (const file of [...sources.keys()].sort()) {
      if (isTest(file) || /\.d\.[cm]?ts$/u.test(file) || pinnedModules.has(file)) continue;
      const fact = factsOf(file);
      if (!fact) continue;
      for (const reference of fact.references) {
        if (!reference.binding) continue;
        const { origins, form } = originsOf(fact, reference);
        for (const origin of origins) {
          const key = originKey(origin);
          if (!key || !tenantState.has(key) || form === 'export') continue;
          const entry = tenantState.get(key);
          // An alias is judged as its root: schema rules follow the declaring schema file.
          const judged = entry.alias
            ? { ...entry, origin: entry.alias.origin, root: entry.root }
            : entry;
          const problem = stateUseProblem(
            fact,
            reference.node,
            { ...judged, origin: entry.alias ? judged.origin : origin },
            note
          );
          const at = `${file}:${reference.node.pos}`;
          if (problem && !reportedState.has(at)) {
            reportedState.add(at);
            violate(
              file,
              reference.node,
              fact.sourceFile,
              'C1',
              `module state ${key} read by a retained legacy tenant ${problem}; migrate that read to withTenantAuthority`
            );
          }
        }
      }
    }
    if (analysisSize() === before) break;
  }

  // Receiver sinks found by the schema uses above, and those their callers in turn reach.
  const reportedReceivers = new Set();
  while (receiverQueue.length > 0) {
    for (const { fact, node, detail } of receiverSinkProblems(receiverQueue.shift())) {
      const at = `${fact.file}:${node.pos}:${detail}`;
      if (reportedReceivers.has(at)) continue;
      reportedReceivers.add(at);
      violate(fact.file, node, fact.sourceFile, 'C1', `query receiver: ${detail}`);
    }
  }
  telemetry.receiverSinks = receiverSinks.size;
  for (const sink of legacySinks.values()) {
    if (!sink.topLevel) {
      const { line } = sink.unit
        .getSourceFile()
        .getLineAndCharacterOfPosition(sink.unit.getStart());
      violations.push({
        rule: 'C1',
        file: sink.file,
        line: line + 1,
        unit: sink.name,
        detail: 'legacy tenant sink whose callers cannot be resolved (not a top-level declaration)',
      });
    }
  }
  telemetry.legacySinks = legacySinks.size;
  telemetry.tenantState = tenantState.size;

  if (legacyPins !== null) {
    for (const key of LEGACY.keys()) {
      const file = key.slice(0, key.lastIndexOf('#'));
      if (!sources.has(file) || legacyPinned(key)) continue;
      const problems = legacyClosureProblems.get(key);
      violations.push({
        rule: 'pin',
        file,
        line: 0,
        unit: key.slice(key.lastIndexOf('#') + 1),
        detail:
          problems.length > 0
            ? `legacy kernel closure cannot be bound: ${problems.join('; ')}`
            : `legacy kernel entry differs from its reviewed contract (digest ${legacyDigest(key)}, pinned ${legacyPins.get(key) ?? 'none'})`,
      });
    }
  }

  // Unused or over-broad contracts are reported so the manifest cannot silently widen.
  for (const contract of contracts) {
    for (const [kind, count] of Object.entries(contract.kinds)) {
      const used = contractUse.get(`${contract.file}#${contract.unit}#${kind}`) ?? 0;
      if (used !== count) {
        violations.push({
          rule: 'contract',
          file: contract.file,
          line: 0,
          unit: contract.unit,
          detail: `${kind}: contract admits ${count}, source has ${used}`,
        });
      }
    }
  }
  telemetry.contractsUsed = contractUse.size;
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  return {
    violations,
    accepted,
    telemetry,
    sinks: [...legacySinks.keys()],
    tenantState: [...tenantState.keys()].sort(),
    legacyDigests: Object.fromEntries(legacyDigests),
  };
}
