import * as schema from '@interdomestik/database/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createCurrentStoreSessionVerifier } from '../../lib/auth/current-store-session';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import { createM4OpsAssignmentController, type M4OpsResponse } from './m4-ops-controller';
import { assertM4PoolPosture, captureM4PoolTarget } from './m4-pool-posture';

export type M4PrivateRuntimeConfiguration = Readonly<{
  identityDatabaseURL: string;
  dataDatabaseURL: string;
  issuerBaseURL: string;
  issuerSecret: string;
  operationDeadlineMs: number;
}>;
export type M4PrivateRuntime = Readonly<{
  execute(cookie: unknown, serialized: unknown): Promise<M4OpsResponse>;
  close(): Promise<void>;
}>;
type OwnedOperation = { stop(): void; done: Promise<void> };
const MAX_CONCURRENT_OPERATIONS = 4;

function construct(
  configuration: M4PrivateRuntimeConfiguration,
  loopbackQualification: boolean
): M4PrivateRuntime {
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
  const captured = Object.freeze({ issuerBaseURL, issuerSecret, operationDeadlineMs });
  const active = new Set<OwnedOperation>();
  let closed = false,
    closing: Promise<void> | undefined;

  async function execute(cookie: unknown, serialized: unknown): Promise<M4OpsResponse> {
    const request = parseM4AssignmentRequest(serialized);
    if (!request || request.command !== 'm4.ops.assign-owner')
      return { status: 'denied', reason: 'INVALID_REQUEST' };
    const uncertain: M4OpsResponse = { status: 'indeterminate', operationId: request.operationId };
    if (closed || active.size >= MAX_CONCURRENT_OPERATIONS) return uncertain;
    let identity: postgres.Sql | undefined, data: postgres.Sql | undefined;
    let stopped = false,
      ending: Promise<boolean> | undefined;
    let finish!: () => void, expire!: (value: M4OpsResponse) => void;
    const done = new Promise<void>(resolve => {
      finish = resolve;
    });
    const expiration = new Promise<M4OpsResponse>(resolve => {
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
    const work: Promise<M4OpsResponse> = (async () => {
      try {
        const connection = {
          statement_timeout: captured.operationDeadlineMs,
          lock_timeout: captured.operationDeadlineMs,
          idle_in_transaction_session_timeout: captured.operationDeadlineMs,
          search_path: 'pg_catalog, public',
          row_security: 'on',
        };
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
        const run = createM4OpsAssignmentController({
          database: drizzle(data, { schema }),
          verifySession,
        });
        return await run(cookie, serialized);
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
      closing = Promise.all(pending.map(operation => operation.done)).then(() => undefined);
    }
    return closing;
  }
  return Object.freeze({ execute, close });
}

// Private trusted deployment entry. Every nonlocal connection verifies the server certificate.
export function createM4PrivateRuntime(
  configuration: M4PrivateRuntimeConfiguration
): M4PrivateRuntime {
  return construct(configuration, false);
}
// Separate fixed qualification entry, never selected by a request/HTTP/config mode flag.
// It rejects any endpoint except literal localhost or 127.0.0.1 before creating pools.
export function createM4LocalQualificationRuntime(
  configuration: M4PrivateRuntimeConfiguration
): M4PrivateRuntime {
  return construct(configuration, true);
}
