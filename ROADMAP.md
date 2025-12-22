# Interdomestik V2 - Asistenca Membership Roadmap

Full implementation plan: `.agent/tasks/implementation_membership_model.md`

## Vision

Build the leading membership-based damage assistance service in the Balkans. Members pay a low yearly fee and receive expert legal and technical help when accidents happen. The company handles claims end-to-end. Agents sell memberships only.

---

## Executive Summary

Interdomestik Asistenca is a membership protection club with annual pricing and success-based mediation fees only when members win claims. The product focuses on fast response, expert handling, and clear value for members.

Key principles:

- Annual memberships (Standard + Familja at launch)
- Company handles claims; agents are sales only
- 24h response SLA and 30-day money-back guarantee
- Strong onboarding and retention value without relying on claims

---

## Business Model (Final)

- Pricing: Standard (EUR 20/year), Familja (EUR 35/year)
- Success fee: 15% of recovered amount (discounts per tier)
- Guarantee: 30-day money-back
- Grace period: 14 days + 3-attempt dunning
- Payment provider: Paddle

Launch tier strategy:

- Phase 1 launch: Standard + Familja only
- Future additions: Bazik (retention offer), Biznes (after 5 manual B2B deals)

---

## Role Model

- Member: subscribes, uses services, files claims, tracks status
- Agent: sells memberships, manages leads/deals, sees claim stage only
- Staff: internal claim handling, full workflow control
- Admin: plans, pricing, analytics, user and partner management

---

## Services Covered

- Traffic accidents
- Workplace accidents
- Property damage
- Personal injury
- Business liability
- Subrogation/regression

Core services:

- Legal basis identification
- Compensation procedures guidance
- Injury categorization (certified doctors)
- Damage calculation (independent valuation)
- Disability coefficient assessment
- 24/7 scene guidance

---

## Claims Lifecycle (Member Visible)

Filed -> Intake -> Verification -> Assessment -> Negotiation -> Resolution -> Closed/Rejected

Agents see stage and last update only. Staff controls workflow and internal notes.

---

## Roadmap (Aligned to Implementation Plan)

### Phase 0: Pre-Launch Validation (Week 0)

- Legal templates (terms, privacy, refund, success fee)
- Operations playbook
- Financial model
- Expert network (7 contacts)
- Branding finalized (Asistenca)
- Analytics setup (PostHog/GA4) + event plan
- 24/7 hotline provider and escalation rules
- Agent recruitment strategy + first 5 outreach
- Soft launch criteria + waitlist
- 3-month content calendar + 10 short videos

### Phase 1: Membership Infrastructure (Weeks 1-2)

**Payment Integration** ✅ COMPLETE (Dec 21, 2025)

- ✅ Paddle integration (Sandbox tested, production ready)
- ✅ Checkout flow with overlay
- ✅ Webhook handler for subscription events
- ✅ Test payments successful
- ✅ CSP configured for Paddle domains
- 📄 Documentation: `docs/PADDLE_SETUP.md`

**Remaining Tasks**:

- [x] Membership tables + subscription sync
- [x] Dunning flow, grace enforcement, downgrade lock
- [x] Pricing page enhancements, FAQ, case studies
- [x] Onboarding flow (first 5 minutes)
- [ ] Thank-you letter (email + PDF + QR)
- [x] Wallet card + PWA install prompt + offline shell cache
- [x] Claim filing gate for active membership

- [x] Agent CRM: Simplified Member Management
- [x] Manual Member Registration flow
- [x] Subscription period & status visibility
- [x] Agent navigation updated (CRM, Leads, Members)
- [ ] Member Interaction Logging
- [x] RLS for agent data isolation (Initial)

### Phase 2: Agent Sales System (Weeks 3-4)

- CRM leads/deals/activities
- Agent dashboard + pipeline views
- Deal-to-membership conversion
- Commission tracking + referral link
- Admin agent approval flow
- RLS for agent data isolation

