import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
});

/**
 * Subscription plan IDs - configure these in your Stripe Dashboard
 */
export const PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    priceId: process.env.STRIPE_PRICE_BASIC || 'price_basic',
    monthlyPrice: 5,
    yearlyPrice: 50,
    claimsPerYear: 3,
    features: ['email_support', 'document_upload', 'status_tracking'],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    priceId: process.env.STRIPE_PRICE_STANDARD || 'price_standard',
    monthlyPrice: 10,
    yearlyPrice: 96,
    claimsPerYear: 10,
    features: ['priority_support', 'live_chat', 'advanced_tracking'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceId: process.env.STRIPE_PRICE_PREMIUM || 'price_premium',
    monthlyPrice: 15,
    yearlyPrice: 144,
    claimsPerYear: -1, // Unlimited
    features: ['vip_support', 'phone_calls', 'e_signatures', 'legal_representation'],
  },
  family: {
    id: 'family',
    name: 'Family',
    priceId: process.env.STRIPE_PRICE_FAMILY || 'price_family',
    monthlyPrice: 20,
    yearlyPrice: 192,
    claimsPerYear: -1, // Unlimited
    maxMembers: 4,
    features: ['all_premium_features', 'family_sharing'],
  },
} as const;

export type PlanId = keyof typeof PLANS;

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  });

  return session;
}

/**
 * Create or retrieve a Stripe customer
 */
export async function getOrCreateCustomer({
  email,
  name,
  metadata,
}: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}) {
  // Search for existing customer
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  return stripe.customers.create({
    email,
    name,
    metadata,
  });
}

/**
 * Create a Billing Portal session for subscription management
 */
export async function createBillingPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
