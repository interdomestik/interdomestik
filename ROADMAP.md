# 🏆 INTERDOMESTIK V2

## The #1 Consumer Protection & Claims Management Platform in the Balkans

> **Vision**: Be the trusted partner for every citizen in the Balkans who faces damage, disputes, or needs consumer protection — from initiation to resolution.

---

## 📊 Executive Summary

**Interdomestik** is a subscription-based consumer protection service that helps members resolve disputes with companies, landlords, insurance providers, employers, and other entities. The platform provides:

- **Full claim lifecycle management** from incident to resolution
- **Professional agent support** for complex cases
- **Self-service tools** for simple disputes
- **Legal document generation** and e-signatures
- **Multi-channel communication** (email, SMS, in-app)
- **Knowledge base** for consumer rights education

### Why Interdomestik Will Win in the Balkans

| Competitive Advantage      | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| **First-to-Market**        | No equivalent digital solution exists in Kosovo, Albania, North Macedonia |
| **Local Language Support** | Albanian, Serbian, Macedonian from day one                                |
| **Regional Law Knowledge** | Built-in understanding of Balkan consumer protection laws                 |
| **Affordable Pricing**     | €5-15/month — accessible to everyone                                      |
| **Mobile-First**           | PWA optimized for the region's mobile-heavy usage                         |
| **Trust & Transparency**   | Full visibility into claim progress                                       |

---

## 🎯 Complete Feature Breakdown

### 1. Core Platform Features

#### 1.1 Member Portal

| Feature                      | Description                                         | Priority | Impact   |
| ---------------------------- | --------------------------------------------------- | -------- | -------- |
| **Dashboard**                | Claims overview, membership status, recent activity | P0       | High     |
| **Quick Actions**            | File claim, view documents, contact agent           | P0       | High     |
| **Claim Wizard**             | Guided multi-step claim creation                    | P0       | Critical |
| **Claim Tracking**           | Real-time status updates with timeline              | P0       | Critical |
| **Document Vault**           | All claim-related documents in one place            | P0       | High     |
| **Messaging Center**         | Secure chat with assigned agents                    | P0       | High     |
| **Notification Preferences** | Choose how to receive updates                       | P1       | Medium   |
| **Profile Management**       | Personal info, password, 2FA                        | P1       | Medium   |
| **Mobile Optimization**      | Full PWA with offline support                       | P1       | High     |

#### 1.2 Claim Management System

| Feature                     | Description                                                    | Priority | Impact   |
| --------------------------- | -------------------------------------------------------------- | -------- | -------- |
| **Claim Categories**        | Consumer, Housing, Insurance, Employment, Contracts, Utilities | P0       | Critical |
| **Sub-Categories**          | Detailed classification (e.g., Telecom→Bill Dispute)           | P0       | High     |
| **Opposing Party Profiles** | Track companies/individuals in disputes                        | P0       | Critical |
| **Evidence Management**     | Upload photos, receipts, contracts, correspondence             | P0       | Critical |
| **Workflow Engine**         | Configurable status transitions with triggers                  | P0       | Critical |
| **SLA Tracking**            | Deadlines, reminders, escalation rules                         | P1       | High     |
| **Priority System**         | Low, Normal, High, Urgent with auto-escalation                 | P1       | High     |
| **Tags & Labels**           | Custom categorization for search/filter                        | P1       | Medium   |
| **Bulk Actions**            | Mass status update, assignment, export                         | P1       | Medium   |
| **Templates**               | Pre-filled claim forms by category                             | P2       | Medium   |

#### 1.3 Claim Workflow States

```
┌─────────┐   ┌───────────┐   ┌────────────┐   ┌───────────────┐
│  DRAFT  │──▶│ SUBMITTED │──▶│  ASSIGNED  │──▶│ INVESTIGATING │
└─────────┘   └───────────┘   └────────────┘   └───────────────┘
                                                       │
        ┌──────────────────────────────────────────────┘
        ▼
┌────────────────┐   ┌─────────────┐   ┌──────────────┐
│ CONTACTING     │──▶│ NEGOTIATING │──▶│  MEDIATION   │
│ OPPOSING PARTY │   └─────────────┘   └──────────────┘
└────────────────┘                            │
                                              ▼
                              ┌───────────────────────────┐
                              │       RESOLUTION          │
                              │ Won | Partial | Lost |    │
                              │ Settled | Withdrawn       │
                              └───────────────────────────┘
                                              │
                                              ▼
                                       ┌──────────┐
                                       │  CLOSED  │
                                       └──────────┘
```

