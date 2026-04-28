---
name: "Tailwind CSS v4 Template"
description: "Use when creating or editing Tailwind CSS v4 utility classes in Nuxt/Vue templates or component style blocks. Covers static class detection, utility composition, arbitrary values, arbitrary variants, responsive and dark-mode usage, @reference, and Nuxt UI coexistence."
applyTo:
  - "app/app.vue"
  - "app/error.vue"
  - "app/components/**/*.vue"
  - "app/pages/**/*.vue"
  - "app/layouts/**/*.vue"
---
# Tailwind CSS v4 Template Best Practices

## Utility Authoring

- Prefer utility classes in templates for most styling work.
- Keep class names complete and statically detectable in source code.
- Never build class names by concatenating fragments such as `bg-${color}-500`.
- Map props or state to complete class strings instead of constructing utilities dynamically.
- Keep class lists intentional and readable; group layout, spacing, typography, color, and state styles coherently.

## Arbitrary Values and Variants

- Use arbitrary values only when design tokens or existing utilities are insufficient.
- Prefer referencing theme variables in arbitrary values when they express design intent more clearly than magic numbers.
- Use type hints for ambiguous CSS-variable-backed arbitrary values when needed, such as `text-(color:--my-var)`.
- Use arbitrary variants for one-off selector cases; if a selector pattern repeats, move it to CSS with `@custom-variant` or a utility abstraction.
- Keep arbitrary selectors understandable and scoped; avoid turning templates into selector puzzles.

## Responsive, State, and Dark Mode Usage

- Follow Tailwind's mobile-first model and layer breakpoint variants deliberately.
- Prefer built-in state and media variants such as `hover:`, `focus:`, `disabled:`, `motion-safe:`, and `dark:` before custom selectors.
- Follow the project's chosen dark-mode strategy consistently; if the project overrides the `dark` variant in CSS, do not mix in conflicting assumptions at component level.
- Use full variant-prefixed class names in templates so detection remains reliable.

## Component-Scoped Styles

- If `@apply` or `@variant` is used inside a Vue `<style>` block or CSS module, use `@reference` to import the main stylesheet or `tailwindcss` for reference.
- Prefer template utilities over moving ordinary styling into `<style scoped>` blocks.
- Use CSS-side styling only when dealing with uncontrolled markup, third-party integrations, or genuinely reusable authored CSS.

## Nuxt UI Coexistence

- When styling Nuxt UI components, prefer their documented props, variants, slots, `ui` prop, and app-level theme overrides first.
- Use raw Tailwind classes as complements, not replacements for Nuxt UI component APIs.
- Keep utility usage aligned with the same design tokens and semantic color intent used by Nuxt UI.

## Definition of Done

- Template classes are statically detectable.
- Arbitrary values and variants are justified and readable.
- Responsive, dark, and interaction states are composed intentionally.
- Component-scoped CSS uses `@reference` correctly when invoking Tailwind directives.
- Tailwind usage complements Nuxt UI instead of fighting its API surface.