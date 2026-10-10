import ts from 'typescript';
import { handleArguments, inspectCallChannels, inspectTagChannels } from './db-access-channels.mjs';
import { externalValue } from './db-access-external.mjs';
import {
  BUILTIN_CALLS,
  BUILTIN_CONSTRUCTORS,
  createReferences,
  frameworkEntry,
} from './db-access-references.mjs';
import { isFunction, unwrap } from './db-access-source.mjs';
import { isUnsafe } from './db-access-inventory.mjs';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

export function inspectChangedEdges(model, provenance, inventory, frozenBootstrap = []) {
  const failures = [];
  const incomplete = [...provenance.environmentChanges].map(file => ({
    file,
    reason: 'unsupported mutable global environment root',
  }));
  const byOwner = new Map();
  for (const entry of inventory.entries) {
    const list = byOwner.get(entry._owner) ?? [];
    list.push(entry);
    byOwner.set(entry._owner, list);
  }
  const references = createReferences(model, provenance);
  const target = expression => references.resolve(expression).functions[0];
  const externalImport = expression => model.externalBinding(expression);
  const localImport = references.localImport;
  const steps = new Map();
  const initialized = new Map();
  function inspect(owner, origin, stack = new Set(), depth = 0, invocation) {
    if (stack.has(owner)) {
      incomplete.push({ file: origin, reason: 'recursive executable edge' });
      return;
    }
    const count = (steps.get(origin) ?? 0) + 1;
    steps.set(origin, count);
    if (depth > 48 || count > 20000) {
      incomplete.push({ file: origin, reason: 'graph bound exceeded' });
      return;
    }
    stack = new Set(stack).add(owner);
    for (const entry of byOwner.get(owner) ?? []) {
      if (entry._incomplete) incomplete.push({ file: origin, reason: entry.reason });
      else if (isUnsafe(entry))
        failures.push({
          ...entry,
          mountedFrom: origin,
          reason: entry.reason ?? 'changed executable edge reaches ambient operation',
        });
    }
    function moduleEffect(specifier) {
      const name = specifier.text;
      const file = model.moduleFile(name, model.fileOf(specifier));
      if (!file && model.externalModule(name, model.fileOf(specifier))) return;
      // Only these authenticated, byte-frozen bootstrap bodies are a trusted boundary.
      // A candidate edit to any body is rejected before this graph is constructed.
      const target = file && model.parsed.get(file);
      if (!target || target.parseDiagnostics.length) {
        incomplete.push({ file: origin, reason: `unresolved module initialization ${name}` });
      } else {
        const visited = initialized.get(origin) ?? new Set();
        if (visited.has(file)) return; // ES module cycles initialize each module once.
        visited.add(file);
        initialized.set(origin, visited);
        if (frozenBootstrap.includes(file)) {
          for (const statement of target.statements)
            if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
              visit(statement);
          return;
        }
        inspect(
          target,
          origin,
          new Set([...stack].filter(item => !ts.isSourceFile(item))),
          depth + 1
        );
      }
    }
    function visit(node) {
      if (node !== owner && isFunction(node)) return; // Traverse only the symbol actually invoked.
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        if (!isErasedTypeEdge(node)) moduleEffect(node.moduleSpecifier);
        return;
      }
      if (
        (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) &&
        references.valuePosition(node) &&
        !provenance.canonical(node) &&
        (isFunction(owner) || inventory.changed.has(model.fileOf(owner)))
      ) {
        const referenced = references.resolve(node);
        if (referenced.unknown)
          incomplete.push({ file: origin, reason: 'mutated or unsupported executable reference' });
        for (const fn of referenced.functions) inspect(fn, origin, stack, depth + 1);
      }
      if (ts.isNewExpression(node)) {
        if (
          !ts.isIdentifier(node.expression) ||
          model.declaration(node.expression) ||
          !BUILTIN_CONSTRUCTORS.has(node.expression.text)
        )
          incomplete.push({ file: origin, reason: 'unsupported constructor executable edge' });
        for (const arg of node.arguments ?? []) {
          const referenced = references.resolve(arg);
          if (referenced.unknown)
            incomplete.push({ file: origin, reason: 'unsupported constructor callback' });
          for (const fn of referenced.functions) inspect(fn, origin, stack, depth + 1);
        }
        handleArguments(provenance, node.arguments ?? [], true, origin, incomplete);
      }
      if (ts.isTaggedTemplateExpression(node)) {
        const tagged = references.resolve(node.tag);
        if (
          tagged.unknown ||
          (!tagged.functions.length &&
            !externalImport(node.tag) &&
            !model.externalBinding(node.tag))
        )
          incomplete.push({ file: origin, reason: 'unsupported tagged executable edge' });
        for (const fn of tagged.functions) inspect(fn, origin, stack, depth + 1);
        if (ts.isTemplateExpression(node.template))
          for (const span of node.template.templateSpans) {
            const callback = references.resolve(span.expression);
            if (callback.unknown)
              incomplete.push({ file: origin, reason: 'unsupported tagged callback container' });
            for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
          }
        inspectTagChannels(model, provenance, node, origin, incomplete);
      }
      if (ts.isCallExpression(node)) {
        const resolved = references.resolve(node.expression);
        if (resolved.unknown || provenance.isMutated(node.expression))
          incomplete.push({ file: origin, reason: 'mutated executable callee' });
        for (const fn of resolved.functions.slice(1)) inspect(fn, origin, stack, depth + 1, node);
        const callee = unwrap(node.expression);
        if (
          !ts.isIdentifier(callee) &&
          !ts.isPropertyAccessExpression(callee) &&
          callee.kind !== ts.SyntaxKind.ImportKeyword &&
          !resolved.functions.length
        )
          incomplete.push({ file: origin, reason: 'unsupported callee form' });
        if (
          ['eval', 'Function', 'require', 'createRequire'].includes(
            callee.getText().split('.').at(-1)
          )
        )
          incomplete.push({ file: origin, reason: 'unsupported dynamic code/module loader' });
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          ts.isStringLiteral(node.arguments[0])
        )
          moduleEffect(node.arguments[0]);
        if (provenance.canonical(node.expression)) {
          const callback = node.arguments[1];
          if (!callback || !isFunction(callback) || callback.asteriskToken)
            incomplete.push({ file: origin, reason: 'unsupported tenant callback' });
          else inspect(callback, origin, stack, depth + 1);
          // Context object is executable, too.
          if (node.arguments[0]) visit(node.arguments[0]);
          return;
        }
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          !ts.isStringLiteral(node.arguments[0])
        ) {
          incomplete.push({ file: origin, reason: 'nonliteral dynamic import' });
          return;
        }
        const called = target(node.expression);
        if (called && isFunction(called)) inspect(called, origin, stack, depth + 1, node);
        else if (
          model.declaration(node.expression) &&
          ts.isParameter(model.declaration(node.expression)) &&
          !externalValue(model, node.expression, provenance)
        ) {
          incomplete.push({ file: origin, reason: 'unsupported received executable callback' });
        } else if (
          localImport(node.expression) &&
          !model.externalBinding(node.expression) &&
          !externalValue(model, node.expression, provenance)
        )
          incomplete.push({
            file: origin,
            reason: `unresolved local edge ${node.expression.getText()}`,
          });
        else if (
          ts.isIdentifier(node.expression) &&
          !externalImport(node.expression) &&
          !model.externalBinding(node.expression) &&
          !externalValue(model, node.expression, provenance) &&
          !BUILTIN_CALLS.has(node.expression.text)
        ) {
          incomplete.push({
            file: origin,
            reason: `unknown executable edge ${node.expression.getText()}`,
          });
        }
        // Named/forwarded callbacks are executable edges too, not merely inline arrows.
        for (const arg of node.arguments) {
          const callback = references.resolve(arg);
          if (callback.unknown)
            incomplete.push({ file: origin, reason: 'unsupported callback container' });
          for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
          if (
            ts.isIdentifier(arg) &&
            model.declaration(arg) &&
            ts.isParameter(model.declaration(arg)) &&
            !called &&
            !model.isQueryOperator(node.expression) &&
            provenance.provenance(arg) !== 'tenant-context'
          )
            incomplete.push({ file: origin, reason: 'unsupported forwarded callback/value' });
        }
        if (!called)
          inspectCallChannels(
            model,
            provenance,
            callee,
            node.arguments,
            invocation,
            origin,
            incomplete
          );
      }
      if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
        const callback = references.resolve(node.initializer.expression);
        if (callback.unknown) incomplete.push({ file: origin, reason: 'unsupported JSX callback' });
        for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (ts.isPropertyAccessExpression(node.tagName) || /^[A-Z]/u.test(node.tagName.getText())) {
          const called = target(node.tagName);
          if (called && isFunction(called)) inspect(called, origin, stack, depth + 1);
          else if (localImport(node.tagName))
            incomplete.push({
              file: origin,
              reason: `unresolved JSX edge ${node.tagName.getText()}`,
            });
        }
      }
      if (
        ts.isElementAccessExpression(node) &&
        (ts.isCallExpression(node.parent) || ts.isJsxOpeningElement(node.parent))
      ) {
        incomplete.push({ file: origin, reason: 'unsupported computed executable edge' });
      }
      ts.forEachChild(node, visit);
    }
    if (isFunction(owner)) for (const parameter of owner.parameters) visit(parameter);
    visit(isFunction(owner) ? owner.body : owner);
  }
  for (const file of inventory.changed) {
    const sf = model.parsed.get(file);
    if (sf.parseDiagnostics.length) {
      incomplete.push({ file, reason: 'parse diagnostics in changed source' });
      continue;
    }
    inspect(sf, file);
    if (
      frameworkEntry(file) ||
      sf.statements.some(
        item =>
          ts.isExpressionStatement(item) &&
          ts.isStringLiteral(item.expression) &&
          item.expression.text === 'use server'
      )
    ) {
      for (const exported of model.exportedDeclarations(file)) {
        const resolved = references.resolve(exported);
        if (resolved.unknown) incomplete.push({ file, reason: 'unsupported framework export' });
        for (const fn of resolved.functions) inspect(fn, file);
      }
    }
    model.walk(sf, node => {
      if (isFunction(node)) inspect(node, file);
    });
  }
  return { failures, incomplete };
}
