import {
  and,
  eq,
  sponsorRosterEntries,
  sponsors,
  sponsorTerms,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import { readCoverageEntries } from '../sponsor-coverage/resolve';
import { canSeeRoster, isSponsorStaff, type SponsorActor } from './access';
import {
  type CompanyVisibleStatus,
  companyVisibleStatus,
  countStatuses,
  type StatusCounts,
} from './roster-view-status';
import { type SponsorTermView, termViews } from './roster-view-terms';
import type { SponsorResult } from './terms';

export type { SponsorTermView } from './roster-view-terms';

/**
 * ACQ-3b §3.4 read model: the sponsors an actor may see, and one term's roster with the
 * company-visible status. Names and e-mail are the roster-submitted values only; nothing about
 * the member's account, claims, documents, messages, usage or payments is read.
 */
export type SponsorView = {
  sponsorId: string;
  legalName: string;
  branchId: string;
  terms: SponsorTermView[];
};

export type RosterViewEntry = {
  entryId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: CompanyVisibleStatus;
  leftCompany: boolean;
};

export type RosterView = {
  sponsorId: string;
  legalName: string;
  term: SponsorTermView;
  entries: RosterViewEntry[];
  counts: StatusCounts;
};
const CREDENTIAL_BATCH = 20;

/** Which sponsors a role may see; `null` means none at all. */
type Visibility = { all: true } | { branchId: string } | { createdBy: string };

function visibleSponsors(actor: SponsorActor): Visibility | null {
  if (isSponsorStaff(actor)) return { all: true };
  if (actor.role === 'branch_manager' && actor.branchId) return { branchId: actor.branchId };
  if (actor.role === 'agent' && actor.agentTier === 'office') return { createdBy: actor.userId };
  return null;
}

type SponsorRow = { id: string; legalName: string; branchId: string; createdBy: string };

const scopeOf = (row: SponsorRow) => ({ ownerAgentId: row.createdBy, branchId: row.branchId });

async function loadSponsors(
  tx: TenantTransaction,
  tenantId: string,
  visibility: Visibility
): Promise<SponsorRow[]> {
  return tx
    .select({
      id: sponsors.id,
      legalName: sponsors.legalName,
      branchId: sponsors.branchId,
      createdBy: sponsors.createdBy,
    })
    .from(sponsors)
    .where(
      and(
        eq(sponsors.tenantId, tenantId),
        'branchId' in visibility ? eq(sponsors.branchId, visibility.branchId) : undefined,
        'createdBy' in visibility ? eq(sponsors.createdBy, visibility.createdBy) : undefined
      )
    );
}

/** The sponsors this actor may see (§3.4), newest term first; other roles see none. */
export async function listSponsorsForActor(
  authority: TenantAuthority,
  actor: SponsorActor
): Promise<SponsorView[]> {
  const visibility = visibleSponsors(actor);
  if (visibility === null) return [];
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const rows = (await loadSponsors(tx, tenantId, visibility)).filter(row =>
      canSeeRoster(actor, scopeOf(row))
    );
    const terms = await termViews(
      tx,
      tenantId,
      rows.map(row => row.id)
    );
    return rows
      .map(row => ({
        sponsorId: row.id,
        legalName: row.legalName,
        branchId: row.branchId,
        terms: terms.get(row.id) ?? [],
      }))
      .sort(
        (a, b) => a.legalName.localeCompare(b.legalName) || a.sponsorId.localeCompare(b.sponsorId)
      );
  });
}

type RosterRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailNormalized: string | null;
  userId: string | null;
  revokedReason: string | null;
  leftCompanyAt: string | null;
};

