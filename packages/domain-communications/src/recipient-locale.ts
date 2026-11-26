import type { TenantTransaction } from '@interdomestik/database';
import { user, userLocalePreferences } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES, type SessionWithTenant } from '@interdomestik/shared-auth';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isNonSendingEmail } from './non-sending-email';
import { preferredLocaleForTenant } from './tenant-locale';

export const recipientLocales = ['sq', 'en', 'sr', 'mk', 'de'] as const;
type RecipientLocale = (typeof recipientLocales)[number];

declare const VERIFIED_RECIPIENT: unique symbol;
export type VerifiedRecipientHandle = Readonly<{ [VERIFIED_RECIPIENT]: true }>;
export type VerifiedRecipient = Readonly<{ email: string; locale: RecipientLocale }>;
export type VerifiedRecipientRefusal = Readonly<{
  ok: false;
  code:
    | 'recipient_missing'
    | 'recipient_unverified'
    | 'recipient_locale_unavailable'
    | 'recipient_changed';
}>;

type RowVersion = { xmin: string; ctid: string };
type Snapshot = {
  tenantId: string;
  memberId: string;
  leaseToken: string;
  account: RowVersion;
  preference: RowVersion;
};

const snapshots = new WeakMap<VerifiedRecipientHandle, Snapshot>();
const mailbox = z.email();
const storedLocale = z.enum(recipientLocales);
const rowVersion = { xmin: sql<string>`xmin::text`, ctid: sql<string>`ctid::text` };

export function currentMemberPredicate(tenantId: string, memberId: string) {
  return withTenant(
    tenantId,
    user.tenantId,
    and(eq(user.id, memberId), eq(user.role, ROLES.member))
  );
}

async function readLockedRecipient(
  tx: TenantTransaction,
  authority: TenantAuthority,
  memberId: string,
  leaseToken: string
): Promise<
  VerifiedRecipientRefusal | { ok: true; recipient: VerifiedRecipient; snapshot: Snapshot }
> {
  let scope: ReturnType<typeof readTenantAuthority>;
  try {
    scope = readTenantAuthority(authority);
  } catch {
    return { ok: false, code: 'recipient_missing' };
  }
  const { tenantId, accessTenantId, purpose, principal } = scope;
  if (purpose !== 'scheduled-work' || principal !== null || tenantId !== accessTenantId) {
    return { ok: false, code: 'recipient_missing' };
  }
  const [settings] = await tx.execute<{
    home: string | null;
    access: string | null;
    isolation: string;
  }>(
    sql`select current_setting('app.current_tenant_id', true) as home,
               current_setting('app.current_access_tenant_id', true) as access,
               current_setting('transaction_isolation') as isolation`
  );
  if (
    settings?.home !== tenantId ||
    settings.access !== tenantId ||
    settings.isolation !== 'read committed'
  ) {
    return { ok: false, code: 'recipient_missing' };
  }

  const [account] = await tx
    .select({ email: user.email, verified: user.emailVerified, ...rowVersion })
    .from(user)
    .where(currentMemberPredicate(tenantId, memberId))
    .for('share');
  if (!account || !mailbox.safeParse(account.email).success || isNonSendingEmail(account.email)) {
    return { ok: false, code: 'recipient_missing' };
  }
  if (!account.verified) return { ok: false, code: 'recipient_unverified' };

  const [preference] = await tx
    .select({ locale: userLocalePreferences.locale, ...rowVersion })
    .from(userLocalePreferences)
    .where(
      withTenant(
        tenantId,
        userLocalePreferences.tenantId,
        eq(userLocalePreferences.userId, memberId)
      )
    )
    .for('share');
  const locale = storedLocale.safeParse(preference?.locale);
  if (!preference || !locale.success) return { ok: false, code: 'recipient_locale_unavailable' };

  return {
    ok: true,
    recipient: { email: account.email, locale: locale.data },
    snapshot: {
      tenantId,
      memberId,
      leaseToken,
      account: { xmin: account.xmin, ctid: account.ctid },
      preference: { xmin: preference.xmin, ctid: preference.ctid },
    },
  };
}

export async function captureVerifiedRecipientInTx(
  tx: TenantTransaction,
  authority: TenantAuthority,
  memberId: string,
  leaseToken: string
): Promise<VerifiedRecipientRefusal | { ok: true; handle: VerifiedRecipientHandle }> {
  const result = await readLockedRecipient(tx, authority, memberId, leaseToken);
  if (!result.ok) return result;

  const handle = Object.freeze(Object.create(null)) as VerifiedRecipientHandle;
  snapshots.set(handle, result.snapshot);
  return { ok: true, handle };
}

function sameVersion(left: RowVersion, right: RowVersion): boolean {
  return left.xmin === right.xmin && left.ctid === right.ctid;
}

export async function authorizeVerifiedRecipientInTx(
  tx: TenantTransaction,
  authority: TenantAuthority,
  memberId: string,
  leaseToken: string,
  handle: VerifiedRecipientHandle
): Promise<VerifiedRecipientRefusal | { ok: true; recipient: VerifiedRecipient }> {
  const result = await readLockedRecipient(tx, authority, memberId, leaseToken);
  if (!result.ok) return result;

  const captured = snapshots.get(handle);
  const current = result.snapshot;
  if (
    !captured ||
    captured.tenantId !== current.tenantId ||
    captured.memberId !== current.memberId ||
    captured.leaseToken !== current.leaseToken ||
    !sameVersion(captured.account, current.account) ||
    !sameVersion(captured.preference, current.preference)
  ) {
    return { ok: false, code: 'recipient_changed' };
  }
  return { ok: true, recipient: result.recipient };
}

export async function resolveRecipientLocale(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<RecipientLocale> {
  const [recipient] = await tx
    .select({ locale: userLocalePreferences.locale })
    .from(userLocalePreferences)
    .where(
      and(eq(userLocalePreferences.tenantId, tenantId), eq(userLocalePreferences.userId, userId))
    );
  return recipient?.locale ?? preferredLocaleForTenant(tenantId);
}

export async function savePreferredLocale(
  authority: TenantAuthority,
  session: SessionWithTenant,
  locale: RecipientLocale
): Promise<'saved' | 'conflict' | 'profile_scope_unavailable' | 'UNAUTHORIZED'> {
  const { tenantId, accessTenantId, principal, purpose } = readTenantAuthority(authority);
  const userId = principal?.userId;
  const sessionUser = session?.user;
  if (purpose !== 'session' || !userId || userId !== sessionUser?.id) {
    return 'UNAUTHORIZED';
  }

  const profileTenantId = sessionUser.tenantId?.trim();
  if (profileTenantId !== tenantId || profileTenantId !== accessTenantId) {
    return 'profile_scope_unavailable';
  }

  return withTenantAuthority(authority, async tx => {
    const [profile] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .for('key share');
    if (!profile) return 'conflict';
    await tx
      .insert(userLocalePreferences)
      .values({ tenantId, userId, locale })
      .onConflictDoUpdate({
        target: [userLocalePreferences.tenantId, userLocalePreferences.userId],
        set: { locale, updatedAt: new Date() },
      });
    return 'saved';
  });
}
