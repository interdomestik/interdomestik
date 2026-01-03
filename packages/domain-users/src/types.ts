export type UserSession = {
  user: {
    id: string;
    role: string;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
    branchId?: string | null; // Added Phase 2
    agentId?: string | null; // Added Phase 2
  };
};

export type ActionResult<T = unknown> = { success: true; data?: T } | { error: string };
