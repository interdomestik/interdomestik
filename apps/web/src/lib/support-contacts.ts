type SupportContactsInput = {
  tenantId?: string | null;
  locale?: string | null;
};

export type SupportContacts = {
  phoneE164: string;
  phoneDisplay: string;
  telHref: string;
  whatsappE164?: string;
  whatsappHref?: string;
};

function toE164(value: string): string {
  const cleaned = value.trim().replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  return cleaned;
}

function inferMarket(params: SupportContactsInput): 'ks' | 'mk' {
  const tenant = (params.tenantId || '').toLowerCase();
  const locale = (params.locale || '').toLowerCase();

  if (tenant.includes('mk') || locale === 'mk') {
    return 'mk';
  }
  return 'ks';
}

export function getSupportContacts(params: SupportContactsInput): SupportContacts {
  const market = inferMarket(params);

  const ksPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE_KS || '+38349900600';
  const mkPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE_MK || '+38970337140';

  const defaultWhatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || ksPhone;
  const ksWhatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_KS || defaultWhatsapp;
  const mkWhatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_MK || mkPhone;

  const phoneE164 = toE164(market === 'mk' ? mkPhone : ksPhone);
  const whatsappE164 = toE164(market === 'mk' ? mkWhatsapp : ksWhatsapp);

  return {
    phoneE164,
    phoneDisplay: phoneE164,
    telHref: `tel:${phoneE164}`,
    whatsappE164,
    whatsappHref: `https://wa.me/${whatsappE164.replace('+', '')}`,
  };
}
