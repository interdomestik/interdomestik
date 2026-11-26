import { realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// The report path comes from the lane runner's environment. Accept only a .json file
// under the system temp dir or the repository root, checked on the resolved path (CodeQL
// js/path-injection): anything else is refused rather than written.
function reportPath(value, root) {
  if (typeof value !== 'string' || !isAbsolute(value) || !value.endsWith('.json')) {
    throw new TypeError('DB_LANES_REPORT must be an absolute .json path');
  }
  // Canonicalize the parent (no symlinked directory can redirect the write), then check the exact
  // value that is written.
  const target = join(realpathSync(dirname(resolve(value))), basename(value));
  const bases = [realpathSync(tmpdir()), realpathSync(root)];
  if (!bases.some(base => target.startsWith(base + sep))) {
    throw new TypeError('DB_LANES_REPORT must be inside the temp directory or the repository');
  }
  return target;
}

export default class DatabaseLaneReporter {
  onTestRunEnd(modules, unhandledErrors, reason) {
    const files = modules.map(module => {
      const result = {
        file: relative(process.env.DB_LANES_ROOT, module.moduleId),
        passed: 0,
        failed: 0,
        skipped: 0,
        todo: 0,
        cancelled: 0,
        retried: 0,
      };
      for (const test of module.children.allTests()) {
        const { state } = test.result();
        if (test.diagnostic()?.retryCount > 0) result.retried += 1;
        if (test.options.mode === 'todo') result.todo += 1;
        else if (state === 'pending') result.cancelled += 1;
        else result[state] += 1;
      }
      return result;
    });
    const complete = reason === 'passed' && unhandledErrors.length === 0;
    writeFileSync(
      reportPath(process.env.DB_LANES_REPORT, process.env.DB_LANES_ROOT),
      JSON.stringify({ complete, files }),
      // Exclusive create: never follow or replace an existing file or symlink at that name.
      { flag: 'wx' }
    );
  }
}
