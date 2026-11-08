import type { SponsorMailContent, SponsorMailCopy } from './types';

export const SR_COPY: SponsorMailCopy = {
  greeting: 'Zdravo',
  supportLabel: 'Kontakt',
  messages: {
    sponsor_notice: (input): SponsorMailContent => ({
      subject: `${input.companyName} plaća vaše članstvo u Interdomestiku`,
      paragraphs: [
        `${input.companyName} plaća članstvo za vas od ${input.startDate} do ${input.termEnd}.`,
        `${input.entityName}, pravno lice u vašoj zemlji, čuva i kontroliše podatke koje nam je dao ${input.companyName} (ime i adresa e-pošte).`,
        `${input.companyName} vidi samo da ste registrovani, nikada vaše štete, dokumente, poruke ili korišćenje.`,
        'Nalog je vaš.',
        'Da biste napustili članstvo, koristite link ispod ili izaberite „Napusti“ na stranici članstva nakon prijave.',
      ],
      links: [
        { label: 'Napusti sponzorisano članstvo', url: input.optOutUrl },
        { label: 'Prijavite se', url: input.loginUrl },
      ],
    }),
    handover_pending: (input): SponsorMailContent => ({
      subject: 'Prelazak vašeg članstva je na čekanju',
      paragraphs: [
        `Zatražili smo da se zaustavi obnova vašeg individualnog članstva jer vas ${input.companyName} sada sponzoriše.`,
        'Vaše plaćeno članstvo traje do kraja tekućeg perioda. Nema povraćaja novca i ništa ne gubite. Sponzorisano članstvo počinje kada se plaćeno završi.',
      ],
    }),
    handover_confirmed: (input): SponsorMailContent => ({
      subject: 'Obnova vašeg individualnog članstva je zaustavljena',
      paragraphs: [
        `Vaša individualna obnova je zaustavljena. Članstvo koje sponzoriše ${input.companyName} počinje ${input.startDate}.`,
      ],
    }),
    foreign_account: (input): SponsorMailContent => ({
      subject: 'Sponzorisano članstvo nije moglo da se doda',
      paragraphs: [
        `${input.companyName} je naveo ovu adresu, ali ona već pripada nalogu u Interdomestiku u drugoj zemlji, pa nismo mogli da dodamo sponzorisano članstvo.`,
        `Kontaktirajte nas na ${input.supportEmail}.`,
      ],
    }),
    not_eligible: (input): SponsorMailContent => ({
      subject: 'Ovaj nalog ne može da ima članstvo',
      paragraphs: [
        `${input.companyName} je naveo ovu adresu, ali ona pripada nalogu koji ne može da ima članstvo.`,
        `Kontaktirajte nas na ${input.supportEmail}.`,
      ],
    }),
    renewal_notice: (input): SponsorMailContent => ({
      subject: 'Vaše sponzorstvo se bliži kraju',
      paragraphs: [
        `Sponzorstvo od ${input.companyName} ističe ${input.termEnd}, osim ako ga ${input.companyName} ne obnovi.`,
        'Ako istekne, ponudićemo vam individualno članstvo.',
      ],
    }),
    membership_end_offer: (input): SponsorMailContent => ({
      subject: 'Vaše sponzorisano članstvo je završeno',
      paragraphs: [
        'Vaše sponzorisano članstvo je završeno. Možete da nastavite sa individualnim članstvom:',
      ],
      links: [{ label: 'Nastavite sa individualnim članstvom', url: input.offerUrl }],
    }),
    opt_out_confirmation: (input): SponsorMailContent => ({
      subject: 'Izašli ste iz sponzorisanog članstva',
      paragraphs: [
        `Izašli ste iz članstva koje sponzoriše ${input.companyName}.`,
        `Vaš nalog nije obrisan. Da biste ga obrisali, kontaktirajte nas na ${input.supportEmail}.`,
      ],
    }),
  },
};
