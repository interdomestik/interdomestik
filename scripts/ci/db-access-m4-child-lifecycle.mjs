// Mechanical lifecycle observation only. The fixed parent supplies its actual fork.
// Aggregate ChildProcess 'close' is not used: explicit IPC disconnect can omit its IPC count.
const fail = () => Error('M4 child lifecycle refused');
function bounded(promise) {
  let timeout;
  const deadline = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(fail()), 5000);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}
export function observeM4ChildLifecycle(child) {
  const terminated = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal, spawnFailed: false }));
    child.on('error', () => {
      // A failed spawn may never emit exit. This record permits failure cleanup only.
      if (!child.pid) resolve({ code: null, signal: null, spawnFailed: true });
    });
  });
  const stdoutEOF = new Promise(resolve => child.stdout.once('end', resolve));
  const stderrEOF = new Promise(resolve => child.stderr.once('end', resolve));
  return Object.freeze({
    waitForExit() {
      return bounded(terminated);
    },
    async waitForExitAndEOF() {
      const [termination] = await bounded(Promise.all([terminated, stdoutEOF, stderrEOF]));
      if (termination.spawnFailed) throw fail();
      return {
        code: termination.code,
        signal: termination.signal,
        stdoutEnded: true,
        stderrEnded: true,
      };
    },
  });
}
