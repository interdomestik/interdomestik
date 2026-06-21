type TxSelectParams = {
  emptyConsentLimit: () => unknown;
  paymentLimit: () => unknown;
};

export function createClaimActionTxSelect(params: TxSelectParams) {
  const orderByConsent = () => ({ limit: params.emptyConsentLimit });
  const wherePaymentOrConsent = () => ({
    limit: params.paymentLimit,
    orderBy: orderByConsent,
  });
  const fromAnyTable = () => ({ where: wherePaymentOrConsent });

  return () => ({ from: fromAnyTable });
}
