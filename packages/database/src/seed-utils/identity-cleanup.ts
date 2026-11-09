import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { E2E_PACK_USERS, e2eEmail } from '../e2e-users';
import { E2E_AGENT_PACK_USERS } from '../e2e-agent-pack-fixtures';
import { buildUsersToSeed } from '../seed-golden/users';
import type * as schema from '../schema';
import { buildWorkloadUsers } from '../seed-workload/user-fixtures';
import { packId } from './seed-ids';

export type SeedIdentity = Readonly<{
  id: string;
  tenantId: string;
  email: string;
  legacyEmail: string;
}>;

/** Exact historical fixture tuples, never a wildcard over the real email domain. */
export function seedCleanupIdentities(): readonly SeedIdentity[] {
  const at = () => new Date('2026-01-01T00:00:00Z');
  const golden = buildUsersToSeed({ at });
  const ksPack = [
    {
      id: packId('ks', 'staff_extra'),
      tenantId: 'tenant_ks',
      email: E2E_PACK_USERS.KS_STAFF.email,
    },
    ...Array.from({ length: 26 }, (_, i) => ({
      id: packId('ks', 'member', i + 1),
      tenantId: 'tenant_ks',
      email: e2eEmail(`ks.member.pack.${i + 1}`),
    })),
  ];
  const goldenAndKs = [...golden, ...ksPack].map(identity => ({
    id: identity.id,
    tenantId: identity.tenantId,
    email: identity.email,
    legacyEmail: `${identity.email.split('@')[0]}@interdomestik.com`,
  }));
  return [...goldenAndKs, E2E_AGENT_PACK_USERS.AGENT, ...E2E_AGENT_PACK_USERS.CLIENTS];
}

export function seedIdentityCleanupPredicate(
  user: typeof schema.user,
  prefixes?: readonly string[]
) {
  const identities = prefixes
    ? [
        ...seedCleanupIdentities().filter(identity => identity.id.startsWith('pack_ks_')),
        ...buildWorkloadUsers().map(identity => ({ ...identity, legacyEmail: identity.email })),
      ]
    : seedCleanupIdentities();
  return (
    or(
      ...identities
        .filter(identity => !prefixes || prefixes.some(prefix => identity.id.startsWith(prefix)))
        .map(identity =>
          and(
            eq(user.id, identity.id),
            eq(user.tenantId, identity.tenantId),
            inArray(user.email, [identity.email, identity.legacyEmail])
          )
        )
    ) ?? sql`false`
  );
}
