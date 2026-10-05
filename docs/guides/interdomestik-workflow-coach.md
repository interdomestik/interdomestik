# Interdomestik workflow coach

A read-only companion to `interdomestik-developer`, configured for GPT-6.1 Sol/high.

Invoke at slice intake, readiness, delivery or a concrete new problem. Supply the
current owning chat, exact checkout/branch/head, authorized scope, current receipt,
relevant canonical authority and the evidence since its previous review. Request
one boundary assessment; the implementation owner continues to own the work.

Example request:

> Use interdomestik-workflow-coach to review this slice boundary. Recover current
> authority from the attached checkout and receipt. Identify only new actionable
> gaps, credit existing delivery and recommend the next bounded outcome. Reuse
> valid proof. Record source evidence and limitations; do not modify files or
> dispatch providers/tests. Return no actionable finding when appropriate.

The feedback cycle is observe → propose → owner disposition → bounded correction
→ affected verification → lesson proposal → source/install reconciliation → next
slice. Lessons require evidence; neither agent rewrites instructions autonomously.

The existing workflow monitor remains the scheduler and deduplication record.
There is no second recurring automation. All four role-shell redesigns belong in
remaining-outcome planning; visual/human acceptance remains explicit.

For project registration, the repository owner may add the supported entry:

```toml
[agents.interdomestik-workflow-coach]
config_file = "agents/interdomestik-workflow-coach.toml"
```

Personal installation is not proof of startup loading. Verify a fresh role reports
revision `2026-10-03-coach-v1` before file reads, and distinguish its configured
model from observable client/provider metadata. Existing running sessions may need
a new role session to discover the installed definition.
