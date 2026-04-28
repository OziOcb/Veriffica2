---
name: "Nitro Server Routes"
description: "Use when creating or editing Nuxt 4 Nitro backend code in server/api, server/routes, server/middleware, server/plugins, or server/utils. Covers REST handlers, request validation, error responses, runtime config, internal fetch forwarding, background tasks, and modular BFF boundaries."
applyTo:
  - "server/api/**/*.ts"
  - "server/routes/**/*.ts"
  - "server/middleware/**/*.ts"
  - "server/plugins/**/*.ts"
  - "server/utils/**/*.ts"
---
# Nitro Server Routes Best Practices

## Architecture and Boundaries

- Treat Nitro as the backend-for-frontend layer of a modular monolith, not as a thin passthrough for unchecked client data.
- Keep JSON APIs in `server/api` and non-API server endpoints in `server/routes`.
- Keep server middleware focused on inspecting or extending request context; middleware should not send responses or close requests.
- Use `server/plugins` only for Nitro lifecycle extensions and cross-cutting runtime wiring.
- Move reusable backend logic into `server/utils` or shared domain modules instead of duplicating it across handlers.
- Prefer REST and JSON for MVP backend flows, with clear resource names and method-specific handlers such as `.get.ts`, `.post.ts`, `.delete.ts`.
- Keep backend orchestration aligned with the product architecture: snapshot-based sync per inspection, not event sourcing or CQRS.

## Request Handling and Validation

- Validate every untrusted route param, query, and body at the handler boundary.
- Prefer `getValidatedRouterParams`, `getValidatedQuery`, and `readValidatedBody` with schema validation instead of parsing untrusted input by hand.
- Keep request normalization on the server even if the client already validates the same fields.
- Reuse shared contracts for payload shapes and response DTOs instead of redefining them inside handlers.

## Runtime and Internal Calls

- Pass `event` into `useRuntimeConfig(event)` in server handlers so runtime overrides from environment variables are respected.
- Keep secrets, service credentials, and privileged tokens on the server side only.
- Use `event.$fetch` for internal server-to-server calls when request context or safe header forwarding matters.
- Use the `#server` alias only inside the `server/` directory for stable imports.

## Errors, Status Codes, and Background Work

- Throw `createError` for expected HTTP failures such as validation, auth, ownership, or business-rule violations.
- Use `setResponseStatus` when a non-200 status should still return a successful response body shape.
- Log backend errors with enough domain context to debug them later, without leaking secrets or personal data.
- Use `event.waitUntil(...)` only for non-blocking background work such as logging, cache warming, or secondary side effects.

## Security and Operational Discipline

- Enforce ownership, inspection limits, delete flows, and other critical rules on the server even when the UI already prevents invalid actions.
- Use `nuxt-security` through the `security` section of `nuxt.config.ts` for baseline headers and route hardening instead of scattering ad hoc header logic.
- Keep authenticated responses and private API payloads out of public cache strategies.
- Avoid legacy Node middleware and legacy handlers unless a concrete dependency forces it.

## Definition of Done

- File placement matches Nitro responsibilities: route, middleware, plugin, or utility.
- Every external input is validated before business logic runs.
- Secrets stay server-only and runtime config access is explicit.
- Error and success responses are predictable and intentionally typed.
- Business invariants are enforced on the server, not delegated to the client.