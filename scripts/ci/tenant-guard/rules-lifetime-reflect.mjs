import ts from 'typescript';
import {
  LIFETIME_REFLECT_ADMISSIONS,
  LIFETIME_REFLECT_FILE_LAYOUT,
  LIFETIME_REFLECT_WRITERS,
} from './lifetime-reflect-admissions.mjs';
import { sha256, within } from './rules-digest.mjs';
import {
  ARGUMENT_MUTATORS,
  BUFFER_MODULES,
  GLOBAL_OBJECTS,
  LAYOUT_IMPORTS,
  RECEIVER_MUTATORS,
  STATIC_METHODS,
  WRITER_GLOBALS,
  layoutComparison,
  memberAccess,
  memberName,
} from './rules-lifetime-reflect-forms.mjs';
import { constInitializer, tested, writes } from './rules-lifetime-forms.mjs';
import { fingerprint, unitName, unitOf } from './syntax.mjs';

function verifyLayoutReferencesAndPinSupport(fact, layout, pinned) {
  const support = new Set(layout.values());
  for (const { node, binding } of fact.references) {
    const unit = unitOf(node);
    const declaration = layout.get(node.text);
    if (
      declaration &&
      (binding?.scope !== fact.sourceFile ||
        !within(binding.decl, declaration) ||
        !(support.has(unit) || pinned.has(unit) || layoutComparison(node)))
    )
      return false;
    if (!support.has(unit)) continue;
    if (node.text === 'File' || node.text === 'Object') {
      if (binding) return false;
    } else if (
      LAYOUT_IMPORTS.has(node.text) &&
      (binding?.kind !== 'import' ||
        binding.specifier !== './safe-action.check-def' ||
        binding.imported !== node.text)
    )
      return false;
  }
  for (const statement of support) pinned.add(statement);
  return true;
}

/** L1 admits direct Reflect.apply calls on pinned intrinsic captures. Native globals and
 * Reflect.apply are assumed intact from module initialization through each admitted call.
 * Mutation by earlier or other modules is outside this check. */
