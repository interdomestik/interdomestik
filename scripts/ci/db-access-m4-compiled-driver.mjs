import fs from 'node:fs';
import { executeM4CompiledFixture } from './db-access-m4-compiled-fixture.mjs';
import { authenticateRuntimeContext, snapshot } from './db-access-provider-runtime-identity.mjs';
import { sealM4Image, assertM4ImageUnchanged } from './db-access-m4-runtime-seal.mjs';
const root = fs.realpathSync(process.cwd());
let state = 'waiting';
const send = value =>
  new Promise((resolve, reject) =>
    process.send(value, error => (error ? reject(error) : resolve()))
  );
const fail = () => {
  state = 'failed';
  process.exitCode = 1;
  if (process.connected) process.disconnect();
};
if (!process.send || !process.connected) throw Error('Private trusted-driver IPC required');
process.on('disconnect', () => {
  if (state !== 'closed') process.exitCode = 1;
});
process.on('message', async message => {
  if (state !== 'waiting') return fail();
  state = 'running';
  try {
    if (
      !message ||
      Object.keys(message).sort().join('|') !== 'input|nonce|parentPid|pid|remainingMs|type' ||
      message.type !== 'M4_COMPILED_DRIVER_START' ||
      message.pid !== process.pid ||
      message.parentPid !== process.ppid ||
      !/^[a-f0-9]{64}$/u.test(message.nonce) ||
      !Number.isSafeInteger(message.remainingMs) ||
      message.remainingMs < 1 ||
      message.remainingMs > 300000
    )
      throw Error('Private startup identity');
    const { input, nonce } = message;
    const deadlineAt = performance.now() + message.remainingMs;
    const git = authenticateRuntimeContext(input.gitDir, input.context);
    const bookend = () => ({
      candidate: snapshot(
        input.candidateRoot,
        input.context.candidateCommit,
        input.candidateRecords,
        git
      ),
      producer: snapshot(
        input.producerRoot,
        input.context.sourceCommit,
        input.producerRecords,
        git
      ),
    });
    const before = bookend(),
      imageBefore = sealM4Image(root);
    if (
      JSON.stringify(before) !== JSON.stringify(input.sourceBefore) ||
      imageBefore.digest !== input.imageDigest
    )
      throw Error('Source/image before execution');
    const completion = await executeM4CompiledFixture({
      root,
      adminURL: input.databaseUrl,
      databaseTLS: input.databaseTLS,
      compiledPackageRoot: input.compiledPackageRoot,
      producerRoot: input.producerRoot,
      candidateRoot: input.candidateRoot,
      workRoot: input.workRoot,
      deadlineAt,
    });
    const imageAfter = assertM4ImageUnchanged(root, imageBefore);
    authenticateRuntimeContext(input.gitDir, input.context);
    const after = bookend();
    if (
      state !== 'running' ||
      JSON.stringify(before) !== JSON.stringify(after) ||
      performance.now() > deadlineAt
    )
      throw Error('Source/event final execution state');
    state = 'completing';
    await send({
      type: 'M4_COMPILED_DRIVER_COMPLETE',
      pid: process.pid,
      nonce,
      result: {
        completion,
        sourceBookends: { before, after },
        imageDigest: imageAfter.digest,
      },
    });
    if (state !== 'completing') throw Error('Interrupted completion');
    await send({ type: 'M4_COMPILED_DRIVER_CLOSED', pid: process.pid, nonce });
    state = 'closed';
    process.disconnect();
  } catch {
    fail();
  }
});
await send({ type: 'M4_COMPILED_DRIVER_READY', pid: process.pid });
