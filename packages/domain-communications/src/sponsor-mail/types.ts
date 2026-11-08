export type SponsorMailLocale = 'sq' | 'en' | 'mk' | 'sr' | 'de';

type CommonInput = {
  locale: SponsorMailLocale;
  firstName: string | null;
  supportEmail: string;
};

type CompanyInput = { companyName: string };

export type SponsorMailInput = CommonInput &
  (
    | (CompanyInput & {
        kind: 'sponsor_notice';
        entityName: string;
        startDate: string;
        termEnd: string;
        optOutUrl: string;
        loginUrl: string;
      })
    | (CompanyInput & { kind: 'handover_pending' })
    | (CompanyInput & { kind: 'handover_confirmed'; startDate: string })
    | (CompanyInput & { kind: 'foreign_account' })
    | (CompanyInput & { kind: 'not_eligible' })
    | (CompanyInput & { kind: 'renewal_notice'; termEnd: string })
    | { kind: 'membership_end_offer'; offerUrl: string }
    | (CompanyInput & { kind: 'opt_out_confirmation' })
  );

export type SponsorMailKind = SponsorMailInput['kind'];

export type SponsorMailContent = {
  subject: string;
  paragraphs: string[];
  links?: { label: string; url: string }[];
};

export type SponsorMailCopy = {
  greeting: string;
  supportLabel: string;
  messages: {
    [Kind in SponsorMailKind]: (
      input: Extract<SponsorMailInput, { kind: Kind }>
    ) => SponsorMailContent;
  };
};
