import { Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { RequestContextModule } from '../common/request-context.module.js';
import { RequestContextService } from '../common/request-context.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { createPinoLogger, PINO_LOGGER } from './pino-logger.js';
import { AppLogger } from './services/app-logger.js';

@Global()
@Module({
  imports: [RequestContextModule],
  providers: [
    {
      provide: PINO_LOGGER,
      useFactory: (config: AppConfig) => createPinoLogger(config),
      inject: [APP_CONFIG],
    },
    {
      provide: AppLogger,
      useFactory: (logger: Logger, context: RequestContextService) =>
        new AppLogger(logger, context),
      inject: [PINO_LOGGER, RequestContextService],
    },
  ],
  exports: [PINO_LOGGER, AppLogger],
})
export class AppLoggingModule {}
