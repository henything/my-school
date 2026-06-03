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

This repository currently contains product and engineering specifications. Implementation starts from `DEV-00` after the stack decision is accepted.

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

## Accepted Stack

See `13_TECH_STACK_DECISIONS_RU.md` for the full decision.

Short version:

```text
Next.js App Router + React + TypeScript
PostgreSQL + Prisma
Custom DB-backed auth with Argon2id and opaque sessions
Tailwind CSS + shadcn/ui + Radix + lucide-react
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
