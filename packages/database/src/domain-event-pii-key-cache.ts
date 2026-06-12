export const EVENT_PII_KEY_CACHE_MAX_ENTRIES = 64;
export const EVENT_PII_KEY_CACHE_TTL_MS = 30_000;

type EventPiiKeyCacheEntry = {
  expiresAtMs: number;
  keyCiphertext: string;
  keyVersion: number;
};

export type EventPiiKeyMaterial = {
  keyCiphertext: string;
  keyVersion: number;
};

type EventPiiKeyCacheKey = {
  referenceId: string;
  tenantId: string;
};

type ResolveEventPiiKeyCacheParams = EventPiiKeyCacheKey &
  EventPiiKeyMaterial & {
    nowMs?: number;
  };

const keyCache = new Map<string, EventPiiKeyCacheEntry>();

function cacheKey(params: EventPiiKeyCacheKey): string {
  return JSON.stringify([params.tenantId, params.referenceId]);
}

function pruneExpired(nowMs: number): void {
  for (const [key, entry] of keyCache) {
    if (entry.expiresAtMs <= nowMs) {
      keyCache.delete(key);
    }
  }
}

function trimToMaxEntries(): void {
  while (keyCache.size > EVENT_PII_KEY_CACHE_MAX_ENTRIES) {
    const oldest = keyCache.keys().next().value;
    if (oldest == null) return;
    keyCache.delete(oldest);
  }
}

export function resolveEventPiiKeyMaterial(
  params: ResolveEventPiiKeyCacheParams
): EventPiiKeyMaterial {
  const nowMs = params.nowMs ?? Date.now();
  const key = cacheKey(params);
  const cached = keyCache.get(key);

  if (
    cached &&
    cached.expiresAtMs > nowMs &&
    cached.keyVersion === params.keyVersion &&
    cached.keyCiphertext === params.keyCiphertext
  ) {
    return {
      keyCiphertext: cached.keyCiphertext,
      keyVersion: cached.keyVersion,
    };
  }

  pruneExpired(nowMs);
  keyCache.set(key, {
    expiresAtMs: nowMs + EVENT_PII_KEY_CACHE_TTL_MS,
    keyCiphertext: params.keyCiphertext,
    keyVersion: params.keyVersion,
  });
  trimToMaxEntries();

  return {
    keyCiphertext: params.keyCiphertext,
    keyVersion: params.keyVersion,
  };
}

export function evictEventPiiKeyMaterial(params: EventPiiKeyCacheKey): void {
  keyCache.delete(cacheKey(params));
}

export function clearEventPiiKeyCacheForTests(): void {
  keyCache.clear();
}

export function getEventPiiKeyCacheSizeForTests(): number {
  return keyCache.size;
}
