export type UserSession = {
  user: {
    id: string;
    role: string;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
  };
};

export type ActionResult = { success: true } | { error: string };
