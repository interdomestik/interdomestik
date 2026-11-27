export const RATE_CHECK_SCOPE_CONTRACT = {
  file: 'packages/domain-membership-billing/src/port/rate-check-context.ts',
  unit: 'lockRateCheckScope',
  kinds: { execute: 1 },
  sha256: 'f4aec0a4a3cb4a95bbc7837d9b1b98b381c87639e084120fc09908a92ecab81b',
  reason:
    'WP-07 rate-book design r2 section 2 and Astra code r4: one read of transaction_isolation on the supplied tenant transaction. Refuse unless READ COMMITTED before the EUR/MKD book and active entity locks.',
};
