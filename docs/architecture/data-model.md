# Data Model Documentation
> Generated on: 2025-12-19
> Project: Codebuff (codebuff-project)
> Tech Stack: Bun workspaces, Next.js 15 (App Router), NextAuth (DrizzleAdapter), PostgreSQL, Drizzle ORM + drizzle-kit, Postgres.js, Zod v4, Stripe, @tanstack/react-query v5, Zustand

## Table of Contents
1. Database Schema ERD
2. Service Layer Models
3. UI Data Structures
4. End-to-End Data Flow
5. Data Validation Strategy
6. Notes and Considerations

---

## 1. Database Schema ERD

### Overview
- Primary database: PostgreSQL
- ORM and migrations: Drizzle ORM + drizzle-kit
- Schema source: `packages/internal/src/db/schema.ts`
- SQL migrations: `packages/internal/src/db/migrations/*.sql`

### Entity Relationship Diagram
```mermaid
erDiagram
  user ||--o{ account : has
  user ||--o{ session : has
  fingerprint ||--o{ session : ties
  user ||--o{ encrypted_api_keys : stores
  user ||--o{ credit_ledger : grants
  org ||--o{ credit_ledger : org_grants
  user ||--o{ referral : referrer
  user ||--o{ referral : referred
  user ||--o{ org : owns
  org ||--o{ org_member : members
  user ||--o{ org_member : membership
  org ||--o{ org_repo : repos
  user ||--o{ org_repo : approved_by
  org ||--o{ org_invite : invites
  user ||--o{ org_invite : invited_by
  user ||--o{ org_invite : accepted_by
  org ||--o{ org_feature : features
  user ||--o{ publisher : owns_user
  org ||--o{ publisher : owns_org
  user ||--o{ publisher : created_by
  publisher ||--o{ agent_config : publishes
  user ||--o{ agent_run : runs
  agent_run ||--o{ agent_step : steps
  user ||--o{ message : produces
  org ||--o{ message : billed

  user {
    text id PK
    text name
    text email UK
    text password
    timestamp emailVerified
    text image
    text stripe_customer_id UK
    text stripe_price_id
    timestamp next_quota_reset
    timestamp created_at
    text referral_code UK
    int referral_limit
    text discord_id UK
    text handle UK
    boolean auto_topup_enabled
    int auto_topup_threshold
    int auto_topup_amount
    boolean banned
  }
  account {
    text userId FK
    text type
    text provider PK
    text providerAccountId PK
    text refresh_token
    text access_token
    int expires_at
    text token_type
    text scope
    text id_token
    text session_state
  }
  session {
    text sessionToken PK
    text userId FK
    timestamp expires
    text fingerprint_id FK
    session_type type
  }
  fingerprint {
    text id PK
    text sig_hash
    timestamp created_at
  }
  verificationToken {
    text identifier PK
    text token PK
    timestamp expires
  }
  encrypted_api_keys {
    text user_id PK FK
    api_key_type type PK
    text api_key
  }
  credit_ledger {
    text operation_id PK
    text user_id FK
    bigint principal
    bigint balance
    grant_type type
    text description
    int priority
    timestamptz expires_at
    timestamptz created_at
    text org_id FK
  }
  referral {
    text referrer_id PK FK
    text referred_id PK FK
    referral_status status
    int credits
    timestamp created_at
    timestamp completed_at
  }
  sync_failure {
    text id PK
    text provider
    timestamptz created_at
    timestamptz last_attempt_at
    int retry_count
    text last_error
  }
  org {
    text id PK
    text name
    text slug UK
    text description
    text owner_id FK
    text stripe_customer_id UK
    text stripe_subscription_id
    timestamptz current_period_start
    timestamptz current_period_end
    boolean auto_topup_enabled
    int auto_topup_threshold
    int auto_topup_amount
    int credit_limit
    boolean billing_alerts
    boolean usage_alerts
    boolean weekly_reports
    timestamptz created_at
    timestamptz updated_at
  }
  org_member {
    text org_id PK FK
    text user_id PK FK
    org_role role
    timestamptz joined_at
  }
  org_repo {
    text id PK
    text org_id FK
    text repo_url
    text repo_name
    text repo_owner
    text approved_by FK
    timestamptz approved_at
    boolean is_active
  }
  org_invite {
    text id PK
    text org_id FK
    text email
    org_role role
    text token UK
    text invited_by FK
    timestamptz expires_at
    timestamptz created_at
    timestamptz accepted_at
    text accepted_by FK
  }
  org_feature {
    text org_id PK FK
    text feature PK
    jsonb config
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  git_eval_results {
    text id PK
    text cost_mode
    text reasoner_model
    text agent_model
    jsonb metadata
    int cost
    boolean is_public
    timestamptz created_at
  }
  publisher {
    text id PK
    text name
    text email
    boolean verified
    text bio
    text avatar_url
    text user_id FK
    text org_id FK
    text created_by FK
    timestamptz created_at
    timestamptz updated_at
  }
  agent_config {
    text publisher_id PK FK
    text id PK
    text version PK
    int major "generated"
    int minor "generated"
    int patch "generated"
    jsonb data
    timestamptz created_at
    timestamptz updated_at
  }
  agent_run {
    text id PK
    text user_id FK
    text agent_id
    text publisher_id "generated"
    text agent_name "generated"
    text agent_version "generated"
    text[] ancestor_run_ids
    text root_run_id "generated"
    text parent_run_id "generated"
    int depth "generated"
    int duration_ms "generated"
    int total_steps
    numeric direct_credits
    numeric total_credits
    agent_run_status status
    text error_message
    timestamptz created_at
    timestamptz completed_at
  }
  agent_step {
    text id PK
    text agent_run_id FK
    int step_number
    int duration_ms "generated"
    numeric credits
    text[] child_run_ids
    int spawned_count "generated"
    text message_id
    agent_step_status status
    text error_message
    timestamptz created_at
    timestamptz completed_at
  }
  message {
    text id PK
    timestamp finished_at
    text client_id
    text client_request_id
    text model
    text agent_id
    jsonb request
    jsonb last_message "generated"
    text reasoning_text
    jsonb response
    int input_tokens
    int cache_creation_input_tokens
    int cache_read_input_tokens
    int reasoning_tokens
    int output_tokens
    numeric cost
    int credits
    boolean byok
    int latency_ms
    text user_id FK
    text org_id FK
    text repo_url
  }
```

