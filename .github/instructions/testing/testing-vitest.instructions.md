---
name: "Vitest Testing Standards"
description: "Use when writing or updating unit tests with Vitest in Nuxt/Vue projects. Covers unit test structure, mocking, reliability, and CI-friendly practices."
applyTo:
  - "test/unit/**/*.test.ts"
  - "vitest.config.ts"
---
# Vitest Testing Standards

## Core Rules

- Write deterministic tests with no hidden dependencies.
- Keep tests isolated so they can run in any order.
- Use clear arrange-act-assert structure.
- Name tests by behavior, not implementation details.

## Unit Testing Practices

- Test composables and non-trivial component logic as first-class units.
- Mock network boundaries and external services.
- Verify success, loading, empty, and error states where applicable.
- Prefer explicit assertions over broad snapshots for dynamic behavior.
- Cover edge cases and invalid input paths for business logic.

## Component Test Guidance

- Assert rendered behavior and interaction outcomes.
- Avoid brittle selectors tied to styling or DOM depth.
- Prefer role, text, and label oriented queries when possible.
- Validate emitted events and prop-driven state changes.

## Reliability and CI

- Keep test data minimal and explicit.
- Stabilize time-dependent tests with clock/date control where needed.
- Clean up mocks and spies between tests.
- Avoid flaky dependencies on external services or local machine state.

## Definition of Done

- New or changed logic has unit coverage.
- Happy path plus at least one failure or edge path is tested.
- Tests are readable, maintainable, and deterministic.
- Test names clearly communicate expected behavior.
