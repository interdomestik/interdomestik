// CHK-22 (R-23e): a consent control is registered, each use of it sits in a marked submission
// boundary, and the boundary invokes the registered submission (WP-05 design §2.1; B3, B11, B16,
// B20, and the post-r5 formAction rule). Names are resolved lexically through ESLint's scope
// analysis, never by spelling across the file (code-r1 B7).
import { ScanError } from '../../../../scripts/ci/server-mutation/ast.mjs';
import { catalogueFor, messageText } from '../../../../scripts/ci/screen-contract/catalogue.mjs';
import { originIn, originOf } from '../../../../scripts/ci/screen-contract/origins.mjs';
import { readInside } from '../../../../scripts/ci/screen-contract/paths.mjs';
import { registryFor } from '../../../../scripts/ci/screen-contract/registry.mjs';
import { directivesOfText, layerOf } from '../../../../scripts/ci/screen-contract/roles.mjs';
import { kindOfSpecifier } from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { fileOf, report, resolverOf, rule, unitCounter } from './common.mjs';

const VOCABULARY_RE =
  /consent|terms|privacy|gdpr|agree|accept[\w.-]*(?:terms|polic)|marketing|newsletter|opt-?in/iu;
const CONTROL_COMPONENTS = new Set(['Checkbox', 'Switch', 'RadioGroupItem']);
const CHOICE_TYPES = new Set(['checkbox', 'radio']);
const STRING_ATTRIBUTES = ['id', 'name', 'value', 'aria-label', 'data-testid'];
const HANDLER_ATTRIBUTES = ['checked', 'onCheckedChange', 'onChange'];
const FORMS = new Set(['form', 'Form']);
const LABELS = new Set(['label', 'Label']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TRANSLATOR_FACTORIES = new Set(['useTranslations', 'getTranslations']);
// The native element a name renders (the UI map of the config; the shared `Input` forwards `type`):
// whose `formAction` submits the form, and the `type` values that submit (an absent type submits
// for a button only), and which `input`s are choice controls (r3 F6).
const SUBMIT_ELEMENTS = new Map([
  ['button', 'button'],
  ['Button', 'button'],
  ['input', 'input'],
  ['Input', 'input'],
]);
const SUBMIT_TYPES = { button: new Set(['submit']), input: new Set(['submit', 'image']) };
const SKIP = Symbol('skip');
// A call or reference bound to a module of this tree that cannot be followed to its export: it
// could be a submission, so the submission is unresolved (r3 F5).
const UNKNOWN = Symbol('unknown');
// The calls that run the function they receive first, now (code-r2 B6): React's `startTransition`
// (imported or as `React.startTransition`), the start function of `const [, start] =
// useTransition()`, and the global `queueMicrotask`. A function passed to any other call is only
// stored as far as the lint can tell, and its calls are not credited.
const INVOKING_WRAPPERS = Object.freeze({
  react: new Set(['startTransition']),
  transitionHook: 'useTransition',
  globals: new Set(['queueMicrotask']),
});
// The React hooks that return the function they receive (`useCallback`, `React.useCallback`): a
// handler declared through one is that function. No other factory's argument is the handler.
const IDENTITY_WRAPPERS = new Set(['useCallback']);
const NEXT_INTL_RE = /^next-intl(?:\/server)?$/u;

const elementName = opening => (opening?.name?.type === 'JSXIdentifier' ? opening.name.name : null);
const attributeOf = (opening, name) =>
  opening.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name) ?? null;
const contains = (outer, inner) =>
  outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];

function literalAttribute(opening, name) {
  const value = attributeOf(opening, name)?.value;
  if (value?.type === 'Literal' && typeof value.value === 'string') return value.value;
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return expression.value;
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return expression.quasis[0].value.cooked;
  return null;
}

// The dotted text of a JSX element name.
const jsxName = node =>
  node.type === 'JSXMemberExpression'
    ? [jsxName(node.object), node.property.name].join('.')
    : (node.name ?? '?');

const expressionOf = attribute =>
  attribute?.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : null;

