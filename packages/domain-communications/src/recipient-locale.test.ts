import type { TenantTransaction } from '@interdomestik/database';
import { ROLES } from '@interdomestik/shared-auth';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { paymentPortTestScheduledAuthority } from '../../database/test/exchange-rates.fixture';
import {
  authorizeVerifiedRecipientInTx,
  captureVerifiedRecipientInTx,
  resolveRecipientLocale,
} from './recipient-locale';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));

describe('resolveRecipientLocale', () => {
  it.each([
    ['tenant_mk', [{ locale: 'de' }], 'de'],
    ['tenant_mk', [{ locale: null }], 'mk'],
    ['pilot-mk', [], 'en'],
    ['tenant_ks', [{ locale: null }], 'sq'],
    ['other-tenant', [], 'sq'],
  ])('applies recipient, tenant and Albanian fallback for %s', async (tenantId, rows, locale) => {
    const where = vi.fn().mockResolvedValue(rows);
    const tx = { select: () => ({ from: () => ({ where }) }) } as unknown as TenantTransaction;
    expect(await resolveRecipientLocale(tx, tenantId, 'recipient')).toBe(locale);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual([
      tenantId,
      'recipient',
    ]);
  });
});

const tenantId = 'recipient-tenant';
const authority = paymentPortTestScheduledAuthority(tenantId);
const member = 'recipient-member';
const lease = 'recipient-lease';
const account = { email: 'member@example.com', verified: true, xmin: '1', ctid: '(0,1)' };
const preference = { locale: 'de', xmin: '2', ctid: '(0,2)' };

function recipientTx(
  accounts: Array<typeof account> = [account],
  preferences: Array<typeof preference> = [preference]
) {
  const userQuery = vi.fn().mockResolvedValue(accounts);
  const localeQuery = vi.fn().mockResolvedValue(preferences);
  const userWhere = vi.fn().mockReturnValue({ for: userQuery });
  const localeWhere = vi.fn().mockReturnValue({ for: localeQuery });
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: () => ({ where: userWhere }) })
    .mockReturnValueOnce({ from: () => ({ where: localeWhere }) });
  const execute = vi
    .fn()
    .mockResolvedValue([{ home: tenantId, access: tenantId, isolation: 'read committed' }]);
  return {
    tx: { execute, select } as unknown as TenantTransaction,
    select,
    userQuery,
    localeQuery,
    userWhere,
    localeWhere,
  };
}

describe('verified recipient snapshot', () => {
  async function capture() {
    const { tx } = recipientTx();
    const result = await captureVerifiedRecipientInTx(tx, authority, member, lease);
    if (!result.ok) throw new Error(result.code);
    return result.handle;
  }

  it.each(['sq', 'en', 'sr', 'mk', 'de'])(
    'captures and authorizes stored locale %s',
    async locale => {
      const claim = recipientTx([account], [{ ...preference, locale }]);
      const result = await captureVerifiedRecipientInTx(claim.tx, authority, member, lease);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.code);
      expect(Object.isFrozen(result.handle)).toBe(true);
      expect(JSON.stringify(result.handle)).toBe('{}');

      const dispatch = recipientTx([account], [{ ...preference, locale }]);
      await expect(
        authorizeVerifiedRecipientInTx(dispatch.tx, authority, member, lease, result.handle)
      ).resolves.toEqual({ ok: true, recipient: { email: account.email, locale } });

      for (const phase of [claim, dispatch]) {
        expect(phase.userQuery).toHaveBeenCalledExactlyOnceWith('share');
        expect(phase.localeQuery).toHaveBeenCalledExactlyOnceWith('share');
        const dialect = new PgDialect();
        expect(dialect.sqlToQuery(phase.userWhere.mock.calls[0][0]).params).toEqual([
          tenantId,
          member,
          ROLES.member,
        ]);
        expect(dialect.sqlToQuery(phase.localeWhere.mock.calls[0][0]).params).toEqual([
          tenantId,
          member,
        ]);
      }
    }
  );

  it.each([
    ['missing account', [], [preference], 'recipient_missing'],
    ['blank mailbox', [{ ...account, email: ' ' }], [preference], 'recipient_missing'],
    ['malformed mailbox', [{ ...account, email: 'member@' }], [preference], 'recipient_missing'],
    [
      'multiple mailboxes',
      [{ ...account, email: 'one@example.com,two@example.com' }],
      [preference],
      'recipient_missing',
    ],
    [
      'suppressed mailbox',
      [{ ...account, email: 'member@example.invalid' }],
      [preference],
      'recipient_missing',
    ],
    ['unverified mailbox', [{ ...account, verified: false }], [preference], 'recipient_unverified'],
    ['absent preference', [account], [], 'recipient_locale_unavailable'],
    [
      'unsupported preference',
      [account],
      [{ ...preference, locale: 'fr' }],
      'recipient_locale_unavailable',
    ],
  ] as const)('refuses a %s in both phases', async (_label, accounts, preferences, code) => {
    const handle = await capture();
    const claim = recipientTx([...accounts], [...preferences]);
    const dispatch = recipientTx([...accounts], [...preferences]);
    await expect(captureVerifiedRecipientInTx(claim.tx, authority, member, lease)).resolves.toEqual(
      {
        ok: false,
        code,
      }
    );
    await expect(
      authorizeVerifiedRecipientInTx(dispatch.tx, authority, member, lease, handle)
    ).resolves.toEqual({ ok: false, code });
  });

  it('refuses a forged or mismatched handle and either changed row version', async () => {
    const handle = await capture();
    const checks = [
      [recipientTx(), member, lease, { ...handle }],
      [recipientTx(), member, 'different-lease', handle],
      [recipientTx(), 'different-member', lease, handle],
      [recipientTx([{ ...account, ctid: '(1,1)' }]), member, lease, handle],
      [recipientTx([account], [{ ...preference, xmin: '9' }]), member, lease, handle],
    ] as const;
    for (const [phase, memberId, leaseToken, snapshot] of checks) {
      await expect(
        authorizeVerifiedRecipientInTx(phase.tx, authority, memberId, leaseToken, snapshot)
      ).resolves.toEqual({ ok: false, code: 'recipient_changed' });
    }
  });
});
