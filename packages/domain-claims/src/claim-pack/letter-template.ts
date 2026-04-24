/**
 * Complaint / notice letter template generator.
 *
 * Generates a first-contact letter for the three supported claim types.
 * Letters are plain-text with placeholder markers for information the
 * member needs to fill in manually.
 */

import type { ClaimPackType, ComplaintLetter, IntakeAnswers } from './types';

// ---------------------------------------------------------------------------
// Placeholder markers
// ---------------------------------------------------------------------------

const PH = {
  senderName: '[YOUR_FULL_NAME]',
  senderAddress: '[YOUR_ADDRESS]',
  recipientName: '[RECIPIENT_NAME]',
  recipientAddress: '[RECIPIENT_ADDRESS]',
  date: '[DATE]',
  referenceNumber: '[REFERENCE_NUMBER]',
  responseDeadline: '[RESPONSE_DEADLINE]',
} as const;

const ALL_PLACEHOLDERS = Object.values(PH);

// ---------------------------------------------------------------------------
// Letter bodies by type and locale
// ---------------------------------------------------------------------------

type LetterData = {
  subject: string;
  body: string;
};

function vehicleLetter(answers: IntakeAnswers, locale: string): LetterData {
  const incidentDate = answers.incidentDate || PH.date;
  const description = answers.description || 'the incident described below';
  const amount = answers.estimatedAmount
    ? `${(answers.estimatedAmount / 100).toFixed(2)} ${answers.currency || 'EUR'}`
    : '[CLAIMED_AMOUNT]';

  if (locale === 'sq') {
    return {
      subject: 'Kërkesë për kompensim të dëmeve të automjetit',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Data: ${incidentDate}
Referenca: ${PH.referenceNumber}

Lëndë: Kërkesë për kompensim të dëmeve të automjetit

I/E nderuar/e,

Ju shkruaj lidhur me aksidentin e datës ${incidentDate}, ku automjeti im pësoi dëme materiale.

Përshkrimi i ngjarjes: ${description}

Shuma e kërkuar: ${amount}

Ju lutem t'i përgjigjeni kësaj kërkese brenda 15 ditëve pune. Në rast të mospërgjigjes, do të shqyrtoj hapat e mëtejshëm ligjorë.

Me respekt,
${PH.senderName}`,
    };
  }

  if (locale === 'mk') {
    return {
      subject: 'Барање за надомест за оштетување на возило',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Датум: ${incidentDate}
Референца: ${PH.referenceNumber}

Предмет: Барање за надомест за оштетување на возило

Почитувани,

Ви пишувам во врска со настанот од ${incidentDate}, при кој моето возило претрпе материјална штета.

Опис на настанот: ${description}

Побаран износ: ${amount}

Ве молам да одговорите на ова барање во рок од 15 работни дена. Ако не добијам задоволителен одговор, ќе ги разгледам следните законски чекори.

Со почит,
${PH.senderName}`,
    };
  }

  if (locale === 'sr') {
    return {
      subject: 'Zahtev za naknadu štete na vozilu',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Datum: ${incidentDate}
Referenca: ${PH.referenceNumber}

Predmet: Zahtev za naknadu štete na vozilu

Poštovani,

Pišem vam povodom događaja od ${incidentDate}, kada je moje vozilo pretrpelo materijalnu štetu.

Opis događaja: ${description}

Traženi iznos: ${amount}

Molim vas da odgovorite na ovaj zahtev u roku od 15 radnih dana. Ako ne dobijem zadovoljavajući odgovor, razmotriću dalje pravne korake.

S poštovanjem,
${PH.senderName}`,
    };
  }

  // Default: English
  return {
    subject: 'Claim for vehicle damage compensation',
    body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Date: ${incidentDate}
Reference: ${PH.referenceNumber}

Subject: Claim for vehicle damage compensation

Dear Sir or Madam,

I am writing regarding the incident on ${incidentDate} in which my vehicle sustained damage.

Description of incident: ${description}

Amount claimed: ${amount}

I kindly request that you respond to this claim within 15 business days. If I do not receive a satisfactory response, I will consider further legal steps.

Yours sincerely,
${PH.senderName}`,
  };
}

function propertyLetter(answers: IntakeAnswers, locale: string): LetterData {
  const incidentDate = answers.incidentDate || PH.date;
  const description = answers.description || 'the damage described below';
  const amount = answers.estimatedAmount
    ? `${(answers.estimatedAmount / 100).toFixed(2)} ${answers.currency || 'EUR'}`
    : '[CLAIMED_AMOUNT]';

  if (locale === 'sq') {
    return {
      subject: 'Kërkesë për kompensim të dëmeve në pronë',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Data: ${incidentDate}
Referenca: ${PH.referenceNumber}

Lëndë: Kërkesë për kompensim të dëmeve në pronë

I/E nderuar/e,

Ju shkruaj lidhur me dëmet e shkaktuara në pronën time më datë ${incidentDate}.

Përshkrimi: ${description}

Shuma e kërkuar: ${amount}

Ju lutem t'i përgjigjeni brenda 15 ditëve pune.

Me respekt,
${PH.senderName}`,
    };
  }

  if (locale === 'mk') {
    return {
      subject: 'Барање за надомест за имотна штета',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Датум: ${incidentDate}
Референца: ${PH.referenceNumber}

Предмет: Барање за надомест за имотна штета

Почитувани,

Ви пишувам за штетата на мојот имот што настана на ${incidentDate}.

Опис на штетата: ${description}

Побаран износ: ${amount}

Барам писмен одговор во рок од 15 работни дена со потврда на ова барање и следните чекори.

Со почит,
${PH.senderName}`,
    };
  }

  if (locale === 'sr') {
    return {
      subject: 'Zahtev za naknadu imovinske štete',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Datum: ${incidentDate}
Referenca: ${PH.referenceNumber}

Predmet: Zahtev za naknadu imovinske štete

Poštovani,

Pišem vam da vas obavestim o šteti na mojoj imovini koja se dogodila ${incidentDate}.

Opis štete: ${description}

Traženi iznos: ${amount}

Tražim pisani odgovor u roku od 15 radnih dana sa potvrdom ovog zahteva i narednim koracima.

S poštovanjem,
${PH.senderName}`,
    };
  }

  return {
    subject: 'Claim for property damage compensation',
    body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Date: ${incidentDate}
Reference: ${PH.referenceNumber}

Subject: Claim for property damage compensation

Dear Sir or Madam,

I am writing to notify you of damage to my property that occurred on ${incidentDate}.

Description of damage: ${description}

Amount claimed: ${amount}

I request a written response within 15 business days acknowledging this claim and outlining next steps.

Yours sincerely,
${PH.senderName}`,
  };
}

function injuryLetter(answers: IntakeAnswers, locale: string): LetterData {
  const incidentDate = answers.incidentDate || PH.date;
  const description = answers.description || 'the injury described below';
  const amount = answers.estimatedAmount
    ? `${(answers.estimatedAmount / 100).toFixed(2)} ${answers.currency || 'EUR'}`
    : '[CLAIMED_AMOUNT]';

  if (locale === 'sq') {
    return {
      subject: 'Kërkesë për kompensim të lëndimit personal',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Data: ${incidentDate}
Referenca: ${PH.referenceNumber}

Lëndë: Kërkesë për kompensim të lëndimit personal

I/E nderuar/e,

Ju shkruaj lidhur me lëndimin personal të pësuar më datë ${incidentDate} për shkak të neglizhencës tuaj.

Përshkrimi: ${description}

Shuma e kërkuar: ${amount}

Ju lutem t'i përgjigjeni brenda 15 ditëve pune.

Me respekt,
${PH.senderName}`,
    };
  }

  if (locale === 'mk') {
    return {
      subject: 'Барање за надомест за лична повреда',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Датум: ${incidentDate}
Референца: ${PH.referenceNumber}

Предмет: Барање за надомест за лична повреда

Почитувани,

Ви пишувам во врска со личната повреда што ја претрпев на ${incidentDate}.

Опис на настанот: ${description}

Побаран износ: ${amount}

Очекувам писмен одговор во рок од 15 работни дена и го задржувам правото да преземам понатамошни чекори ако барањето не биде разгледано.

Со почит,
${PH.senderName}`,
    };
  }

  if (locale === 'sr') {
    return {
      subject: 'Zahtev za naknadu zbog telesne povrede',
      body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Datum: ${incidentDate}
Referenca: ${PH.referenceNumber}

Predmet: Zahtev za naknadu zbog telesne povrede

Poštovani,

Pišem vam povodom telesne povrede koju sam pretrpeo/pretrpela ${incidentDate}.

Opis događaja: ${description}

Traženi iznos: ${amount}

Očekujem pisani odgovor u roku od 15 radnih dana i zadržavam pravo da preduzmem dalje korake ako zahtev ne bude obrađen.

S poštovanjem,
${PH.senderName}`,
    };
  }

  return {
    subject: 'Claim for personal injury compensation',
    body: `${PH.senderName}
${PH.senderAddress}

${PH.recipientName}
${PH.recipientAddress}

Date: ${incidentDate}
Reference: ${PH.referenceNumber}

Subject: Claim for personal injury compensation

Dear Sir or Madam,

I am writing regarding a personal injury I sustained on ${incidentDate} as a result of your negligence.

Description of incident: ${description}

Amount claimed: ${amount}

I expect a written response within 15 business days. I reserve the right to pursue further legal action if this claim is not addressed.

Yours sincerely,
${PH.senderName}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateLetter(
  claimType: ClaimPackType,
  answers: IntakeAnswers,
  locale = 'en'
): ComplaintLetter {
  let data: LetterData;

  switch (claimType) {
    case 'vehicle':
      data = vehicleLetter(answers, locale);
      break;
    case 'property':
      data = propertyLetter(answers, locale);
      break;
    case 'injury':
      data = injuryLetter(answers, locale);
      break;
    default: {
      const _exhaustive: never = claimType;
      throw new Error(`Unknown claim type: ${_exhaustive}`);
    }
  }

  // Determine which placeholders are still present in the generated letter
  const placeholders = ALL_PLACEHOLDERS.filter(ph => data.body.includes(ph));

  return {
    locale,
    body: data.body,
    placeholders,
  };
}
