export type DiasporaOrigin = {
  source: 'diaspora-green-card';
  country: 'DE' | 'CH' | 'AT' | 'IT';
};

const NOTE_PATTERN =
  /^(?:Started from Diaspora \/ Green Card quickstart\. Country:|Member-submitted Diaspora\/Green Card guidance:) (DE|CH|AT|IT)(?:\. Incident location: abroad\.|; not incident-country authority\.)$/;

export function parseDiasporaOriginFromPublicNote(
  note: string | null | undefined
): DiasporaOrigin | null {
  const country = note?.match(NOTE_PATTERN)?.[1] as DiasporaOrigin['country'] | undefined;
  return country ? { source: 'diaspora-green-card', country } : null;
}
