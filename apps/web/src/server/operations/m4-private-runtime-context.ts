// Pure source-owned data operations. No owner map, registration or admission exists here.
import { createHash } from 'node:crypto';
import { parseM4AssignmentRequest, type M4AssignmentRequest } from './m4-assignment-protocol';
import type * as Runtime from './m4-private-runtime-types';
import { captureM4PoolTarget } from './m4-pool-posture';
type Profile = 'ops' | 'legacy-admin' | 'legacy-agent' | 'staff';
export type M4LocalAssignmentOwner = {
  closed(): boolean;
  active(): number;
  refused(): boolean;
  captures: Array<
    Readonly<{
      ordinal: number;
      operationId: string;
      requestDigest: string;
      responseDigest: string | null;
      profile: Profile;
      receiver: 'posture-checked-owned-data-drizzle';
      verifier: 'owned-current-store-identity-drizzle';
      configurationIdentityChecked: true;
      capturedAfterPosture: true;
    }>
  >;
};

export function captureM4PrivateRuntimeConfiguration(
  configuration: Runtime.M4PrivateRuntimeConfiguration,
  loopbackQualification: boolean,
  notificationConfiguration?: Readonly<{
    notificationDatabaseURL: string;
    notificationDatabaseDeadlineMs: number;
  }>
) {
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
  return { captured, identityTarget, dataTarget, notificationTarget };
}

export function readM4ClosedAssignmentContexts(owner: M4LocalAssignmentOwner | undefined) {
  if (!owner || !owner.closed() || owner.active() !== 0 || owner.refused())
    throw new Error('M4 actual closed local owner required');
  return Object.freeze({
    version: 1,
    localQualificationOnly: true,
    rows: Object.freeze([...owner.captures]),
  });
}

export function observeM4AssignmentInvocation(
  profile: Profile,
  configuration: Readonly<{ database: unknown; verifySession: unknown }>,
  database: unknown,
  verifySession: unknown,
  identity: unknown,
  data: unknown,
  ordinal: number
): Omit<
  M4LocalAssignmentOwner['captures'][number],
  'operationId' | 'requestDigest' | 'responseDigest'
> {
  if (
    !Object.isFrozen(configuration) ||
    configuration.database !== database ||
    configuration.verifySession !== verifySession ||
    !database ||
    !verifySession ||
    !identity ||
    !data ||
    identity === data
  )
    throw new Error('M4 captured assignment configuration changed');
  return Object.freeze({
    ordinal,
    profile,
    receiver: 'posture-checked-owned-data-drizzle',
    verifier: 'owned-current-store-identity-drizzle',
    configurationIdentityChecked: true,
    capturedAfterPosture: true,
  });
}

export type M4LocalAssignmentCaptureState = {
  budget?: { used: number; refused: boolean };
  refused: boolean;
  rows: M4LocalAssignmentOwner['captures'];
};
// The returned closure lives only in the current owned work; state retains scalar rows only.
export function bindM4AssignmentInvocation(
  state: M4LocalAssignmentCaptureState,
  profile: Profile,
  configuration: Readonly<{ database: unknown; verifySession: unknown }>,
  database: unknown,
  verifySession: unknown,
  identity: unknown,
  data: unknown,
  request: M4AssignmentRequest
) {
  const budget = state.budget;
  if (!budget) return <T>(result: T): T => result;
  try {
    if (state.rows.length >= 128 || budget.refused || budget.used >= 2048) {
      budget.refused = true;
      throw new Error('M4 local assignment context bound');
    }
    const parsed = parseM4AssignmentRequest(JSON.stringify(request));
    if (!parsed || JSON.stringify(parsed) !== JSON.stringify(request))
      throw new Error('M4 captured request changed');
    const row = Object.freeze({
      ...observeM4AssignmentInvocation(
        profile,
        configuration,
        database,
        verifySession,
        identity,
        data,
        state.rows.length + 1
      ),
      operationId: parsed.operationId,
      requestDigest: createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
      responseDigest: null,
    });
    const index = state.rows.length;
    budget.used++;
    state.rows.push(row);
    let completed = false;
    // Retain scalar bookkeeping only; raw DB/verifier/pool references leave at this boundary.
    return <T>(result: T): T => {
      try {
        if (completed || state.rows[index] !== row)
          throw new Error('M4 invocation settlement changed');
        const serialized = JSON.stringify(result);
        if (serialized === undefined) throw new Error('M4 controller return missing');
        completed = true;
        state.rows[index] = Object.freeze({
          ...row,
          responseDigest: createHash('sha256').update(serialized).digest('hex'),
        });
        return result;
      } catch {
        state.refused = true;
        throw new Error('M4 captured assignment settlement changed');
      }
    };
  } catch {
    state.refused = true;
    throw new Error('M4 captured assignment configuration changed');
  }
}
