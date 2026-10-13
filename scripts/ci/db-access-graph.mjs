import ts from 'typescript';
import { inspectGraphCall } from './db-access-graph-calls.mjs';
import { handleArguments, inspectTagChannels } from './db-access-channels.mjs';
import { BUILTIN_CONSTRUCTORS, createReferences, frameworkEntry } from './db-access-references.mjs';
import { isFunction } from './db-access-source.mjs';
import { isUnsafe } from './db-access-inventory.mjs';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';

// Test-named modules are ordinary graph roots when changed and are traversed when production
// imports them. The recognizer only labels production-to-test witnesses; it grants no exemption.
// The three recognizers are kept as separate simple checks; together they match exactly the
// original single alternation. The support suffix is tested on the final path segment's stem.
const TEST_DIRECTORY = /(?:^|\/)__tests__\//u;
const TEST_SUFFIX = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const SUPPORT_STEM = /[.-](?:fixture|test-support|test-helpers)$/u;

function testSupportSource(file) {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const extension = SOURCE_EXTENSION.exec(base);
  if (!extension) return false;
  return SUPPORT_STEM.test(base.slice(0, extension.index));
}

export const testOnlySource = file =>
  TEST_DIRECTORY.test(file) || TEST_SUFFIX.test(file) || testSupportSource(file);

