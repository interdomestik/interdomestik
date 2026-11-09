import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import { E2E_AGENT_LINK_LIFECYCLE_PAIR } from './e2e-agent-link-lifecycle-fixtures';
import { compareExactSet } from './seed-assert-cash';
import { compareRow } from './seed-assert-lifecycle';
import {
  buildAgentLinkLifecycleHistoryToSeed,
  buildAgentLinkLifecycleRow,
} from './seed-golden/agent-link-lifecycle';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

/** One current grant and all three named fixture checkpoints must match exactly. */
export async function collectAgentLinkLifecycleViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures: string[] = [];
  const expected = buildAgentLinkLifecycleRow();
  const links = await db
    .select()
    .from(schema.agentClients)
    .where(eq(schema.agentClients.memberId, E2E_AGENT_LINK_LIFECYCLE_PAIR.memberId));
  compareExactSet(failures, 'agent link lifecycle', links, [expected]);
  compareRow(
    failures,
    expected.id,
    links.find(row => row.id === expected.id),
    expected
  );

  const history = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, E2E_AGENT_LINK_LIFECYCLE_PAIR.id));
  const checkpoints = buildAgentLinkLifecycleHistoryToSeed();
  compareExactSet(failures, 'agent link lifecycle history', history, checkpoints);
  for (const checkpoint of checkpoints) {
    const row = history.find(found => found.id === checkpoint.id);
    const { metadata, ...fields } = checkpoint;
    compareRow(failures, checkpoint.id, row, fields);
    if (!isDeepStrictEqual(row?.metadata, metadata)) {
      failures.push(
        `${checkpoint.id}.metadata: expected ${JSON.stringify(metadata)}, found ${JSON.stringify(row?.metadata)}`
      );
    }
  }
  return failures;
}
