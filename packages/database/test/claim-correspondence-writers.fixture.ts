import type { TestContext } from 'node:test';
import type postgres from 'postgres';

import {
  homeActor,
  homeTenant,
  past,
  restricted,
  withRegisterDb,
  type Connection,
} from './claim-correspondence.fixture';
import {
  foreignBranch,
  importDomain,
  ownBranch,
  runtimePid,
  waitUntilBlocked,
  withDomainPools,
  type Actor,
} from './claim-correspondence-domain.fixture';

type Command<I, T extends object = object> = (
  session: Actor['session'],
  authority: Actor['authority'],
  input: I
) => Promise<({ ok: true } & T) | { ok: false; code: string }>;
export type CaseFields = {
  otherVehicleCountryCode: string | null;
  insuranceProofReference: string | null;
  outsideHandlingParty: string | null;
  coverageVerificationStatus: string;
  caseFollowUpAt: string | null;
};
type Attention = Record<
  string,
  { nextActor: string; overdueFollowUpDueAt: string | null; overdueFollowUpSource?: string }
>;
export type Domain = {
  listClaimCorrespondence: Command<{ claimId: string; page: number; perPage: number }>;
  listRegisterCitationNames: Command<
    { claimId: string; documentIds: string[] },
    { documents: { id: string; name: string }[] }
  >;
  updateGreenCardCaseFields: Command<{ claimId: string; expected: CaseFields } & CaseFields>;
  setCorrespondenceFollowUp: Command<{
    claimId: string;
    correspondenceId: string;
    expectedFollowUpAt: string | null;
    followUpAt: string | null;
  }>;
  revokeCaseAuthority: Command<{ claimId: string; authorityId: string }>;
  recordCaseAuthority: Command<{
    claimId: string;
    correlationId: string;
    kind: string;
    evidenceDocumentId: string;
    version: string;
    grantedAt: string;
  }>;
  getAssignedStaffClaimAttention: (
    session: Actor['session'],
    authority: Actor['authority'],
    claimIds: string[],
    now?: Date
  ) => Promise<Attention>;
};

export const otherStaff = 'wp12-other-staff';
export const branchlessStaff = 'wp12-branchless-staff';
export const member = 'wp12-citation-member';
export const defaults: CaseFields = {
  otherVehicleCountryCode: null,
  insuranceProofReference: null,
  outsideHandlingParty: null,
  coverageVerificationStatus: 'not_checked',
  caseFollowUpAt: null,
};
export const conflict = { ok: false, code: 'conflict' };

async function loadDomain(): Promise<Domain> {
  const [fields, followUp, authorities, root, reads] = await Promise.all([
    importDomain<Pick<Domain, 'updateGreenCardCaseFields'>>('/claims/green-card-case-fields'),
    importDomain<Pick<Domain, 'setCorrespondenceFollowUp'>>('/claims/correspondence'),
    importDomain<Pick<Domain, 'recordCaseAuthority' | 'revokeCaseAuthority'>>(
      '/claims/case-authorities'
    ),
    importDomain<Pick<Domain, 'getAssignedStaffClaimAttention'>>(''),
    importDomain<Pick<Domain, 'listClaimCorrespondence' | 'listRegisterCitationNames'>>(
      '/claims/correspondence-read'
    ),
  ]);
  return {
    updateGreenCardCaseFields: fields.updateGreenCardCaseFields,
    setCorrespondenceFollowUp: followUp.setCorrespondenceFollowUp,
    revokeCaseAuthority: authorities.revokeCaseAuthority,
    recordCaseAuthority: authorities.recordCaseAuthority,
    getAssignedStaffClaimAttention: root.getAssignedStaffClaimAttention,
    ...reads,
  };
}

async function seedBranches(admin: postgres.Sql) {
  await admin`insert into branches (id, tenant_id, name, slug)
    values (${ownBranch}, ${homeTenant}, 'Own branch', 'own'),
           (${foreignBranch}, ${homeTenant}, 'Foreign branch', 'foreign')`;
  await admin`update "user" set branch_id = ${ownBranch} where id = ${homeActor}`;
  await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
    values (${otherStaff}, ${homeTenant}, 'Other staff', 'wp12-other@example.test', true,
      'staff', ${ownBranch}, now(), now()),
      (${branchlessStaff}, ${homeTenant}, 'Branchless staff', 'wp12-branchless@example.test', true,
      'staff', null, now(), now()),
      (${member}, ${homeTenant}, 'Citation member', 'wp12-citation@example.test', true,
      'member', ${ownBranch}, now(), now())`;
}

export async function insertRequest(admin: postgres.Sql, claimId: string, dueAt = past) {
  const [row] = await admin<{ id: string }[]>`insert into claim_information_requests (
    tenant_id, claim_id, correlation_id, requested_information, explanation_for_member,
    due_at, responsible_staff_id, created_by_staff_id, sla_posture
  ) values (${homeTenant}, ${claimId}, gen_random_uuid(), 'Case evidence', 'Please send evidence',
    ${dueAt}, ${homeActor}, ${homeActor}, 'incomplete') returning id`;
  return row.id;
}

/**
 * Runs `command` on the runtime connection while the peer holds `lock`; once the command waits
 * on the peer, `compete` runs in the peer transaction, which then commits.
 */
export async function whilePeerHolds<T>(
  { admin, peer }: Connection,
  lock: (tx: postgres.TransactionSql) => Promise<unknown>,
  command: () => Promise<T>,
  compete: (tx: postgres.TransactionSql) => Promise<unknown>
) {
  let pending: Promise<T> | undefined;
  await restricted(peer, async tx => {
    const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
    await lock(tx);
    pending = command();
    pending.catch(() => undefined);
    await waitUntilBlocked(admin, () => runtimePid(admin), pid);
    await compete(tx);
  });
  return pending!;
}

export async function withWriterRegister(
  t: TestContext,
  work: (connections: Connection, domain: Domain) => Promise<void>
) {
  await withRegisterDb(t, async connections => {
    await seedBranches(connections.admin);
    // The queue read also reads member requests; the fixture role grants only register tables.
    await connections.admin.unsafe(
      `grant select on claim_information_requests, claim_information_request_evidence, case_scoped_access_grants to "${connections.role}"`
    );
    // The domain binds its database client on import: load it once the pools are in place.
    await withDomainPools(connections.admin, connections.runtime, async () =>
      work(connections, await loadDomain())
    );
  });
}
