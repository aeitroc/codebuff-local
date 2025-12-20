# Data Model Doc Generation Context

Date: 2025-12-19
Task: data-model-docs

## Discovery Results

### Database technology detection
- Drizzle ORM + drizzle-kit with PostgreSQL.
- Schema source: `packages/internal/src/db/schema.ts`.
- Drizzle config: `packages/internal/src/db/drizzle.config.ts`.
- SQL migrations present in `packages/internal/src/db/migrations/*.sql` (no Prisma/TypeORM/Sequelize/Mongoose/Django/SQLAlchemy).

### Backend framework detection
- Next.js App Router in `web/src/app` with route handlers under `web/src/app/api/**/route.ts`.
- NextAuth used for auth (`web/src/app/api/auth/[...nextauth]/auth-options.ts`).
- No Express/NestJS/FastAPI/Django code detected.

### Frontend state management detection
- React Query v5 (`@tanstack/react-query`) in hooks and pages.
- Zustand stores (e.g. `web/src/hooks/use-install-dialog.ts`, `web/src/app/store/store-client.tsx`).
- React Context providers (`web/src/lib/PostHogProvider.tsx`, `web/src/components/ui/sidebar.tsx`).
- No Redux/MobX/Jotai usage detected.

### Service layer patterns
- Repository-like DB access helpers in `web/src/db/*.ts` (Drizzle queries).
- Service logic in `packages/billing/src/*` and `web/src/lib/server/*`.
- Controller pattern via Next.js route handlers in `web/src/app/api/**/route.ts`.
- No explicit `*.service.ts` or `*.repository.ts` files detected.

## Key Files Reviewed
- `packages/internal/src/db/schema.ts`
- `packages/internal/src/db/drizzle.config.ts`
- `packages/internal/src/db/index.ts`
- `common/src/types/contracts/database.ts`
- `common/src/types/contracts/billing.ts`
- `common/src/types/organization.ts`
- `common/src/types/publisher.ts`
- `common/src/types/api/agents/publish.ts`
- `common/src/types/session-state.ts`
- `common/src/types/agent-template.ts`
- `packages/billing/src/balance-calculator.ts`
- `packages/billing/src/usage-service.ts`
- `packages/billing/src/auto-topup.ts`
- `packages/billing/src/credit-delegation.ts`
- `packages/billing/src/org-monitoring.ts`
- `web/src/types/user.ts`
- `web/src/hooks/use-organization-data.ts`
- `web/src/hooks/use-user-profile.ts`
- `web/src/hooks/use-install-dialog.ts`
- `web/src/app/store/store-client.tsx`
- `web/src/components/auto-topup/types.ts`
- `web/src/app/api/user/profile/route.ts`
- `web/src/app/api/referrals/route.ts`
- `web/src/app/api/v1/_helpers.ts`
- `cli/src/types/chat.ts`

