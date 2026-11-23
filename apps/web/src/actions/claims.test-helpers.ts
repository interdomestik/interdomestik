type TxSelectParams = {
  attachedEvidenceRows: () => Promise<unknown[]>;
  emptyConsentLimit: () => unknown;
  paymentLimit: () => unknown;
};

export function createClaimActionTxSelect(params: TxSelectParams) {
  const orderByConsent = () => ({ limit: params.emptyConsentLimit });
  // A real promise of the attached-evidence rows, for the submit's direct await of `where(...)`
  // (`readAttachedObjects`), that also offers the `limit` / `orderBy` continuations other reads use.
  const wherePaymentOrConsent = () =>
    Object.assign(params.attachedEvidenceRows(), {
      limit: params.paymentLimit,
      orderBy: orderByConsent,
    });
  const fromAnyTable = () => ({ where: wherePaymentOrConsent });

  return () => ({ from: fromAnyTable });
}
