import { createHash } from 'node:crypto';

type Namespace = Readonly<{ runId: string; workerId: string; scenario: string }>;

const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

/** Test-only copies: callers explicitly remap foreign keys and insert through their harness. */
export function createMutationCopy(namespace: Namespace) {
  if (Object.values(namespace).some(value => !value.trim())) {
    throw new Error('Mutation copies require a run, worker and scenario');
  }
  const prefix = `p070_mut_${digest([namespace.runId, namespace.workerId, namespace.scenario])}`;
  const id = (sourceId: string): string => {
    if (!sourceId.trim()) throw new Error('Missing catalogue row ID');
    return `${prefix}_${digest(sourceId)}`;
  };
  return {
    prefix,
    id,
    email(sourceEmail: string): string {
      const [local, domain] = sourceEmail.split('@');
      if (!local || !domain) throw new Error('Missing catalogue email');
      return `${digest(sourceEmail)}+${prefix}@${domain}`;
    },
    row<T extends { id: string }>(source: T | undefined): Omit<T, 'id'> & { id: string } {
      if (!source) throw new Error('Missing catalogue fixture');
      const { id: sourceId, ...fields } = structuredClone(source);
      return { ...fields, id: id(sourceId) };
    },
  };
}
