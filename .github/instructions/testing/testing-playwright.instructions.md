---
name: "Playwright E2E Testing Standards"
description: "Use when writing or updating e2e tests with Playwright in Nuxt/Vue projects. Covers critical flow coverage, selector strategy, accessibility checks, and flake-resistant patterns."
applyTo:
  - "test/e2e/**/*.spec.ts"
  - "playwright.config.ts"
---
# Playwright E2E Testing Standards

## Core Rules

- Cover critical user journeys and route-level behavior.
- Keep scenarios realistic but focused; one core behavior per test.
- Name tests by user outcome and business intent.

## Selector and Interaction Strategy

- Use robust selectors: getByRole, getByLabel, getByTestId only when needed.
- Avoid selectors coupled to CSS classes or fragile DOM structure.
- Prefer user-visible interactions and assertions.
- Avoid arbitrary waits; rely on auto-wait and explicit expectations.

## Flow and Error Coverage

- Validate navigation, guarded routes, and unhappy paths.
- Verify important API-failure and validation-error behavior in UI.
- Assert loading-to-ready transitions for async views.

## Accessibility and UX

- Assert visible labels, keyboard operability, and focus movement in key flows.
- Verify important status and error messages are perceivable.
- Include at least one accessibility-oriented assertion in critical scenarios when meaningful.

## Reliability and CI

- Keep fixtures and test data explicit and minimal.
- Isolate tests from external systems where possible.
- Avoid state leakage between tests.
- Keep tests deterministic to reduce flakes in CI.

## Definition of Done

- New or changed critical flow has e2e coverage.
- Happy path plus at least one failure or edge scenario is tested.
- Tests are deterministic, readable, and maintainable.
- Assertions validate user-visible outcomes, not internals.