---

### 2. Agent Workspace (CRM)

#### 2.1 Agent Dashboard

| Feature               | Description                              | Priority | Impact   |
| --------------------- | ---------------------------------------- | -------- | -------- |
| **Claim Queue**       | Prioritized list with filters and search | P0       | Critical |
| **Assignment System** | Auto-assign by category/region/load      | P0       | High     |
| **My Claims**         | Claims assigned to current agent         | P0       | Critical |
| **Team View**         | See team's workload (for supervisors)    | P1       | Medium   |
| **Calendar**          | Upcoming deadlines, scheduled calls      | P1       | High     |
| **Daily Digest**      | Summary of pending tasks                 | P1       | Medium   |

#### 2.2 Contact Management (CRM)

| Feature               | Description                              | Priority | Impact   |
| --------------------- | ---------------------------------------- | -------- | -------- |
| **Member Profiles**   | Full history, claims, notes, preferences | P0       | Critical |
| **Activity Timeline** | All interactions logged automatically    | P0       | High     |
| **Notes & Tags**      | Internal notes, custom tagging           | P0       | High     |
| **Quick Actions**     | Call, email, schedule from profile       | P1       | Medium   |
| **Related Contacts**  | Family members on same subscription      | P1       | Medium   |
| **Company Database**  | Common opposing parties with info        | P2       | Medium   |

#### 2.3 Communication Tools

| Feature               | Description                          | Priority | Impact   |
| --------------------- | ------------------------------------ | -------- | -------- |
| **In-App Messaging**  | Real-time chat with members          | P0       | Critical |
| **Email Integration** | Send/receive from within platform    | P1       | High     |
| **Call Logging**      | Log phone calls with notes           | P1       | High     |
| **Email Templates**   | Pre-written responses                | P1       | Medium   |
| **Letter Templates**  | Generate formal letters to companies | P1       | High     |
| **SMS Integration**   | Send SMS alerts (critical updates)   | P2       | Medium   |

#### 2.4 Agent Performance

| Feature                 | Description                           | Priority | Impact |
| ----------------------- | ------------------------------------- | -------- | ------ |
| **Personal Stats**      | Claims resolved, avg. resolution time | P1       | Medium |
| **Leaderboard**         | Gamified ranking (optional)           | P2       | Low    |
| **Feedback Collection** | Member ratings per claim              | P1       | High   |
| **Quality Metrics**     | Success rate, customer satisfaction   | P1       | High   |

---

### 3. Admin Panel

#### 3.1 User Management

| Feature               | Description                      | Priority | Impact   |
| --------------------- | -------------------------------- | -------- | -------- |
| **Member Management** | CRUD, status, subscription       | P0       | Critical |
| **Agent Management**  | Add, permissions, regions        | P0       | Critical |
| **Role-Based Access** | Admin, Supervisor, Agent, Member | P0       | Critical |
| **Bulk Import**       | CSV upload for members           | P1       | Medium   |
| **Activity Logs**     | Who did what, when               | P0       | High     |

#### 3.2 Subscription & Billing

| Feature                | Description                       | Priority | Impact   |
| ---------------------- | --------------------------------- | -------- | -------- |
| **Plan Management**    | Define subscription tiers         | P0       | Critical |
| **Stripe Integration** | Payments, subscriptions, invoices | P0       | Critical |
| **Revenue Dashboard**  | MRR, ARR, churn rate              | P0       | High     |
| **Invoice History**    | All member invoices               | P0       | High     |
| **Promo Codes**        | Discount coupons                  | P1       | Medium   |
| **Payment Recovery**   | Dunning for failed payments       | P1       | High     |

#### 3.3 Claims Analytics

