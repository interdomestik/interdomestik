import {
  buildSafeTelHref,
  buildSafeWhatsappHref,
  type SafeTelHref,
  type SafeWhatsappHref,
} from '@/lib/safe-contact-hrefs';

export type ServicesPageContactModel = {
  phone: string | null;
  whatsapp: SafeWhatsappHref | null;
  telHref?: SafeTelHref;
};

export function buildTelHref(phone: string | null | undefined): SafeTelHref | undefined {
  if (!phone) return undefined;
  return buildSafeTelHref(phone);
}

function buildWhatsappHref(whatsapp: string | null | undefined): SafeWhatsappHref | null {
  if (!whatsapp) return null;
  return buildSafeWhatsappHref(whatsapp);
}

export function getServicesPageContactModel(input: {
  phone?: string | null;
  whatsapp?: string | null;
}): ServicesPageContactModel {
  const phone = input.phone ?? null;

  return {
    phone,
    whatsapp: buildWhatsappHref(input.whatsapp),
    telHref: buildTelHref(phone),
  };
}
