import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { NoopEmailSender } from './adapters/noop-email-sender.js';
import { ResendEmailSender } from './adapters/resend-email-sender.js';
import { EMAIL_SENDER } from './email-sender.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (config: AppConfig) =>
        config.email
          ? new ResendEmailSender(
              config.email.apiKey,
              config.email.from,
              config.email.replyTo,
            )
          : new NoopEmailSender(),
      inject: [APP_CONFIG],
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
