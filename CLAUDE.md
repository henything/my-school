# Азбука движения

This project is the internal operations app for "Азбука движения".
Do not reintroduce the previous product name in user-facing copy or project documentation unless explicitly discussing historical migration context.

## Project pipeline

Use this shorthand when the user asks for the agreed workflow:

- `pipeline: <raw task>` means refine the raw request into a clear spec, ask blocking questions, implement after the spec is clear, run QA, then stop for user local testing.
- `bug pipeline: <symptom>` means investigate the root cause first, then implement and QA the fix.
- `аппрув, шипи` means the user has tested locally and accepts the change. Run the ship and deploy flow, verify production, then push changes to GitHub.

Default sequence:

1. Clarify and specify with `/spec` when the task is vague or product-facing.
2. Implement with the appropriate development skill or normal repo workflow.
3. Test with `/qa` or `/qa-only` depending on whether fixes are allowed during QA.
4. Wait for the user's local acceptance.
5. After explicit acceptance, use `/ship` and `/land-and-deploy`.
6. After production verification, push the final changes to GitHub.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming -> invoke `/office-hours`
- Strategy/scope -> invoke `/plan-ceo-review`
- Architecture -> invoke `/plan-eng-review`
- Design system/plan review -> invoke `/design-consultation` or `/plan-design-review`
- Full review pipeline -> invoke `/autoplan`
- Bugs/errors -> invoke `/investigate`
- QA/testing site behavior -> invoke `/qa` or `/qa-only`
- Code review/diff check -> invoke `/review`
- Visual polish -> invoke `/design-review`
- Ship/deploy/PR -> invoke `/ship` or `/land-and-deploy`
- Save progress -> invoke `/context-save`
- Resume context -> invoke `/context-restore`
- Author a backlog-ready spec/issue -> invoke `/spec`

## Deploy Configuration (configured by /setup-deploy)

- Platform: Custom VDS, nginx reverse proxy, systemd service, Next.js app
- Production URL: https://azbukadvizheniya.ru
- Deploy workflow: Manual SSH deploy to `azbuka-prod`
- Deploy status command: `ssh azbuka-prod 'azbuka-dvizheniya-status'`
- Merge method: squash
- Project type: web app
- Post-deploy health check: `curl -sf https://azbukadvizheniya.ru/login -o /dev/null -w "%{http_code}"`

### Custom deploy hooks

- Pre-merge: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Deploy trigger: manual SSH sync/build/migrate/restart on `azbuka-prod`
- Deploy status: `ssh azbuka-prod 'azbuka-dvizheniya-status'`
- Health check: `https://azbukadvizheniya.ru/login`

Production runtime facts:

- App directory: `/var/www/azbuka-dvizheniya`
- Server status helper: `/usr/local/bin/azbuka-dvizheniya-status`
- Server restart helper: `/usr/local/bin/azbuka-dvizheniya-restart`
- Nginx proxies `azbukadvizheniya.ru` to `127.0.0.1:3000`
- Production environment variables live only on the server. Never commit or print secrets.

Manual deploy runbook:

1. From repo root, sync source to production:

   ```bash
   rsync -az --delete \
     --exclude='.git/' \
     --exclude='node_modules/' \
     --exclude='.next/' \
     --exclude='.env' \
     --exclude='.cache/' \
     --exclude='.config/' \
     --exclude='.local/' \
     --exclude='.local-backups/' \
     --exclude='.gstack/' \
     --exclude='test-results/' \
     --exclude='tsconfig.tsbuildinfo' \
     --exclude='.DS_Store' \
     --rsync-path='sudo -u $(stat -c %U $(readlink -f /var/www/azbuka-dvizheniya)) /usr/bin/rsync' \
     ./ azbuka-prod:/var/www/azbuka-dvizheniya/
   ```

2. Install dependencies and build on the server:

   ```bash
   ssh azbuka-prod 'APP_DIR=/var/www/azbuka-dvizheniya; APP_USER=$(stat -c %U $(readlink -f "$APP_DIR")); cd "$APP_DIR" && sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm install --frozen-lockfile && sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm build'
   ```

3. Back up the production database before migrations:

   ```bash
   ssh azbuka-prod 'APP_DIR=/var/www/azbuka-dvizheniya; set -a; . "$APP_DIR/.env"; set +a; mkdir -p /var/backups/azbuka-dvizheniya; DB_URL="${DATABASE_URL%%\?schema=*}"; pg_dump "$DB_URL" -Fc -f "/var/backups/azbuka-dvizheniya/db-before-deploy-$(date +%Y%m%d_%H%M%S).dump"'
   ```

4. Apply migrations and restart:

   ```bash
   ssh azbuka-prod 'APP_DIR=/var/www/azbuka-dvizheniya; APP_USER=$(stat -c %U $(readlink -f "$APP_DIR")); cd "$APP_DIR" && sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm exec prisma migrate deploy && azbuka-dvizheniya-restart'
   ```

5. Verify production:

   ```bash
   ssh azbuka-prod 'azbuka-dvizheniya-status'
   curl -sf https://azbukadvizheniya.ru/login -o /dev/null -w "%{http_code}"
   ```
