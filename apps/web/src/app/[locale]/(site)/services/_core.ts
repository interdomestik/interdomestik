import { buildSafeTelHref, buildSafeWhatsappHref } from '@/lib/safe-contact-hrefs';

export type ServicesPageContactModel = {
  phone: string | null;
  whatsapp: `https://${string}` | null;
  telHref?: `tel:${string}`;
};

export function buildTelHref(phone: string | null | undefined): `tel:${string}` | undefined {
  if (!phone) return undefined;
  return buildSafeTelHref(phone);
}

function buildWhatsappHref(whatsapp: string | null | undefined): `https://${string}` | null {
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
