type Translator = ((key: string) => string) & {
  has?: (key: string) => boolean;
};

export function getRoleLabel(
  tCommon: Translator,
  role: string | null | undefined,
  fallback = 'unknown'
): string {
  const normalized = role?.trim();
  if (!normalized) {
    return fallback;
  }

  const key = `roles.${normalized}`;

  if (typeof tCommon.has === 'function' && tCommon.has(key)) {
    return tCommon(key);
  }

  try {
    const translated = tCommon(key);
    if (translated !== key) return translated;
  } catch {
    // Guard against missing-message throws from strict i18n config.
  }

  return normalized;
}

/** The operator-facing message for a failed role grant or revoke in the roles panel. */
export function roleMutationErrorMessage(
  result: { error: string; code?: string },
  tRolesPanel: (key: string) => string
): string {
  return result.code === 'BRANCH_MEMBERSHIP_CONFLICT'
    ? tRolesPanel('toasts.branch_membership_conflict')
    : result.error;
}
