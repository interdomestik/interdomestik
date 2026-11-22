import type { ClaimStatus } from '@interdomestik/database/constants';

export type ClaimMailLocale = 'sq' | 'en' | 'sr' | 'mk' | 'de';

export type ClaimMailMessage = {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  footer: string;
};

export type ClaimMailCopy = {
  statuses: Record<ClaimStatus, string>;
  categories: Partial<Record<string, string>>;
  genericCategory: string;
  messages: {
    claim_submitted: ClaimMailMessage;
    claim_status_changed: ClaimMailMessage;
    claim_recovery_decision: Record<'accepted' | 'declined', ClaimMailMessage>;
    claim_message_to_member: Record<'full' | 'restricted', ClaimMailMessage>;
    staff_claim_submitted: ClaimMailMessage;
    staff_member_message: ClaimMailMessage;
  };
};

type ClaimLinkFacts = { baseUrl: string; claimId: string };
type ClaimTitleFacts = { claimTitle: string };
type ClaimCategoryFacts = { category: string };
type StaffClaimFacts = ClaimCategoryFacts & { claimNumber: string };

export type ClaimMailFactsByKind = {
  claim_submitted: ClaimTitleFacts & ClaimCategoryFacts;
  claim_status_changed: ClaimTitleFacts & { fromStatus: ClaimStatus; toStatus: ClaimStatus };
  claim_recovery_decision: ClaimTitleFacts & { decision: 'accepted' | 'declined' };
  claim_message_to_member:
    | ({ previewRestricted: false; senderName: string; excerpt: string } & ClaimTitleFacts)
    | { previewRestricted: true };
  staff_claim_submitted: StaffClaimFacts;
  staff_member_message: StaffClaimFacts;
};

export type ClaimMailKind = keyof ClaimMailFactsByKind;

export type ClaimMailRenderArgs = {
  [Kind in ClaimMailKind]: [
    kind: Kind,
    locale: ClaimMailLocale,
    facts: ClaimLinkFacts & ClaimMailFactsByKind[Kind],
  ];
}[ClaimMailKind];
