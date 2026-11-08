import type { SponsorMailContent, SponsorMailCopy } from './types';

export const EN_COPY: SponsorMailCopy = {
  greeting: 'Hello',
  supportLabel: 'Contact',
  messages: {
    sponsor_notice: (input): SponsorMailContent => ({
      subject: `${input.companyName} pays for your Interdomestik membership`,
      paragraphs: [
        `${input.companyName} pays for your membership from ${input.startDate} until ${input.termEnd}.`,
        `${input.entityName}, the country entity, holds and controls the data ${input.companyName} gave us (name and email address).`,
        `${input.companyName} only sees that you are registered, never your claims, documents, messages or usage.`,
        'The account is yours.',
        'To leave, use the opt-out link below, or choose "Leave the company program" on the membership page after signing in.',
      ],
      links: [
        { label: 'Leave the sponsored membership', url: input.optOutUrl },
        { label: 'Sign in', url: input.loginUrl },
      ],
    }),
    handover_pending: (input): SponsorMailContent => ({
      subject: 'Your membership handover is pending',
      paragraphs: [
        `We have asked for your individual membership renewal to stop because ${input.companyName} now sponsors you.`,
        'Your paid membership runs until its current period ends. Nothing is refunded and nothing is lost. The sponsored membership starts when the paid one ends.',
      ],
    }),
    handover_confirmed: (input): SponsorMailContent => ({
      subject: 'Your individual membership renewal is stopped',
      paragraphs: [
        `Your individual renewal is stopped. The membership sponsored by ${input.companyName} starts on ${input.startDate}.`,
      ],
    }),
    foreign_account: (input): SponsorMailContent => ({
      subject: 'Your sponsored membership could not be added',
      paragraphs: [
        `${input.companyName} listed this address, but it already belongs to an Interdomestik account in another country, so we could not add the sponsored membership.`,
        `Contact ${input.supportEmail}.`,
      ],
    }),
    not_eligible: (input): SponsorMailContent => ({
      subject: 'This account cannot hold a membership',
      paragraphs: [
        `${input.companyName} listed this address, but it belongs to an account that cannot hold a membership.`,
        `Contact ${input.supportEmail}.`,
      ],
    }),
    renewal_notice: (input): SponsorMailContent => ({
      subject: 'Your sponsorship is due to end',
      paragraphs: [
        `The sponsorship by ${input.companyName} ends on ${input.termEnd} unless ${input.companyName} renews it.`,
        'If it ends, we will offer you an individual membership.',
      ],
    }),
    membership_end_offer: (input): SponsorMailContent => ({
      subject: 'Your sponsored membership has ended',
      paragraphs: [
        'Your sponsored membership has ended. You can continue with an individual membership:',
      ],
      links: [{ label: 'Continue with an individual membership', url: input.offerUrl }],
    }),
    opt_out_confirmation: (input): SponsorMailContent => ({
      subject: 'You have left the sponsored membership',
      paragraphs: [
        `You have left the membership sponsored by ${input.companyName}.`,
        `Your account is not deleted. To delete it, contact ${input.supportEmail}.`,
      ],
    }),
  },
};
