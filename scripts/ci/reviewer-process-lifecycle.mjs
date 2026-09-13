// Each reviewer owns a separate process group; cancellation also stops descendants.
export function reviewerLifecycle(child, onCancel, signal) {
  let timer;
  let cleanupError;
  const kill = name => {
    try {
      if (process.platform === 'win32') child.kill(name);
      else if (child.pid) process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        cleanupError = `reviewer_process_cleanup:${error.code}`;
        child.kill(name);
      }
    }
  };
  const stop = () => {
    if (timer) return;
    kill('SIGTERM');
    timer = setTimeout(() => kill('SIGKILL'), 1000);
    timer.unref();
  };
  const cancel = () => {
    onCancel();
    stop();
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    stop,
    close() {
      clearTimeout(timer);
      // A descendant can close inherited pipes and outlive the group leader.
      kill('SIGKILL');
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      signal?.removeEventListener('abort', cancel);
      return cleanupError;
    },
  };
}
