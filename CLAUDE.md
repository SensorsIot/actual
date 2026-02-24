# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

**Essential commands (always run from root):**

```bash
yarn typecheck          # Type check - run before committing
yarn lint:fix           # Auto-fix linting and formatting (oxfmt + oxlint)
yarn test               # Run all tests via lage (parallel, cached)
yarn test:debug         # Run tests without cache
yarn start              # Start browser dev server
yarn start:desktop      # Start Electron app
```

**Workspace-specific commands:**

```bash
yarn workspace <name> run <command>
# Example: yarn workspace loot-core run test
```

## Architecture

Yarn 4 monorepo with these key packages:

| Package                      | Alias                     | Purpose                                 |
| ---------------------------- | ------------------------- | --------------------------------------- |
| `packages/loot-core`         | `loot-core`               | Core business logic (platform-agnostic) |
| `packages/desktop-client`    | `@actual-app/web`         | React UI (web & desktop)                |
| `packages/desktop-electron`  | `desktop-electron`        | Electron wrapper                        |
| `packages/sync-server`       | `@actual-app/sync-server` | Multi-device sync server                |
| `packages/api`               | `@actual-app/api`         | Public Node.js API                      |
| `packages/component-library` | `@actual-app/components`  | Shared React components                 |
| `packages/crdt`              | `@actual-app/crdt`        | CRDT sync implementation                |

## Code Style Essentials

- **TypeScript**: Use `type` over `interface`, avoid `enum`/`any`/`unknown`, prefer `satisfies` over `as`
- **React**: Don't use `React.FC`, use named imports not `React.*`, use `<Link>` not `<a>`
- **Imports**: Use custom hooks from `src/hooks` (not react-router) and `src/redux` (not react-redux)
- **i18n**: All user-facing strings must be translated using `Trans` component
- **Icons**: Files in `component-library/src/icons/` are auto-generated - don't edit

## Restricted Patterns

- Never import from `uuid` without destructuring: use `import { v4 as uuidv4 } from 'uuid'`
- Never import colors directly - use theme
- Never import `@actual-app/web/*` in `loot-core`
- Don't reference platform-specific imports (`.api`, `.web`, `.electron`) directly

## Testing

- **Unit tests**: Vitest - minimize mocking, prefer real implementations
- **E2E tests**: Playwright in `packages/desktop-client/e2e/`
- **VRT**: `yarn vrt` or `yarn vrt:docker` for consistent environment

## Fork & Branch Strategy

This is a fork (`SensorsIot/actual`) of `actualbudget/actual` with custom enhancements.

- **`master` branch**: Our fork's main branch. All custom changes live here. GitHub URLs (version check, electron-updater publish config) point to `SensorsIot/actual`.
- **`feature/*` branches**: Used for PRs back to upstream (`actualbudget/actual`). These must point to `actualbudget/actual` in any GitHub owner/repo references, not `SensorsIot`.

When creating a PR for upstream: branch off `master`, make changes generic (pointing to `actualbudget`), and target `actualbudget/actual:master`.

### Current PR branches
- `feature/electron-updater` — Adds electron-updater auto-update (targets upstream, uses `actualbudget/actual`)

## Auto-Update Logging

Auto-update logs MUST always be written to a file, not just the dev console. Users cannot access dev console logs in production builds.

- **Log file**: `%APPDATA%/Actual/auto-update.log` (via `app.getPath('userData')`)
- **Format**: `fs.appendFileSync()` with ISO timestamp prefix
- **What to log**: app version, update config, check results, all update events (available, not-available, progress, downloaded, error), install steps
- **Never remove file-based logging** when refactoring auto-update code

## Detailed Guidelines

For comprehensive development guidelines, code patterns, and troubleshooting, see:

- [AGENTS.md](./AGENTS.md) - Full development guide
- [CODE_REVIEW_GUIDELINES.md](./CODE_REVIEW_GUIDELINES.md) - Code review standards
