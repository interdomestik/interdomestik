function getNestedValue(source: unknown, path?: string): unknown {
  if (!path) {
    return source;
  }

  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

export function getJsonTranslationValue(source: unknown, key: string): string {
  const value = getNestedValue(source, key);
  return typeof value === 'string' ? value : key;
}

export function getJsonNamespaceValue(source: unknown, namespace?: string): unknown {
  return getNestedValue(source, namespace);
}
