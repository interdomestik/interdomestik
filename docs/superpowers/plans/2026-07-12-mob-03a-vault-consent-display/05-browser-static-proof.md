# Tasks 5–6: Browser, scope, and security proof

## Browser proof

- [ ] Create cleanup-safe MK fixture/spec. Insert one evidence document and
      matching consent for a seeded MK member claim; delete consent before document
      in `finally`. Writes are test-only.
- [ ] In `gate-mk-mk`, assert exact title/status/version/date, no new keyboard
      action, 320×740 responsiveness/no overflow, and absence of unique raw fields
      and forbidden categories. In KS, marker count is zero.
- [ ] Run focused Playwright projects and watched MCP desktop/mobile/a11y/console
      proof. Save screenshots only in `/tmp/interdomestik-pilot-evidence/`.
- [ ] Commit: `test: prove MOB-03a member display`.

## Static proof

- [ ] Confirm protected proxy, schema/migrations, architecture docs, README, and
      AGENTS are untouched.
- [ ] Scan every added production diff line for storage paths, signed URLs,
      share-pack, DB writers, or outbox. Strictly scan the new mapper, query,
      serializer, and card for upload/download/action fields. The extracted evidence
      section may preserve existing `OpsDocumentsPanel` behavior.
- [ ] Run DB-access, modularity, architecture, i18n, domain/web type-check gates.
- [ ] Sync `scripts/repo-size-budget.json`, run `pnpm repo:size:check`, and commit
      only if changed: `chore: sync MOB-03a repo size budget`.