// Visits `node` and its children; a visitor returning SKIP prunes the node's children.
function walk(node, visit, keys) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === SKIP) return;
  for (const key of keys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => walk(c, visit, keys));
    else walk(child, visit, keys);
  }
}

// The identifier a translator call goes through: `t('k')` or `t.rich('k')`.
function calleeIdentifier(callee) {
  if (callee.type === 'Identifier') return callee;
  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier')
    return callee.object;
  return null;
}

function importedName(spec) {
  if (spec.type === 'ImportDefaultSpecifier') return 'default';
  if (spec.type === 'ImportNamespaceSpecifier') return '*';
  return spec.imported.name ?? spec.imported.value;
}

// The namespace argument of `useTranslations(ns)` / `getTranslations({ namespace })`.
function translatorNamespace(arg) {
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg?.type === 'ObjectExpression')
    return arg.properties.find(p => p.key?.name === 'namespace')?.value?.value ?? '';
  return '';
}

function isControl(opening) {
  const name = elementName(opening);
  if (CONTROL_COMPONENTS.has(name)) return true;
  return (
    SUBMIT_ELEMENTS.get(name) === 'input' && CHOICE_TYPES.has(literalAttribute(opening, 'type'))
  );
}

// A button or input whose `formAction` submits: a dynamic `type` counts (fail closed).
function isSubmitCapable(opening) {
  const kind = SUBMIT_ELEMENTS.get(elementName(opening));
  if (!kind) return false;
  if (!attributeOf(opening, 'type')) return kind === 'button';
  const type = literalAttribute(opening, 'type');
  return type === null || SUBMIT_TYPES[kind].has(type.toLowerCase());
}

// The nearest enclosing form within the same component, or null.
function enclosingForm(element) {
  for (let current = element.parent; current; current = current.parent) {
    if (FUNCTIONS.has(current.type)) return null;
    if (current.type === 'JSXElement' && FORMS.has(elementName(current.openingElement)))
      return current;
  }
  return null;
}

function enclosingLabel(element) {
  for (let current = element.parent; current; current = current.parent) {
    if (FUNCTIONS.has(current.type)) return null;
    if (current.type === 'JSXElement' && LABELS.has(elementName(current.openingElement)))
      return current;
  }
  return null;
}

// The name a declaration gives, used to name the component that holds a boundary.
function declaredName(node) {
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id)
    return node.id.name;
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name;
  if (node.type === 'ExportDefaultDeclaration') return node.declaration.id?.name ?? 'default';
  return null;
}

// The outermost declaration around `node`: the file's component that holds it, or '?'.
function componentOf(node) {
  let name = '?';
  for (let current = node.parent; current; current = current.parent)
    name = declaredName(current) ?? name;
  return name;
}

// [name, node] of each top-level declaration of a statement (exported or not).
function declarationsOf(statement) {
  const node = statement.type.startsWith('Export') ? (statement.declaration ?? null) : statement;
  if (!node) return [];
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id)
    return [[node.id.name, node]];
  if (node.type === 'VariableDeclaration')
    return node.declarations.filter(d => d.id.type === 'Identifier').map(d => [d.id.name, d]);
  return [];
}

function exportedFrom(statement, local) {
  if (statement.type === 'ExportDefaultDeclaration') {
    const d = statement.declaration;
    return [['default', d.type === 'Identifier' ? local.get(d.name) : d]];
  }
  if (statement.type !== 'ExportNamedDeclaration') return [];
  if (statement.declaration) return declarationsOf(statement);
  if (statement.source) return [];
  return statement.specifiers.map(s => [
    s.exported.name ?? s.exported.value,
    local.get(s.local.name),
  ]);
}

// export name -> the top-level declaration of this file that it exports.
function exportsOf(program) {
  const local = new Map(program.body.flatMap(declarationsOf));
  const out = new Map();
  for (const statement of program.body)
    for (const [name, node] of exportedFrom(statement, local)) if (node) out.set(name, node);
  return out;
}

