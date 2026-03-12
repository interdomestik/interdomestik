export type SuccessFeePaymentAuthorizationState = 'pending' | 'authorized' | 'revoked';

export type SuccessFeeCollectionMethod = 'deduction' | 'payment_method_charge' | 'invoice';

export type SuccessFeeAmountQuote = Readonly<{
  feeAmount: number;
  minimumApplied: boolean;
  minimumFee: number;
  percentageFeeAmount: number;
  ratePercentage: number;
  recoveryAmount: number;
}>;

export type SuccessFeeCollectionPlan = Readonly<{
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: string | null;
  method: SuccessFeeCollectionMethod;
  paymentAuthorizationState: SuccessFeePaymentAuthorizationState;
}>;

function normalizeAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function addDays(now: Date, days: number) {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calculateSuccessFeeAmount(params: {
  minimumFee: number;
  ratePercentage: number;
  recoveryAmount: number;
}): SuccessFeeAmountQuote {
  const recoveryAmount = normalizeAmount(params.recoveryAmount);
  const minimumFee = normalizeAmount(params.minimumFee);
  const ratePercentage = normalizeAmount(params.ratePercentage);

  if (recoveryAmount === 0) {
    return {
      feeAmount: 0,
      minimumApplied: false,
      minimumFee,
      percentageFeeAmount: 0,
      ratePercentage,
      recoveryAmount,
    };
  }

  const percentageFeeAmount = normalizeAmount((recoveryAmount * ratePercentage) / 100);
  const feeAmount = Math.max(percentageFeeAmount, minimumFee);

  return {
    feeAmount,
    minimumApplied: feeAmount === minimumFee && percentageFeeAmount < minimumFee,
    minimumFee,
    percentageFeeAmount,
    ratePercentage,
    recoveryAmount,
  };
}

export function resolveSuccessFeeCollectionPlan(params: {
  deductionAllowed: boolean;
  hasStoredPaymentMethod: boolean;
  now?: Date;
  paymentAuthorizationState: SuccessFeePaymentAuthorizationState;
}): SuccessFeeCollectionPlan {
  if (params.deductionAllowed) {
    return {
      hasStoredPaymentMethod: params.hasStoredPaymentMethod,
      invoiceDueAt: null,
      method: 'deduction',
      paymentAuthorizationState: params.paymentAuthorizationState,
    };
  }

  if (params.paymentAuthorizationState === 'authorized' && params.hasStoredPaymentMethod) {
    return {
      hasStoredPaymentMethod: true,
      invoiceDueAt: null,
      method: 'payment_method_charge',
      paymentAuthorizationState: params.paymentAuthorizationState,
    };
  }

  const now = params.now ?? new Date();

  return {
    hasStoredPaymentMethod: params.hasStoredPaymentMethod,
    invoiceDueAt: addDays(now, 7).toISOString(),
    method: 'invoice',
    paymentAuthorizationState: params.paymentAuthorizationState,
  };
}
