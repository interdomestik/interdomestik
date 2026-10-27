import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { Writable } from 'node:stream';

// Test only the exact child protocol functions. No child, imports, product runtime or SQL.
const source = fs.readFileSync(
  new URL('./db-access-m4-runtime-child.mjs', import.meta.url),
  'utf8'
);
const start = source.indexOf('let shuttingDown = false;');
const end = source.indexOf("process.on('message'");
assert(start > 0 && end > start);
function protocol(stdout, stderr, close = async () => {}) {
  const context = vm.createContext({
    process: { stdout, stderr },
    runtimes: new Map([[1, { close }]]),
  });
  return vm.runInContext(source.slice(start, end) + '\nhandle', context);
}
const request = (op, args = []) => ({ id: 1, op, args });
const immediate = () => new Promise(resolve => setImmediate(resolve));
function streams() {
  const callbacks = [[], []];
  const writes = [[], []];
  const output = writes.map(
    (list, index) =>
      new Writable({
        write(chunk, encoding, callback) {
          list.push(chunk.toString());
          callbacks[index].push(callback);
        },
      })
  );
  for (const stream of output) stream.on('error', () => {});
  return { output, writes, callbacks };
}
test('fence refuses before shutdown and while original runtime close remains pending', async () => {
  const s = streams();
  let release;
  const handle = protocol(
    ...s.output,
    () =>
      new Promise(resolve => {
        release = resolve;
      })
  );
  await assert.rejects(handle(request('output-fence')), /protocol refused/);
  const shutdown = handle(request('shutdown'));
  await assert.rejects(handle(request('output-fence')), /protocol refused/);
  assert.deepEqual(s.writes, [[], []]);
  release();
  assert.equal((await shutdown).closed, 1);
});
test('shutdown failure cannot authorize output fence', async () => {
  const s = streams();
  const handle = protocol(...s.output, async () => {
    throw Error('close failed');
  });
  await assert.rejects(handle(request('shutdown')), /close failed/);
  await assert.rejects(handle(request('output-fence')), /protocol refused/);
  assert.deepEqual(s.writes, [[], []]);
});
test('fence requires exact empty arguments and emits no caller-supplied content', async () => {
  const s = streams(),
    handle = protocol(...s.output);
  await handle(request('shutdown'));
  for (const args of [['arbitrary'], [null], [{}], ['stderr', 'payload']])
    await assert.rejects(handle(request('output-fence', args)), /protocol refused/);
  assert.deepEqual(s.writes, [[], []]);
});
test('actual Writable queue must flush preceding bytes and both fence callbacks before ACK', async () => {
  const s = streams(),
    handle = protocol(...s.output);
  s.output[0].write('prior stdout');
  s.output[1].write('prior stderr');
  await handle(request('shutdown'));
  let acknowledged = false;
  const fence = handle(request('output-fence')).then(value => {
    acknowledged = true;
    return value;
  });
  await immediate();
  assert.equal(acknowledged, false);
  assert.deepEqual(s.writes, [['prior stdout'], ['prior stderr']]);
  s.callbacks[0].shift()();
  s.callbacks[1].shift()();
  await immediate();
  assert.deepEqual(s.writes, [
    ['prior stdout', ''],
    ['prior stderr', ''],
  ]);
  s.callbacks[0].shift()();
  await immediate();
  assert.equal(acknowledged, false);
  s.callbacks[1].shift()();
  const result = await fence;
  assert.equal(result.stdoutFlushed, true);
  assert.equal(result.stderrFlushed, true);
  assert.equal(acknowledged, true);
  await assert.rejects(handle(request('output-fence')), /protocol refused/);
});
test('either output write callback error refuses ACK and retry', async () => {
  for (const failed of [0, 1]) {
    const s = streams(),
      handle = protocol(...s.output);
    await handle(request('shutdown'));
    const fence = handle(request('output-fence'));
    const rejected = assert.rejects(fence, /write failed/);
    s.callbacks[failed].shift()(Error('write failed'));
    s.callbacks[1 - failed].shift()();
    await rejected;
    await assert.rejects(handle(request('output-fence')), /protocol refused/);
  }
});
test('observer waits exact fence ACK before disconnect and uses explicit-exit metadata', () => {
  const client = fs.readFileSync(
    new URL('./db-access-m4-email-observer-client.mjs', import.meta.url),
    'utf8'
  );
  const shutdown = client.indexOf("await call('shutdown', [])");
  const fence = client.indexOf("await call('output-fence', [])");
  const disconnect = client.indexOf('child.disconnect()');
  assert(shutdown >= 0 && fence > shutdown && disconnect > fence);
  assert(client.slice(fence, disconnect).includes('stdoutFlushed: true'));
  assert(client.slice(fence, disconnect).includes('stderrFlushed: true'));
  assert(client.includes('outputFenceAcknowledged: true'));
  assert(source.includes('process.exit(0)'));
});
