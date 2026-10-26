import type * as Runtime from './m4-private-runtime-types';
export type * from './m4-private-runtime-types';
import * as schema from '@interdomestik/database/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createCurrentStoreSessionVerifier } from '../../lib/auth/current-store-session';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
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
  parseM4AssignmentObservation,
  type M4Response,
  type AssignmentResult,
  type LegacyResult,
  type StaffResult,
} from './m4-assignment-wire';
import {
  assertM4DriverEnvironment,
  assertM4PoolPosture,
  captureM4PoolTarget,
} from './m4-pool-posture';

type Profile = 'ops' | 'legacy-admin' | 'legacy-agent' | 'staff';
type OwnedOperation = { stop(): void; done: Promise<void> };
const MAX_CONCURRENT_OPERATIONS = 4;

function construct(
  configuration: Runtime.M4PrivateRuntimeConfiguration,
  loopbackQualification: boolean,
  notificationConfiguration?: Readonly<{
    notificationDatabaseURL: string;
    notificationDatabaseDeadlineMs: number;
  }>
): Runtime.M4PrivateRuntime | Runtime.M4PrivateAssignmentRuntime {
  assertM4DriverEnvironment();
  // Snapshot only primitive configuration. No caller factory, pool, callback, principal DTO,
  // arbitrary PostgreSQL option, or per-request transport flag enters this construction.
  const { identityDatabaseURL, dataDatabaseURL, issuerBaseURL, issuerSecret, operationDeadlineMs } =
    configuration;
  if (
    !Number.isSafeInteger(operationDeadlineMs) ||
    operationDeadlineMs < 1 ||
    operationDeadlineMs > 2_147_483_647
  )
    throw new Error('Explicit private M4 operation deadline required');
  try {
    if (
      typeof issuerBaseURL !== 'string' ||
      typeof issuerSecret !== 'string' ||
      issuerSecret.length < 32
    )
      throw new Error();
    const issuer = new URL(issuerBaseURL);
    if (
      !['http:', 'https:'].includes(issuer.protocol) ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash
    )
      throw new Error();
  } catch {
    throw new Error('Invalid private M4 issuer configuration');
  }
  const identityTarget = captureM4PoolTarget(identityDatabaseURL, loopbackQualification);
  const dataTarget = captureM4PoolTarget(dataDatabaseURL, loopbackQualification);
  if (
    identityTarget.login === dataTarget.login ||
    identityTarget.serverKey !== dataTarget.serverKey
  )
    throw new Error('Private M4 requires distinct purpose logins on the same database endpoint');
  const notificationDatabaseDeadlineMs = notificationConfiguration?.notificationDatabaseDeadlineMs;
  const notificationTarget = notificationConfiguration
    ? captureM4PoolTarget(notificationConfiguration.notificationDatabaseURL, loopbackQualification)
    : undefined;
  if (
    notificationTarget &&
    (!Number.isSafeInteger(notificationDatabaseDeadlineMs) ||
      notificationDatabaseDeadlineMs! < 1 ||
      notificationDatabaseDeadlineMs! > 2_147_483_647 ||
      notificationTarget.login === identityTarget.login ||
      notificationTarget.login === dataTarget.login ||
      notificationTarget.serverKey !== dataTarget.serverKey)
  )
    throw new Error(
      'Private assignment notification requires distinct purpose login and explicit DB deadline'
    );
  const captured = Object.freeze({
    issuerBaseURL,
    issuerSecret,
    operationDeadlineMs,
    notificationDatabaseDeadlineMs,
  });
  const active = new Set<OwnedOperation>();
  let closed = false,
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
    profile: Profile,
    cookie: unknown,
    serialized: unknown,
    observation?: unknown
  ): Promise<M4Response<AssignmentResult>> {
    const request = parseM4AssignmentRequest(serialized);
    if (
      !request ||
      request.command !==
        (profile === 'ops'
          ? 'm4.ops.assign-owner'
          : profile === 'staff'
            ? 'm4.staff.assign-claim'
            : 'm4.legacy.assign-claim') ||
      (profile !== 'ops' && !parseM4AssignmentObservation(observation))
    )
      return { status: 'denied', reason: 'INVALID_REQUEST' };
    const uncertain: M4Response<AssignmentResult> = {
      status: 'indeterminate',
      operationId: request.operationId,
    };
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
      if (!ending)
        ending = Promise.allSettled(
          [identity, data]
            .filter((pool): pool is postgres.Sql => Boolean(pool))
            .map(pool => Promise.resolve().then(() => pool.end({ timeout: 0 })))
        ).then(results => results.every(result => result.status === 'fulfilled'));
      return ending;
    }
    const operation: OwnedOperation = {
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
        const connection = {
          statement_timeout: captured.operationDeadlineMs,
          lock_timeout: captured.operationDeadlineMs,
          idle_in_transaction_session_timeout: captured.operationDeadlineMs,
          // A server blocked on a lock must also notice our destroyed client socket.
          // This is not a guarantee of bounded detection under arbitrary network failure.
          client_connection_check_interval: 100,
          search_path: 'pg_catalog, public',
          row_security: 'on',
        };
        assertM4DriverEnvironment();
        identity = postgres(identityTarget.url, {
          max: 1,
          connect_timeout: Math.max(1, Math.ceil(captured.operationDeadlineMs / 1000)),
          ssl: loopbackQualification ? false : { rejectUnauthorized: true },
          connection: { ...connection, application_name: 'interdomestik-m4-identity' },
        });
        data = postgres(dataTarget.url, {
          max: 1,
          connect_timeout: Math.max(1, Math.ceil(captured.operationDeadlineMs / 1000)),
          ssl: loopbackQualification ? false : { rejectUnauthorized: true },
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
        const configuration = { database: drizzle(data, { schema }), verifySession };
        if (profile === 'ops')
          return await createM4OpsAssignmentController(configuration)(cookie, serialized);
        if (profile === 'staff')
          return await createM4StaffAssignmentController(configuration)(
            cookie,
            serialized,
            observation
          );
        if (!assignmentNotifier) return uncertain;
        if (profile === 'legacy-admin')
          return await createM4LegacyAdminAssignmentController({
            ...configuration,
            assignmentNotifier,
          })(cookie, serialized, observation);
        return await createM4LegacyAgentAssignmentController({
          ...configuration,
          assignmentNotifier,
        })(cookie, serialized, observation);
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
      for (const operation of pending) operation.stop();
      closing = Promise.all([
        ...pending.map(operation => operation.done),
        notificationOwner?.close(),
      ]).then(() => undefined);
    }
    return closing;
  }
  const execute = (cookie: unknown, serialized: unknown) =>
    executeProfile('ops', cookie, serialized) as Promise<M4OpsResponse>;
  if (!notificationTarget) return Object.freeze({ execute, close });
  return Object.freeze({
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
      executeProfile('staff', cookie, serialized, observation) as Promise<M4Response<StaffResult>>,
  });
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
