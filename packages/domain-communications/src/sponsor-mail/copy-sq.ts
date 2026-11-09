import type { SponsorMailContent, SponsorMailCopy } from './types';

export const SQ_COPY: SponsorMailCopy = {
  greeting: 'Përshëndetje',
  supportLabel: 'Kontakt',
  messages: {
    sponsor_notice: (input): SponsorMailContent => ({
      subject: `${input.companyName} paguan anëtarësinë tuaj Interdomestik`,
      paragraphs: [
        `${input.companyName} paguan anëtarësinë për ju nga ${input.startDate} deri më ${input.termEnd}.`,
        `${input.entityName}, subjekti në vendin tuaj, i mban dhe i kontrollon të dhënat që na dha ${input.companyName} (emrin dhe adresën e email-it).`,
        `${input.companyName} sheh vetëm që jeni të regjistruar, kurrë kërkesat tuaja për dëmshpërblim, dokumentet, mesazhet apo përdorimin tuaj.`,
        'Llogaria është e juaja.',
        'Për t’u larguar, përdorni lidhjen më poshtë ose zgjidhni "Largohu nga programi i kompanisë" në faqen e anëtarësisë pasi të hyni në llogari.',
      ],
      links: [
        { label: 'Largohu nga anëtarësia e sponsorizuar', url: input.optOutUrl },
        { label: 'Hyni në llogari', url: input.loginUrl },
      ],
    }),
    handover_pending: (input): SponsorMailContent => ({
      subject: 'Kalimi i anëtarësisë suaj është në pritje',
      paragraphs: [
        `Kemi kërkuar ndalimin e rinovimit të anëtarësisë suaj individuale sepse ${input.companyName} tani ju sponsorizon.`,
        'Anëtarësia juaj e paguar vazhdon deri në fund të periudhës aktuale. Nuk rimbursohet asgjë dhe nuk humbni asgjë. Anëtarësia e sponsorizuar fillon kur mbaron ajo e paguar.',
      ],
    }),
    handover_confirmed: (input): SponsorMailContent => ({
      subject: 'Rinovimi i anëtarësisë suaj individuale u ndal',
      paragraphs: [
        `Rinovimi juaj individual u ndal. Anëtarësia e sponsorizuar nga ${input.companyName} fillon më ${input.startDate}.`,
      ],
    }),
    foreign_account: (input): SponsorMailContent => ({
      subject: 'Anëtarësia e sponsorizuar nuk mund të shtohej',
      paragraphs: [
        `${input.companyName} e përfshiu këtë adresë në listë, por ajo i përket tashmë një llogarie Interdomestik në një vend tjetër, ndaj nuk mund ta shtonim anëtarësinë e sponsorizuar.`,
        `Na kontaktoni në ${input.supportEmail}.`,
      ],
    }),
    not_eligible: (input): SponsorMailContent => ({
      subject: 'Kjo llogari nuk mund të ketë anëtarësi',
      paragraphs: [
        `${input.companyName} e përfshiu këtë adresë në listë, por ajo i përket një llogarie që nuk mund të ketë anëtarësi.`,
        `Na kontaktoni në ${input.supportEmail}.`,
      ],
    }),
    renewal_notice: (input): SponsorMailContent => ({
      subject: 'Sponsorizimi juaj po i afrohet fundit',
      paragraphs: [
        `Sponsorizimi nga ${input.companyName} mbaron më ${input.termEnd}, nëse ${input.companyName} nuk e rinovon.`,
        'Nëse mbaron, do t’ju ofrojmë një anëtarësi individuale.',
      ],
    }),
    membership_end_offer: (input): SponsorMailContent => ({
      subject: 'Anëtarësia juaj e sponsorizuar ka mbaruar',
      paragraphs: [
        'Anëtarësia juaj e sponsorizuar ka mbaruar. Mund të vazhdoni me një anëtarësi individuale:',
      ],
      links: [{ label: 'Vazhdoni me anëtarësi individuale', url: input.offerUrl }],
    }),
    opt_out_confirmation: (input): SponsorMailContent => ({
      subject: 'Dolët nga anëtarësia e sponsorizuar',
      paragraphs: [
        `Dolët nga anëtarësia e sponsorizuar nga ${input.companyName}.`,
        `Llogaria juaj nuk është fshirë. Për ta fshirë, na kontaktoni në ${input.supportEmail}.`,
      ],
    }),
  },
};