| Feature                | Description            | Priority | Impact |
| ---------------------- | ---------------------- | -------- | ------ |
| **Claims by Status**   | Pipeline visualization | P0       | High   |
| **Claims by Category** | Identify trends        | P0       | High   |
| **Resolution Rates**   | Win/loss analysis      | P0       | High   |
| **Agent Performance**  | Compare agent metrics  | P1       | High   |
| **Time to Resolution** | Average by category    | P1       | Medium |
| **Export Reports**     | CSV, PDF generation    | P1       | Medium |

#### 3.4 System Settings

| Feature                    | Description                 | Priority | Impact |
| -------------------------- | --------------------------- | -------- | ------ |
| **Workflow Configuration** | Customize claim states      | P1       | High   |
| **Email Templates**        | Customize all notifications | P1       | High   |
| **SLA Rules**              | Set deadlines by priority   | P1       | High   |
| **Integrations**           | API keys, webhooks          | P1       | Medium |
| **White-Label**            | Custom branding (future)    | P3       | Low    |

---

### 4. Document Management

#### 4.1 File Handling

| Feature                | Description                     | Priority | Impact   |
| ---------------------- | ------------------------------- | -------- | -------- |
| **Drag & Drop Upload** | Easy file attachment            | P0       | High     |
| **Multi-File Upload**  | Upload multiple at once         | P0       | High     |
| **File Preview**       | In-browser PDF/image viewer     | P0       | High     |
| **Secure Storage**     | Encrypted storage (Supabase/S3) | P0       | Critical |
| **Download History**   | Track who accessed what         | P1       | Medium   |

#### 4.2 E-Signatures (Documenso Integration)

| Feature                   | Description                     | Priority | Impact   |
| ------------------------- | ------------------------------- | -------- | -------- |
| **Authorization Forms**   | Member signs authorization      | P1       | Critical |
| **Settlement Agreements** | Digital signing of agreements   | P1       | Critical |
| **Multi-Party Signing**   | Member + company signatures     | P2       | Medium   |
| **Audit Trail**           | Legally valid signature records | P1       | High     |

#### 4.3 Document Generation

| Feature                 | Description                     | Priority | Impact |
| ----------------------- | ------------------------------- | -------- | ------ |
| **Complaint Letters**   | Auto-generate formal complaints | P1       | High   |
| **Legal Notices**       | Template-based notices          | P1       | High   |
| **Invoice/Receipt PDF** | Membership invoices             | P0       | High   |
| **Claim Summary**       | Export claim as PDF             | P1       | Medium |

---

### 5. Communication & Notifications (Novu Integration)

#### 5.1 Multi-Channel Notifications

| Channel      | Use Cases                         | Priority |
| ------------ | --------------------------------- | -------- |
| **In-App**   | All updates, messages             | P0       |
| **Email**    | Status changes, important updates | P0       |
| **SMS**      | Critical alerts, 2FA              | P2       |
| **Push**     | Mobile app notifications          | P2       |
| **WhatsApp** | Alternative channel (future)      | P3       |

#### 5.2 Notification Triggers

| Event                    | Recipient      | Channels           |
| ------------------------ | -------------- | ------------------ |
| Claim submitted          | Member + Agent | In-App, Email      |
| Status changed           | Member         | In-App, Email      |
| Agent assigned           | Member + Agent | In-App, Email      |
| New message              | Both           | In-App, Push       |
| Document uploaded        | Both           | In-App             |
| SLA deadline approaching | Agent          | In-App, Email      |
| SLA deadline missed      | Supervisor     | In-App, Email, SMS |
| Subscription expiring    | Member         | Email, SMS         |
| Payment successful       | Member         | Email              |
| Payment failed           | Member + Admin | Email, SMS         |

---

### 6. Knowledge Base & Self-Service

#### 6.1 Public Knowledge Base

| Feature                | Description                         | Priority | Impact |
| ---------------------- | ----------------------------------- | -------- | ------ |
| **Article Categories** | Consumer rights, how-tos, FAQ       | P1       | High   |
| **Search**             | Full-text search across articles    | P1       | High   |
| **Multi-Language**     | Articles in all supported languages | P1       | High   |
| **Video Tutorials**    | Embedded video guides               | P2       | Medium |
| **Related Articles**   | AI-suggested related content        | P2       | Medium |

