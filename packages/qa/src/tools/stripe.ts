import Stripe from 'stripe';

export async function getStripeResource(args: { resource: string; id: string }) {
  const { resource, id } = args;
  const secretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

  if (secretKey === 'sk_test_placeholder') {
    return { content: [{ type: 'text', text: 'Error: STRIPE_SECRET_KEY not set in .env' }] };
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' as any });

  try {
    let result;
    if (resource === 'customers') result = await stripe.customers.retrieve(id);
    else if (resource === 'products') result = await stripe.products.retrieve(id);
    else if (resource === 'prices') result = await stripe.prices.retrieve(id);
    else if (resource === 'paymentIntents') result = await stripe.paymentIntents.retrieve(id);
    else throw new Error(`Resource ${resource} not supported yet`);

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Stripe Error: ${e.message}` }] };
  }
}
