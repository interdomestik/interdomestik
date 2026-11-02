// Tenant guard stage: receiver sinks, contract coverage and legacy tenant sinks.

import ts from 'typescript';
import { sha256 } from './rules-digest.mjs';
import { callArguments, fingerprint, isFunctionLike, unitName, unitOf } from './syntax.mjs';

/** Installs receiver-sink, contract-coverage and legacy-sink bookkeeping on `ctx`. */
export function installSinks(ctx) {
  const {
    BUILDER_METHODS,
    UNKNOWN_KEY,
    callersOf,
    contracts,
    elementKey,
    functionTargets,
    handOffProblem,
    outermost,
    receiverProblem,
    receiverSink,
    restCarries,
    unwrap,
    usesOf,
  } = ctx;

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
  Object.assign(ctx, {
    builderProjection,
    connectionControlUnits,
    contractUse,
    covered,
    legacyOps,
    legacySinks,
    markSink,
    receiverSinkProblems,
    sinkArguments,
    tenantExpressionOf,
  });
}
