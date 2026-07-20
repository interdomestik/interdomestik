import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// prettier-ignore
import { CallbackPlanFault, type CallbackSourceBinding, type CallbackSourceHandle, type CallbackSourceOps, type CallbackSourceStat } from './migration-callback-plan-contracts';
import { bindExpectedSource } from './migration-callback-bound-source';
import { CALLBACK_SOURCE_MANIFEST } from './migration-callback-plan-manifest';
function convert(value: Awaited<ReturnType<typeof lstat>>): CallbackSourceStat {
  // prettier-ignore
  const item = value as typeof value & { dev: bigint; ino: bigint; nlink: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint };
  // prettier-ignore
  return Object.freeze({ dev: item.dev, ino: item.ino, nlink: item.nlink, size: item.size, mtimeNs: item.mtimeNs, ctimeNs: item.ctimeNs, isFile: item.isFile() });
}
const requireFromHere = createRequire(import.meta.url);
export function resolveCallbackSource(
  specifier: string,
  nativeResolve: ((value: string) => string) | undefined = typeof import.meta.resolve === 'function'
    ? import.meta.resolve.bind(import.meta)
    : undefined,
  requireResolve: (value: string) => string = requireFromHere.resolve.bind(requireFromHere)
): string {
  if (!CALLBACK_SOURCE_MANIFEST.some(item => item.specifier === specifier)) rejected();
  if (nativeResolve) return nativeResolve(specifier);
  const resolved = requireResolve(specifier);
  return pathToFileURL(resolved.endsWith('.cjs') ? `${resolved.slice(0, -4)}.js` : resolved).href;
}
export const CALLBACK_SOURCE_OPS: Readonly<CallbackSourceOps> = Object.freeze({
  noFollowFlag: typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0,
  resolve: resolveCallbackSource,
  realpath,
  lstat: async (path: string) => convert(await lstat(path, { bigint: true })),
  open: async (path: string) => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    return {
      stat: async () => convert((await handle.stat({ bigint: true })) as never),
      read: async (target, offset, length, position) =>
        (await handle.read(target, offset, length, position)).bytesRead,
      close: () => handle.close(),
    } satisfies CallbackSourceHandle;
  },
  importModule: (url: string) => import(url),
});
function rejected(): never {
  throw new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
}

export async function verifyMigrationCallbackSources(
  ops: Readonly<CallbackSourceOps> = CALLBACK_SOURCE_OPS,
  loadReader = true
): Promise<CallbackSourceBinding> {
  try {
    if (!Number.isFinite(ops.noFollowFlag) || ops.noFollowFlag === 0) rejected();
    const hashes: string[] = [],
      urls: string[] = [];
    let moduleUrl: string | undefined, packageRoot: string | undefined;
    for (const expected of CALLBACK_SOURCE_MANIFEST) {
      const source = await bindExpectedSource(expected, ops);
      if (packageRoot !== undefined && source.root !== packageRoot) rejected();
      if (moduleUrl === undefined) moduleUrl = source.moduleUrl;
      packageRoot = source.root;
      hashes.push(source.hash);
      urls.push(source.url);
    }
    let reader = null;
    if (loadReader) {
      const namespace = await ops.importModule(moduleUrl!);
      // prettier-ignore
      if (!namespace || typeof namespace !== 'object' || Object.getOwnPropertyNames(namespace).length !== 1 || !Object.hasOwn(namespace, 'readMigrationFiles') || typeof (namespace as { readMigrationFiles?: unknown }).readMigrationFiles !== 'function') rejected();
      reader = (namespace as { readMigrationFiles: CallbackSourceBinding['reader'] })
        .readMigrationFiles;
    }
    // prettier-ignore
    return Object.freeze({ packageRoot: packageRoot!, hashes: Object.freeze(hashes), urls: Object.freeze(urls), reader });
  } catch (error) {
    if (error instanceof CallbackPlanFault) throw error;
    throw new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
  }
}

export async function recheckMigrationCallbackSources(
  prior: CallbackSourceBinding,
  ops?: Readonly<CallbackSourceOps>
): Promise<void> {
  const next = await verifyMigrationCallbackSources(ops, false);
  // prettier-ignore
  if (next.packageRoot !== prior.packageRoot || next.hashes.some((hash, index) => hash !== prior.hashes[index])) rejected();
}
