# CLAUDE-HOOKS-PROPOSAL — hooks and permissions for development sessions

> **Adopted from the review of 2026-11-13 (run A).** This document was written as a proposal for the owner and is kept as it was approved: where it says "draft", "proposed" or "would", read that as of the review. Documents named without a directory stand beside this one in `docs/engineering/`. Paths that begin with `A/`, `inputs/` or `shared/` cite the review record, which is kept outside this repository; they are evidence, not files to open here. Code paths and line numbers are those of commit `ef1bd0ef5`; a line number into another of these documents is that of the review, and a rule id, a work-package number or a part number is the stable reference.

| | |
|---|---|
| **Status** | Draft of run A, round R2 (2026-11-16): written in part R2a, corrected in part R2b after the independent review (`A/review/R2a-response.md`, comments R2a-C11 and R2a-C12). A proposal; nothing is installed. The repository has no `.claude/` directory at the pinned commit, and the lead's snapshot shows no hooks in the user settings (`inputs/automation.md` §1.3). Corrected in the closing pass (2026-11-17) after the independent review of R3 (`A/review/R3-response.md`, comments R3-C06 and R3-C12): HOOK-05 follows the one specification of the gate proposals, and the proposal says what no hook enforces. |
| **Source** | Interdomestik at `ef1bd0ef5c608d856615154921f9386f615d11de`; rules from `RULES.md`. |
| **What a hook is for** | A hook stops a known mistake at the moment an agent makes it. It is not a second copy of CI: every hook below either guards something CI cannot see (a command typed in a session) or gives early notice of a check that CI also runs. |
| **Not verified offline** | The exact hook input format of the installed Claude Code version. The entries assume: the hook command receives JSON on standard input with `tool_name` and `tool_input` (`command` for Bash, `file_path` for Edit and Write); exit code 2 blocks the call and returns the error text to the agent. The lead verifies this against the installed version before adoption. |

## How the hooks are built

- **One small script per hook**, under `scripts/agent-hooks/`, with no dependency beyond Node. Each script reads the JSON, decides, and prints one sentence that says what was refused and what to do instead.
- **Each script has a negative-input test** (rule R-10): missing input, empty input and unparseable input must fail closed for the blocking hooks and pass open for the advisory ones; each failing and passing example below is a test case.
- **Configuration** lives in a new `.claude/settings.json` in the repository, so that every worktree gets the same hooks.
- **Deny rules first.** Where a plain permission rule can express the refusal, it is proposed beside the hook. A deny rule is simpler and cannot be bypassed by an error in a script; the hook catches the forms a prefix rule misses, such as a command inside a chain.
- **A hook reads the words of a command, not its first characters** (added in R3). It skips leading environment assignments and wrappers (`env`, `command`, `time`, `npx`, `pnpm exec`, `pnpm dlx`), and it finds a subcommand behind the tool's own options. The reason is an observation of this review: its launch deny rule `Bash(git worktree *)` refused `git worktree list` and did not match `git -C <dir> worktree list`, which ran (`A/PROGRESS.md`, R3, isolation check, observation O-R3-1). A deny rule that is a prefix pattern therefore protects only against the plain form; every refusal that matters has a hook beside the rule, and the hook's tests hold the option-in-between form as a failing example.

## Entries