### Enumerations
- `referral_status`: `pending | completed`
- `agent_run_status`: `running | completed | failed | cancelled`
- `agent_step_status`: `running | completed | skipped`
- `api_key_type`: `anthropic | gemini | openai`
- `grant_type`: `free | referral | purchase | admin | organization`
- `org_role`: `owner | admin | member`
- `session_type`: `web | pat | cli`

### Table Definitions
#### user
- Purpose/Columns: user identity, auth, billing settings; `id` (TEXT, PK, default uuid), `name`, `email` (UNIQUE, NOT NULL), `password`, `emailVerified`, `image`, `stripe_customer_id` (UNIQUE), `stripe_price_id`, `next_quota_reset` (default now + 1 month), `created_at` (default now), `referral_code` (UNIQUE, default `ref-<uuid>`), `referral_limit` (default 5), `discord_id` (UNIQUE), `handle` (UNIQUE), `auto_topup_enabled` (default false), `auto_topup_threshold`, `auto_topup_amount`, `banned` (default false)
- Indexes: unique `email`, `stripe_customer_id`, `referral_code`, `discord_id`, `handle`
#### account
- Purpose/Columns: NextAuth provider accounts; `userId` (FK → user.id), `type`, `provider` (PK), `providerAccountId` (PK), tokens and metadata
- Indexes/FKs: composite PK `(provider, providerAccountId)`; `userId → user.id` (cascade)
#### session
- Purpose/Columns: web, CLI, PAT sessions; `sessionToken` (PK), `userId` (FK), `expires`, `fingerprint_id` (FK), `type` (session_type)
- FKs: `userId → user.id`, `fingerprint_id → fingerprint.id`
#### fingerprint
- Purpose/Columns: CLI device identity; `id` (PK), `sig_hash`, `created_at`
#### verificationToken
- Purpose/Columns: NextAuth verification tokens; `identifier` (PK), `token` (PK), `expires`
#### encrypted_api_keys
- Purpose/Columns: BYOK provider keys; `user_id` (PK, FK), `type` (PK), `api_key`
#### credit_ledger
- Purpose/Columns: credit grants and balances; `operation_id` (PK), `user_id` (FK), `principal`, `balance`, `type`, `description`, `priority`, `expires_at`, `created_at`, `org_id` (FK)
- Indexes: `idx_credit_ledger_active_balance` partial, `idx_credit_ledger_org`
#### sync_failure
- Purpose/Columns: billing sync failures; `id` (PK), `provider`, `created_at`, `last_attempt_at`, `retry_count`, `last_error`
- Indexes: `idx_sync_failure_retry` partial (`retry_count < 5`)
#### referral
- Purpose/Columns: referral relationships; `referrer_id` (PK, FK), `referred_id` (PK, FK), `status`, `credits`, `created_at`, `completed_at`
#### message
- Purpose/Columns: LLM audit and billing fact; `id` (PK), `finished_at`, `client_id`, `client_request_id`, `model`, `agent_id`, `request` (JSONB), `last_message` (generated), `reasoning_text`, `response` (JSONB), token counts, `cost`, `credits`, `byok`, `latency_ms`, `user_id` (FK), `org_id` (FK), `repo_url`
- Indexes: `message_user_id_idx`, `message_finished_at_user_id_idx`, `message_org_id_idx`, `message_org_id_finished_at_idx`
#### org
- Purpose/Columns: org accounts and billing settings; `id` (PK), `name`, `slug` (UNIQUE), `description`, `owner_id` (FK), Stripe fields, auto-topup fields, `credit_limit`, alert flags, `created_at`, `updated_at`
#### org_member
- Purpose/Columns: membership; `org_id` (PK, FK), `user_id` (PK, FK), `role`, `joined_at`
#### org_repo
- Purpose/Columns: org repositories; `id` (PK), `org_id` (FK), `repo_url`, `repo_name`, `repo_owner`, `approved_by` (FK), `approved_at`, `is_active`
- Indexes: `idx_org_repo_active`, `idx_org_repo_unique` (index only)
#### org_invite
- Purpose/Columns: invitations; `id` (PK), `org_id` (FK), `email`, `role`, `token` (UNIQUE), `invited_by` (FK), `expires_at`, `created_at`, `accepted_at`, `accepted_by` (FK)
- Indexes: `idx_org_invite_token`, `idx_org_invite_email`, `idx_org_invite_expires`
#### org_feature
- Purpose/Columns: feature flags; `org_id` (PK, FK), `feature` (PK), `config` (JSONB), `is_active`, `created_at`, `updated_at`
- Indexes: `idx_org_feature_active`
#### git_eval_results
- Purpose/Columns: eval metadata; `id` (PK), `cost_mode`, `reasoner_model`, `agent_model`, `metadata` (JSONB), `cost` (default 0), `is_public` (default false), `created_at`
#### publisher
- Purpose/Columns: agent publishers; `id` (PK), `name`, `email`, `verified`, `bio`, `avatar_url`, `user_id` (FK), `org_id` (FK), `created_by` (FK), `created_at`, `updated_at`
- Constraints: `publisher_single_owner` check
#### agent_config
- Purpose/Columns: versioned agent definitions; `publisher_id` (PK, FK), `id` (PK), `version` (PK), `major`/`minor`/`patch` (generated), `data` (JSONB), `created_at`, `updated_at`
- Indexes: `idx_agent_config_publisher`
#### agent_run
- Purpose/Columns: agent executions; `id` (PK), `user_id` (FK), `agent_id`, generated `publisher_id`/`agent_name`/`agent_version`, `ancestor_run_ids` (TEXT[]), generated `root_run_id`/`parent_run_id`/`depth`/`duration_ms`, `total_steps`, `direct_credits`, `total_credits`, `status`, `error_message`, `created_at`, `completed_at`
- Indexes: `idx_agent_run_user_id`, `idx_agent_run_parent`, `idx_agent_run_root`, `idx_agent_run_agent_id`, `idx_agent_run_publisher`, `idx_agent_run_status` partial, `idx_agent_run_ancestors_gin`, plus completed-run indexes
#### agent_step
- Purpose/Columns: per-step tracking; `id` (PK), `agent_run_id` (FK), `step_number`, generated `duration_ms`, `credits`, `child_run_ids` (TEXT[]), generated `spawned_count`, `message_id`, `status`, `error_message`, `created_at`, `completed_at`
- Indexes: `unique_step_number_per_run`, `idx_agent_step_run_id`, `idx_agent_step_children_gin`

