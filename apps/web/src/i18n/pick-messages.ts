import type { MessageNamespace } from './messages';

export function pickMessages(
  messages: Record<string, unknown>,
  namespaces: readonly MessageNamespace[]
) {
  return namespaces.reduce<Record<string, unknown>>((acc, namespace) => {
    if (namespace in messages) acc[namespace] = messages[namespace];
    return acc;
  }, {});
}
