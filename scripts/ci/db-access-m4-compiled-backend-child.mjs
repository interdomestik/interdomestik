import { randomUUID } from 'node:crypto';
import {
  createM4ObservedPrivateAssignmentRuntime,
  takeM4StrictAssignmentContexts,
  startM4ObservedPrivateAssignmentOwner,
  takeM4StrictAssignmentOwnerContexts,
} from './m4-compiled-backend.mjs';

// Only the trusted parent sends startup configuration. No administrator URL or runtime callback.
let owner,
  opsRuntime,
  runtimeConfiguration,
  ownerInstanceId,
  opsUsed = false,
  state = 'empty';
function send(value) {
  return new Promise((resolve, reject) =>
    process.send(value, error => (error ? reject(error) : resolve()))
  );
}
async function fail() {
  state = 'failed';
  await opsRuntime?.close().catch(() => {});
  await owner?.close().catch(() => {});
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
process.on('disconnect', () => {
  if (state !== 'closed') void fail();
});
process.on('message', async message => {
  try {
    if (!message || Buffer.byteLength(JSON.stringify(message)) > 65536) throw Error('IPC bound');
    if (
      message.command === 'start' &&
      state === 'empty' &&
      Object.keys(message).sort().join('|') === 'command|configuration'
    ) {
      state = 'starting';
      runtimeConfiguration = Object.freeze({
        ...message.configuration.runtime,
      });
      ownerInstanceId = randomUUID();
      owner = await startM4ObservedPrivateAssignmentOwner(message.configuration);
      if (state !== 'starting') {
        await owner.close();
        throw Error('Interrupted startup');
      }
      if (!Object.isFrozen(owner) || Object.keys(owner).sort().join('|') !== 'close|origin')
        throw Error('Owner surface');
      state = 'started';
      await send({ kind: 'ready', origin: owner.origin });
    } else if (
      message.command === 'execute-ops' &&
      state === 'started' &&
      !opsUsed &&
      Object.keys(message).sort().join('|') === 'command|cookie|serialized' &&
      typeof message.cookie === 'string' &&
      typeof message.serialized === 'string'
    ) {
      opsUsed = true;
      state = 'ops-running';
      const opsInstanceId = randomUUID();
      opsRuntime = createM4ObservedPrivateAssignmentRuntime(runtimeConfiguration);
      const result = await opsRuntime.execute(message.cookie, message.serialized);
      await opsRuntime.close();
      const contexts = takeM4StrictAssignmentContexts(opsRuntime);
      opsRuntime = undefined;
      if (state !== 'ops-running') throw Error('Interrupted strict ops execution');
      state = 'started';
      await send({
        kind: 'ops-complete',
        record: { opsInstanceId, result, contexts },
      });
    } else if (
      message.command === 'close' &&
      state === 'started' &&
      Object.keys(message).join('|') === 'command'
    ) {
      state = 'closing';
      await owner.close();
      const observation = takeM4StrictAssignmentOwnerContexts(owner);
      owner = undefined;
      await send({ kind: 'closed', observation, ownerInstanceId });
      state = 'closed';
      process.disconnect();
    } else throw Error('Fixed IPC sequence');
  } catch {
    await fail();
  }
});
