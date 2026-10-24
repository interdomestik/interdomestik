import { types } from 'node:util';
// Native lexical lookup dependencies only. Raw/export/external checker reads make a query
// ineligible. Certificates never freeze Symbols or run accessors while validating a hit.
const nativeModels = new WeakMap();
const fields = ['flags', 'valueDeclaration', 'declarations'];
// Cache eligibility only: exhaustion never stops a provenance query or changes its own fuel.
const MAX_CERTIFICATE_READS = 131072;
const take = budget => --budget.remaining >= 0;

function metadata(symbol, budget) {
  if (!take(budget)) return;
  if (!symbol || typeof symbol !== 'object' || types.isProxy(symbol)) return;
  const prototype = Object.getPrototypeOf(symbol),
    values = [];
  if (types.isProxy(prototype)) return;
  for (const name of fields) {
    if (!take(budget)) return;
    const descriptor = Object.getOwnPropertyDescriptor(symbol, name);
    if (!descriptor) {
      for (let parent = prototype; parent; parent = Object.getPrototypeOf(parent)) {
        if (!take(budget) || types.isProxy(parent) || Object.getOwnPropertyDescriptor(parent, name))
          return;
      }
      values.push({ present: false });
    } else {
      if (!Object.hasOwn(descriptor, 'value') || types.isProxy(descriptor.value)) return;
      values.push({ present: true, value: descriptor.value });
    }
  }
  const declarations = values[2].value;
  let entries;
  if (declarations !== undefined) {
    if (!Array.isArray(declarations) || Object.getPrototypeOf(declarations) !== Array.prototype)
      return;
    if (!take(budget)) return;
    const length = Object.getOwnPropertyDescriptor(declarations, 'length');
    if (!length || !Object.hasOwn(length, 'value')) return;
    entries = [];
    for (let index = 0; index < length.value; index++) {
      if (!take(budget)) return;
      const item = Object.getOwnPropertyDescriptor(declarations, String(index));
      if (!item || !Object.hasOwn(item, 'value') || types.isProxy(item.value)) return;
      entries.push(item.value);
    }
  }
  return { prototype, values, entries };
}

function equal(left, right) {
  return (
    !!left &&
    !!right &&
    left.prototype === right.prototype &&
    left.values.every(
      (value, index) =>
        value.present === right.values[index].present && value.value === right.values[index].value
    ) &&
    (left.entries === undefined
      ? right.entries === undefined
      : right.entries?.length === left.entries.length &&
        left.entries.every((value, index) => value === right.entries[index]))
  );
}

export function validSourceDependencies(
  dependencies,
  budget = { remaining: MAX_CERTIFICATE_READS }
) {
  try {
    return dependencies.every(([symbol, expected]) => equal(metadata(symbol, budget), expected));
  } catch {
    return false;
  }
}

export function createSourceDependencyObserver() {
  let active;
  return {
    readSymbol(symbol) {
      if (!active || active.invalid || symbol === undefined) return;
      let current;
      try {
        current = metadata(symbol, active.budget);
      } catch {
        active.invalid = true;
        return;
      }
      if (!current) {
        active.invalid = true;
        return;
      }
      const prior = active.dependencies.get(symbol);
      if (prior && !equal(prior, current)) active.invalid = true;
      if (!prior) active.dependencies.set(symbol, current);
    },
    uncertifiable() {
      if (active) active.invalid = true;
    },
    capture(compute) {
      const previous = active;
      if (previous) previous.invalid = true;
      const frame = {
        dependencies: new Map(),
        invalid: !!previous,
        budget: { remaining: MAX_CERTIFICATE_READS },
      };
      active = frame;
      try {
        const value = compute();
        const dependencies = [...frame.dependencies];
        return {
          value,
          dependencies:
            !frame.invalid && validSourceDependencies(dependencies, frame.budget)
              ? dependencies
              : undefined,
        };
      } finally {
        active = previous;
      }
    },
  };
}

export function registerSourceModel(model, observer) {
  nativeModels.set(model, {
    observer,
    methods: Object.entries(Object.getOwnPropertyDescriptors(model))
      .filter(([, descriptor]) => typeof descriptor.value === 'function')
      .map(([name, descriptor]) => [name, descriptor.value]),
  });
}

export function registerSourceProjection(projected, original) {
  const registered = sourceDependencyObserver(original);
  if (registered) {
    registerSourceModel(projected, registered);
    nativeModels.get(projected).original = original;
  }
}

export function sourceDependencyObserver(model, seen = new Set()) {
  if (seen.has(model)) return;
  seen.add(model);
  const entry = nativeModels.get(model);
  return entry &&
    entry.methods.every(
      ([name, value]) => Object.getOwnPropertyDescriptor(model, name)?.value === value
    ) &&
    (!entry.original || sourceDependencyObserver(entry.original, seen) === entry.observer)
    ? entry.observer
    : undefined;
}