// Each boundary's name in item keys: its component, with `#n` for the n-th one (n > 1) in source
// order, so two boundaries rendering one entry in a file have distinct keys (code-r1 H2).
function boundaryLabels(nodes) {
  const labels = new Map();
  const seen = new Map();
  for (const node of [...nodes].sort((a, b) => a.range[0] - b.range[0])) {
    const component = componentOf(node);
    const n = (seen.get(component) ?? 0) + 1;
    seen.set(component, n);
    labels.set(node, n === 1 ? component : `${component}#${n}`);
  }
  return labels;
}

export default rule('A consent control is registered and tested (CHK-22)', context => {
  const { root, rel, role } = fileOf(context);
  const inInventory =
    role === 'screen' || (role === 'support' && rel.startsWith('packages/ui/src/'));
  if (!inInventory) return {};
  const keys = context.sourceCode.visitorKeys;
  const units = unitCounter(context, 'CHK-22');
  const elements = []; // every JSXElement
  let fileExports = new Map(); // export name -> top-level declaration, set at Program:exit
  const flag = (node, kind, key, text) =>
    report(context, node, `CHK-22|${rel}|${kind}|${key}`, text);

  // The variable an identifier refers to, by its lexical scope chain, or null.
  function variableOf(node) {
    for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
      const variable = scope.set.get(node.name);
      if (variable) return variable;
    }
    return null;
  }

  const valueDefinition = variable => variable?.defs.find(d => d.type !== 'Type') ?? null;

  // { specifier, imported } of an identifier bound to a value import, or null.
  function importOf(node) {
    const def = valueDefinition(variableOf(node));
    if (def?.type !== 'ImportBinding' || def.parent?.type !== 'ImportDeclaration') return null;
    if (def.parent.importKind === 'type' || def.node.importKind === 'type') return null;
    return { specifier: def.parent.source.value, imported: importedName(def.node) };
  }

  // The value definition of a binding that is never reassigned after its declaration, or null.
  function stableDefinition(node) {
    const variable = variableOf(node);
    if (variable?.references.some(r => r.isWrite() && !r.init)) return null;
    return valueDefinition(variable);
  }

  // The React export a callee names: `useCallback` imported from 'react', or `React.useCallback`
  // through a default or namespace import of 'react'; null otherwise.
  const reactApi = callee =>
    callee.type === 'Identifier' ? reactNamedApi(callee) : reactMemberApi(callee);

  function reactNamedApi(identifier) {
    const binding = importOf(identifier);
    if (binding?.specifier !== 'react') return null;
    return ['*', 'default'].includes(binding.imported) ? null : binding.imported;
  }

  function reactMemberApi(member) {
    if (member.type !== 'MemberExpression' || member.computed) return null;
    if (member.object.type !== 'Identifier' || member.property.type !== 'Identifier') return null;
    const binding = importOf(member.object);
    const whole = binding?.specifier === 'react' && ['*', 'default'].includes(binding.imported);
    return whole ? member.property.name : null;
  }

  // `start` of `const [pending, start] = useTransition()`.
  function isTransitionStart(callee) {
    const def = callee.type === 'Identifier' ? stableDefinition(callee) : null;
    const declarator = def?.type === 'Variable' ? def.node : null;
    if (declarator?.id.type !== 'ArrayPattern' || declarator.id.elements[1] !== def.name)
      return false;
    const init = declarator.init;
    return (
      init?.type === 'CallExpression' && reactApi(init.callee) === INVOKING_WRAPPERS.transitionHook
    );
  }

  function isInvokingWrapper(callee) {
    if (INVOKING_WRAPPERS.react.has(reactApi(callee))) return true;
    if (isTransitionStart(callee)) return true;
    return (
      callee.type === 'Identifier' &&
      INVOKING_WRAPPERS.globals.has(callee.name) &&
      valueDefinition(variableOf(callee)) === null
    );
  }

  // A nested function runs with its parent call: an IIFE, or the first argument of an invoking
  // wrapper.
  function isInvokedInPlace(fn) {
    const call = fn.parent;
    if (call?.type !== 'CallExpression') return false;
    return call.callee === fn || (call.arguments[0] === fn && isInvokingWrapper(call.callee));
  }

  // The function an identity wrapper call returns: its first argument, when it is a function.
  function identityArgument(call) {
    if (call?.type !== 'CallExpression' || !IDENTITY_WRAPPERS.has(reactApi(call.callee)))
      return null;
    return FUNCTIONS.has(call.arguments[0]?.type) ? call.arguments[0] : null;
  }

  // The function an identifier names, declared in this file and never reassigned:
  // `function f`, `const f = () => …`, or `const f = useCallback(fn, deps)` (the wrapped function).
  function functionOf(node) {
    const def = stableDefinition(node);
    if (def?.type === 'FunctionName') return def.node;
    if (def?.type !== 'Variable' || def.node.id.type !== 'Identifier') return null;
    const init = def.node.init;
    return FUNCTIONS.has(init?.type) ? init : identityArgument(init);
  }

  // The namespace of a next-intl translator a callee is bound to in its scope, or null
  // (code-r2: never by the translator's name across the file).
  function translatorNamespaceOf(callee) {
    const identifier = calleeIdentifier(callee);
    const def = identifier ? stableDefinition(identifier) : null;
    if (def?.type !== 'Variable' || def.node.id.type !== 'Identifier') return null;
    const raw = def.node.init;
    const init = raw?.type === 'AwaitExpression' ? raw.argument : raw;
    return isTranslatorFactoryCall(init) ? translatorNamespace(init.arguments[0]) : null;
  }

  // `useTranslations(…)` / `getTranslations(…)` imported from next-intl.
  function isTranslatorFactoryCall(init) {
    if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier') return false;
    const factory = importOf(init.callee);
    return (
      Boolean(factory) &&
      NEXT_INTL_RE.test(factory.specifier) &&
      TRANSLATOR_FACTORIES.has(factory.imported)
    );
  }

  // The top-level declaration a JSX name refers to when it is declared in this file, or null.
  function localDeclarationOf(node) {
    const def = valueDefinition(variableOf(node));
    if (def?.type === 'FunctionName' || def?.type === 'ClassName' || def?.type === 'Variable')
      return def.node;
    return null;
  }

  // Literal message keys of every translator call under `node`, with their full dotted key.
  function messageKeys(node) {
    const out = [];
    walk(
      node,
      n => {
        if (n.type !== 'CallExpression') return;
        const ns = translatorNamespaceOf(n.callee);
        if (ns === null) return;
        const arg = n.arguments[0];
        if (arg?.type !== 'Literal' || typeof arg.value !== 'string') return;
        out.push(ns ? `${ns}.${arg.value}` : arg.value);
      },
      keys
    );
    return out;
  }

  function labelTexts(node) {
    const out = [];
    walk(node, n => n.type === 'JSXText' && out.push(n.value), keys);
    return out;
  }

  // The label elements of a control: enclosing, `htmlFor`, each `aria-labelledby` id, `label` prop.
  function labelsOf(element, byId) {
    const opening = element.openingElement;
    const labels = [];
    const enclosing = enclosingLabel(element);
    if (enclosing) labels.push(enclosing);
    const id = literalAttribute(opening, 'id');
    if (id) labels.push(...(byId.labelsFor.get(id) ?? []));
    const labelledBy = (literalAttribute(opening, 'aria-labelledby') ?? '').split(/\s+/u);
    for (const ref of labelledBy.filter(Boolean)) labels.push(...(byId.elements.get(ref) ?? []));
    const labelProp = attributeOf(opening, 'label');
    if (labelProp) labels.push(labelProp);
    return labels;
  }

  function vocabularyHit(element, byId) {
    const opening = element.openingElement;
    const words = [];
    for (const name of STRING_ATTRIBUTES) words.push(literalAttribute(opening, name) ?? '');
    for (const name of HANDLER_ATTRIBUTES)
      walk(
        expressionOf(attributeOf(opening, name)),
        n => {
          if (n.type === 'Identifier') words.push(n.name);
        },
        keys
      );
    const labelLiteral = literalAttribute(opening, 'label');
    if (labelLiteral) words.push(labelLiteral);
    const labels = labelsOf(element, byId);
    const catalogue = labels.length ? catalogueFor(root) : null;
    for (const label of labels) {
      words.push(...labelTexts(label));
      for (const key of messageKeys(label)) {
        const text = messageText(catalogue, key);
        if (text === null)
          throw new ScanError(`${rel}: the label key ${key} is not in the English catalogue`);
        words.push(key, text);
      }
    }
    return words.some(word => VOCABULARY_RE.test(word));
  }

  // The import of this tree a reference names, as { specifier, imported }: an identifier bound to
  // a named or default import, or `ns.name` of a namespace import (r3 F5). UNKNOWN for any other
  // reference rooted in such an import (a computed or deeper member, a member of a named import);
  // null when it is not rooted in one (a local, a prop, an external module).
  function treeImportOf(node) {
    let rootNode = node;
    while (rootNode.type === 'MemberExpression') rootNode = rootNode.object;
    const binding = rootNode.type === 'Identifier' ? importOf(rootNode) : null;
    if (!binding || kindOfSpecifier(binding.specifier) === 'external') return null;
    if (node === rootNode) return binding.imported === '*' ? UNKNOWN : binding;
    const direct =
      node.object === rootNode &&
      !node.computed &&
      node.property.type === 'Identifier' &&
      binding.imported === '*';
    return direct ? { specifier: binding.specifier, imported: node.property.name } : UNKNOWN;
  }

  // A layer-2 module that does not declare itself client-only (r4 B3: `'use client'` under
  // actions/ runs in the browser).
  function isServerOrigin(origin) {
    const text = readInside(root, origin.file);
    if (text === null) return false;
    const directives = directivesOfText(origin.file, text);
    return !directives.includes('use client') && layerOf(origin.file, directives) === 2;
  }

  // What a reference is as a submission: `file#export` of a layer-2 export, UNKNOWN when it is
  // bound to this tree but cannot be resolved, or null when it is no submission (an external or
  // client export, a local, a prop).
  function submissionOf(node) {
    const target = treeImportOf(node);
    if (target === null || target === UNKNOWN) return target;
    const origin = originOf(resolverOf(context), rel, target.specifier, target.imported);
    if (origin.external || origin.unresolved) return UNKNOWN;
    return isServerOrigin(origin) ? `${origin.file}#${origin.name}` : null;
  }

  // Visits one node of a running function: a nested function counts only when it runs in place
  // (an IIFE, `startTransition(async () => …)`; code-r2 B6); a call of a function declared inside
  // the handler (`run()`) queues that function.
  function visitInvoked(n, current, handler, calls, queue) {
    if (n !== current && FUNCTIONS.has(n.type)) {
      if (isInvokedInPlace(n)) queue.push(n);
      return SKIP;
    }
    if (n.type !== 'CallExpression') return undefined;
    calls.push(n);
    const local = n.callee.type === 'Identifier' ? functionOf(n.callee) : null;
    if (local && contains(handler, local)) queue.push(local);
    return undefined;
  }

  // The calls a handler makes when it runs, never those of a function it only defines (code-r1 B7).
  function invokedCalls(handler) {
    const calls = [];
    const queue = [handler];
    const done = new Set();
    while (queue.length) {
      const current = queue.pop();
      if (done.has(current)) continue;
      done.add(current);
      walk(current, n => visitInvoked(n, current, handler, calls, queue), keys);
    }
    return calls;
  }

  // The function a handler attribute runs: a named function of this file, an inline function, or
  // the function an identity wrapper returns; any other call's result is not resolved.
  function handlerRoot(expression) {
    if (expression?.type === 'Identifier') return functionOf(expression);
    if (FUNCTIONS.has(expression?.type)) return expression;
    return identityArgument(expression);
  }

  // Every distinct submission a handler calls (r3 F5: never reduced to one, so a second one is a
  // submission-mismatch), or null when it calls none, or a call bound to this tree cannot be
  // resolved (an unresolved-submission, as for any submission the lint cannot follow).
  function submissionOfHandler(expression) {
    const handler = handlerRoot(expression);
    if (!handler) return null;
    const found = new Set();
    for (const call of invokedCalls(handler)) {
      const submission = submissionOf(call.callee);
      if (submission === UNKNOWN) return null;
      if (submission) found.add(submission);
    }
    return found.size ? [...found] : null;
  }

  // The submission an `action` or `formAction` names, with the layer-2 check of a handler (r3 F5).
  function actionSubmission(expression) {
    const submission = expression ? submissionOf(expression) : null;
    return typeof submission === 'string' ? submission : null;
  }

  // The submissions of every submit-capable `formAction` inside the form, or null when one cannot
  // be resolved. A non-submit button's `formAction` never runs, so it is not a path (code-r1 B7).
  function formActionSubmissions(boundary) {
    const out = [];
    walk(
      boundary,
      n => {
        if (n.type !== 'JSXOpeningElement' || !isSubmitCapable(n)) return;
        const formAction = attributeOf(n, 'formAction');
        if (formAction) out.push(actionSubmission(expressionOf(formAction)));
      },
      keys
    );
    return out.includes(null) ? null : out;
  }

  // Every submit path of a form: its `action`, its `onSubmit` handler and each submit-capable
  // `formAction` (code-r1 B7); null when there is none or one cannot be resolved.
  function formSubmissions(boundary) {
    const opening = boundary.openingElement;
    const action = attributeOf(opening, 'action');
    const onSubmit = attributeOf(opening, 'onSubmit');
    if (!action && !onSubmit) return null;
    const out = [];
    if (action) out.push(actionSubmission(expressionOf(action)));
    if (onSubmit) out.push(...(submissionOfHandler(expressionOf(onSubmit)) ?? [null]));
    const formActions = formActionSubmissions(boundary);
    return formActions && !out.includes(null) ? [...out, ...formActions] : null;
  }

  function handlerSubmissions(opening) {
    for (const name of ['onCheckedChange', 'onChange']) {
      const handler = expressionOf(attributeOf(opening, name));
      if (handler) return submissionOfHandler(handler);
    }
    return null;
  }

  // Every submission the boundary invokes, or null when one of them cannot be resolved.
  const invokedSubmissions = (boundary, isForm) =>
    isForm ? formSubmissions(boundary) : handlerSubmissions(boundary.openingElement);

  // The origin a JSX element's name refers to, `{ file, name, local }` as origins.mjs gives it:
  // an import followed through re-exports, or an exported top-level declaration of this file
  // (`sameFile`); null otherwise.
  function originOfElement(element) {
    const nameNode = element.openingElement.name;
    if (nameNode.type === 'JSXMemberExpression') return originOfMember(nameNode);
    if (nameNode.type !== 'JSXIdentifier' || !/^[A-Z]/u.test(nameNode.name)) return null;
    const binding = importOf(nameNode);
    if (binding) {
      if (kindOfSpecifier(binding.specifier) === 'external') return null;
      return originOf(resolverOf(context), rel, binding.specifier, binding.imported);
    }
    const declaration = localDeclarationOf(nameNode);
    if (!declaration || ![...fileExports.values()].includes(declaration)) return null;
    return { file: rel, name: nameNode.name, local: nameNode.name, sameFile: true };
  }

  // `<Ns.Component />` with `Ns` a namespace import of this tree: the export it names (r3 F6). A
  // deeper member of such a namespace (`<Ns.A.B />`), or a name it does not export, could be a
  // registered component and is a scanner error (fail closed). A member of a named or default
  // import (`<Ctx.Provider />`), a local, a prop or an external module is a property of a value,
  // which origins do not follow: the limit of an identifier bound to a prop.
  function originOfMember(member) {
    let rootNode = member;
    while (rootNode.type === 'JSXMemberExpression') rootNode = rootNode.object;
    const binding = rootNode.type === 'JSXIdentifier' ? importOf(rootNode) : null;
    if (binding?.imported !== '*' || kindOfSpecifier(binding.specifier) === 'external') return null;
    const direct = member.object === rootNode;
    const origin = direct
      ? originOf(resolverOf(context), rel, binding.specifier, member.property.name)
      : null;
    if (!origin || origin.external || origin.unresolved)
      throw new ScanError(`${rel}: <${jsxName(member)}> cannot be resolved to a component`);
    return origin;
  }

  // The declaration a registry target `{ file, exportName }` names, as an origin, or null.
  const targetOrigins = new Map();
  function targetOrigin(target) {
    const key = `${target.file}#${target.exportName}`;
    if (!targetOrigins.has(key)) {
      const found = originIn(resolverOf(context), target.file, target.exportName);
      targetOrigins.set(key, found && !found.unresolved && !found.external ? found : null);
    }
    return targetOrigins.get(key);
  }

  const ownedBy = (element, exportName) => {
    const declaration = fileExports.get(exportName);
    return Boolean(declaration) && contains(declaration, element);
  };

  // One representation at both ends (code-r2 B7): the registry's public export and the render's
  // origin are compared as the declaring file and the declaration they export.
  function rendersEntry(entry, origin) {
    const targets = [{ file: entry.file, exportName: entry.exportName }, ...entry.aliases];
    return targets.some(t => {
      const declared = targetOrigin(t);
      return declared?.file === origin.file && declared.local === origin.local;
    });
  }

  // A render needs no boundary inside the registered alias component that holds it (code-r1 B6),
  // or anywhere for a `selfSubmitting` entry outside its own control.
  function exemptRender(entry, origin, element) {
    if (entry.aliases.some(a => a.file === rel && ownedBy(element, a.exportName))) return true;
    return Boolean(entry.selfSubmitting) && (origin.sameFile || rel !== entry.file);
  }

  // The entries an element renders through a component (§2.1 "Renders").
  function renderedEntries(element, registry) {
    const origin = originOfElement(element);
    if (!origin || origin.unresolved || origin.external) return [];
    const out = [];
    for (const entry of registry.values()) {
      if (!entry.exportName || entry.kind === 'not-consent') continue;
      if (rendersEntry(entry, origin) && !exemptRender(entry, origin, element)) out.push(entry);
    }
    return out;
  }

  function indexById() {
    const byId = { labelsFor: new Map(), elements: new Map() };
    for (const element of elements) {
      const opening = element.openingElement;
      const id = literalAttribute(opening, 'id');
      if (id) byId.elements.set(id, [...(byId.elements.get(id) ?? []), element]);
      const target = LABELS.has(elementName(opening)) ? literalAttribute(opening, 'htmlFor') : null;
      if (target) byId.labelsFor.set(target, [...(byId.labelsFor.get(target) ?? []), element]);
    }
    return byId;
  }

  // Counts a control and flags it when it reads as consent, or carries a non-literal
  // `data-consent` (code-r1 H2), without a literal `data-consent`; true if flagged.
  function flagUnregistered(element, consentId, byId) {
    const opening = element.openingElement;
    if (!isControl(opening)) return false;
    units.add('control');
    if (consentId) return false;
    const dynamic = Boolean(attributeOf(opening, 'data-consent'));
    if (!dynamic && !vocabularyHit(element, byId)) return false;
    const key =
      literalAttribute(opening, 'id') ??
      literalAttribute(opening, 'name') ??
      literalAttribute(opening, 'data-testid') ??
      '?';
    flag(
      element,
      'unregistered',
      `${elementName(opening)}:${key}`,
      dynamic
        ? 'consent control with a non-literal data-consent'
        : 'consent control without data-consent'
    );
    return true;
  }

  // The registry entries the element renders: its own `data-consent` use, or the entries of
  // the component it renders. A misbound `data-consent` is flagged and renders none. The control
  // is the definition only inside the component exported as `exportName` (code-r1 B6).
  function elementRenders(element, consentId, registry) {
    if (!consentId) return renderedEntries(element, registry);
    const opening = element.openingElement;
    const entry = registry.get(consentId);
    const control = literalAttribute(opening, 'id') ?? literalAttribute(opening, 'name');
    if (entry?.file !== rel || entry.control !== control) {
      flag(element, 'misbound', consentId, `data-consent ${consentId} is not this file's control`);
      return [];
    }
    // An exported control is judged at its renders; the registry requires it to have a use or to
    // be selfSubmitting (r5 B2), so a route's component cannot rest on this exemption.
    const isDefinition =
      Boolean(entry.exportName) && !entry.selfSubmitting && ownedBy(element, entry.exportName);
    return !isDefinition && entry.kind !== 'not-consent' ? [entry] : [];
  }

  function analyse(program) {
    const registry = registryFor(root);
    fileExports = exportsOf(program);
    const byId = indexById();
    const renders = []; // { element, entry }
    for (const element of elements) {
      const consentId = literalAttribute(element.openingElement, 'data-consent');
      if (flagUnregistered(element, consentId, byId)) continue;
      for (const entry of elementRenders(element, consentId, registry))
        renders.push({ element, entry });
    }
    judgeBoundaries(renders, registry);
    units.flush(program);
  }

  // Each render's boundary, and every element marked `data-consent-use` even when no render was
  // recognized there (code-r1 H2).
  function boundariesOf(renders) {
    const boundaries = new Map(); // node -> { isForm, entries:Set }
    for (const { element, entry } of renders) {
      const form = enclosingForm(element);
      const node = form ?? element;
      if (!boundaries.has(node))
        boundaries.set(node, { isForm: Boolean(form), entries: new Set() });
      boundaries.get(node).entries.add(entry.id);
    }
    for (const element of elements)
      if (!boundaries.has(element) && attributeOf(element.openingElement, 'data-consent-use'))
        boundaries.set(element, {
          isForm: FORMS.has(elementName(element.openingElement)),
          entries: new Set(),
        });
    return boundaries;
  }

  // The boundary's listed uses that are this file's, counting each in `listedTimes`.
  function validUses(node, label, entries, registry, listedTimes) {
    const tokens = (literalAttribute(node.openingElement, 'data-consent-use') ?? '')
      .split(/\s+/u)
      .filter(Boolean);
    const valid = [];
    for (const token of tokens) {
      const [entryId, useId, extra] = token.split(':');
      const use = registry.get(entryId)?.uses.find(u => u.useId === useId);
      if (extra !== undefined || use?.file !== rel) {
        flag(
          node,
          'unmatched-boundary',
          `${token}@${label}`,
          `listed use ${token} is unknown or not this file's`
        );
        continue;
      }
      listedTimes.set(token, (listedTimes.get(token) ?? 0) + 1);
      if (!entries.has(entryId))
        flag(node, 'orphan-use', token, `${token} has no render in this boundary`);
      valid.push({ token, use });
    }
    return valid;
  }

  function judgeSubmission(node, isForm, valid) {
    const invoked = invokedSubmissions(node, isForm);
    if (!invoked) {
      flag(
        node,
        'unresolved-submission',
        valid.map(v => v.token).join(' '),
        'the submission cannot be resolved here'
      );
      return;
    }
    for (const { token, use } of valid)
      if (invoked.some(submission => submission !== use.submission))
        flag(
          node,
          'submission-mismatch',
          token,
          `invokes ${invoked.join(', ')}, registered ${use.submission}`
        );
  }

  function judgeBoundary(node, label, { isForm, entries }, registry, listedTimes) {
    units.add('boundary');
    const valid = validUses(node, label, entries, registry, listedTimes);
    for (const entryId of entries)
      if (!valid.some(v => v.token.startsWith(`${entryId}:`)))
        flag(
          node,
          'unmatched-boundary',
          `${entryId}@${label}`,
          `the boundary does not list a use of ${entryId}`
        );
    if (valid.length) judgeSubmission(node, isForm, valid);
  }

  function flagListing(listedTimes, registry) {
    for (const [token, times] of listedTimes)
      if (times > 1)
        flag(
          context.sourceCode.ast,
          'shared-use',
          token,
          `${token} is listed by ${times} boundaries`
        );
    for (const entry of registry.values())
      for (const use of entry.uses) {
        const token = `${entry.id}:${use.useId}`;
        if (use.file === rel && !listedTimes.has(token))
          flag(
            context.sourceCode.ast,
            'orphan-use',
            token,
            `${token} is listed by no boundary here`
          );
      }
  }

  function judgeBoundaries(renders, registry) {
    const listedTimes = new Map();
    const boundaries = boundariesOf(renders);
    const labels = boundaryLabels(boundaries.keys());
    for (const [node, boundary] of boundaries)
      judgeBoundary(node, labels.get(node), boundary, registry, listedTimes);
    flagListing(listedTimes, registry);
  }

  return {
    JSXElement(node) {
      elements.push(node);
    },
    'Program:exit': analyse,
  };
});
