# NestJS dependency injection pattern

Every feature service follows the same three-part shape. The provider is a
class decorated with `@Injectable()`, the module registers and exports it, and
the consumer receives it through its constructor.

```ts
// src/storage/storage.service.ts
@Injectable()
export class StorageService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async read(key: string): Promise<ObjectBody> {
    return this.storage.get(key);
  }
}

// src/storage/storage.module.ts
@Global()
@Module({
  providers: [
    { provide: OBJECT_STORAGE, useFactory: createAdapter, inject: [APP_CONFIG] },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}

// src/credentials/credential-document.service.ts
@Injectable()
export class CredentialDocumentService {
  constructor(private readonly storage: StorageService) {}

  async download(key: string): Promise<ObjectBody> {
    return this.storage.read(key);
  }
}

// src/credentials/credentials.module.ts
@Module({
  imports: [StorageModule], // omit only when the provider module is @Global
  providers: [CredentialDocumentService],
})
export class CredentialsModule {}
```

## Rules

- The injectable thing is the **service**, not every class in its folder.
  Adapters such as `S3ObjectStorage` and `InMemoryObjectStorage` are plain
  classes selected by a module factory; feature code never constructs them.
- A provider is injectable into another module only when it is in that
  module's `exports` (or the module is `@Global`). `StorageModule` exports
  `StorageService` and deliberately keeps `OBJECT_STORAGE` internal.
- Runtime code never calls `new SomeService(...)`. Nest creates the instance
  and supplies its dependencies. `new` is for pure unit tests of a class's own
  logic and for composition-root CLIs.
- A consumer service is itself `@Injectable()` and registered in a module.
  Receiving a service in a constructor does not register the consumer.
- For integration/wiring tests, resolve through
  `Test.createTestingModule({ providers: [Consumer], imports: [Module] })
  .compile()` and `moduleRef.get(Consumer)`. Use
  `overrideProvider(Token).useValue(fake)` to replace an adapter.
- For pure policy tests, direct construction is fine:
  `new StorageService(new InMemoryObjectStorage())`. That tests the class, not
  the Nest wiring; keep at least one wiring test that proves the consumer
  receives the provider.

## Checklist for a new service

1. `@Injectable()` on the class.
2. Constructor injection, no `new` inside the constructor.
3. Register it in a module's `providers`.
4. Add it to `exports` if another module injects it.
5. Add a `Test.createTestingModule` test that resolves a consumer, not just
   the provider.
