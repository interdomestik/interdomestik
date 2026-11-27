import { randomUUID } from 'node:crypto';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  paymentPortTestSession,
  runSequentially,
  type PaymentPortDatabase,
} from '../../../../database/test/exchange-rates.fixture';

type TestActor = {
  id: string;
  tenantId: string;
  role: string;
  branchId: string | null;
  authority: TenantAuthority;
};

export async function seedSaleParties(admin: PaymentPortDatabase['admin']) {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  await runSequentially([tenantId, otherTenantId], async id => {
    await admin`insert into tenants (id, name, legal_name, country_code)
      values (${id}, 'Synthetic tenant', 'Synthetic tenant', 'MK')`;
  });
  const branch = async (tenant = tenantId) => {
    const id = randomUUID();
    await admin`insert into branches (id, tenant_id, name, slug)
      values (${id}, ${tenant}, 'Synthetic branch', ${id})`;
    return id;
  };
  const homeBranch = await branch();
  const otherBranch = await branch();
  const addUser = async (
    role: string,
    branchId: string | null,
    tenant = tenantId
  ): Promise<TestActor> => {
    const id = randomUUID();
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role,
        branch_id, "createdAt", "updatedAt")
      values (${id}, ${tenant}, 'Synthetic user', ${id + '@example.test'}, true, ${role},
        ${branchId}, now(), now())`;
    return {
      id,
      tenantId: tenant,
      role,
      branchId,
      authority: paymentPortTestSession(tenant, id, role, branchId),
    };
  };

  const owner = await addUser('tenant_admin', null);
  const agent = await addUser('agent', homeBranch);
  const otherAgent = await addUser('agent', homeBranch);
  const staff = await addUser('staff', homeBranch);
  const member = await addUser('member', homeBranch);
  const foreignOwner = await addUser('tenant_admin', null, otherTenantId);
  const foreignMember = await addUser('member', null, otherTenantId);

  const lead = async (agentId = agent.id, branchId = homeBranch, kind = 'individual') => {
    const id = randomUUID();
    await admin`insert into member_leads (id, tenant_id, agent_id, branch_id, lead_kind,
        first_name, last_name, email, phone, updated_at, company_name, consent_notice_version,
        capture_channel, consent_captured_at, consent_captured_by)
      values (${id}, ${tenantId}, ${agentId}, ${branchId}, ${kind}, 'Synthetic', 'Lead',
        ${id + '@example.test'}, '0000000', now(), 'Synthetic Co', 'test', 'agent_assisted',
        now(), ${agentId})`;
    return id;
  };
  const defaultEntity = {
    governingLaw: 'MK' as string | null,
    terms: 'v1' as string | null,
    active: true,
  };
  const entity = async (legal = defaultEntity, tenant = tenantId) => {
    const id = randomUUID();
    await admin`insert into legal_entities (id, tenant_id, legal_name, country_code, governing_law,
      terms_version, is_active) values (${id}, ${tenant}, 'Synthetic Entity', 'MK',
        ${legal.governingLaw}, ${legal.terms}, ${legal.active})`;
    return id;
  };
  const legalEntityId = await entity();
  return {
    tenantId,
    otherTenantId,
    homeBranch,
    otherBranch,
    owner,
    agent,
    otherAgent,
    staff,
    member,
    foreignOwner,
    foreignMember,
    lead,
    addUser,
    entity,
    legalEntityId,
  };
}
