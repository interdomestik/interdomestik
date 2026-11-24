// Shared helpers of the D-1 resolution tests (screen-contract-check.resolution*.test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { resolverFor } from '../../screen-contract/specifiers.mjs';
import { byCodeUnit } from '../../server-mutation/ast.mjs';
import { tree } from './harness.mjs';

export const W = 'apps/web/src';
export const FROM = `${W}/components/caller.tsx`;
export const X = 'export const x = 1;\n';
export const targetsIn = (t, files, specifier, from = FROM) => {
  const resolver = resolverFor(fs.realpathSync(tree(t, files)));
  return {
    targets: [...resolver.resolveTargets(from, specifier)].sort(byCodeUnit),
    file: resolver.resolveFile(from, specifier),
  };
};

export const WEB = paths =>
  `{ "compilerOptions": { "moduleResolution": "bundler", "paths": ${JSON.stringify(paths)} } }\n`;
export const rejects = (t, files, pattern) =>
  assert.throws(() => resolverFor(fs.realpathSync(tree(t, files))), pattern);
export const SCANNER_PR = /scanner PR first/u;
// Every pattern matches the error's message (a validation function for assert.throws).
export const both =
  (...patterns) =>
  error =>
    patterns.every(pattern => pattern.test(error.message));

export const REAL_NEXT = Object.freeze({
  'apps/web/next.config.mjs': fs.readFileSync('apps/web/next.config.mjs', 'utf8'),
  'apps/web/src/lib/supabase-deployment.mjs': fs.readFileSync(
    'apps/web/src/lib/supabase-deployment.mjs',
    'utf8'
  ),
  'pnpm-lock.yaml': fs.readFileSync('pnpm-lock.yaml', 'utf8'),
});
