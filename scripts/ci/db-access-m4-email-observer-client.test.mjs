import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openM4EmailObserverChild } from './db-access-m4-email-observer-client.mjs';

// Fixed benign protocol fixture: real fork/IPC/pipes, no product runtime, provider or SQL.
function fixture(mode) {
  assert(['success', 'nonzero', 'signal', 'fence-refusal', 'missing-module'].includes(mode));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-child-lifecycle-'));
  fs.mkdirSync(path.join(root, 'home'));
  fs.mkdirSync(path.join(root, 'tmp'));
  if (mode !== 'missing-module')
    fs.writeFileSync(
      path.join(root, 'db-access-m4-runtime-child.mjs'),
      `
const mode = ${JSON.stringify(mode)};
let shutdown = false;
process.on('message', message => {
  if (message.op === 'shutdown') {
    shutdown = true;
    process.send({ id: message.id, ok: true, result: { closed: 0 } });
  } else if (message.op === 'output-fence' && shutdown && message.args.length === 0) {
    if (mode === 'fence-refusal') {
      process.send({ id: message.id, ok: false });
      return;
    }
    Promise.all([process.stdout, process.stderr].map(stream => new Promise((resolve, reject) => {
      stream.write('', error => error ? reject(error) : resolve());
    }))).then(() => process.send({ id: message.id, ok: true,
      result: { stdoutFlushed: true, stderrFlushed: true } }));
  }
});
process.on('disconnect', () => {
  if (mode === 'signal') process.kill(process.pid, 'SIGTERM');
  else process.exit(mode === 'nonzero' ? 7 : 0);
});
process.send({ ready: true, administratorCredentialPresent: false });
`,
      { mode: 0o600 }
    );
  return root;
}
test('real empty-map fork finishes after explicit disconnect with exit and both EOF', async () => {
  const root = fixture('success');
  try {
    const client = await openM4EmailObserverChild(root);
    assert.deepEqual(await client.close(), {
      emailUnavailableCalls: 0,
      exitCode: 0,
      exitMode: 'explicit-after-output-fence',
      outputFenceAcknowledged: true,
      forcedTermination: false,
      stdoutEnded: true,
      stderrEnded: true,
    });
    await assert.rejects(client.close(), /restricted child failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
for (const mode of ['nonzero', 'signal', 'fence-refusal'])
  test('real fork refuses ' + mode + ' without hanging failure cleanup', async () => {
    const root = fixture(mode);
    try {
      const client = await openM4EmailObserverChild(root);
      await assert.rejects(client.close(), /refused|restricted child failed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
test('real startup module failure is reaped and refused', async () => {
  const root = fixture('missing-module');
  try {
    await assert.rejects(openM4EmailObserverChild(root), /restricted child failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
