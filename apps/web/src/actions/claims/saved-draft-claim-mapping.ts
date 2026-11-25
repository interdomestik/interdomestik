import {
  createClaimSchema,
  type CreateClaimValues,
} from '@interdomestik/domain-claims/validators/claims';
import type { FreeStartDraft } from '@interdomestik/database/free-start-drafts';

import { buildSavedDraftClaimText } from './saved-draft-claim-text';

const CATEGORY = { vehicle: 'Vehicle', property: 'Property' } as const;
// prettier-ignore
const ISSUE = { collision: 'Collision', theft: 'Theft', parking_damage: 'Parking damage', insurer_delay: 'Insurer delay', water_damage: 'Water damage', storm_fire: 'Storm or fire', burglary: 'Burglary', landlord_dispute: 'Landlord dispute' } as const;
// prettier-ignore
const OUTCOME = { repair: 'Repair', reimbursement: 'Reimbursement', compensation: 'Compensation', written_response: 'Written response' } as const;
function ownValue(record: Readonly<Record<string, string>>, key: string | null) {
  return key && Object.hasOwn(record, key) ? record[key] : null;
}

// prettier-ignore
export async function mapDraft(draft: FreeStartDraft, incidentCountryCode?: CreateClaimValues['incidentCountryCode']): Promise<CreateClaimValues | null> {
  const category = ownValue(CATEGORY, draft.category);
  const issue = ownValue(ISSUE, draft.issueType);
  const outcome = ownValue(OUTCOME, draft.desiredOutcome);
  const counterparty = draft.counterparty.trim();
  const summary = draft.summary.trim();
  if (!category || !issue || !outcome || counterparty.length < 2 || !summary) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.incidentDate)) return null;
  const text = await buildSavedDraftClaimText(
    { category: draft.category, issueType: draft.issueType, incidentDate: draft.incidentDate, counterparty, desiredOutcome: draft.desiredOutcome, summary },
    { category, issue, outcome }
  );
  const data = {
    category: draft.category,
    companyName: counterparty,
    currency: 'EUR',
    description: text.description,
    files: [],
    incidentDate: draft.incidentDate,
    ...(incidentCountryCode ? { incidentCountryCode } : {}),
    title: text.title,
  };
  const parsed = createClaimSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
