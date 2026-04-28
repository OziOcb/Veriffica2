---
name: "Nuxt4 Best Practices"
description: "Use when creating or editing Nuxt 4 app shell, pages, layouts, route middleware, plugins, router options, runtime config, server handlers, or nuxt.config. Covers app directory boundaries, SSR, useAsyncData/useFetch, SEO metadata, prerendering, security, and Nitro architecture conventions."
applyTo:
  - "app/app.vue"
  - "app/error.vue"
  - "app/app.config.ts"
  - "app/router.options.ts"
  - "app/components/**/*.vue"
  - "app/composables/**/*.ts"
  - "app/pages/**/*.vue"
  - "app/layouts/**/*.vue"
  - "app/plugins/**/*.ts"
  - "app/middleware/**/*.ts"
  - "server/**/*.ts"
  - "nuxt.config.ts"
---
# Nuxt 4 Best Practices

## Architecture

- Default to Nuxt 4 directory boundaries: app-facing code in `app/`, Nitro code in root `server/`, and truly cross-context code in `shared/`.
- Keep route-level orchestration in `app/pages`, layouts in `app/layouts`, reusable UI logic in composables, and app-wide integrations in `app/plugins`.
- Use middleware for navigation rules (auth, permissions) only, not for generic data shaping or general fetching.
- Register plugins only when app-wide injection is genuinely needed.
- Use runtime config for environment-specific values; never hardcode secrets in source.
- Keep `nuxt.config.ts` minimal and explicit; document non-obvious modules or flags.
- Configure prerendering with `nitro.prerender`, not legacy top-level `generate` options.

## Data Fetching and SSR

- Use `useAsyncData` and `useFetch` for SSR-aware data loading in pages and components.
- Use explicit, stable async-data keys whenever cache reuse, prerender sharing, or refresh behavior matters.
- Make async-data keys uniquely identify the fetched data, especially on dynamic routes.
- Reusing the same explicit key requires consistent fetchers and options such as `deep`, `transform`, `pick`, `default`, and `getCachedData`.
- Treat `data` from `useAsyncData` and `useFetch` as shallow and effectively immutable by default; opt into `deep: true` only when necessary.
- Prefer branching UI on `status` for async state, especially when using `immediate: false`.
- Keep fetch logic close to the route that needs it; avoid scattered duplicate calls.
- Handle loading, empty, and error states explicitly in the UI.
- Avoid client-only fetching for SEO-critical content unless intentional.
- Use `server/api` for `/api` endpoints and `server/routes` for non-API server endpoints.
- Use Nuxt `useState` for SSR-safe shared state; introduce Pinia only for complex multi-domain state.

## Nitro Server Patterns

- Validate params, query, and body in server handlers; use schema-backed helpers where practical.
- Pass `event` to `useRuntimeConfig(event)` in server handlers when runtime environment overrides matter.
- Prefer `event.$fetch` for internal server-to-server calls when request context or headers should be forwarded.
- Use `event.waitUntil(...)` for background work that must finish after the response without blocking it.
- Keep server middleware focused on inspecting or extending request context; do not send responses from middleware.

## Performance

- Lazy-load heavy or route-specific components with dynamic imports.
- Use route-level code splitting; avoid globally importing large feature modules.
- Optimize images and static assets; use Nuxt image optimization when available.
- Use `<ClientOnly>` only where strictly required to preserve SSR benefits.
- If client-only content needs reserved layout space, provide an explicit fallback instead of depending on placeholder markup.

## SEO and Metadata

- Define per-page metadata with `useSeoMeta` or `useHead`.
- Use `useHeadSafe` when metadata is derived from untrusted or user-generated input.
- Ensure a unique `title` and meaningful `description` for every indexable page.
- Expose canonical URLs where duplicate-content risks exist.
- Do not rely on removed legacy head props such as `hid` or `vmid`.
- Prefer SSR-rendered content for crawlable routes.

## Security

- Treat all user and API input as untrusted.
- Avoid `v-html`; if required, sanitize content on both server and client boundaries.
- Keep secrets on the server side; access only via runtime config or private server context.
- Validate all request input in server routes and return explicit HTTP status codes.
- Normalize API and server errors to predictable shapes before UI rendering.

## Definition of Done

- File placement follows Nuxt 4 `app/`, `server/`, and `shared/` boundaries unless the repo intentionally documents a legacy structure.
- Types are strict with no `any` unless justified.
- Async-data keys are unique and consistent with the returned data shape.
- SSR and client-only behavior is intentional and documented.
- Empty, loading, and error states are implemented for all data-driven views.
- SEO metadata and accessibility checks are included for user-facing pages.
