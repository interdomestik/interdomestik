import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function hashFile(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const hash = createHash('sha256'),
    chunk = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null))) hash.update(chunk.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}
export function census(root) {
  const rows = {};
  let count = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
      const rel = path.posix.join(dir, name);
      const file = path.join(root, rel),
        stat = fs.lstatSync(file);
      if (rel === '.next/cache') {
        if (!stat.isDirectory() || fs.realpathSync(file) !== file)
          throw Error('Declared cache path refused');
        continue;
      }
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(file),
          physical = fs.realpathSync(file);
        if (path.isAbsolute(target) || !physical.startsWith(root + path.sep))
          throw Error('Installed image link escaped');
        rows[rel] = { kind: 'link', target };
      } else if (stat.isDirectory()) walk(rel);
      else if (stat.isFile())
        rows[rel] = {
          kind: 'file',
          bytes: stat.size,
          mode: stat.mode & 0o777,
          executable: Boolean(stat.mode & 0o111),
          sha256: hashFile(file),
        };
      else throw Error('Installed image filesystem kind refused');
      if (++count > 100000) throw Error('Installed image census cap');
    }
  }
  walk('');
  return rows;
}
export function verifyImage(root) {
  const manifestFile = path.join(root, 'm4-build-image.json');
  const expected = process.env.M4_COMPILED_IMAGE_MANIFEST_SHA256;
  const value = readPinned(manifestFile, expected, 32 * 1024 * 1024),
    actual = census(root);
  delete actual['m4-build-image.json'];
  if (
    JSON.stringify(actual) !== JSON.stringify(value.files) ||
    value.nextVersion !== '16.4.3' ||
    value.node?.version !== process.version ||
    value.node?.executableSha256 !== hashFile(process.execPath)
  )
    throw Error('Built image changed');
  return value;
}
export function readOwned(file, limit, privateFile = false) {
  if (!file || fs.realpathSync(file) !== file) throw Error('Physical startup file required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const a = fs.fstatSync(fd);
    if (
      !a.isFile() ||
      a.uid !== process.getuid() ||
      a.mode & (privateFile ? 0o077 : 0o022) ||
      a.size < 1 ||
      a.size > limit
    )
      throw Error('Owned startup file refused');
    const bytes = Buffer.alloc(a.size + 1),
      n = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const b = fs.fstatSync(fd);
    if (n !== a.size || a.size !== b.size || a.mtimeMs !== b.mtimeMs || a.ctimeMs !== b.ctimeMs)
      throw Error('Startup file changed');
    return bytes.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// Hash and parse exactly the bytes read from one no-follow descriptor.
export function readPinned(file, expected, limit) {
  if (!/^[a-f0-9]{64}$/u.test(expected ?? ''))
    throw Error('Externally pinned build manifest required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const a = fs.fstatSync(fd);
    if (!a.isFile() || a.size < 1 || a.size > limit) throw Error('Build manifest refused');
    const bytes = Buffer.alloc(a.size + 1);
    const n = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const b = fs.fstatSync(fd);
    if (
      n !== a.size ||
      a.dev !== b.dev ||
      a.ino !== b.ino ||
      a.size !== b.size ||
      a.mtimeMs !== b.mtimeMs ||
      a.ctimeMs !== b.ctimeMs
    )
      throw Error('Build manifest changed');
    const value = bytes.subarray(0, n);
    if (createHash('sha256').update(value).digest('hex') !== expected)
      throw Error('Externally pinned build manifest required');
    return JSON.parse(value.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}
