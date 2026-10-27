// No sockets, TLS, SQL or native work: explicit I/O doubles drive exact production bodies.
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mountedLoader, opsRoot, operationId } from './db-access-m4-mounted-relay.test-fixture.mjs';
export const tls = {
  key: '-----BEGIN PRIVATE KEY-----\nunit\n-----END PRIVATE KEY-----',
  cert: '-----BEGIN CERTIFICATE-----\nunit\n-----END CERTIFICATE-----',
};
export const ownerConfiguration = {
  host: '127.0.0.1',
  port: 0,
  relayDeadlineMs: 1000,
  tls,
  runtime: {
    identityDatabaseURL: 'postgres://identity:unit@127.0.0.1/db',
    dataDatabaseURL: 'postgres://data:unit@127.0.0.1/db',
    notificationDatabaseURL: 'postgres://notify:unit@127.0.0.1/db',
    issuerBaseURL: 'https://issuer.test',
    issuerSecret: 'unit-secret-at-least-thirty-two-bytes',
    operationDeadlineMs: 100,
    notificationDatabaseDeadlineMs: 100,
  },
};
export async function relayIO() {
  const key = 'mounted-relay-io-' + randomUUID(),
    state = {
      requests: [],
      calls: [],
      constructors: [],
      runtimes: [],
      servers: [],
      cacheCalls: [],
      mode: 'bridge',
      changed: true,
      blocked: false,
      closeFails: false,
    };
  globalThis[key] = state;
  const ref = 'globalThis[' + JSON.stringify(key) + ']';
  state.makeRuntime = kind => {
    const record = { closed: false, active: 0, contexts: [] };
    let release;
    const runtime = {
      async close() {
        state.events?.push('runtime-close');
        record.closed = true;
        release?.({ status: 'indeterminate', operationId });
        if (state.closeFails) throw Error('unit drain rejection');
      },
    };
    for (const method of ['execute', 'executeLegacyAdmin', 'executeLegacyAgent', 'executeStaff'])
      runtime[method] = async (...args) => {
        state.calls.push({ method, args });
        record.active++;
        try {
          if (state.blocked)
            return await new Promise(resolve => {
              release = resolve;
            });
          const request = JSON.parse(args[1]);
          const result = {
            status: 'completed',
            operationId: request.operationId,
            replayed: false,
            result: {
              success: true,
              ...(method === 'execute'
                ? {
                    data: {
                      id: request.claimId,
                      staffId: request.staffId,
                      assignedAt: '2031-01-01T00:00:00.000Z',
                    },
                  }
                : {}),
            },
            ...(method === 'execute' ? {} : { changed: state.changed }),
          };
          return state.reply ?? result;
        } finally {
          record.active--;
        }
      };
    state.constructors.push(kind);
    state.runtimes.push({ runtime, record });
    return Object.freeze(runtime);
  };
  state.take = runtime => {
    const owned = state.runtimes.find(x => x.runtime === runtime);
    if (!owned || !owned.record.closed || owned.record.active)
      throw Error('unit original runtime owner not closed');
    if (owned.record.taken) throw Error('unit original take replay');
    owned.record.taken = true;
    return Object.freeze({ version: 1, localQualificationOnly: true, rows: owned.record.contexts });
  };
  state.createServer = (options, handler) => {
    const server = new EventEmitter();
    server.options = options;
    server.handler = handler;
    server.sockets = new Set();
    server.setTimeout = () => {};
    server.removeAllListeners = EventEmitter.prototype.removeAllListeners;
    server.listen = (port, host, ready) => {
      server.port = port || 43430 + state.servers.length;
      server.host = host;
      queueMicrotask(ready);
      return server;
    };
    server.address = () => ({ port: server.port, address: server.host });
    server.close = callback => {
      server.closeCallback = callback;
      queueMicrotask(() => callback());
    };
    server.closeAllConnections = () => {};
    server.connect = () => {
      const socket = new EventEmitter();
      socket.destroyed = false;
      socket.closed = false;
      socket.releaseClose = () => {
        if (!socket.closed) {
          socket.closed = true;
          server.sockets.delete(socket);
          socket.emit('close');
        }
      };
      socket.destroy = () => {
        if (!socket.destroyed) {
          socket.destroyed = true;
          if (!state.holdServerClose) queueMicrotask(socket.releaseClose);
        }
      };
      server.sockets.add(socket);
      server.emit('connection', socket);
      return socket;
    };
    state.servers.push(server);
    return server;
  };
  state.request = (url, options, callback) => {
    const outgoing = new EventEmitter();
    outgoing.destroyed = false;
    outgoing.closed = false;
    const socket = new EventEmitter();
    socket.closed = false;
    socket.destroyed = false;
    socket.releaseClose = () => {
      if (!socket.closed) {
        socket.closed = true;
        socket.emit('close');
      }
    };
    socket.destroy = () => {
      if (!socket.destroyed) {
        socket.destroyed = true;
        if (!state.holdClientClose) queueMicrotask(socket.releaseClose);
      }
    };
    outgoing.agent = new EventEmitter();
    outgoing.agent.sockets = { unit: [socket] };
    outgoing.agent.freeSockets = {};
    outgoing.unitSocket = socket;
    let stream, drip;
    outgoing.destroy = () => {
      if (outgoing.destroyed) return;
      outgoing.destroyed = true;
      clearInterval(drip);
      queueMicrotask(() => {
        outgoing.closed = true;
        outgoing.emit('close');
      });
      socket.destroy();
      stream?.destroy();
    };
    outgoing.end = body => {
      state.requests.push({ url: String(url), options, body, outgoing });
      if (state.mode === 'error') {
        queueMicrotask(() => outgoing.emit('error', Error('unit TLS failure')));
        return;
      }
      const response = new EventEmitter();
      stream = response;
      response.headers = { 'content-type': 'application/json' };
      response.statusCode = 200;
      response.complete = false;
      response.destroy = () => {
        response.emit('aborted');
        response.emit('close');
      };
      if (state.mode !== 'bridge') {
        queueMicrotask(() => {
          if (outgoing.destroyed) return;
          if (state.mode === 'redirect') response.statusCode = 302;
          callback(response);
          if (state.mode === 'drip') {
            drip = setInterval(() => response.emit('data', Buffer.from(' ')), 5);
            return;
          }
          const parsed = JSON.parse(JSON.parse(body).request);
          const result = {
            status: 'completed',
            operationId:
              state.mode === 'wrong-id'
                ? '00000000-0000-4000-8000-000000000099'
                : parsed.operationId,
            replayed: false,
            result: { success: true },
            changed: true,
          };
          response.emit(
            'data',
            Buffer.from(state.mode === 'oversize' ? 'x'.repeat(16385) : JSON.stringify(result))
          );
          response.complete = true;
          response.emit('end');
          response.emit('close');
        });
        return;
      }
      const server = state.servers.find(x => 'https://127.0.0.1:' + x.port === new URL(url).origin);
      if (!server) {
        queueMicrotask(() => outgoing.emit('error', Error('unit no listener')));
        return;
      }
      const req = Readable.from([Buffer.from(body)]);
      Object.assign(req, {
        url: new URL(url).pathname,
        method: options.method,
        headers: options.headers,
      });
      const res = new EventEmitter();
      res.destroyed = false;
      res.writeHead = (status, headers) => {
        response.statusCode = status;
        response.headers = headers;
        callback(response);
      };
      res.end = bytes => {
        res.emit('finish');
        queueMicrotask(() => {
          if (!outgoing.destroyed) {
            response.emit('data', Buffer.from(bytes));
            response.complete = true;
            response.emit('end');
            response.emit('close');
          }
        });
      };
      res.destroy = () => {
        res.destroyed = true;
        res.emit('close');
        response.destroy();
      };
      server.handler(req, res);
    };
    return outgoing;
  };
  const load = mountedLoader({
    'node:https':
      'export const request=(...a)=>' +
      ref +
      '.request(...a);export const createServer=(...a)=>' +
      ref +
      '.createServer(...a);',
    [opsRoot + 'm4-private-runtime.ts']:
      'export const createM4PrivateAssignmentRuntime=c=>' +
      ref +
      '.makeRuntime("production");export const createM4LocalQualificationAssignmentRuntime=c=>' +
      ref +
      '.makeRuntime("local");export const takeM4OwnedAssignmentContexts=r=>' +
      ref +
      '.take(r);',
    'next/cache': 'export const revalidatePath=p=>' + ref + '.cacheCalls.push(p);',
  });
  return {
    state,
    load,
    close() {
      for (const server of state.servers) for (const socket of server.sockets) socket.destroy();
      for (const request of state.requests) request.outgoing.destroy();
      delete globalThis[key];
    },
  };
}
