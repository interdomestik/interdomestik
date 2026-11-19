# EFFECT-CHECK — how to tell whether the new rules work

> **Adopted from the review of 2026-11-13 (run A).** This document was written as a proposal for the owner and is kept as it was approved: where it says "draft", "proposed" or "would", read that as of the review. Documents named without a directory stand beside this one in `docs/engineering/`. Paths that begin with `A/`, `inputs/` or `shared/` cite the review record, which is kept outside this repository; they are evidence, not files to open here. Code paths and line numbers are those of commit `ef1bd0ef5`; a line number into another of these documents is that of the review, and a rule id, a work-package number or a part number is the stable reference.

| | |
|---|---|
| **Status** | Draft of run A, round R2 (2026-11-16): written in part R2a, corrected in part R2b after the independent review (`A/review/R2a-response.md`, comment R2a-C10). A proposal for the owner. |
| **Baseline** | `shared/baseline-metrics.json`, version 4: 427 PRs merged from 2026-08-15 to 2026-11-13 (439 merged, 12 held back for the replay), source `ef1bd0ef5c608d856615154921f9386f615d11de`. Version 3 changes no measured value of version 2: it corrects the definition of the future defect record and adds the baselines of the proposed checks, each with its unit, its predicate and its script (`check_baselines`). Version 4 (R3) changes no measured value either: it adds the main session's recounts of three check baselines and of the objects that only SQL creates. |
| **Reads with** | `RULES.md` (rules R-01 to R-36, checks CHK-01 to CHK-26), `CI-GATE-PROPOSALS.md`, `CLAUDE-HOOKS-PROPOSAL.md` (HOOK-01 to HOOK-07), `DIRECTION.md`. |

## 1. When, who, how

- **When.** After adoption, re-measure after **20 merged PRs or 30 days, whichever comes later**. Repeat every 30 days until two measurements in a row meet the targets.
- **Who.** Not the implementer. The lead runs the scripts; the reviewer reads the result. "No model approves its own work" applies to measurements too.
- **How.** The same scripts and definitions as the baseline: each metric of `baseline-metrics.json` names its script under `A/raw/history`, `A/raw/loops` or `A/raw/arch`. A changed definition is a new metric with a new name, never a silent replacement.
- **Result.** A new version of `baseline-metrics.json` that names the version it supersedes, and one page: metric, baseline, new value, target, met or not, and what follows.
- **Size of the sample.** Twenty PRs show only large changes: a share measured on 20 PRs has an uncertainty of about ±0.2. At November's pace (131 PRs in two weeks) the 30 days decide, not the 20 PRs. Conclusions about a share need at least 60 PRs; below that, report the value and draw no conclusion.

## 2. The baseline metrics and their targets

A target is what the rules are meant to achieve. Where the evidence gives no basis for a number, the target is "not worse", and the reason is stated.

