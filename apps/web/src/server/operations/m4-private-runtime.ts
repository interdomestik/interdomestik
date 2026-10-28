import type * as Runtime from './m4-private-runtime-types';
export type * from './m4-private-runtime-types';
import * as schema from '@interdomestik/database/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createCurrentStoreSessionVerifier } from '../../lib/auth/current-store-session';
import { prepareM4RuntimeCommand, captureM4ConnectionOptions } from './m4-runtime-command';
import { settleM4OwnedPools, stopM4OwnedOperations } from './m4-runtime-retirement';
import {
  createM4OpsAssignmentController,
  createM4LegacyAdminAssignmentController,
  createM4LegacyAgentAssignmentController,
  createM4StaffAssignmentController,
  type M4OpsResponse,
} from './m4-ops-controller';
import { createM4AssignmentPostcommitNotifier } from './m4-assignment-postcommit';
import { createM4NotificationDatabaseOwner } from './m4-notification-runtime';
import {
  type M4Response,
  type AssignmentResult,
  type LegacyResult,
  type StaffResult,
} from './m4-assignment-wire';
import {
  assertM4DriverEnvironment,
  assertM4PoolPosture,
  captureM4DatabaseTls,
} from './m4-pool-posture';

import {
  captureM4PrivateRuntimeConfiguration,
  bindM4AssignmentInvocation,
  type M4LocalAssignmentCaptureState,
  readM4ClosedAssignmentContexts,
  readM4StrictAssignmentContexts,
  type M4LocalAssignmentOwner,
} from './m4-private-runtime-context';

const MAX_CONCURRENT_OPERATIONS = 4;

const strictObservationRequests = new WeakSet<object>();
const strictContextOwners = new WeakMap<object, M4LocalAssignmentOwner>();
const qualifiedContextBudget = { used: 0, refused: false };
const qualifiedContextOwners = new WeakMap<object, M4LocalAssignmentOwner>();

// One-use observation of actual closed local constructors, never caller-supplied evidence.
export function takeM4OwnedAssignmentContexts(runtime: object) {
  const observation = readM4ClosedAssignmentContexts(qualifiedContextOwners.get(runtime));
  qualifiedContextOwners.delete(runtime);
  return observation;
}

// Fixed observed entry invokes the genuine strict constructor; no caller token or callback.
export function createM4ObservedPrivateAssignmentRuntime(
  configuration: Runtime.M4PrivateAssignmentRuntimeConfiguration
): Runtime.M4PrivateAssignmentRuntime {
  const captured = Object.freeze({ ...configuration });
  strictObservationRequests.add(captured);
  try {
    return createM4PrivateAssignmentRuntime(captured);
  } finally {
    strictObservationRequests.delete(captured);
  }
}
export function takeM4StrictAssignmentContexts(runtime: object) {
  const observation = readM4StrictAssignmentContexts(strictContextOwners.get(runtime));
  strictContextOwners.delete(runtime);
  return observation;
}

