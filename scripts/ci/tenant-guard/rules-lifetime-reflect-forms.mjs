import ts from 'typescript';

export const GLOBAL_OBJECTS = new Set(['globalThis', 'self', 'window', 'global']);
export const LAYOUT_IMPORTS = new Set(['ACCESSOR', 'isOwnReadable', 'ownKeys', 'ownValue']);
export const BUFFER_MODULES = new Set(['buffer', 'node:buffer']);
export const WRITER_GLOBALS = new Set(['Array', 'Date', 'Map', 'Object', 'Promise']);
export const ARGUMENT_MUTATORS = new Set([
  'assign',
  'defineProperties',
  'defineProperty',
  'deleteProperty',
  'freeze',
  'preventExtensions',
  'seal',
  'setPrototypeOf',
]);
export const RECEIVER_MUTATORS = new Set([
  '__defineGetter__',
  '__defineSetter__',
  'add',
  'append',
  'clear',
  'copyWithin',
  'delete',
  'fill',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
// In-place calls to these native static methods cannot mutate their `this`. Check their arguments
// separately, including the destinations of assign, defineProperty and other mutators.
export const STATIC_METHODS = new Map([
  [
    'Object',
    new Set([
      'assign',
      'create',
      'defineProperties',
      'defineProperty',
      'entries',
      'freeze',
      'getOwnPropertyDescriptor',
      'getOwnPropertyNames',
      'getOwnPropertySymbols',
      'getPrototypeOf',
      'hasOwn',
      'is',
      'isFrozen',
      'setPrototypeOf',
    ]),
  ],
  ['Reflect', new Set(['apply', 'defineProperty', 'has', 'ownKeys', 'set'])],
]);

// The reviewed helper can compare an arbitrary value against the sample and returns a boolean.
export function layoutComparison(node) {
  const call = node.parent;
  if (!ts.isCallExpression(call) || call.arguments.length !== 2) return false;
  const callee = call.expression;
  const [value, layout] = call.arguments;
  return (
    ts.isIdentifier(callee) &&
    callee.text === 'matchesLayout' &&
    ts.isIdentifier(layout) &&
    layout.text === 'fileLayout' &&
    !ts.isSpreadElement(value) &&
    (node === callee || node === layout)
  );
}

export const memberAccess = node =>
  ts.isAccessExpression(node.parent) && node.parent.expression === node ? node.parent : null;

export function memberName(access) {
  if (ts.isPropertyAccessExpression(access)) return access.name.text;
  return ts.isStringLiteralLike(access.argumentExpression) ? access.argumentExpression.text : null;
}
