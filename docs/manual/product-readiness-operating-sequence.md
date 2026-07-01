# Product Readiness Operating Sequence

Date: 2026-06-30
Scope: Interdomestik Phase C implementation and readiness PRs.

## Purpose

Move faster without weakening the pilot constraints by using one predictable lane for every
runtime, security, CD, and product-readiness change.

## Default Lane

1. Start from synced `main` and create exactly one focused branch.
2. Classify the slice before editing:
   - runtime or security changes use a small implementation branch;
   - broad route, auth, tenancy, or `apps/web/src/proxy.ts` changes require explicit authorization;
   - dependency PRs stay separate from product-code PRs unless a security fix requires both.
3. Implement the smallest diff that closes the finding or readiness gap.
4. Run focused local proof first, then required gates:
   - nearest unit or contract test;
   - `pnpm pr:verify`;
   - `pnpm security:guard`;
   - `pnpm e2e:gate`.
5. Open the PR and request both review backstops:
   - Copilot review through GitHub;
   - `@codex review` from the ChatGPT Codex Connector.
6. Address Copilot, Codex, Sonar, CodeQL, and human-review findings on the current head.
7. Run the strict closure command:

```bash
pnpm pr:review-ready -- <PR_NUMBER>
```

8. Merge only after the strict closure command and GitHub checks are green.
9. After merge, sync `main` and delete the local and remote branch.

## Escalation Lane

Use multi-agent or external model review only when at least one condition is true:

- the change crosses auth, tenancy, billing, database, or release-gate boundaries;
- Sonar or CodeQL reports a high or critical issue with unclear remediation;
- reviewers disagree about the correct fix;
- the PR repeatedly fails CI after a focused root-cause pass.

Use costlier or broader reviewers as escalation, not as the default first pass.

## Security Backlog Lane

1. Dependabot vulnerability alerts come first.
2. CodeQL critical and high alerts come next.
3. Sonar high security and reliability findings follow.
4. Medium findings are batched by rule family only when the fix pattern is already proven.
5. False positives or accepted risks must include evidence and a reviewed dismissal reason.

Do not mix unrelated vulnerability classes in one PR unless the same small helper fixes them.

## Production Lane

Pushes to `main` validate staging only. Production remains deliberate:

1. G01-G10 evidence is complete or a signed waiver exists.
2. Cut a `v*` tag or run the CD workflow manually.
3. Approve the GitHub `production` environment.
4. Let `production-evidence`, build, deploy, and production verification complete.
5. Preserve the CD artifacts as release evidence.