#### 6.2 Self-Service Tools

| Feature                       | Description                   | Priority | Impact |
| ----------------------------- | ----------------------------- | -------- | ------ |
| **Claim Eligibility Checker** | Assess if claim is valid      | P1       | High   |
| **Template Letter Generator** | DIY complaint letters         | P2       | Medium |
| **Rights Checker**            | Know your rights by situation | P2       | Medium |
| **Company Lookup**            | Info about common opponents   | P2       | Low    |

---

### 7. AI & Automation Features

#### 7.1 AI Assistant (Chatbot)

| Feature                       | Description                                 | Priority | Impact |
| ----------------------------- | ------------------------------------------- | -------- | ------ |
| **24/7 First-Line Support**   | Answer common questions instantly           | P2       | High   |
| **Claim Category Suggestion** | AI recommends category based on description | P2       | Medium |
| **Document Classification**   | Auto-categorize uploaded files              | P3       | Medium |
| **Sentiment Analysis**        | Flag frustrated members                     | P3       | Low    |

#### 7.2 Workflow Automation (n8n Integration)

| Automation               | Description                       | Priority |
| ------------------------ | --------------------------------- | -------- |
| **Status Notifications** | Auto-notify on status change      | P0       |
| **SLA Escalations**      | Auto-escalate overdue claims      | P1       |
| **Email Parsing**        | Create claims from email (future) | P3       |
| **Scheduled Reports**    | Daily/weekly digest to admins     | P2       |
| **External APIs**        | Connect to company registries     | P3       |

---

### 8. Gamification & Engagement

#### 8.1 Member Engagement

| Feature                | Description                         | Priority | Impact |
| ---------------------- | ----------------------------------- | -------- | ------ |
| **Progress Tracking**  | "Your claim is 70% complete"        | P1       | High   |
| **Achievement Badges** | Milestones (first claim, etc.)      | P2       | Low    |
| **Streak System**      | Login/engagement streaks            | P3       | Low    |
| **Points System**      | Earn points for referrals, feedback | P2       | Medium |

#### 8.2 Referral Program

| Feature                   | Description                            | Priority | Impact |
| ------------------------- | -------------------------------------- | -------- | ------ |
| **Unique Referral Links** | Trackable personal links               | P1       | High   |
| **Two-Sided Rewards**     | Both referrer and referee get discount | P1       | High   |
| **Referral Dashboard**    | Track referrals and rewards            | P1       | Medium |
| **Social Sharing**        | Easy share to WhatsApp, Facebook       | P2       | Medium |
| **Multi-Tier Rewards**    | More referrals = better rewards        | P2       | Low    |

---

### 9. Community Features

#### 9.1 Member Community

| Feature               | Description               | Priority | Impact |
| --------------------- | ------------------------- | -------- | ------ |
| **Community Forum**   | Discuss experiences, tips | P3       | Medium |
| **Success Stories**   | Showcase resolved claims  | P2       | Medium |
| **Peer Support**      | Members helping members   | P3       | Low    |
| **Reviews & Ratings** | Rate companies            | P3       | Low    |

---

### 10. Multi-Language & Localization

#### 10.1 Supported Languages

| Language       | Code | Region                          | Priority |
| -------------- | ---- | ------------------------------- | -------- |
| **Albanian**   | sq   | Kosovo, Albania, N. Macedonia   | P0       |
| **English**    | en   | International, Diaspora         | P0       |
| **Serbian**    | sr   | Kosovo, Serbia                  | P1       |
| **Macedonian** | mk   | North Macedonia                 | P2       |
| **German**     | de   | Diaspora (Switzerland, Germany) | P3       |

#### 10.2 Localization Features

| Feature                        | Description                    | Priority |
| ------------------------------ | ------------------------------ | -------- |
| **Dynamic Language Switch**    | Change language without reload | P0       |
| **Locale-Specific Formatting** | Date, currency, numbers        | P0       |
| **RTL Preparation**            | Future-proofing                | P3       |
| **Translation Management**     | Easy content updates           | P1       |

---

### 11. Security & Compliance

#### 11.1 Security Features

