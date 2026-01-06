export interface ReferralLinkResult {
  code: string;
  link: string;
}

export type ActionResult<T> =
  | { success: true; data: T; error: undefined; fieldErrors: undefined }
  | {
      success: false;
      error: string;
      fieldErrors: Record<string, string[]> | undefined;
      data: undefined;
    };

export type ReferralSession = {
  user: {
    id: string;
    role: string;
    name?: string | null;
    tenantId?: string | null;
  };
};
