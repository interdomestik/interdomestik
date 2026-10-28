import { createHash } from 'node:crypto';
import { types } from 'node:util';

const isSet = types.isSet;
const setPrototype = Set.prototype;
const setSize = Object.getOwnPropertyDescriptor(setPrototype, 'size').get;
const setValues = setPrototype.values;
const setNext = Object.getPrototypeOf(setValues.call(new Set())).next;

// Data integrity only: these helpers never grant native/session/worker ownership.
// Stream the full data encoding to avoid building another graph-sized JSON tree.
export function outputShape(value) {
  const references = [],
    active = new Set(),
    seen = new WeakMap(),
    hash = createHash('sha256');
  let buffer = '';
  // 65,536 code units is a flush threshold, not a token-size bound: JSON.stringify still
  // materializes each complete encoded token before the buffer is flushed.
  const emit = item => {
    buffer += JSON.stringify(item) + '\n';
    if (buffer.length >= 65536) {
      hash.update(buffer);
      buffer = '';
    }
  };
  const visit = item => {
    if (item === null) {
      emit('null');
      return;
    }
    const type = typeof item;
    if (type !== 'object') {
      if (!['string', 'number', 'boolean', 'undefined'].includes(type))
        throw Error('incomplete: non-data analysis output');
      emit(type);
      if (type !== 'undefined')
        emit(type === 'number' ? (Object.is(item, -0) ? '-0' : String(item)) : item);
      return;
    }
    if (active.has(item)) throw Error('incomplete: cyclic analysis output');
    if (seen.has(item)) {
      emit('reference');
      emit(seen.get(item));
      return;
    }
    seen.set(item, references.length);
    active.add(item);
    references.push(item);
    if (isSet(item)) {
      if (Object.getPrototypeOf(item) !== setPrototype || Reflect.ownKeys(item).length)
        throw Error('incomplete: non-intrinsic/decorated Set output');
      emit('set');
      emit(setSize.call(item));
      const iterator = setValues.call(item);
      for (let step = setNext.call(iterator); !step.done; step = setNext.call(iterator))
        visit(step.value);
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype)
        throw Error('incomplete: non-plain analysis output');
      emit(Array.isArray(item) ? 'array' : 'object');
      const keys = Reflect.ownKeys(item);
      emit(keys.length);
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(item, key);
        if (typeof key !== 'string' || !Object.hasOwn(field, 'value'))
          throw Error('incomplete: accessor/symbol analysis output');
        emit(key);
        emit(field.enumerable);
        visit(field.value);
      }
    }
    active.delete(item);
  };
  visit(value);
  hash.update(buffer);
  return { digest: hash.digest('hex'), references };
}
export function sameOutputShape(before, value) {
  if (!before) return false;
  const after = outputShape(value);
  return (
    before.digest === after.digest &&
    before.references.length === after.references.length &&
    before.references.every((reference, index) => reference === after.references[index])
  );
}
export function freezeOutput(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeOutput(child);
    Object.freeze(value);
  }
  return value;
}