function construct(
  configuration: Runtime.M4PrivateRuntimeConfiguration,
  loopbackQualification: boolean,
  notificationConfiguration?: Readonly<{
    notificationDatabaseURL: string;
    notificationDatabaseDeadlineMs: number;
  }>
): Runtime.M4PrivateRuntime | Runtime.M4PrivateAssignmentRuntime {
  assertM4DriverEnvironment();
  const { captured, identityTarget, dataTarget, notificationTarget } =
    captureM4PrivateRuntimeConfiguration(
      configuration,
      loopbackQualification,
      notificationConfiguration
    );
  const active = new Set<Runtime.M4OwnedOperation>();
  const strictObservation =
    !loopbackQualification && strictObservationRequests.delete(configuration);
  const contextCaptures: M4LocalAssignmentCaptureState = {
    budget: loopbackQualification
      ? qualifiedContextBudget
      : strictObservation
        ? { used: 0, refused: false }
        : undefined,
    refused: false,
    rows: [],
  };
  function ownRuntime<T extends object>(runtime: T): T {
    if (loopbackQualification || strictObservation)
      (loopbackQualification ? qualifiedContextOwners : strictContextOwners).set(runtime, {
        closed: () => closed && closeDrained,
        active: () => active.size,
        refused: () => contextCaptures.refused || contextCaptures.budget!.refused,
        captures: contextCaptures.rows,
      });
    return runtime;
  }
  let closed = false,
    closeDrained = false,
    closing: Promise<void> | undefined;

  const notificationOwner = notificationTarget
    ? createM4NotificationDatabaseOwner({
        databaseURL: notificationTarget.url,
        deadlineMs: captured.notificationDatabaseDeadlineMs!,
        loopbackQualification,
      })
    : undefined;
  const assignmentNotifier = notificationOwner
    ? createM4AssignmentPostcommitNotifier(notificationOwner.open)
    : undefined;

  async function executeProfile(
    profile: Runtime.M4AssignmentProfile,
    cookie: unknown,
    serialized: unknown,
    observation?: unknown
  ): Promise<M4Response<AssignmentResult>> {
    const admission = prepareM4RuntimeCommand(profile, serialized, observation);
    if (!admission) return { status: 'denied', reason: 'INVALID_REQUEST' };
    const { request, uncertain } = admission;
    if (closed || active.size >= MAX_CONCURRENT_OPERATIONS) return uncertain;
    let identity: postgres.Sql | undefined, data: postgres.Sql | undefined;
    let stopped = false,
      ending: Promise<boolean> | undefined;
    let finish!: () => void, expire!: (value: M4Response<AssignmentResult>) => void;
    const done = new Promise<void>(resolve => {
      finish = resolve;
    });
    const expiration = new Promise<M4Response<AssignmentResult>>(resolve => {
      expire = resolve;
    });
    function endOwnedPools(): Promise<boolean> {
      if (!ending) ending = settleM4OwnedPools(identity, data);
      return ending;
    }
    const operation: Runtime.M4OwnedOperation = {
      done,
      stop() {
        stopped = true;
        expire(uncertain);
        // The same memoized termination is awaited below; no rejection is left unhandled.
        void endOwnedPools();
      },
    };
    active.add(operation);
    // This is the configured business deadline, not the driver recovery experiment's 5s bound.
    const timer = setTimeout(operation.stop, captured.operationDeadlineMs);
    const work: Promise<M4Response<AssignmentResult>> = (async () => {
      try {
        const connection = captureM4ConnectionOptions(captured.operationDeadlineMs);
        assertM4DriverEnvironment();
        identity = postgres(identityTarget.url, {
          max: 1,
          connect_timeout: Math.max(1, Math.ceil(captured.operationDeadlineMs / 1000)),
          ssl: loopbackQualification ? false : captureM4DatabaseTls(identityTarget),
          connection: { ...connection, application_name: 'interdomestik-m4-identity' },
        });
        data = postgres(dataTarget.url, {
          max: 1,
          connect_timeout: Math.max(1, Math.ceil(captured.operationDeadlineMs / 1000)),
          ssl: loopbackQualification ? false : captureM4DatabaseTls(dataTarget),
          connection: { ...connection, application_name: 'interdomestik-m4-data' },
        });
        await Promise.all([
          assertM4PoolPosture(identity, identityTarget),
          assertM4PoolPosture(data, dataTarget),
        ]);
        if (stopped) return uncertain;
        const verifySession = createCurrentStoreSessionVerifier({
          database: drizzle(identity, { schema }),
          issuerBaseURL: captured.issuerBaseURL,
          issuerSecret: captured.issuerSecret,
        });
        const database = drizzle(data, { schema });
        const configuration = Object.freeze({ database, verifySession });
        const observedInvocation = bindM4AssignmentInvocation(
          contextCaptures,
          profile,
          configuration,
          database,
          verifySession,
          identity,
          data,
          request
        );
        if (profile === 'ops')
          return observedInvocation(
            await createM4OpsAssignmentController(configuration)(cookie, serialized)
          );
        if (profile === 'staff')
          return observedInvocation(
            await createM4StaffAssignmentController(configuration)(cookie, serialized, observation)
          );
        if (!assignmentNotifier) return uncertain;
        if (profile === 'legacy-admin')
          return observedInvocation(
            await createM4LegacyAdminAssignmentController(
              Object.freeze({
                ...configuration,
                assignmentNotifier,
              })
            )(cookie, serialized, observation)
          );
        return observedInvocation(
          await createM4LegacyAgentAssignmentController(
            Object.freeze({
              ...configuration,
              assignmentNotifier,
            })
          )(cookie, serialized, observation)
        );
      } catch {
        return uncertain;
      }
    })();
    try {
      const result = await Promise.race([work, expiration]);
      clearTimeout(timer);
      const ended = await endOwnedPools();
      // A qualified driver must settle every owned admission when terminated. Await that
      // settlement instead of abandoning a still-running transaction or freeing its slot early.
      await work;
      return stopped || !ended ? uncertain : result;
    } finally {
      clearTimeout(timer);
      await endOwnedPools();
      active.delete(operation);
      finish();
    }
  }
  function close(): Promise<void> {
    if (!closing) {
      closed = true;
      const pending = [...active];
      closing = stopM4OwnedOperations(pending, notificationOwner).then(() => {
        closeDrained = true;
      });
    }
    return closing;
  }
  const execute = (cookie: unknown, serialized: unknown) =>
    executeProfile('ops', cookie, serialized) as Promise<M4OpsResponse>;
  if (!notificationTarget) return ownRuntime(Object.freeze({ execute, close }));
  return ownRuntime(
    Object.freeze({
      execute,
      close,
      executeLegacyAdmin: (cookie: unknown, serialized: unknown, observation: unknown) =>
        executeProfile('legacy-admin', cookie, serialized, observation) as Promise<
          M4Response<LegacyResult>
        >,
      executeLegacyAgent: (cookie: unknown, serialized: unknown, observation: unknown) =>
        executeProfile('legacy-agent', cookie, serialized, observation) as Promise<
          M4Response<LegacyResult>
        >,
      executeStaff: (cookie: unknown, serialized: unknown, observation: unknown) =>
        executeProfile('staff', cookie, serialized, observation) as Promise<
          M4Response<StaffResult>
        >,
    })
  );
}

