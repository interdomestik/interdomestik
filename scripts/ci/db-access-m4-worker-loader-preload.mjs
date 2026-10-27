// Fixed built-ins-only source. The hook owns its evidence port; worker application
// code never receives the port or mints a serialized loader receipt.
export const M4_WORKER_LOADER_PRELOAD_SOURCE = String.raw`import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, parentPort, workerData } from 'node:worker_threads';

const fail = reason => { throw new Error('incomplete: M4 worker loader preload ' + reason); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from(workerData?.m4LoaderManifestBase64 ?? '', 'base64');
if (!parentPort || !workerData?.m4LoaderRequired || sha(bytes) !== workerData.m4LoaderManifestSha256)
  fail('manifest transport');
const manifest = JSON.parse(bytes.toString('utf8'));
if (manifest.version !== 1 || manifest.manifestSha256 !== undefined) fail('manifest schema');
const root = path.resolve(manifest.root);
if (fs.realpathSync(root) !== root) fail('noncanonical image root');
const rootStat = fs.lstatSync(root);
if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('image root');
const expected = Object.freeze(manifest.files);
const expectedFiles = new Set(manifest.requiredFiles);
const expectedBuiltins = new Set(manifest.builtins);
const loaded = new Map();
const resolvedBuiltins = new Set();
const inodes = new Map();
let resolveCount = 0, loadCount = 0, sealed = false, sealRequested = false;

const sourceBytes = source => {
  if (typeof source === 'string') return Buffer.from(source);
  if (source instanceof ArrayBuffer) return Buffer.from(source);
  if (ArrayBuffer.isView(source))
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
  fail('opaque loader source');
};
const sameSet = (left, right) =>
  left.size === right.size && [...left].every(value => right.has(value));
const fileRecord = url => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) fail('noncanonical file URL');
  const absolute = path.resolve(fileURLToPath(parsed));
  if (fs.realpathSync(absolute) !== absolute) fail('alias or symlink target');
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) fail('image escape');
  const record = expected[relative];
  if (!record) fail('unknown executable path ' + relative);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('symlink component ' + relative);
    if (cursor === absolute) {
      if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== rootStat.dev)
        fail('non-private executable file ' + relative);
      const inode = String(stat.dev) + ':' + String(stat.ino);
      if (inodes.has(inode) && inodes.get(inode) !== relative) fail('aliased inode');
      inodes.set(inode, relative);
    } else if (!stat.isDirectory()) fail('non-directory component ' + relative);
  }
  return { relative, record };
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (sealed) fail('late resolve');
    resolveCount += 1;
    const result = nextResolve(specifier, context);
    if (!result || typeof result !== 'object' || typeof result.url !== 'string')
      fail('opaque resolve result');
    if (result.url.startsWith('node:')) {
      if (!expectedBuiltins.has(result.url)) fail('unknown builtin ' + result.url);
      resolvedBuiltins.add(result.url);
    } else {
      const { record } = fileRecord(result.url);
      if ((result.format ?? null) !== record.resolveFormat) fail('resolve format mismatch');
    }
    return result;
  },
  load(url, context, nextLoad) {
    if (sealed) fail('late load');
    loadCount += 1;
    const result = nextLoad(url, context);
    if (!result || typeof result !== 'object') fail('opaque load result');
    if (url.startsWith('node:')) {
      if (!expectedBuiltins.has(url)) fail('unknown builtin load ' + url);
      return result;
    }
    const { relative, record } = fileRecord(url);
    const actual = sourceBytes(result.source);
    if (
      (result.format ?? null) !== record.loadFormat ||
      actual.length !== record.bytes ||
      sha(actual) !== record.sha256
    )
      fail('loaded source mismatch ' + relative);
    loaded.set(relative, record.sha256);
    return result;
  },
});

const { port1, port2 } = new MessageChannel();
port1.on('message', request => {
  if (sealRequested || request?.type !== 'M4_LOADER_SEAL' || typeof request.token !== 'string')
    fail('seal protocol');
  sealRequested = true;
  if (!sameSet(new Set(loaded.keys()), expectedFiles)) fail('executable set');
  if (!sameSet(resolvedBuiltins, expectedBuiltins)) fail('builtin set');
  sealed = true;
  port1.postMessage({
    type: 'M4_LOADER_SEALED', token: request.token,
    sessionId: manifest.sessionId, launchId: manifest.launchId,
    role: manifest.role, index: manifest.index, binding: manifest.binding,
    eventDigest: manifest.eventDigest, policyDigest: manifest.policyDigest,
    imageDigest: manifest.imageDigest, contractDigest: manifest.contractDigest,
    preloadDigest: manifest.preloadDigest,
    filesDigest: sha(JSON.stringify([...loaded].sort())), fileCount: loaded.size,
    builtinDigest: sha(JSON.stringify([...resolvedBuiltins].sort())),
    resolveCount, loadCount,
  });
});
port1.unref();
parentPort.postMessage(
  { type: 'M4_LOADER_PORT', sessionId: manifest.sessionId, launchId: manifest.launchId,
    role: manifest.role, index: manifest.index, binding: manifest.binding, port: port2 },
  [port2]
);
`;

export const m4WorkerLoaderPreloadUrl = () =>
  `data:text/javascript;base64,${Buffer.from(M4_WORKER_LOADER_PRELOAD_SOURCE).toString('base64')}`;
