# T-503 Qualifying Evidence Checklist

This checklist distinguishes real production evidence from controlled waiver
evidence. A waiver is valid only when it is signed, hashed, stored as an
artifact, and explicitly accepted by the responsible owner.

## G04 Bank Payment Proof

Qualifies as real evidence:

- original bank statement or bank export proving the payment;
- exact mapping to the Butel invoice or payment reference;
- received amount and payment date;
- finance owner signoff;
- release owner signoff when used for T-503 release-cycle unblock.

Does not qualify by itself:

- invoice without bank movement;
- bank statement with no clear invoice/payment mapping;
- verbal confirmation without artifact and signoff.

Waiver is acceptable only for controlled continuation, not final paid closure,
unless finance and release owner explicitly accept the residual risk.

## G05 600 MKD Reconciliation

Qualifies as real evidence:

- finance decision selecting one treatment for the 600 MKD difference;
- ledger/accounting entry or reconciliation memo;
- bank reference when the difference was paid;
- explicit approval from finance and release owner.

Acceptable treatments:

- remaining receivable;
- approved write-off;
- offset against another invoice/payment;
- already paid, with proof.

Does not qualify by itself:

- payment proof that still leaves the 600 MKD difference unexplained;
- draft spreadsheet without approval;
- general sponsor invoice acceptance without finance treatment.

## G09 POA, Consent, And Service-Fee Terms

Qualifies as real evidence:

- claimant-specific POA or authorization;
- claimant-specific consent to process case/personal data;
- claimant-specific service-fee terms or fee acceptance;
- case identifier tying the documents to T-503;
- Claims/legal owner and release owner signoff.

Does not qualify by itself:

- sponsor-level Butel contracts;
- employer membership roster;
- general service terms with no claimant-specific authorization.

Sponsor documents may support eligibility, but they do not replace
claimant-specific authorization for individual legal or insurer representation.

## G10 Closure Evidence

Qualifies as real evidence:

- final settlement, recovery, no-recovery, transfer, or cancellation decision;
- payment proof or written no-payment final outcome;
- Interdomestik fee calculation and receipt or ledger treatment;
- final finance reconciliation;
- client/member/claimant acknowledgement;
- Claims/legal owner, Claims/finance owner, and release owner signoff.

Allowed final statuses:

- `CLOSED_PAID`
- `CLOSED_NO_RECOVERY`
- `CLOSED_TRANSFERRED`
- `CLOSED_CANCELLED`
- `STILL_OPEN`

Does not qualify by itself:

- court progress documents without final outcome;
- draft settlement discussion;
- finance proof without case closure decision;
- closure statement without client/member/claimant acknowledgement when that
  acknowledgement is required.
