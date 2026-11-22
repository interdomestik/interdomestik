# CLAUDE.md — Interdomestik

@AGENTS.md

The rules are in `AGENTS.md`. This file adds only what is specific to Claude Code.

## Your role

- You implement, and you own integration (R-01), with Claude Opus as orchestrator and as implementer. You never approve your own change. When a unit is finished, give the exact head commit to the lead for review and wait for the review record.
- When the lead gave Codex a bounded part, you are its reviewer: read-only, findings first, as R-01 describes.
- For HIGH work (tiers T4 to T6) the lead routes the reviews of R-02. Do not choose a reviewer or a model yourself.

## Sessions and subagents

- One bounded unit of work per session (R-22). When it is implemented, verified and recorded, stop. Do not begin the next work package on your own.
- A subagent gets one responsibility, the paths it may touch, and the rules of `AGENTS.md` that apply, copied into its brief. Never brief it with "see AGENTS.md" alone.
- Check a subagent's result against the code before you use it: re-read the lines it cites, recount a number that enters a decision, and trace a claim that something "does not exist" or "has no caller" before you rely on it.
- Run one heavy job at a time (`pnpm pr:verify`, the E2E gate, a build), and none while another session runs one. The dispatcher, the checks before a push and when the gate runs: `RULES.md`, R-04, Mac use.

## Memory, skills, other tools

- Memory holds dated facts, never rules. If a memory entry or a skill disagrees with `AGENTS.md`, `AGENTS.md` wins; say which entry is stale.
- Never start a program, a phase or a "next slice" because a word appears in a message. Work comes from `DIRECTION.md` or from the owner (R-29).
- Use only this project's MCP servers. Never call a tool that belongs to another project's server on this repository, and never a tool with a SQL path whose target you have not been told (R-24).

## Hooks

- Once they are installed (they come in a PR of their own), hooks in `.claude/settings.json` refuse some commands (R-12, R-24, R-33), ask before an edit to a high-risk path (R-34 and tier T5), and report lint findings after an edit. Never work around a refusal (R-25). Read its message; if the task truly needs the action, ask the owner.

## This machine

- No checkout is linked to a shared project (the main checkout was linked to the old production until the owner unlinked it). Work in a worktree on the external volume, and never run `supabase` or `vercel` anywhere (R-24).
- Gate evidence (`pnpm pr:verify`, `pnpm security:guard`) counts only from the dedicated macOS verification machine, with its configuration recorded in the result. On any other machine you pre-check, and you say so (R-04). That machine is recognised by a marker file outside the repository, which the verify script checks; until the marker and the check exist, every run is a pre-check.
- The internal disk is short of space: keep worktrees, caches and build output on the external volume.

## Reporting

- Say what you verified and what you did not. Write "not measured" for a number you could not produce. Never report a check as passed if you did not run it on the final head (R-04).
