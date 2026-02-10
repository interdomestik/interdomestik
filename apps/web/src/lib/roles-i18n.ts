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
