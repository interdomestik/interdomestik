import { sql, type SQL } from 'drizzle-orm';

type AssertDb = (typeof import('./db'))['db'];
type BranchMembershipDb = Pick<AssertDb, 'execute'>;

const SAMPLE_LIMIT = 5;

type BranchMembershipCheck = Readonly<{ label: string; query: SQL }>;

/**
 * Branch membership rules every seeded dataset must satisfy. Each query returns the ids of the
 * rows that break its rule, so a clean dataset returns no rows anywhere.
 */
export const BRANCH_MEMBERSHIP_CHECKS: readonly BranchMembershipCheck[] = Object.freeze([
  {
    label: 'agent or branch manager without a branch',
    query: sql`select id from "user"
      where role in ('agent', 'branch_manager') and branch_id is null`,
  },
  {
    label: 'user in a branch of another tenant',
    query: sql`select u.id from "user" u join branches b on b.id = u.branch_id
      where b.tenant_id <> u.tenant_id`,
  },
  {
    label: 'agent or branch manager role grant without a branch',
    query: sql`select id from user_roles
      where role in ('agent', 'branch_manager') and branch_id is null`,
  },
  {
    label: 'role grant in a branch of another tenant',
    query: sql`select r.id from user_roles r join branches b on b.id = r.branch_id
      where b.tenant_id <> r.tenant_id`,
  },
  {
    label: 'role grant in another tenant than the user',
    query: sql`select r.id from user_roles r join "user" u on u.id = r.user_id
      where r.tenant_id is distinct from u.tenant_id`,
  },
  {
    label: 'role grant outside the user branch',
    query: sql`select r.id from user_roles r join "user" u on u.id = r.user_id
      where r.branch_id is not null and r.branch_id is distinct from u.branch_id`,
  },
  {
    label: 'user with role grants in more than one branch',
    query: sql`select user_id as id from user_roles where branch_id is not null
      group by user_id having count(distinct branch_id) > 1`,
  },
  {
    label: 'claim in a branch of another tenant',
    query: sql`select c.id from claim c join branches b on b.id = c.branch_id
      where b.tenant_id <> c.tenant_id`,
  },
  {
    label: 'subscription in a branch of another tenant',
    query: sql`select s.id from subscriptions s join branches b on b.id = s.branch_id
      where b.tenant_id <> s.tenant_id`,
  },
]);

/** Database check: no row breaks a branch membership rule. Reports a sample of ids per rule. */
export async function collectBranchMembershipViolations(
  db: BranchMembershipDb,
  checks: readonly BranchMembershipCheck[] = BRANCH_MEMBERSHIP_CHECKS
): Promise<string[]> {
  // The checks are independent reads; run them together and report in declaration order.
  const results = await Promise.all(checks.map(check => db.execute(check.query)));
  const failures: string[] = [];
  for (const [index, check] of checks.entries()) {
    const rows = Array.from(results[index]);
    if (rows.length === 0) continue;
    const sample = rows.slice(0, SAMPLE_LIMIT).map(row => String(row.id));
    const more = rows.length > SAMPLE_LIMIT ? ` and ${rows.length - SAMPLE_LIMIT} more` : '';
    failures.push(`${check.label}: ${sample.join(', ')}${more}`);
  }
  return failures;
}
