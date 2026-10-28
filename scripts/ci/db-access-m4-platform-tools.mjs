import fs from 'node:fs';
import path from 'node:path';
import { sha, readFixed } from './db-access-m4-platform-custody.mjs';
const fixedBytes = readFixed(path.join(import.meta.dirname, 'db-access-m4-platform-tools.json'));
if (sha(fixedBytes) !== 'cbf94dfd6afdbb9aa0b31ebcbf68061bd952c43679b79ee17809b5efb18f0898')
  throw Error('Fixed native tool descriptor bytes changed');
const fixed = JSON.parse(fixedBytes);
export const platformTools = Object.freeze({ ...fixed.tools });
export const platformPythonPrefix = fixed.pythonPrefix;
export function verifyPlatformTools() {
  if (
    process.platform !== 'darwin' ||
    process.arch !== 'arm64' ||
    process.version !== 'v24.15.0' ||
    fs.realpathSync(process.execPath) !== platformTools.node
  )
    throw Error('Fixed platform required');
  for (const [logical, physical] of Object.entries(fixed.resolutions))
    if (fs.realpathSync(logical) !== physical) throw Error('Fixed native tool resolution changed');
  for (const [file, record] of Object.entries(fixed.records)) {
    if (fs.realpathSync(file) !== file) throw Error('Tool physical identity changed');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = fs.fstatSync(fd),
        bytes = fs.readFileSync(fd),
        after = fs.fstatSync(fd);
      if (
        !before.isFile() ||
        before.mode & 0o022 ||
        bytes.length !== record.bytes ||
        sha(bytes) !== record.sha256 ||
        ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode'].some(key => before[key] !== after[key])
      )
        throw Error('Fixed platform tool changed');
    } finally {
      fs.closeSync(fd);
    }
  }
  const rows = {};
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === 'site-packages') continue;
      const file = path.join(directory, name),
        relative = path.relative(fixed.pythonStdlib.root, file);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        if (!fs.realpathSync(file).startsWith(fixed.pythonPrefix + '/'))
          throw Error('Python link escaped');
        rows[relative] = { kind: 'link', target: fs.readlinkSync(file) };
      } else if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        rows[relative] = {
          sha256: sha(fs.readFileSync(file)),
          bytes: stat.size,
          mode: stat.mode & 0o777,
        };
      } else throw Error('Python stdlib kind refused');
    }
  }
  walk(fixed.pythonStdlib.root);
  const sorted = Object.fromEntries(
    Object.entries(rows).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  if (
    Object.keys(sorted).length !== fixed.pythonStdlib.records ||
    sha(JSON.stringify(sorted)) !== fixed.pythonStdlib.sha256
  )
    throw Error('Fixed isolated Python stdlib changed');
  return Object.freeze({
    records: Object.keys(fixed.records).length,
    digest: sha(JSON.stringify(fixed)),
    systemSharedCacheTrusted: true,
  });
}
