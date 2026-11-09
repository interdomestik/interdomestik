import type { SponsorMailContent, SponsorMailCopy } from './types';

export const DE_COPY: SponsorMailCopy = {
  greeting: 'Guten Tag',
  supportLabel: 'Kontakt',
  messages: {
    sponsor_notice: (input): SponsorMailContent => ({
      subject: `${input.companyName} bezahlt Ihre Interdomestik-Mitgliedschaft`,
      paragraphs: [
        `${input.companyName} bezahlt Ihre Mitgliedschaft vom ${input.startDate} bis zum ${input.termEnd}.`,
        `${input.entityName}, die Landesgesellschaft, hält und kontrolliert die Daten, die uns ${input.companyName} gegeben hat (Name und E-Mail-Adresse).`,
        `${input.companyName} sieht nur, dass Sie registriert sind, niemals Ihre Schadensfälle, Dokumente, Nachrichten oder Ihre Nutzung.`,
        'Das Konto gehört Ihnen.',
        'Zum Verlassen nutzen Sie den Link unten oder wählen Sie nach der Anmeldung auf der Mitgliedschaftsseite „Firmenprogramm verlassen“.',
      ],
      links: [
        { label: 'Gesponserte Mitgliedschaft verlassen', url: input.optOutUrl },
        { label: 'Anmelden', url: input.loginUrl },
      ],
    }),
    handover_pending: (input): SponsorMailContent => ({
      subject: 'Die Umstellung Ihrer Mitgliedschaft steht aus',
      paragraphs: [
        `Wir haben beantragt, die Verlängerung Ihrer individuellen Mitgliedschaft zu stoppen, weil ${input.companyName} Sie jetzt sponsert.`,
        'Ihre bezahlte Mitgliedschaft läuft bis zum Ende des aktuellen Zeitraums. Es wird nichts erstattet und Sie verlieren nichts. Die gesponserte Mitgliedschaft beginnt, wenn die bezahlte endet.',
      ],
    }),
    handover_confirmed: (input): SponsorMailContent => ({
      subject: 'Die Verlängerung Ihrer individuellen Mitgliedschaft ist gestoppt',
      paragraphs: [
        `Ihre individuelle Verlängerung ist gestoppt. Die von ${input.companyName} gesponserte Mitgliedschaft beginnt am ${input.startDate}.`,
      ],
    }),
    foreign_account: (input): SponsorMailContent => ({
      subject: 'Die gesponserte Mitgliedschaft konnte nicht hinzugefügt werden',
      paragraphs: [
        `${input.companyName} hat diese Adresse angegeben. Sie gehört jedoch bereits zu einem Interdomestik-Konto in einem anderen Land. Deshalb konnten wir die gesponserte Mitgliedschaft nicht hinzufügen.`,
        `Kontaktieren Sie uns unter ${input.supportEmail}.`,
      ],
    }),
    not_eligible: (input): SponsorMailContent => ({
      subject: 'Dieses Konto kann keine Mitgliedschaft haben',
      paragraphs: [
        `${input.companyName} hat diese Adresse angegeben. Sie gehört jedoch zu einem Konto, das keine Mitgliedschaft haben kann.`,
        `Kontaktieren Sie uns unter ${input.supportEmail}.`,
      ],
    }),
    renewal_notice: (input): SponsorMailContent => ({
      subject: 'Ihr Sponsoring läuft bald aus',
      paragraphs: [
        `Das Sponsoring durch ${input.companyName} endet am ${input.termEnd}, sofern ${input.companyName} es nicht verlängert.`,
        'Wenn es endet, bieten wir Ihnen eine individuelle Mitgliedschaft an.',
      ],
    }),
    membership_end_offer: (input): SponsorMailContent => ({
      subject: 'Ihre gesponserte Mitgliedschaft ist beendet',
      paragraphs: [
        'Ihre gesponserte Mitgliedschaft ist beendet. Sie können mit einer individuellen Mitgliedschaft fortfahren:',
      ],
      links: [{ label: 'Mit individueller Mitgliedschaft fortfahren', url: input.offerUrl }],
    }),
    opt_out_confirmation: (input): SponsorMailContent => ({
      subject: 'Sie haben die gesponserte Mitgliedschaft verlassen',
      paragraphs: [
        `Sie haben die von ${input.companyName} gesponserte Mitgliedschaft verlassen.`,
        `Ihr Konto wurde nicht gelöscht. Um es löschen zu lassen, kontaktieren Sie uns unter ${input.supportEmail}.`,
      ],
    }),
  },
};
