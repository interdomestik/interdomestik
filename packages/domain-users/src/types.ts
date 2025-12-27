export type UserSession = {
  user: {
    id: string;
    role: string;
    name?: string | null;
    email?: string | null;
  };
};

export type ActionResult = { success: true } | { error: string };
