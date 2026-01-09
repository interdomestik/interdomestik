import type { CountryCode, CountryGuidance, CountryGuidanceRule, SupportedLanguage } from './types';

// Type alias matching the types.ts struct for easier handling in helpers
type EmergencyNumbers = CountryGuidance['emergencyNumbers'];

type GuidanceDictionary = Record<CountryCode, Record<SupportedLanguage, CountryGuidance>>;

const DEFAULT_GUIDANCE: Record<
  SupportedLanguage,
  {
    rules: {
      firstSteps: CountryGuidanceRule[];
      policeRequired: boolean;
      europeanAccidentStatementAllowed: boolean;
    };
  }
> = {
  en: {
    rules: {
      firstSteps: [
        { step: 1, description: 'Secure the accident scene and turn on hazard lights.' },
        { step: 2, description: 'Check for injuries and call emergency services if needed.' },
        { step: 3, description: 'Take photos of the scene and damage.' },
        { step: 4, description: 'Exchange insurance details with the other party.' },
      ],
      policeRequired: false,
      europeanAccidentStatementAllowed: true,
    },
  },
  sq: {
    rules: {
      firstSteps: [
        { step: 1, description: 'Siguroni vendin e aksidentit dhe ndizni dritat e rrezikut.' },
        {
          step: 2,
          description:
            'Kontrolloni për të lënduar dhe telefononi shërbimet e urgjencës nëse është e nevojshme.',
        },
        { step: 3, description: 'Bëni foto të vendit të ngjarjes dhe dëmeve.' },
        { step: 4, description: 'Shkëmbeni detajet e sigurimit me palën tjetër.' },
      ],
      policeRequired: false,
      europeanAccidentStatementAllowed: true,
    },
  },
  mk: {
    rules: {
      firstSteps: [
        {
          step: 1,
          description: 'Обезбедете го местото на несреќата и вклучете ги сите четири трепкачи.',
        },
        {
          step: 2,
          description: 'Проверете дали има повредени и повикајте итна помош доколку е потребно.',
        },
        { step: 3, description: 'Фотографирајте го местото и штетите.' },
        { step: 4, description: 'Разменете податоци за осигурување со другата страна.' },
      ],
      policeRequired: false,
      europeanAccidentStatementAllowed: true,
    },
  },
  de: {
    rules: {
      firstSteps: [
        {
          step: 1,
          description: 'Sichern Sie die Unfallstelle ab und schalten Sie die Warnblinkanlage ein.',
        },
        {
          step: 2,
          description: 'Prüfen Sie auf Verletzungen und rufen Sie bei Bedarf den Notdienst.',
        },
        { step: 3, description: 'Machen Sie Fotos vom Unfallort und den Schäden.' },
        { step: 4, description: 'Tauschen Sie Versicherungsdaten mit der anderen Partei aus.' },
      ],
      policeRequired: false,
      europeanAccidentStatementAllowed: true,
    },
  },
  hr: {
    rules: {
      firstSteps: [
        { step: 1, description: 'Osigurajte mjesto nesreće i uključite sva četiri žmigavca.' },
        {
          step: 2,
          description: 'Provjerite ima li ozlijeđenih i po potrebi nazovite hitnu pomoć.',
        },
        { step: 3, description: 'Fotografirajte mjesto nesreće i oštećenja.' },
        { step: 4, description: 'Razmijenite podatke o osiguranju s drugom stranom.' },
      ],
      policeRequired: false,
      europeanAccidentStatementAllowed: true,
    },
  },
};

/**
 * Helper to generate guidance for all supported languages for a specific country.
 * @param countryCode - The country code (AT, DE, etc.)
 * @param numbers - Emergency numbers for that country
 * @param overrides - Optional overrides for specific rules (e.g. policeRequired: true)
 */
function createGuidance(
  countryCode: CountryCode,
  numbers: EmergencyNumbers,
  overrides?: Partial<{ policeRequired: boolean }>
): Record<SupportedLanguage, CountryGuidance> {
  const result = {} as Record<SupportedLanguage, CountryGuidance>;
  const languages: SupportedLanguage[] = ['en', 'sq', 'mk', 'de', 'hr'];

  languages.forEach(lang => {
    const base = DEFAULT_GUIDANCE[lang];
    result[lang] = {
      countryCode,
      emergencyNumbers: numbers,
      rules: {
        ...base.rules,
        ...overrides,
      },
    };
  });

  return result;
}

// Define specific country data
const AT = createGuidance(
  'AT',
  { police: '133', ambulance: '144', fire: '122', general: '112' },
  { policeRequired: false }
);

const DE = createGuidance(
  'DE',
  { police: '110', ambulance: '112', fire: '112' },
  { policeRequired: false }
);

const CH = createGuidance(
  'CH',
  { police: '117', ambulance: '144', fire: '118', general: '112' },
  { policeRequired: false }
);

const IT = createGuidance(
  'IT',
  { police: '113', ambulance: '118', fire: '115', general: '112' },
  { policeRequired: false }
);

const MK = createGuidance(
  'MK',
  { police: '192', ambulance: '194', fire: '193', general: '112' },
  { policeRequired: true }
);

const AL = createGuidance(
  'AL',
  { police: '129', ambulance: '127', fire: '128', general: '112' },
  { policeRequired: true }
);

const XK = createGuidance(
  'XK',
  { police: '192', ambulance: '194', fire: '193', general: '112' },
  { policeRequired: true }
);

// Generic EU Countries
const EU_GENERIC: Partial<GuidanceDictionary> = {};
const EU_COUNTRIES: CountryCode[] = [
  'FR',
  'BE',
  'NL',
  'ES',
  'PT',
  'HU',
  'PL',
  'CZ',
  'RO',
  'SE',
  'NO',
  'DK',
  'IE',
];

EU_COUNTRIES.forEach(code => {
  EU_GENERIC[code] = createGuidance(code, {
    police: '112',
    ambulance: '112',
    fire: '112',
    general: '112',
  });
});

export const DATA: GuidanceDictionary = {
  AT,
  DE,
  CH,
  IT,
  MK,
  AL,
  XK,
  // Spread generic EU countries.
  // Note: We cast EU_GENERIC to any or stricter type if needed, but here it matches partial dictionary.
  // Since DATA requires ALL keys in CountryCode, and we added the missing ones to EU_COUNTRIES list above,
  // we must ensure we cover exactly the enum.
  ...(EU_GENERIC as any),
};