| Metric | Baseline | Target at the re-measurement | Why this target |
|---|---|---|---|
| Share of process-only PRs | November: 0.252 (33 of 131). October: 0.163 (8 of 49). 90 days: 0.511 (218 of 427) | **≤ 0.15** | 18 of November's 33 process-only PRs changed only the tenant guard's ledger or pin (MAIN-01). Without them the share is 15 of 131 = 0.115. R-10 and R-28 aim at exactly those PRs |
| Separate guard-admission PRs | November: 19 (0.229 per product PR) | **0 for a routine schema change, locale addition or dependency update**, once the admission change of `DIRECTION.md` (WP-06) is adopted; before that, report only | MAIN-19: sound changes needed a second PR and a manual repin |
| CI reruns per PR | 90 days: mean 0.84, 35.2% of PRs with a rerun. November: mean 0.31 | **≤ 0.31**, and every rerun of a required gate has a recorded cause | November is the relevant baseline; R-10 asks that a gate is tested before it is required |
| Review of the merged commit | The last recorded review covers the merged head on 34 of 131 November PRs (MAIN-09) | **Every merged PR of tiers T4 to T6 has a review record that names the merged head** (CHK-01) | R-01. This replaces "review rounds per PR" as the main review measure |
| Review rounds per PR | Mean 2.68, median 1, p90 5: a lower bound, because later reviews are prose in PR descriptions | **No numeric target at the first re-measurement.** The review record makes rounds countable; the first re-measurement sets the baseline | The baseline cannot be compared: its definition counts one tool's rounds only |
| Fix-labelled PRs per 10 PRs | 4.05 (178 of 439); product fixes only: 2.11 (90 of 427). A proxy: one label per PR, not one per defect | **No target on the proxy alone.** Report it next to the defect records below | A falling label can mean fewer defects or fewer repairs. In the sample of 30, 16 were real defects, 11 partial and 3 not defects |
| Defects found after review or after merge, per 10 PRs | `NOT MEASURED` (review comment R1-C03) | **At the first re-measurement: one classified record for every accepted defect, and the first value.** The owner sets a numeric target after that | No classified defect records exist for the baseline window. Section 3 defines the record |
| Time from opening to merge | Median 1.07 h, p75 2.08 h, p90 5.3 h | **Median ≤ 1.07 h and p90 ≤ 5.3 h** | The rules add checks. They must not make delivery slower |
| Check time of a PR: first check start to last check finish, on the final head | n = 40 (2026-11-10 to 2026-11-13): median 34.3 min, p90 58.0, maximum 98.7; 0 PRs under 20 minutes. One documentation PR: 25.9 min. The number includes the wait of `delivery-gate` for review feedback | **Approved by the owner on 2026-11-17 (answer 29), and not reached before the approved changes to the checks are merged: median 15 min and p90 20 min for a product PR; 5 min for a documentation or copy PR.** From the first re-measurement on, two numbers per PR: the finish of the last check that the gate waits for, and the finish of the gate | `CI-GATE-PROPOSALS.md`, parts 1 and 3. Lead's export, arithmetic recomputed; step times are `NOT MEASURED` |
| Files and modules touched per feature PR | n = 88: median 20 files, p90 63; 1,146 changed lines; 5 modules | **Not higher than the baseline.** Reported per tier | MAIN-08 is S3, and the rules that bear on it (R-21, R-22) are advisory. No evidence supports a lower number |
| Workflow runs and pushes per PR | Median 31 runs, p90 69; 76.3% of PRs get commits after opening | **Reported.** A target follows the approved changes to the checks (R2b) | Every change takes the same road today (A4) |
| Size of the mandatory instructions | Current `AGENTS.md`: 11,437 bytes, and it points to 360,698 bytes of further reading | **`AGENTS.md` ≤ 12,870 bytes as the commit hook's formatter leaves it (the owner raised it from 12,810 on 2026-11-19, only to keep the full one-PR rule in R-28); no other file is mandatory reading before a task, except the passages of `RULES.md` that a rule of `AGENTS.md` names (six since the final round), each read when its rule applies** | CR-A asked that the proposed file be not longer than the current one, and at the end of R3 it had 11,431 bytes. **The owner raised the limit in the closing pass by up to 1,000 bytes**, only for the rule that carries what six directory override files demanded (R-37) and for the wording that two review comments needed (`inputs/CLOSING-owner-input.md`, 2b). The proposal had 12,435 bytes at the end of the closing pass. **On 2026-11-18 the owner allowed up to 300 bytes more, to at most 12,735**, only for comments D01 to D03 of the lead's delta check: the security reviewer's approval and the named record of R-37, the size policy of the old file in R-10, and the names of the two passages of answer 39. The proposal had 12,733 bytes after that round. **In the final round of the same day the owner allowed up to 100 bytes more, to at most 12,833**, only to name two binding passages (the API record of R-04; what the lead may route). The proposal has 12,810 bytes as the commit hook leaves it, 1,373 more than the current file, and more words (2,004 against 1,511). So the design choice under test is no longer "not longer than the current file"; it is one file of about 12 KB in place of 360,698 bytes of further reading. The limit is measured by the check of the adoption tree, not by a CI check (`CI-GATE-PROPOSALS.md`, 4.3) |

Production deployments in the window (0) are not a target here: the first production release is a work package of `DIRECTION.md`, and its absence was the owner's decision.