export function createReflectCheck(ctx) {
  const { outermost, referenceAt, unwrap } = ctx;
  const files = new Map();
  for (const entry of LIFETIME_REFLECT_ADMISSIONS) {
    if (!files.has(entry.file)) files.set(entry.file, []);
    files.get(entry.file).push(entry);
  }
  const moduleChecks = new WeakMap();
  const digest = (fact, unit) => sha256(fingerprint(unit, fact.sourceFile));

  return function refusedReflect(fact, node) {
    const reference = referenceAt(fact, node);
    if (!reference) return false;
    const entries = files.get(fact.file);
    if (!entries) return !reference.binding;
    const unit = unitOf(node);
    const name = unitName(unit, fact.sourceFile);
    const entry = entries.find(entry => entry.unit === name);
    if (!entry) return !reference.binding;
    const checks = checksFor(fact, entries);
    if (reference.binding || checks.shadowedReflect) return true;
    return !admittedReflectApply(fact, node, unit, entry, checks);
  };

  function admittedReflectApply(fact, node, unit, entry, checks) {
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.expression !== node) return false;
    if (access.questionDotToken || access.name.text !== entry.operation) return false;
    const call = access.parent;
    if (!ts.isCallExpression(call) || call.expression !== access || call.questionDotToken)
      return false;
    if (call.arguments.length !== 3 || call.arguments.some(ts.isSpreadElement)) return false;
    const [target] = call.arguments;
    if (!ts.isIdentifier(target)) return false;

    if (fact.statements.get(entry.unit) !== unit) return false;
    const capture = entry.targets.find(targetEntry => targetEntry.binding === target.text);
    return Boolean(
      capture &&
      digest(fact, unit) === entry.sha256 &&
      checks.layoutIntact &&
      checks.mutationsSafe &&
      checks.intact('Object') &&
      checks.intact('Reflect') &&
      (fact.file !== LIFETIME_REFLECT_FILE_LAYOUT.file || checks.intact('File')) &&
      matchesCapture(fact, referenceAt(fact, target), capture, checks)
    );
  }

  /** The lexical binding must name the pinned local const, with authentic initializer inputs. */
  function matchesCapture(fact, reference, capture, checks) {
    const binding = reference?.binding;
    if (binding?.scope !== fact.sourceFile || !ts.isVariableDeclaration(binding.decl)) return false;
    const statement = fact.statements.get(capture.binding);
    const { decl } = binding;
    if (decl.parent.parent !== statement || !decl.initializer) return false;
    if (digest(fact, statement) !== capture.sha256) return false;

    const reads = fact.references.filter(ref => within(ref.node, decl.initializer));
    return reads.every(ref => {
      const name = ref.node.text;
      if (name === capture.input?.binding) return matchesCapture(fact, ref, capture.input, checks);
      return !ref.binding && capture.globals.includes(name) && checks.intact(name);
    });
  }

  function checksFor(fact, entries) {
    let checks = moduleChecks.get(fact);
    if (checks) return checks;
    const pinned = new Set();
    function pin(unit, sha256) {
      const statement = fact.statements.get(unit);
      if (statement && digest(fact, statement) === sha256) pinned.add(statement);
    }
    for (const entry of entries) {
      pin(entry.unit, entry.sha256);
      for (let capture of entry.targets) {
        for (; capture; capture = capture.input) pin(capture.binding, capture.sha256);
      }
    }
    const layoutIntact = verifyFileLayout(fact, pinned);
    const writers = verifiedWriters(fact);
    const mutationsSafe = Boolean(writers && safeModuleMutations(fact, pinned, writers));
    // Runtime TypeScript namespaces also declare values in the emitted module.
    const namespaces = new Set(
      fact.sourceFile.statements
        .filter(ts.isModuleDeclaration)
        .map(statement => statement.name.text)
    );
    const globals = new Map();
    const intact = name => {
      if (!globals.has(name)) {
        globals.set(
          name,
          !namespaces.has(name) &&
            fact.references.every(ref => ref.binding || safeGlobalUse(ref.node, name, pinned))
        );
      }
      return globals.get(name);
    };
    checks = { shadowedReflect: fact.hasBinding('Reflect'), layoutIntact, mutationsSafe, intact };
    moduleChecks.set(fact, checks);
    return checks;
  }

  function verifyFileLayout(fact, pinned) {
    const { file, digests } = LIFETIME_REFLECT_FILE_LAYOUT;
    if (fact.file !== file) return true;
    const layout = new Map();
    for (const [name, sha256] of Object.entries(digests)) {
      const statement = fact.statements.get(name);
      if (!statement || digest(fact, statement) !== sha256) return false;
      layout.set(name, statement);
    }
    return verifyLayoutReferencesAndPinSupport(fact, layout, pinned);
  }

  function verifiedWriters(fact) {
    const reviewed = LIFETIME_REFLECT_WRITERS[fact.file];
    const pinned = new Set();
    if (!reviewed) return pinned;
    for (const [name, sha256] of Object.entries(reviewed.digests)) {
      const statement = fact.statements.get(name);
      if (statement && digest(fact, statement) === sha256) pinned.add(statement);
    }
    for (const { node, binding } of fact.references) {
      const unit = unitOf(node);
      if (binding && pinned.has(unit) && WRITER_GLOBALS.has(node.text)) return null;
      if (!reviewed.privateHelpers.includes(node.text)) continue;
      const callee = outermost(node);
      if (
        !pinned.has(binding?.decl) ||
        !pinned.has(unit) ||
        !ts.isCallExpression(callee.parent) ||
        callee.parent.expression !== callee
      )
        return null;
    }
    return pinned;
  }

  function safeModuleMutations(fact, pinned, writers) {
    function unsafe(node) {
      if (pinned.has(node) || writers.has(node)) return false;
      if (ts.isImportDeclaration(node) && BUFFER_MODULES.has(node.moduleSpecifier.text))
        return true;
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        BUFFER_MODULES.has(node.moduleReference.expression?.text)
      )
        return true;
      if (ts.isAccessExpression(node) && unsafeAccess(node)) return true;
      return ts.forEachChild(node, unsafe);
    }

    function unsafeAccess(access) {
      const receiver = access.expression;
      if (writes(access, ctx) && !freshReceiver(receiver)) return true;
      const name = memberName(access);
      const value = outermost(access);
      const call = value.parent;
      const called = ts.isCallExpression(call) && call.expression === value;
      const argumentMutator = ARGUMENT_MUTATORS.has(name);
      if (!argumentMutator && !RECEIVER_MUTATORS.has(name))
        return name === null && called && !freshReceiver(receiver);
      if (!called) return true;
      const owner = unwrap(receiver);
      const reflectSet = name === 'set' && owner.text === 'Reflect';
      if (!argumentMutator && !reflectSet) return !freshReceiver(receiver);
      return unsafeArgumentMutation(call, owner, reflectSet);
    }

    function unsafeArgumentMutation(call, owner, reflectSet) {
      if (owner.text !== 'Object' && owner.text !== 'Reflect') return true;
      if (referenceAt(fact, owner)?.binding) return true;
      if (call.arguments.some(ts.isSpreadElement)) return true;
      const [target, , , explicitReceiver] = call.arguments;
      return Boolean(
        (target && !freshReceiver(target)) ||
        (reflectSet && explicitReceiver && !freshReceiver(explicitReceiver))
      );
    }

    // Mutating a fresh object itself is safe. An object read through one of its members can alias
    // an intrinsic, so member expressions never qualify.
    function freshReceiver(expression) {
      let value = unwrap(expression);
      if (ts.isIdentifier(value)) {
        const declaration = referenceAt(fact, value)?.binding?.decl;
        if (
          !declaration ||
          !ts.isVariableDeclaration(declaration) ||
          !ts.isIdentifier(declaration.name) ||
          !declaration.initializer ||
          !constInitializer(declaration, declaration.initializer)
        )
          return false;
        value = unwrap(declaration.initializer);
      }
      if (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value)) return true;
      if (!ts.isCallExpression(value) || value.arguments.length !== 1) return false;
      const callee = unwrap(value.expression);
      return (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'create' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Object' &&
        !referenceAt(fact, callee.expression)?.binding &&
        value.arguments[0].kind === ts.SyntaxKind.NullKeyword
      );
    }

    return !unsafe(fact.sourceFile);
  }

  /** Allow pinned uses and reads that do not expose the global to mutation. A global handed to
   * a mutator or held in an alias can change anywhere in the module. */
  function safeGlobalUse(node, name, pinned) {
    let root = outermost(node);
    let property = node.text;
    while (GLOBAL_OBJECTS.has(property)) {
      const access = memberAccess(root);
      property = access && memberName(access);
      if (!property) return false; // the global object itself or a computed global name
      root = outermost(access);
    }
    if (property !== name || pinned.has(unitOf(node))) return true;

    let value = root;
    for (let access = memberAccess(value); access; access = memberAccess(value))
      value = outermost(access);
    if (writes(value, ctx)) return false;
    if (tested(value, value.parent)) return true;
    const member = memberAccess(root);
    return Boolean(
      member &&
      unwrap(value) === member &&
      STATIC_METHODS.get(name)?.has(memberName(member)) &&
      ts.isCallExpression(value.parent) &&
      value.parent.expression === value
    );
  }
}