async function loadRoster(
  tx: TenantTransaction,
  tenantId: string,
  termId: string
): Promise<{
  sponsor: SponsorRow;
  rows: RosterRow[];
  people: Map<string, CoverageEntry[]>;
} | null> {
  const [sponsor] = await tx
    .select({
      id: sponsors.id,
      legalName: sponsors.legalName,
      branchId: sponsors.branchId,
      createdBy: sponsors.createdBy,
    })
    .from(sponsorTerms)
    .innerJoin(
      sponsors,
      and(eq(sponsors.tenantId, sponsorTerms.tenantId), eq(sponsors.id, sponsorTerms.sponsorId))
    )
    .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, termId)));
  if (!sponsor) return null;
  const rows = await tx
    .select({
      id: sponsorRosterEntries.id,
      firstName: sponsorRosterEntries.firstName,
      lastName: sponsorRosterEntries.lastName,
      emailNormalized: sponsorRosterEntries.emailNormalized,
      userId: sponsorRosterEntries.userId,
      revokedReason: sponsorRosterEntries.revokedReason,
      leftCompanyAt: sponsorRosterEntries.leftCompanyAt,
    })
    .from(sponsorRosterEntries)
    .where(
      and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.termId, termId))
    );
  const userIds = [...new Set(rows.flatMap(row => (row.userId ? [row.userId] : [])))];
  return { sponsor, rows, people: await readCoverageEntries(tx, tenantId, userIds) };
}

async function credentialsOf(
  userIds: readonly string[],
  hasCredential: (userId: string) => Promise<boolean>
): Promise<Set<string>> {
  const batches: string[][] = [];
  for (let at = 0; at < userIds.length; at += CREDENTIAL_BATCH) {
    batches.push(userIds.slice(at, at + CREDENTIAL_BATCH));
  }
  const found = new Set<string>();
  await batches.reduce<Promise<void>>(
    (previous, batch) =>
      previous.then(async () => {
        const results = await Promise.all(batch.map(userId => hasCredential(userId)));
        batch.forEach((userId, index) => {
          if (results[index]) found.add(userId);
        });
      }),
    Promise.resolve()
  );
  return found;
}

/** One term's roster with company-visible statuses; refused unless the actor may see it. */
export async function readSponsorRoster(
  authority: TenantAuthority,
  actor: SponsorActor,
  deps: { hasCredential: (userId: string) => Promise<boolean> },
  input: { termId: string; now: Date }
): Promise<SponsorResult<RosterView>> {
  if (visibleSponsors(actor) === null) return { ok: false, error: 'forbidden' };
  const { tenantId } = readTenantAuthority(authority);
  const loaded = await withTenantAuthority(authority, async tx => {
    const roster = await loadRoster(tx, tenantId, input.termId);
    if (!roster || !canSeeRoster(actor, scopeOf(roster.sponsor))) return null;
    const terms = await termViews(tx, tenantId, [roster.sponsor.id], input.termId);
    const term = terms.get(roster.sponsor.id)?.[0];
    return term ? { ...roster, term } : null;
  });
  if (!loaded) return { ok: false, error: 'not_found' };
  const credentialed = await credentialsOf([...loaded.people.keys()], deps.hasCredential);
  const entries = loaded.rows
    .map((row): RosterViewEntry => ({
      entryId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.emailNormalized,
      leftCompany: row.leftCompanyAt !== null,
      status: companyVisibleStatus(
        {
          entryId: row.id,
          revokedReason: row.revokedReason,
          personEntries: row.userId ? (loaded.people.get(row.userId) ?? []) : [],
          hasCredential: row.userId !== null && credentialed.has(row.userId),
        },
        input.now
      ),
    }))
    .sort(
      (a, b) =>
        (a.lastName ?? '').localeCompare(b.lastName ?? '') ||
        (a.firstName ?? '').localeCompare(b.firstName ?? '') ||
        a.entryId.localeCompare(b.entryId)
    );
  return {
    ok: true,
    value: {
      sponsorId: loaded.sponsor.id,
      legalName: loaded.sponsor.legalName,
      term: loaded.term,
      entries,
      counts: countStatuses(entries.map(entry => entry.status)),
    },
  };
}
