import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp, installNotFoundHandler } from '../../src/app.setup.js';

/**
 * Boots the production module with the production middleware stack. Extra
 * controllers and provider overrides are test-only seams; each spec owns the
 * returned app and must close it.
 */
export async function createTestApp(
  extraControllers: Type[] = [],
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
  if (configure) builder = configure(builder);
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  installNotFoundHandler(app);
  return app;
}