| Feature                | Description                     | Priority |
| ---------------------- | ------------------------------- | -------- |
| **Supabase RLS**       | Row-Level Security for all data | P0       |
| **2FA**                | Two-factor authentication       | P1       |
| **Session Management** | Secure session handling         | P0       |
| **Encryption**         | Data at rest and in transit     | P0       |
| **Audit Logs**         | All actions logged              | P0       |
| **CAPTCHA**            | Bot protection on forms         | P1       |
| **CSP**                | Content Security Policy         | P1       |
| **Rate Limiting**      | Protect auth/forms              | P1       |
| **Secrets Management** | Centralized env/secrets policy   | P1       |

#### 11.2 Compliance

| Standard           | Description                   | Priority |
| ------------------ | ----------------------------- | -------- |
| **GDPR**           | EU data protection compliance | P0       |
| **KVKK**           | Kosovo/Balkan data laws       | P1       |
| **Cookie Consent** | GDPR-compliant consent        | P0       |
| **Data Export**    | User can request all data     | P1       |
| **Data Deletion**  | Right to be forgotten         | P1       |

---

### 12. Mobile & PWA

#### 12.1 Progressive Web App

| Feature                | Description              | Priority |
| ---------------------- | ------------------------ | -------- |
| **Install Prompt**     | Add to home screen       | P1       |
| **Offline Support**    | View claims offline      | P2       |
| **Push Notifications** | Native-like push         | P2       |
| **Camera Access**      | Take photos for evidence | P1       |
| **Fast Loading**       | < 3s initial load        | P0       |

---

## 📅 Development Roadmap

### Phase 0: Foundation (Weeks 1-2) — ✅ Complete

Core setup done: monorepo, Next.js, Supabase config, i18n, lint/TS strict, auth/pages, design system scaffolding, staging deploy.

### Phase 1: Core MVP (Weeks 3-4) — ✅ ~80% Complete

- Claim wizard: ✅ Done
- Claims list: ✅ Done
- Claim detail: ✅ Done
- Profile page: ⏳ Todo
- Settings page: ⏳ Todo

**Quality gates (ongoing):** lint + unit + Playwright smoke (claim create/list/detail/dashboard) + a11y/perf spot-check.

---

### Phase 1: Core MVP (Weeks 3-6)

**Goal**: Basic claim management system working end-to-end

```
Week 3: Member Portal Basics
├── Member dashboard layout
├── Profile management
├── Navigation and routing
├── Responsive design
├── Basic settings page
└── 404 and error pages

Week 4: Claim Creation Flow
├── Claim creation wizard (multi-step form)
├── Category selection with guidance
├── Evidence upload (files, photos)
├── Opposing party input
├── Claim preview and submission
Week 3: Core MVP Features
├── Create Claim submission forms (multi-step)
├── Implement Dashboard layout (Shell, Nav)
├── Set up TanStack Query for data fetching
├── Build reusable Data Table component (TanStack Table)
├── Implement Audit Logging system (Pino + Drizzle)
├── Create "My Claims" list view
└── Build Claim detail view (Timeline, Status)

Week 4: Admin & Communication
├── Build Admin Dashboard
├── Admin Claim Management (Status updates)
├── Implement internal messaging system
├── Set up transactional emails (Resend)
└── End-to-end testing (Happy path)

Week 5: Claim Tracking & Detail
├── Claim list view with filters
├── Claim detail page
├── Timeline component
├── Document list and preview
├── Status display and history
├── Edit draft claims
└── Cancel claim flow

Week 6: Agent Workspace MVP
├── Agent dashboard
├── Claim queue with filters
├── Claim assignment system
├── Agent claim detail view
├── Status transition actions
├── Internal notes (agent-only)
├── Basic activity logging
└── Agent profile
```

---

### Phase 2: Communication & Subscription (Weeks 7-10)

**Goal**: Messaging, notifications, payments

