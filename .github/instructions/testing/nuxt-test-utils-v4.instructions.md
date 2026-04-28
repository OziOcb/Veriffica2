---
name: "Nuxt Test Utils v4"
description: "Use when creating or editing Nuxt runtime tests with Nuxt Test Utils v4 alongside Vitest, including defineVitestProject, environmentOptions.nuxt, mountSuspended, renderSuspended, mockNuxtImport, mockComponent, and registerEndpoint. Complements vitest and vitest-config instructions with Nuxt-specific runtime testing guidance."
applyTo:
  - "vitest.config.ts"
  - "nuxt.config.ts"
  - "test/nuxt/**/*.{test,spec}.ts"
  - "test/**/*.nuxt.{test,spec}.ts"
---
# Nuxt Test Utils v4 Best Practices

## Scope

- Apply these rules on top of the generic Vitest instructions; use this file only for Nuxt Test Utils specific behavior.
- Use `@nuxt/test-utils/config` and `@nuxt/test-utils/runtime` only for tests that truly need a Nuxt runtime, app context, auto-imports, or Nuxt aliases.
- Keep pure logic tests in `test/unit` and Nuxt runtime tests in `test/nuxt` or dedicated `*.nuxt.spec.ts` files.

## Vitest Integration

- Prefer a project-based Vitest setup with `defineVitestProject` for the Nuxt slice instead of forcing every test into `environment: "nuxt"`.
- Keep `environmentOptions.nuxt.rootDir` explicit so the runtime points at the intended Nuxt app.
- Choose `domEnvironment` intentionally; keep the default `happy-dom` unless a test depends on behavior that specifically requires `jsdom`.
- Configure Nuxt Test Utils DOM mocks in `environmentOptions.nuxt.mock` only when the suite genuinely needs them, such as `indexedDb`.
- Use `.env.test` for test-only environment variables instead of hardcoding values in test helpers or config.

## Nuxt Config Integration

- Add `@nuxt/test-utils/module` to `nuxt.config.ts` only when you want the optional DevTools Vitest integration; do not treat it as mandatory for runtime tests.
- If Nuxt runtime tests live outside `test/nuxt` or `tests/nuxt`, extend `typescript.tsConfig.include` so those files get Nuxt aliases and auto-import typing.

## Runtime Test Authoring

- Assume a global Nuxt app is initialized for Nuxt-environment tests, including plugins and app-level code; reset any mutated global state between tests.
- Use `mountSuspended` when you need a Vue Test Utils wrapper and component-instance level assertions.
- Use `renderSuspended` when you want user-facing assertions through Testing Library semantics.
- When testing `.vue` files, prefer a local factory function that mounts or renders the component with shared defaults and per-test overrides; reuse that factory across the spec instead of loading the component separately in each test or inside `beforeEach`.
- If you use `renderSuspended` with Testing Library, align the suite with the Vitest config rules for globals or ensure cleanup is handled explicitly.
- Pass the `route` option deliberately when the component depends on routing context, and use `route: false` only when skipping the initial navigation is intentional.

## Nuxt-Specific Mocking

- Use `mockNuxtImport` for Nuxt auto-imports instead of mocking generated internals by path.
- Remember that `mockNuxtImport` is transformed to a hoisted `vi.mock` and can only be declared once per mocked import in a file.
- When different tests need different implementations of the same Nuxt import, expose the mock through `vi.hoisted` and swap implementations per test.
- Use `mockComponent` for auto-imported or globally registered components, and import any local variables or Vue APIs inside the factory because it is hoisted.
- Use `registerEndpoint` to stub Nitro endpoints consumed by the UI instead of mocking fetch chains deep inside components.

## Boundaries and Stability

- Do not mix `@nuxt/test-utils/runtime` and `@nuxt/test-utils/e2e` in the same test file; they require different environments.
- Prefer Nuxt Test Utils helpers over hand-built app bootstrapping so tests stay aligned with Nuxt runtime behavior.
- If a component does not use Nuxt context, prefer plain `@vue/test-utils` in the unit project instead of paying the runtime-test cost.

## Definition of Done

- Nuxt runtime tests are isolated from pure unit and e2e tests.
- `defineVitestProject` or equivalent Nuxt Test Utils config is used intentionally.
- Routing context, DOM environment, and built-in mocks are explicit when relevant.
- Nuxt auto-imports, components, and endpoints are mocked through Nuxt Test Utils helpers rather than brittle internal paths.
- No file mixes runtime helpers with e2e helpers.