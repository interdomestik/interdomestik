import { randomUUID } from 'node:crypto';
import { withDisposableClient } from '../disposable-client';
import { e2eEmail } from '../e2e-users';
import legalVersionRows from '../legal-document-versions.json';
import { seedCleanupIdentities } from '../seed-utils/identity-cleanup';
import { buildWorkloadUsers } from '../seed-workload/user-fixtures';
import { assertSeedTargetAllowed, importSeedDatabase } from '../seed-target-guard';
/**
 * Contract:
 * - seed:golden is immutable and baseline-only
 * - seed:workload is additive and self-cleaning
 * - seeds must never reference each other's IDs
 *
 * Transaction boundary:
 * - This preserves the historical non-transactional seed flow. Each extracted
 *   step uses the same shared db client and awaits sequentially in this file.
 */
import { inArray, sql } from 'drizzle-orm';
import type { SeedConfig } from '../seed-types';
import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { seedAgentAssignments } from './agent-assignments';
import { seedAgentSettings } from './agent-settings';
import { seedClaims } from './claims';
import { seedLeads } from './leads';
import { seedMemberCounters } from './member-counters';
import { seedMemberships } from './memberships';
import { seedTenants, seedBranches } from './tenants-branches';
import { seedTrackingTokens } from './tracking-tokens';
import type { SeedGoldenContext, SeedGoldenStepName } from './types';
import { UNACCEPTED_MEMBER_ID, seedUsers } from './users';

export { buildSeededMembershipCardIdentifiers } from './membership-cards';

export const SEED_GOLDEN_STEP_ORDER: readonly SeedGoldenStepName[] = [
  'cleanup',
  'tenants',
  'branches',
  'users',
  'agent-assignments',
  'memberships',
  'agent-settings',
  'claims',
  'leads',
  'tracking-tokens',
  'member-counters',
] as const;

export interface SeedGoldenModules {
  cleanup(context: SeedGoldenContext): Promise<void>;
  tenants(context: SeedGoldenContext): Promise<void>;
  branches(context: SeedGoldenContext): Promise<void>;
  users(context: SeedGoldenContext): Promise<void>;
  agentAssignments(context: SeedGoldenContext): Promise<void>;
  memberships(context: SeedGoldenContext): Promise<void>;
  agentSettings(context: SeedGoldenContext): Promise<void>;
  claims(context: SeedGoldenContext): Promise<void>;
  leads(context: SeedGoldenContext): Promise<void>;
  trackingTokens(context: SeedGoldenContext): Promise<void>;
  memberCounters(context: SeedGoldenContext): Promise<void>;
}

export const seedGoldenModules: SeedGoldenModules = {
  cleanup: async ({ db, schema }) => {
    await cleanupByPrefixes(db, schema, ['golden_', 'pack_ks_', 'member_']);
    await db
      .delete(schema.claims)
      .where(inArray(schema.claims.claimNumber, ['CLM-MK-2026-000001', 'CLM-XK-2026-800001']));
  },
  tenants: seedTenants,
  branches: seedBranches,
  users: seedUsers,
  agentAssignments: seedAgentAssignments,
  memberships: seedMemberships,
  agentSettings: seedAgentSettings,
  claims: seedClaims,
  leads: seedLeads,
  trackingTokens: seedTrackingTokens,
  memberCounters: seedMemberCounters,
};

export async function runSeedGoldenSteps(
  context: SeedGoldenContext,
  modules: SeedGoldenModules = seedGoldenModules
) {
  await modules.cleanup(context);
  await modules.tenants(context);
  await modules.branches(context);
  await modules.users(context);
  await modules.agentAssignments(context);
  await modules.memberships(context);
  console.log('📝 Seeding Claims Pack (Ops Verification)...');
  await modules.agentSettings(context);
  await modules.claims(context);
  await modules.leads(context);
  await modules.trackingTokens(context);
  await modules.memberCounters(context);
}

export async function seedGolden(config: SeedConfig) {
  assertSeedTargetAllowed(process.env);
  console.log('🌱 Starting Golden Seed (Baseline)...');

  const { db } = await importSeedDatabase();
  const schema = await import('../schema');

  await runSeedGoldenSteps({ at: config.at, db, schema, sql });

  console.log('✅ Golden Seed Baseline & KS Pack Complete!');
}