```
Week 7: Messaging System
├── In-app messaging between member and agent
├── Real-time updates with Supabase Realtime
├── Message notifications
├── Message history on claim
├── Unread indicators
└── Typing indicators

Week 8: Notifications (Novu Integration)
├── Set up Novu account and integration
├── Email notification templates
├── In-app notification center
├── Notification preferences
├── Status change triggers
├── Assignment notifications
├── Delivery observability (logs/dlq) and channel fallback strategy
└── Template versioning and testing
└── Test all notification flows

Week 9: Stripe Integration
├── Set up Stripe account
├── Define subscription plans (Basic, Premium)
├── Checkout flow for new members
├── Customer portal for managing subscription
├── Webhook handlers for subscription events (signature verify + idempotency keys)
├── Invoice history
├── Payment failure handling
└── Promo code support

Week 10: Admin Panel MVP
├── Admin dashboard with key metrics
├── User management (members, agents)
├── Claims overview with filters
├── Basic revenue reporting
├── System settings
├── Audit log viewer
└── Admin role guards
```

---

### Phase 3: Documents & Advanced Features (Weeks 11-14)

**Goal**: Document management, e-signatures, CRM

```
Week 11: Document Management
├── Enhanced file upload with progress
├── Document categorization
├── In-browser PDF preview
├── Document download with logging
├── Claim documents tab
├── Member document vault
├── Secure storage with Supabase Storage
└── Virus/mime validation and signed URLs for PII-handling documents

Week 12: E-Signatures (Documenso)
├── Documenso integration
├── Authorization form signing
├── Settlement agreement workflow
├── Signature status tracking
├── Audit trail for signatures
└── Email notifications for signing requests

Week 13: CRM Features for Agents
├── Enhanced member profiles
├── Activity timeline (all interactions)
├── Notes and tagging
├── Quick actions (call, email)
├── Email template system
├── Letter template generation
└── Call logging

Week 14: Workflow Automation (n8n)
├── n8n setup and integration
├── Status change automation
├── SLA deadline alerts
├── Escalation workflows
├── Scheduled report generation
└── Webhook system for external integrations
```

---

### Phase 4: Polish & Launch Prep (Weeks 15-18)

**Goal**: Quality, performance, launch readiness

```
Week 15: Knowledge Base
├── Knowledge base article system
├── Search functionality
├── Category navigation
├── Multi-language articles
├── Admin article editor
└── Related articles suggestions

Week 16: Analytics & Reporting
├── Claims analytics dashboard
├── Agent performance metrics
├── Revenue analytics
├── Export to CSV/PDF
├── Scheduled report emails
└── Custom date ranges

Week 17: Optimization & Testing
├── Performance optimization (Core Web Vitals) with bundle-size budget
├── Image optimization review
├── Accessibility audit (WCAG 2.1)
├── Security audit
├── Load testing
├── Cross-browser testing
├── Mobile device testing
├── End-to-end test suite
└── Bug fixes

Week 18: Launch Preparation
├── Production environment setup
├── Domain and SSL configuration
├── Legal pages (privacy, terms)
├── Cookie consent implementation
├── SEO optimization
├── Documentation finalization
├── Team training
└── Soft launch with beta users
```

---

### Phase 5: Growth Features (Months 5-6)

**Goal**: Engagement, referrals, expansion

```
Month 5: Engagement & Referrals
├── Referral program with unique links
├── Two-sided rewards system
├── Referral tracking dashboard
├── Social sharing buttons
├── Progress indicators on claims
├── Member achievements/badges
├── Success stories showcase
└── Rating system for resolved claims

Month 6: AI & Expansion
├── AI chatbot for first-line support
├── AI claim category suggestions
├── Serbian language support
├── Macedonian language support
├── Advanced reporting
├── API for partners
├── White-label preparation
└── Mobile app planning (React Native)
```

---

### Phase 6: Scale (Months 7-12)

**Goal**: Enterprise features, regional expansion

```
├── Native mobile apps (iOS, Android)
├── WhatsApp integration
├── Advanced AI (document OCR, sentiment)
├── Multi-organization support
├── Partner/affiliate program
├── Integration marketplace
├── Advanced fraud detection
├── Government API integrations
├── Regional expansion (Serbia, Albania, North Macedonia)
└── Enterprise tier features
```

---

## 💰 Pricing Strategy

### Subscription Tiers

