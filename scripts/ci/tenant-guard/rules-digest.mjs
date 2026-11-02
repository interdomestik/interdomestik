import { createHash } from 'node:crypto';

export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// The order of a default `sort()` on strings, stated explicitly (UTF-16 code units, not locale).
export const byCodeUnit = (a, b) => (a < b ? -1 : Number(a > b));

// A TypeScript node flag test (one bitwise site for the guard, outside any condition).
export const hasFlag = (node, flag) => (node.flags & flag) !== 0;

export const within = (node, outer) => node.pos >= outer.pos && node.end <= outer.end;