### HOOK-01 — refuse `supabase` commands
| | |
|---|---|
| **Rule** | R-24 |
| **Event** | `PreToolUse` |
| **Matcher** | `Bash` |
| **Command** | `node scripts/agent-hooks/refuse-command.mjs supabase` — splits the command line at `&&`, `||`, `;` and `|`, and refuses when a segment starts with `supabase`, `npx supabase`, `pnpm exec supabase`, `pnpm dlx supabase` or `pnpm --filter … db:push` (the package script that runs `supabase db push`) |
| **Deny rules beside it** | `Bash(supabase *)`, `Bash(npx supabase *)`, `Bash(pnpm exec supabase *)` |
| **Failing example** | `cd packages/database && supabase db push`; and, for the forms a prefix rule misses, `DATABASE_URL=x npx --yes supabase db push` |
| **Passing example** | `rg -n "supabase" docs/` (the word is an argument, not the command) |
| **False-positive risk** | Low. Local Supabase for development (`supabase start`, `supabase status`) is refused too. That is intended: no checkout is linked to a shared project (the main checkout was linked to today's production until the owner unlinks it, answer 17 of 2026-11-17), and a command-line login can be re-linked in one step. A local-only wrapper script can be allowed by name once it asserts a local target. |
| **Evidence** | The main checkout is linked to production (CR-COMMON §3.1; A15, development constraint 4). `packages/database/package.json:33` defines `db:push` as `supabase db push` with no target restriction (DATA-05). |

### HOOK-02 — refuse `vercel` and deploy commands
| | |
|---|---|
| **Rule** | R-24 |
| **Event** | `PreToolUse` |
| **Matcher** | `Bash` |
| **Command** | `node scripts/agent-hooks/refuse-command.mjs vercel` — the same script, with the list `vercel`, `npx vercel`, `pnpm exec vercel`, `pnpm dlx vercel` |
| **Deny rules beside it** | `Bash(vercel *)`, `Bash(npx vercel *)` |
| **Failing example** | `vercel deploy --prod` |
| **Passing example** | `cat apps/web/vercel.json` |
| **False-positive risk** | Low. Deploys run from the release workflow, not from a machine (A15: "builds and deploys run from CI"). |
| **Evidence** | CR-COMMON §3.1; A4: staging and production change through `cd.yml` only. |

### HOOK-03 — refuse `rg -r` and `rg --replace`
| | |
|---|---|
| **Rule** | R-33 |
| **Event** | `PreToolUse` |
| **Matcher** | `Bash` |
| **Command** | `node scripts/agent-hooks/refuse-rg-replace.mjs` — refuses a segment whose command is `rg` and that has the flag `-r`, `--replace`, or a fused short-flag group that contains `r` (for example `-rn`) |
| **Failing example** | `rg -rn "withTenantAuthority" packages/` (the author meant "recursive"; `rg` is recursive by default and `-r` rewrites the output) |
| **Passing example** | `rg -n "withTenantAuthority" packages/` |
| **False-positive risk** | Low. A deliberate replacement preview with `-r` is refused; `sed` or an editor does that job. |
| **Evidence** | Nine mistaken calls in this review (the ninth by a helper in R2b, on an empty target). The first eight, in two rounds of this review, all although the rules forbade the flag: three in R1 (two helpers and the main session), two by unit U-COR and two by unit SK-RULES-RA1 in R2a, and one more by the main session in R2a (`A/PROGRESS.md` §16.5, §20a, §25.3). In seven cases the flag was read as "recursive"; the eighth was a slip in a long command. The output was never used, but a count taken from rewritten output would be wrong without any error. |

### HOOK-04 — refuse schema push commands
| | |
|---|---|
| **Rule** | R-12 |
| **Event** | `PreToolUse` |
| **Matcher** | `Bash` |
| **Command** | `node scripts/agent-hooks/refuse-command.mjs schema-push` — refuses `drizzle-kit push`, `pnpm db:push`, `pnpm --filter @interdomestik/database push`, `supabase db push`; allows `pnpm db:push:local` |
| **Failing example** | `pnpm db:push` |
| **Passing example** | `pnpm db:push:local`; `pnpm db:generate` |
| **False-positive risk** | Low. The local form is already guarded by `scripts/database-command.mjs:15-34`. |
| **Evidence** | DATA-05 (S2, confirmed by both R2a passes): three push-named scripts have no target restriction, a committed script already calls one of them (`scripts/database-security.sh:110`), and a push against a migrated database would propose removing objects that exist only in SQL. The real fix is to delete the three scripts (CHK-12 keeps them out); the hook covers the time until then and the raw `drizzle-kit push` command. |

### HOOK-05 — instruction-drift check when an instruction file is edited
| | |
|---|---|
| **Rule** | R-03 |
| **Event** | `PostToolUse` |
| **Matcher** | `Edit|Write`, for the paths that CHK-02 reads (rule R-03): `AGENTS.md`, `CLAUDE.md`, `code_review.md`, `docs/guides/**`, `.codex/**`, `.agent/**`, `gemini.md`, `.github/copilot-instructions.md`; and `.claude/**`, where the hooks themselves are configured |
| **Command** | `node scripts/ci/check-instruction-drift.mjs --file "$FILE"` — the same script that CI runs as CHK-02. It reads the one list of identifiers that CHK-02 reads: a JSON file directly under `scripts/ci/`, in two parts, *prohibited now* and *conditional*. What it reports is specified once, in `CI-GATE-PROPOSALS.md`, part 4.3: a prohibited identifier in a command block, a trigger section or a required-step section; a conditional identifier in a trigger position only (in a command block or a required step it is reported and is no failure); a routing line that contradicts R-01. An earlier text of this row named a one-state list in a `.txt` file, which the placement rule of the gate proposals itself refuses; it is superseded (closing pass, review comment R3-C06). It reads headings and list items that give a trigger ("use when", "triggers", "auto-trigger") or a required step ("run", "must", "always", "first step"); it does not try to understand free prose. |
| **Failing example** | In the repository: `.agent/workflows/database.md:37` (`npx supabase db push`, a required step that names a prohibited command). Outside the repository: the trigger section of today's Claude `interdomestik` skill, which starts the "Architecture M1 program" on words such as "interdomestik" or "vazhdoje" (MAIN-17; `inputs/skills/claude-interdomestik/SKILL.md`). |
| **Passing example** | "Never start the Architecture M1 program; it was retired by the direction of 2026-11." The line names the same program inside a prohibition. A mapping table, a ledger entry and `docs/plans/history/**` pass for the same reason: they are not trigger or required-step sections of an active instruction. |
| **False-positive risk** | Medium at the edges: a sentence such as "run the old gate only when the owner asks" names a conditional command in a required-step position. Under part 4.3 of the gate proposals that is reported and is no failure, and nothing has to be rewritten while a required check or an explicit request of the owner uses the command (an earlier text of this row asked the author to rewrite the line or to take the identifier off the list; superseded in the closing pass, review comment R3-C06). A prohibited identifier in that position is printed with its line, and the author rewrites it as a prohibition. The check does not promise to find contradictory prose. |
| **Evidence** | MAIN-16 (S3 after two passes): five live instruction lines contradict the binding roles (`RULES.md`, R-03). MAIN-17 (S2): a skill resumes a superseded program on ordinary words. Skills live outside the repository; for them the lead runs the same script against the installed copies before installing a new version. |

### HOOK-06 — ask before editing a high-risk path
| | |
|---|---|
| **Rule** | R-04, tier T5 |
| **Event** | `PreToolUse` |
| **Matcher** | `Edit|Write`, for `apps/web/src/proxy.ts`, `apps/web/src/lib/auth/**`, `packages/shared-auth/**`, `packages/database/src/tenant*`, `packages/database/src/db.ts`, `packages/database/drizzle/**` when the new text contains `POLICY` or `ROW LEVEL SECURITY` |
| **Command** | `node scripts/agent-hooks/ask-high-risk.mjs` — does not refuse; it turns the call into a question to the person at the keyboard ("this file is tier T5: is this change in the scope of the current task?") |
| **Failing example** | An edit to `apps/web/src/proxy.ts` during a copy-only task |
| **Passing example** | The same edit after the person confirms; any edit outside the listed paths |
| **False-positive risk** | Medium by design: real T5 work is asked once per file. It costs one confirmation and prevents a silent change to the tenant and authentication boundary, the part of the foundation that R1 found strongest (A8) and that two required guards protect. |
| **Evidence** | R-04; A8: the proxy, the session authority and the row policies are the shared enforcement boundaries of both pilot journeys. No defect from such an edit is on record; the hook is a tripwire, not a repair, and is the first candidate to drop if it proves noisy. |

### HOOK-07 — lint the file that was just edited
| | |
|---|---|
| **Rule** | R-05, R-08, R-09, R-15 (the lint-carried checks CHK-04, CHK-05, CHK-08, CHK-09, CHK-15) |
| **Event** | `PostToolUse` |
| **Matcher** | `Edit|Write`, for `*.ts` and `*.tsx` under `apps/web/src/**` and `packages/*/src/**` |
| **Command** | `node scripts/agent-hooks/lint-edited.mjs` — runs ESLint on the one edited file with the repository configuration and the same baselines as CI; prints only new violations; never blocks (exit 0), because the edit has already happened |
| **Failing example** | A new `catch { return [] }` in a server module: the hook prints the CHK-08 message while the agent is still in the file |
| **Passing example** | An edit that adds no violation prints nothing |
| **False-positive risk** | The same as the lint rules themselves, shown earlier. **Cost is `NOT MEASURED`:** the time of one single-file ESLint run in this monorepo is unknown; it is measured in run C, and the hook is adopted only if the median stays under a few seconds. |
| **Evidence** | 326 of 427 PRs received repair commits after they were opened (A4): defects of the lint-checkable classes are found one CI round late today. |

## Considered and not proposed

| Idea | Why not |
|---|---|
| A hook that enforces "one unit of work per session" (R-22) | No machine sees the boundary of a unit. The rule stays advisory. |
| A hook that blocks reading `.env*` files or printing the environment | No finding of R1 traces a leak to an agent command; the one secret leak came from a test configuration written into a CI artifact (MAIN-14), which a contract test now guards. |
| A session-start hook that prints the rules | It adds context on every start; `CLAUDE.md` already imports `AGENTS.md`. |
| A hook that runs the full verification command after every edit | A heavy job per edit; the local verification time is not even measured yet (A15). |
| Blocking `git push`, `git commit` or PR commands | Development sessions need them; the review runs denied them because a review must not change the repository, and that reason does not carry over. **What follows from it for R-24** (closing pass, review comment R3-C12): HOOK-01 and HOOK-02 refuse `supabase`, `vercel` and deploy commands, and no hook of this proposal refuses a merge or a force-push by an agent tool. That part of R-24 is advisory inside a session and is set in the account and in branch protection, by the owner (answer 30); it counts as enforced only when such a control has been demonstrated. The protection of the review sessions themselves is the lead's work outside the repository (a launch guard of 2026-11-17: an environment that makes git refuse every ref update, and deny rules for the option forms); it is not part of this proposal and is not a hook of the harness. |

## The same criteria for the implementer and the reviewer

The hooks act inside Claude Code sessions. The criteria they apply are not Claude's alone:

| Criterion | Claude implementer | Codex reviewer or implementer | Backstop for everyone |
|---|---|---|---|
| No `supabase`, `vercel` or schema-push command in a session | HOOK-01, HOOK-02, HOOK-04 and deny rules | the same refusals in the Codex configuration, set by the lead; by the owner's check of 2026-11-17 the Codex connector for the database provider reaches every project of the account and is not read-only, and its SQL tool and the tools that create and merge a PR run without asking; the owner changes this before the new production holds data: no agent tool on production, read-only on staging, none that merges or force-pushes (R-24) | CHK-12 refuses unguarded push scripts in `package.json` |
| No `rg -r` | HOOK-03 | the rule text in `AGENTS.md` (tool-neutral) | none; it is a local tool mistake |
| No instruction that revives retired machinery | HOOK-05 | the reviewer runs `check-instruction-drift.mjs` on any PR that touches an instruction file | CHK-02 in CI |
| High-risk paths get a second look | HOOK-06 | tier T5 in the review record (R-02) | CHK-01 and CHK-03 |
| Lint-carried rules | HOOK-07 (early notice) | the reviewer reads the lint result of the head commit | the lint job |

Both models read the same `AGENTS.md`, and both are judged by the same CI checks. A hook only moves the moment of notice forward for one of them.

## Adoption

1. The owner approves entries one by one; each is independent.
2. The hooks come in a PR of their own, after the adoption PR of the instruction files (`A/ADOPTION-PR-FILES.md`): `.claude/settings.json`, the scripts and their tests. Under rule R-04 it is a tier T6 change, and it is not instruction-only, because it adds scripts. One line of that PR registers `.claude/settings.json` in the owner list of the modularity guard (`scripts/modularity-guard-policy.mjs:44-75`): the guard refuses a changed JSON file without a registered owner, and that file has none (found in R3).
3. Verification at adoption, per hook: in a real session the failing example produces the hook's **expected result** and the passing example passes untouched; the script's own tests pass in CI. The expected result differs by hook:

| Hook | Kind | Expected result on its failing example |
|---|---|---|
| HOOK-01, HOOK-02, HOOK-03, HOOK-04 | refusal before the call | the command does not run; the agent receives one sentence that names what was refused and what to do instead |
| HOOK-05 | diagnostic after the edit | the edit stands; the agent receives the line and the matched identifier; CI (CHK-02) is what blocks the merge |
| HOOK-06 | confirmation before the edit | the edit waits for the person's yes or no; a no leaves the file untouched |
| HOOK-07 | diagnostic after the edit | the edit stands; the agent receives the new lint findings of that file; it never blocks |

4. **A hook is removed only under the A5 conditions and with the owner's approval**, like any other check (`EFFECT-CHECK.md`, section 5): its execution count, the completeness of its evidence, the demonstrated overlap and the coverage of its replacement; or the proof that the obligation it guards is retired. A hook that guards a rare event (HOOK-01, HOOK-02, HOOK-04) is expected to refuse nothing in most months, and that is not a reason to remove it. A hook that fires on correct work is first narrowed; `EFFECT-CHECK.md` counts refusals, confirmations and diagnostics per hook, and false positives apart. HOOK-06 and HOOK-07 are conveniences without a guarded obligation of their own; the owner may drop either on the cost figures alone.
