// Fixed qualification-only Node24.15 synchronous image check; parent pins this file before evaluation.
// This is explicit load instrumentation, not the existing native/59-file loader realm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks, isBuiltin } from 'node:module';
const descriptorFile = process.env.M4_PLATFORM_IMAGE_DESCRIPTOR;
const descriptorStat = fs.lstatSync(descriptorFile);
if (
  !descriptorStat.isFile() ||
  descriptorStat.uid !== process.getuid() ||
  descriptorStat.mode & 0o077 ||
  descriptorStat.nlink !== 1 ||
  descriptorStat.size > 16384 ||
  fs.realpathSync(descriptorFile) !== descriptorFile
)
  throw Error('Private parent image descriptor required');
const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
if (
  Object.keys(descriptor).sort().join('|') !== 'manifestSha256|root' ||
  !path.isAbsolute(descriptor.root) ||
  !/^[a-f0-9]{64}$/u.test(descriptor.manifestSha256)
)
  throw Error('Fixed image descriptor shape');
const root = descriptor.root,
  pin = descriptor.manifestSha256;
const chunk = Buffer.alloc(1024 * 1024);
function digest(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const a = fs.fstatSync(fd),
      hash = createHash('sha256');
    if (!a.isFile()) throw Error('Image module not regular');
    let n;
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null))) hash.update(chunk.subarray(0, n));
    const b = fs.fstatSync(fd);
    if (a.ino !== b.ino || a.size !== b.size || a.mtimeMs !== b.mtimeMs || a.ctimeMs !== b.ctimeMs)
      throw Error('Image module changed during read');
    return { hash: hash.digest('hex'), bytes: b.size, mode: b.mode & 0o777 };
  } finally {
    fs.closeSync(fd);
  }
}
if (
  process.version !== 'v24.15.0' ||
  fs.realpathSync(root) !== root ||
  process.env.NODE_OPTIONS ||
  process.env.NODE_PATH
)
  throw Error('Fixed image bootstrap required');
const manifestFile = path.join(root, 'm4-build-image.json'),
  stat = fs.lstatSync(manifestFile);
if (!stat.isFile() || stat.size > 32 * 1024 * 1024 || digest(manifestFile).hash !== pin)
  throw Error('Actual built image pin refused');
const image = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (
  image.node.executableSha256 !== digest(process.execPath).hash ||
  image.node.version !== process.version
)
  throw Error('Actual Node image mismatch');
const physical = new Map();
for (const [relative, row] of Object.entries(image.files))
  if (row.kind === 'file') {
    const file = path.resolve(root, relative);
    if (
      !file.startsWith(root + path.sep) ||
      relative === '.next/cache' ||
      relative.startsWith('.next/cache/')
    )
      throw Error('Manifest module scope refused');
    physical.set(file, row);
  }
function verify(url) {
  if (isBuiltin(url)) return;
  if (!url.startsWith('file:')) throw Error('Unsealed module protocol refused');
  const logical = fileURLToPath(url),
    file = fs.realpathSync(logical),
    row = physical.get(file);
  if (!row) throw Error('Unsealed image module refused');
  const actual = digest(file);
  if (actual.hash !== row.sha256 || actual.bytes !== row.bytes || actual.mode !== row.mode)
    throw Error('Sealed image module changed');
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    verify(result.url);
    return result;
  },
  load(url, context, nextLoad) {
    verify(url);
    const result = nextLoad(url, context);
    verify(url);
    return result;
  },
});
// The deregistration handle is never exposed. Existing Node results/formats/source are not replaced.
