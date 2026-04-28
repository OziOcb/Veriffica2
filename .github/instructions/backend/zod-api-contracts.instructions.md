---
name: "Zod API Contracts"
description: "Use when creating or editing shared backend contracts, request schemas, response schemas, or validation logic with Zod 4 across shared and server code. Covers schema ownership, parse vs safeParse, inferred types, transforms, async validation, and client-server contract reuse."
applyTo:
  - "shared/**/*.ts"
  - "server/api/**/*.ts"
  - "server/routes/**/*.ts"
  - "server/utils/**/*.ts"
---
# Zod API Contracts Best Practices

## Scope and Ownership

- Use Zod 4 as the source of truth for backend payload contracts, not hand-written parallel TypeScript interfaces.
- Put reusable request, response, and domain snapshot schemas in shared contract modules so client and server can import the same definition.
- Keep contract modules focused on transport and validation concerns; do not mix them with side effects, runtime config, or data access.

## Defining Schemas

- Model untrusted payloads with explicit object schemas rather than broad `record` or `unknown` escape hatches.
- Prefer small composable schemas that can be reused for Part 1, inspection snapshots, sync payloads, and API envelopes.
- Keep transformations, refinements, and normalization rules explicit and deterministic.
- When a schema changes the output shape through `transform`, use separate input and output types where the distinction matters.

## Parsing and Error Handling

- Use `.parse()` or `.parseAsync()` when invalid input should immediately fail the current execution path.
- Use `.safeParse()` or `.safeParseAsync()` when the code needs to convert validation failures into a structured 4xx response without exceptions escaping the boundary.
- Convert `ZodError` results into predictable API error shapes instead of returning raw validator internals to the client.
- Treat every external input as untrusted, including internal sync payloads and data restored from offline storage.

## Types and Reuse

- Derive TypeScript types from schemas with `z.infer`, `z.input`, and `z.output` instead of duplicating DTO types by hand.
- Keep request and response types aligned with the schema actually used at runtime.
- Reuse the same schema across form validation, server validation, and tests when the contract is intentionally identical.

## Validation Discipline

- Keep schemas pure and portable so they can run in both browser and server contexts when needed.
- Use async parsing only when a refinement or transform truly depends on async behavior.
- Do not hide business logic in validators; use Zod to validate and normalize inputs, then perform orchestration in service or handler code.

## Definition of Done

- Every backend-facing payload has a schema-backed contract.
- Types are derived from schemas, not manually mirrored.
- Parsing strategy (`parse` vs `safeParse`) matches the error-handling needs of the boundary.
- Validation logic is shared where appropriate and not silently forked between client and server.
- Contract modules remain side-effect free and easy to reuse in tests.