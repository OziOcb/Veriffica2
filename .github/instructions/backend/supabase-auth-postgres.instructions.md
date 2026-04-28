---
name: "Supabase Auth Postgres"
description: "Use when creating or editing backend code or SQL related to Supabase Auth, PostgreSQL, RLS, or Supabase CLI workflows. Covers email/password auth, SSR session handling, SQL migrations, RLS policies, service-role boundaries, and relational plus JSONB data modeling for the current Supabase platform."
applyTo:
  - "server/api/**/*.ts"
  - "server/routes/**/*.ts"
  - "server/middleware/**/*.ts"
  - "server/utils/**/*.ts"
  - "supabase/**/*.sql"
  - "supabase/config.toml"
---
# Supabase Auth Postgres Best Practices

## Auth Model

- Default to Supabase Auth email and password for MVP identity flows unless a product requirement explicitly demands another provider.
- For SSR-capable app flows, use the PKCE-oriented server-side auth model and store the session in cookies rather than browser-only local storage.
- `@supabase/ssr` is the recommended Supabase package for server-side auth setup, but it is still beta, so wrap client creation behind app-local helpers and avoid spreading unstable setup details across the codebase.
- Keep auth session handling independent from offline inspection state so reconnect and token refresh do not risk local data loss.
- Use a custom SMTP provider for production email flows; treat the default hosted mail sender as development-only.

## Server-Side Boundaries

- Never expose service-role keys or privileged database credentials to the browser.
- Use publishable keys only in client-safe contexts and keep privileged operations inside server handlers or secure backend jobs.
- Perform ownership checks, account deletion, inspection deletion, and business-limit enforcement on the server even when RLS also exists.

## Database Modeling and Migrations

- Prefer SQL migrations through the Supabase CLI over manual dashboard-only schema changes.
- Commit the `supabase/` directory to source control so schema, config, and local development behavior stay reproducible.
- Use a relational core for ownership and account-scoped records, and use JSONB only where snapshot-style domain payloads intentionally reduce join complexity.
- Keep inspection sync aligned with the architecture document: one inspection record plus a versioned snapshot payload, not a custom event log.
- Generate and use database types instead of hand-maintaining duplicate row types when database access enters the codebase.

## RLS and Authorization

- Enable RLS on every table that lives in an exposed schema.
- Create explicit policies for `select`, `insert`, `update`, and `delete` instead of relying on accidental defaults.
- Use `TO authenticated` or `TO anon` deliberately in policies; do not let ownership expressions run for the wrong role set.
- When a policy depends on the signed-in user, prefer explicit checks such as `auth.uid() IS NOT NULL` and compare against ownership columns.
- Remember that `update` behavior also depends on a matching `select` policy.
- Keep authorization claims in `raw_app_meta_data`, not `raw_user_meta_data`, because user metadata is user-editable.
- If policies rely on `auth.jwt()`, remember that JWT claims are not instantly refreshed.
- Put `security definer` functions in a private, unexposed schema and use them sparingly for privileged checks or performance-sensitive policy helpers.
- Add indexes for columns used in policies, wrap stable helper calls in `select`, and avoid unnecessary joins in RLS expressions.

## CLI and Local Development

- Use the Supabase CLI for local stack startup, schema diffs, dumps, and migrations.
- When using the CLI through Node tooling, keep Node.js at 20+; global `npm install -g supabase` is not supported.
- Use local Mailpit and local Supabase services for auth-flow verification rather than mocking email delivery behavior.
- Keep local and CI workflows deterministic by treating the CLI, migrations, and config as part of the repository, not local machine state.

## Definition of Done

- Auth flows keep server sessions in SSR-safe cookies and never expose privileged secrets.
- All exposed tables have explicit RLS and role-aware policies.
- Critical business rules are enforced by server code and, when appropriate, SQL transactions or functions.
- Schema changes are expressed as committed SQL migrations.
- Data modeling stays consistent with relational ownership plus intentional JSONB snapshots.