### Phase 3: Referral and Engagement (Week 5)

- Member referral system + shareable card
- WhatsApp bot (v1 routing)
- Public stats page (verified only)
- Partner management + partner page
- Agent leaderboard + quick-start bonus
- Influencer outreach + UGC submission

### Phase 4: Staff Operations (Weeks 6-7)

- Staff role and permissions
- Claim queue + assignment
- Claim stage history + member tracker
- SLA tracking + internal notes
- Member-staff messaging

### Phase 5: Engagement and Retention (Week 8)

- Full lifecycle email sequence
- Annual Protection Report
- NPS automation
- AI claim assistant (v1) and doc scanner (optional)
- Asistenca Wrapped (annual summary)

### Phase 6: Analytics and Scale (Weeks 9-10)

- Admin analytics
- Revenue tracking
- Conversion funnel reporting
- A/B testing setup

---

## Metrics (Targets)

- Landing page CVR: 4%+
- Checkout completion: 70%+
- CAC: EUR 5-10
- Refund rate: <5%
- Activation rate: 60%+
- Agent activation: 70% (1+ sale in first week)
- Referral contribution: 20%

---

## Dependencies and Risk Controls

- Paddle approval for Apple/Google Pay
- Verified stats for public claims
- Hotline staffing before SLA promise
- RLS policies for agent data isolation
- Document security + consent for AI features

## Release Strategy

- Feature flags for membership, agent CRM, staff claims, referrals, WhatsApp
- Rollout order: internal staff -> agents -> public
- Rollback: disable flags to revert to legacy flows
- i18n QA: verify next-intl coverage and locale completeness per release

---

## Testing Infrastructure ✅ COMPLETE (Dec 22, 2025)

### Unit Test Coverage

| Directory          | Components | With Tests | Coverage    |
| ------------------ | ---------- | ---------- | ----------- |
| **claims/**        | 7          | 7          | **100%** ✅ |
| **agent/**         | 11         | 11         | **100%** ✅ |
| **admin/**         | 10         | 10         | **100%** ✅ |
| **dashboard/**     | 9          | 9          | **100%** ✅ |
| **auth/**          | 6          | 6          | **100%** ✅ |
| **messaging/**     | 3          | 3          | **100%** ✅ |
| **pricing/**       | 1          | 1          | **100%** ✅ |
| **settings/**      | 2          | 2          | **100%** ✅ |
| **notifications/** | 2          | 2          | **100%** ✅ |

**Unit Tests: 438 passing** ✅

### E2E Test Coverage

| Test Suite                | Description               | Tests |
| ------------------------- | ------------------------- | ----- |
| `rbac.spec.ts`            | Role-Based Access Control | 22    |
| `multi-user-flow.spec.ts` | Cross-role workflows      | 17    |
| `api-permissions.spec.ts` | API authorization         | 24    |
| `member-flow.spec.ts`     | Member journey            | 10    |
| `staff-flow.spec.ts`      | Staff journey             | 6     |
| `admin-flow.spec.ts`      | Admin journey             | 12    |
| `agent-flow.spec.ts`      | Agent journey             | 8     |
| _Other E2E tests_         | Auth, Claims, Settings    | 40+   |

**E2E Tests: 100+ passing** ✅

### Role Permission Testing

All role-based access control verified:

- ✅ Member restricted from admin/agent routes
- ✅ Agent restricted from admin routes (view-only access)
- ✅ Staff restricted from admin routes
- ✅ Admin full access verified
- ✅ Unauthenticated user protection
- ✅ Cross-role data isolation

### Test Seeding

- 10 Worker-specific Members
- 10 Worker-specific Agents
- 3 Staff Users
- 2 Admin Users
- 50 Claims (5 per member worker)

---

## Next Step

Implement Member Interaction Logging (simplified activity notes) and Commission Tracking.