---

## 2. Service Layer Models

### Overview
- Controllers: Next.js route handlers in `web/src/app/api/**/route.ts`
- Repositories: Drizzle helpers in `web/src/db/*.ts`
- Services: billing and org logic in `packages/billing/src/*` and `web/src/lib/server/*`

### Data Transfer Objects (DTOs)

**Publisher DTOs** (`common/src/types/publisher.ts`)
```ts
type CreatePublisherRequest = { id: string, name: string, email?: string, bio?: string, avatar_url?: string, org_id?: string }
type UpdatePublisherRequest = { name?: string, email?: string, bio?: string, avatar_url?: string }
type PublisherProfileResponse = { id: string, user_id: string | null, org_id: string | null, created_by: string, name: string, email: string | null, verified: boolean, bio: string | null, avatar_url: string | null, created_at: Date, updated_at: Date, agentCount?: number, ownershipType: 'user' | 'organization', organizationName?: string }
```
Validation rules: `PublisherIdSchema` restricts characters; additional rules enforce length 3-30 and no leading/trailing hyphen; `PublisherSchema` enforces required name and valid email/URL formats.

**Organization DTOs** (`common/src/types/organization.ts`)
```ts
type CreateOrganizationRequest = { name: string, slug?: string, description?: string }
type InviteMemberRequest = { email: string, role: 'admin' | 'member' }
type UpdateMemberRoleRequest = { role: 'admin' | 'member' }
type AddRepositoryRequest = { repository_url: string, repository_name: string }
type OrganizationDetailsResponse = { id: string, name: string, slug: string, description?: string, userRole: 'owner' | 'admin' | 'member', memberCount: number, repositoryCount: number, creditBalance: number, hasStripeSubscription?: boolean, stripeSubscriptionId?: string }
type OrganizationUsageResponse = { currentBalance: number, usageThisCycle: number, cycleStartDate: string, cycleEndDate: string, topUsers: Array<{ user_id: string, user_name: string, user_email: string, credits_used: number }>, recentUsage: Array<{ date: string, credits_used: number, repository_url: string, user_name: string }> }
```
Validation rules: roles constrained to `owner | admin | member`; `org.slug` uniqueness enforced by DB.

