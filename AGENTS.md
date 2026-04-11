# AGENTS.md

## Scope

- This file applies to the entire repository at `D:\con_ai`.
- Follow this file as the primary in-repo guide for coding agents.
- As of this analysis, there was **no existing** `AGENTS.md`, `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` in this repo.

## Repository overview

- Project: Electron + TypeScript desktop shell for orchestrating local AI coding CLIs.
- Package manager: npm.
- Module system: ESM (`"type": "module"`).
- Frontend: React 18 + Vite.
- Main-process runtime: Electron main + preload + shared typed IPC.
- Tests: Node built-in test runner (`node:test`) with `node:assert/strict`.

## High-level architecture

- `src/main/`
  - Electron main-process entry and backend services.
  - `main.ts` wires BrowserWindow creation and IPC handlers.
  - `orchestratorService.ts` contains core orchestration, adapter discovery, run lifecycle, and planning logic.
  - `persistence.ts` owns disk persistence and normalization.
- `src/preload/`
  - Typed bridge exposed via `contextBridge`.
  - Keep this layer thin. It should map IPC calls, not own business logic.
- `src/renderer/`
  - React UI.
  - `src/App.tsx` is currently the main UI surface and contains most renderer logic.
- `src/shared/`
  - Shared domain models and IPC contracts.
  - Add shared types here before duplicating shapes elsewhere.
- `config/adapters.json`
  - Declarative adapter definitions and command templates.

## Verified commands

These commands were checked in this repository and succeeded.

### Install / run

- `npm install`
- `npm run dev`
- `npm run start`

### Build

- `npm run build`
- `npm run build:renderer`
- `npm run build:main`
- `npm run build:preload`

### Type checking

- `npm run typecheck`

### Tests

- `npm run test:persistence`
  - This is the only packaged npm test script right now.
- Single compiled test file:
  - `npm run build:main && node --test dist/main/persistence.test.js`
  - `npm run build:main && node --test dist/main/orchestratorService.test.js`
  - `npm run build:main && node --test dist/main/localizeCliMessage.test.js`
- Single named test or subset:
  - `npm run build:main && node --test --test-name-pattern "OpenCode" dist/main/orchestratorService.test.js`

### Important command caveats

- There is currently **no `npm run lint` script**.
- There is currently **no ESLint config** and **no Prettier config** in the repo.
- Do not claim lint passed unless you first add a lint toolchain and run it.
- For main/shared tests, compile first with `npm run build:main` because tests run from `dist/main/*.test.js`.
- There is currently **no dedicated renderer test harness** such as Vitest, Jest, or React Testing Library.

## TypeScript and module conventions

