import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CallbackPlanFault,
  type CallbackSourceHandle,
  type CallbackSourceOps,
  type CallbackSourceStat,
} from './migration-callback-plan-contracts';
import { MAX_CALLBACK_SOURCE_BYTES } from './migration-callback-plan-manifest';

function same(left: CallbackSourceStat, right: CallbackSourceStat): boolean {
  // prettier-ignore
  return left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.isFile === right.isFile;
}
function rejected(): never {
  throw new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
}

async function readBoundSource(
  path: string,
  ops: Readonly<CallbackSourceOps>
): Promise<Uint8Array> {
  let handle: CallbackSourceHandle | undefined;
  let bytes: Uint8Array | undefined;
  let fault: unknown;
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
  if (fault) throw fault instanceof CallbackPlanFault ? fault : new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
  if (!bytes) rejected();
  return bytes;
}
function toModuleUrl(bytes: Uint8Array): string {
  return `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`;
}

export async function bindExpectedSource(
  expected: Readonly<{ specifier: string; suffix: string; sha256: string }>,
  ops: Readonly<CallbackSourceOps>
): Promise<Readonly<{ root: string; hash: string; url: string; moduleUrl: string }>> {
  const url = new URL(await ops.resolve(expected.specifier));
  if (url.protocol !== 'file:' || url.search || url.hash) rejected();
  const path = fileURLToPath(url);
  const root = path.slice(0, -expected.suffix.length - 1);
  if (
    basename(root) !== 'drizzle-orm' ||
    join(root, ...expected.suffix.split('/')) !== path ||
    (await ops.realpath(path)) !== path
  )
    rejected();
  const bytes = await readBoundSource(path, ops);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected.sha256) rejected();
  return Object.freeze({ root, hash, url: url.href, moduleUrl: toModuleUrl(bytes) });
}
