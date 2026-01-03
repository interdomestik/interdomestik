export type LeadActivityType = 'call' | 'email' | 'meeting' | 'note' | 'other';

export type LogLeadActivityInput = {
  leadId: string;
  type: LeadActivityType;
  subject: string;
  description?: string;
};

export type ActionResult = { success: true } | { error: string };

export type ActivitySession = {
  user: {
    id: string;
    role: string;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
  };
};
