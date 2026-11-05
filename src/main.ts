import { NestFactory } from '@nestjs/core';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import { configureApp, installNotFoundHandler } from './app.setup.js';
import {
  APP_CONFIG,
  type AppConfig,
  assertRuntimeConfig,
} from './config/config.js';
import { PINO_LOGGER } from './logging/pino-logger.js';
import { AppLogger } from './logging/services/app-logger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);

  try {
    assertRuntimeConfig(config);
  } catch (error) {
    app
      .get<Logger>(PINO_LOGGER)
      .fatal(error instanceof Error ? error.message : 'Invalid configuration');
    await app.close();
    process.exit(1);
  }

  configureApp(app);
  app.enableShutdownHooks();

  await app.init();
  installNotFoundHandler(app);
  await app.listen(config.port);

  app
    .get(AppLogger)
    .log(`ShiftPatch API listening on port ${config.port}`, 'Bootstrap');
}

await bootstrap();
