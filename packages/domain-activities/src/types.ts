export type LeadActivityType = 'call' | 'email' | 'meeting' | 'note' | 'other';

export type ActionResult = { success: true; error: undefined } | { success: false; error: string };

export type ActivitySession = {
  user: {
    id: string;
    role: string;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
  };
};
