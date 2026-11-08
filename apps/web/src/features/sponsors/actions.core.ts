import { canDecideRevision } from '@interdomestik/domain-membership-billing/sponsors/access';
import {
  decideRevision,
  isValidTermination,
  terminateTerm,
} from '@interdomestik/domain-membership-billing/sponsors/decisions';
import { markLeftCompany } from '@interdomestik/domain-membership-billing/sponsors/opt-out';
import { readSponsorRosterSecret } from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import {
  prepareRosterRows,
  uploadRoster,
} from '@interdomestik/domain-membership-billing/sponsors/roster-upload';
import {
  listSponsorsForActor,
  readSponsorRoster,
  type SponsorTermView,
} from '@interdomestik/domain-membership-billing/sponsors/roster-view';
import { sponsorCredentialCheck } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import {
  addRevision,
  createSponsor,
  createTerm,
} from '@interdomestik/domain-membership-billing/sponsors/terms';
import { mayUseSponsors, type SponsorContext } from './context.core';
import { companyLeads, sponsorUploadEnabled, termOptions } from './data.core';
import { parseSponsorCsv } from './csv.core';
import {
  decisionSchema,
  leftSchema,
  revisionSchema,
  sponsorSchema,
  targetSchema,
  termSchema,
  terminationSchema,
  type SponsorOperation,
} from './input.core';

export type SponsorActionResult =
  | {
      ok: true;
      counts?: { inserted: number; invalid: number; duplicates: number; alreadyListed: number };
    }
  | {
      ok: false;
      error: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'dark' | 'unavailable';
    };
const invalid = { ok: false, error: 'invalid' } as const;
const forbidden = { ok: false, error: 'forbidden' } as const;

export function hasSuccessor(term: SponsorTermView, terms: SponsorTermView[]): boolean {
  return terms.some(
    other =>
      other.termId !== term.termId &&
      other.effective &&
      other.termStart.getTime() === term.termEnd.getTime() &&
      (other.terminatedEffectiveAt ?? other.termEnd) > other.termStart
  );
}

export async function runSponsorAction(
  context: SponsorContext | null,
  operation: SponsorOperation,
  form: FormData
): Promise<SponsorActionResult> {
  if (!context || !mayUseSponsors(context.actor)) return forbidden;
  const { authority, actor } = context;
  const raw = Object.fromEntries(form);
  const now = new Date();
  if (operation === 'createSponsor') {
    const input = sponsorSchema.safeParse(raw);
    if (!input.success) return invalid;
    const leads = await companyLeads(context);
    if (!leads.some(lead => lead.id === input.data.leadId)) return forbidden;
    return createSponsor(authority, actor, input.data);
  }
  const sponsors = await listSponsorsForActor(authority, actor);
  const sponsor = sponsors.find(row => row.sponsorId === raw.sponsorId);
  if (!sponsor) return forbidden;
  if (operation === 'createTerm') {
    const input = termSchema.safeParse(raw);
    const revision = revisionSchema.safeParse(raw);
    if (!input.success || !revision.success) return invalid;
    const options = await termOptions(context);
    if (
      !options.plans.some(plan => plan.id === input.data.planKey) ||
      !options.entities.some(entity => entity.id === input.data.legalEntityId)
    )
      return invalid;
    return createTerm(authority, actor, { ...input.data, revision: revision.data });
  }
  const target = targetSchema.safeParse(raw);
  if (!target.success) return invalid;
  const term = sponsor.terms.find(row => row.termId === target.data.termId);
  if (!term) return forbidden;
  if (operation === 'addRevision') {
    const revision = revisionSchema.safeParse(raw);
    if (!revision.success) return invalid;
    return addRevision(authority, actor, { termId: term.termId, revision: revision.data });
  }
  if (operation === 'decideRevision') {
    const input = decisionSchema.safeParse(raw);
    if (!input.success) return invalid;
    const revision = term.revisions.find(row => row.revisionId === input.data.revisionId);
    if (!revision || !canDecideRevision(actor, revision.createdBy)) return forbidden;
    if (term.revisions[0]?.revisionId !== revision.revisionId || revision.decision !== null)
      return { ok: false, error: 'conflict' };
    return decideRevision(authority, actor, input.data);
  }
  if (operation === 'terminateTerm') {
    const input = terminationSchema.safeParse(raw);
    if (!input.success) return invalid;
    if (!canDecideRevision(actor, term.createdBy)) return forbidden;
    if (
      term.terminatedEffectiveAt ||
      !isValidTermination({
        now,
        effectiveAt: input.data.effectiveAt,
        termStart: term.termStart,
        termEnd: term.termEnd,
        hasContiguousApprovedSuccessor: hasSuccessor(term, sponsor.terms),
      })
    )
      return invalid;
    return terminateTerm(authority, actor, {
      termId: term.termId,
      effectiveAt: input.data.effectiveAt,
      now,
    });
  }
  if (!term.effective) return forbidden;
  if (operation === 'uploadRoster') {
    if (!(await sponsorUploadEnabled(context))) return { ok: false, error: 'dark' };
    const file = form.get('csv');
    if (!file || typeof file === 'string' || file.size > 1_000_000) return invalid;
    const rows = parseSponsorCsv(await file.text());
    if (!rows || rows.length === 0) return invalid;
    const secret = readSponsorRosterSecret();
    if (!prepareRosterRows(rows, secret)) return invalid;
    const result = await uploadRoster(authority, actor, { termId: term.termId, rows, secret });
    return result.ok
      ? {
          ok: true,
          counts: {
            inserted: result.value.inserted,
            invalid: result.value.invalid,
            duplicates: result.value.duplicates,
            alreadyListed: result.value.alreadyListed,
          },
        }
      : result;
  }
  if (operation === 'markLeftCompany') {
    const input = leftSchema.safeParse(raw);
    if (!input.success) return invalid;
    const roster = await readSponsorRoster(
      authority,
      actor,
      { hasCredential: sponsorCredentialCheck(authority) },
      { termId: term.termId, now }
    );
    if (!roster.ok || !roster.value.entries.some(row => row.entryId === input.data.entryId))
      return forbidden;
    return markLeftCompany(authority, actor, { entryId: input.data.entryId, now });
  }
  return invalid;
}
