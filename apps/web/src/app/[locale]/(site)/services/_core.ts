export type ServicesPageContactModel = {
  phone: string | null;
  whatsapp: string | null;
  telHref?: string;
};

export function buildTelHref(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  return `tel:${phone.replace(/\s+/g, '')}`;
}

export function getServicesPageContactModel(input: {
  phone?: string | null;
  whatsapp?: string | null;
}): ServicesPageContactModel {
  const phone = input.phone ?? null;
  const whatsapp = input.whatsapp ?? null;

  return {
    phone,
    whatsapp,
    telHref: buildTelHref(phone),
  };
}