## 3. The defect record (review comments R1-C03 and R2a-C10)

The baseline could not count defects, because no record of a defect exists. From adoption on, **one record is written when a defect is accepted as a defect — whether or not anyone repairs it.** Its fields are fixed in `baseline-metrics.json` (`metrics.defects_found_after_review_or_merge_per_10_prs.future_measurement`):

- a stable identifier;
- **when it was detected** (date and time), and when it was accepted as a defect; the two can differ by days, and the count uses the first;
- what failed, in words a user or an operator could check;
- the change that introduced it, if known; never guessed from the repair;
- the stage at which it was detected: before review; in review; after review and before merge; after merge; staging; production;
- what detected it: a named check, a test, a reviewer, an operator, a monitor, a user;
- one class from the closed list of A2, and the severity by the review's rubric;
- the changes that repaired it: none, one or several. A record without a repair is an open defect and is counted like any other.

**Counting rule.** Numerator: records detected after review (the last four stages). Denominator: PRs merged in the same window. Count defects, not repairs: two defects repaired by one PR are two records, and one defect repaired by three PRs is one. Attribute a record to a window by its detection time.

**Where the records live.** One issue per accepted defect in the repository's issue tracker, created when the defect is accepted, with the fields above in a fixed form and one label. The record therefore exists without a repairing PR, has its own identifier, and stays open while the defect is open. A PR that repairs it links to it, and the review record of that PR (R-01, CHK-01) names it. A defect found in the pilot is recorded in the same form.
- Why not the repairing PR, as the R2a draft said: no such PR need exist, and an unrepaired defect would have no record (review comment R2a-C10).
- Why not a file in the repository: a file needs a PR, and R-28 allows no PR whose only purpose is bookkeeping.
- A defect whose description would expose a weakness is recorded privately (a draft security advisory, or the owner's private tracker) with the same fields, and it is counted.
- `NOT VERIFIED`: that issues are enabled for the repository, and that the lead's tooling can list them with their fields (`gh issue` was denied to this review by its launch rules). The lead confirms it before adoption. The fallback is a private tracker that exports the same fields for each measurement.

## 4. The checks, the hooks and the ratchets

For every proposed check and hook, three numbers are kept per 30 days:

1. **Executions**: how often it ran.
2. **Catches**: how often it failed on a PR head, or refused a command, for the reason it was written for. A failure caused by the check itself is counted apart, as a false positive.
3. **Escapes**: defect records of the class the check guards that were detected after it.

| What | Baseline today | Target |
|---|---|---|
| CHK-04, mutations outside the wrapper | Unit: exported server action. Predicate: not built by the wrapper with a declared basis and a schema. Today all 232 exported actions are outside by that predicate, because the wrapper takes neither. The list is taken on the adoption commit, after the wrapper is extended and after the deletions of WP-01. Measured today with a weaker predicate, at file level: 76 of 92 action files do not reach the wrapper (14 call it, 2 only re-export from a caller) | The number of listed actions only falls. **Zero** new ones. Zero in every rebuilt screen |
| CHK-08, swallowed failures | Unit: catch clause in route handlers and server read models that matches one of the four shapes of the rule. Measured by the check on the adoption commit. Known today: 104 catch clauses in scope, which is the population and not the baseline; 50 of them have no binding, 9 an empty body; "only logs" and "returns an empty value" are `NOT MEASURED` without the rule | The number of **matching** clauses only falls. Zero new ones. The number of catch clauses is not a target: a correct catch stays |
| CHK-14, tests in no lane | The list that the check produces on its adoption commit. Measured today: 124 of 148 database test files; and, by a helper's measurement that the main session did not recount (`A/raw/R2b/gates/chk/chk_c.py`), 84 of 199 E2E spec files | **Zero** files that are in no lane and not on the exclusion list |
| CHK-15, boundary violations | Today's edges, as counted on the adoption commit | The number only falls. Zero in new screens |
| CHK-16, tables with more than one writer | The owner map and its list of tables with more than one writer, as the check takes them on its adoption commit. A helper's measurement of today, not recounted by the main session (`A/raw/R2b/gates/chk/chk_b.py`): 22 of 81 written tables, counting production writers only (R1's 24 counts a test fixture) | The number only falls. No new shared table |
| CHK-13, scripts that open a database client outside the guarded import | 18 scripts, 7 of them with a write or schema statement (the first count, 4, used a statement pattern that missed one script and flagged a read-only one) | **Zero** after WP-04; a read-only tool is listed with its reason, a writing script never; the assertion's refusal cases pass (an arbitrary remote target, staging, an unknown project) |
| CHK-11, sending jobs without the delivery contract | Three of the four cron jobs that send (dunning, engagement, NPS); the sponsors job sends from the outbox (recount of R3). The list is taken with the registry | **Zero** scheduled senders without the four cases |
| CHK-26, public entry points outside the registry | The inventory of `DIRECTION.md` §6.1a | **Zero** unregistered entries; in phase 1 every sale and sign-up entry refuses on the server |
| CHK-23, scanned documents | 10 files | **Zero** after WP-01 |
| CHK-02, instruction drift | In the repository: 10 prohibited identifiers in a command or trigger position, all in `.agent/workflows/`, and 4 conditional ones (the legacy validation commands and one slice entry point), which the check reports and does not fail; 8 clear role conflicts. Outside it: the trigger of the old Claude `interdomestik` skill fails the check (the skill is disabled since 2026-11-17) | **Zero** prohibited identifiers and role conflicts after the adoption PR. The two files that name a conditional identifier today are replaced by that PR, so none is named after it; one that is named later in a command block or a required step is reported, not failed (`CI-GATE-PROPOSALS.md`, 4.3, the one specification of the check and its hook). The slice runners are retired by the owner's decision of 2026-11-17 and leave in a PR of their own |
| HOOK-01 to HOOK-04 (refusals) | Not measured. During this review: nine mistaken `rg -r` calls in three parts | Counted per hook. Each hook writes one line to an untracked local log: date, hook, the matched token; never the full command |
| HOOK-06 (ask before a high-risk edit) | Not measured | Count of asks, and how many the owner declined |
| HOOK-07 (lint the edited file) | Not measured; its cost per edit is `NOT MEASURED` | Median added time per edit, measured in the first week. If it exceeds two seconds, the hook is narrowed |

