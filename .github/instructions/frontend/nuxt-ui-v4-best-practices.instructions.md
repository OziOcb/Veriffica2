---
name: "Nuxt UI v4 Config Best Practices"
description: "Use when configuring Nuxt UI v4 in app/app.vue, app/app.config.ts, app CSS, or nuxt.config.ts. Covers current v4 module setup, UApp, CSS-first @theme tokens, semantic colors, icon aliases, color mode integration, and build-time Nuxt UI options."
applyTo:
  - "app/app.vue"
  - "app/app.config.ts"
  - "app/assets/css/**/*.css"
  - "nuxt.config.ts"
---
# Nuxt UI v4 Config Best Practices

## Scope

- Follow current Nuxt UI v4 APIs and docs; do not mix v2 or v3 patterns into new code.
- Treat Nuxt UI as a design-system layer on top of Nuxt, Tailwind CSS, Tailwind Variants, and Reka UI.

## Setup and App Shell

- Register `@nuxt/ui` in `modules` and do not add `@nuxt/icon`, `@nuxt/fonts`, or `@nuxtjs/color-mode` separately unless there is a deliberate reason to override integration behavior.
- Import both `tailwindcss` and `@nuxt/ui` in the main app stylesheet.
- Wrap the app shell in `UApp` inside `app/app.vue` so global toasts, tooltips, overlays, locale, direction, and provider-level behavior work correctly.
- Keep Nuxt UI module-level options in `nuxt.config.ts`, not in component files.

## Theming and Design Tokens

- Use Tailwind CSS `@theme` in app CSS for design tokens such as fonts, raw palette values, and breakpoints.
- Use semantic colors in Nuxt UI (`primary`, `secondary`, `success`, `info`, `warning`, `error`, `neutral`) instead of hard-coding palette names in component APIs when possible.
- Configure runtime semantic color mappings in `app/app.config.ts` under `ui.colors`.
- When introducing a new semantic color alias, register it in `ui.theme.colors` in `nuxt.config.ts`, define the palette in CSS, and map it in `app.config.ts`.
- When defining a custom color palette, provide the full `50` to `950` scale.
- If the project uses a Tailwind prefix, keep `ui.theme.prefix` aligned with it.

## Global Icons and Color Mode

- Override shared icon aliases in `app/app.config.ts` under `ui.icons` instead of scattering raw icon names through configuration.
- Keep color mode integration under Nuxt UI defaults unless there is a clear product requirement to disable it with `ui.colorMode`.
- Configure integration behavior in `nuxt.config.ts`; keep component-level toggle behavior out of config files.

## Performance and Shipping

- Consider `ui.experimental.componentDetection` when CSS size matters, especially in larger apps.
- If components are rendered dynamically with `<component :is>`, include the relevant component names explicitly in `componentDetection`.
- Prefer global theme configuration, semantic color aliases, and app-level defaults over repetitive local overrides.

## Definition of Done

- `UApp` is present when the app uses Nuxt UI global services.
- Theme responsibilities are split correctly: `nuxt.config.ts` for module options, app CSS for raw tokens, `app.config.ts` for runtime UI mappings and global component overrides.
- Semantic colors and icon aliases are consistent across the app.
- Build-time and module-level options stay in configuration files rather than leaking into page or component code.
