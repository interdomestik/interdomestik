// This process receives restricted purpose credentials only. The administrator runs elsewhere.
import { createRequire } from 'node:module';
import postgres from 'postgres';
const {
  createM4LocalQualificationRuntime,
  createM4LocalQualificationAssignmentRuntime,
  captureM4PoolTarget,
  assertM4PoolPosture,
} = createRequire(import.meta.url)('./m4-runtime.cjs');
const runtimes = new Map();
const methods = new Set([
  'execute',
  'executeLegacyAdmin',
  'executeLegacyAgent',
  'executeStaff',
  'close',
]);
let shuttingDown = false;
let shutdownComplete = false;
let outputFenceRequested = false;
function refuse() {
  throw Error('M4 restricted child protocol refused');
}
function configuration(value, profile) {
  const keys = [
    'identityDatabaseURL',
    'dataDatabaseURL',
    'issuerBaseURL',
    'issuerSecret',
    'operationDeadlineMs',
    ...(profile === 'profiles'
      ? ['notificationDatabaseURL', 'notificationDatabaseDeadlineMs']
      : []),
  ];
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join('|') !== keys.sort().join('|')
  )
    refuse();
  for (const field of [
    'identityDatabaseURL',
    'dataDatabaseURL',
    ...(profile === 'profiles' ? ['notificationDatabaseURL'] : []),
  ]) {
    const address = new URL(value[field]);
    if (
      !['postgres:', 'postgresql:'].includes(address.protocol) ||
      address.hostname !== '127.0.0.1' ||
      !['5432', '55438'].includes(address.port) ||
      address.pathname !== '/interdomestik_test' ||
      !address.password ||
      address.search ||
      address.hash ||
      !/^m4_(?:ctrl_identity_|ctrl_data_|notify_)[a-f0-9]{16}$/u.test(address.username)
    )
      refuse();
  }
  return Object.freeze({ ...value });
}
async function fenceOutput() {
  await Promise.all(
    [process.stdout, process.stderr].map(
      stream =>
        new Promise((resolve, reject) => {
          stream.write('', error => (error ? reject(error) : resolve()));
        })
    )
  );
  return { stdoutFlushed: true, stderrFlushed: true };
}
async function handle(message) {
  if (
    !message ||
    Object.keys(message).sort().join('|') !== 'args|id|op' ||
    !Number.isSafeInteger(message.id) ||
    message.id < 1 ||
    !Array.isArray(message.args)
  )
    refuse();
  const [id, profile, config] = message.args;
  if (message.op === 'create') {
    if (
      shuttingDown ||
      runtimes.has(id) ||
      !Number.isSafeInteger(id) ||
      !['ops', 'profiles'].includes(profile)
    )
      refuse();
    const captured = configuration(config, profile);
    const runtime =
      profile === 'ops'
        ? createM4LocalQualificationRuntime(captured)
        : createM4LocalQualificationAssignmentRuntime(captured);
    const expected =
      profile === 'ops'
        ? ['close', 'execute']
        : ['close', 'execute', 'executeLegacyAdmin', 'executeLegacyAgent', 'executeStaff'];
    if (
      JSON.stringify(Object.keys(runtime).sort()) !== JSON.stringify(expected) ||
      !Object.isFrozen(runtime)
    )
      refuse();
    runtimes.set(id, runtime);
    return { methods: Object.keys(runtime).sort(), frozen: Object.isFrozen(runtime) };
  }
  if (message.op === 'invoke') {
    const [runtimeId, method, args] = message.args;
    if (
      !methods.has(method) ||
      !Array.isArray(args) ||
      args.length > 3 ||
      args.some(x => x !== null && typeof x !== 'string')
    )
      refuse();
    const runtime = runtimes.get(runtimeId);
    if (!runtime || typeof runtime[method] !== 'function') refuse();
    return await runtime[method](...args);
  }
  if (message.op === 'invalid-configurations') {
    const [valid] = message.args;
    const config = configuration(valid, 'ops');
    const rejected = [
      { ...config, operationDeadlineMs: 0 },
      { ...config, dataDatabaseURL: config.identityDatabaseURL },
      { ...config, dataDatabaseURL: config.dataDatabaseURL + '?options=role%3Dpostgres' },
      { ...config, dataDatabaseURL: config.dataDatabaseURL.replace('127.0.0.1', 'example.com') },
    ].map(changed => {
      try {
        createM4LocalQualificationRuntime(changed);
        return false;
      } catch {
        return true;
      }
    });
    if (rejected.some(value => value !== true)) refuse();
    return { rejected: 4 };
  }
  if (message.op === 'posture') {
    const [url] = message.args;
    configuration(
      {
        identityDatabaseURL: url,
        dataDatabaseURL: url,
        issuerBaseURL: 'https://app.interdomestik.test',
        issuerSecret: 'unused',
        operationDeadlineMs: 10000,
      },
      'ops'
    );
    const probe = postgres(url, {
      max: 1,
      ssl: false,
      connection: { client_connection_check_interval: 100 },
    });
    try {
      await assertM4PoolPosture(probe, captureM4PoolTarget(url, true));
      const [row] =
        await probe`select current_setting('client_connection_check_interval') as polling`;
      if (row.polling !== '100ms') refuse();
      await probe`set client_connection_check_interval=0`;
      let rejected = false;
      try {
        await assertM4PoolPosture(probe, captureM4PoolTarget(url, true));
      } catch (error) {
        rejected = (error?.cause?.code ?? error?.code) === '22012';
      }
      if (!rejected) refuse();
      await probe`set client_connection_check_interval=100`;
      await assertM4PoolPosture(probe, captureM4PoolTarget(url, true));
      return { polling: row.polling, disabledRejected: true };
    } finally {
      await probe.end({ timeout: 0 });
    }
  }
  if (message.op === 'shutdown') {
    shuttingDown = true;
    shutdownComplete = false;
    await Promise.all([...runtimes.values()].map(runtime => runtime.close()));
    shutdownComplete = true;
    return { closed: runtimes.size };
  }
  if (message.op === 'output-fence') {
    if (!shuttingDown || !shutdownComplete || outputFenceRequested || message.args.length !== 0)
      refuse();
    outputFenceRequested = true;
    return await fenceOutput();
  }
  refuse();
}
process.on('message', message => {
  void handle(message).then(
    result => process.send?.({ id: message.id, ok: true, result }),
    () => {
      process.send?.({ id: message?.id, ok: false, error: 'M4 restricted child failed' });
    }
  );
});
process.on('disconnect', () => {
  void Promise.allSettled([...runtimes.values()].map(x => x.close())).finally(() =>
    process.exit(0)
  );
});
process.send?.({
  ready: true,
  administratorCredentialPresent: Boolean(
    process.env.DATABASE_URL || process.env.DATABASE_ADMIN_URL
  ),
});
