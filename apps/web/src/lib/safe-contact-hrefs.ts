const DEFAULT_PHONE_E164 = '+38349900600';
const MK_PHONE_E164 = '+38970337140';

export type SafeContactPhoneE164 = '+38349900600' | '+38970337140';
export type SafeTelHref = 'tel:+38349900600' | 'tel:+38970337140';
export type SafeWhatsappHref = 'https://wa.me/38349900600' | 'https://wa.me/38970337140';

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

export function resolveSafeContactPhone(value: string | null | undefined): SafeContactPhoneE164 {
  const phone = normalizeE164Phone(value);
  if (phone === MK_PHONE_E164) {
    return MK_PHONE_E164;
  }

  return DEFAULT_PHONE_E164;
}

export function formatSafeContactPhone(phone: SafeContactPhoneE164): string {
  if (phone === MK_PHONE_E164) {
    return '+389 70 337 140';
  }

  return '+383 49 900 600';
}

export function buildSafeTelHref(value: string | null | undefined): SafeTelHref {
  const phone = resolveSafeContactPhone(value);
  if (phone === MK_PHONE_E164) {
    return 'tel:+38970337140';
  }

  return 'tel:+38349900600';
}

function whatsappHrefForPhone(phone: string): SafeWhatsappHref {
  if (phone === MK_PHONE_E164) {
    return 'https://wa.me/38970337140';
  }

  return 'https://wa.me/38349900600';
}

export function buildSafeWhatsappHref(value: string | null | undefined): SafeWhatsappHref {
  try {
    const candidate = new URL(value || whatsappHrefForPhone(DEFAULT_PHONE_E164));
    const phone = `+${candidate.pathname.slice(1)}`;
    if (
      candidate.protocol === 'https:' &&
      candidate.hostname === 'wa.me' &&
      !candidate.search &&
      !candidate.hash &&
      (phone === DEFAULT_PHONE_E164 || phone === MK_PHONE_E164)
    ) {
      return whatsappHrefForPhone(phone);
    }
  } catch {
    // Fall through to the safe default.
  }

  return whatsappHrefForPhone(DEFAULT_PHONE_E164);
}