- The repo uses strict TypeScript:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true`
- Keep code type-safe. Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Use ESM imports with explicit `.js` specifiers in TypeScript source.
  - Example: `import { IPC_CHANNELS } from '../shared/ipc.js';`
- Prefer `import type` for type-only imports.
  - Example: `import type { AppState } from '../shared/domain.js';`
- Shared aliases exist in Vite (`@shared`), but most repo code currently uses explicit relative imports.
- Follow the existing local pattern unless there is a clear reason to standardize more broadly.

## Naming conventions

- Types, interfaces, classes, and React components use `PascalCase`.
- Variables, functions, refs, and state setters use `camelCase`.
- Constants use `UPPER_SNAKE_CASE` when truly constant across the module.
- Helper booleans should read clearly:
  - `isLaunching`
  - `isRefreshingTools`
  - `selectedRunIsMutable`
  - `hasControlCharacters`
- Prefer descriptive names over short abbreviations.

## Code style patterns to preserve

- Prefer small helper functions over deeply nested inline logic.
- Prefer early returns for validation and guard clauses.
- Prefer immutable updates for state and object transforms.
- Prefer `const` arrow functions for local helpers.
- Use `export function App(): React.JSX.Element` style for top-level React components when matching existing code.
- Keep finite states modeled as string-literal unions in `src/shared/domain.ts`.
- Centralize canonical defaults in shared or persistence modules instead of scattering magic values.

## Imports and file organization

- Group imports by source:
  1. Node built-ins
  2. external packages
  3. shared/local modules
- Keep type imports separate when practical.
- Avoid circular dependencies between `main`, `preload`, `renderer`, and `shared`.
- Do not import renderer code into main or preload.
- Do not import Electron APIs directly into the renderer; go through `window.desktopApi`.

## Error handling conventions

- Catch unknown errors and narrow them explicitly.
  - Preferred pattern: `error instanceof Error ? error.message : fallback`
- Use user-facing fallback messages when surfacing failures into the UI.
- Avoid empty catch blocks.
- If a catch intentionally swallows an error, keep it tiny and add a comment explaining the fallback behavior.
- Prefer returning `null` for parse/normalization failure when the surrounding code already handles that pattern.

## Data modeling and nullability

- Use interfaces and union types from `src/shared/domain.ts` as the source of truth.
- Use `null` for absent persisted/runtime values where the domain types already expect `null`.
- Use empty strings for draft form fields and editable text inputs.
- Normalize untrusted persisted JSON through dedicated helper functions rather than assuming shape validity.
- Preserve existing normalization patterns in `persistence.ts`.

## Renderer guidance

- Keep locale-aware copy in the `COPY` object in `src/renderer/src/App.tsx` unless you are intentionally extracting shared localization helpers.
- When backend or CLI-originated messages need translation, use a narrow helper like `src/shared/localizeCliMessage.ts` instead of embedding ad hoc string replacements in JSX.
- Use `useMemo`, `useEffect`, `useRef`, and `useState` in the same explicit, typed style already present.
- Keep state updates immutable and prefer updater functions when deriving from current state.
- Validate form input before async IPC calls.

## Main/preload guidance

- `src/preload/preload.ts` should stay as a typed IPC bridge only.
- `src/main/main.ts` should remain the Electron wiring layer.
- Put orchestration, planning, adapter discovery, and run lifecycle logic in service modules such as `orchestratorService.ts`.
- Keep IPC request/response types synchronized with `src/shared/ipc.ts` and `src/shared/domain.ts`.
- Preserve preload security settings unless the user explicitly requests a different model:
  - `contextIsolation: true`
  - `nodeIntegration: false`

## Testing conventions

- Use `node:test` and `node:assert/strict`.
- Name tests as readable behavior statements.
- Prefer deterministic fixtures over mocks when possible.
- Existing tests often create temporary repo roots under `tmp/` and clean them up in `finally` blocks.
- For orchestration behavior, prefer fake executables and generated config fixtures over real external CLIs.
- If you change adapter readiness, error wording, persistence normalization, or IPC contracts, add or update targeted regression tests.

## Workflow expectations for agents

- Before editing, read the surrounding module and at least one similar implementation.
- Keep diffs narrow and local to the requested behavior.
- Do not refactor broadly while fixing a targeted bug.
- If you add a new shared helper, place it where both caller and tests can import it cleanly.
- If you add new commands or tooling, update this file so future agents inherit accurate guidance.

## Recommended verification by change type

- Main/shared logic changes:
  - `npm run build:main`
  - relevant `node --test dist/main/<file>.test.js`
  - `npm run typecheck`
- Renderer-only changes:
  - `npm run typecheck`
  - `npm run build`
- Preload or IPC contract changes:
  - `npm run build:main`
  - `npm run build:preload`
  - `npm run typecheck`
  - `npm run build`
- Persistence changes:
  - `npm run build:main && node --test dist/main/persistence.test.js`

## Things not to assume

- Do not assume linting exists.
- Do not assume renderer tests exist.
- Do not assume external CLIs are installed or authenticated.
- Do not assume OpenCode or Claude non-interactive paths are healthy on the local machine without fresh evidence.

## Quick summary for future agents

- This is a strict TypeScript Electron app with a typed shared domain layer.
- Respect the `main` / `preload` / `renderer` boundary.
- Compile before running current tests.
- Use Node’s built-in test runner, not Jest/Vitest, unless you intentionally add a new harness.
- Prefer narrow, typed, evidence-backed changes.
