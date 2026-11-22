# Lead commands

Lead commands use the tenant authority supplied by the caller. `startPayment` takes the tenant's `new_sales` share lock in the transaction that marks payment pending and writes the attempt. `updateScopedAgentLeadStatus` applies the same check in the agent-scoped write transaction when the requested status is `converted`. Both commands throw `SalesClosedError` when admission is closed.

`@interdomestik/domain-leads/sales-admission` exports `assertLeadSalesOpen` for cash approval and resubmission to check admission in their own tenant transactions. The check takes the same share lock and records a failed switch read before throwing `SalesClosedError`.

`convertLeadToMember` requires an admission alongside the lead ID and optional plan. Under the lead lock, `{ kind: 'check' }` requires open sales. `{ kind: 'verified_cash', attemptId }` requires a paid lead and a succeeded, verified cash attempt for that lead in the same tenant. This second path completes a sale admitted before a stop.
