// This builtin-only bootstrap itself must come from the protected source, like the existing workflow bootstrap.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import {
  authenticateM4CompiledProducer,
  readM4OwnedProducerFile,
} from './db-access-m4-compiled-producer-auth.mjs';
const admissions = new WeakMap(),
  importing = new Set(),
  modules = new Map(),
  imageDigests = new Map();
const fail = () => {
  throw Error('M4 compiled entry requires actual protected producer admission');
};
let active = false;
export function assertM4CompiledModuleAdmission(url) {
  if (!importing.has(url)) fail();
}
export function assertM4CompiledInvocation(admission, url, producer, context) {
  const state = admissions.get(admission);
  if (
    !state ||
    state.url !== url ||
    state.auth.root !== producer ||
    JSON.stringify(state.auth.context) !== JSON.stringify(context)
  )
    fail();
  return Object.freeze({
    startedAt: state.startedAt,
    deadlineAt: state.deadlineAt,
  });
}
export async function executeM4CompiledRuntime(options) {
  if (active) fail();
  if (path.resolve(options.producer) !== path.resolve(import.meta.dirname, '../..')) fail();
  active = true;
  const startedAt = performance.now(),
    deadlineAt = startedAt + 300000;
  let hook, token, url;
  try {
    // No policy/parser/materializer/entry import occurs before this entire physical closure check.
    const captured = { ...options, context: structuredClone(options.context) };
    const auth = authenticateM4CompiledProducer({ ...captured, deadlineAt });
    url = pathToFileURL(path.join(auth.root, 'scripts/ci/db-access-m4-compiled-runtime.mjs')).href;
    if (imageDigests.has(url) && imageDigests.get(url) !== auth.digest) fail();
    const check = target => {
      const file = fileURLToPath(target),
        relative = path.relative(auth.root, file);
      if (!auth.records[relative] || path.isAbsolute(relative) || relative.startsWith('../'))
        fail();
      return readM4OwnedProducerFile(auth.root, relative, auth.records[relative]);
    };
    const jsonImporter = pathToFileURL(
      path.join(auth.root, 'scripts/ci/db-access-m4-compiled-source.mjs')
    ).href;
    const jsonTarget = pathToFileURL(
      path.join(auth.root, 'scripts/ci/db-access-m4-compiled-contract.json')
    ).href;
    const jsonAttributes = attributes =>
      attributes && Object.keys(attributes).join('|') === 'type' && attributes.type === 'json';
    let jsonResolved = false;
    hook = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('node:')) return nextResolve(specifier, context);
        const resolved = nextResolve(specifier, context);
        if (resolved.url.startsWith('node:')) return resolved;
        if (resolved.url === jsonTarget) {
          if (
            context.parentURL !== jsonImporter ||
            specifier !== './db-access-m4-compiled-contract.json' ||
            !jsonAttributes(context.importAttributes)
          )
            fail();
          check(resolved.url);
          jsonResolved = true;
        } else if (resolved.format === 'json' || resolved.url.endsWith('.json')) fail();
        if (
          context.parentURL?.startsWith(pathToFileURL(auth.root).href + '/') ||
          resolved.url.startsWith(pathToFileURL(auth.root).href + '/')
        )
          check(resolved.url);
        return resolved;
      },
      load(target, context, nextLoad) {
        if (target.startsWith('node:')) return nextLoad(target, context);
        const isFixedJson = target === jsonTarget;
        if (isFixedJson && (!jsonResolved || !jsonAttributes(context.importAttributes))) fail();
        const before = check(target),
          loaded = nextLoad(target, context),
          after = check(target);
        if (!before.equals(after)) fail();
        if (loaded.source == null || !Buffer.from(loaded.source).equals(before)) fail();
        const relative = path.relative(auth.root, fileURLToPath(target));
        if (
          isFixedJson
            ? loaded.format !== 'json'
            : relative.endsWith('.mjs')
              ? loaded.format !== 'module'
              : !(
                  relative.startsWith('node_modules/typescript/') &&
                  relative.endsWith('.js') &&
                  loaded.format === 'commonjs'
                )
        )
          fail();
        return loaded;
      },
    });
    token = Object.freeze({});
    admissions.set(token, { auth, url, startedAt, deadlineAt });
    importing.add(url);
    imageDigests.set(url, auth.digest);
    const namespace = await import(url);
    modules.set(url, namespace);
    importing.delete(url);
    return await namespace.runM4CompiledRuntime(captured, token);
  } finally {
    if (url) importing.delete(url);
    if (token) admissions.delete(token);
    hook?.deregister();
    active = false;
  }
}
export const isFreshM4CompiledRuntimeResult = value =>
  [...modules.values()].some(module => module.isFreshM4CompiledRuntimeResult(value));
export const hasM4CompiledRuntimeBinding = (value, context, policy) =>
  [...modules.values()].some(module => module.hasM4CompiledRuntimeBinding(value, context, policy));
export function assertM4CompiledRuntimeImageRecords(value, context, policy) {
  for (const module of modules.values())
    if (module.hasM4CompiledRuntimeBinding(value, context, policy))
      return module.assertM4CompiledRuntimeImageRecords(value, context, policy);
  fail();
}

export function takeM4CompiledRuntimeForJoin(value, context, policy) {
  for (const module of modules.values())
    if (module.hasM4CompiledRuntimeBinding(value, context, policy))
      return module.takeM4CompiledRuntimeForJoin(value, context, policy);
  fail();
}
