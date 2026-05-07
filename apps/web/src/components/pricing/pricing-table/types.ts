import type { PublicBillingCheckoutConfig } from '@interdomestik/domain-membership-billing/paddle-server';
import type { LucideIcon } from 'lucide-react';

export type PricingTableProps = Readonly<{
  userId?: string;
  email?: string;
  tenantId?: string | null;
  billingTestMode?: boolean;
  isSessionPending?: boolean;
  checkoutConfig?: PublicBillingCheckoutConfig | null;
}>;

export const PLAN_IDS = ['standard', 'family', 'business'] as const;
export const SELF_SERVE_PLAN_IDS = ['standard', 'family'] as const;

export type PlanId = (typeof PLAN_IDS)[number];
export type SelfServePlanId = (typeof SELF_SERVE_PLAN_IDS)[number];
export type PlanColor = 'indigo' | 'purple' | 'blue';

export type PricingPlan = {
  id: PlanId;
  priceId: string | null;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  icon: LucideIcon;
  color: PlanColor;
};

export type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

export type ResolvedCheckoutPriceIds = Readonly<{
  standardYear: string;
  familyYear: string;
  businessYear: string | null;
}>;

export type PlanCardProps = Readonly<{
  plan: PricingPlan;
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  renderBusinessMembershipLink: boolean;
  colorClass: string;
  billedAnnuallyLabel: string;
  popularLabel: string;
  ctaLabel: string;
  onClick: () => void;
}>;

export type PricingPlanGridProps = Readonly<{
  plans: readonly PricingPlan[];
  selectedPlanId: string | null;
  loadingPriceId: string | null;
  isPilotMode: boolean;
  isSessionPending: boolean;
  t: TranslateFn;
  onPlanCtaClick: (plan: PricingPlan) => void;
}>;

export type LocalCheckoutWarningProps = Readonly<{
  plan: PricingPlan;
  t: TranslateFn;
}>;

export type PrecheckoutConfirmationProps = Readonly<{
  plan: PricingPlan;
  loading: boolean;
  t: TranslateFn;
  onContinue: () => void;
  onCancel: () => void;
}>;

export type OtpCheckoutStepProps = Readonly<{
  plan: PricingPlan;
  email: string;
  code: string;
  error: string | null;
  success: string | null;
  sending: boolean;
  verifying: boolean;
  t: TranslateFn;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
  onSend: () => void;
  onBack: () => void;
  onVerify: () => void;
}>;
