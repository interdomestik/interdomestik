import { z } from 'zod';

// Shared
const customDataSchema = z
  .object({
    userId: z.string().optional(),
    agentId: z.string().optional(),
    tenantId: z.string().optional(),
    locale: z.unknown().optional(),
    acquisitionSource: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmContent: z.string().optional(),
  })
  .passthrough(); // NOSONAR

const billingCycleSchema = z.object({
  interval: z.enum(['day', 'week', 'month', 'year']),
  frequency: z.number().int().positive(),
});

// Paddle sends `null` (not an absent key) for unset nullable entity fields, so every
// Paddle-nullable field below is `.nullable().optional()`.
const priceSchema = z
  .object({
    id: z.string().optional(),
    name: z.unknown().optional(),
    description: z.string().optional(),
    unitPrice: z
      .object({
        amount: z.string().optional(),
        currencyCode: z.string().optional(),
      })
      .optional(),
    unit_price: z
      .object({
        amount: z.string().optional(),
        currency_code: z.string().optional(),
      })
      .optional(),
    // Paddle sends null for one-time prices.
    billingCycle: billingCycleSchema.nullable().optional(),
    billing_cycle: billingCycleSchema.nullable().optional(),
  })
  .passthrough(); // NOSONAR

const itemSchema = z
  .object({
    priceId: z.string().optional(),
    price: priceSchema.optional(),
    quantity: z.number().optional(),
  })
  .passthrough(); // NOSONAR

const billingPeriodSchema = z
  .object({
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  })
  .passthrough(); // NOSONAR

const scheduledChangeSchema = z.object({ action: z.string().optional() });

// Subscription Event Data
export const subscriptionEventDataSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    transactionId: z.string().optional().nullable(),
    transaction_id: z.string().optional().nullable(),
    customerId: z.string().optional(),
    customer_id: z.string().optional(), // Paddle sometimes uses underscore

    // Custom Data variants
    customData: customDataSchema.nullable().optional(),
    custom_data: customDataSchema.nullable().optional(),

    items: z.array(itemSchema).optional(),

    // Billing Period variants
    currentBillingPeriod: billingPeriodSchema.nullable().optional(),
    current_billing_period: billingPeriodSchema.nullable().optional(), // Paddle snake_case fallback
    billingCycle: billingCycleSchema.optional(),
    billing_cycle: billingCycleSchema.optional(),

    // Scheduled Change
    scheduledChange: scheduledChangeSchema.nullable().optional(),
    scheduled_change: scheduledChangeSchema.nullable().optional(),
  })
  .passthrough(); // NOSONAR

// Transaction Event Data
export const transactionEventDataSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    customerId: z.string().optional().nullable(),
    customer_id: z.string().optional().nullable(),
    customerEmail: z.string().email().optional().nullable(),
    customer_email: z.string().email().optional().nullable(),

    subscriptionId: z.string().optional().nullable(),
    subscription_id: z.string().optional().nullable(),

    customData: customDataSchema.nullable().optional(),
    custom_data: customDataSchema.nullable().optional(),

    details: z
      .object({
        totals: z
          .object({
            total: z.string().optional(),
            currencyCode: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough(); // NOSONAR
