import {
  freeStartDrafts,
  sql,
  withTenantContext,
  type TenantTransaction,
} from '@interdomestik/database';
import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';

export type FreeStartDraftHandoffLocale = 'en' | 'sq' | 'sr' | 'mk';
export type FreeStartDraftHandoffFacts = {
  category: 'vehicle' | 'property';
  counterparty: string;
  desiredOutcome: string;
  incidentDate: string;
  issueType: string;
  summary: string;
  version: number;
};
export type FreeStartDraftCandidate = Omit<FreeStartDraftHandoffFacts, 'version'> & {
  resumeStep: string;
};
export type ReviewFreeStartDraftHandoffResult =
  | { ok: true; claimId: string | null; facts: FreeStartDraftHandoffFacts }
  | { ok: false; code: 'membershipRequired' | 'notFound' };
export type ConfirmFreeStartDraftHandoffResult =
  | { ok: true; claimId: string; idempotent: boolean }
  | { ok: false; code: 'draftChanged' | 'membershipRequired' | 'notFound' };

const COPY = {
  en: [
    'Claim from saved facts',
    'category',
    'issue',
    'incident date',
    'other party',
    'requested outcome',
    'summary',
  ],
  sq: [
    'Kërkesë nga faktet e ruajtura',
    'kategoria',
    'çështja',
    'data e ngjarjes',
    'pala tjetër',
    'rezultati i kërkuar',
    'përmbledhja',
  ],
  sr: [
    'Zahtev iz sačuvanih činjenica',
    'kategorija',
    'problem',
    'datum događaja',
    'druga strana',
    'traženi ishod',
    'sažetak',
  ],
  mk: [
    'Барање од зачувани факти',
    'категорија',
    'прашање',
    'датум на настанот',
    'друга страна',
    'баран исход',
    'резиме',
  ],
} as const;

export function isEligibleFreeStartDraft(draft: FreeStartDraftCandidate): boolean {
  return (
    ['vehicle', 'property'].includes(draft.category) &&
    draft.resumeStep === 'preview' &&
    [
      draft.counterparty,
      draft.desiredOutcome,
      draft.incidentDate,
      draft.issueType,
      draft.summary,
    ].every(value => typeof value === 'string' && value.trim().length > 0)
  );
}

export function buildFreeStartDraftClaimCopy(
  draft: FreeStartDraftCandidate,
  locale: FreeStartDraftHandoffLocale
): { description: string; title: string } {
  const [title, ...labels] = COPY[locale];
  const values = [
    draft.category,
    draft.issueType,
    draft.incidentDate,
    draft.counterparty,
    draft.desiredOutcome,
    draft.summary,
  ];
  return {
    title,
    description: labels.map((label, index) => `${label}: ${values[index]}`).join('\n'),
  };
}

export function withFreeStartHandoffActor<T>(
  context: FreeStartDraftContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(
    { tenantId: context.tenantId, accessTenantId: context.accessTenantId },
    async tx => {
      await tx.execute(
        sql`select set_config('app.current_actor_id', ${context.ownerUserId}, true)`
      );
      return action(tx);
    }
  );
}

export function freeStartDraftHandoffFacts(
  row: typeof freeStartDrafts.$inferSelect
): FreeStartDraftHandoffFacts {
  return {
    category: row.category as 'vehicle' | 'property',
    counterparty: row.counterparty ?? '',
    desiredOutcome: row.desiredOutcome ?? '',
    incidentDate: row.incidentDate ?? '',
    issueType: row.issueType ?? '',
    summary: row.summary ?? '',
    version: row.version,
  };
}
