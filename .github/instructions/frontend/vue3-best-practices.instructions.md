---
name: "Vue3 Best Practices"
description: "Use when creating or editing Vue 3 SFCs, UI components, component templates, component-local state, watchers, computed values, or Composition API composables. Covers script setup, typed props and emits, reactivity correctness, accessibility, and styling patterns."
applyTo:
  - "app/**/*.vue"
  - "app/composables/**/*.ts"
---
# Vue 3 Best Practices

## Core Standards

- Use `<script setup lang="ts">` in all Vue SFCs.
- Keep components focused and single-purpose.
- Keep business logic in composables, not inside templates.
- Follow naming rules: PascalCase for components and types, camelCase for variables and functions, ALL_CAPS for constants.

## Components and SFC Design

- Keep templates declarative; move complex conditionals and computations to computed values.
- Define typed props with `defineProps` and defaults with `withDefaults` when needed.
- Define typed events with `defineEmits`; avoid untyped event payloads.
- Prefer `v-model` arguments and explicit emits over implicit two-way mutations.
- Avoid deep prop drilling; use composables or `provide`/`inject` for cross-tree concerns.
- Use stable `:key` values in lists; never use array index as key for mutable collections.

## Reactivity and State

- Use `ref` for primitives and `reactive` for cohesive object state.
- Derive state with `computed`; avoid duplicating writable state.
- Prefer `watchEffect` for dependency-driven side effects, `watch` for explicit source control.
- Cancel or abort stale async tasks when a watcher re-triggers.
- Avoid unnecessary deep watchers and large reactive objects.

## Error Handling

- Wrap async operations in try/catch and log errors with contextual information.
- Show user-friendly fallback states instead of silent failures.
- Avoid swallowing errors; either handle or rethrow with context.

## Accessibility and UX

- Use semantic HTML first (`button`, `nav`, `main`, `label`, `input`).
- Ensure keyboard navigation and visible focus states for all interactive controls.
- Add ARIA attributes only when native semantics are insufficient.
- Do not rely on color alone to convey state or errors.

## Styling and Maintainability

- Use scoped styles or clearly defined global style boundaries.
- Use design tokens and CSS variables for color, spacing, and typography.
- Avoid duplicated inline styles; extract reusable utility classes or components.
- Keep class naming consistent and intention-revealing.
