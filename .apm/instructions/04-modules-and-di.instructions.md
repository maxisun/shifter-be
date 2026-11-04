---
description: Module layout, controllers, services, adapters, and Nest DI wiring
applyTo: "**/*"
---

## Modules and dependency injection

`src/storage/` is the reference module. New modules follow this layout. Migrate an existing module only when you are already changing its structure; do not move files as part of an unrelated change. Create only the folders the module needs; do not scaffold empty directories:

```text
src/<module>/
  <module>.module.ts           # @Module wiring: imports, controllers, providers, exports
  controllers/
    <name>.controller.ts       # HTTP boundary: routes and request/response mapping
  services/
    <name>.service.ts          # @Injectable behavior; the module's public surface
  dto/
    <name>.dto.ts              # request/response shapes and validation
  entities/
    <name>.entity.ts           # persistence or domain entities
  types/
    <name>.ts                  # internal interfaces and type-only contracts
  adapters/
    <name>.ts                  # plain classes implementing an internal port
    <name>.spec.ts             # helper spec kept beside the adapter
  guards/
    <name>.guard.ts            # only when the module owns one
  interceptors/
    <name>.interceptor.ts
  pipes/
    <name>.pipe.ts
  filters/
    <name>.filter.ts
  decorators/
    <name>.decorator.ts
  tests/
    <service>.service.spec.ts  # service unit specs
```

Storage is infrastructure, so it has no `controllers/` or `dto/`; feature modules add those for their HTTP surface. Wire the module into `imports` of `AppModule` (`src/app.module.ts`); a module that is not imported there never loads.

**Controllers** are thin. They inject services, declare routes with Nest decorators, and translate HTTP input/output; business rules belong in the service. Controllers are covered by e2e tests, not unit specs.

**Services** are `@Injectable()` and own the module's behavior. Export the module's public surface: feature modules export the service (`exports: [StorageService]`); infrastructure modules may export a deliberate token such as `EMAIL_SENDER`. Never export adapters or internal types, and keep internal ports such as `OBJECT_STORAGE` private.

**DTOs and entities** stay at the HTTP and persistence boundaries. DTOs carry request/response shapes and validation; entities carry persisted or domain data. Do not leak either into unrelated modules.

**Ports and adapters** are the swap seam. Put the injection token at the module root and the port interface under `types/` — see `src/storage/object-storage.ts` and `src/storage/types/object-storage.ts`. Adapters are plain classes, not `@Injectable()`, and live under `adapters/`. Bind the port in the module with `useFactory`, and inject it into the service with `@Inject(TOKEN)`:

```ts
providers: [
  {
    provide: OBJECT_STORAGE,
    useFactory: (config: AppConfig) => ...,
    inject: [APP_CONFIG],
  },
  StorageService,
],
exports: [StorageService],
```

Consumers inject the service, never the port. The service owns validation and policy; an adapter only talks to the external system.

**Other Nest primitives** live under the module that owns them: `guards/<name>.guard.ts`, `interceptors/<name>.interceptor.ts`, `pipes/<name>.pipe.ts`, `filters/<name>.filter.ts`, and `decorators/<name>.decorator.ts`. Register guards, interceptors, pipes, and filters in the module's `providers`; use `APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, or `APP_FILTER` only for app-wide behavior. Decorators are applied at declaration sites, not registered as providers. Shared primitives otherwise stay under `src/common/`.

**Modules are wiring, not behavior.** Do not add unit specs for `*.module.ts` files; they are excluded from coverage in `vitest.config.ts`. Test the service against a fake adapter and let e2e prove the wiring. Instantiate helpers with no DI directly, and construct a service with a fake adapter when testing pure policy.

```bash
pnpm exec nest g resource orders   # scaffolds flat; move files into the layout
pnpm exec nest g module orders     # just the module
```

The resource generator also emits service and controller specs: move the service spec to `tests/` and delete the controller spec (controllers are covered by e2e).

See `docs/nest-di.md` for the worked DI example and service checklist.

Biome disables `useImportType` for `src/**` on purpose: Nest reads constructor parameter metadata at runtime, so injectables and DTOs are imported as values. Reach for `import type` only for types that never appear in a decorated signature (e.g. inside `test/**`).