**Agent publish DTOs** (`common/src/types/api/agents/publish.ts`)
```ts
type PublishAgentsRequest = { data: Array<Record<string, any>>, allLocalAgentIds?: string[], authToken?: string }
type PublishAgentsResponse =
  | { success: true, publisherId: string, agents: Array<{ id: string, version: string, displayName: string }> }
  | { success: false, error: string, details?: string, hint?: string, availablePublishers?: Array<{ id: string, name: string, ownershipType: 'user' | 'organization', organizationName?: string }>, validationErrors?: Array<{ code: string, message: string, path: string[] }> }
```
Validation rules: `data` validated by Zod agent definition schemas (`common/src/types/dynamic-agent-template.ts`).

**Usage and billing DTOs** (`common/src/types/usage.ts`, `packages/billing/src/usage-service.ts`)
```ts
type UsageData = { usageThisCycle: number, balance: { totalRemaining: number, totalDebt: number, netBalance: number, breakdown: Record<string, number> }, nextQuotaReset: Date | null }
type UserUsageData = { usageThisCycle: number, balance: CreditBalance, nextQuotaReset: string, autoTopupTriggered?: boolean, autoTopupEnabled?: boolean }
type OrganizationUsageData = { currentBalance: number, usageThisCycle: number, cycleStartDate: string, cycleEndDate: string, topUsers: Array<{ user_id: string, user_name: string, user_email: string, credits_used: number }>, recentUsage: Array<{ date: string, credits_used: number, repository_url: string, user_name: string }> }
```
Validation rules: usage schema uses Zod; `nextQuotaReset` coerced to date or null.

**Referrals DTOs** (`web/src/app/api/referrals/route.ts`)
```ts
type Referral = { id: string, name: string, email: string, credits: number }
type ReferralData = { referralCode: string, referrals: Referral[], referredBy?: Referral, referralLimit: number }
```
Validation rules: referral entries are Zod-validated (`email` format, `credits` number coercion).

**Agent run DTOs** (`common/src/types/contracts/database.ts`)
```ts
type GetUserInfoFromApiKeyInput<T extends 'id' | 'email' | 'discord_id' | 'referral_code' | 'banned'> = { apiKey: string, fields: readonly T[] }
type StartAgentRunInput = { apiKey: string, userId?: string, agentId: string, ancestorRunIds: string[] }
type FinishAgentRunInput = { apiKey: string, userId: string | undefined, runId: string, status: 'completed' | 'failed' | 'cancelled', totalSteps: number, directCredits: number, totalCredits: number, errorMessage?: string }
type AddAgentStepInput = { apiKey: string, userId: string | undefined, agentRunId: string, stepNumber: number, credits?: number, childRunIds?: string[], messageId: string | null, status?: 'running' | 'completed' | 'skipped', errorMessage?: string, startTime: Date }
```

