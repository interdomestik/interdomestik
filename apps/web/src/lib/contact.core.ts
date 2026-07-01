import {
  buildSafeTelHref,
  buildSafeWhatsappHref,
  formatSafeContactPhone,
  resolveSafeContactPhone,
} from './safe-contact-hrefs';

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

const phoneE164 = resolveSafeContactPhone(process.env.NEXT_PUBLIC_CONTACT_PHONE);
const phone = formatSafeContactPhone(phoneE164);

export const contactInfo: ContactInfo = {
  phone,
  telHref: buildSafeTelHref(phoneE164),
  whatsapp: buildSafeWhatsappHref(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP),
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || defaults.address,
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS || defaults.hours,
};
