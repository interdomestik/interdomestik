import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const LABELS = Object.freeze({
  'com.interdomestik.slice': 'IDA-UI03a2-P0a2a',
  'com.interdomestik.owner': 'migration-runtime-role-fixture',
});
const RECEIPTS = join(tmpdir(), 'interdomestik-p0a2a-receipts');
interface Identity {
  id: string;
  name: string;
}
export interface LifecycleCleanup {
  container_removed: true;
  receipt_removed: true;
}
// prettier-ignore
export interface RuntimeRoleLifecycleOps { docker(args:string[]):Promise<string>; persist(path:string,value:object):Promise<void>; discard(path:string):Promise<void>; suffix():string }

async function persist(path: string, value: object): Promise<void> {
  await mkdir(RECEIPTS, { recursive: true, mode: 0o700 });
  await chmod(RECEIPTS, 0o700);
  const next = `${path}.next`;
  await writeFile(next, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(next, path);
}
const REAL: RuntimeRoleLifecycleOps = Object.freeze({
  docker: async args => (await exec('docker', args, { timeout: 60_000 })).stdout.trim(),
  persist,
  discard: path => rm(path),
  suffix: () => randomBytes(8).toString('hex'),
});
const fixed = (error: unknown, fallback: string) => {
  const value = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z0-9_]+$/u.test(value) ? value : fallback;
};
const aborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error('CONTAINER_ABORTED');
};

async function inspect(ops: RuntimeRoleLifecycleOps, target: string): Promise<Identity | null> {
  try {
    const value = await ops.docker([
      'inspect',
      '--format',
      '{{.Id}} {{.Name}} {{index .Config.Labels "com.interdomestik.slice"}} {{index .Config.Labels "com.interdomestik.owner"}}',
      target,
    ]);
    const [id, rawName, slice, owner] = value.split(' ');
    if (
      !id ||
      !rawName ||
      slice !== LABELS['com.interdomestik.slice'] ||
      owner !== LABELS['com.interdomestik.owner']
    )
      throw new Error('CONTAINER_IDENTITY_UNRESOLVED');
    return { id, name: rawName.replace(/^\//u, '') };
  } catch (error) {
    if ((error as { stderr?: string }).stderr?.toLowerCase().includes('no such object'))
      return null;
    throw new Error('CONTAINER_IDENTITY_UNRESOLVED');
  }
}
async function remove(ops: RuntimeRoleLifecycleOps, identity: Identity, receipt: string) {
  try {
    await ops.docker(['rm', '--force', identity.id]);
  } catch {
    if (await inspect(ops, identity.id)) throw new Error('CONTAINER_CLEANUP_FAILED');
  }
  if (await inspect(ops, identity.id)) throw new Error('CONTAINER_CLEANUP_FAILED');
  await ops.discard(receipt).catch(() => {
    throw new Error('CONTAINER_CLEANUP_FAILED');
  });
  return { container_removed: true as const, receipt_removed: true as const };
}
async function run<T>(
  signal: AbortSignal,
  operation: (port: number) => Promise<T>,
  ops: RuntimeRoleLifecycleOps
) {
  aborted(signal);
  const suffix = ops.suffix(),
    name = `ida-p0a2a-${suffix}`;
  const receipt = join(RECEIPTS, `${suffix}.json`);
  try {
    await ops.persist(receipt, { state: 'planned', name, labels: LABELS });
  } catch {
    throw new Error('CONTAINER_RECEIPT_WRITE_FAILED');
  }
  let identity: Identity | null = null;
  try {
    try {
      const id = await ops.docker([
        'create',
        '--name',
        name,
        '--label',
        `com.interdomestik.slice=${LABELS['com.interdomestik.slice']}`,
        '--label',
        `com.interdomestik.owner=${LABELS['com.interdomestik.owner']}`,
        '--env',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '--publish',
        '127.0.0.1::5432',
        'postgres:16',
      ]);
      identity = await inspect(ops, id);
    } catch {
      identity = await inspect(ops, name);
      if (!identity) throw new Error('CONTAINER_IDENTITY_UNRESOLVED');
      await ops.persist(receipt, { state: 'created', ...identity, labels: LABELS }).catch(() => {
        throw new Error('CONTAINER_RECEIPT_WRITE_FAILED');
      });
      throw new Error('CONTAINER_CREATE_FAILED');
    }
    if (!identity || identity.name !== name) throw new Error('CONTAINER_IDENTITY_UNRESOLVED');
    await ops.persist(receipt, { state: 'created', ...identity, labels: LABELS }).catch(() => {
      throw new Error('CONTAINER_RECEIPT_WRITE_FAILED');
    });
    aborted(signal);
    await ops.docker(['start', identity.id]);
    aborted(signal);
    const binding = await ops.docker(['port', identity.id, '5432/tcp']);
    const port = Number(binding.split(':').at(-1));
    if (!Number.isInteger(port) || port < 1 || port > 65_535)
      throw new Error('CONTAINER_PORT_REJECTED');
    aborted(signal);
    const value = await operation(port);
    aborted(signal);
    return { value, cleanup: await remove(ops, identity, receipt) };
  } catch (error) {
    if (!identity) throw new Error(fixed(error, 'CONTAINER_OPERATION_FAILED'));
    try {
      await remove(ops, identity, receipt);
    } catch {
      throw new Error('CONTAINER_CLEANUP_FAILED');
    }
    throw new Error(fixed(error, 'CONTAINER_OPERATION_FAILED'));
  }
}
// prettier-ignore
export const withRuntimeRoleContainer=<T>(signal:AbortSignal,operation:(port:number)=>Promise<T>)=>run(signal,operation,REAL);
// prettier-ignore
export const testRuntimeRoleContainer=<T>(signal:AbortSignal,operation:(port:number)=>Promise<T>,ops:RuntimeRoleLifecycleOps)=>run(signal,operation,ops);