### Domain Models and Business Logic Structures

**Agent templates and runtime** (`common/src/types/agent-template.ts`, `common/src/types/session-state.ts`)
```ts
type AgentTemplate = { id: string, displayName: string, model: string, toolNames: string[], spawnableAgents: string[], systemPrompt: string, instructionsPrompt: string, stepPrompt: string, outputMode: 'last_message' | 'all_messages' | 'structured_output' }
type DynamicAgentDefinition = { id: string, displayName: string, model: string, toolNames?: string[], spawnableAgents?: string[], inputSchema?: { prompt?: { type: 'string' }, params?: { type: 'object', properties?: Record<string, unknown> } }, outputMode?: 'last_message' | 'all_messages' | 'structured_output' }
type AgentState = { agentId: string, agentType: string | null, ancestorRunIds: string[], runId?: string, messageHistory: unknown[], stepsRemaining: number, creditsUsed: number, directCreditsUsed: number, systemPrompt: string }
```

**Billing models** (`packages/billing/src/balance-calculator.ts`, `packages/billing/src/credit-delegation.ts`)
```ts
type CreditBalance = { totalRemaining: number, totalDebt: number, netBalance: number, breakdown: Record<'free' | 'referral' | 'purchase' | 'admin' | 'organization', number>, principals: Record<'free' | 'referral' | 'purchase' | 'admin' | 'organization', number> }
type CreditConsumptionResult = { consumed: number, fromPurchased: number }
type CreditDelegationResult = { success: boolean, organizationId?: string, organizationName?: string, organizationSlug?: string, error?: string }
type OrganizationAlert = { id: string, type: 'low_balance' | 'high_usage' | 'auto_topup_failed' | 'credit_limit_reached', severity: 'info' | 'warning' | 'critical', title: string, message: string, timestamp: Date }
```

---

## 3. UI Data Structures

### Overview
- Web UI: Next.js App Router + React Query + Zustand
- CLI UI: React/OpenTUI + Zustand

### Web component props and UI schemas

**User profile** (`web/src/types/user.ts`)
```ts
type UserProfile = { id: string, name: string | null, email: string, image: string | null, stripe_customer_id: string | null, stripe_price_id: string | null, handle: string | null, referral_code: string | null, auto_topup_enabled: boolean, auto_topup_threshold: number | null, auto_topup_amount: number | null, auto_topup_blocked_reason: string | null, created_at: Date | null }
```

**Organization data** (`web/src/hooks/use-organization-data.ts`)
```ts
type OrganizationDetails = { id: string, name: string, slug: string, description?: string, owner_id: string, created_at: string, userRole: 'owner' | 'admin' | 'member', memberCount: number, repositoryCount: number, creditBalance: number, hasStripeSubscription: boolean, stripeSubscriptionId?: string }
type BillingStatus = { is_setup: boolean, stripe_customer_id?: string, billing_portal_url?: string, user_role: string }
```

**Auto top-up UI contracts** (`web/src/components/auto-topup/types.ts`)
```ts
type AutoTopupState = { isEnabled: boolean, threshold: number, topUpAmountDollars: number, isLoadingProfile: boolean, isPending: boolean, userProfile: UserProfile | null, handleToggleAutoTopup: (checked: boolean) => void, handleThresholdChange: (value: number) => void, handleTopUpAmountChange: (value: number) => void }
type AutoTopupSwitchProps = { isEnabled: boolean, onToggle: (checked: boolean) => void, isPending: boolean, autoTopupBlockedReason: string | null }
```

**Agent store UI state** (`web/src/app/store/store-client.tsx`)
```ts
type AgentData = { id: string, name: string, description?: string, publisher: { id: string, name: string, verified: boolean, avatar_url?: string | null }, version: string, created_at: string, usage_count?: number, weekly_runs?: number, weekly_spent?: number, total_spent?: number, avg_cost_per_invocation?: number, unique_users?: number, last_used?: string, version_stats?: Record<string, any>, tags?: string[] }
type AgentStoreState = { displayedCount: number, isLoadingMore: boolean, hasMore: boolean, searchQuery: string, sortBy: string, setDisplayedCount: (count: number) => void, setIsLoadingMore: (loading: boolean) => void, setHasMore: (hasMore: boolean) => void, setSearchQuery: (query: string) => void, setSortBy: (sortBy: string) => void }
```

