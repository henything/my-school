# My School

Internal operational web system for **Азбука движения**.

The product goal for MVP v1 is to replace scattered Excel/chat operations with one internal system for:

- branches, coaches, groups, children and parents;
- schedule and lessons;
- coach attendance workflow;
- subscriptions, lesson balances, makeups, debt and admission status;
- internal tasks instead of external notifications;
- audit log for critical actions;
- safe initial Excel import.

## Current Status

`DEV-00` is the first implementation block:

- Next.js App Router project foundation;
- PostgreSQL + Prisma schema;
- custom login/password auth with Argon2id hashes and opaque httpOnly session cookie;
- roles `SUPER_ADMIN`, `ADMIN`, `COACH`;
- admin and coach shell layouts;
- seed `SUPER_ADMIN`;
- base audit log service and backend guards.

`DEV-01` adds the first operational directories:

- branches;
- coach profiles and coach user creation;
- parent contacts without parent login;
- children with medical notes and comments;
- groups with branch and main coach;
- child attach/transfer through `current_group_id`;
- group occupancy and `GROUP_OVER_CAPACITY` internal tasks.

## Key Documents

| File | Purpose |
|---|---|
| `00_PROJECT_BRIEF_RU.md` | Product brief and v1 scope |
| `01_PRD_V1_RU.md` | PRD v1 |
| `02_BUSINESS_RULES_RU.md` | Business rules |
| `03_DOMAIN_MODEL_RU.md` | Domain model and invariants |
| `04_ROLES_AND_PERMISSIONS_RU.md` | RBAC and visibility rules |
| `05_USER_FLOWS_RU.md` | User flows |
| `06_DATA_MODEL_RU.md` | PostgreSQL/Prisma-oriented data model |
| `07_UI_SPEC_RU.md` | Admin and coach UI spec |
| `08_TASKS_AND_NOTIFICATIONS_RU.md` | Internal task system |
| `09_EXCEL_IMPORT_SPEC_RU.md` | Excel import spec |
| `10_ACCEPTANCE_CRITERIA_RU.md` | Acceptance criteria |
| `11_ROADMAP_RU.md` | Roadmap and release gates |
| `12_DEVELOPMENT_SPECS_RU.md` | Backlog-ready development specs |
| `13_TECH_STACK_DECISIONS_RU.md` | Accepted tech stack decision |
| `14_PRD_MVP2_PARENT_PORTAL_AND_PAYMENTS_RU.md` | MVP-2 spec for parent cabinet and payments |

## Accepted Stack

See `13_TECH_STACK_DECISIONS_RU.md` for the full decision.

Short version:

```text
Next.js App Router + React + TypeScript
PostgreSQL + Prisma
Custom DB-backed auth with Argon2id and opaque sessions
Tailwind CSS 3 + shadcn/ui-compatible components + Radix + lucide-react
Vitest + Playwright
Docker Compose local infra
Docker-compatible deployment + managed PostgreSQL
```

## First Implementation Block

Start with `DEV-00` in `12_DEVELOPMENT_SPECS_RU.md`:

```text
Project foundation
Auth
Roles
Admin/coach shell UI
Seed SUPER_ADMIN
AuditLogService
Backend guards
```

Do not implement the full MVP in one pass.

Continue with `DEV-01`:

```text
Branches
Coaches
Parents as contacts
Children
Groups
Group occupancy
Child transfer audit
GROUP_OVER_CAPACITY task
```

## MVP-2 Planning

Parent-facing functionality and online payments remain outside MVP v1. The first detailed MVP-2 scope is documented in `14_PRD_MVP2_PARENT_PORTAL_AND_PAYMENTS_RU.md`.

Use that document when starting parent cabinet, invoices, payment provider integration, webhook reconciliation, and parent-specific RBAC work.

## Local Setup

Requirements:

```text
Node.js 24 LTS
pnpm 11.x
Docker Desktop or another local PostgreSQL 16+ instance
```

Install dependencies:

```bash
pnpm install
```

Create local env:

```bash
cp .env.example .env
```

Start local PostgreSQL:

```bash
docker compose up -d postgres
```

Generate Prisma client, apply schema and seed the first owner:

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

Run the app:

```bash
pnpm dev
```

`pnpm dev` and `pnpm build` use Next.js Webpack mode in DEV-00 because this local macOS workspace rejects some downloaded native bindings by code signature. The app remains a standard Next.js App Router application.

Default local seed credentials:

```text
login: owner
password: ChangeMe-DEV-00!
```

## Quality Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:push` and the login flow require a reachable PostgreSQL database.
