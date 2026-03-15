# GA01 Group Roster Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `/agent/import` placeholder with a real agent-only CSV import flow that creates member accounts and active subscriptions in bulk using the existing registration model.

**Architecture:** Keep the canonical `/agent/import` route and current auth/routing model unchanged. Parse CSV rows in the feature layer, submit a serialized payload through a server action in `apps/web/src/lib/actions/agent.core.ts`, and execute row-by-row creation through a new bulk-import core that reuses the existing member registration write path rather than inventing a new sponsored-seat subsystem.

**Tech Stack:** Next.js App Router server actions, React 19 `useActionState`, TypeScript, Zod, Vitest, Testing Library, Drizzle-backed existing registration primitives.

---

### Task 1: Lock the CSV contract and parsing helper

**Files:**

- Create: `apps/web/src/features/agent/import/lib/parse-member-import-csv.ts`
- Test: `apps/web/src/features/agent/import/lib/parse-member-import-csv.test.ts`
- Modify: `apps/web/src/features/agent/import/components/csv-uploader.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx`

**Step 1: Write the failing test**

```ts
it('parses required columns and defaults planId to standard', () => {
  const csv = [
    'fullName,email,phone,password,planId',
    'Jane Doe,jane@example.com,+38344111222,Secret123!,',
  ].join('\n');

  expect(parseMemberImportCsv(csv)).toEqual({
    rows: [
      expect.objectContaining({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+38344111222',
        password: 'Secret123!',
        planId: 'standard',
        isValid: true,
      }),
    ],
    headerErrors: [],
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/lib/parse-member-import-csv.test.ts`
Expected: FAIL because the parser helper does not exist yet.

**Step 3: Write minimal implementation**

```ts
export function parseMemberImportCsv(csv: string) {
  // split header, normalize keys, map rows, require fullName/email/phone/password,
  // default planId to standard, mark row validity and field-level error text
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/lib/parse-member-import-csv.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/agent/import/lib/parse-member-import-csv.ts apps/web/src/features/agent/import/lib/parse-member-import-csv.test.ts apps/web/src/features/agent/import/components/csv-uploader.tsx apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx
git commit -m "feat: define ga01 csv import contract"
```

### Task 2: Add the server-side bulk import contract

**Files:**

- Modify: `apps/web/src/lib/actions/agent/schemas.core.ts`
- Create: `apps/web/src/lib/actions/agent/import-members.core.ts`
- Test: `apps/web/src/lib/actions/agent/import-members.core.test.ts`

**Step 1: Write the failing test**

```ts
it('imports valid rows and reports row-level failures without aborting the batch', async () => {
  const rows = [
    {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+38344111222',
      password: 'Secret123!',
      planId: 'standard',
    },
    {
      fullName: 'Bad Email',
      email: 'bad-email',
      phone: '+38344111223',
      password: 'Secret123!',
      planId: 'standard',
    },
  ];

  const result = await importMembersCore({ agent, tenantId, branchId, rows });

  expect(result.summary).toEqual({ total: 2, imported: 1, failed: 1 });
  expect(result.results[1]).toEqual(
    expect.objectContaining({ email: 'bad-email', ok: false, error: 'Validation failed' })
  );
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent/import-members.core.test.ts`
Expected: FAIL because the bulk core and schema do not exist yet.

**Step 3: Write minimal implementation**

```ts
export async function importMembersCore(params: {
  agent: { id: string; name?: string | null };
  tenantId: string;
  branchId: string | null;
  rows: MemberImportRowInput[];
}) {
  // validate rows with zod
  // for each valid row build FormData and call registerMemberCore
  // collect per-row ok/error results and return batch summary
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent/import-members.core.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/actions/agent/schemas.core.ts apps/web/src/lib/actions/agent/import-members.core.ts apps/web/src/lib/actions/agent/import-members.core.test.ts
git commit -m "feat: add ga01 bulk member import core"
```

### Task 3: Expose the server action wrapper

**Files:**

- Modify: `apps/web/src/lib/actions/agent.core.ts`
- Modify: `apps/web/src/lib/actions/agent.test.ts`

**Step 1: Write the failing test**

```ts
it('returns unauthorized when bulk import runs without an agent session', async () => {
  vi.mocked(getAgentSession).mockResolvedValue(null);

  const formData = new FormData();
  formData.set('rowsJson', '[]');

  await expect(importMembers(null, formData)).resolves.toEqual({
    error: 'Unauthorized',
    summary: undefined,
    results: undefined,
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent.test.ts`
Expected: FAIL because the wrapper export and behavior do not exist yet.

**Step 3: Write minimal implementation**

```ts
export async function importMembers(prevState: unknown, formData: FormData) {
  // get agent session
  // ensure tenant id
  // parse rowsJson
  // delegate to importMembersCore
  // revalidate /agent/clients and return structured summary/results
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/actions/agent.core.ts apps/web/src/lib/actions/agent.test.ts
git commit -m "feat: add ga01 bulk import server action"
```

### Task 4: Replace the placeholder UI with the real action flow

**Files:**

- Modify: `apps/web/src/features/agent/import/components/csv-uploader.tsx`
- Test: `apps/web/src/features/agent/import/components/csv-uploader.test.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx`

**Step 1: Write the failing test**

```tsx
it('submits parsed rows to the server action and shows the returned import summary', async () => {
  render(<CSVUploader />);

  // upload valid csv
  // trigger confirm
  // assert importMembers receives rowsJson
  // assert summary text renders imported/failed counts
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/components/csv-uploader.test.tsx`
Expected: FAIL because the component still uses the mock timeout path.

**Step 3: Write minimal implementation**

```tsx
const [state, action, pending] = useActionState(importMembers, initialState);

<form action={action}>
  <input type="hidden" name="rowsJson" value={JSON.stringify(validRows)} />
  <Button type="submit">Confirm Bulk Registration</Button>
</form>;
```

Update the page copy so the route no longer claims unsupported enterprise billing behavior. Keep the route and clarity marker expectations intact.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/components/csv-uploader.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/agent/import/components/csv-uploader.tsx apps/web/src/features/agent/import/components/csv-uploader.test.tsx apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx
git commit -m "feat: wire ga01 roster import ui"
```

### Task 5: Verify the GA01 slice end to end

**Files:**

- No new files required unless a test gap forces one.

**Step 1: Run focused unit coverage**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/lib/parse-member-import-csv.test.ts
pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent/import-members.core.test.ts
pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent.test.ts
pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/components/csv-uploader.test.tsx
```

Expected: PASS

**Step 2: Run mandatory repo verification**

Run:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Expected: PASS

**Step 3: Commit**

```bash
git add .
git commit -m "feat: implement ga01 group roster import"
```
