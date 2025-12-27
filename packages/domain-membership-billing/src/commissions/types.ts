import { z } from 'zod';

export const commissionStatusSchema = z.enum(['pending', 'approved', 'paid', 'void']);
export const commissionTypeSchema = z.enum(['new_membership', 'renewal', 'upgrade', 'b2b']);

export type CommissionStatus = z.infer<typeof commissionStatusSchema>;
export type CommissionType = z.infer<typeof commissionTypeSchema>;

export interface Commission {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  memberId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  subscriptionId: string | null;
  type: CommissionType;
  status: CommissionStatus;
  amount: string;
  currency: string;
  earnedAt: Date | null;
  paidAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface CommissionSummary {
  totalPending: number;
  totalApproved: number;
  totalPaid: number;
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export type CommissionSession = {
  user: {
    id: string;
    role: string;
    name?: string | null;
    email: string;
  };
};

// Default commission rates
export const DEFAULT_COMMISSION_RATES: CommissionRates = {
  new_membership: 0.2, // 20% of first payment
  renewal: 0.1, // 10% of renewal
  upgrade: 0.15, // 15% of upgrade amount
  b2b: 0.25, // 25% for B2B deals
};

// Commission rates type for per-agent customization
export type CommissionRates = Partial<Record<CommissionType, number>>;

// Agent settings for commission configuration
export interface AgentCommissionSettings {
  agentId: string;
  commissionRates: CommissionRates;
  tier: 'standard' | 'premium' | 'vip';
  canNegotiateRates: boolean;
  minPayoutAmount: number;
}

/** Calculate commission with optional custom rates */
export function calculateCommission(
  type: CommissionType,
  transactionAmount: number,
  customRates?: CommissionRates
): number {
  const rates = { ...DEFAULT_COMMISSION_RATES, ...customRates };
  const rate = rates[type] ?? 0.1;
  return Math.round(transactionAmount * rate * 100) / 100;
}
