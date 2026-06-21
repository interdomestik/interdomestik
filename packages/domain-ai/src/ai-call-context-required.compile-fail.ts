// T-404 compile-fail fixture: every @ts-expect-error below must stay a type
// error so public domain-ai call entry points cannot silently drop context.
import { createAiClient } from './client';
import { extractClaimIntake } from './claims/intake-extract';
import { summarizeClaim } from './claims/summary';
import { extractLegalDocument } from './legal/extract';

// @ts-expect-error T-404: AI client construction requires trusted AICallContext.
createAiClient();

// @ts-expect-error T-404: claim intake extraction requires trusted AICallContext.
extractClaimIntake({
  claim: {
    title: 'Flight cancellation reimbursement',
    description: null,
    category: 'travel',
    claimAmount: null,
    currency: null,
  },
});

// @ts-expect-error T-404: claim summary requires trusted AICallContext.
summarizeClaim({
  claim: {
    title: 'Delayed baggage claim',
    description: null,
    category: 'travel',
    companyName: null,
    claimAmount: null,
    currency: null,
  },
});

// @ts-expect-error T-404: legal extraction requires trusted AICallContext.
extractLegalDocument({ documentText: 'Demand letter issued by Contoso Legal.' });
