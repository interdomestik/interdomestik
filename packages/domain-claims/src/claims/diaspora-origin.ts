export type DiasporaOrigin = {
  source: 'diaspora-green-card';
  country: 'DE' | 'CH' | 'AT' | 'IT';
};

const DIASPORA_PUBLIC_NOTE_PATTERN =
  /^Started from Diaspora \/ Green Card quickstart\. Country: (DE|CH|AT|IT)\. Incident location: abroad\.$/;

export function parseDiasporaOriginFromPublicNote(
  note: string | null | undefined
): DiasporaOrigin | null {
  if (!note) {
    return null;
  }

  const match = note.match(DIASPORA_PUBLIC_NOTE_PATTERN);
  if (!match) {
    return null;
  }

  return {
    source: 'diaspora-green-card',
    country: match[1] as DiasporaOrigin['country'],
  };
}
