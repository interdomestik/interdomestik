// Synthetic IPC peer for channel tests only. Never a compiled runtime producer input.
import { fork } from 'node:child_process';
import fs from 'node:fs';
if (process.argv[2] === 'backend-spoof') {
  process.send(
    {
      type: 'M4_COMPILED_DRIVER_COMPLETE',
      pid: process.ppid,
      nonce: '0'.repeat(64),
      result: { forged: true },
    },
    () => process.disconnect()
  );
} else {
  process.send({ type: 'M4_COMPILED_DRIVER_READY', pid: process.pid });
  process.once('message', async ({ input, nonce }) => {
    const base = {
      type: 'M4_COMPILED_DRIVER_COMPLETE',
      pid: process.pid,
      nonce,
      result: input.result,
    };
    const send = value => new Promise(resolve => process.send(value, resolve));
    if (input.mode === 'stdout') {
      process.stdout.write(JSON.stringify(base));
      process.disconnect();
      return;
    }
    if (input.mode === 'file') {
      fs.mkdirSync('results');
      fs.writeFileSync('results/m4-compiled-completion.json', JSON.stringify(base));
      process.disconnect();
      return;
    }
    if (input.mode === 'cross-channel') {
      const backend = fork(import.meta.filename, ['backend-spoof'], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      backend.on('message', () => {}); // Its distinct channel is never forwarded into the trusted parent's channel.
      backend.on('exit', () => process.disconnect());
      return;
    }
    if (input.mode === 'wrong-pid') base.pid++;
    if (input.mode === 'wrong-nonce') base.nonce = '0'.repeat(64);
    if (input.mode === 'early') base.type = 'M4_COMPILED_DRIVER_CLOSED';
    await send(base);
    if (input.mode === 'duplicate') await send(base);
    if (input.mode !== 'missing-close')
      await send({ type: 'M4_COMPILED_DRIVER_CLOSED', pid: process.pid, nonce });
    process.disconnect();
  });
}
