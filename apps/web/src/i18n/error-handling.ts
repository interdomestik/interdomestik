type NextIntlError = {
  code?: string;
  message?: string;
};

type MessageFallbackParams = {
  error: unknown;
  key: string;
  namespace?: string;
};

const WARNED_MISSING_KEYS = new Set<string>();

export function isStrictI18n(): boolean {
  return process.env.INTERDOMESTIK_AUTOMATED === '1' || process.env.NODE_ENV !== 'production';
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as NextIntlError).code;
}

function getErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as NextIntlError).message;
}

function isMissingMessageError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code) return code === 'MISSING_MESSAGE';

  const message = getErrorMessage(error);
  // Defensive fallback for future next-intl versions.
  return message?.toLowerCase().includes('missing message') ?? false;
}

export function onIntlError(error: unknown): void {
  if (isMissingMessageError(error) && isStrictI18n()) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  // In non-strict mode, keep it noisy in dev but avoid crashing prod.
  if (process.env.NODE_ENV !== 'production') {
    console.error('[i18n] next-intl error', error);
  }
}

export function getIntlMessageFallback({ error, key, namespace }: MessageFallbackParams): string {
  // In strict mode, we already throw in onIntlError.
  if (isMissingMessageError(error)) {
    const fullKey = namespace ? `${namespace}.${key}` : key;

    // In production, warn once and return the key.
    if (process.env.NODE_ENV === 'production') {
      if (!WARNED_MISSING_KEYS.has(fullKey)) {
        WARNED_MISSING_KEYS.add(fullKey);
        console.warn(`[i18n] Missing message: ${fullKey}`);
      }
      return fullKey;
    }

    return fullKey;
  }

  return namespace ? `${namespace}.${key}` : key;
}
