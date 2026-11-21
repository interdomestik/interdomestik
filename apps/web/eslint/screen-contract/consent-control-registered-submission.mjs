// The submissions a boundary invokes, for the consent-control-registered rule (CHK-22): a form's
// `action`, `onSubmit` and submit-capable `formAction`s, or a control's change handler.
import { originOf } from '../../../../scripts/ci/screen-contract/origins.mjs';
import { readInside } from '../../../../scripts/ci/screen-contract/paths.mjs';
import { directivesOfText, layerOf } from '../../../../scripts/ci/screen-contract/roles.mjs';
import { kindOfSpecifier } from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { resolverOf } from './common.mjs';
import {
  FUNCTIONS,
  SKIP,
  attributeOf,
  contains,
  expressionOf,
  isSubmitCapable,
  walk,
} from './consent-control-registered-jsx.mjs';
import {
  functionOf,
  identityArgument,
  importOf,
  isInvokedInPlace,
} from './consent-control-registered-scope.mjs';

// `target` identifies a named or default import from this tree, or a direct `ns.name`.
// `unknown` marks other references rooted in a tree import that cannot be followed (r3 F5).
// Locals, props and external imports have a null target and unknown set to false.
function treeImportOf(context, node) {
  let rootNode = node;
  while (rootNode.type === 'MemberExpression') rootNode = rootNode.object;
  const binding = rootNode.type === 'Identifier' ? importOf(context, rootNode) : null;
  if (!binding || kindOfSpecifier(binding.specifier) === 'external')
    return { unknown: false, target: null };
  if (node === rootNode) {
    const unknown = binding.imported === '*';
    return { unknown, target: unknown ? null : binding };
  }
  const direct =
    node.object === rootNode &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    binding.imported === '*';
  return {
    unknown: !direct,
    target: direct ? { specifier: binding.specifier, imported: node.property.name } : null,
  };
}

// A layer-2 module that does not declare itself client-only (r4 B3: `'use client'` under
// actions/ runs in the browser).
function isServerOrigin(root, origin) {
  const text = readInside(root, origin.file);
  if (text === null) return false;
  const directives = directivesOfText(origin.file, text);
  return !directives.includes('use client') && layerOf(origin.file, directives) === 2;
}

// What a reference is as a submission, always as `{ unknown, submission }` (one return type,
// S3800): `unknown` when it is bound to this tree but cannot be resolved; otherwise `submission`
// is `file#export` of a layer-2 export, or null when it is no submission (an external or client
// export, a local, a prop).
function submissionOf(context, root, rel, node) {
  const { unknown, target } = treeImportOf(context, node);
  if (target === null) return { unknown, submission: null };
  const origin = originOf(resolverOf(context), rel, target.specifier, target.imported);
  if (origin.external || origin.unresolved) return { unknown: true, submission: null };
  return {
    unknown: false,
    submission: isServerOrigin(root, origin) ? `${origin.file}#${origin.name}` : null,
  };
}

// Visits one node of a running function: a nested function counts only when it runs in place
// (an IIFE, `startTransition(async () => …)`; code-r2 B6); a call of a function declared inside
// the handler (`run()`) queues that function.
function visitInvoked(context, n, current, handler, calls, queue) {
  if (n !== current && FUNCTIONS.has(n.type)) {
    if (isInvokedInPlace(context, n)) queue.push(n);
    return SKIP;
  }
  if (n.type !== 'CallExpression') return undefined;
  calls.push(n);
  const local = n.callee.type === 'Identifier' ? functionOf(context, n.callee) : null;
  if (local && contains(handler, local)) queue.push(local);
  return undefined;
}

// The calls a handler makes when it runs, never those of a function it only defines (code-r1 B7).
function invokedCalls(context, keys, handler) {
  const calls = [];
  const queue = [handler];
  const done = new Set();
  while (queue.length) {
    const current = queue.pop();
    if (done.has(current)) continue;
    done.add(current);
    walk(current, n => visitInvoked(context, n, current, handler, calls, queue), keys);
  }
  return calls;
}

// The function a handler attribute runs: a named function of this file, an inline function, or
// the function an identity wrapper returns; any other call's result is not resolved.
function handlerRoot(context, expression) {
  if (expression?.type === 'Identifier') return functionOf(context, expression);
  if (FUNCTIONS.has(expression?.type)) return expression;
  return identityArgument(context, expression);
}

// Every distinct submission a handler calls (r3 F5: never reduced to one, so a second one is a
// submission-mismatch), or null when it calls none, or a call bound to this tree cannot be
// resolved (an unresolved-submission, as for any submission the lint cannot follow).
function submissionOfHandler(context, root, rel, keys, expression) {
  const handler = handlerRoot(context, expression);
  if (!handler) return null;
  const found = new Set();
  for (const call of invokedCalls(context, keys, handler)) {
    const { unknown, submission } = submissionOf(context, root, rel, call.callee);
    if (unknown) return null;
    if (submission) found.add(submission);
  }
  return found.size ? [...found] : null;
}

// The submission an `action` or `formAction` names, with the layer-2 check of a handler (r3 F5).
function actionSubmission(context, root, rel, expression) {
  const submission = expression ? submissionOf(context, root, rel, expression).submission : null;
  return typeof submission === 'string' ? submission : null;
}

// The submissions of every submit-capable `formAction` inside the form, or null when one cannot
// be resolved. A non-submit button's `formAction` never runs, so it is not a path (code-r1 B7).
function formActionSubmissions(context, root, rel, keys, boundary) {
  const out = [];
  walk(
    boundary,
    n => {
      if (n.type !== 'JSXOpeningElement' || !isSubmitCapable(n)) return;
      const formAction = attributeOf(n, 'formAction');
      if (formAction) out.push(actionSubmission(context, root, rel, expressionOf(formAction)));
    },
    keys
  );
  return out.includes(null) ? null : out;
}

// Every submit path of a form: its `action`, its `onSubmit` handler and each submit-capable
// `formAction` (code-r1 B7); null when there is none or one cannot be resolved.
function formSubmissions(context, root, rel, keys, boundary) {
  const opening = boundary.openingElement;
  const action = attributeOf(opening, 'action');
  const onSubmit = attributeOf(opening, 'onSubmit');
  if (!action && !onSubmit) return null;
  const out = [];
  if (action) out.push(actionSubmission(context, root, rel, expressionOf(action)));
  if (onSubmit)
    out.push(...(submissionOfHandler(context, root, rel, keys, expressionOf(onSubmit)) ?? [null]));
  const formActions = formActionSubmissions(context, root, rel, keys, boundary);
  return formActions && !out.includes(null) ? [...out, ...formActions] : null;
}

function handlerSubmissions(context, root, rel, keys, opening) {
  for (const name of ['onCheckedChange', 'onChange']) {
    const handler = expressionOf(attributeOf(opening, name));
    if (handler) return submissionOfHandler(context, root, rel, keys, handler);
  }
  return null;
}

// Every submission the boundary invokes, or null when one of them cannot be resolved.
const invokedSubmissions = (context, root, rel, keys, boundary, isForm) =>
  isForm
    ? formSubmissions(context, root, rel, keys, boundary)
    : handlerSubmissions(context, root, rel, keys, boundary.openingElement);

export { invokedSubmissions };
