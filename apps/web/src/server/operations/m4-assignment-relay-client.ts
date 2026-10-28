import { request, type Agent } from 'node:https';
type OwnedRequest = ReturnType<typeof request> & { agent: Agent };
import type { Socket } from 'node:net';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import type { AssignmentResult, M4Response } from './m4-assignment-wire';
import {
  captureM4RelayConfiguration,
  m4RelayPath,
  parseM4RelayResponse,
  M4_RELAY_BODY_LIMIT,
  M4_RELAY_RESPONSE_LIMIT,
  type M4RelayConfiguration,
  type M4RelayProfile,
} from './m4-assignment-relay-wire';
// Trusted startup configuration only; mounted actions expose no endpoint/CA/deadline parameter.
export async function relayM4AssignmentRequest(
  configuration: M4RelayConfiguration,
  profile: M4RelayProfile,
  cookie: unknown,
  serialized: unknown,
  observation: unknown,
  signal?: AbortSignal
): Promise<M4Response<AssignmentResult>> {
  const parsed = parseM4AssignmentRequest(serialized);
  if (!parsed) return { status: 'denied', reason: 'INVALID_REQUEST' };
  const uncertain = { status: 'indeterminate' as const, operationId: parsed.operationId };
  if (signal?.aborted) return uncertain;
  let captured: M4RelayConfiguration, body: string, path: string;
  try {
    captured = captureM4RelayConfiguration(configuration);
    path = m4RelayPath(profile);
    if (typeof cookie !== 'string' || cookie.length > 8192 || /[\r\n\u0000]/u.test(cookie))
      return { status: 'denied', reason: 'UNAUTHORIZED' };
    body = JSON.stringify({
      version: 1,
      request: serialized,
      observation,
      observationAuthority: 'untrusted-request-metadata',
    });
    if (Buffer.byteLength(body) > M4_RELAY_BODY_LIMIT)
      return { status: 'denied', reason: 'INVALID_REQUEST' };
  } catch {
    return uncertain;
  }
  return new Promise(resolve => {
    let outcome: M4Response<AssignmentResult> | undefined,
      requestClosed = false;
    let outgoing: OwnedRequest | undefined;
    const sockets = new Set<Socket>(),
      seen = new WeakSet<Socket>();
    const complete = () => {
      if (!outcome || !requestClosed || sockets.size) return;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      outgoing?.agent?.removeListener('free', observeSocket);
      resolve(outcome);
    };
    function observeSocket(socket: Socket) {
      if (seen.has(socket)) return;
      seen.add(socket);
      // closed is Node's actual close-event state, never the earlier destroyed flag.
      if (socket.closed) return;
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
        complete();
      });
      if (outcome) socket.destroy();
    }
    function observeAgentSockets() {
      const agent = outgoing?.agent;
      if (!agent) return;
      for (const group of Object.values(agent.sockets))
        if (group) for (const socket of group) observeSocket(socket);
      for (const group of Object.values(agent.freeSockets))
        if (group) for (const socket of group) observeSocket(socket);
    }
    function retire() {
      observeAgentSockets();
      outgoing?.destroy();
      for (const socket of sockets) socket.destroy();
      if (!outgoing) requestClosed = true;
      complete();
    }
    function select(value: M4Response<AssignmentResult>) {
      outcome ??= value;
      retire();
    }
    function cancel() {
      outcome = uncertain;
      retire();
    }
    // This absolute deadline includes resource retirement, not just response EOF.
    const timer = setTimeout(cancel, captured.deadlineMs);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      outgoing = request(
        new URL(path, captured.origin),
        {
          method: 'POST',
          agent: false,
          rejectUnauthorized: true,
          ca: captured.ca,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            cookie,
          },
        },
        response => {
          if (
            response.statusCode !== 200 ||
            response.headers['content-type'] !== 'application/json'
          ) {
            response.destroy();
            select(uncertain);
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > M4_RELAY_RESPONSE_LIMIT) {
              response.destroy();
              select(uncertain);
            } else chunks.push(chunk);
          });
          response.on('end', () =>
            select(
              parseM4RelayResponse(Buffer.concat(chunks).toString('utf8'), parsed, profile) ??
                uncertain
            )
          );
          response.on('error', () => select(uncertain));
          response.on('aborted', () => select(uncertain));
        }
      ) as OwnedRequest;
      outgoing.once('close', () => {
        requestClosed = true;
        outcome ??= uncertain;
        retire();
      });
      outgoing.on('socket', observeSocket);
      outgoing.on('error', () => select(uncertain));
      // agent:false creates this request's dedicated single-use agent. Cancellation
      // before assignment can omit request.socket entirely, so enroll its published
      // sockets before end/abort as well as observing assignment/free events.
      outgoing.agent.on('free', observeSocket);
      observeAgentSockets();
      if (outgoing.socket) observeSocket(outgoing.socket);
      outgoing.end(body);
    } catch {
      select(uncertain);
    }
  });
}
