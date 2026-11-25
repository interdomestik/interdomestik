import { expect, it, vi } from 'vitest';
import {
  runtimeRole,
  withPaymentPortDatabase,
} from '../../../database/test/exchange-rates.fixture';
import { insert, row, seedSponsorScope, uid } from '../../../database/test/sponsor-test-fixture';
import type { SponsorMailDeps } from './mail-sender';
import { verifySponsorOptOutPrivacy } from './sponsor-opt-out-privacy.test-support';
import {
  addDelivery,
  addEntry,
  addTerm,
  grantSponsorProofAccess,
  outbox,
  roster,
} from './sponsor-privacy.test-support';

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'serializes opt-out consumption and protects held mail and roster evidence under RLS',
  async () => {
    await withPaymentPortDatabase(async ({ admin }) => {
      await grantSponsorProofAccess(admin);
      const a = await seedSponsorScope(admin);
      const b = await seedSponsorScope(admin);
      // Import the application only after the scratch fixture configures its restricted login.
      const { and, eq, sponsorRosterEntries, sql } = await import('@interdomestik/database');
      const { mintTestTenantAuthority } =
        await import('@interdomestik/database/testing/tenant-authority');
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const { optOutByToken } = await import('./opt-out');
      const { runSponsorRetention } = await import('./retention');
      const { runSponsorMailOutbox } = await import('./mail-sender');

      const [posture] = await withTenantAuthority(mintTestTenantAuthority(a.tenant), tx =>
        tx.execute(sql`select current_user as role, rolsuper, rolbypassrls
          from pg_roles where rolname = current_user`)
      );
      expect(posture).toEqual({ role: runtimeRole, rolsuper: false, rolbypassrls: false });
      const otherTenant = await withTenantAuthority(mintTestTenantAuthority(a.tenant), tx =>
        tx
          .select({ id: sponsorRosterEntries.id })
          .from(sponsorRosterEntries)
          .where(
            and(
              eq(sponsorRosterEntries.tenantId, b.tenant),
              eq(sponsorRosterEntries.id, b.sponsor_roster_entries)
            )
          )
          .for('update')
      );
      expect(otherTenant).toEqual([]);

      await verifySponsorOptOutPrivacy(admin, a, b, optOutByToken);

      const held = await addEntry(admin, b, b.sponsor_terms, null, uid());
      const queued = await addDelivery(admin, b, held, 'queued');
      const claimed = await addDelivery(admin, b, held, 'claimed');
      const terminal = await addDelivery(admin, b, held, 'sent');
      const separateSponsor = uid();
      await insert(admin, 'sponsors', { ...row(b, 'sponsors', true), id: separateSponsor });
      const liveTerm = await addTerm(
        admin,
        { ...b, sponsors: separateSponsor },
        '2051-01-01T00:00:00.000Z',
        '2052-01-01T00:00:00.000Z'
      );
      const live = await addEntry(admin, b, liveTerm, b.user, uid());
      const eligible = await addDelivery(admin, b, live, 'queued');
      const heldBefore = await roster(admin, [held]);
      const heldMailBefore = await outbox(admin, [queued, claimed, terminal]);
      const mailNow = new Date('2051-04-01T00:00:00.000Z');
      const deps: SponsorMailDeps = {
        locale: 'en',
        secret: 'synthetic-fixture-secret',
        appUrl: 'https://example.test',
        supportEmail: 'support@example.test',
        formatDate: date => date.toISOString(),
        hasCredential: vi.fn(() => Promise.resolve(false)),
        sendMail: vi.fn(() => Promise.resolve({ ok: true })),
        sendActivation: vi.fn(() => Promise.resolve({ ok: true })),
        reportError: vi.fn(),
      };
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(mailNow);
      try {
        const authority = mintTestTenantAuthority(b.tenant);
        expect(await runSponsorRetention(authority, { now: mailNow })).toEqual({
          state: 'skipped',
          reason: 'sponsor_retention_dormant',
        });
        expect(await roster(admin, [held])).toEqual(heldBefore);
        expect(await outbox(admin, [queued, claimed, terminal])).toEqual(heldMailBefore);
        const outside = mintTestTenantAuthority(b.tenant, { accessTenantId: a.tenant });
        expect(await runSponsorMailOutbox(outside, deps, { now: mailNow, limit: 10 })).toEqual({
          claimed: 0,
          outcomes: {},
        });
        expect(await runSponsorMailOutbox(authority, deps, { now: mailNow, limit: 10 })).toEqual({
          claimed: 4,
          outcomes: { sent: 1, skipped: 3 },
        });
      } finally {
        vi.useRealTimers();
      }
      expect(deps.sendMail).toHaveBeenCalledExactlyOnceWith(
        `${b.user}@example.test`,
        expect.objectContaining({ kind: 'opt_out_confirmation' }),
        expect.any(Function)
      );
      expect(deps.sendActivation).not.toHaveBeenCalled();
      expect(deps.reportError).not.toHaveBeenCalled();
      expect(await roster(admin, [held])).toEqual(heldBefore);
      expect(await outbox(admin, [terminal])).toEqual(
        heldMailBefore.filter(mail => mail.id === terminal)
      );
      const aged = await outbox(admin, [queued, claimed]);
      expect(aged).toHaveLength(2);
      for (const mail of aged) {
        expect(mail).toMatchObject({
          roster_entry_id: held,
          state: 'skipped',
          attempts: mail.id === queued ? 1 : 2,
          terminal_at: expect.anything(),
          lease_until: null,
          last_error_code: 'aged_mail',
        });
      }
      expect((await outbox(admin, [eligible]))[0]).toMatchObject({ state: 'sent', attempts: 1 });
    });
  },
  60_000
);
