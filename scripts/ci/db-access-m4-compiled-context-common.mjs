// Data-only utilities. None of these functions creates an execution capability.
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const digest = value => hash(JSON.stringify(value));
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const fail = reason => {
  throw Error('M4 compiled context correspondence refused: ' + reason);
};
export const positive = value => Number.isSafeInteger(value) && value > 0;
export function one(rows, test, label) {
  if (!Array.isArray(rows)) fail(label);
  const matches = rows.filter(test);
  if (matches.length !== 1) fail('unique ' + label);
  return matches[0];
}
export function add(a, b) {
  if (
    !Number.isSafeInteger(a) ||
    a < 0 ||
    !Number.isSafeInteger(b) ||
    b < 0 ||
    !Number.isSafeInteger(a + b)
  )
    fail('multiplicity overflow');
  return a + b;
}
export function locator(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    typeof value[0] === 'string' &&
    Number.isSafeInteger(value[1]) &&
    Number.isSafeInteger(value[2]) &&
    value[2] > value[1] &&
    Number.isSafeInteger(value[3])
  );
}
