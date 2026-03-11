type TranslationValues = Record<string, string | number>;

function getValueAtPath(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((value, segment) => {
    if (value && typeof value === 'object' && segment in value) {
      return (value as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

function interpolateMessage(message: string, values?: TranslationValues): string {
  return Object.entries(values ?? {}).reduce(
    (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
    message
  );
}

export function createUseTranslationsMock(getMessages: () => unknown) {
  return (namespace?: string) => {
    const resolve = (key?: string) => {
      const path = [namespace, key].filter(Boolean).join('.').split('.');
      return getValueAtPath(getMessages(), path);
    };

    const translate = (key: string, values?: TranslationValues) => {
      const value = resolve(key);
      return typeof value === 'string' ? interpolateMessage(value, values) : key;
    };

    translate.raw = (key: string) => resolve(key);

    return translate;
  };
}
