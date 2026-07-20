import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// prettier-ignore
import { CallbackPlanFault, type CallbackSourceBinding, type CallbackSourceHandle, type CallbackSourceOps, type CallbackSourceStat } from './migration-callback-plan-contracts';
// prettier-ignore
import { CALLBACK_SOURCE_MANIFEST, MAX_CALLBACK_SOURCE_BYTES } from './migration-callback-plan-manifest';
const R = 'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED';
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
function same(left: CallbackSourceStat, right: CallbackSourceStat): boolean {
  // prettier-ignore
  return left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.isFile === right.isFile;
}
function rejected(): never {
  throw new CallbackPlanFault(R);
}
async function readBoundSource(path: string, ops: Readonly<CallbackSourceOps>) {
  let handle: CallbackSourceHandle | undefined, bytes: Uint8Array | undefined, fault: unknown;
  try {
    const before = await ops.lstat(path);
    // prettier-ignore
    if (!before.isFile || before.size < 0n || before.size > MAX_CALLBACK_SOURCE_BYTES || before.size > BigInt(Number.MAX_SAFE_INTEGER)) rejected();
    if ((await ops.realpath(path)) !== path) rejected();
    handle = await ops.open(path);
    if (!same(before, await handle.stat())) rejected();
    bytes = new Uint8Array(Number(before.size));
    if ((await handle.read(bytes, 0, bytes.length, 0)) !== bytes.length) rejected();
    if ((await handle.read(new Uint8Array(1), 0, 1, bytes.length)) !== 0) rejected();
    // prettier-ignore
    const [descriptor, after, resolved] = await Promise.all([handle.stat(), ops.lstat(path), ops.realpath(path)]);
    if (!same(before, descriptor) || !same(before, after) || resolved !== path) rejected();
  } catch (error) {
    fault = error;
  } finally {
    if (handle)
      try {
        await handle.close();
      } catch {
        fault = new CallbackPlanFault('MIGRATION_CALLBACK_CLEANUP_FAILED');
      }
  }
  // prettier-ignore
  if (fault) throw fault instanceof CallbackPlanFault ? fault : new CallbackPlanFault(R);
  if (!bytes) rejected();
  return bytes;
}
async function bindExpectedSource(
  expected: (typeof CALLBACK_SOURCE_MANIFEST)[number],
  ops: Readonly<CallbackSourceOps>
) {
  const url = new URL(await ops.resolve(expected.specifier));
  if (url.protocol !== 'file:' || url.search || url.hash) rejected();
  const path = fileURLToPath(url),
    root = path.slice(0, -expected.suffix.length - 1);
  if (
    basename(root) !== 'drizzle-orm' ||
    join(root, ...expected.suffix.split('/')) !== path ||
    (await ops.realpath(path)) !== path
  )
    rejected();
  const bytes = await readBoundSource(path, ops),
    hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected.sha256) rejected();
  return {
    root,
    hash,
    url: url.href,
    moduleUrl: `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`,
  };
}
export async function verifyMigrationCallbackSources(
  ops: Readonly<CallbackSourceOps> = CALLBACK_SOURCE_OPS,
  loadReader = true
): Promise<CallbackSourceBinding> {
  try {
    if (!Number.isFinite(ops.noFollowFlag) || ops.noFollowFlag === 0) rejected();
    const hashes: string[] = [],
      urls: string[] = [];
    let packageRoot: string | undefined, readerUrl: string | undefined;
    for (const expected of CALLBACK_SOURCE_MANIFEST) {
      const source = await bindExpectedSource(expected, ops);
      if (packageRoot !== undefined && source.root !== packageRoot) rejected();
      if (readerUrl === undefined) readerUrl = source.moduleUrl;
      packageRoot = source.root;
      hashes.push(source.hash);
      urls.push(source.url);
    }
    let reader = null;
    if (loadReader) {
      const namespace = await ops.importModule(readerUrl!);
      // prettier-ignore
      if (!namespace || typeof namespace !== 'object' || Object.getOwnPropertyNames(namespace).length !== 1 || !Object.hasOwn(namespace, 'readMigrationFiles') || typeof (namespace as { readMigrationFiles?: unknown }).readMigrationFiles !== 'function') rejected();
      reader = (namespace as { readMigrationFiles: CallbackSourceBinding['reader'] })
        .readMigrationFiles;
    }
    // prettier-ignore
    return Object.freeze({ packageRoot: packageRoot!, hashes: Object.freeze(hashes), urls: Object.freeze(urls), reader });
  } catch (error) {
    if (error instanceof CallbackPlanFault) throw error;
    throw new CallbackPlanFault(R);
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
