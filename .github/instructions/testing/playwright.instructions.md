---
name: "Playwright"
description: "Use when creating or editing Playwright tests, including playwright.config.ts, projects, fixtures, locators, web-first assertions, retries, traces, and stable end-to-end test structure. Complements nuxt-test-utils-v4-playwright instructions with generic Playwright runner guidance."
applyTo:
  - "playwright.config.ts"
  - "test/e2e/**/*.{test,spec}.ts"
---
# Playwright Best Practices

## Scope

- Apply these rules for generic Playwright runner behavior, configuration, and browser-level test authoring.
- When a file also uses `@nuxt/test-utils/playwright`, combine this file with the Nuxt-specific Playwright instruction instead of duplicating framework-specific setup here.

## Configuration

- Keep runner options such as `testDir`, `retries`, `workers`, `reporter`, `projects`, and `timeout` at the top level of `playwright.config.ts`, not inside `use`.
- Keep `use` focused on per-test browser context defaults such as trace collection, screenshots, video, base URL, locale, viewport, or storage state.
- Use explicit browser projects only for coverage you actually need; avoid multiplying runtime cost without a real compatibility goal.
- Enable `forbidOnly` on CI and keep retries conservative so flaky tests are exposed instead of normalized.
- Prefer trace collection on retries or failures so debugging remains cheap in the passing path.
- Add `expect` configuration only when a suite has a demonstrated need for custom assertion timing or snapshot thresholds.

## Test Authoring

- Write tests from the user perspective: navigate, interact, and assert visible outcomes instead of internal implementation details.
- Keep each test focused on one primary scenario and one clear failure reason.
- Use `test.describe`, `beforeEach`, and fixtures to share setup only when it materially improves clarity; keep hooks small and deterministic.
- Rely on Playwright test isolation; do not assume state from a previous test.

## Locators and Actions

- Prefer resilient locators such as `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, and `getByTestId` over brittle CSS or XPath selectors.
- Choose the locator that best matches the user-facing contract of the element, with accessible roles and names preferred first.
- Store repeated locators in variables only when it improves readability or reuse across multiple steps.
- Let Playwright handle actionability and navigation waiting; avoid manual waits before clicks, fills, and assertions.

## Assertions and Stability

- Prefer async web-first assertions such as `await expect(locator).toBeVisible()` and `await expect(page).toHaveURL()` over immediate reads followed by synchronous assertions.
- Avoid `waitForTimeout` except as a last-resort debugging tool that should not remain in committed tests.
- Assert on user-observable state, text, URL, title, enabled state, and counts instead of framework internals.
- When a test is flaky, fix the synchronization point or locator quality rather than increasing global timeouts first.

## Fixtures, Data, and Boundaries

- Use fixtures for stable reusable setup, not to hide complex business logic.
- Keep test data local to the spec unless the same data shape is genuinely shared across many scenarios.
- Avoid mixing unit-style assertions or app-runtime helpers into Playwright specs; move those checks to Vitest or Nuxt runtime tests.

## Definition of Done

- Config keeps top-level runner options and `use` options in the correct places.
- E2E tests use resilient locators and web-first assertions.
- No committed manual sleeps, stray `test.only`, or opaque shared state remain.
- Retries, traces, and browser projects reflect an intentional tradeoff between signal and runtime cost.