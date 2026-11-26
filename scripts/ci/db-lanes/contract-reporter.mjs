import { relative, resolve } from 'node:path';

export default async function* report(source) {
  const root = process.cwd();
  // The shard passes explicit filenames. A testless file has no per-file summary.
  const executed = new Map(process.argv.slice(1).map(file => [resolve(root, file), 0]));
  for await (const { type, data } of source) {
    if (type === 'test:summary' && executed.has(data.file)) {
      executed.set(data.file, data.counts.passed + data.counts.failed);
    }
  }
  for (const [file, count] of executed) {
    if (count > 0) continue;
    process.exitCode = 1;
    yield `no executed cases: ${relative(root, file)}\n`;
  }
}
