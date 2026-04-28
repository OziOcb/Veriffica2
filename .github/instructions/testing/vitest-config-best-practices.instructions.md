---
name: "Vitest Config Best Practices"
description: "Use when creating or editing Vitest 4 configuration in vitest.config.ts or dedicated Vitest setup files. Covers projects, environments, setupFiles, coverage, reporters, isolation, and migration-safe configuration for current Vitest 4.x. Complements Nuxt Test Utils configuration guidance with generic Vitest rules."
applyTo:
  - "vitest.config.ts"
  - "test/**/*.setup.ts"
---
# Vitest Config Best Practices

## Scope

- Apply these rules for generic Vitest configuration concerns across all projects.
- When `vitest.config.ts` configures `defineVitestProject`, `environmentOptions.nuxt`, or other Nuxt runtime specifics, layer the Nuxt Test Utils v4 instruction on top instead of expanding this file with framework-specific setup details.

## Base Configuration

- Configure Vitest with `defineConfig` from `vitest/config`.
- Prefer a dedicated `vitest.config.ts` when test concerns differ materially from app build config.
- Keep Vitest aligned with Node.js 20+ and Vite 6+, which are required by Vitest 4.
- Use `test.projects`, not deprecated `workspace`, `poolMatchGlobs`, or `environmentMatchGlobs`.
- Keep project names unique and explicit so CLI filtering and output remain stable.

## Project Boundaries

- Split pure unit tests and Nuxt runtime tests into separate projects with distinct `include` globs and environments.
- Keep root-only options such as `coverage`, `reporters`, and snapshot path resolution at the root config level.
- Use project-level config only for options that materially differ per project, such as `include`, `environment`, `setupFiles`, `isolate`, or browser settings.
- Prefer precise `include` or `dir` patterns over broad `exclude` lists; Vitest 4 excludes far less by default than older versions.

## Environments and Setup

- Default to `environment: "node"` for pure logic and server-side tests.
- Use `environment: "nuxt"` only for tests that require a Nuxt app/runtime, and configure `rootDir` and DOM environment explicitly through `@nuxt/test-utils` helpers.
- Use per-file `@vitest-environment` comments only for exceptional one-off cases; prefer project boundaries for recurring needs.
- Add `setupFiles` only for shared bootstrapping, matcher registration, or deterministic global cleanup. Keep setup idempotent and free of hidden side effects.

## Mocking and Isolation Options

- Choose an explicit mock cleanup strategy with config options such as `clearMocks`, `mockReset`, `restoreMocks`, `unstubEnvs`, and `unstubGlobals` when tests mutate shared state.
- Remember that `restoreMocks` only restores spies created with `vi.spyOn`; it does not replace deliberate module mock lifecycle management.
- If a non-isolated configuration is required for performance, document why and add the resets needed to prevent cross-test leakage.
- When browser-like environments fail on CSS or asset imports from dependencies, inline the whole dependency chain with `server.deps.inline`.

## Coverage and Reporters

- Prefer the `v8` coverage provider unless the runtime requires Istanbul.
- In Vitest 4, set `coverage.include` explicitly if uncovered source files must appear in the report; do not use removed options such as `coverage.all` or `coverage.extensions`.
- Keep coverage and reporter configuration minimal and root-scoped so all projects emit one coherent report.
- Do not use removed or outdated reporter assumptions; `basic` is gone, and `tree` is the closest replacement when case-level tree output is required.

## Performance and Execution

- Use watch mode for local development and `vitest run` for CI or deterministic one-off runs.
- Tune `maxWorkers`, `isolate`, or `vmMemoryLimit` only after measuring an actual bottleneck.
- Use top-level Vitest 4 pool options instead of removed `poolOptions` nesting.

## Definition of Done

- Config uses `projects`, not deprecated workspace-era options.
- Project names, includes, and environments match the intended test slices.
- Root-level coverage and reporters are correct for all projects.
- Setup files and cleanup strategy prevent state leakage.
- Any non-default isolation, worker, or dependency inlining choice is intentional and documented.