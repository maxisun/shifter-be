import { Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { PINO_LOGGER } from '../logging/pino-logger.js';
import { NoopAnalyticsClient } from './adapters/noop-analytics-client.js';
import { PostHogAnalyticsClient } from './adapters/posthog-analytics-client.js';
import { ANALYTICS_CLIENT } from './analytics-client.js';

@Global()
@Module({
  providers: [
    {
      provide: ANALYTICS_CLIENT,
      useFactory: (config: AppConfig, logger: Logger) =>
        config.posthog
          ? new PostHogAnalyticsClient(config.posthog, config.nodeEnv, logger)
          : new NoopAnalyticsClient(),
      inject: [APP_CONFIG, PINO_LOGGER],
    },
  ],
  exports: [ANALYTICS_CLIENT],
})
export class AnalyticsModule {}
