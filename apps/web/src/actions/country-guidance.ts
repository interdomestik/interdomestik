'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { CountryCodeSchema, countryGuidanceService } from '@interdomestik/domain-country-guidance';
import { z } from 'zod';

const inputSchema = z.object({
  countryCode: z.string().min(2),
  language: z.string().min(2),
});

export async function getCountryGuidanceAction(input: z.infer<typeof inputSchema>) {
  return runAuthenticatedAction(async () => {
    // Note: This action is public/safe-ish, but our wrapper adheres to RBAC invariants.

    const parsed = inputSchema.parse(input);

    // Validate country code strictly against domain schema
    const safeCountryCode = CountryCodeSchema.safeParse(parsed.countryCode);

    if (!safeCountryCode.success) {
      throw new Error('Unsupported Country Code');
    }

    try {
      const guidance = countryGuidanceService.getGuidance(safeCountryCode.data, parsed.language);
      return guidance;
    } catch (error) {
      console.error('Country Guidance Error', error);
      throw new Error('Failed to retrieve guidance.');
    }
  });
}