**Install dialog store** (`web/src/hooks/use-install-dialog.ts`)
```ts
type InstallDialogStore = { isOpen: boolean, open: () => void, close: () => void, toggle: () => void }
```

**API key list response** (`web/src/app/profile/components/api-keys-section.tsx`)
```ts
type ApiKeyListResponse = { tokens: Array<{ id: string, token: string, expires?: string, createdAt?: string, type: 'pat' | 'cli' }> }
```

### CLI message tree structures
**Content blocks** (`cli/src/types/chat.ts`)
```ts
type ContentBlock =
  | { type: 'text', content: string, textType?: 'reasoning' | 'text' }
  | { type: 'tool', toolCallId: string, toolName: string, input: unknown, output?: string }
  | { type: 'agent', agentId: string, agentType: string, status: 'running' | 'complete' | 'failed', blocks?: ContentBlock[] }
  | { type: 'ask-user', toolCallId: string, questions: Array<{ question: string, options: Array<{ label: string }> }> }
  | { type: 'image', image: string, mediaType: string }
```

### State management patterns
- React Query cache keys: `user-profile`, `organization`, `billing-status`, `agents`, `personal-access-tokens`
- Zustand: dialog state and store pagination filters
- Context: PostHog analytics and sidebar state

---

## 4. End-to-End Data Flow

### Overview
Two primary clients (Web and CLI) access the same Next.js backend and PostgreSQL database.

```mermaid
flowchart TD
  subgraph Clients
    WEB[Web UI]
    CLI[CLI TUI]
  end
  subgraph API[Next.js API Routes]
    AUTH[Auth & Sessions]
    ORGS[Organizations & Publishers]
    BILL[Billing & Usage]
    RUNS[Agent Runs]
    PUB[Agent Publish]
    LLMAPI[Chat Completions]
  end
  subgraph Services
    DBLAYER[@codebuff/internal/db]
    BILLPKG[@codebuff/billing]
    AGENTVAL[Agent validation]
    STRIPE[Stripe API]
    LLM[OpenRouter/OpenAI compatible]
  end
  DB[(PostgreSQL)]
  WEB --> API
  CLI --> API
  AUTH --> DBLAYER --> DB
  ORGS --> DBLAYER --> DB
  PUB --> AGENTVAL --> DBLAYER
  RUNS --> DBLAYER
  BILL --> BILLPKG --> DBLAYER
  LLMAPI --> BILLPKG
  LLMAPI --> LLM
  BILL --> STRIPE
  ORGS --> STRIPE
```

### Example Flow: User profile + auto top-up settings
1. `GET /api/user/profile` reads `user` and validates auto-topup status.
2. UI renders `UserProfile` and auto-topup state.
3. `POST /api/user/auto-topup` validates ranges and updates `user.auto_topup_*`.

### Example Flow: Agent run with billing
1. `POST /api/v1/agent-runs` inserts `agent_run` (`status = running`).
2. `POST /api/v1/chat/completions` checks credits, calls LLM provider.
3. Billing updates `credit_ledger` and inserts `message` with usage metrics.
4. `POST /api/v1/agent-runs/:runId/steps` inserts `agent_step` rows.
5. Finish request updates `agent_run` totals and status.

### Example Flow: Publish an agent
1. `POST /api/agents/publish` validates agent definitions.
2. Ownership checks use `publisher` + `org_member`.
3. Inserts versioned `agent_config` rows.

---

## 5. Data Validation Strategy
- Client: publisher ID/name checks, auto-topup bounds, component prop typing
- Server: Zod schemas for request DTOs and agent definitions
- Database: PK/FK/unique constraints, generated columns, partial and GIN indexes

---

## 6. Notes and Considerations
### Performance
- `message` is append-heavy; indexes optimize user/org + time range queries
- `credit_ledger` partial index speeds up active balance lookups
- `agent_run` and `agent_step` use GIN indexes for array queries
### Security
- Sessions and PATs stored in `session.sessionToken`
- BYOK provider keys stored in `encrypted_api_keys`
- Billing and Stripe interactions isolated in `@codebuff/billing` and server routes
### Future enhancements
- Add automated doc generation if schema changes frequently
- Extend CLI UI schema coverage as features evolve

