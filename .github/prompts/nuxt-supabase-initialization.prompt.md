---
name: nuxt-supabase-initialization
description: Prompt for installing the @nuxtjs/supabase module in this Nuxt 4 repository
---

# Nuxt Supabase Initialization

This document provides a reproducible guide to install `@nuxtjs/supabase` in this repository.

## Prerequisites

- The project must use Nuxt 4 and `pnpm`.
- `package.json` and `nuxt.config.ts` must exist.
- `supabase/config.toml` must exist.
- `.env` must remain untracked and `.env.example` may be committed.
- `@nuxtjs/supabase` must not already be declared in `package.json` or `nuxt.config.ts`.
- If typed Supabase clients should be enabled immediately, you must have either:
  - a local Supabase stack available through the Supabase CLI, or
  - a remote Supabase project ref that can be used to generate types.

IMPORTANT: Check prerequisites before performing the actions below. If they are not met, stop and ask the user to fix them.

## File Structure and Setup

### 1. Install the Nuxt module

Prefer the official installer adapted to `pnpm`:

```bash
pnpm dlx nuxi@latest module add supabase
```

If that command cannot update the project automatically, fall back to:

```bash
pnpm add @nuxtjs/supabase
```

This package belongs in `dependencies`, not `devDependencies`.

### 2. Register the module in `nuxt.config.ts`

Ensure `@nuxtjs/supabase` is present exactly once in the `modules` array.

Add a minimal `supabase` config block if the file does not already define one:

```ts
export default defineNuxtConfig({
  modules: [
    // existing modules
    '@nuxtjs/supabase',
  ],

  supabase: {
    // Keep runtime values in environment variables.
    // Enable this path only when real generated types exist.
    types: './app/types/database.types.ts',
  },
})
```

If `app/types/database.types.ts` does not exist yet and you cannot generate it in the same task, use:

```ts
supabase: {
  types: false,
}
```

and tell the user that typed database clients still need to be generated.

Do not hardcode Supabase URLs or keys in source code. Keep `nuxt.config.ts` minimal and preserve the repository's existing formatting style.

### 3. Create or update `.env.example`

Create `.env.example` if it is missing, or merge the keys below into it:

```env
NUXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NUXT_PUBLIC_SUPABASE_KEY="your_publishable_key"
# Optional, server-only:
NUXT_SUPABASE_SECRET_KEY="your_secret_key"
```

Rules:

- Never commit a real secret or publishable key.
- Prefer the `NUXT_`-prefixed variables over the legacy `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SECRET_KEY` names.
- `NUXT_SUPABASE_SECRET_KEY` is server-only. Never expose it through client code.
- Do not use the deprecated `serviceKey` config unless the user explicitly asks for legacy compatibility.

### 4. Create the local `.env` file only when the user provides real values

If the repository does not already contain `.env`, create it from `.env.example` only after the user confirms the real values.

If the user does not provide real values in the same task, leave `.env.example` documented and tell the user exactly which values are still required.

### 5. Generate database types

Recommended target path:

`app/types/database.types.ts`

Create the `app/types` directory first if it does not already exist.

If the local Supabase stack is available:

```bash
pnpm exec supabase gen types --lang=typescript --local > app/types/database.types.ts
```

If the user provides a remote Supabase project ref:

```bash
pnpm exec supabase gen types --lang=typescript --project-id <project-ref> > app/types/database.types.ts
```

If the Supabase CLI is unavailable, stop after module installation or set `supabase.types = false`, then tell the user which prerequisite is still missing.

### 6. Validate the installation

Run a focused validation after editing:

```bash
pnpm build
```

Successful validation means:

- `@nuxtjs/supabase` is installed in `dependencies`.
- `nuxt.config.ts` includes the module exactly once.
- Environment variables are documented without leaking secrets.
- Optional type generation either succeeded or was explicitly deferred.

## Notes for This Repository

- This repository already uses Nuxt 4 and `pnpm`.
- `supabase/config.toml` already exists.
- `.env` and `.env.*` are gitignored, while `.env.example` is allowed in git.
- Prefer the module's SSR-safe defaults. Do not disable SSR cookies unless the user explicitly needs a browser-only client setup.
- Do not introduce auth redirect routes yet unless matching pages such as `/login` and `/confirm` are added in the same task.