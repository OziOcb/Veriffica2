---
name: "Tailwind CSS v4 Stylesheet"
description: "Use when creating or editing Tailwind CSS v4 stylesheets in Nuxt/Vue projects, especially app CSS that defines imports, theme tokens, sources, custom utilities, or custom variants. Covers CSS-first v4 configuration with @import, @theme, @source, @utility, @variant, @custom-variant, @apply, @reference, and Nuxt UI compatibility."
applyTo:
  - "app/assets/css/**/*.css"
---
# Tailwind CSS v4 Stylesheet Best Practices

## Scope

- Follow current Tailwind CSS v4 documentation and do not default to v3-era JavaScript configuration patterns in new code.
- Treat Tailwind v4 as CSS-first: theme tokens, source registration, custom utilities, and custom variants should usually live in CSS.

## Imports and CSS-First Configuration

- Start from `@import "tailwindcss";` in the main stylesheet.
- In projects that use Nuxt UI v4, keep `@import "tailwindcss";` before `@import "@nuxt/ui";`.
- Prefer CSS directives over legacy `tailwind.config.js` customization for new work.
- Use `@config` or `@plugin` only for compatibility or incremental migration scenarios, not as the default approach in a v4-first codebase.
- Do not use the deprecated `theme()` function in new code; prefer CSS theme variables.

## Theme Tokens

- Use `@theme` for tokens that should generate Tailwind utilities or variants.
- Use regular CSS variables in `:root` only for values that should not create Tailwind utilities.
- Keep `@theme` declarations top-level, not nested inside selectors or media queries.
- Extend the default theme by adding or overriding tokens, rather than resetting entire namespaces casually.
- Avoid `--*: initial` or `--color-*: initial` unless a full namespace reset is truly intentional and its effect on generated utilities is understood.
- Use `@theme inline` when a theme token references another variable and should resolve to the referenced value directly.
- Use `@theme static` when all generated CSS variables need to exist even if not referenced yet.
- When defining color palettes intended for design-system usage, provide a complete and consistent scale.

## Source Detection and Safelisting

- Rely on Tailwind's automatic source detection by default.
- Never assume dynamically concatenated class fragments will be detected.
- Use `@source` when classes live in external libraries, ignored paths, or explicitly registered directories.
- Use `@source inline()` to safelist required utilities in v4 instead of legacy safelist config patterns.
- Use `source(none)` only when intentionally isolating a stylesheet from automatic detection.

## Custom CSS, Utilities, and Variants

- Prefer built-in utilities and theme tokens before adding custom CSS.
- Use `@utility` for reusable custom utilities that should participate in variants like `hover:` or `lg:`.
- Use `@custom-variant` for repeatable selector-driven variants instead of scattering arbitrary selector variants through templates.
- Use `@variant` inside CSS when applying Tailwind variants to authored rules.
- Use `@apply` sparingly, mainly for styling third-party markup or consolidating repeated CSS-side rules that cannot live comfortably in templates.
- Use `@layer base` for base element defaults and `@layer components` only for intentional component-style abstractions or third-party overrides.

## Nuxt UI Compatibility

- Remember that Nuxt UI v4 uses Tailwind CSS under the hood.
- Keep raw Tailwind theme tokens compatible with Nuxt UI semantic color mappings and app-level UI configuration.
- Do not change prefixes, palette namespaces, or theme structure without checking related Nuxt UI config such as `ui.theme.prefix`, `ui.theme.colors`, and `app.config.ts` mappings.

## Definition of Done

- Tailwind customization uses v4 CSS directives first.
- Theme tokens are defined in the correct place and with the correct directive.
- Source registration and safelisting use `@source` patterns instead of legacy config habits.
- Custom CSS is justified, minimal, and compatible with Tailwind v4 and Nuxt UI.
