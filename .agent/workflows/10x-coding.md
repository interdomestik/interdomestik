---
description: 'The 15 Hidden Rules for 10X Coding Velocity. Use this to structure interaction.'
---

# 10X Coding Rules & Guidelines

These rules are adapted from the "15 Hidden Claude Code Rules" video to maximize development velocity and code quality in the Interdomestik V2 project.

## 1. Prompt Construction (How to ask)

- **Rule 1: XML Formatting**: Always structure complex requests with XML tags.
  ```xml
  <task>Implement Feature X</task>
  <context>File A, File B</context>
  <constraints>Use Shadcn, Mobile-first</constraints>
  ```
- **Rule 2: Better Examples**: Provide "Few-Shot" examples. If asking for a Zod schema, show a similar existing one from `@/lib/validators`.
- **Rule 3: Explicit Instructions**: Be binary. "Use `client component`" or "Use `server component`". "Do NOT use `useEffect`".
- **Rule 4: Motivating Context**: Explain _why_. "This is for the payment flow, so security is P0."
- **Rule 5: Clear Direction**: Start with a verb. "Analyze", "Scaffold", "Refactor".

## 2. Context Engineering (How to think)

- **Rule 6: Context Splitting**: Do not dump `ROADMAP.md` into every session. Create and read `.agent/tasks/current_task.md` for the specific objective.
- **Rule 7: Explore First**: NEVER write code immediately.
  - Step 1: `list_dir`, `view_file` to understand existing patterns.
  - Step 2: Create a <plan>.
  - Step 3: Execute.
- **Rule 8: Clear It Out**: If the conversation drifts or exceeds 20 turns, summarize status to `.agent/tasks/current_task.md` and restart the session.
- **Rule 9: Task Awareness**: Break "Phase 2" into "Week 7", then "Database Schema", then "API".
- **Rule 10: Incremental Progress**: MVP first. "Make it work, then make it right, then make it fast."

## 3. Verification & Control (How to ensure quality)

- **Rule 11: Source Verification**: Use `mcp_ecohub-context-server` tools to verify assumptions about file locations.
- **Rule 12: Control Verbosity**: Ask for "Code only" or "Detailed explanation" as needed.
- **Rule 13: Direct Tool Usage**: Explicitly map tasks to tools.
  - "Audit A11y" -> `mcp_ecohub-qa_accessibility_audit`
  - "Check Build" -> `pnpm build`
- **Rule 14: Minimal Hallucination**: If a file is not found, stop and search. Do not assume its content.
- **Rule 15: Design Guidance**: Strictly adhere to the project's design system (`@interdomestik/ui`, `lucide-react`, Tailwind).

## 4. Workflow Template

To start a "10X" task, run:

```bash
./scripts/start-10x-task.sh "Task Name"
```

(See `scripts/start-10x-task.sh` implementation below)
