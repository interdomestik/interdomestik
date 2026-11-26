import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import { PILOT_SWITCH_CATEGORY, PILOT_SWITCH_KEYS } from '@interdomestik/database/pilot-switch';
import {
  account,
  auditLog,
  commercialActionIdempotency,
  freeStartDrafts,
  memberLeads,
  session,
  tenantSettings,
  user,
} from '@interdomestik/database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixtureLegalAcceptance } from '../../e2e/fixtures/legal-acceptance.fixture';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

type ContractDatabaseIdentity = { database: string; started: string };

const tenantId = 'tenant_ks';
const origin = 'http://ida.localhost:3000';
const facts = {
  category: 'vehicle',
  issueType: 'collision',
  incidentDate: '2026-01-12',
  counterparty: 'Contract insurer',
  desiredOutcome: 'repair',
  summary: 'A fixture vehicle needs repair after a collision.',
} as const;

function useContractEnvironment() {
  const DATABASE_URL = process.env.PILOT_INTAKE_CONTRACT_DATABASE_URL;
  const DATABASE_URL_RLS = process.env.PILOT_INTAKE_CONTRACT_DATABASE_URL_RLS;
  if (
    !DATABASE_URL ||
    !DATABASE_URL_RLS ||
    DATABASE_URL === DATABASE_URL_RLS ||
    !readDisposableTargetClass({ ...process.env, DATABASE_URL, DATABASE_URL_RLS })
  ) {
    throw new Error(
      'The public intake contract requires separate disposable owner and runtime URLs.'
    );
  }
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  vi.stubEnv('DATABASE_URL_RLS', DATABASE_URL_RLS);
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'public-intake-contract-fixture-secret');
  vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', tenantId);
  vi.stubEnv('IDENTITY_PUBLIC_SIGN_UP', undefined);
  request.headers = new Headers({ host: new URL(origin).host, origin });
}

function businessForm(
  email: string,
  key: string,
  onboardingTenant: 'tenant_ks' | 'tenant_mk' = tenantId
) {
  const values = {
    firstName: 'Fixture',
    lastName: 'Contact',
    companyName: 'Contract company',
    email,
    phone: '+38349000000',
    teamSize: '10',
    onboardingTenant,
    consent: 'yes',
    _idempotencyKey: key,
  };
  const form = new FormData();
  Object.entries(values).forEach(([name, value]) => form.set(name, value));
  return form;
}

