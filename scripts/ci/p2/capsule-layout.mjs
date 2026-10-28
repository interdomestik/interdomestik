import fs from 'node:fs';
import path from 'node:path';
import layout from './capsule-layout.json' with { type: 'json' };

// Producer paths may separate generated files; image paths and bytes stay explicit.
export function materializeP2Capsule(producerRoot, target) {
  if (fs.existsSync(target)) throw Error('Fresh capsule materialization required');
  const entries = Object.entries(layout);
  for (const [destination, source] of entries) {
    if (path.basename(destination) !== destination || !/^capsule\/(?:dist\/)?[^/]+$/u.test(source))
      throw Error('Invalid fixed capsule layout');
    const full = path.join(producerRoot, source);
    if (!fs.lstatSync(full).isFile() || fs.realpathSync(full) !== full)
      throw Error('Capsule source symlink/nonfile');
  }
  fs.mkdirSync(target, { mode: 0o700 });
  for (const [destination, source] of entries) {
    fs.copyFileSync(
      path.join(producerRoot, source),
      path.join(target, destination),
      fs.constants.COPYFILE_EXCL
    );
    // Match the fixed readable, non-executable file mode in the Linux image.
    fs.chmodSync(path.join(target, destination), 0o644);
  }
  return target;
}
