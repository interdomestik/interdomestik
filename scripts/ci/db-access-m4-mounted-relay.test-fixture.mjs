// Explicit unit source loader: transpile exact TS bodies, substitute only declared imports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
export const operationId = '00000000-0000-4000-8000-000000000001';
export const opsRoot = 'apps/web/src/server/operations/';
const root = fileURLToPath(new URL('../..', import.meta.url));
export const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
export function mountedLoader(overrides = {}) {
  const cache = new Map(),
    name = randomUUID();
  function url(rel) {
    if (cache.has(rel)) return cache.get(rel);
    if (Object.hasOwn(overrides, rel)) {
      const value = data(overrides[rel]);
      cache.set(rel, value);
      return value;
    }
    let text = ts.transpileModule(source(rel), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    text = text.replace(/from ["']([^"']+)["']/gu, (_m, spec) => {
      let child = spec;
      if (spec.startsWith('.'))
        child = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)) + '.ts';
      else if (spec.startsWith('@/')) child = 'apps/web/src/' + spec.slice(2) + '.ts';
      return (
        'from ' +
        JSON.stringify(
          Object.hasOwn(overrides, child) || !child.startsWith('node:') ? url(child) : child
        )
      );
    });
    const result = data(text + '\n//# sourceURL=mounted-relay-unit-' + name + '/' + rel);
    cache.set(rel, result);
    return result;
  }
  return rel => import(url(rel));
}
export function command(profile = 'legacy-admin', staffId = 'staff-1') {
  return JSON.stringify({
    version: 1,
    command:
      profile === 'ops'
        ? 'm4.ops.assign-owner'
        : profile === 'staff'
          ? 'm4.staff.assign-claim'
          : 'm4.legacy.assign-claim',
    operationId,
    claimId: 'claim-1',
    ...(staffId === undefined ? {} : { staffId }),
  });
}
export const observation = JSON.stringify({ ip: '203.0.113.7', userAgent: 'unit' });
export const envelope = (request = command()) =>
  JSON.stringify({
    version: 1,
    request,
    observation,
    observationAuthority: 'untrusted-request-metadata',
  });
