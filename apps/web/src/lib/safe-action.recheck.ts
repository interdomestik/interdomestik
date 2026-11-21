import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';

import { actionFailure } from './safe-action.failure';
import { ACCESSOR, isOwnReadable, ownKeys, ownValue } from './safe-action.check-def';

export const STANDARD_OBJECT_KEYS = Object.freeze([
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  'hasOwnProperty',
  '__lookupGetter__',
  '__lookupSetter__',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  '__proto__',
  'toLocaleString',
] as const);

const standardKeys = new Set<PropertyKey>(STANDARD_OBJECT_KEYS);
const controlKeys = new Set<PropertyKey>([
  'skipChecks',
  'aborted',
  'continue',
  'coerce',
  'when',
  'checks',
  'issues',
  'abort',
  'direction',
  'async',
  'jitless',
]);
const prototype = Object.prototype;
const baseline = Object.freeze(
  STANDARD_OBJECT_KEYS.map(key => Object.freeze(Object.getOwnPropertyDescriptor(prototype, key)))
);
const wasExtensible = Object.isExtensible(prototype);
const integrityErrors = new WeakSet<object>();

export class ObjectPrototypeIntegrityError extends Error {
  declare readonly digest: 'OBJECT_PROTOTYPE_INTEGRITY';
  declare readonly cause: undefined;

  constructor() {
    super('Object prototype integrity check failed');
    const descriptors = {
      __proto__: null,
      name: { __proto__: null, value: 'ObjectPrototypeIntegrityError' },
      digest: { __proto__: null, value: 'OBJECT_PROTOTYPE_INTEGRITY' },
      cause: { __proto__: null, value: undefined },
    };
    Object.defineProperties(this, descriptors as unknown as PropertyDescriptorMap);
    integrityErrors.add(this);
  }
}

export function isIntegrityError(error: unknown): error is ObjectPrototypeIntegrityError {
  return typeof error === 'object' && error !== null && integrityErrors.has(error);
}

const descriptorKeys = ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'] as const;

function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined) {
  if (a === undefined || b === undefined) return a === b;
  return descriptorKeys.every(key => {
    const own = Object.hasOwn(a, key);
    return own === Object.hasOwn(b, key) && (!own || Object.is(a[key], b[key]));
  });
}

export function assertPristineObjectPrototype(): void {
  let labels = '';
  let strings = 0;
  let symbols = 0;
  for (const key of ownKeys(prototype)) {
    if (standardKeys.has(key)) continue;
    if (controlKeys.has(key)) labels += ` control:${String(key)}`;
    else if (typeof key === 'string') strings += 1;
    else symbols += 1;
  }
  STANDARD_OBJECT_KEYS.forEach((key, index) => {
    if (!sameDescriptor(baseline[index], Object.getOwnPropertyDescriptor(prototype, key))) {
      labels += ` replaced:${key}`;
    }
  });
  if (Object.getPrototypeOf(prototype) !== null) labels += ' replaced:prototype';
  if (Object.isExtensible(prototype) !== wasExtensible) labels += ' replaced:extensibility';
  if (strings) labels += ` unknown-string:${strings}`;
  if (symbols) labels += ` unknown-symbol:${symbols}`;
  if (!labels) return;
  const error = new ObjectPrototypeIntegrityError();
  try {
    Sentry.captureException(error, {
      __proto__: null,
      extra: { __proto__: null, labels: labels.trim() },
    } as Parameters<typeof Sentry.captureException>[1]);
  } finally {
    throw error;
  }
}

export type RefinementRun = {
  assertIntegrity: () => void;
  closed: boolean;
  thrown: { error: unknown } | null;
  integrity: ObjectPrototypeIntegrityError | null;
  pending: Set<Promise<boolean>>;
};

export function gateParse(run: RefinementRun, error?: unknown): void {
  if (isIntegrityError(error)) run.integrity ??= error;
  if (run.integrity) return;
  try {
    run.assertIntegrity();
  } catch (integrity) {
    if (!isIntegrityError(integrity)) throw integrity;
    run.integrity = integrity;
  }
}

export function recordRefinementError(run: RefinementRun | undefined, error: unknown): false {
  if (run) {
    gateParse(run, error);
    run.thrown ??= { error };
  }
  return false;
}

async function settleRefinement(run: RefinementRun | undefined, adopted: Promise<unknown>) {
  let value: unknown;
  try {
    value = await adopted;
  } catch (error) {
    return recordRefinementError(run, error);
  }
  if (run) gateParse(run);
  return Boolean(value);
}

export function trackRefinement(run: RefinementRun | undefined, adopted: Promise<unknown>) {
  const pending = settleRefinement(run, adopted);
  if (run) {
    run.pending.add(pending);
    void pending.then(() => run.pending.delete(pending));
  }
  return pending;
}

const errorFields = ['digest', 'message', 'cause', 'name', 'code', 'reason'] as const;

function inspectable(error: unknown, seen: Set<object>): boolean {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return true;
  if (!isOwnReadable(error) || seen.has(error) || seen.size >= 32) return false;
  seen.add(error);
  for (let part: object | null = error; part !== null; part = Object.getPrototypeOf(part)) {
    if (!isOwnReadable(part)) return false;
    for (const key of errorFields) {
      const value = ownValue(part, key);
      if (value === ACCESSOR) return false;
      if (
        part !== error &&
        Object.hasOwn(part, key) &&
        (key === 'cause' || key === 'digest' || (key === 'message' && value === 'NEXT_REDIRECT'))
      ) {
        return false;
      }
    }
  }
  return inspectable(ownValue(error, 'cause'), seen);
}

/** Preserve integrity and framework exceptions before the ordinary action classifier runs. */
export function checkControlFlow(error: unknown): boolean {
  if (isIntegrityError(error)) throw error;
  assertPristineObjectPrototype();
  const chain = new Set<object>();
  if (!inspectable(error, chain)) return false;
  try {
    unstable_rethrow(error);
  } catch (control) {
    if (control === error || chain.has(control as object)) throw control;
    return false;
  }
  if (ownValue(error, 'message') === 'NEXT_REDIRECT') throw error;
  return true;
}

export function internalDefect(operation: string) {
  Sentry.captureException(new Error('Safe action contract violation'), { extra: { operation } });
  return actionFailure('INTERNAL_SERVER_ERROR');
}
