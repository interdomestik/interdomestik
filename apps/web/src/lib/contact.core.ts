import { buildSafeTelHref, buildSafeWhatsappHref } from './safe-contact-hrefs';

type ContactInfo = {
  phone: string;
  telHref: `tel:${string}`;
  whatsapp: `https://${string}`;
  address?: string;
  hours?: string;
};

type ContactDefaults = Omit<ContactInfo, 'telHref'>;

const defaults: ContactDefaults = {
  phone: '+383 49 900 600',
  whatsapp: 'https://wa.me/38349900600',
  address: 'Prishtina, Kosovo',
  hours: 'Mon–Fri, 09:00–17:00',
};

function isDigit(char: string): boolean {
  const code = char.codePointAt(0) ?? -1;
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

const phone = sanitizePhone(process.env.NEXT_PUBLIC_CONTACT_PHONE);

export const contactInfo: ContactInfo = {
  phone,
  telHref: buildSafeTelHref(phone),
  whatsapp: buildSafeWhatsappHref(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP),
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || defaults.address,
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS || defaults.hours,
};
