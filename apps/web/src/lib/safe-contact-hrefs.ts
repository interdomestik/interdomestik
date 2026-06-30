const DEFAULT_PHONE_E164 = '+38349900600';
const DEFAULT_WHATSAPP_HREF = `https://wa.me/${DEFAULT_PHONE_E164.slice(1)}` as const;

function isDigit(char: string): boolean {
  const code = char.codePointAt(0) ?? -1;
  return code >= 48 && code <= 57;
}

export function normalizeE164Phone(value: string | null | undefined): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');
  const phone = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  const digits = phone.slice(1);

  if (
    phone.startsWith('+') &&
    digits.length >= 6 &&
    digits.length <= 15 &&
    [...digits].every(isDigit)
  ) {
    return phone;
  }

  return DEFAULT_PHONE_E164;
}

export function buildSafeTelHref(value: string | null | undefined): `tel:${string}` {
  const phone = normalizeE164Phone(value);
  return `tel:${phone}`;
}

export function buildSafeWhatsappHref(value: string | null | undefined): `https://${string}` {
  try {
    const candidate = new URL(value || DEFAULT_WHATSAPP_HREF);
    const phone = candidate.pathname.slice(1);
    if (
      candidate.protocol === 'https:' &&
      candidate.hostname === 'wa.me' &&
      !candidate.search &&
      !candidate.hash &&
      phone.length >= 6 &&
      phone.length <= 15 &&
      [...phone].every(isDigit)
    ) {
      return candidate.toString() as `https://${string}`;
    }
  } catch {
    // Fall through to the safe default.
  }

  return DEFAULT_WHATSAPP_HREF;
}
