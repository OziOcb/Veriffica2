---
name: "Vercel Nuxt Deployment"
description: "Use when creating or editing deployment-related configuration for Nuxt on Vercel, including Nuxt deployment settings, Vercel environment strategy, preview versus production behavior, deployment-related env files, and custom Vercel build output options."
applyTo:
  - "nuxt.config.ts"
  - "vercel.json"
  - ".vercel/**/*.json"
  - ".env.example"
  - ".env.local"
  - ".env.preview"
  - ".env.production"
---
# Vercel Nuxt Deployment Best Practices

## Scope

- Use these rules for hosting and deployment concerns specific to Nuxt on Vercel.
- Keep application runtime logic in app or server code; keep deployment config focused on environment wiring and platform behavior.

## Deployment Model

- Prefer Vercel's Git integration as the default deployment path for Nuxt because Nitro already supports Vercel with zero-config defaults.
- Treat pushes to non-production branches as preview deployments and the production branch as the only source of production deploys.
- Use preview deployments to validate risky changes without coupling them to production domains or production-only secrets.
- Do not add custom build output configuration unless a real platform requirement cannot be handled by Nuxt and Nitro defaults.

## Environment Strategy

- Keep Local, Preview, and Production environments explicit and separate.
- Assume each environment may need different URLs, Supabase credentials, SMTP settings, and feature flags.
- Keep secrets and environment variables managed through Vercel environment settings, not hardcoded in source files.
- For local development, prefer pulling environment variables with the Vercel CLI instead of manually copying production values into local files.
- Keep committed env files limited to safe templates such as `.env.example`; do not commit real secrets.

## Nuxt and Nitro on Vercel

- Let Nuxt and Nitro own the default Vercel deployment behavior unless there is a specific need for custom `nitro.vercel.config`.
- If custom Vercel build output is needed, define it through `nitro.vercel.config` in `nuxt.config.ts` so it stays versioned with app configuration.
- Keep deployment-related changes compatible with SSR and the modular monolith architecture; do not treat Vercel as a static-only host if the app depends on Nitro server routes.

## Backend and Security Considerations

- Keep server-only credentials on the server side and scoped to the appropriate Vercel environment.
- Ensure preview environments do not accidentally point at irreversible production backends unless that is an explicit and reviewed choice.
- Keep authenticated and private API responses out of public caching assumptions.
- Align deployment config with the project's security baseline, including Nuxt Security headers and protected secrets.

## Definition of Done

- Preview and production deployment behavior is explicit and branch-aware.
- Environment variables are separated by environment and managed outside source control.
- Nuxt uses Vercel zero-config behavior unless there is a justified custom override.
- Deployment configuration does not leak secrets or route preview traffic into unsafe production-only resources.