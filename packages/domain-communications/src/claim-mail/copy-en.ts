import type { ClaimMailCopy } from './types';

const viewClaim = 'View claim';
const footer = 'Interdomestik Team';

export const EN_COPY: ClaimMailCopy = {
  statuses: {
    draft: 'Draft',
    submitted: 'Submitted',
    submitted_to_airline: 'Submitted to airline',
    verification: 'Verification',
    evaluation: 'Evaluation',
    negotiation: 'Negotiation',
    court: 'Court',
    resolved: 'Resolved',
    rejected: 'Rejected',
  },
  categories: {
    consumer: 'Consumer',
    consumer_rights: 'Consumer Rights',
    housing: 'Housing',
    insurance: 'Insurance',
    employment: 'Employment',
    contracts: 'Contracts',
    utilities: 'Utilities',
    auto: 'Vehicle',
    vehicle: 'Vehicle',
    travel: 'Travel',
    retail: 'Retail',
    real_estate: 'Real Estate',
    property: 'Property',
    flight_delay: 'Flight Delay',
    damaged_goods: 'Damaged Goods',
    service_issue: 'Service Issue',
    liability: 'Liability',
    medical: 'Medical',
    test: 'Test',
    other: 'Other',
    injury: 'Personal Injury',
  },
  genericCategory: 'Other',
  messages: {
    claim_submitted: {
      subject: 'We received your claim',
      heading: 'We received your claim',
      body: 'Your claim "{title}" has been submitted successfully.\nCategory: {category}\nClaim ID: {claimId}',
      cta: viewClaim,
      footer,
    },
    claim_status_changed: {
      subject: 'Claim status updated to {toStatus}',
      heading: 'Claim status updated to {toStatus}',
      body: 'Your claim "{title}" has moved from {fromStatus} to {toStatus}.\nClaim ID: {claimId}',
      cta: viewClaim,
      footer,
    },
    claim_recovery_decision: {
      accepted: {
        subject: 'Recovery accepted',
        heading: 'Recovery accepted',
        body: 'Staff accepted {title} for recovery handling.',
        cta: viewClaim,
        footer,
      },
      declined: {
        subject: 'Recovery declined',
        heading: 'Recovery declined',
        body: 'Staff declined recovery handling for {title}.',
        cta: viewClaim,
        footer,
      },
    },
    claim_message_to_member: {
      full: {
        subject: 'New message on your claim',
        heading: 'New message on your claim',
        body: '{sender} sent a message about "{title}".\n{excerpt}\nClaim ID: {claimId}',
        cta: 'Reply now',
        footer,
      },
      restricted: {
        subject: 'New message',
        heading: 'New message',
        body: 'An update is available. Message and note content is restricted for branch managers.',
        cta: 'Open Interdomestik',
        footer,
      },
    },
    staff_claim_submitted: {
      subject: 'New claim submitted',
      heading: 'New claim submitted',
      body: 'Claim number: {claimNumber}\nCategory: {category}',
      cta: viewClaim,
      footer,
    },
    staff_member_message: {
      subject: 'New member message',
      heading: 'New member message',
      body: 'Claim number: {claimNumber}\nCategory: {category}',
      cta: viewClaim,
      footer,
    },
  },
};
