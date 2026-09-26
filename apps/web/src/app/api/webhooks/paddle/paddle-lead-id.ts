const PADDLE_LEAD_ID_PATTERN = /^[A-Za-z0-9_:-]{1,128}$/;

export function getPaddleLeadId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as {
    customData?: { leadId?: unknown };
    custom_data?: { leadId?: unknown };
  };
  const value = (payload.custom_data ?? payload.customData)?.leadId;
  if (typeof value !== 'string') return null;
  const leadId = value.trim();
  return leadId && PADDLE_LEAD_ID_PATTERN.test(leadId) ? leadId : null;
}
