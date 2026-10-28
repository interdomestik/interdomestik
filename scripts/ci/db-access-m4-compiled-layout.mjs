import fs from 'node:fs';
import path from 'node:path';
const names = [
  'next-cache',
  'next-logs',
  'browser-output',
  'browser-profiles',
  'next-inputs',
  'browser-inputs',
  'backend-inputs',
  'driver-evidence',
];
function owned(directory) {
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(directory) !== directory ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw Error('M4 private compiled directory required');
}
export function createM4CompiledLayout(workRoot, backendRoot) {
  owned(workRoot);
  const backend = fs.realpathSync(backendRoot);
  if (
    workRoot === backend ||
    workRoot.startsWith(backend + path.sep) ||
    backend.startsWith(workRoot + path.sep)
  )
    throw Error('M4 compiled image and writable paths overlap');
  if (fs.readdirSync(workRoot).length) throw Error('M4 fresh compiled layout required');
  const layout = {};
  for (const name of names) {
    const directory = path.join(workRoot, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    owned(directory);
    layout[name] = directory;
  }
  // Actual OS enforcement remains mandatory in the fixed platform. Distinct directories alone
  // are not a same-UID boundary. No Next launch descriptor receives driver evidence authority.
  return Object.freeze(layout);
}
