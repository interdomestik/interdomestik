import { createServer, type Server } from 'node:https';
import type { Duplex } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { M4PrivateAssignmentRuntime } from './m4-private-runtime-types';
import {
  m4RelayDigest,
  m4RelayProfile,
  parseM4RelayEnvelope,
  parseM4RelayResponse,
  M4_RELAY_BODY_LIMIT,
  M4_RELAY_RESPONSE_LIMIT,
  type M4RelayProfile,
} from './m4-assignment-relay-wire';
export type M4AssignmentTransportRow = {
  profile: M4RelayProfile;
  path: string;
  operationId: string;
  requestDigest: string;
  responseDigest: string | null;
  outcome: 'completed' | 'denied' | 'indeterminate';
  delivery: 'pending' | 'finished' | 'closed' | 'failed';
};
const localTranscriptBudget = { used: 0, refused: false };
export function createM4AssignmentOwnerListener(
  runtime: M4PrivateAssignmentRuntime,
  tls: Readonly<{ key: string; cert: string }>,
  deadlineMs: number,
  captureLocal: boolean
) {
  const connections = new Set<Duplex>(),
    retirements = new Set<Promise<void>>();
  const rows: M4AssignmentTransportRow[] = [],
    work = new Set<Promise<void>>();
  let closing = false,
    refused = false;
  function reply(response: ServerResponse, value: unknown, row?: M4AssignmentTransportRow) {
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > M4_RELAY_RESPONSE_LIMIT)
      throw new Error('Bounded assignment response required');
    if (row) {
      response.once('finish', () => {
        row.delivery = 'finished';
      });
      response.once('close', () => {
        if (row.delivery === 'pending') row.delivery = 'closed';
      });
      response.once('error', () => {
        row.delivery = 'failed';
      });
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(bytes),
      connection: 'close',
    });
    response.end(bytes);
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const profile = m4RelayProfile(request.url ?? '');
    if (
      closing ||
      request.method !== 'POST' ||
      !profile ||
      request.headers['content-type'] !== 'application/json'
    ) {
      reply(response, { status: 'denied', reason: 'INVALID_REQUEST' });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > M4_RELAY_BODY_LIMIT) {
        reply(response, { status: 'denied', reason: 'INVALID_REQUEST' });
        request.destroy();
        return;
      }
      chunks.push(bytes);
    }
    const envelope = parseM4RelayEnvelope(Buffer.concat(chunks).toString('utf8'), profile);
    if (closing || !envelope) {
      reply(response, { status: 'denied', reason: 'INVALID_REQUEST' });
      return;
    }
    const cookie = request.headers.cookie ?? '';
    if (typeof cookie !== 'string' || cookie.length > 8192 || /[\r\n\u0000]/u.test(cookie)) {
      reply(response, { status: 'denied', reason: 'UNAUTHORIZED' });
      return;
    }
    if (
      captureLocal &&
      (rows.length >= 128 || localTranscriptBudget.refused || localTranscriptBudget.used >= 2048)
    ) {
      refused = true;
      localTranscriptBudget.refused = true;
      reply(response, { status: 'indeterminate', operationId: envelope.request.operationId });
      return;
    }
    // Allocation precedes awaits; every admitted call is retained, independent of completion order.
    const row: M4AssignmentTransportRow | undefined = captureLocal
      ? {
          profile,
          path: request.url!,
          operationId: envelope.request.operationId,
          requestDigest: m4RelayDigest(envelope.request),
          responseDigest: null,
          outcome: 'indeterminate',
          delivery: 'pending',
        }
      : undefined;
    if (row) {
      localTranscriptBudget.used++;
      rows.push(row);
    }
    let result;
    try {
      if (profile === 'ops') result = await runtime.execute(cookie, envelope.serialized);
      else if (profile === 'legacy-admin')
        result = await runtime.executeLegacyAdmin(
          cookie,
          envelope.serialized,
          envelope.observation
        );
      else if (profile === 'legacy-agent')
        result = await runtime.executeLegacyAgent(
          cookie,
          envelope.serialized,
          envelope.observation
        );
      else result = await runtime.executeStaff(cookie, envelope.serialized, envelope.observation);
    } catch {
      if (row) row.delivery = 'failed';
      throw new Error('Owned assignment invocation failed');
    }
    const body = JSON.stringify(result),
      checked = parseM4RelayResponse(body, envelope.request, profile);
    if (!checked) {
      refused = true;
      throw new Error('Invalid owned assignment result');
    }
    if (row) {
      row.responseDigest = m4RelayDigest(result);
      row.outcome = result.status;
    }
    if (response.destroyed) {
      if (row) row.delivery = 'closed';
      return;
    }
    reply(response, result, row);
  }
  const server: Server = createServer(
    { key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2', maxHeaderSize: 16384 },
    (request, response) => {
      const wall = setTimeout(() => {
        request.destroy();
        response.destroy();
      }, deadlineMs);
      const pending = handle(request, response)
        .catch(() => {
          if (!response.destroyed) response.destroy();
        })
        .finally(() => {
          clearTimeout(wall);
          work.delete(pending);
        });
      work.add(pending);
    }
  );
  server.on('connection', socket => {
    const denied = closing || connections.size >= 16;
    let closed!: () => void;
    const retired = new Promise<void>(resolve => {
      closed = resolve;
    });
    const wall = setTimeout(() => socket.destroy(), deadlineMs);
    // Enroll before every denial/destruction, including pre-HTTP TLS sockets.
    socket.once('close', () => {
      clearTimeout(wall);
      connections.delete(socket);
      retirements.delete(retired);
      closed();
    });
    connections.add(socket);
    retirements.add(retired);
    if (denied) socket.destroy();
  });
  server.maxConnections = 16;
  server.headersTimeout = Math.min(deadlineMs, 5000);
  server.requestTimeout = deadlineMs;
  server.keepAliveTimeout = 1;
  server.setTimeout(deadlineMs, socket => socket.destroy());
  return {
    server,
    connections,
    retirements,
    rows,
    work,
    get refused() {
      return refused || (captureLocal && localTranscriptBudget.refused);
    },
    stopAdmissions() {
      closing = true;
    },
  };
}
