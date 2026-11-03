import { and, eq, isNotNull } from 'drizzle-orm';
import { dbAdmin } from './db';
import { account, user } from './schema/auth';
import { readTenantAuthority, type TenantAuthority } from './tenant-authority';

// Credential rows are identity data: `account` is admin-only (0016 "No public access"), so the
// restricted runtime role can never write one. An agent that has just registered a member in its
// own tenant attaches that member's first password credential through this fixed append. It
// confirms, from the identity rows themselves, that the member belongs to the authority's tenant,
// was created by this agent and has no account of any provider yet; it writes nothing else.

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/u;
// Only an interactive agent session (or a test-runner authority) may attach a credential.
const AGENT_PURPOSES = new Set(['session', 'test']);

export type TenantMemberCredential = Readonly<{
  userId: string;
  email: string;
  /** A bcrypt hash; plaintext is refused. */
  passwordHash: string;
}>;

/**
 * Appends the first credential account of a member that the holder of `authority` registered.
 * Returns false (writing nothing) unless the member is in the authority's tenant, carries the
 * given email, was created by the authority's principal as an agent, and has no account yet.
 */
export async function appendTenantMemberCredential(
  authority: TenantAuthority,
  credential: TenantMemberCredential
): Promise<boolean> {
  const descriptor = readTenantAuthority(authority);
  if (!AGENT_PURPOSES.has(descriptor.purpose) || descriptor.principal?.role !== 'agent') {
    return false;
  }
  const agentId = descriptor.principal.userId;
  const userId = typeof credential.userId === 'string' ? credential.userId.trim() : '';
  const email = typeof credential.email === 'string' ? credential.email : '';
  if (!agentId || !userId || !email || !BCRYPT_HASH.test(credential.passwordHash)) return false;

  // db-access-guard: system-exempt -- reason: first credential of a member the authority's agent just created in its own tenant
  return await dbAdmin.transaction(async tx => {
    const [member] = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.id, userId),
          eq(user.tenantId, descriptor.tenantId),
          eq(user.email, email),
          eq(user.role, 'member'),
          eq(user.createdBy, 'agent'),
          eq(user.assistedByAgentId, agentId)
        )
      )
      .for('update')
      .limit(1);
    if (!member) return false;
    const [existing] = await tx
      .select({ id: account.id })
      .from(account)
      .where(eq(account.userId, userId))
      .limit(1);
    if (existing) return false;

    const now = new Date();
    await tx.insert(account).values({
      id: `${userId}-credential`,
      accountId: userId,
      providerId: 'credential',
      userId,
      password: credential.passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  });
}

/**
 * Reports whether a user of the authority's tenant has a password-bearing `credential` account. A
 * user outside that tenant reads as having none; nothing about the credential itself is returned.
 * The answer is a snapshot: an account created afterwards is not reflected.
 */
export async function hasTenantMemberCredential(
  authority: TenantAuthority,
  userId: string
): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) return false;

  // db-access-guard: system-exempt -- reason: existence of one credential of a member of the authority's tenant only
  const [row] = await dbAdmin
    .select({ id: account.id })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(
      and(
        eq(account.userId, id),
        eq(account.providerId, 'credential'),
        isNotNull(account.password),
        eq(user.tenantId, tenantId)
      )
    )
    .limit(1);
  return Boolean(row);
}