## 5. What a result means

- **A metric did not move, or a check caught nothing: investigate. Do not remove.** The order of questions:
  1. Did the check run? (executions)
  2. Does it still fail on its failing example? Each check's failing example is in `RULES.md`; injecting it is the adoption verification.
  3. Did the guarded class occur and escape? (defect records)
  4. Did the work of the period touch the area at all?
- **Removal follows only the A5 conditions.** A proposal to remove or merge a check must show either (i) its execution count, the completeness of its evidence, the demonstrated overlap and the coverage of its replacement, or (ii) that the guarded obligation and all its consumers are retired.
- **Rare-event safeguards and mandatory gates stay until the owner decides**, whatever their catch count. A guard against a cross-tenant write, a destructive script or a published secret is expected to catch nothing in most months. Today's nine required checks and the required tenant-guard workflow are in this group.
- **A metric got worse.** Find the rule or check that costs the time before anything else is changed: time to merge, reruns and false positives are attributed per check.
- **An advisory rule** (R-21, R-22, R-29, R-31, and the advisory parts of others) is judged by the review records: how often reviewers cited it, and whether its class appears in the defect records. A rule that nobody cited and whose class never occurred in two periods is put to the owner with that evidence.

## 6. The design choices under test

CR-A names four design choices that rest on mixed research, so this check evaluates them and does not assume them:

| Choice | How it is evaluated |
|---|---|
| The instruction file is short | The byte count above; and whether agents ask for, or reviewers have to supply, a rule that was cut. Each such case is noted in the review record |
| Only conventions that cannot be inferred from the code | The same notes: a convention that had to be explained twice was not inferable |
| Each rule is `ENFORCED` or `ADVISORY` | Catches and escapes per rule, sections 4 and 5. A rule whose check is still only proposed counts as advisory |
| The instruction-drift check | Executions and catches of CHK-02 and HOOK-05; one deliberate test with the failing example at adoption |

