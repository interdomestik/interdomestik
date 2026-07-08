import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export const EN_FEE_MATH_SHEET_COPY: FeeMathSheetCopy = {
  eyebrow: 'Court-path cost treatment',
  title: 'Court costs are agreed in writing before the court path starts',
  body: 'No recovery means no success fee to Interdomestik. External court-path costs are not promised as always zero; they are controlled by the written court-path agreement before the cost is created.',
  treatmentLabel: 'Written agreement required',
  rows: [
    {
      key: 'fees.lossPromise',
      label: 'No success fee on no recovery',
      body: 'If there is no recovery, there is no success fee to Interdomestik.',
    },
    {
      key: 'fees.courtPathCosts',
      label: 'Court path is disclosed first',
      body: 'Court-path costs must be disclosed in writing before the case enters court.',
    },
    {
      key: 'fees.thirdPartyCosts',
      label: 'Third-party costs can remain separate',
      body: "Fixed court fees, decision fees, and super-expertise costs may remain the client's responsibility if agreed in writing.",
    },
    {
      key: 'fees.reimbursement',
      label: 'Court-awarded reimbursement',
      body: 'Reimbursement for costs Interdomestik paid upfront returns to Interdomestik when awarded by court decision.',
    },
  ],
};
