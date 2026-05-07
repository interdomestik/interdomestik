function membershipCardTenantPrefix(tenantId: string): string {
  switch (tenantId) {
    case 'tenant_ks':
      return 'KS';
    case 'pilot-mk':
      return 'PILOT';
    default:
      return 'MK';
  }
}

export function buildSeededMembershipCardIdentifiers(
  subscriptionId: string,
  tenantId: string
): {
  cardNumber: string;
  qrCodeToken: string;
} {
  const tenantPrefix = membershipCardTenantPrefix(tenantId);
  const normalizedSubscriptionId = subscriptionId.toUpperCase();

  return {
    cardNumber: `ID-${tenantPrefix}-${normalizedSubscriptionId}`,
    qrCodeToken: `qr_${subscriptionId}`,
  };
}
