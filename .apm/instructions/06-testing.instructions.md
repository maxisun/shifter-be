---
description: Vitest unit and e2e testing conventions
applyTo: "**/*"
---

## Testing

Vitest, not Jest — use `vi.fn()`, `vi.spyOn()`, and `vi.mock()`. `globals: true`, so `describe`, `it`, `expect` need no import.

- Unit specs cover services and helpers only. New specs follow the module layout in Modules and dependency injection. Do not add unit specs for modules (`*.module.ts`), controllers, filters, guards, interceptors, or DTOs; cover that behavior through e2e instead.
- E2E specs live in `test/*.e2e-spec.ts`, boot `AppModule` with `createTestApp()` (`test/support/test-app.ts`), which applies the shipped middleware/validation/filter stack, drive it through `supertest`, and `await app.close()` in `afterEach`.
- The e2e setup file (`test/setup-e2e.ts`) removes database/storage/email/analytics environment values, so e2e never touches real dependencies. Override `DatabaseService` when a test needs readiness to report up.
- Each glob runs under its own config (`vitest.config.ts`, `vitest.config.e2e.ts`), so `pnpm run test` never covers `*.e2e-spec.ts` files and `pnpm run test:e2e` never covers `*.spec.ts` ones. Name a file for the run that should execute it.
- `tsconfig.build.json` excludes specs and `test/`, so test-only imports never reach `dist/`.

`strict` is on, but `strictPropertyInitialization` is off: DTO and entity fields need no `!` or initializer.
