import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { RequestContextModule } from './common/request-context.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailModule } from './email/email.module.js';
import { HealthModule } from './health/health.module.js';
import { AppLoggingModule } from './logging/app-logging.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    AppConfigModule,
    RequestContextModule,
    AppLoggingModule,
    DatabaseModule,
    StorageModule,
    EmailModule,
    AnalyticsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter],
})
export class AppModule {}
