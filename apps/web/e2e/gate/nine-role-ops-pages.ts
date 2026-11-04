/** One read of the ops view: the case ids it lists and whether it offers a further page. */
export type OpsPage = Readonly<{ ids: readonly string[]; more: boolean }>;

// The ops pool holds at most 200 claims at 10 per page; a longer walk means paging is broken.
export const OPS_MAX_PAGES = 21;

/**
 * Collects every page of an ops view. The ops loader renders an empty page without a further page
 * when its read fails, so a page that an earlier page offered must list rows; otherwise a failed
 * later read could end the walk early and hide the cases it would have listed.
 */
export async function collectOpsPages(
  readPage: (index: number) => Promise<OpsPage>
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < OPS_MAX_PAGES; index += 1) {
    const read = await readPage(index);
    if (index > 0 && read.ids.length === 0) {
      throw new Error(`ops page ${index} was offered but listed no claims`);
    }
    ids.push(...read.ids);
    if (!read.more) return ids;
  }
  throw new Error(`ops view pages past the ${OPS_MAX_PAGES}-page pool limit`);
}
