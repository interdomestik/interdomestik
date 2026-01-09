import { DATA } from './data';
import {
  type CountryCode,
  type CountryGuidance,
  type SupportedLanguage,
  SupportedLanguages,
} from './types';

export class CountryGuidanceService {
  /**
   * Retrieves accident guidance for a specific country and language.
   * Defaults to English if language is not supported.
   * Throws if country is not supported.
   */
  getGuidance(countryCode: string, lang: string): CountryGuidance {
    const code = countryCode.toUpperCase();

    // Check if country exists in DATA (safe cast check)
    if (!(code in DATA)) {
      throw new Error(`Country code ${code} not supported`);
    }

    const countryData = DATA[code as CountryCode];

    // Fallback language logic
    // If exact lang match exists, use it.
    // If not, try 'en'.
    // If 'en' missing (unlikely given structure), fail safe.

    let targetLang: SupportedLanguage = 'en';
    if (SupportedLanguages.includes(lang as any)) {
      targetLang = lang as SupportedLanguage;
    }

    return countryData[targetLang];
  }

  getSupportedCountries(): string[] {
    return Object.keys(DATA);
  }
}

export const countryGuidanceService = new CountryGuidanceService();
