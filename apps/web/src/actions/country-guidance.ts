'use server';

import { memberGuarded } from '@/lib/privacy/require-member-acceptance';
import { runAuthenticatedAction } from '@/lib/safe-action';
import { CountryCodeSchema, countryGuidanceService } from '@interdomestik/domain-country-guidance';
import { z } from 'zod';

const inputSchema = z.object({
  countryCode: z.string().min(2),
  language: z.string().min(2),
});

const guardedGetCountryGuidanceAction = memberGuarded(
  async (_authorized, input: z.infer<typeof inputSchema>) => {
    return runAuthenticatedAction(
      () =>
        new Promise<ReturnType<typeof countryGuidanceService.getGuidance>>(resolve => {
          // Note: This action is public/safe-ish, but our wrapper adheres to RBAC invariants.

          const parsed = inputSchema.parse(input);

          // Validate country code strictly against domain schema
          const safeCountryCode = CountryCodeSchema.safeParse(parsed.countryCode);

          if (!safeCountryCode.success) {
            throw new Error('Unsupported Country Code');
          }

          try {
            resolve(countryGuidanceService.getGuidance(safeCountryCode.data, parsed.language));
          } catch (error) {
            console.error('Country Guidance Error', error);
            throw new Error('Failed to retrieve guidance.');
          }
        })
    );
  }
);

export async function getCountryGuidanceAction(
  ...args: Parameters<typeof guardedGetCountryGuidanceAction>
) {
  return guardedGetCountryGuidanceAction(...args);
}
