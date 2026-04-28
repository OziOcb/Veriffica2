---
name: "Vitest Test Best Practices"
description: "Use when creating or editing Vitest 4 tests for unit logic or Nuxt runtime slices. Covers test structure, async patterns, parameterized tests, mocking, timers, environments, and deterministic assertions. Complements Nuxt Test Utils runtime guidance with generic Vitest testing rules."
applyTo:
  - "test/unit/**/*.{test,spec}.ts"
  - "test/nuxt/**/*.{test,spec}.ts"
  - "test/**/*.nuxt.{test,spec}.ts"
---
# Vitest Test Best Practices

## Scope

- Apply these rules to all Vitest-authored tests, including Nuxt runtime slices.
- When a spec uses `mountSuspended`, `renderSuspended`, `mockNuxtImport`, `mockComponent`, `registerEndpoint`, or other `@nuxt/test-utils` helpers, layer the dedicated Nuxt Test Utils v4 instruction on top instead of duplicating that guidance here.

## Test Structure

- Import `describe`, `test`, `expect`, `vi`, and hooks from `vitest` explicitly unless the repo intentionally enables globals.
- Keep test names behavior-focused and specific about the expected outcome.
- Keep `describe` nesting shallow; one suite level per public unit or scenario is usually enough.
- Put pure logic tests in `test/unit` and Nuxt runtime tests in `test/nuxt` so they run under the correct project and environment.

## Assertions and Async Behavior

- Assert observable behavior and public contracts before internal implementation details.
- In unit tests, follow a strict Black Box methodology: assert only public inputs, outputs, rendered DOM, emitted events, and other observable effects, never private state, internal methods, refs, or implementation-specific details.
- Use `async` and `await` or returned promises; do not use callback-style `done` tests.
- Prefer `test.for` for new parameterized tests; use `test.each` only when maintaining Jest-compatible patterns.
- Keep one reason for failure per test when practical so failures are easy to diagnose from Vitest output.
- Remember that Vitest executes TypeScript but does not type-check during the test run; keep test types valid under the repo's separate typecheck flow.

## Mocking

- Prefer `vi.spyOn` when you only need to observe or override a narrow seam on a real module or object.
- Use `vi.mock` when the module boundary itself must be replaced, and remember that `vi.mock` is hoisted before imports.
- Clear, reset, or restore mocks between tests through hooks or shared config; do not let call history or implementations leak across cases.
- Use `vi.importActual` or the `importOriginal` factory argument for partial mocks instead of reimplementing whole modules unnecessarily.
- When mocking constructors in Vitest 4, provide a `function` or `class` implementation, not an arrow function.
- Use `vi.stubEnv` and `vi.stubGlobal` for env and global overrides, and ensure they are unstubbed automatically or manually between tests.

## Timers, Dates, and Concurrency

- Use `vi.useFakeTimers`, `vi.advanceTimersByTime`, and `vi.useRealTimers` for timer-driven code.
- Use `vi.setSystemTime` when tests depend on the current date or time, and always restore real timers afterward.
- Tests in one file run sequentially by default; use `test.concurrent` only when cases are truly isolated and order-independent.
- Avoid time-based sleeps in tests; wait on observable state transitions instead.

## Environment-Specific Guidance

- Keep Node-based tests free of unnecessary DOM helpers or app bootstrapping.
- Use per-file `// @vitest-environment ...` overrides sparingly; if many files need the same runtime, move that concern into project config instead.
- In Nuxt-oriented tests, assert behavior through the configured Nuxt test utilities instead of mocking the entire framework surface.
- Keep Nuxt Test Utils runtime helpers and e2e helpers in their own dedicated slices; do not mix them into generic Vitest patterns.

## Local Development Hygiene

- Use `test.only` and `describe.only` only as temporary local tools; remove them before finishing work.
- Prefer `test.skip` only with a concrete reason, and use `test.todo` for intentionally missing coverage.
- Keep snapshots small, stable, and meaningful; update them only when behavior changes intentionally.

## Definition of Done

- File location matches the correct Vitest project.
- Tests are deterministic, isolated, and cleanup is explicit.
- Mocks, timers, envs, and globals are restored between cases.
- No focused tests remain committed.
- Assertions describe behavior clearly enough that failures are actionable.