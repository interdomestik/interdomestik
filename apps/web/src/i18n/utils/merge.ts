export type MessageValue =
  | string
  | number
  | boolean
  | null
  | MessageValue[]
  | { [key: string]: MessageValue };

export function mergeMessages(fallback: MessageValue, overrides: MessageValue): MessageValue {
  // 1. Handle arrays: Overrides replace the fallback array completely
  if (Array.isArray(fallback)) {
    return Array.isArray(overrides) ? overrides : fallback;
  }

  // 2. Handle primitives or nulls: Overrides replace fallback
  if (
    typeof fallback !== 'object' ||
    fallback === null ||
    typeof overrides !== 'object' ||
    overrides === null ||
    Array.isArray(overrides)
  ) {
    return overrides === undefined ? fallback : overrides;
  }

  // 3. Handle Objects: Deep merge
  const fallbackObj = fallback as Record<string, MessageValue>;
  const overrideObj = overrides as Record<string, MessageValue>;
  const merged: Record<string, MessageValue> = { ...fallbackObj };

  for (const key of Object.keys(overrideObj)) {
    if (key in fallbackObj) {
      merged[key] = mergeMessages(fallbackObj[key], overrideObj[key]);
    } else {
      merged[key] = overrideObj[key];
    }
  }

  return merged;
}
