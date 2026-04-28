# Veriffica

![Status](https://img.shields.io/badge/status-in%20development-orange)
![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)
![License](https://img.shields.io/badge/license-not%20specified-lightgrey)

Veriffica is an offline-first Progressive Web App that helps non-expert buyers inspect used cars before purchase. The product is designed as a guided five-part inspection flow that works well on mobile, stores progress locally, and is intended to synchronize changes after the connection returns.

The MVP is focused on structure and clarity rather than automated judgment: users answer guided questions, keep notes, and review a final summary based on `Yes / No / Don't know` distributions instead of a single car-quality score.

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Project Scope](#project-scope)
- [Project Status](#project-status)
- [License](#license)

## Project Description

Veriffica is being built as a modular full-stack Nuxt application for guided used-car inspections. The product targets first-time or non-technical buyers who need a clear, step-by-step workflow when checking a vehicle in real-world conditions, including places with weak or no connectivity.

The core user flow defined in the product documentation is:

1. Visit the public landing page.
2. Sign up or log in with email and password.
3. Open the dashboard and create or resume an inspection.
4. Complete `Part 1 - Info about the car` to unlock the rest of the checklist.
5. Answer guided questions in `Parts 2-5`.
6. Review the `Summary`, edit answers if needed, and manually finalize the report.

Additional documentation available in this repository:

- [Product Requirements Document](./.ai/prd.md)
- [Full Technical Architecture](./.ai/full-tech-stack.md)
- [Inspection Instruction Copy](./.ai/veriffica-instrukcja.md)
- [Part 1 Validation Rules](./.ai/veriffica-part-1-validation-rules.md)
- [Question Bank Assets](./.ai/veriffica-questions-list/)

## Tech Stack

### Current repository stack

- Nuxt 4 for the full-stack application shell
- Vue 3 for the UI layer
- Nuxt UI 4 for interface components
- Tailwind CSS 4 for styling
- Pinia for application state management
- `@vueuse/nuxt` for utility composables
- `@vite-pwa/nuxt` for PWA support
- ESLint via `@nuxt/eslint`
- Vitest 4 and `@nuxt/test-utils` for unit and Nuxt runtime testing
- Playwright for end-to-end testing
- pnpm as the package manager

### Target product architecture

- Nitro server routes as the backend-for-frontend layer inside the same Nuxt repository
- Supabase Auth for email/password authentication
- Supabase PostgreSQL with Row Level Security for application data
- Shared validation contracts with Zod
- IndexedDB-based local persistence for offline-first behavior, with Dexie planned as the storage layer
- Vercel for hosting and GitHub Actions for CI/CD
- Node.js 22 LTS as the target runtime baseline

### Product and architecture principles

- Offline-first user experience after the initial app load
- One repository and one TypeScript-first stack across app and backend layers
- Dynamic question visibility based on car configuration
- Manual report finalization instead of automatic completion
- Simple result presentation through `Yes / No / Don't know` distributions

## Getting Started Locally

### Prerequisites

- Node.js 22 LTS
- pnpm

### Installation

```bash
pnpm install
```

### Run the development server

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Build for production

```bash
pnpm build
```

### Preview the production build locally

```bash
pnpm preview
```

### Run tests

```bash
pnpm test
pnpm test:unit
pnpm test:nuxt
pnpm test:e2e
```

### Notes

- This repository already includes the base Nuxt, testing, and PWA tooling setup.
- The architecture documents reference Supabase, Nitro server routes, and additional offline data layers as part of the planned MVP implementation.
- No environment template is currently committed, so local setup instructions may expand as backend integrations are added.

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the Nuxt development server |
| `pnpm build` | Build the app for production |
| `pnpm generate` | Generate a static version of the app |
| `pnpm preview` | Preview the production build locally |
| `pnpm postinstall` | Run `nuxt prepare` after dependency installation |
| `pnpm test` | Run all Vitest tests |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:coverage` | Run Vitest with coverage enabled |
| `pnpm test:unit` | Run the unit-test project |
| `pnpm test:nuxt` | Run the Nuxt runtime test project |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm test:e2e:ui` | Open Playwright in UI mode |

## Project Scope

### Included in the MVP scope

- Public landing page with clear sign-up and sign-in entry points
- Email/password authentication and protected user routes
- Dashboard with a maximum of two inspections per account
- A five-part guided inspection flow for used cars
- Strict validation for `Part 1 - Info about the car`
- Dynamic checklist visibility based on vehicle configuration
- Session notes, contextual notes, and a final summary screen
- Manual completion of inspection reports
- Offline-first local persistence and queued synchronization after reconnect

### Explicitly out of scope for the MVP

- Additional interface languages beyond English
- Photo capture, uploads, and galleries
- PDF export
- Shareable public report links
- External VIN verification
- Native iOS and Android apps
- Multi-report comparison
- Weighted scoring or automatic deal-breaker detection
- Heavy monitoring tooling as a launch requirement

## Project Status

The repository is currently in an early implementation stage. The product direction, architecture, and MVP boundaries are well defined in the project documentation, while the codebase itself is still being built out from its Nuxt foundation.

The planned delivery path described in the technical documentation is:

1. Foundation setup
2. Identity and dashboard flows
3. Domain core and validation contracts
4. Inspection runner and summary experience
5. Offline sync hardening
6. Beta readiness

At the moment, this repository already contains the application scaffold, test configuration, and core frontend dependencies, but the full inspection workflow described in the PRD should be treated as planned product scope rather than fully implemented behavior.

## License

No license has been specified for this repository yet. Until a license file is added, the project should be treated as all rights reserved.
