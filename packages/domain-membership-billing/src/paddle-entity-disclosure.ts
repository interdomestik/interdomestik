import type { BillingEntity } from './paddle-server';

export type PublicBillingEntityDisclosure = {
  contractingCompany: string | null;
  governingLaw: string | null;
  unavailable: boolean;
};

const PUBLIC_BILLING_ENTITY_DISCLOSURES: Record<BillingEntity, PublicBillingEntityDisclosure> = {
  ks: {
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
  },
  mk: {
    contractingCompany: 'Interdomestik MK DOOEL',
    governingLaw: 'MK',
    unavailable: false,
  },
  al: {
    contractingCompany: null,
    governingLaw: null,
    unavailable: true,
  },
};

export function getPublicBillingEntityDisclosure(
  entity: BillingEntity
): PublicBillingEntityDisclosure {
  return PUBLIC_BILLING_ENTITY_DISCLOSURES[entity];
}