export function inspectChangedEdges(model, provenance, inventory, frozenBootstrap = []) {
  const failures = [];
  const reachedTestSources = new Set();
  const incomplete = createIncompleteCollector();
  for (const file of provenance.environmentChanges)
    incomplete.push({ file, reason: 'unsupported mutable global environment root' });
  const initialUnknown = new Set(provenance.analysisUnknown);
  for (const reason of initialUnknown) incomplete.push({ file: '<analysis>', reason });
  const byOwner = new Map();
  for (const entry of inventory.entries) {
    const list = byOwner.get(entry._owner) ?? [];
    list.push(entry);
    byOwner.set(entry._owner, list);
  }
  const references = createReferences(model, provenance);
  const targets = expression => references.resolve(expression).functions;
  const externalImport = expression => model.externalBinding(expression);
  const localImport = references.localImport;
  const steps = new Map();
  const initialized = new Map();
  // An unframed function with actual dispatch callers is inspected once per caller frame unless
  // it escaped or is also opened directly. Returns true when it fanned out.
  function inspectDispatchContexts(owner, origin, stack, depth, context) {
    if (!isFunction(owner) || context || !provenance.dispatch) return false;
    const state = provenance.dispatch.state();
    const callers = provenance.dispatch.contextsFor(owner);
    if (!callers.length || state.escaped.has(owner) || state.openFns.has(owner)) return false;
    for (const caller of callers)
      inspect(owner, origin, stack, depth, caller.callNode, caller.context, caller.definingContext);
    return true;
  }
  // Every caller passes stack and depth; each outer root starts with a fresh Map and depth 0.
  function inspect(owner, origin, stack, depth, invocation, context, definingContext) {
    if (inspectDispatchContexts(owner, origin, stack, depth, context)) return;
    const ownerFile = model.fileOf(owner);
    if (testOnlySource(ownerFile) && !testOnlySource(origin)) reachedTestSources.add(ownerFile);
    const frame = definingContext ?? context;
    if (stack.get(owner)?.has(frame)) {
      incomplete.push({ file: origin, reason: 'recursive executable edge' });
      return;
    }
    const count = (steps.get(origin) ?? 0) + 1;
    steps.set(origin, count);
    if (depth > 48 || count > 20000) {
      incomplete.push({ file: origin, reason: 'graph bound exceeded' });
      return;
    }
    stack = new Map(stack).set(owner, new Set(stack.get(owner) ?? []).add(frame));
    const scoped = provenance.forContext?.(context) ?? provenance;
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
        if (testOnlySource(file) && provenance.environmentChanges.has(file))
          incomplete.push({ file: origin, reason: 'unsupported mutable global environment root' });
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
          new Map([...stack].filter(([item]) => !ts.isSourceFile(item))),
          depth + 1
        );
      }
    }
    // A component tag is one executable edge, resolved and inspected exactly once here. The
    // generic value visit of the same tag identity would inspect it again, so this handler also
    // keeps that visit's unknown-reference diagnostic before skipping only the tag identity.
    // Props, spreads, children and expressions are still visited with the current context.
    // A found function never cancels an unknown result. A closing tag invokes nothing.
    function visitJsx(node) {
      if (ts.isJsxClosingElement(node)) return true;
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
      const tag = node.tagName;
      if (!ts.isPropertyAccessExpression(tag) && !/^[A-Z]/u.test(tag.getText())) return false;
      const referenced = references.resolve(tag);
      if (referenced.functions.length)
        for (const fn of referenced.functions) inspect(fn, origin, stack, depth + 1);
      else if (localImport(tag))
        incomplete.push({ file: origin, reason: `unresolved JSX edge ${tag.getText()}` });
      if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return false;
      if (
        referenced.unknown &&
        references.valuePosition(tag) &&
        !scoped.canonical(tag) &&
        (isFunction(owner) || inventory.changed.has(model.fileOf(owner)))
      )
        incomplete.push({ file: origin, reason: 'mutated or unsupported executable reference' });
      ts.forEachChild(node, child => {
        if (child !== tag) visit(child);
      });
      return true;
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
        !scoped.canonical(node) &&
        (isFunction(owner) || inventory.changed.has(model.fileOf(owner)))
      ) {
        const referenced = references.resolve(node);
        if (referenced.unknown)
          incomplete.push({ file: origin, reason: 'mutated or unsupported executable reference' });
        // A value may contain its own methods. Merely retaining that identity does not
        // execute it recursively; actual call edges below still enforce the stack bound.
        for (const fn of referenced.functions)
          if (!stack.has(fn)) inspect(fn, origin, stack, depth + 1);
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
          // A value may contain its own methods. Merely retaining that identity does not
          // execute it recursively; actual call edges below still enforce the stack bound.
          for (const fn of referenced.functions)
            if (!stack.has(fn)) inspect(fn, origin, stack, depth + 1);
        }
        handleArguments(scoped, node.arguments ?? [], true, origin, incomplete);
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
        inspectTagChannels(model, scoped, node, origin, incomplete);
      }
      if (
        ts.isCallExpression(node) &&
        inspectGraphCall({
          model,
          scoped,
          references,
          context,
          node,
          origin,
          stack,
          depth,
          invocation,
          inspect,
          incomplete,
          visit,
          moduleEffect,
          targets,
          externalImport,
          localImport,
        })
      )
        return;
      if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
        const callback = references.resolve(node.initializer.expression);
        if (callback.unknown) incomplete.push({ file: origin, reason: 'unsupported JSX callback' });
        for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
      }
      if (visitJsx(node)) return;
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
  // Every changed source is a root, test-named or not: a filename never grants a verdict exemption.
  for (const file of inventory.changed) {
    const sf = model.parsed.get(file);
    if (sf.parseDiagnostics.length) {
      incomplete.push({ file, reason: 'parse diagnostics in changed source' });
      continue;
    }
    inspect(sf, file, new Map(), 0);
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
        for (const fn of resolved.functions) inspect(fn, file, new Map(), 0);
      }
    }
    model.walk(sf, node => {
      if (isFunction(node)) inspect(node, file, new Map(), 0);
    });
  }
  // A provenance query first made during traversal may exhaust after the initial snapshot.
  for (const reason of provenance.analysisUnknown ?? [])
    if (!initialUnknown.has(reason)) incomplete.push({ file: '<analysis>', reason });
  return {
    failures,
    incomplete: incomplete.entries,
    incompleteRawCount: incomplete.rawCount,
    reachedTestSources,
  };
}
