// Scope analysis of the consent-control-registered rule (CHK-22): names are resolved lexically
// through ESLint's scope analysis, never by spelling across the file (code-r1 B7).
import { FUNCTIONS } from './consent-control-registered-jsx.mjs';

const TRANSLATOR_FACTORIES = new Set(['useTranslations', 'getTranslations']);
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

// The variable an identifier refers to, by its lexical scope chain, or null.
function variableOf(context, node) {
  for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable) return variable;
  }
  return null;
}

const valueDefinition = variable => variable?.defs.find(d => d.type !== 'Type') ?? null;

// { specifier, imported } of an identifier bound to a value import, or null.
function importOf(context, node) {
  const def = valueDefinition(variableOf(context, node));
  if (def?.type !== 'ImportBinding' || def.parent?.type !== 'ImportDeclaration') return null;
  if (def.parent.importKind === 'type' || def.node.importKind === 'type') return null;
  return { specifier: def.parent.source.value, imported: importedName(def.node) };
}

// The value definition of a binding that is never reassigned after its declaration, or null.
function stableDefinition(context, node) {
  const variable = variableOf(context, node);
  if (variable?.references.some(r => r.isWrite() && !r.init)) return null;
  return valueDefinition(variable);
}

// The React export a callee names: `useCallback` imported from 'react', or `React.useCallback`
// through a default or namespace import of 'react'; null otherwise.
const reactApi = (context, callee) =>
  callee.type === 'Identifier' ? reactNamedApi(context, callee) : reactMemberApi(context, callee);

function reactNamedApi(context, identifier) {
  const binding = importOf(context, identifier);
  if (binding?.specifier !== 'react') return null;
  return ['*', 'default'].includes(binding.imported) ? null : binding.imported;
}

function reactMemberApi(context, member) {
  if (member.type !== 'MemberExpression' || member.computed) return null;
  if (member.object.type !== 'Identifier' || member.property.type !== 'Identifier') return null;
  const binding = importOf(context, member.object);
  const whole = binding?.specifier === 'react' && ['*', 'default'].includes(binding.imported);
  return whole ? member.property.name : null;
}

// `start` of `const [pending, start] = useTransition()`.
function isTransitionStart(context, callee) {
  const def = callee.type === 'Identifier' ? stableDefinition(context, callee) : null;
  const declarator = def?.type === 'Variable' ? def.node : null;
  if (declarator?.id.type !== 'ArrayPattern' || declarator.id.elements[1] !== def.name)
    return false;
  const init = declarator.init;
  return (
    init?.type === 'CallExpression' &&
    reactApi(context, init.callee) === INVOKING_WRAPPERS.transitionHook
  );
}

function isInvokingWrapper(context, callee) {
  if (INVOKING_WRAPPERS.react.has(reactApi(context, callee))) return true;
  if (isTransitionStart(context, callee)) return true;
  return (
    callee.type === 'Identifier' &&
    INVOKING_WRAPPERS.globals.has(callee.name) &&
    valueDefinition(variableOf(context, callee)) === null
  );
}

// A nested function runs with its parent call: an IIFE, or the first argument of an invoking
// wrapper.
function isInvokedInPlace(context, fn) {
  const call = fn.parent;
  if (call?.type !== 'CallExpression') return false;
  return (
    call.callee === fn || (call.arguments[0] === fn && isInvokingWrapper(context, call.callee))
  );
}

// The function an identity wrapper call returns: its first argument, when it is a function.
function identityArgument(context, call) {
  if (call?.type !== 'CallExpression' || !IDENTITY_WRAPPERS.has(reactApi(context, call.callee)))
    return null;
  return FUNCTIONS.has(call.arguments[0]?.type) ? call.arguments[0] : null;
}

// The function an identifier names, declared in this file and never reassigned:
// `function f`, `const f = () => …`, or `const f = useCallback(fn, deps)` (the wrapped function).
function functionOf(context, node) {
  const def = stableDefinition(context, node);
  if (def?.type === 'FunctionName') return def.node;
  if (def?.type !== 'Variable' || def.node.id.type !== 'Identifier') return null;
  const init = def.node.init;
  return FUNCTIONS.has(init?.type) ? init : identityArgument(context, init);
}

// The namespace of a next-intl translator a callee is bound to in its scope, or null
// (code-r2: never by the translator's name across the file).
function translatorNamespaceOf(context, callee) {
  const identifier = calleeIdentifier(callee);
  const def = identifier ? stableDefinition(context, identifier) : null;
  if (def?.type !== 'Variable' || def.node.id.type !== 'Identifier') return null;
  const raw = def.node.init;
  const init = raw?.type === 'AwaitExpression' ? raw.argument : raw;
  return isTranslatorFactoryCall(context, init) ? translatorNamespace(init.arguments[0]) : null;
}

// `useTranslations(…)` / `getTranslations(…)` imported from next-intl.
function isTranslatorFactoryCall(context, init) {
  if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier') return false;
  const factory = importOf(context, init.callee);
  return (
    Boolean(factory) &&
    NEXT_INTL_RE.test(factory.specifier) &&
    TRANSLATOR_FACTORIES.has(factory.imported)
  );
}

// The top-level declaration a JSX name refers to when it is declared in this file, or null.
function localDeclarationOf(context, node) {
  const def = valueDefinition(variableOf(context, node));
  if (def?.type === 'FunctionName' || def?.type === 'ClassName' || def?.type === 'Variable')
    return def.node;
  return null;
}

export {
  functionOf,
  identityArgument,
  importOf,
  isInvokedInPlace,
  localDeclarationOf,
  translatorNamespaceOf,
};
