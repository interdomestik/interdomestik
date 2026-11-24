import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';

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
    writeFileSync(process.env.DB_LANES_REPORT, JSON.stringify({ complete, files }));
  }
}
