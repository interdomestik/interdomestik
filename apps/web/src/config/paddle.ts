export const PADDLE_PRICES = {
  standard: {
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR || 'pri_standard_year',
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_STANDARD_MONTH || 'pri_standard_month',
  },
  family: {
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR || 'pri_family_year',
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_FAMILY_MONTH || 'pri_family_month',
  },
  business: {
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR || 'pri_business_year',
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_MONTH || 'pri_business_month',
  },
  basic: {
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEAR || 'pri_basic_year',
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTH || 'pri_basic_month',
  },
} as const;

export type PlanId = keyof typeof PADDLE_PRICES;