// Private trusted deployment entry. Every nonlocal connection verifies the server certificate.
export function createM4PrivateRuntime(
  configuration: Runtime.M4PrivateRuntimeConfiguration
): Runtime.M4PrivateRuntime {
  return construct(configuration, false);
}
// Separate fixed qualification entry, never selected by a request/HTTP/config mode flag.
// It rejects any endpoint except literal localhost or 127.0.0.1 before creating pools.
export function createM4LocalQualificationRuntime(
  configuration: Runtime.M4PrivateRuntimeConfiguration
): Runtime.M4PrivateRuntime {
  return construct(configuration, true);
}

// Expanded constructors are fixed trusted entry points. Existing ops constructors stay unchanged.
export function createM4PrivateAssignmentRuntime(
  configuration: Runtime.M4PrivateAssignmentRuntimeConfiguration
): Runtime.M4PrivateAssignmentRuntime {
  return construct(configuration, false, configuration) as Runtime.M4PrivateAssignmentRuntime;
}
export function createM4LocalQualificationAssignmentRuntime(
  configuration: Runtime.M4PrivateAssignmentRuntimeConfiguration
): Runtime.M4PrivateAssignmentRuntime {
  return construct(configuration, true, configuration) as Runtime.M4PrivateAssignmentRuntime;
}
