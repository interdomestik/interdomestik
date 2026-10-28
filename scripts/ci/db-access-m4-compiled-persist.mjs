import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Review-only persistence after private validation. Nothing reads this path for acceptance.
export function persistM4CompiledReview(output, assembly, value) {
  const root = fs.realpathSync(output),
    stat = fs.lstatSync(root);
  if (
    root !== path.resolve(output) ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw Error('M4 owned review output required');
  const directory = path.join(root, 'm4-compiled-evidence-' + randomUUID());
  const imageRoot = fs.realpathSync(assembly);
  if (
    directory === imageRoot ||
    directory.startsWith(imageRoot + path.sep) ||
    imageRoot.startsWith(directory + path.sep)
  )
    throw Error('M4 review evidence overlaps execution image');
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, 'summary.json');
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.uid !== process.getuid() ||
      before.nlink !== 1 ||
      before.mode & 0o077 ||
      before.size !== 0
    )
      throw Error('M4 review file custody');
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    const after = fs.fstatSync(fd);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.uid !== before.uid ||
      after.mode !== before.mode ||
      after.nlink !== 1 ||
      after.size !== bytes.length
    )
      throw Error('M4 review file changed');
  } finally {
    fs.closeSync(fd);
  }
  return file;
}
