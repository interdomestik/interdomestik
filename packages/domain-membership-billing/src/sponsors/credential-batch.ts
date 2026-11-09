/**
 * Credential checks for many people, outside any tenant transaction (the check reads identity rows
 * through its own admin path), in bounded parallel batches.
 */
const CREDENTIAL_BATCH = 20;

export async function credentialsOf(
  userIds: readonly string[],
  hasCredential: (userId: string) => Promise<boolean>
): Promise<Set<string>> {
  const batches: string[][] = [];
  for (let at = 0; at < userIds.length; at += CREDENTIAL_BATCH) {
    batches.push(userIds.slice(at, at + CREDENTIAL_BATCH));
  }
  const found = new Set<string>();
  await batches.reduce<Promise<void>>(
    (previous, batch) =>
      previous.then(async () => {
        const results = await Promise.all(batch.map(userId => hasCredential(userId)));
        batch.forEach((userId, index) => {
          if (results[index]) found.add(userId);
        });
      }),
    Promise.resolve()
  );
  return found;
}