| Tier         | Monthly | Annual         | Claims/Year   | Features                   |
| ------------ | ------- | -------------- | ------------- | -------------------------- |
| **Basic**    | €5      | €50 (17% off)  | 3 claims      | Basic support, email only  |
| **Standard** | €10     | €96 (20% off)  | 10 claims     | Priority support, chat     |
| **Premium**  | €15     | €144 (20% off) | Unlimited     | VIP support, phone, e-sign |
| **Family**   | €20     | €192 (20% off) | Unlimited × 4 | Up to 4 family members     |

### Revenue Projections

| Year   | Members | MRR     | ARR      |
| ------ | ------- | ------- | -------- |
| Year 1 | 500     | €4,000  | €48,000  |
| Year 2 | 2,000   | €18,000 | €216,000 |
| Year 3 | 5,000   | €45,000 | €540,000 |

---

## 🛠️ Technology Stack Summary

| Layer             | Technology              | Rationale                              |
| ----------------- | ----------------------- | -------------------------------------- |
| **Frontend**      | Next.js 16 (App Router) | Best ecosystem, SSR/SSG, Vercel native |
| **Data Fetching** | TanStack Query          | Enterprise-grade caching & sync        |
| **State**         | Zustand                 | Lightweight global state               |
| **Tables**        | TanStack Table          | Headless UI for complex data tables    |
| **UI**            | Shadcn/ui + Tailwind    | Consistent, accessible, customizable   |
| **Database**      | Supabase (PostgreSQL)   | Full SQL, RLS, realtime, open-source   |
| **ORM**           | Drizzle                 | Type-safe, lightweight, great DX       |
| **Auth**          | Better Auth             | Self-hosted, MIT licensed, flexible    |
| **Logging**       | Pino                    | High-performance structured logging    |
| **Storage**       | Supabase Storage        | Secure file handling                   |
| **Payments**      | Stripe                  | Industry standard, subscriptions       |
| **Notifications** | Novu                    | Multi-channel, open-source             |
| **E-Signatures**  | Documenso               | Open-source DocuSign alternative       |
| **Automation**    | n8n                     | Self-host, visual workflows            |
| **Email**         | Resend + React Email    | Developer-friendly, beautiful emails   |
| **Hosting**       | Vercel                  | Edge network, easy deploys             |
| **i18n**          | next-intl 4             | Best Next.js i18n solution             |
| **Monorepo**      | Turborepo               | Fast builds, code sharing              |

---

## 📋 Success Metrics

### Product Metrics

- **Claim Resolution Rate**: Target > 70%
- **Average Resolution Time**: Target < 14 days
- **Customer Satisfaction (CSAT)**: Target > 4.5/5
- **Net Promoter Score (NPS)**: Target > 50

### Business Metrics

- **Monthly Active Users (MAU)**: Track engagement
- **Churn Rate**: Target < 5% monthly
- **Customer Acquisition Cost (CAC)**: Optimize marketing
- **Lifetime Value (LTV)**: Target LTV/CAC > 3
- **Monthly Recurring Revenue (MRR)**: Track growth

---

## 🚀 Next Steps

1. **Quality gates per phase**: lint + unit + Playwright smoke (claim create/list/detail/dashboard) + a11y/perf spot-check before closing milestones.
2. **Stripe v20 hardening**: finalize product IDs in env/`PLANS`, webhook signature verification + idempotency keys, and customer portal smoke tests.
3. **Auth/route safety**: verify protected routes (app/[locale]/(app) vs (auth)), role guards for admin/agent, and session handling.
4. **i18n robustness**: locale-safe hydration (avoid drift), translation completeness checks per release with next-intl 4.
5. **Storage/PII hygiene**: signed URLs, mime/virus validation on uploads, data classification for documents.
6. **Notifications (Novu)**: delivery observability/logs, template versioning, and channel fallback strategy.
7. **Performance budgets**: bundle-size budget, image optimization, and Lighthouse/AXE passes during Phase 4 optimization.
8. **Error monitoring**: integrate Sentry (Next.js SDK server/client, source maps, tunnel/CSP as needed) with env wiring.
9. **Database security**: enforce RLS across app tables (claims, messages, documents, subscriptions, users), role-based policies, and server-only service-role usage.

---

_Document Version: 1.1_
_Last Updated: December 13, 2025_
_Author: Gemini CLI / Arben Lila_
