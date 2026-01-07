import { z } from 'zod';

// Shared
const customDataSchema = z
  .object({
    userId: z.string().optional(),
    agentId: z.string().optional(),
  })
  .passthrough(); // NOSONAR

const priceSchema = z
  .object({
    id: z.string().optional(),
    description: z.string().optional(),
    unitPrice: z
      .object({
        amount: z.string().optional(),
        currencyCode: z.string().optional(),
      })
      .optional(),
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

// Subscription Event Data
export const subscriptionEventDataSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    customerId: z.string().optional(),
    customer_id: z.string().optional(), // Paddle sometimes uses underscore

    // Custom Data variants
    customData: customDataSchema.optional(),
    custom_data: customDataSchema.optional(),

    items: z.array(itemSchema).optional(),

    // Billing Period variants
    currentBillingPeriod: billingPeriodSchema.optional(),
    current_billing_period: billingPeriodSchema.optional(), // Paddle snake_case fallback

    // Scheduled Change
    scheduledChange: z.object({ action: z.string().optional() }).optional(),
    scheduled_change: z.object({ action: z.string().optional() }).optional(),
  })
  .passthrough(); // NOSONAR

// Transaction Event Data
export const transactionEventDataSchema = z
  .object({
    id: z.string(),
    status: z.string(),

    subscriptionId: z.string().optional().nullable(),
    subscription_id: z.string().optional().nullable(),

    customData: customDataSchema.optional(),
    custom_data: customDataSchema.optional(),

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
