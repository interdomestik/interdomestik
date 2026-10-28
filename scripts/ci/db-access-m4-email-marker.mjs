// Fixed parent-side stderr observer. Never retains or returns unrelated log content.
export const M4_EMAIL_UNAVAILABLE_LINE = 'Resend API key not configured. Emails will be skipped.';
const marker = Buffer.from(M4_EMAIL_UNAVAILABLE_LINE);
const fail = () => Error('M4 email observation refused');

export function createM4EmailMarker() {
  let count = 0,
    position = 0,
    matches = true,
    bytes = 0,
    failed = false,
    final;
  const pending = new Set();
  function reject() {
    failed = true;
    for (const item of pending) {
      clearTimeout(item.timer);
      item.reject(fail());
    }
    pending.clear();
  }
  function check() {
    if (failed) throw fail();
  }
  function notify() {
    for (const item of pending) {
      if (count !== item.expected) continue;
      clearTimeout(item.timer);
      pending.delete(item);
      item.resolve(count);
    }
  }
  return Object.freeze({
    feed(stream, chunk) {
      check();
      if (final || !['stdout', 'stderr'].includes(stream) || !Buffer.isBuffer(chunk)) {
        reject();
        throw fail();
      }
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        reject();
        throw fail();
      }
      if (stream !== 'stderr') return;
      // Only an index/match bit is retained, even for arbitrarily long unrelated lines.
      for (const byte of chunk) {
        if (byte === 10) {
          if (matches && position === marker.length) count++;
          position = 0;
          matches = true;
          notify();
        } else {
          if (position >= marker.length || byte !== marker[position]) matches = false;
          position = Math.min(position + 1, marker.length + 1);
        }
      }
    },
    count() {
      check();
      return count;
    },
    waitForCount(expected) {
      check();
      if (!Number.isSafeInteger(expected) || expected < 0 || count > expected)
        return Promise.reject(fail());
      if (count === expected) return Promise.resolve(count);
      if (final) return Promise.reject(fail());
      return new Promise((resolve, rejectItem) => {
        const item = { expected, resolve, reject: rejectItem };
        item.timer = setTimeout(() => {
          reject();
        }, 3000);
        pending.add(item);
      });
    },
    reject,
    finish({ code, signal, forced, stdoutEnded, stderrEnded, outputFenceAcknowledged }) {
      check();
      if (final) return final;
      if (
        code !== 0 ||
        signal !== null ||
        forced ||
        !stdoutEnded ||
        !stderrEnded ||
        outputFenceAcknowledged !== true ||
        position
      ) {
        reject();
        throw fail();
      }
      if (pending.size) {
        reject();
        throw fail();
      }
      final = Object.freeze({
        emailUnavailableCalls: count,
        exitCode: 0,
        exitMode: 'explicit-after-output-fence',
        outputFenceAcknowledged: true,
        forcedTermination: false,
        stdoutEnded: true,
        stderrEnded: true,
      });
      return final;
    },
  });
}
