import ts from 'typescript';
import { LIFETIME_REFLECT_ADMISSIONS } from './lifetime-reflect-admissions.mjs';
import { sha256, within } from './rules-digest.mjs';
import { writes } from './rules-lifetime-forms.mjs';
import { fingerprint, unitName, unitOf } from './syntax.mjs';

/** The L1 exception covers direct calls of Reflect.apply on reviewed intrinsic captures. */
export function createReflectAdmission(ctx) {
  const { outermost, referenceAt } = ctx;
  const files = new Set(LIFETIME_REFLECT_ADMISSIONS.map(entry => entry.file));
  const digest = (fact, unit) => sha256(fingerprint(unit, fact.sourceFile));

  return function admittedReflectApply(fact, node) {
    if (!files.has(fact.file)) return false;
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.expression !== node) return false;
    if (access.questionDotToken || access.name.text !== 'apply') return false;
    const call = access.parent;
    if (!ts.isCallExpression(call) || call.expression !== access || call.questionDotToken)
      return false;
    if (call.arguments.length !== 3 || call.arguments.some(ts.isSpreadElement)) return false;
    const [target] = call.arguments;
    if (!ts.isIdentifier(target)) return false;

    const unit = unitOf(node);
    const name = unitName(unit, fact.sourceFile);
    if (fact.statements.get(name) !== unit) return false;
    const entry = LIFETIME_REFLECT_ADMISSIONS.find(
      entry =>
        entry.file === fact.file && entry.unit === name && entry.operation === access.name.text
    );
    const capture = entry?.targets.find(targetEntry => targetEntry.binding === target.text);
    return Boolean(
      capture &&
      digest(fact, unit) === entry.sha256 &&
      matchesCapture(fact, referenceAt(fact, target), capture)
    );
  };

  /** The lexical binding must name the pinned local const, with authentic initializer inputs. */
  function matchesCapture(fact, reference, capture) {
    const binding = reference?.binding;
    if (binding?.scope !== fact.sourceFile || !ts.isVariableDeclaration(binding.decl)) return false;
    const statement = fact.statements.get(capture.binding);
    const { decl } = binding;
    if (decl.parent.parent !== statement || !decl.initializer) return false;
    if (digest(fact, statement) !== capture.sha256) return false;

    const reads = fact.references.filter(ref => within(ref.node, decl.initializer));
    return reads.every(ref => {
      const name = ref.node.text;
      if (name === capture.input?.binding) return matchesCapture(fact, ref, capture.input);
      return !ref.binding && capture.globals.includes(name) && !hasGlobalWrite(fact, name);
    });
  }

  /** A direct write in the module can replace a global or one of its intrinsic members. */
  function hasGlobalWrite(fact, name) {
    return fact.references.some(ref => {
      if (ref.binding || ref.node.text !== name) return false;
      let value = outermost(ref.node);
      while (ts.isAccessExpression(value.parent) && value.parent.expression === value)
        value = outermost(value.parent);
      return writes(value, ctx);
    });
  }
}
