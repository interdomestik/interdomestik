import { createHash } from 'node:crypto';

export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

export const within = (node, outer) => node.pos >= outer.pos && node.end <= outer.end;
