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
  if (operation === 'createSponsor') return runCreateSponsor(context, raw);
  const sponsors = await listSponsorsForActor(authority, actor);
  const sponsor = sponsors.find(row => row.sponsorId === raw.sponsorId);
  if (!sponsor) return forbidden;
  if (operation === 'createTerm') return runCreateTerm(context, raw);
  const target = targetSchema.safeParse(raw);
  if (!target.success) return invalid;
  const term = sponsor.terms.find(row => row.termId === target.data.termId);
  if (!term) return forbidden;
  if (
    operation === 'addRevision' ||
    operation === 'decideRevision' ||
    operation === 'terminateTerm'
  ) {
    return runTermAction(context, operation, raw, term, sponsor.terms, now);
  }
  if (!term.effective) return forbidden;
  if (operation === 'uploadRoster') return runUploadRoster(context, term, form);
  if (operation === 'markLeftCompany') return runMarkLeftCompany(context, raw, term, now);

  return invalid;
}

async function runCreateSponsor(
  context: SponsorContext,
  raw: Record<string, FormDataEntryValue>
): Promise<SponsorActionResult> {
  const { authority, actor } = context;

  const input = sponsorSchema.safeParse(raw);
  if (!input.success) return invalid;
  const leads = await companyLeads(context);
  if (!leads.some(lead => lead.id === input.data.leadId)) return forbidden;
  return createSponsor(authority, actor, input.data);
}

async function runCreateTerm(
  context: SponsorContext,
  raw: Record<string, FormDataEntryValue>
): Promise<SponsorActionResult> {
  const { authority, actor } = context;

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

async function runUploadRoster(
  context: SponsorContext,
  term: SponsorTermView,
  form: FormData
): Promise<SponsorActionResult> {
  const { authority, actor } = context;

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

async function runTermAction(
  context: SponsorContext,
  operation: SponsorOperation,
  raw: Record<string, FormDataEntryValue>,
  term: SponsorTermView,
  terms: SponsorTermView[],
  now: Date
): Promise<SponsorActionResult> {
  const { authority, actor } = context;
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
  if (operation === 'terminateTerm') return runTermination(context, raw, term, terms, now);

  return invalid;
}

async function runTermination(
  context: SponsorContext,
  raw: Record<string, FormDataEntryValue>,
  term: SponsorTermView,
  terms: SponsorTermView[],
  now: Date
): Promise<SponsorActionResult> {
  const { authority, actor } = context;

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
      hasContiguousApprovedSuccessor: hasSuccessor(term, terms),
    })
  )
    return invalid;
  return terminateTerm(authority, actor, {
    termId: term.termId,
    effectiveAt: input.data.effectiveAt,
    now,
  });
}

async function runMarkLeftCompany(
  context: SponsorContext,
  raw: Record<string, FormDataEntryValue>,
  term: SponsorTermView,
  now: Date
): Promise<SponsorActionResult> {
  const { authority, actor } = context;

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
