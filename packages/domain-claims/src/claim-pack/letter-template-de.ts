/**
 * German first-contact letters for the three supported claim types.
 * Same structure, placeholders and 15-business-day request as the other locales.
 */

import { formatClaimedAmount, PH, type LetterData } from './letter-placeholders';
import type { ClaimPackType, IntakeAnswers } from './types';

type GermanLetterCopy = {
  subject: string;
  fallbackDescription: string;
  opening: (incidentDate: string) => string;
  descriptionLabel: string;
  closingRequest: string;
};

const GERMAN_LETTERS: Readonly<Record<ClaimPackType, GermanLetterCopy>> = {
  vehicle: {
    subject: 'Antrag auf Ersatz des Fahrzeugschadens',
    fallbackDescription: 'der unten beschriebene Vorfall',
    opening: incidentDate =>
      `ich schreibe Ihnen wegen des Vorfalls vom ${incidentDate}, bei dem mein Fahrzeug beschädigt wurde.`,
    descriptionLabel: 'Beschreibung des Vorfalls',
    closingRequest:
      'Ich bitte Sie, auf diesen Antrag innerhalb von 15 Arbeitstagen zu antworten. Sollte ich keine zufriedenstellende Antwort erhalten, werde ich weitere rechtliche Schritte prüfen.',
  },
  property: {
    subject: 'Antrag auf Ersatz eines Sachschadens',
    fallbackDescription: 'der unten beschriebene Schaden',
    opening: incidentDate =>
      `hiermit teile ich Ihnen einen Schaden an meinem Eigentum mit, der am ${incidentDate} entstanden ist.`,
    descriptionLabel: 'Beschreibung des Schadens',
    closingRequest:
      'Ich bitte um eine schriftliche Antwort innerhalb von 15 Arbeitstagen, in der Sie den Eingang dieses Antrags bestätigen und die nächsten Schritte darlegen.',
  },
  injury: {
    subject: 'Antrag auf Entschädigung für einen Personenschaden',
    fallbackDescription: 'die unten beschriebene Verletzung',
    opening: incidentDate =>
      `ich schreibe Ihnen wegen eines Personenschadens, den ich am ${incidentDate} infolge Ihrer Fahrlässigkeit erlitten habe.`,
    descriptionLabel: 'Beschreibung des Vorfalls',
    closingRequest:
      'Ich erwarte eine schriftliche Antwort innerhalb von 15 Arbeitstagen. Ich behalte mir weitere rechtliche Schritte vor, falls dieser Antrag nicht bearbeitet wird.',
  },
};

export function germanLetter(claimType: ClaimPackType, answers: IntakeAnswers): LetterData {
  const copy = GERMAN_LETTERS[claimType];
  const incidentDate = answers.incidentDate || PH.date;
  const description = answers.description || copy.fallbackDescription;

  return {
    subject: copy.subject,
    body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Datum: ${incidentDate}
Referenz: ${PH.referenceNumber}

Betreff: ${copy.subject}

Sehr geehrte Damen und Herren,

${copy.opening(incidentDate)}

${copy.descriptionLabel}: ${description}

Geforderter Betrag: ${formatClaimedAmount(answers)}

${copy.closingRequest}

Mit freundlichen Grüßen
${PH.senderName}`,
  };
}
