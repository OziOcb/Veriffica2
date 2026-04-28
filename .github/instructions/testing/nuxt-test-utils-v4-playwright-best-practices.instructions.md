---
name: "Nuxt Test Utils v4 Playwright Best Practices"
description: "Use when configuring or writing Playwright runner tests with Nuxt Test Utils v4, including ConfigOptions, use.nuxt, @nuxt/test-utils/playwright fixtures, goto hydration waits, and Nuxt-aware e2e setup. Complements generic Playwright or Vitest rules with Nuxt-specific browser testing guidance."
applyTo:
  - "playwright.config.ts"
  - "test/e2e/**/*.{test,spec}.ts"
---
# Nuxt Test Utils v4 Playwright Best Practices

## Scope

- Use these rules only when a Playwright runner file relies on `@nuxt/test-utils/playwright`.
- Keep generic Playwright concerns separate; this file covers only the Nuxt-aware layer added by Nuxt Test Utils.

## Playwright Config Integration

- Type the Playwright config with `ConfigOptions` from `@nuxt/test-utils/playwright` when using the Nuxt integration.
- Set `use.nuxt.rootDir` explicitly so Nuxt Test Utils boots the correct application.
- Keep Nuxt-specific overrides under `use.nuxt`; keep browser matrix, retries, workers, and reporters in standard Playwright config.
- Use per-file `test.use({ nuxt: { ... } })` overrides only when a spec truly needs a different Nuxt root or config.

## Test Authoring

- Import `expect` and `test` from `@nuxt/test-utils/playwright` when the spec depends on Nuxt fixtures such as `goto`.
- Prefer the provided `goto` fixture over raw `page.goto` for app navigation that should wait for Nuxt readiness.
- Use `goto(path, { waitUntil: 'hydration' })` for assertions that depend on client hydration, composables, or post-SSR interactivity.
- Keep assertions user-facing and browser-level; if a scenario only needs server HTML or app runtime helpers, move it to the appropriate Nuxt Test Utils or Vitest slice.

## Boundaries and Separation

- Do not mix Playwright runner files using `@nuxt/test-utils/playwright` with `@nuxt/test-utils/runtime` helpers from Nuxt Vitest tests.
- Do not copy `setup()` and `createPage()` patterns from `@nuxt/test-utils/e2e` into Playwright runner tests; use the dedicated Playwright integration instead.
- Keep e2e coverage focused on navigations, rendering, hydration, and browser interactions, not low-level unit behavior.

## Definition of Done

- `playwright.config.ts` declares Nuxt-aware config through `ConfigOptions` and `use.nuxt`.
- E2E specs import their fixtures from `@nuxt/test-utils/playwright` when they depend on Nuxt helpers.
- Hydration-sensitive tests use an intentional navigation wait strategy.
- Browser tests are not mixed with Nuxt runtime helper tests in the same file or abstraction.