// Pure module - CLI execution removed. Use seed.ts runner only.

function legalAcceptanceSeedIdentities() {
  const fullMembers = (['mk', 'ks'] as const).flatMap(country => {
    const goldenMemberCount = country === 'mk' ? 2 : 3;
    return Array.from({ length: 9 }, (_, offset) => {
      const number = offset + 1;
      const prefix = number <= goldenMemberCount ? 'golden' : 'full';
      const email = e2eEmail(`member.${country}.${number}`, 'full');
      return { id: `${prefix}_${country}_member_${number}`, tenantId: `tenant_${country}`, email };
    });
  });
  return [...seedCleanupIdentities(), ...buildWorkloadUsers(), ...fullMembers].map(identity => ({
    id: identity.id,
    tenantId: identity.tenantId,
    email: identity.email,
    legacyEmail: 'legacyEmail' in identity ? identity.legacyEmail : identity.email,
  }));
}

export async function cleanSeededLegalAcceptance() {
  return withDisposableClient(
    process.env.DATABASE_URL ?? '',
    { applicationName: 'wp13_seed_acceptance_cleanup' },
    client =>
      client.begin(async tx => {
        const [lookup] = await tx<{ needed: boolean }[]>`
        select exists (
          select 1 from public.legal_acceptances a
          join public."user" u on u.id = a.subject_user_id and u.tenant_id = a.tenant_id
          join jsonb_to_recordset(${tx.json(legalAcceptanceSeedIdentities())}::jsonb)
            as fixture(id text, "tenantId" text, email text, "legacyEmail" text)
            on u.id = fixture.id and u.tenant_id = fixture."tenantId"
            and u.email in (fixture.email, fixture."legacyEmail")
        ) as needed
      `;
        if (!lookup.needed) return;

        // Use the guarded disposable connection's owner rights for RLS, with the trigger's
        // independent role opt-in confined to this transaction.
        await tx`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'interdomestik_seed_cleanup') then
            create role interdomestik_seed_cleanup nologin;
          end if;
        end $$
      `;
        const [membership] = await tx<{ member: boolean }[]>`
        select pg_has_role(current_user, 'interdomestik_seed_cleanup', 'MEMBER') as member
      `;
        if (!membership.member) await tx`grant interdomestik_seed_cleanup to current_user`;
        await tx`
        delete from public.legal_acceptances a
        using public."user" u, jsonb_to_recordset(${tx.json(legalAcceptanceSeedIdentities())}::jsonb)
          as fixture(id text, "tenantId" text, email text, "legacyEmail" text)
        where u.id = a.subject_user_id and u.tenant_id = a.tenant_id
          and u.id = fixture.id and u.tenant_id = fixture."tenantId"
          and u.email in (fixture.email, fixture."legacyEmail")
      `;
        if (!membership.member) await tx`revoke interdomestik_seed_cleanup from current_user`;
      })
  );
}

export async function seedLegalAcceptance() {
  return withDisposableClient(
    process.env.DATABASE_URL ?? '',
    { applicationName: 'wp13_seed_acceptance' },
    client => {
      const versions = legalVersionRows.filter(row => row.locale === 'en');
      return client`
        insert into public.legal_acceptances
          (id, tenant_id, subject_user_id, document_kind, document_version, locale, text_sha256, source_surface)
        select ${randomUUID()} || ':' || u.id || ':' || version.kind,
          u.tenant_id, u.id, version.kind, version.version, version.locale, version."textSha256", 'member_activation'
        from public."user" u
        cross join jsonb_to_recordset(${client.json(versions)}::jsonb)
          as version(kind text, version text, locale text, "textSha256" text)
        where u.role in ('member', 'user') and u.id <> ${UNACCEPTED_MEMBER_ID}
          and exists (
            select 1 from jsonb_to_recordset(${client.json(legalAcceptanceSeedIdentities())}::jsonb)
              as fixture(id text, "tenantId" text, email text, "legacyEmail" text)
            where u.id = fixture.id and u.tenant_id = fixture."tenantId"
              and u.email in (fixture.email, fixture."legacyEmail")
          )
        on conflict (tenant_id, subject_user_id, document_kind, document_version) do nothing
      `;
    }
  );
}
