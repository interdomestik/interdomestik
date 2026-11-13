import { z } from 'zod';

const locale = z.enum(['sq', 'en', 'mk', 'sr', 'de']);
const standard = z.object({
  title: z.string(),
  intro: z.string(),
  details: z.array(z.string()).optional(),
  ctaLabel: z.string(),
  ctaUrl: z.string(),
  footer: z.string().optional(),
});
const cash = z.object({
  leadName: z.string(),
  status: z.string(),
  note: z.string().optional(),
  amount: z.number(),
  currency: z.string(),
  link: z.string(),
});
const thankYou = z.object({
  memberName: z.string(),
  memberNumber: z.string(),
  planName: z.string(),
  planPrice: z.string(),
  planInterval: z.string(),
  memberSince: z.string(),
  expiresAt: z.string(),
  providerReference: z.string(),
  dashboardUrl: z.string(),
  locale,
});
const sponsorCommon = {
  locale,
  firstName: z.string().nullable(),
  supportEmail: z.string(),
};
const company = { ...sponsorCommon, companyName: z.string() };
const sponsor = z.discriminatedUnion('kind', [
  z.object({
    ...company,
    kind: z.literal('sponsor_notice'),
    entityName: z.string(),
    startDate: z.string(),
    termEnd: z.string(),
    optOutUrl: z.string(),
    loginUrl: z.string(),
  }),
  z.object({ ...company, kind: z.literal('handover_pending') }),
  z.object({ ...company, kind: z.literal('handover_confirmed'), startDate: z.string() }),
  z.object({ ...company, kind: z.literal('foreign_account') }),
  z.object({ ...company, kind: z.literal('not_eligible') }),
  z.object({ ...company, kind: z.literal('renewal_notice'), termEnd: z.string() }),
  z.object({ ...sponsorCommon, kind: z.literal('membership_end_offer'), offerUrl: z.string() }),
  z.object({ ...company, kind: z.literal('opt_out_confirmation') }),
]);

/** Serializable render inputs. Only the declared URL fields are application destinations. */
export const emailSourceSchema = z.discriminatedUnion('kind', [
  z.object({ version: z.literal(1), kind: z.literal('standard'), params: standard }),
  z.object({ version: z.literal(1), kind: z.literal('cash'), params: cash }),
  z.object({ version: z.literal(1), kind: z.literal('thank-you'), params: thankYou }),
  z.object({ version: z.literal(1), kind: z.literal('sponsor'), params: sponsor }),
]);
export type EmailSource = z.infer<typeof emailSourceSchema>;
export type PaymentVerificationParams = z.infer<typeof cash>;
