import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const P = fileURLToPath(new URL('../../', import.meta.url));
const ts = createRequire(P + '/package.json')('typescript');
const sourceDir = path.resolve(import.meta.dirname, '../../apps/web/src/server/operations');
export function fixture({ realHttp = false } = {}) {
  const loaded = new Map(),
    pools = [],
    listeners = [],
    modes = [],
    factories = [];
  const principal = () => ({ actorId: 'actor', accessTenantId: 'tenant' });
  const modules = {
    '@interdomestik/database/schema': {},
    'drizzle-orm/postgres-js': { drizzle: pool => ({ pool }) },
    postgres: url => {
      throw Error('unexpected missing options');
    },
    '../../lib/auth/current-store-session': { createCurrentStoreSessionVerifier: () => principal },
    './m4-pool-posture': {
      assertM4DriverEnvironment() {},
      captureM4PoolTarget(url, local) {
        modes.push(local);
        return { url, login: new URL(url).username, serverKey: 'same-server' };
      },
      captureM4DatabaseTls() {
        return Object.freeze({ rejectUnauthorized: true });
      },
      async assertM4PoolPosture() {},
    },
    './m4-assignment-postcommit': { createM4AssignmentPostcommitNotifier: () => async () => {} },
    './m4-notification-runtime': {
      createM4NotificationDatabaseOwner(options) {
        modes.push(options.loopbackQualification);
        return { open: async () => ({}), close: async () => {} };
      },
    },
    './m4-ops-controller': Object.fromEntries(
      ['Ops', 'LegacyAdmin', 'LegacyAgent', 'Staff'].map(name => [
        'createM4' + name + 'AssignmentController',
        configuration => async (_cookie, serialized) => {
          factories.push({ name, configuration });
          return {
            status: 'completed',
            operationId: JSON.parse(serialized).operationId,
            replayed: false,
            changed: true,
            result: { success: true },
          };
        },
      ])
    ),
    './m4-assignment-relay-client': { relayM4AssignmentRequest: async () => ({}) },
    './m4-assignment-relay-wire': {
      captureM4RelayConfiguration: value => Object.freeze(value),
    },
    './m4-assignment-owner-http': {
      createM4AssignmentOwnerListener(runtime, _tls, _deadline, local, strictBudget) {
        const server = new EventEmitter();
        server.listen = (_port, _host, ready) => ready();
        server.address = () => ({ port: 20000 + listeners.length });
        server.close = done => done();
        server.closeAllConnections = () => {};
        const value = {
          runtime,
          local,
          strictBudget,
          server,
          connections: new Set(),
          retirements: new Set(),
          work: new Set(),
          rows: [],
          refused: false,
          stopAdmissions() {},
        };
        listeners.push(value);
        return value;
      },
    },
  };
  if (realHttp) {
    delete modules['./m4-assignment-owner-http'];
    modules['node:https'] = {
      createServer(_tls, handler) {
        const server = new EventEmitter();
        server.handler = handler;
        server.listen = (_port, _host, ready) => ready();
        server.address = () => ({ port: 20443 });
        server.close = done => done();
        server.closeAllConnections = () => {};
        server.setTimeout = () => {};
        return server;
      },
    };
    delete modules['./m4-assignment-relay-wire'];
  }
  modules.postgres = (url, options) => {
    const pool = {
      url,
      options,
      ended: 0,
      async end() {
        this.ended++;
      },
    };
    pools.push(pool);
    return pool;
  };
  function load(name) {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith('node:')) return createRequire(import.meta.url)(name);
    const file = name.replace('./', '') + '.ts';
    if (loaded.has(file)) return loaded.get(file).exports;
    const full = fs.existsSync(path.join(sourceDir, file))
      ? path.join(sourceDir, file)
      : path.join(P, 'apps/web/src/server/operations', file);
    const module = { exports: {} };
    loaded.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: full })(
      load,
      module,
      module.exports
    );
    return module.exports;
  }
  const config = Object.freeze({
    identityDatabaseURL: 'postgres://identity:secret@127.0.0.1:5432/db',
    dataDatabaseURL: 'postgres://data:secret@127.0.0.1:5432/db',
    notificationDatabaseURL: 'postgres://notice:secret@127.0.0.1:5432/db',
    issuerBaseURL: 'https://issuer.example',
    issuerSecret: 'x'.repeat(32),
    operationDeadlineMs: 1000,
    notificationDatabaseDeadlineMs: 1000,
  });
  return {
    api: load('./m4-private-runtime'),
    owner: load('./m4-assignment-owner'),
    config,
    pools,
    listeners,
    modes,
    factories,
    http: load('./m4-assignment-owner-http'),
    ownerConfig: {
      runtime: config,
      tls: { key: '-----BEGIN PRIVATE KEY-----', cert: '-----BEGIN CERTIFICATE-----' },
      host: '127.0.0.1',
      port: 20443,
      relayDeadlineMs: 2000,
    },
  };
}
export const request = JSON.stringify({
  version: 1,
  command: 'm4.legacy.assign-claim',
  operationId: '12345678-1234-4234-8234-123456789abc',
  claimId: 'claim',
  staffId: 'staff',
});
export const observation = JSON.stringify({ ip: null, userAgent: null });
