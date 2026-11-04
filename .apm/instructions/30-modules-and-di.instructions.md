---
description: Feature module layout, AppModule wiring, Nest DI, and generators
applyTo: "**/*"
---

## Modules and dependency injection

Feature code lives in `src/<feature>/`: `<feature>.module.ts`, controller, service, `dto/`, `entities/`, colocated specs. Wire new modules into `imports` of `AppModule` (`src/app.module.ts`) — a module that is not imported there never loads.

Nest DI pattern — `@Injectable()` service, module `providers`/`exports`, consumer constructor injection, and a `Test.createTestingModule` wiring test: `docs/nest-di.md`. Adapters are plain classes selected by a module factory; only the service is injectable.

```bash
pnpm exec nest g resource orders   # module + controller + service + dto + entity
pnpm exec nest g module orders     # just the module
```

Biome disables `useImportType` for `src/**` on purpose: Nest reads constructor parameter metadata at runtime, so injectables and DTOs are imported as values. Reach for `import type` only for types that never appear in a decorated signature (e.g. inside `test/**`).
