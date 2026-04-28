---
name: "Nuxt UI v4 Components"
description: "Use when creating or editing Nuxt UI v4 UI in app/components or app/pages, including components such as UButton, UCard, UForm, UModal, UTable, UInput, and overlay-driven page UI. Covers props, slots, ui vs class overrides, icons, color mode controls, forms, and accessibility."
applyTo:
  - "app/components/**/*.vue"
  - "app/pages/**/*.vue"
  - "app/layouts/**/*.vue"
---
# Nuxt UI v4 Component Best Practices

## Component Selection and Composition

- Prefer Nuxt UI primitives and higher-level components before building bespoke equivalents.
- Keep pages responsible for orchestration and data flow; move reusable UI composition into components.
- Combine Nuxt UI components through documented props and slots before introducing wrapper abstractions.

## Props, Slots, and Styling

- Prefer documented props, slots, and variants before adding custom wrappers or ad hoc utility classes.
- Use the `ui` prop for per-instance slot overrides.
- Use the `class` prop only to override the root or base slot.
- For reusable visual defaults, move theme decisions into `app/app.config.ts` instead of repeating them across feature components.
- Preserve component semantics and accessibility defaults instead of replacing built-in structure unnecessarily.

## Icons and Color Mode in UI

- Use `UIcon` or component `icon` props instead of custom inline SVGs unless there is a strong product reason.
- Prefer shared icon aliases from `app/app.config.ts` for recurring actions and status indicators.
- Use built-in color mode components or `useColorMode` for custom toggles.
- Wrap client-only color mode controls in `ClientOnly` with a stable fallback to avoid layout shifts.
- Add an explicit `aria-label` for icon-only actions and toggles.

## Forms and Interactions

- Use `UForm` with `UFormField` for forms that need validation, typed submission, or consistent error presentation.
- Install and use an explicit validation library such as Zod or Valibot when schema validation is needed; Nuxt UI does not ship one by default.
- Keep `FormField` `name` values aligned with schema and state paths, including dot notation for nested objects.
- Use `error-pattern` for array-like nested field errors when a single field should capture multiple indexed issues.
- Type submit handlers with `FormSubmitEvent` from `@nuxt/ui`.
- Use `@error` when focusing or scrolling to the first invalid field materially improves UX.
- Prefer built-in nested form support and typed `form.submit()` behavior over hand-rolled validation orchestration.

## Accessibility and UX

- Keep visible labels, descriptions, and validation messages wired through Nuxt UI form primitives rather than custom ad hoc markup.
- Respect Nuxt UI and Reka focus-management behavior instead of overriding it with unnecessary custom JS.
- Prefer component props and slots that preserve keyboard support, reading order, and managed focus.

## Definition of Done

- Component customization uses props, variants, `ui`, or `class` in the intended precedence order.
- Icon-only controls are labeled.
- Form state, validation, and error mapping are typed and aligned.
- Reusable theme changes are moved to `app/app.config.ts` instead of duplicated in pages or components.