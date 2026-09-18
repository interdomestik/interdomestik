import { z } from 'zod';

import { CountryCodeSchema } from './types';

export const MAX_TRANSIT_COUNTRIES = 12;

export const DiasporaCorridorContextSchema = z.object({
  origin: CountryCodeSchema,
  destination: CountryCodeSchema,
  transit: z.array(CountryCodeSchema).max(MAX_TRANSIT_COUNTRIES),
});

export type DiasporaCorridorContext = z.infer<typeof DiasporaCorridorContextSchema>;

export type DiasporaCorridorSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function transitValues(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : value;
}

export function parseDiasporaCorridorContext(
  input: DiasporaCorridorSearchParams
): DiasporaCorridorContext | null {
  const parsed = DiasporaCorridorContextSchema.safeParse({
    origin: input.origin,
    destination: input.destination,
    transit: transitValues(input.transit),
  });

  return parsed.success ? parsed.data : null;
}

export function serializeDiasporaCorridorContext(
  context: DiasporaCorridorContext,
  initial?: URLSearchParams
): URLSearchParams {
  const parsed = DiasporaCorridorContextSchema.parse(context);
  const params = new URLSearchParams(initial);

  params.delete('origin');
  params.delete('destination');
  params.delete('transit');
  params.append('origin', parsed.origin);
  params.append('destination', parsed.destination);
  for (const country of parsed.transit) params.append('transit', country);

  return params;
}