describe.runIf(process.env.REQUIRE_PUBLIC_INTAKE_CONTRACT === '1')(
  'pilot public intake closures on isolated local Postgres',
  () => {
    it('refuses direct public and draft writes while an existing account can sign in, read, and delete', async () => {
      useContractEnvironment();
      const { dbAdmin, dbRls } = await import('@interdomestik/database/db');
      const [
        { authorizePublicSiteTenant },
        { withTenantAuthority },
        { auth },
        { authProviders },
        { resolvePublicAdmissionTenant },
        { isPublicIntakeOpenForTenant },
        { submitFreeStartIntake },
        { generateClaimPackAction },
        { submitBusinessMembershipLead },
        drafts,
      ] = await Promise.all([
        import('@interdomestik/database'),
        import('@interdomestik/database/tenant-authority-context'),
        import('@/lib/auth'),
        import('@/lib/auth/providers'),
        import('@/lib/tenant/public-admission-tenant'),
        import('@/lib/tenant/public-intake-admission'),
        import('./free-start.core'),
        import('./claim-pack.core'),
        import('@/lib/actions/business-membership-lead'),
        import('./free-start-drafts'),
      ]);
      const intakeKey = randomUUID();
      const companyKey = randomUUID();
      const ownerUserId = randomUUID();
      const draftId = randomUUID();
      const email = `pilot-intake-${ownerUserId}@example.test`;
      const leadEmail = `pilot-intake-lead-${ownerUserId}@example.test`;
      const password = 'Fixture-Password-Only1!';
      const reservations = inArray(commercialActionIdempotency.idempotencyKey, [
        intakeKey,
        companyKey,
      ]);
      const ownedDrafts = eq(freeStartDrafts.ownerUserId, ownerUserId);
      const existingSettings = and(
        eq(tenantSettings.tenantId, tenantId),
        eq(tenantSettings.category, PILOT_SWITCH_CATEGORY),
        inArray(tenantSettings.key, [...PILOT_SWITCH_KEYS])
      );
      const fixtureSettings = PILOT_SWITCH_KEYS.map(key => ({
        id: randomUUID(),
        tenantId,
        category: PILOT_SWITCH_CATEGORY,
        key,
        value: { enabled: false, revision: 2 },
      }));
      const now = new Date();
      let previous: (typeof tenantSettings.$inferSelect)[] | undefined;

      try {
        expect(resolvePublicAdmissionTenant(request.headers)).toBe(tenantId);
        const authority = await authorizePublicSiteTenant(tenantId);
        if (!authority)
          throw new Error('The public intake contract requires the active KS tenant.');
        const [owner] = await dbAdmin.execute<ContractDatabaseIdentity>(sql`
          select current_database() as database,
            extract(epoch from pg_postmaster_start_time())::text as started
        `);
        const [posture] = await withTenantAuthority(authority, tx =>
          tx.execute<ContractDatabaseIdentity & { bypass: boolean }>(sql`
            select current_database() as database,
              extract(epoch from pg_postmaster_start_time())::text as started,
              rolsuper or rolbypassrls as bypass
            from pg_roles where rolname = current_user
          `)
        );
        expect(owner).toBeDefined();
        expect(posture).toEqual({ ...owner, bypass: false });
        previous = await dbAdmin.select().from(tenantSettings).where(existingSettings);

        // A positive control ensures the request and restricted role can see the tenant's switch.
        for (const setting of fixtureSettings) {
          await dbAdmin
            .insert(tenantSettings)
            .values({ ...setting, value: { enabled: true, revision: 1 } })
            .onConflictDoUpdate({
              target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
              set: { value: { enabled: true, revision: 1 } },
            });
        }
        expect(await isPublicIntakeOpenForTenant(tenantId)).toBe(true);
        expect(
          await submitBusinessMembershipLead(null, businessForm(leadEmail, companyKey, 'tenant_mk'))
        ).toMatchObject({ success: false, code: 'CLASSIFICATION_CONFLICT' });
        await dbAdmin
          .update(tenantSettings)
          .set({ value: { enabled: false, revision: 2 } })
          .where(existingSettings);

        await dbAdmin.insert(user).values({
          id: ownerUserId,
          tenantId,
          email,
          name: 'Pilot intake contract owner',
          role: 'member',
          emailVerified: true,
          tenantClassificationPending: false,
          createdAt: now,
          updatedAt: now,
        });
        await fixtureLegalAcceptance('seed', [{ id: ownerUserId, tenantId, email }]);
        await dbAdmin.insert(account).values({
          id: randomUUID(),
          accountId: email,
          providerId: 'credential',
          userId: ownerUserId,
          password: await authProviders.emailAndPassword.password.hash(password),
          createdAt: now,
          updatedAt: now,
        });
        await dbAdmin.insert(freeStartDrafts).values({
          id: draftId,
          tenantId,
          accessTenantId: tenantId,
          ownerUserId,
          clientRequestId: randomUUID(),
          resumeStep: 'preview',
          ...facts,
        });

        expect(await submitFreeStartIntake(facts, intakeKey)).toMatchObject({
          success: false,
          code: 'CLOSED',
          error: 'CLOSED',
        });
        expect(
          await generateClaimPackAction({
            claimType: 'vehicle',
            answers: { incidentDate: facts.incidentDate, description: facts.summary },
          })
        ).toMatchObject({ success: false, code: 'CLOSED' });
        expect(
          await submitBusinessMembershipLead(null, businessForm(leadEmail, companyKey))
        ).toMatchObject({ success: false, code: 'CLOSED' });
        expect(
          await dbAdmin.select().from(commercialActionIdempotency).where(reservations)
        ).toEqual([]);
        expect(
          await dbAdmin.select().from(memberLeads).where(eq(memberLeads.email, leadEmail))
        ).toEqual([]);

        const signedIn = await auth.handler(
          new Request(`${origin}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: new Headers({
              ...Object.fromEntries(request.headers),
              'content-type': 'application/json',
            }),
            body: JSON.stringify({ email, password }),
          })
        );
        expect(signedIn.status).toBe(200);
        const cookie = signedIn.headers
          .getSetCookie()
          .map(value => value.split(';', 1)[0])
          .join('; ');
        expect(cookie.length).toBeGreaterThan(0);
        request.headers.set('cookie', cookie);
        const expectedContext = { ownerUserId, tenantId };
        const payload = { ...facts, expectedContext, resumeStep: 'details' };
        expect(
          await drafts.createFreeStartDraft({ ...payload, clientRequestId: randomUUID() })
        ).toMatchObject({ ok: false, code: 'CLOSED' });
        expect(
          await drafts.updateFreeStartDraft({ ...payload, id: draftId, expectedVersion: 1 })
        ).toMatchObject({ ok: false, code: 'CLOSED' });
        expect(
          await dbAdmin
            .select({ id: freeStartDrafts.id, version: freeStartDrafts.version })
            .from(freeStartDrafts)
            .where(ownedDrafts)
        ).toEqual([{ id: draftId, version: 1 }]);
        expect(await drafts.listFreeStartDrafts({ expectedContext })).toMatchObject({
          ok: true,
          items: [{ id: draftId }],
        });
        expect(await drafts.resumeFreeStartDraft({ id: draftId, expectedContext })).toMatchObject({
          ok: true,
          draft: { id: draftId },
        });
        expect(
          await drafts.deleteFreeStartDraft({ id: draftId, expectedVersion: 1 })
        ).toMatchObject({ ok: true, id: draftId });
        expect(await dbAdmin.select().from(freeStartDrafts).where(ownedDrafts)).toEqual([]);
      } finally {
        try {
          if (previous) {
            await dbAdmin.delete(auditLog).where(eq(auditLog.actorId, ownerUserId));
            await dbAdmin.delete(commercialActionIdempotency).where(reservations);
            await dbAdmin.delete(memberLeads).where(eq(memberLeads.email, leadEmail));
            await dbAdmin.delete(freeStartDrafts).where(ownedDrafts);
            await dbAdmin.delete(session).where(eq(session.userId, ownerUserId));
            await dbAdmin.delete(account).where(eq(account.userId, ownerUserId));
            await fixtureLegalAcceptance('clean', [{ id: ownerUserId, tenantId, email }]);
            await dbAdmin.delete(user).where(eq(user.id, ownerUserId));
            await dbAdmin.delete(tenantSettings).where(
              inArray(
                tenantSettings.id,
                fixtureSettings.map(row => row.id)
              )
            );
            for (const row of previous) {
              await dbAdmin
                .update(tenantSettings)
                .set({ value: row.value, updatedAt: row.updatedAt })
                .where(eq(tenantSettings.id, row.id));
            }
          }
        } finally {
          vi.unstubAllEnvs();
          await Promise.all([dbAdmin.$client.end(), dbRls.$client.end()]);
        }
      }
    }, 20_000);
  }
);
