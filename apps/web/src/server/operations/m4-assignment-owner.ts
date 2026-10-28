import { captureOwnerConfiguration } from './m4-assignment-owner-capture';
import {
  createM4PrivateAssignmentRuntime,
  createM4ObservedPrivateAssignmentRuntime,
  takeM4StrictAssignmentContexts,
  createM4LocalQualificationAssignmentRuntime,
  takeM4OwnedAssignmentContexts,
} from './m4-private-runtime';
import type {
  M4PrivateAssignmentRuntime,
  M4PrivateAssignmentRuntimeConfiguration,
} from './m4-private-runtime-types';
import { createM4AssignmentOwnerListener } from './m4-assignment-owner-http';
import { relayM4AssignmentRequest } from './m4-assignment-relay-client';
import { captureM4RelayConfiguration, type M4RelayConfiguration } from './m4-assignment-relay-wire';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import { parseM4AssignmentObservation } from './m4-assignment-wire';
import type { M4Response, LegacyResult, StaffResult, AssignmentResult } from './m4-assignment-wire';
import type { M4OpsResponse } from './m4-ops-controller';
export type M4AssignmentOwnerConfiguration = Readonly<{
  runtime: M4PrivateAssignmentRuntimeConfiguration;
  tls: Readonly<{ key: string; cert: string }>;
  host: '127.0.0.1';
  port: number;
  relayDeadlineMs: number;
}>;
export type M4AssignmentOwner = Readonly<{ origin: string; close(): Promise<void> }>;
export type M4QualificationAssignmentOwner = M4AssignmentOwner &
  Readonly<{
    clientConfiguration: M4RelayConfiguration;
    execute(cookie: unknown, serialized: unknown): Promise<M4OpsResponse>;
    executeLegacyAdmin(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<LegacyResult>>;
    executeLegacyAgent(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<LegacyResult>>;
    executeStaff(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<StaffResult>>;
  }>;
type OwnerState = {
  runtime?: M4PrivateAssignmentRuntime;
  listener: ReturnType<typeof createM4AssignmentOwnerListener>;
  clients: Map<Promise<unknown>, AbortController>;
  closed: boolean;
  drained: boolean;
  closing?: Promise<void>;
};
const qualifiedOwners = new WeakMap<object, OwnerState>();
const strictOwners = new WeakMap<object, OwnerState>();
const strictOwnerRequests = new WeakSet<object>();
async function listen(
  runtime: M4PrivateAssignmentRuntime,
  configuration: ReturnType<typeof captureOwnerConfiguration>,
  localQualification: boolean,
  strictBudget?: { used: number; refused: boolean }
) {
  let listener: ReturnType<typeof createM4AssignmentOwnerListener>;
  try {
    listener = createM4AssignmentOwnerListener(
      runtime,
      configuration.tls,
      configuration.relayDeadlineMs,
      localQualification,
      strictBudget
    );
  } catch (error) {
    await runtime.close();
    throw error;
  }
  const state: OwnerState = {
    runtime,
    listener,
    clients: new Map(),
    closed: false,
    drained: false,
  };
  const close = () => {
    if (!state.closing) {
      state.closed = true;
      listener.stopAdmissions();
      const clients = [...state.clients.keys()];
      for (const controller of state.clients.values()) controller.abort();
      const stopped = new Promise<void>((resolve, reject) => {
        listener.server.close(error => (error ? reject(error) : resolve()));
        listener.server.closeAllConnections();
        for (const socket of listener.connections) socket.destroy();
      });
      state.closing = Promise.allSettled([
        stopped,
        Promise.resolve().then(() => state.runtime!.close()),
        ...clients,
      ]).then(async results => {
        await Promise.all([...listener.work, ...listener.retirements]);
        if (results.some(result => result.status === 'rejected'))
          throw new Error('Assignment owner drain failed');
        state.drained = true;
        listener.server.removeAllListeners('request');
      });
    }
    return state.closing;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      listener.server.once('error', reject);
      listener.server.listen(configuration.port, configuration.host, () => {
        listener.server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  const address = listener.server.address();
  if (!address || typeof address === 'string') {
    await close();
    throw new Error('Fixed assignment owner address required');
  }
  const origin = 'https://127.0.0.1:' + address.port;
  return { state, origin, close };
}
export async function startM4PrivateAssignmentOwner(
  configuration: M4AssignmentOwnerConfiguration
): Promise<M4AssignmentOwner> {
  const observed = strictOwnerRequests.delete(configuration);
  const captured = captureOwnerConfiguration(configuration, false);
  const runtime = observed
    ? createM4ObservedPrivateAssignmentRuntime(captured.runtime)
    : createM4PrivateAssignmentRuntime(captured.runtime);
  const owner = await listen(
    runtime,
    captured,
    false,
    observed ? { used: 0, refused: false } : undefined
  );
  const handle = Object.freeze({ origin: owner.origin, close: owner.close });
  if (observed) strictOwners.set(handle, owner.state);
  return handle;
}
// The request identity is lexical and survives only through this actual named entry.
export async function startM4ObservedPrivateAssignmentOwner(
  configuration: M4AssignmentOwnerConfiguration
): Promise<M4AssignmentOwner> {
  const captured = captureOwnerConfiguration(configuration, false);
  strictOwnerRequests.add(captured);
  try {
    return await startM4PrivateAssignmentOwner(captured);
  } finally {
    strictOwnerRequests.delete(captured);
  }
}
export function takeM4StrictAssignmentOwnerContexts(handle: object) {
  const state = strictOwners.get(handle);
  if (
    !state ||
    !state.closed ||
    !state.drained ||
    state.listener.work.size ||
    state.clients.size ||
    state.listener.connections.size ||
    state.listener.retirements.size ||
    state.listener.refused ||
    !state.runtime
  )
    throw new Error('Actual closed drained strict assignment HTTPS owner required');
  const contexts = takeM4StrictAssignmentContexts(state.runtime);
  strictOwners.delete(handle);
  state.runtime = undefined;
  return Object.freeze({
    version: 1,
    localQualificationOnly: false,
    constructorName: 'startM4PrivateAssignmentOwner' as const,
    loopbackQualification: false,
    contexts,
    transport: Object.freeze({
      rows: Object.freeze(state.listener.rows.map(row => Object.freeze({ ...row }))),
    }),
  });
}
// Separate fixed qualification constructor; no network request or startup mode chooses it.
export async function startM4LocalQualificationAssignmentOwner(
  configuration: M4AssignmentOwnerConfiguration
): Promise<M4QualificationAssignmentOwner> {
  const captured = captureOwnerConfiguration(configuration, true);
  const runtime = createM4LocalQualificationAssignmentRuntime(captured.runtime);
  const owner = await listen(runtime, captured, true);
  const clientConfiguration = captureM4RelayConfiguration({
    origin: owner.origin,
    ca: captured.tls.cert,
    deadlineMs: captured.relayDeadlineMs,
  });
  function invokeOwned(
    profile: 'ops' | 'legacy-admin' | 'legacy-agent' | 'staff',
    cookie: unknown,
    serialized: unknown,
    observation: unknown
  ): Promise<M4Response<AssignmentResult>> {
    if (owner.state.closed) {
      const parsed = parseM4AssignmentRequest(serialized);
      const request =
        parsed &&
        parsed.command ===
          (profile === 'ops'
            ? 'm4.ops.assign-owner'
            : profile === 'staff'
              ? 'm4.staff.assign-claim'
              : 'm4.legacy.assign-claim') &&
        (profile === 'ops' || parseM4AssignmentObservation(observation))
          ? parsed
          : null;
      return Promise.resolve(
        request
          ? { status: 'indeterminate', operationId: request.operationId }
          : { status: 'denied', reason: 'INVALID_REQUEST' }
      );
    }
    const controller = new AbortController();
    const pending = relayM4AssignmentRequest(
      clientConfiguration,
      profile,
      cookie,
      serialized,
      observation,
      controller.signal
    );
    const tracked = pending.finally(() => owner.state.clients.delete(tracked));
    owner.state.clients.set(tracked, controller);
    return tracked;
  }
  const handle = Object.freeze({
    origin: owner.origin,
    clientConfiguration,
    close: owner.close,
    execute: (cookie: unknown, serialized: unknown) =>
      invokeOwned(
        'ops',
        cookie,
        serialized,
        JSON.stringify({ ip: null, userAgent: null })
      ) as Promise<M4OpsResponse>,
    executeLegacyAdmin: (cookie: unknown, serialized: unknown, observation: unknown) =>
      invokeOwned('legacy-admin', cookie, serialized, observation) as Promise<
        M4Response<LegacyResult>
      >,
    executeLegacyAgent: (cookie: unknown, serialized: unknown, observation: unknown) =>
      invokeOwned('legacy-agent', cookie, serialized, observation) as Promise<
        M4Response<LegacyResult>
      >,
    executeStaff: (cookie: unknown, serialized: unknown, observation: unknown) =>
      invokeOwned('staff', cookie, serialized, observation) as Promise<M4Response<StaffResult>>,
  });
  qualifiedOwners.set(handle, owner.state);
  return handle;
}
export function takeM4OwnedAssignmentOwnerContexts(handle: object) {
  const state = qualifiedOwners.get(handle);
  if (
    !state ||
    !state.closed ||
    !state.drained ||
    state.listener.work.size ||
    state.clients.size ||
    state.listener.connections.size ||
    state.listener.retirements.size ||
    state.listener.refused ||
    !state.runtime
  )
    throw new Error('Actual closed/drained assignment HTTPS owner required');
  const runtime = state.runtime;
  const contexts = takeM4OwnedAssignmentContexts(runtime);
  qualifiedOwners.delete(handle);
  state.runtime = undefined;
  return Object.freeze({
    version: 1,
    localQualificationOnly: true,
    contexts,
    transport: Object.freeze({
      rows: Object.freeze(state.listener.rows.map(row => Object.freeze({ ...row }))),
    }),
  });
}