## 7. What can blur the comparison

- **The work changes.** The interface rebuild and the pilot work produce other PRs than the baseline window. Report every metric per risk tier (T1 to T6), not only in total.
- **The volume changes.** August and September held 247 of the 427 PRs. Compare with November and October, not with the 90-day totals.
- **The definition of "process-only"** is a classification by script. Use the same script; list the PRs it classifies, so that a reader can check them.
- **The models change.** Record the model and the reviewer of each PR in the review record, as this review does for its own helpers.
- **The pilot.** Once real members are on the platform, defects found in production enter the records. That raises the count without the code having got worse. Report the stage of detection, not only the total.

## 8. Not measured, and why

- Defects per PR for the baseline window (section 3).
- Tokens loaded per session: bytes are used as the proxy.
- The time each proposed check adds to a PR: no proposed check has run. It is measured in the trial that R-10 requires before a check becomes required.
- Hook refusals and their false positives: no hook is installed.

## 9. The replay of R3, and what it means for this check

The rules were tested once before adoption, on twelve cases that were sealed before any rule was drafted (`RULES.md`, last section; `A/raw/R3/replay/replay-aggregate.md`): **6 of 8 merged defects detected, none of them by a check; 0 of 4 sound changes flagged.** It is inferred rule coverage, not proven prevention, and it describes the drafts as they stood before the revision that followed it. **How it was run limits it further** (added in the closing pass, review comment R3-C11). The scored artifact is the set frozen on 2026-11-17 at 11:40Z, the R2 drafts with the corrections made before the replay (`A/raw/R3/replay/drafts/`). The reviewer and the grader ran on the same model (Opus 5.5 at high effort), each with a context of its own: the grading is independent by context, not by model. After the grading the main session read the grader's case-level report, so everything written later — the revisions, the fixes after the drill, the changes for the adoption and those of the closing pass — was written with knowledge of the sealed cases and is not covered by the score.

What it adds to this check:

- **A number to compare with, and its weakness.** 6 of 8 is the share of known defects that a reviewer who had the rules and the symptom would have flagged. The first check after adoption measures the same thing forward: of the defects in the record of section 3, how many were refused before the merge, and by what — a check, a hook, the review. Expect the review to carry most of it at first: no proposed check runs yet, and a check that starts with a baseline protects new code only.
- **A field the defect record already has.** Each record names the cheapest guard that would have caught the defect (section 3). At the 30-day check the records are grouped by that field: a rule's wording, a check's predicate, an entry on a baseline, nothing. Two records in one group are a reason to change that rule or that check. The replay was read in the same way.
- **The baselines must fall.** For every check that starts with a baseline, the length of its list is a ratchet of section 4. The replay gives the reason: in one case the nearest check held the defective code on its baseline.
- **The revised rules are untested.** R-08, R-09, R-14, R-16, R-17 and R-20 were sharpened after the replay, and no second sealed set exists. Their effect shows only in the record: a defect of one of those classes that is merged after adoption counts against the revision.
- **A second replay, if a harder test is wanted.** A person who did not write the rules seals a new set from defects merged after 2026-11-13, with controls, before reading the rules; the reviewer gets the code and the rules but **not the symptom**. That removes the largest limit of this replay. Cost: one curating session and two helper sessions. It is offered, not planned; the owner recorded it in the closing pass as offered, for after the adoption.

## 10. The drill of R3

A helper planned one feature from the drafts alone, without the code (`A/raw/R3/drill/`; triage in `triage.md`). Of 79 elements of its plan, 47 came from the drafts, 8 were inferred and 24 could not be told; it recorded 31 gaps, of which 2 blocked the plan and 11 risked a defect. Fourteen were of one kind: a rule names a registry, a list or a helper that does not exist yet and did not say what to do meanwhile. Twenty-seven gaps are closed in the drafts, two in part, one at adoption, and one is recorded; none of the fixes is tested.

For this check it adds one cheap measure. Each PR of a new feature notes, in its description, what the implementer had to look up in the code because no rule, contract or catalogue row said it. At the 30-day check those notes are read like the defect records: two notes of one kind are a missing line in a draft.
