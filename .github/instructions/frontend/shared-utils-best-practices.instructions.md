---
name: "Shared Utils Best Practices"
description: "Use when creating or editing Nuxt 4 app utilities in app/utils or cross-context helpers and types in shared. Covers auto-import scanning, environment-safe boundaries, explicit typing, purity, and import conventions for reusable utilities."
applyTo:
  - "app/utils/**/*.ts"
  - "shared/**/*.ts"
  - "shared/**/*.d.ts"
---
# Shared Utils Best Practices

## Purpose and Placement

- Put Vue-app-only utility helpers in `app/utils`.
- Put code that must work in both the Vue app and Nitro server in `shared`.
- Keep cross-context business logic and reusable type definitions in `shared` instead of duplicating them in `app` and `server`.

## Environment Boundaries

- `app/utils` may rely on the Vue app runtime, but should stay lightweight and utility-focused.
- `shared` code must stay environment-neutral and must not import Vue components, Vue composables, Nuxt app APIs, Nitro server APIs, or browser-only globals.
- If logic needs `useFetch`, `useAsyncData`, `useRuntimeConfig`, request `event`, cookies, or DOM APIs, it does not belong in `shared`.

## Auto-Imports and File Structure

- Keep auto-imported app helpers in `app/utils`.
- Only `shared/utils` and `shared/types` are auto-imported by default.
- Files elsewhere in `shared` must be imported manually via the `#shared` alias.
- Do not assume nested folders inside `shared/utils` or `shared/types` are auto-imported unless the project explicitly configures `imports.dirs` and `nitro.imports.dirs`.

## Utility Design

- Prefer small, deterministic, side-effect-light functions.
- Prefer explicit parameters and return types for reusable helpers.
- Avoid hidden mutable state, implicit globals, and singleton-style utility modules unless there is a clear reason.
- Keep naming intention-revealing and follow repository naming conventions.

## Typing and Data Shape

- Use strict TypeScript and avoid `any` unless there is a documented reason.
- Put shared reusable types in `shared/types` when they are consumed by both app and server code.
- Return stable, predictable data shapes from helpers.
- Prefer narrowing and validation at boundaries before values enter shared helpers.

## Imports and Dependencies

- Keep dependencies minimal to preserve portability between app and server contexts.
- Prefer standard library helpers and small pure utilities over framework-coupled abstractions.
- Use `#shared` for manual imports from `shared` rather than brittle relative paths.

## Error Handling

- Throw or return meaningful errors from helpers; do not silently swallow failures.
- Keep generic utilities free of noisy logging side effects; log with context at boundary layers such as composables, plugins, and server handlers.

## Definition of Done

- Utility placement matches its runtime scope: `app/utils` for app-only helpers, `shared` for app-and-server-safe code.
- Shared code is free of Vue, Nuxt app, Nitro, and browser-only dependencies.
- Types are explicit and reusable where appropriate.
- Import behavior is intentional and compatible with Nuxt auto-import scanning rules.