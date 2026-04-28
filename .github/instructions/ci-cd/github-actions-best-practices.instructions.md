---
name: "GitHub Actions Best Practices"
description: "Use when creating or editing GitHub Actions workflows for CI or CD in this repository, including workflow triggers, Node 22 setup, pnpm installation and caching, script execution, artifacts, secrets, and deployment gating."
applyTo:
  - ".github/workflows/**/*.{yml,yaml}"
---
# GitHub Actions Best Practices

## Scope

- Use these rules for repository workflows that validate, package, or deploy the application.
- Keep workflow logic focused on automation concerns; do not reimplement application business logic inside YAML.

## Workflow Design

- Prefer small, explicit workflows with clearly named jobs over one oversized pipeline that mixes unrelated concerns.
- Trigger CI on pull requests and on pushes to protected branches.
- Use a single Node.js 22 LTS baseline by default, because the architecture standardizes runtime behavior on Node 22.
- Add a matrix only when you intentionally need compatibility coverage across versions or platforms.
- Use `concurrency` for branch or PR scoped workflows when it materially reduces duplicate work on superseded commits.

## Node and pnpm Setup

- Use `actions/checkout` and `actions/setup-node` as the standard baseline for Node workflows.
- Set the Node version explicitly; never rely on the runner default.
- Use pnpm because the repository standardizes on pnpm and keeps a deterministic lockfile.
- Enable dependency caching through `actions/setup-node` with `cache: 'pnpm'`, and install pnpm explicitly before dependency installation.
- Install dependencies with a lockfile-respecting command such as `pnpm install --frozen-lockfile` in CI.

## Running Project Checks

- Reuse repository scripts from `package.json` instead of duplicating command logic inline in workflows.
- Keep CI stages aligned with the real quality gates of the project: build, lint, type validation if present, unit tests, Nuxt runtime tests, and e2e tests when appropriate.
- Separate fast feedback jobs from slower browser or deployment jobs so pull requests fail quickly when the basics are broken.
- Upload useful artifacts such as Playwright reports, traces, screenshots, or test results when a failing job would otherwise be hard to debug.

## Secrets and Environment Discipline

- Store third-party credentials in GitHub Secrets or protected environments; never inline them in workflow YAML.
- Pass only the minimal environment variables needed by each job.
- Avoid echoing secrets, tokens, connection strings, or generated credentials in logs.
- Distinguish clearly between CI secrets, preview deployment secrets, and production deployment secrets.

## Deployment Strategy

- Prefer Vercel Git integration for standard Nuxt deployments instead of rebuilding a custom deployment orchestrator in GitHub Actions.
- Use GitHub Actions for validation and release gating first; only add deployment steps when the platform integration does not already cover the required flow.
- If a deploy job exists, make it depend on successful quality gates instead of running in parallel with them.

## Definition of Done

- Workflow triggers, jobs, and names are clear and minimal.
- Node 22 and pnpm setup are explicit and reproducible.
- CI runs the repository's real scripts instead of duplicated shell logic.
- Secrets are scoped correctly and never exposed in logs.
- Deployment jobs, if any, are gated behind passing validation steps.