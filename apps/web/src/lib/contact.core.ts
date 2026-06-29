type ContactInfo = {
  phone: string;
  whatsapp: string;
  address?: string;
  hours?: string;
};

const defaults: ContactInfo = {
  phone: '+383 49 900 600',
  whatsapp: 'https://wa.me/38349900600',
  address: 'Prishtina, Kosovo',
  hours: 'Mon–Fri, 09:00–17:00',
};

function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function sanitizePhone(value: string | undefined): string {
  const phone = (value || defaults.phone).trim();
  let digits = 0;
  for (const char of phone) {
    if (isDigit(char)) {
      digits += 1;
    } else if (!['+', ' ', '-', '(', ')'].includes(char)) {
      return defaults.phone;
    }
  }
  return digits >= 6 ? phone : defaults.phone;
}

function sanitizeWhatsapp(value: string | undefined): string {
  try {
    const url = new URL(value || defaults.whatsapp);
    const phone = url.pathname.slice(1);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'wa.me' &&
      !url.search &&
      !url.hash &&
      phone &&
      [...phone].every(isDigit)
    ) {
      return url.toString();
    }
  } catch {
    // Fall through to the safe default.
  }
  return defaults.whatsapp;
}

export const contactInfo: ContactInfo = {
  phone: sanitizePhone(process.env.NEXT_PUBLIC_CONTACT_PHONE),
  whatsapp: sanitizeWhatsapp(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP),
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || defaults.address,
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS || defaults.hours,
};
