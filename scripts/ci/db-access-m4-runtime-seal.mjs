import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const fail = reason => {
  throw Error('M4 runtime image refused: ' + reason);
};
export function sealM4Image(root) {
  const base = fs.realpathSync(root),
    records = {};
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, name),
        relative = path.relative(base, full),
        stat = fs.lstatSync(full);
      // Fixed output-only directories are created empty; never module/package/source inputs.
      if (relative === 'results') continue;
      if (['home', 'tmp'].includes(relative) && fs.readdirSync(full).length)
        fail('unexpected writable image input');
      if (stat.isSymbolicLink()) {
        const target = fs.realpathSync(full);
        if (!target.startsWith(base + path.sep)) fail('escaping link');
        records[relative] = { link: fs.readlinkSync(full) };
      } else if (stat.isDirectory()) {
        records[relative] = { directory: true, mode: stat.mode & 0o777 };
        visit(full);
      } else if (stat.isFile()) {
        const fd = fs.openSync(full, 'r'),
          digest = createHash('sha256'),
          buffer = Buffer.alloc(65536);
        try {
          let n;
          while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
            digest.update(buffer.subarray(0, n));
        } finally {
          fs.closeSync(fd);
        }
        records[relative] = {
          bytes: stat.size,
          mode: stat.mode & 0o777,
          sha256: digest.digest('hex'),
        };
      } else fail('non-file input');
    }
  }
  visit(base);
  return { records, digest: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
}
export function assertM4ImageUnchanged(root, before) {
  const after = sealM4Image(root);
  if (after.digest !== before.digest) fail('postexecution source/package/compiler drift');
  return after;
}
